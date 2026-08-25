import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const html = fs.readFileSync(path.join(root, "toolbox", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "toolbox", "app.js"), "utf8");
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

const failures = [];
const requireMatch = (pattern, message) => {
  if (!pattern.test(html)) failures.push(message);
};

const cards = [...html.matchAll(/<details class="protocol-card" id="([^"]+)">([\s\S]*?)<\/details>/g)];
if (cards.length !== 7) failures.push(`Expected exactly 7 protocol cards; found ${cards.length}.`);

for (const [, id, body] of cards) {
  const required = ["May help when:", "Use only if:", "Start with:", "Stop and repair:", "Do not use"];
  for (const phrase of required) {
    if (!body.includes(phrase)) failures.push(`${id} is missing "${phrase}".`);
  }
}

requireMatch(/connect-src 'none'/, "CSP must block scripted network connections.");
requireMatch(/form-action 'none'/, "CSP must block form submissions.");
requireMatch(/shared across the entire[\s\S]*itpro2792-beep\.github\.io[\s\S]*current or future code served anywhere on that origin/, "Privacy copy must name the shared origin and current/future same-origin access.");
requireMatch(/not to <code>\/project-euphoria\/toolbox\/<\/code>/, "Privacy copy must say storage is not isolated to the Toolbox path.");
requireMatch(/exclusive browser Web Lock/, "Privacy copy must disclose the single-writer persistence boundary.");
requireMatch(/not therapy, crisis care/, "The global non-clinical boundary is missing.");
requireMatch(/Are you safe right now\?/, "No-Flinch must permit a direct safety question.");
requireMatch(/Never promise secrecy you cannot keep/, "Off-the-Record must not promise absolute secrecy.");
requireMatch(/force, restraint, confinement, surveillance, confiscation/, "The noncoercion boundary is incomplete.");
requireMatch(/Qualified clinical and safeguarding review is still pending/, "Pending professional review must be explicit.");

if (/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/.test(html)) {
  failures.push("Inline JavaScript is not allowed on the Toolbox page.");
}
if (/\sstyle=/.test(html)) failures.push("Inline style attributes are not allowed on the Toolbox page.");
if (/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/.test(app)) {
  failures.push("Toolbox JavaScript contains a network-capable API.");
}
if (!app.includes("navigator?.locks") || !app.includes("setWriteEnabled(false)")) {
  failures.push("Toolbox must fail closed behind an exclusive browser writer lock.");
}
if ((html.match(/<meta property="og:url"/g) || []).length !== 1) failures.push("Toolbox must contain exactly one og:url tag.");
if ((html.match(/<link rel="canonical"/g) || []).length !== 1) failures.push("Toolbox must contain exactly one canonical link.");
if (!html.includes('aria-live="polite"')) failures.push("Accessible status announcements are missing.");
if (!html.includes('aria-current="page"')) failures.push("Current navigation state is missing.");
if (!html.includes('class="skip-link"')) failures.push("Skip link is missing.");
if (!/\.tool-section,[\s\S]*\.data-section,[\s\S]*footer[\s\S]*display:\s*none\s*!important/.test(fs.readFileSync(path.join(root, "toolbox", "styles.css"), "utf8"))) {
  failures.push("Print CSS must hide personal tool sections.");
}
if (home.includes("one hundred expert personas")) failures.push("Home still mislabels simulated personas as experts.");
if (!home.includes("Robbie</b> is the name used in the room")) failures.push("Home does not distinguish Robbie from Siren.");
if (!home.includes("not a product claim")) failures.push("Home is missing the consciousness claim boundary.");
if (!home.includes("public Toolbox is an early household-practice alpha")) failures.push("Home is missing the Toolbox/Layer boundary.");
if (home.includes("Nothing you type leaves your device")) failures.push("Home still contains the absolute privacy promise.");
if (/does not transmit what you type|sends no entries to us/i.test(home)) failures.push("Home still contains an overbroad transmission promise.");
if (!readme.includes("does not yet contain an open-source license")) failures.push("README must state the repository's current reuse status.");

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) failures.push(`Duplicate HTML ids: ${duplicateIds.join(", ")}.`);

const idSet = new Set(ids);
for (const [, target] of html.matchAll(/\sfor="([^"]+)"/g)) {
  if (!idSet.has(target)) failures.push(`Label points to missing control #${target}.`);
}

for (const [, source] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
  if (/^(?:https?:|\/\/)/.test(source)) failures.push(`Toolbox loads an external script: ${source}.`);
}
for (const [, source] of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
  if (/^(?:https?:|\/\/)/.test(source)) failures.push(`Toolbox loads an external code/style asset: ${source}.`);
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Static trust, safety, privacy, and structure checks passed.");
