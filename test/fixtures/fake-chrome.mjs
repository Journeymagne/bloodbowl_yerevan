#!/usr/bin/env node
// A "Chrome" for test/screenshots-plan.test.mjs: it writes the DevToolsActivePort
// file the way Chrome does, answers the commands that open a page, and dies the
// moment it is asked to navigate: a Chrome that went away in the middle of a run.
import fs from "node:fs";
import path from "node:path";

import { startFakeDevTools } from "../helpers/fake-devtools.mjs";

const profile = process.argv.find((arg) => arg.startsWith("--user-data-dir=")).slice("--user-data-dir=".length);
const devtools = await startFakeDevTools({
  onCommand({ method }) {
    if (method !== "Page.navigate") return false;
    devtools.dropConnections();
    process.exit(0);
  },
});
fs.writeFileSync(path.join(profile, "DevToolsActivePort"), `${devtools.port}\n/devtools/browser/fake\n`);
