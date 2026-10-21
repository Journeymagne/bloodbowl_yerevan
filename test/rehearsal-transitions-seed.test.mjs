import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { STALE_OUTPUTS, TRANSITIONS_FINISH, TRANSITIONS_RECORD } from "../scripts/rehearsal/outputs.mjs";
import { seedToRecord, seedTransitions } from "../scripts/rehearsal/transitions-seed.mjs";

// A 2.1.0 site as far as the seed's creates go: coaches, teams, the season, challenges and their accepts. The
// call numbered `failAt` is refused with a 409, and so is anything past the creates (the pre-matches), so a
// seed against it always stops part-way, after making rows. `made` lists what the site made, in order.
function fakeSite({ failAt = Infinity } = {}) {
  const made = { users: [], teamIds: [], challengeIds: [], pairingIds: [] };
  let calls = 0;
  const refuse = (method, route) => { throw new Error(`${method} ${route} → 409 {"error":"conflict"}`); };
  const answer = (method, route) => {
    if (method === "POST" && route === "/api/auth/register") {
      made.users.push(`u${made.users.length + 1}`);
      return { user: { id: made.users.at(-1) }, token: `token-${made.users.length}` };
    }
    if (method === "POST" && route === "/api/teams") return { team: { id: made.teamIds[made.teamIds.push(`team-${made.teamIds.length + 1}`) - 1] } };
    if (method === "GET" && route === "/api/season") return { season: { id: "s1" }, standings: [] };
    if (method === "POST" && route === "/api/challenges") return { id: made.challengeIds[made.challengeIds.push(`challenge-${made.challengeIds.length + 1}`) - 1] };
    if (method === "POST" && /^\/api\/challenges\/[^/]+\/accept$/.test(route)) return { gameId: made.pairingIds[made.pairingIds.push(`game-${made.pairingIds.length + 1}`) - 1] };
    return refuse(method, route);
  };
  const site = {
    base: "http://localhost:3004", made,
    get calls() { return calls; },
    async ok(method, route) {
      calls += 1;
      if (calls === failAt) refuse(method, route);
      return answer(method, route);
    },
    async request(method, route, options) {
      return { status: 200, data: await site.ok(method, route, options) };
    },
  };
  return site;
}

const STAMP = "0f1e2d3c-0000-4000-8000-000000000000";
const seededOf = (made) => ({ pairingIds: made.pairingIds, challengeIds: made.challengeIds, teamIds: made.teamIds });

async function scratchDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "rehearsal-transitions-"));
}

test("a seed that stops part-way has recorded every row it made, as a seed that did not finish", async () => {
  const site = fakeSite(), saves = [];
  await assert.rejects(seedTransitions(site, { stamp: STAMP, save: async (record) => saves.push(record) }), /409/);
  assert.equal(site.made.teamIds.length, 10, "the fake site let the seed make its ten teams");
  assert.equal(site.made.pairingIds.length, 4, "and its four pairings, before the first pre-match was refused");
  const last = saves.at(-1);
  assert.deepEqual(last.seeded, seededOf(site.made), "the last record names every pairing, challenge and team the site made");
  assert.equal(last.complete, false);
  assert.ok(saves.every((record) => record.complete === false), "no record of a seed that stopped says it finished");
  assert.deepEqual(Object.keys(last.coaches), ["home", "away"]);
  assert.equal(last.coaches.away.id, "u2");
  assert.equal(typeof last.coaches.away.password, "string");
  assert.equal(last.stamp, STAMP);
  assert.equal(last.seedBase, "http://localhost:3004");
  assert.equal(saves.length, 2 + 10 + 4 + 4, "a record after each coach, team, challenge and accepted challenge");
});

test("a seed refused at its third team has recorded the two teams it made", async () => {
  const site = fakeSite({ failAt: 5 }), saves = [];
  await assert.rejects(seedTransitions(site, { stamp: STAMP, save: async (record) => saves.push(record) }), /POST \/api\/teams → 409/);
  assert.deepEqual(saves.at(-1).seeded, { pairingIds: [], challengeIds: [], teamIds: ["team-1", "team-2"] });
  assert.equal(saves.at(-1).complete, false);
});

test("--seed writes its record as it goes, 0600, and a seed that stops says to restore again", async () => {
  const dir = await scratchDir(), site = fakeSite();
  await assert.rejects(seedToRecord(site, { dir, stamp: STAMP }), (error) => {
    assert.match(error.message, /409/);
    assert.match(error.message, /the seed left rows in gata_rehearsal/);
    assert.match(error.message, /run rehearsal:restore again/);
    return true;
  });
  const file = path.join(dir, TRANSITIONS_RECORD);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  const record = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(record.complete, false);
  assert.deepEqual(record.seeded, seededOf(site.made));
  await fs.rm(dir, { recursive: true, force: true });
});

test("--seed refuses a record already there, whatever it says: a second seed would leave the first one's rows unmarked", async () => {
  const dir = await scratchDir(), site = fakeSite();
  const file = path.join(dir, TRANSITIONS_RECORD), kept = `${JSON.stringify({ complete: true, seeded: { teamIds: ["old"] } })}\n`;
  await fs.writeFile(file, kept, { mode: 0o600 });
  await assert.rejects(seedToRecord(site, { dir, stamp: STAMP }), /transitions\.json is there.*rehearsal:restore again/s);
  assert.equal(site.calls, 0, "nothing is asked of the site");
  assert.equal(await fs.readFile(file, "utf8"), kept, "the record is left as it was");
  await fs.rm(dir, { recursive: true, force: true });
});

test("--seed clears an old finish, and a seed refused before it made anything leaves no record", async () => {
  const dir = await scratchDir(), site = fakeSite({ failAt: 1 });
  await fs.writeFile(path.join(dir, TRANSITIONS_FINISH), "{\"results\":[]}\n");
  await assert.rejects(seedToRecord(site, { dir, stamp: STAMP }), (error) => {
    assert.match(error.message, /POST \/api\/auth\/register → 409/);
    assert.doesNotMatch(error.message, /left rows/);
    return true;
  });
  await assert.rejects(fs.stat(path.join(dir, TRANSITIONS_FINISH)), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(dir, TRANSITIONS_RECORD)), { code: "ENOENT" });
  await fs.rm(dir, { recursive: true, force: true });
});

test("a new rehearsal:restore deletes the seed's record and its finish with the rest of the last rehearsal", async () => {
  for (const name of ["before.json", "after.json", "report.md", "migrate.json", TRANSITIONS_RECORD, TRANSITIONS_FINISH]) {
    assert.ok(STALE_OUTPUTS.includes(name), name);
  }
  assert.deepEqual([TRANSITIONS_RECORD, TRANSITIONS_FINISH], ["transitions.json", "transitions-finish.json"]);
  const restore = await fs.readFile(new URL("../scripts/rehearsal-restore.mjs", import.meta.url), "utf8");
  assert.match(restore, /import \{[^}]*\bSTALE_OUTPUTS\b[^}]*\} from "\.\/rehearsal\/outputs\.mjs"/, "rehearsal:restore deletes this list, not one of its own");
  assert.doesNotMatch(restore, /const STALE_OUTPUTS/);
});
