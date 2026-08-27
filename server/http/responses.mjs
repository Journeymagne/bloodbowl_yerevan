/**
 * Writing a response, and reading a request body.
 *
 * Moved out of server.mjs by step 4.9, which splits `handleApi` into route
 * modules: a route cannot live in its own file while the only way to answer a
 * request is a function defined beside it. This is the part every route needs
 * and none of them own.
 *
 * Compression is still synchronous and still happens per request — task 17.1
 * is what fixes that, and moving it unchanged is the point of this step.
 */
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

const compressionMinBytes = Number(process.env.COMPRESSION_MIN_BYTES || 1024);

/**
 * This used to read the stream to its end with no limit: one endless body was
 * enough to exhaust the process, and the process is single. 3 MB is well above
 * the largest real roster — a team with a logo runs to tens of kilobytes — and
 * the body is refused as it arrives, so it is never buffered.
 */
const maxRequestBodyBytes = Number(process.env.MAX_REQUEST_BODY_BYTES || 3 * 1024 * 1024);

const compressibleTypes = [
  "text/",
  "application/json",
  "application/javascript",
  "image/svg+xml",
];

/** An error the API turns into a status rather than a 500. */
export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function shouldCompress(contentType = "", body) {
  return body.length >= compressionMinBytes
    && compressibleTypes.some((type) => contentType.startsWith(type));
}

export function preferredEncoding(request) {
  const value = String(request?.headers?.["accept-encoding"] ?? "");
  if (/\bbr\b/.test(value)) return "br";
  if (/\bgzip\b/.test(value)) return "gzip";
  return "";
}

export function encodedBody(request, body, contentType) {
  if (!shouldCompress(contentType, body)) return { body };
  const encoding = preferredEncoding(request);
  if (encoding === "br") {
    return {
      body: brotliCompressSync(body, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
        },
      }),
      encoding,
    };
  }
  if (encoding === "gzip") {
    return { body: gzipSync(body, { level: 6 }), encoding };
  }
  return { body };
}

export function writeResponse(request, response, status, body, headers = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const contentType = String(headers["Content-Type"] ?? "");
  const encoded = encodedBody(request, buffer, contentType);
  const responseHeaders = {
    ...headers,
    "Content-Length": encoded.body.length,
  };
  if (encoded.encoding) {
    responseHeaders["Content-Encoding"] = encoded.encoding;
    responseHeaders.Vary = [responseHeaders.Vary, "Accept-Encoding"].filter(Boolean).join(", ");
  }
  response.writeHead(status, responseHeaders);
  response.end(encoded.body);
}

export function sendJson(response, status, payload) {
  writeResponse(response.__request, response, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

export async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBodyBytes) {
      // Stop reading but leave the socket alone: destroying it here means the
      // client sees a reset instead of the 413 explaining what happened.
      request.pause();
      throw httpError(413, `Request body is larger than ${Math.floor(maxRequestBodyBytes / 1024)} KB.`);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
