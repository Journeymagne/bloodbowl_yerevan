import path from "node:path";

// Only these may ever be served over HTTP. Everything else in the deploy
// directory (.env, .git, server/, scripts/, content/, package.json, ...) must
// stay unreachable: a deny-list would leak the next file someone adds.
export const staticFileAllowList = new Set([
  "index.html",
  "local-preview.html",
  "favicon.ico",
  "robots.txt",
]);

export const staticDirAllowList = ["dist", "public", "src", "assets"];

/**
 * Map a request pathname to an absolute file path, or null when the request
 * must not be served.
 *
 * @param {string} pathname URL pathname, still percent-encoded.
 * @param {string} root Absolute path of the directory static files live in.
 * @returns {string|null}
 */
export function resolveStaticPath(pathname, root) {
  let cleanPath;
  try {
    cleanPath = decodeURIComponent(String(pathname ?? ""));
  } catch {
    return null;
  }
  if (!cleanPath.startsWith("/")) return null;
  if (cleanPath.includes("\0") || cleanPath.includes("\\")) return null;

  const target = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  if (!target) return null;

  const segments = target.split("/");
  // No empty segments, no "." / ".." hops, no dotfiles or dot-directories.
  if (segments.some((segment) => !segment || segment.startsWith("."))) return null;

  const [head] = segments;
  const allowed = segments.length === 1
    ? staticFileAllowList.has(head)
    : staticDirAllowList.includes(head);
  if (!allowed) return null;

  const fullPath = path.resolve(root, ...segments);
  // Defence in depth: the segment checks above already exclude traversal.
  return fullPath.startsWith(root + path.sep) ? fullPath : null;
}
