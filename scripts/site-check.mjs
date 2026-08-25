import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "playwright-report", "test-results"]);
const ATTRIBUTE_PATTERN = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gis;
const ID_PATTERN = /\bid\s*=\s*(["'])(.*?)\1/gis;
const NAMED_ANCHOR_PATTERN = /<a\b[^>]*\bname\s*=\s*(["'])(.*?)\1/gi;

function parseArguments(argv) {
  const options = { root: ".", basePath: "/project-euphoria" };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--root", "--base-path"].includes(name) || value === undefined) {
      throw new Error(`Unknown or incomplete argument: ${name}`);
    }
    index += 1;
    if (name === "--root") options.root = value;
    if (name === "--base-path") options.basePath = value;
  }
  options.basePath = `/${options.basePath.split("/").filter(Boolean).join("/")}`;
  return options;
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function lineNumber(source, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (source.charCodeAt(offset) === 10) line += 1;
  }
  return line;
}

function maskIgnoredMarkup(source) {
  const maskBody = (value) => value.replace(/[^\r\n]/g, " ");
  return source
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi, (_all, open, body, close) => `${open}${maskBody(body)}${close}`)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_all, open, body, close) => `${open}${maskBody(body)}${close}`)
    .replace(/<!--[\s\S]*?-->/g, (comment) => maskBody(comment));
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function collectHtmlFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) files.push(target);
    }
  }
  await visit(root);
  return files;
}

function collectIds(source) {
  const ids = new Set();
  const duplicates = [];
  for (const pattern of [ID_PATTERN, NAMED_ANCHOR_PATTERN]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const id = decodeEntities(match[2]);
      if (ids.has(id)) duplicates.push({ id, index: match.index });
      ids.add(id);
    }
  }
  return { ids, duplicates };
}

async function resolveLocalTarget({ root, sourceFile, rawPath, basePath }) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return { error: "contains malformed percent-encoding" };
  }

  let candidate;
  if (decodedPath.startsWith("/")) {
    const basePrefix = `${basePath}/`;
    const withoutBase = decodedPath === basePath
      ? ""
      : decodedPath.startsWith(basePrefix)
        ? decodedPath.slice(basePrefix.length)
        : decodedPath.slice(1);
    candidate = path.resolve(root, withoutBase);
  } else if (decodedPath === "") {
    candidate = sourceFile;
  } else {
    candidate = path.resolve(path.dirname(sourceFile), decodedPath);
  }

  if (!isInside(root, candidate)) return { error: "escapes the site root" };

  let targetStat;
  try {
    targetStat = await stat(candidate);
  } catch {
    return { error: "target does not exist", candidate };
  }
  if (targetStat.isDirectory()) candidate = path.join(candidate, "index.html");

  try {
    const resolved = await realpath(candidate);
    if (!isInside(root, resolved)) return { error: "resolves outside the site root" };
    const resolvedStat = await stat(resolved);
    if (!resolvedStat.isFile()) return { error: "target is not a file", candidate: resolved };
    return { file: resolved };
  } catch {
    return { error: "target does not exist", candidate };
  }
}

const options = parseArguments(process.argv.slice(2));
const root = await realpath(path.resolve(options.root));
const htmlFiles = await collectHtmlFiles(root);
if (htmlFiles.length === 0) throw new Error(`No HTML files found under ${root}.`);
const sourceCache = new Map();
const anchorCache = new Map();
const failures = [];
let checkedReferences = 0;

async function getHtml(file) {
  if (!sourceCache.has(file)) sourceCache.set(file, await readFile(file, "utf8"));
  return sourceCache.get(file);
}

async function getAnchors(file) {
  if (!anchorCache.has(file)) anchorCache.set(file, collectIds(maskIgnoredMarkup(await getHtml(file))));
  return anchorCache.get(file);
}

for (const htmlFile of htmlFiles) {
  const source = await getHtml(htmlFile);
  const scanSource = maskIgnoredMarkup(source);
  const displayFile = path.relative(root, htmlFile) || "index.html";
  const anchors = await getAnchors(htmlFile);
  for (const duplicate of anchors.duplicates) {
    failures.push(`${displayFile}:${lineNumber(source, duplicate.index)} duplicate fragment id/name ${JSON.stringify(duplicate.id)}`);
  }

  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match;
  while ((match = ATTRIBUTE_PATTERN.exec(scanSource)) !== null) {
    const reference = decodeEntities((match[1] ?? match[2] ?? match[3] ?? "").trim());
    if (!reference || reference === "#" || reference.startsWith("//")) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(reference)) continue;

    checkedReferences += 1;
    const hashIndex = reference.indexOf("#");
    const beforeHash = hashIndex === -1 ? reference : reference.slice(0, hashIndex);
    const rawFragment = hashIndex === -1 ? "" : reference.slice(hashIndex + 1);
    const rawPath = beforeHash.split("?", 1)[0];
    const resolved = await resolveLocalTarget({ root, sourceFile: htmlFile, rawPath, basePath: options.basePath });
    const location = `${displayFile}:${lineNumber(source, match.index)}`;
    if (resolved.error) {
      const target = resolved.candidate ? ` (${path.relative(root, resolved.candidate)})` : "";
      failures.push(`${location} ${JSON.stringify(reference)}: ${resolved.error}${target}`);
      continue;
    }

    if (rawFragment) {
      if (path.extname(resolved.file).toLowerCase() !== ".html") {
        failures.push(`${location} ${JSON.stringify(reference)}: fragment points to a non-HTML file`);
        continue;
      }
      let fragment;
      try {
        fragment = decodeURIComponent(rawFragment);
      } catch {
        failures.push(`${location} ${JSON.stringify(reference)}: fragment contains malformed percent-encoding`);
        continue;
      }
      const targetAnchors = await getAnchors(resolved.file);
      if (!targetAnchors.ids.has(fragment)) {
        failures.push(`${location} ${JSON.stringify(reference)}: fragment ${JSON.stringify(fragment)} is missing from ${path.relative(root, resolved.file)}`);
      }
    }
  }
}

if (failures.length) {
  process.stderr.write(`Site check failed with ${failures.length} problem${failures.length === 1 ? "" : "s"}:\n`);
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Site check passed: ${htmlFiles.length} HTML files, ${checkedReferences} local asset/link references.\n`);
}
