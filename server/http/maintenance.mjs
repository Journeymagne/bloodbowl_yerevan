/**
 * The maintenance gate: the first thing every request meets.
 *
 * Answers with 503 while the flag file is up (server/http/maintenance-flag.mjs
 * says why it is a file and who is let through), and says nothing otherwise so
 * the request carries on to the API or the static files as usual.
 *
 * The page is read from disk on every refusal rather than cached: it is small,
 * and a page updated by a deploy must not need a restart to show.
 */
import "../config/env.mjs";

import { promises as fs } from "node:fs";
import path from "node:path";

import { errorPayload } from "./errors.mjs";
import { createMaintenanceReader, maintenanceAction, maintenanceFilePath } from "./maintenance-flag.mjs";
import { sendJson } from "./responses.mjs";
import { staticRoot } from "./static.mjs";

const RETRY_AFTER_SECONDS = "120";

/**
 * @param {{reader: {current(): Promise<object|null>}, loadPage: () => Promise<Buffer|string>}} deps
 * @returns {(request, response, url: URL) => Promise<boolean>} true when answered
 */
export function createMaintenanceGate({ reader, loadPage }) {
  return async function answer(request, response, url) {
    const flag = await reader.current();
    const action = maintenanceAction(url.pathname, request.socket?.remoteAddress, flag);
    if (action === "pass") return false;
    if (action === "api") {
      response.setHeader?.("Retry-After", RETRY_AFTER_SECONDS);
      sendJson(response, 503, errorPayload("MAINTENANCE"));
      return true;
    }
    response.writeHead(503, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": RETRY_AFTER_SECONDS,
    });
    response.end(await loadPage());
    return true;
  };
}

const reader = createMaintenanceReader({ filePath: maintenanceFilePath() });
const pagePath = path.join(staticRoot, "public", "maintenance", "index.html");

export const answerMaintenance = createMaintenanceGate({ reader, loadPage: () => fs.readFile(pagePath) });

/** The flag as the health check reports it: no internal fields. */
export async function currentMaintenance() {
  const flag = await reader.current();
  return flag ? { kind: flag.kind, startsAt: flag.startsAt, endsAt: flag.endsAt } : null;
}
