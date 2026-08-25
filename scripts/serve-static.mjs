import { createServer } from "node:http";
import { realpath, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import process from "node:process";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wav", "audio/wav"],
  [".webp", "image/webp"]
]);

function parseArguments(argv) {
  const options = {
    root: ".",
    host: "127.0.0.1",
    port: 4173
  };

  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--root", "--host", "--port"].includes(name) || value === undefined) {
      throw new Error(`Unknown or incomplete argument: ${name}`);
    }
    index += 1;
    if (name === "--root") options.root = value;
    if (name === "--host") options.host = value;
    if (name === "--port") options.port = Number(value);
  }

  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error("--port must be an integer from 0 through 65535.");
  }
  return options;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function sendText(response, statusCode, message, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(message),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  response.end(message);
}

async function resolveRequest(root, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  } catch {
    return { status: 400, message: "Malformed request path.\n" };
  }

  if (pathname.includes("\0")) return { status: 400, message: "Malformed request path.\n" };

  const candidate = path.resolve(root, `.${pathname}`);
  if (!isInside(root, candidate)) return { status: 403, message: "Path is outside the site root.\n" };

  let candidateStat;
  try {
    candidateStat = await stat(candidate);
  } catch {
    return { status: 404, message: "Not found.\n" };
  }

  const fileCandidate = candidateStat.isDirectory() ? path.join(candidate, "index.html") : candidate;
  let resolved;
  let fileStat;
  try {
    resolved = await realpath(fileCandidate);
    if (!isInside(root, resolved)) return { status: 403, message: "Path is outside the site root.\n" };
    fileStat = await stat(resolved);
  } catch {
    return { status: 404, message: "Not found.\n" };
  }

  if (!fileStat.isFile()) return { status: 404, message: "Not found.\n" };
  return { status: 200, file: resolved, size: fileStat.size };
}

const options = parseArguments(process.argv.slice(2));
const root = await realpath(path.resolve(options.root));

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, "Missing request path.\n");
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method || "")) {
    sendText(response, 405, "Method not allowed.\n", { Allow: "GET, HEAD" });
    return;
  }

  const result = await resolveRequest(root, request.url);
  if (result.status !== 200) {
    sendText(response, result.status, result.message);
    return;
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES.get(path.extname(result.file).toLowerCase()) || "application/octet-stream",
    "Content-Length": result.size,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(result.file);
  stream.on("error", () => {
    if (!response.headersSent) sendText(response, 500, "Unable to read file.\n");
    else response.destroy();
  });
  stream.pipe(response);
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

server.listen(options.port, options.host, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  process.stdout.write(`Static site server: http://${options.host}:${port}\nRoot: ${root}\n`);
});

function shutdown() {
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
