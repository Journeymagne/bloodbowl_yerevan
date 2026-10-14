import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MAINTENANCE_FILE,
  createMaintenanceReader,
  isLoopbackAddress,
  maintenanceAction,
  maintenanceFilePath,
  parseMaintenanceFlag,
} from "../server/http/maintenance-flag.mjs";

const planned = { kind: "planned", startsAt: null, endsAt: null };

test("the flag file lives in /etc unless MAINTENANCE_FILE says otherwise", () => {
  assert.equal(maintenanceFilePath({}), DEFAULT_MAINTENANCE_FILE);
  assert.equal(maintenanceFilePath({ MAINTENANCE_FILE: "/tmp/flag.json" }), "/tmp/flag.json");
});

test("a valid flag keeps its kind and normalises its times", () => {
  const flag = parseMaintenanceFlag(JSON.stringify({ kind: "planned", startsAt: "2026-11-02T18:00:00+04:00", endsAt: "2026-11-02T19:00:00+04:00" }));
  assert.deepEqual(flag, { kind: "planned", startsAt: "2026-11-02T14:00:00.000Z", endsAt: "2026-11-02T15:00:00.000Z" });
});

test("a flag that cannot be read as intended still closes the site", () => {
  for (const text of ["{not json", "null", JSON.stringify({ kind: "weekly" }), JSON.stringify(["planned"])]) {
    assert.deepEqual(parseMaintenanceFlag(text), { kind: "unplanned", startsAt: null, endsAt: null, invalid: true }, text);
  }
});

test("a time that is not a date is dropped, not trusted", () => {
  assert.deepEqual(parseMaintenanceFlag(JSON.stringify({ kind: "unplanned", startsAt: "soon", endsAt: 5 })),
    { kind: "unplanned", startsAt: null, endsAt: null });
});

test("only the machine itself counts as loopback", () => {
  for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) assert.equal(isLoopbackAddress(address), true, address);
  for (const address of ["172.18.0.2", "10.0.0.1", "", undefined, "127.0.0.2"]) assert.equal(isLoopbackAddress(address), false, String(address));
});

test("without a flag everything passes", () => {
  assert.equal(maintenanceAction("/", "172.18.0.2", null), "pass");
  assert.equal(maintenanceAction("/api/teams", "172.18.0.2", null), "pass");
});

test("with a flag, the public gets the page and the API refuses", () => {
  assert.equal(maintenanceAction("/", "172.18.0.2", planned), "page");
  assert.equal(maintenanceAction("/src/app.js", "172.18.0.2", planned), "page");
  assert.equal(maintenanceAction("/api/teams", "172.18.0.2", planned), "api");
});

test("health, the page's own files and loopback pass during maintenance", () => {
  assert.equal(maintenanceAction("/api/health", "172.18.0.2", planned), "pass");
  assert.equal(maintenanceAction("/public/maintenance/maintenance.css", "172.18.0.2", planned), "pass");
  assert.equal(maintenanceAction("/assets/fonts/ui/fonts.css", "172.18.0.2", planned), "pass");
  assert.equal(maintenanceAction("/api/teams", "127.0.0.1", planned), "pass");
  assert.equal(maintenanceAction("/", "::1", planned), "pass");
});

function fakeFiles(initial) {
  const files = { ...initial };
  let reads = 0;
  return {
    files,
    reads: () => reads,
    readFile: async (filePath) => {
      reads += 1;
      if (!(filePath in files)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      if (files[filePath] instanceof Error) throw files[filePath];
      return files[filePath];
    },
  };
}

test("no file means no maintenance", async () => {
  const fs = fakeFiles({});
  const reader = createMaintenanceReader({ filePath: "/flag", readFile: fs.readFile });
  assert.equal(await reader.current(), null);
});

test("the file is read at most once per interval", async () => {
  const fs = fakeFiles({ "/flag": JSON.stringify(planned) });
  let clock = 1000;
  const reader = createMaintenanceReader({ filePath: "/flag", readFile: fs.readFile, now: () => clock, minIntervalMs: 2000 });
  assert.deepEqual(await reader.current(), planned);
  clock += 1500;
  await reader.current();
  assert.equal(fs.reads(), 1);
  delete fs.files["/flag"];
  clock += 600;
  assert.equal(await reader.current(), null);
  assert.equal(fs.reads(), 2);
});

test("an unreadable or broken file closes the site and warns once", async () => {
  const warnings = [];
  const fs = fakeFiles({ "/flag": Object.assign(new Error("denied"), { code: "EACCES" }) });
  let clock = 0;
  const reader = createMaintenanceReader({ filePath: "/flag", readFile: fs.readFile, now: () => clock, warn: (message) => warnings.push(message) });
  assert.equal((await reader.current()).kind, "unplanned");
  fs.files["/flag"] = "{broken";
  clock += 5000;
  assert.equal((await reader.current()).kind, "unplanned");
  clock += 5000;
  await reader.current();
  assert.equal(warnings.length, 1);
});
