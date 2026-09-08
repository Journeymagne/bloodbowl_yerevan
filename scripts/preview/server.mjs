/** Local build + remote API. Does not load database configuration or server credentials. */
import http from "node:http";
import https from "node:https";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveStaticPath } from "../../server/http/static-path.mjs";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"],
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".webp", "image/webp"], [".ico", "image/x-icon"],
  [".ttf", "font/ttf"], [".woff", "font/woff"], [".woff2", "font/woff2"],
]);

function parseOrigin(value) {
  let origin;
  try { origin = new URL(value); } catch { throw new Error("A valid API origin is required."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if ((origin.protocol !== "https:" && !(origin.protocol === "http:" && local))
      || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("API origin must be credential-free HTTPS (HTTP is allowed only on loopback).");
  }
  return origin;
}

function sendError(response, status, error) {
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error }));
}

function isLocalRequest(request) {
  const { host, origin } = request.headers;
  const port = request.socket.localPort;
  const hostAllowed = [`127.0.0.1:${port}`, `localhost:${port}`].includes(host);
  return hostAllowed && (!origin || origin === `http://${host}`)
    && request.headers["sec-fetch-site"] !== "cross-site";
}

async function serveStatic(request, response, url, root) {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.setHeader("Allow", "GET, HEAD");
    sendError(response, 405, "Static files are read-only.");
    return;
  }
  const fullPath = resolveStaticPath(url.pathname, root);
  if (!fullPath) { sendError(response, 404, "Not found."); return; }
  try {
    const body = await fs.readFile(fullPath);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(fullPath)) || "application/octet-stream",
      "Content-Length": body.length,
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch { sendError(response, 404, "Not found."); }
}

function proxyApi(request, response, url, apiOrigin, timeoutMs) {
  // Rebuild the URL from a validated fixed origin. Never follow redirects or
  // forward cookies, Origin, Host, or browser-supplied proxy headers.
  const target = new URL(url.pathname + url.search, apiOrigin);
  const headers = {};
  for (const name of ["authorization", "content-type", "accept"]) {
    if (request.headers[name]) headers[name] = request.headers[name];
  }
  const transport = target.protocol === "https:" ? https : http;
  const upstream = transport.request(target, { method: request.method, headers }, remote => {
    if (remote.statusCode >= 300 && remote.statusCode < 400) {
      remote.resume();
      sendError(response, 502, "Production API returned a redirect.");
      return;
    }
    const outgoing = {};
    for (const name of ["content-type", "content-length", "content-encoding", "retry-after", "www-authenticate"]) {
      if (remote.headers[name]) outgoing[name] = remote.headers[name];
    }
    response.writeHead(remote.statusCode, outgoing);
    remote.on("error", () => response.destroy());
    remote.pipe(response);
  });
  const timer = setTimeout(() => {
    sendError(response, 504, "Production API timed out.");
    upstream.destroy();
  }, timeoutMs);
  response.on("close", () => { clearTimeout(timer); upstream.destroy(); });
  upstream.on("error", () => {
    clearTimeout(timer);
    if (!response.writableEnded) sendError(response, 502, "Production API is unavailable.");
  });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
}

export function createPreviewServer({ root, apiOrigin, timeoutMs = 15000 }) {
  const origin = parseOrigin(apiOrigin);
  const staticRoot = path.resolve(root);
  return http.createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    let url;
    try { url = new URL(request.url, "http://localhost"); }
    catch { sendError(response, 400, "Invalid request URL."); return; }
    const host = request.headers.host;
    const port = request.socket.localPort;
    if (!["localhost", "127.0.0.1"].some(name => host === `${name}:${port}`)) {
      sendError(response, 403, "Local preview requests only.");
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (!isLocalRequest(request)) { sendError(response, 403, "Same-origin API requests only."); return; }
      proxyApi(request, response, url, origin, timeoutMs);
    } else {
      void serveStatic(request, response, url, staticRoot);
    }
  });
}
