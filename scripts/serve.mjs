import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveStaticPath } from "../server/http/static-path.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 5173);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

// Same whitelist as the production server, so the dev server cannot serve
// anything the real one refuses (it used to serve .env and .git too).
function resolveRequest(url) {
  const parsed = new URL(url, `http://localhost:${port}`);
  return resolveStaticPath(parsed.pathname, rootDir);
}

const server = http.createServer(async (request, response) => {
  const fullPath = resolveRequest(request.url || "/");

  if (!fullPath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const body = await fs.readFile(fullPath);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(fullPath)) || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Blood Bowl reference is running at http://localhost:${port}`);
});
