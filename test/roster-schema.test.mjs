import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DRAFT_FIELDS,
  PLAYER_FIELDS,
  PURCHASED_STAFF_FIELDS,
  createDraft,
  createPlayer,
  draftPayload,
  normalizeDraft,
  normalizePurchasedStaff,
} from "../src/domain/roster/schema.mjs";

const cases = JSON.parse(readFileSync(new URL("./fixtures/roster-cases.json", import.meta.url), "utf8"));

/**
 * This file is a lock, not a specification.
 *
 * Step 3.2 collapsed four descriptions of the draft into one and is explicitly
 * not allowed to change what is stored: the migration that would have let the
 * shape change was cancelled, so every saved team in the database is in this
 * shape and nothing rewrites it. A green run here means the shape is still the
 * one on disk. If one of these ever needs updating to pass, the change is a
 * data migration, not a refactor.
 */

const EXPECTED_FIELDS = [
  "editingTeamId", "teamSlug", "teamName", "selectedLeague", "favouredChoice", "logoData",
  "players", "roster", "teamRerolls", "startingRerolls", "bribes", "dedicatedFans",
  "assistantCoaches", "cheerleaders", "apothecary", "mortuaryAssistant", "plagueDoctor",
  "purchasedStaff", "treasury", "coachesSafe",
];

test("the draft carries exactly these fields, and no others", () => {
  assert.deepEqual(DRAFT_FIELDS.map((field) => field.name), EXPECTED_FIELDS);
  assert.deepEqual(Object.keys(createDraft()), EXPECTED_FIELDS);
});

test("an empty draft holds the same emptiness it always did", () => {
  assert.deepEqual(createDraft(), {
    editingTeamId: "", teamSlug: "", teamName: "", selectedLeague: "", favouredChoice: "",
    logoData: "", players: [], roster: {}, teamRerolls: 0, startingRerolls: 0, bribes: 0,
    dedicatedFans: 0, assistantCoaches: 0, cheerleaders: 0, apothecary: 0,
    mortuaryAssistant: 0, plagueDoctor: 0,
    // Empty, not filled in with zeros: a team that has bought nothing since it
    // started carries no purchased-staff record, and only reading a stored
    // roster expands it. Asymmetric, and exactly what the four descriptions
    // this replaced did between them.
    purchasedStaff: {},
    treasury: 0, coachesSafe: 0,
  });
});

test("reading a stored roster fills purchased staff in, where an empty draft leaves it bare", () => {
  assert.deepEqual(normalizeDraft({}).purchasedStaff, {
    teamRerolls: 0, startingRerolls: 0, bribes: 0, assistantCoaches: 0,
    cheerleaders: 0, apothecary: 0, mortuaryAssistant: 0, plagueDoctor: 0,
  });
});

test("a draft opened for a race starts on that race", () => {
  const draft = createDraft({ slug: "teams/amazon", title: "Amazon" });
  assert.equal(draft.teamSlug, "teams/amazon");
  assert.equal(draft.teamName, "Amazon");
});

test("every stored fixture normalises to the same field set", () => {
  for (const rosterCase of cases) {
    const draft = normalizeDraft(rosterCase.draft);
    assert.deepEqual(Object.keys(draft), EXPECTED_FIELDS, `${rosterCase.team} kept a different set of fields`);
  }
});

test("normalising a stored fixture does not change a single value", () => {
  for (const rosterCase of cases) {
    const draft = normalizeDraft(rosterCase.draft);
    for (const name of EXPECTED_FIELDS) {
      if (name === "purchasedStaff") continue;
      const stored = rosterCase.draft[name];
      if (stored === undefined) continue;
      assert.deepEqual(draft[name], stored, `${rosterCase.team}.${name} changed`);
    }
  }
});

test("the retired playerEdits key is dropped, as it has been since task 3.3", () => {
  const withRetired = { ...cases[0].draft, playerEdits: { anything: true }, slots: [null, null] };
  const draft = normalizeDraft(withRetired);
  assert.equal("playerEdits" in draft, false);
  assert.equal("slots" in draft, false);
});

test("normalising twice gives the same answer as normalising once", () => {
  for (const rosterCase of cases) {
    const once = normalizeDraft(rosterCase.draft);
    assert.deepEqual(normalizeDraft(once), once, `${rosterCase.team} is not idempotent`);
  }
});

test("counts survive being stored as strings", () => {
  const draft = normalizeDraft({ treasury: "120", cheerleaders: "3", dedicatedFans: null });
  assert.equal(draft.treasury, 120);
  assert.equal(draft.cheerleaders, 3);
  assert.equal(draft.dedicatedFans, 0);
});

test("a roster saved before startingRerolls was named that still reads", () => {
  // The very first builder wrote `rerolls`. Nothing rewrites those rows.
  assert.equal(normalizeDraft({ rerolls: 4 }).startingRerolls, 4);
  assert.equal(normalizeDraft({ rerolls: 4, startingRerolls: 2 }).startingRerolls, 2);
});

test("purchased staff falls back to the team's rerolls, and only for rerolls", () => {
  assert.deepEqual(normalizePurchasedStaff({ teamRerolls: 3 }), {
    teamRerolls: 3, startingRerolls: 0, bribes: 0, assistantCoaches: 0,
    cheerleaders: 0, apothecary: 0, mortuaryAssistant: 0, plagueDoctor: 0,
  });
  assert.deepEqual(Object.keys(normalizePurchasedStaff({})), [...PURCHASED_STAFF_FIELDS]);
});

test("a payload carries every field, filling in whatever the draft lost", () => {
  assert.deepEqual(Object.keys(draftPayload({})), EXPECTED_FIELDS);
  assert.deepEqual(draftPayload({}), createDraft());
  const draft = normalizeDraft(cases[0].draft);
  assert.deepEqual(draftPayload(draft), draft);
});

test("a new player carries exactly the fields a player has always carried", () => {
  const row = { position: "Linewoman", ma: 6, st: 3 };
  const player = createPlayer(row, 2, 1, { purchased: true });
  assert.deepEqual(Object.keys(player), [
    "id", "rowIndex", "number", "name", ...Object.keys(PLAYER_FIELDS), "purchased",
  ]);
  assert.equal(player.rowIndex, 2);
  assert.equal(player.number, "2");
  assert.equal(player.name, "Linewoman 2");
  assert.equal(player.purchased, true);
  assert.notEqual(player.id, createPlayer(row, 2, 1).id);
});
