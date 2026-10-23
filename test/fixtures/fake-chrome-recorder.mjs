#!/usr/bin/env node
// A "Chrome" for test/screenshots-plan.test.mjs that does what it is told and
// writes down where it was sent: every navigation and reload, in order, in
// loads.json beside its profile (in the run's TMPDIR). A page has loaded the
// moment it is asked to, every script answers true, and every shot is one pixel.
import fs from "node:fs";
import path from "node:path";

import { startFakeDevTools } from "../helpers/fake-devtools.mjs";

// The smallest PNG there is: one transparent pixel.
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const ANSWERS = {
  "Page.navigate": {},
  "Page.reload": {},
  "Runtime.evaluate": { result: { value: true } },
  "Page.getLayoutMetrics": { cssContentSize: { width: 390, height: 844 } },
  "Page.captureScreenshot": { data: PIXEL },
};

const profile = process.argv.find((arg) => arg.startsWith("--user-data-dir=")).slice("--user-data-dir=".length);
const log = path.join(path.dirname(profile), "loads.json");
const loads = [];
const devtools = await startFakeDevTools({
  onCommand({ id, method, params, sessionId }, send) {
    if (!(method in ANSWERS)) return false;
    send({ id, sessionId, result: ANSWERS[method] });
    if (method === "Page.navigate" || method === "Page.reload") {
      loads.push(method === "Page.reload" ? "reload" : params.url);
      fs.writeFileSync(log, JSON.stringify(loads));
      send({ method: "Page.loadEventFired", sessionId, params: {} });
    }
    return true;
  },
});
fs.writeFileSync(path.join(profile, "DevToolsActivePort"), `${devtools.port}\n/devtools/browser/fake\n`);
