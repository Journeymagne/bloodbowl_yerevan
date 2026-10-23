import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStaticPath } from "../server/http/static-path.mjs";
import { createRoomHandler } from "../server/play/rooms.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mime = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".json": "application/json" };

export function createPlayServer(roomOptions = {}) {
  const handleRoom = createRoomHandler(roomOptions);
  return http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    try {
      const url = new URL(request.url, "http://localhost");
      if (await handleRoom(request, response, url)) return;
      if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const pathname = ["/", "/play", "/play/"].includes(url.pathname) ? "/public/play.html" : url.pathname;
      const file = resolveStaticPath(pathname, root);
      if (!file) { response.writeHead(404); response.end("Not found"); return; }
      const data = await readFile(file);
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : data);
    } catch {
      response.writeHead(404); response.end("Not found");
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PLAY_PORT || 5174);
  createPlayServer().listen(port, "0.0.0.0", () => {
    console.log(`GATA virtual tabletop: http://localhost:${port}`);
    console.log("Two-player rooms available. Use this computer's LAN address to join from another device.");
  });
}
