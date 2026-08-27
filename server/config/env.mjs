/**
 * Load the env file before anything reads `process.env`.
 *
 * server.mjs used to do this itself, at the top of its body — which was fine
 * while everything it configured also lived in server.mjs. It stops being fine
 * the moment configuration moves into modules: ES modules evaluate every import
 * before the importing module's first statement, so a module that reads
 * `process.env.DATABASE_URL` at load time would read it *before* server.mjs got
 * to call loadEnvFile, and quietly fall back to the default connection string.
 *
 * On this machine that is a failed connection you notice at once. On the server
 * it is worse: the real credentials live in /etc/bloodbowl-league/.env and
 * nowhere else, so the process would come up pointed at a database that is not
 * there — or, if a default happened to work, at the wrong one.
 *
 * The top-level await here is the fix, not decoration: a module's body,
 * including its awaits, finishes before any importer's body starts. So every
 * module that imports this one — directly or through another — sees a populated
 * environment.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFile } from "./env-file.mjs";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

await loadEnvFile(rootDir);
