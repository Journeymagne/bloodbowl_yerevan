/**
 * Serving files off disk: what may be served, as what, and for how long.
 *
 * The whitelist itself is next door in static-path.mjs, where it went during
 * the security hotfix. This is the rest of it — content types, cache headers,
 * and preferring the copy the build already compressed.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { rootDir } from "../config/env.mjs";
import { resolveStaticPath } from "./static-path.mjs";
import { preferredEncoding, writeResponse } from "./responses.mjs";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function cacheControlForStatic(url, fullPath) {
  const pathname = url.pathname;
  const extension = path.extname(fullPath);
  if (extension === ".html" || pathname === "/" || pathname === "/index.html") {
    return "no-cache";
  }
  if (url.searchParams.has("v") || pathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname.startsWith("/public/data") || pathname.startsWith("/src/i18n/")) {
    return "public, max-age=3600, stale-while-revalidate=86400";
  }
  return "public, max-age=86400";
}

/**
 * Serve the copy the build already compressed, if there is a current one.
 *
 * The alternative is what this used to do: brotli the same 0.6 MB of reference
 * data again for every visitor, synchronously, on the single thread that also
 * has to answer everybody else. Step 17.1.
 *
 * The timestamp check is the whole safety story. A compressed sibling older
 * than its source describes a file that no longer exists, and serving it would
 * hand out yesterday's data with today's ETag — so an older one is ignored and
 * the request falls through to compressing on the spot.
 *
 * @returns {Promise<boolean>} true when the response has been sent
 */
async function sendPrecompressed(request, response, fullPath, headers) {
  const encoding = preferredEncoding(request);
  if (!encoding) return false;
  const candidate = `${fullPath}.${encoding}`;
  try {
    const [compressed, source] = await Promise.all([fs.stat(candidate), fs.stat(fullPath)]);
    if (compressed.mtimeMs < source.mtimeMs) return false;
    const body = await fs.readFile(candidate);
    response.writeHead(200, {
      ...headers,
      "Content-Encoding": encoding,
      "Content-Length": body.length,
      Vary: "Accept-Encoding",
    });
    response.end(body);
    return true;
  } catch {
    // No sibling, or it cannot be read: compress on the way out as before.
    return false;
  }
}

export async function handleStatic(request, response, url) {
  const fullPath = resolveStaticPath(url.pathname, rootDir);
  if (!fullPath) {
    // 404 rather than 403: a 403 confirms the file exists.
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const headers = {
    "Content-Type": mimeTypes.get(path.extname(fullPath)) || "application/octet-stream",
    "Cache-Control": cacheControlForStatic(url, fullPath),
  };

  if (await sendPrecompressed(request, response, fullPath, headers)) return;

  try {
    const body = await fs.readFile(fullPath);
    writeResponse(request, response, 200, body, headers);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}
