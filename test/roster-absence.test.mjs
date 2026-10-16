import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ABSENCE_CODES, PLAYER_FIELDS, createPlayer, normalizeAbsence, normalizeDraft } from "../src/domain/roster/schema.mjs";
import { ensureDraftPlayers, normalizeRosterPlayer, rosterPlayerView } from "../src/domain/roster/players.mjs";
import { INJURIES } from "../src/domain/post-match/rules.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const rows = [{ position: "Lineman", ma: 6, st: 3, ag: "3+", pa: "4+", ar: "9+", skills: [] }];
const cases = JSON.parse(readFileSync(new URL("./fixtures/roster-cases.json", import.meta.url), "utf8"));
const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.json", import.meta.url), "utf8")));

test("absence is a player field that starts empty", () => {
  assert.equal(PLAYER_FIELDS.absence(), null);
  assert.equal(createPlayer(rows[0], 0).absence, null);
});

test("every stored fixture player reads with no absence", () => {
  for (const item of cases) {
    const draft = normalizeDraft(item.draft);
    ensureDraftPlayers(data.teams.find((team) => team.slug === item.team), draft);
    assert.ok(draft.players.every((player) => player.absence === null), item.team);
  }
});

test("the codes are post-match injury codes, plus other for a manual mark", () => {
  assert.deepEqual([...ABSENCE_CODES], ["miss", "niggling", "lasting", "other"]);
  for (const code of ABSENCE_CODES.filter((item) => item !== "other")) assert.ok(INJURIES.includes(code), code);
});

test("an absence keeps a known code, a real stat, a note and the match; anything else is dropped", () => {
  assert.deepEqual(normalizeAbsence({ code: "lasting", stat: "ma", pairingId: "g1", junk: 1 }), { code: "lasting", stat: "ma", pairingId: "g1" });
  assert.deepEqual(normalizeAbsence({ code: "other", stat: "luck", note: "  wedding  " }), { code: "other", note: "wedding" });
  assert.equal(normalizeAbsence({ code: "other", note: "x".repeat(600) }).note.length, 500);
  assert.equal(normalizeAbsence({ code: "dead" }), null);
  assert.equal(normalizeAbsence("miss"), null);
  assert.equal(normalizeAbsence(null), null);
});

test("a player who is not sitting out has no absence, whatever the blob says", () => {
  const stale = normalizeRosterPlayer({ id: "p", rowIndex: 0, skipNextGame: false, absence: { code: "miss" } }, rows);
  assert.equal(stale.absence, null);
  const sitting = normalizeRosterPlayer({ id: "p", rowIndex: 0, skipNextGame: true, absence: { code: "niggling", pairingId: "g1" } }, rows);
  assert.deepEqual(sitting.absence, { code: "niggling", pairingId: "g1" });
  const retired = normalizeRosterPlayer({ id: "p", rowIndex: 0, temporarilyRetired: true, absence: { code: "lasting", stat: "ag" } }, rows);
  assert.deepEqual(retired.absence, { code: "lasting", stat: "ag" });
});

test("a note is cut by characters: an emoji straddling the limit is dropped whole, never split", () => {
  const note = normalizeAbsence({ code: "other", note: `${"x".repeat(499)}\u{1F600}tail` }).note;
  assert.equal(note, "x".repeat(499) + "\u{1F600}");
  assert.equal(Array.from(note).length, 500);
  assert.ok(note.isWellFormed(), "a lone surrogate is not valid JSON text for Postgres");
  assert.equal(normalizeAbsence({ code: "other", note: `${"x".repeat(498)}\u{1F600}\u{1F600}` }).note, "x".repeat(498) + "\u{1F600}\u{1F600}");
  assert.equal(normalizeAbsence({ code: "other", note: `${"x".repeat(497)}   y` }).note, "x".repeat(497));
});

test("a player view re-derives the absence like the stored player does, and never hands out a stale one", () => {
  const team = { team: { roster: rows } };
  const stale = rosterPlayerView(team, { id: "p", rowIndex: 0, skipNextGame: false, absence: { code: "miss" } });
  assert.equal(stale.absence, null);
  assert.equal(stale.skipNextGame, false);
  const retired = rosterPlayerView(team, { id: "p", rowIndex: 0, temporarilyRetired: true, absence: { code: "lasting", stat: "ag", junk: 1 } });
  assert.deepEqual(retired.absence, { code: "lasting", stat: "ag" });
  assert.equal(retired.skipNextGame, true);
});
