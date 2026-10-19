import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ABSENCE_CODES, ABSENCE_NOTE_MAX, PLAYER_FIELDS, createPlayer, normalizeAbsence, normalizeDraft } from "../src/domain/roster/schema.mjs";
import { applyInjuryEffects, clearAbsence, markAbsence, markEdits, sitsOut } from "../src/domain/roster/absence.mjs";
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

// The final review: the screen's queue asks the domain whether he misses the next match already (save.mjs's markSkip).
test("he sits the next match out when he is marked for it or retired for the season", () => {
  assert.deepEqual([{}, { skipNextGame: true }, { temporarilyRetired: true }, { skipNextGame: true, temporarilyRetired: true }, { skipNextGame: 0 }].map(sitsOut),
    [false, true, true, true, false]);
});

const pick = (player) => ({ skipNextGame: player.skipNextGame, absence: player.absence, nigglingInjuries: player.nigglingInjuries, statMods: player.statMods });

test("a coach's mark: the reason, the missed match, and what the injury does — a Niggling Injury, a characteristic down", () => {
  const player = { id: "p1", rowIndex: 2, statMods: { ag: 1 }, skipNextGame: false, niglingInjury: false, nigglingInjuries: 0, absence: null };
  assert.deepEqual(pick(markAbsence(player, { code: "miss" })), { skipNextGame: true, absence: { code: "miss" }, nigglingInjuries: 0, statMods: { ag: 1 } });
  assert.deepEqual(pick(markAbsence(player, { code: "niggling" })), { skipNextGame: true, absence: { code: "niggling" }, nigglingInjuries: 1, statMods: { ag: 1 } });
  const lasting = markAbsence(player, { code: "lasting", stat: "ag" });
  assert.deepEqual([lasting.statMods.ag, lasting.injuryStatMods.ag, lasting.absence], [0, -1, { code: "lasting", stat: "ag" }]);
  assert.deepEqual(markAbsence(player, { code: "other", note: "  Banned  " }).absence, { code: "other", note: "Banned" });
  assert.deepEqual(player.statMods, { ag: 1 }, "what was marked is a copy");
});

test("a 2.x player with a Niggling Injury and no count gets his second", () => {
  const player = { id: "p1", rowIndex: 0, statMods: {}, niglingInjury: true };
  const marked = markAbsence(player, { code: "niggling" });
  assert.equal(marked.nigglingInjuries, 2);
  assert.equal(marked.niglingInjury, true);
  assert.equal(player.nigglingInjuries, undefined, "the input keeps what it had");
});

test("the injury's effects are the post-match's: a characteristic only from the five, the other codes do nothing", () => {
  const player = { statMods: {}, niglingInjury: false, nigglingInjuries: 0 };
  applyInjuryEffects(player, { code: "lasting", stat: "st" });
  applyInjuryEffects(player, { code: "lasting", stat: "st" });
  assert.deepEqual([player.statMods, player.injuryStatMods], [{ st: -2 }, { st: -2 }]);
  const before = structuredClone(player);
  for (const injury of [{ code: "miss" }, { code: "badly-hurt" }, { code: "dead" }, { code: "none" }, { code: "other", note: "x" }, { code: "lasting" }, { code: "lasting", stat: "luck" }]) {
    applyInjuryEffects(player, injury);
    assert.deepEqual(player, before, injury.code);
  }
});

test("a mark that is not whole is the caller's bug", () => {
  const player = { id: "p1", rowIndex: 0, statMods: {} };
  assert.throws(() => markAbsence(player, { code: "dead" }));
  assert.throws(() => markAbsence(player, { code: "lasting" }));
  assert.throws(() => markAbsence(player, { code: "lasting", stat: "luck" }));
  assert.throws(() => markAbsence(player, { code: "other", note: "  " }));
  assert.throws(() => markAbsence(player, { code: "other" }));
  assert.throws(() => markAbsence(player, undefined));
  assert.deepEqual(player, { id: "p1", rowIndex: 0, statMods: {} }, "a refused mark leaves the player alone");
});

test("a reason that fits only another code is left off the mark", () => {
  const player = { id: "p1", rowIndex: 0, statMods: {} };
  assert.deepEqual(markAbsence(player, { code: "miss", stat: "ag", note: "stray" }).absence, { code: "miss" });
  assert.deepEqual(markAbsence(player, { code: "lasting", stat: "ag", note: "stray" }).absence, { code: "lasting", stat: "ag" });
});

test("back on the roster ends the missed match and its reason, and keeps what the injury did", () => {
  const player = { id: "p1", rowIndex: 0, statMods: { ag: 1 }, nigglingInjuries: 0, temporarilyRetired: true };
  const back = clearAbsence(markAbsence(player, { code: "lasting", stat: "ag" }));
  assert.equal(back.skipNextGame, false);
  assert.equal(back.absence, null);
  assert.equal(back.statMods.ag, 0);
  assert.equal(back.injuryStatMods.ag, -1);
  assert.equal(back.temporarilyRetired, true);
  const marked = markAbsence(player, { code: "niggling" });
  assert.deepEqual([clearAbsence(marked).nigglingInjuries, clearAbsence(marked).niglingInjury], [1, true]);
  assert.equal(marked.skipNextGame, true, "what came back is a copy");
});

test("the marks two rosters differ by", () => {
  const plays = (id) => ({ id, skipNextGame: false, absence: null });
  const before = { players: [{ id: "p1", skipNextGame: true, absence: { code: "niggling" } }, plays("p2"), plays("p3")] };
  const after = { players: [plays("p1"), { id: "p2", skipNextGame: true, absence: { code: "miss" } }, plays("p3"), { id: "p4", skipNextGame: true, absence: { code: "miss" } }] };
  assert.equal(markEdits(before, after), 2, "p1 came back, p2 sits out; p4 was never on the roster to differ from");
  assert.equal(markEdits(before, before), 0);
  for (const empty of [null, undefined, {}, [], { players: [] }]) {
    assert.equal(markEdits(empty, after), 0);
    assert.equal(markEdits(before, empty), 0);
  }
});

test("a mark differs by the reason too, and a retired player is as absent as a skipping one", () => {
  const sitting = (absence, extra = {}) => ({ players: [{ id: 7, skipNextGame: true, absence, ...extra }] });
  assert.equal(markEdits(sitting({ code: "miss" }), sitting({ code: "niggling" })), 1);
  assert.equal(markEdits(sitting({ code: "other", note: "a" }), sitting({ code: "other", note: "b" })), 1);
  assert.equal(markEdits(sitting({ code: "miss" }), sitting({ code: "miss", junk: 1 })), 0, "only what a reason reads as is a difference");
  assert.equal(markEdits(sitting({ code: "miss" }), { players: [{ id: "7", skipNextGame: false, temporarilyRetired: true, absence: { code: "miss" } }] }), 0, "a 2.x id is the text of it");
  assert.equal(markEdits({ players: [{ id: "7", skipNextGame: true }] }, { players: [{ id: "7", temporarilyRetired: true }] }), 0, "he was absent and still is");
  assert.equal(markEdits({ players: [{ id: "7" }] }, sitting(null)), 1);
});

test("the cap of a reason is the schema's", () => {
  assert.equal(ABSENCE_NOTE_MAX, 500);
});
