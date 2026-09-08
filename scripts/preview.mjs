#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPreviewServer } from "./preview/server.mjs";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const apiOrigin = process.env.PREVIEW_API_ORIGIN || "https://bloodbowlyerevan.shitpostsoftware.com";
const port = Number(process.env.PREVIEW_PORT || 5180);

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PREVIEW_PORT must be between 1 and 65535.");
  await fs.access(new URL("../dist/index.html", import.meta.url));
  const server = createPreviewServer({ root, apiOrigin });
  server.on("error", error => {
    console.error(`Preview could not start: ${error.code || error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Local build: http://127.0.0.1:${port}`);
    console.log(`Live API: ${apiOrigin}`);
    console.log("This preview uses real accounts and data. Saving changes writes to that server.");
  });
} catch (error) {
  console.error(error.code === "ENOENT" ? "Build missing. Run npm run preview:prod to build and start." : error.message);
  process.exitCode = 1;
}
