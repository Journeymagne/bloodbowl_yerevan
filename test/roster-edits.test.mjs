import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { expandCollections } from "../src/data/reference.mjs";
import { sameValues } from "../src/domain/post-match/events.mjs";
import { clearAbsence, markAbsence, markEdits } from "../src/domain/roster/absence.mjs";
import { LAST_SHIRT_NUMBER } from "../src/domain/roster/build.mjs";
import {
  EDIT_REFUSALS, FIX_REFUSALS, MAX_CONTRACTS, MAX_NIGGLING, MAX_STAT_CORRECTION, addFavouredSkill, applyFix, editPlayer,
  editRefusal, favouredBonus, fixFormOf, fixRefusal, healInjuries, legacySkills, playerEdits, playerInjuries,
} from "../src/domain/roster/edits.mjs";
import { takeAdvancement } from "../src/domain/roster/progression.mjs";
import { normalizeDraft, rosterForStorage } from "../src/domain/roster/schema.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";
import { checkRoster, loadTeamReference } from "../server/domain/roster.mjs";

await loadTeamReference(fileURLToPath(new URL("..", import.meta.url)));

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const dictionary = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
const race = (slug) => data.teams.find((team) => team.slug === slug);
const { skillGroups } = data;
// Human: 0 Human Lineman (MA 6, ST 3, AG 3+, PA 4+, AR 9+; G), 1 Thrower, 2 Catcher (MA 8; Catch, Dodge), 3 Blitzer, 5 Ogre.
const human = race("teams/human");
const rows = rowsForTeam(human);
// Nurgle, Favoured of Nurgle: 0 Rotter Lineman (primary D G M), 3 Rotspawn (primary S, PA "-", has Tentacles).
const nurgle = race("teams/nurgle");
const nurgleRows = rowsForTeam(nurgle);
const NURGLE = { teamSlug: "teams/nurgle", favouredChoice: "Nurgle" };

/** test/helpers/roster-page.mjs' roster: Ann 1, Bors 2 the captain, Cade 3, Dell 4 out, Edda 5 out, Finn 6 retired, Grom 7 out. */
const PLAYERS = [
  { id: "p1", rowIndex: 0, number: "1", name: "Ann" },
  { id: "p2", rowIndex: 3, number: "2", name: "Bors", isCaptain: true },
  { id: "p3", rowIndex: 2, number: "3", name: "Cade" },
  { id: "p4", rowIndex: 0, number: "4", name: "Dell", skipNextGame: true, absence: { code: "lasting", stat: "ma" }, statMods: { ma: -1 } },
  { id: "p5", rowIndex: 1, number: "5", name: "Edda", skipNextGame: true },
  { id: "p6", rowIndex: 0, number: "6", name: "Finn", skipNextGame: true, temporarilyRetired: true },
  { id: "p7", rowIndex: 5, number: "7", name: "Grom", skipNextGame: true, absence: { code: "other", note: "Suspended" } },
];
// Hal has two Niggling Injuries and a lasting one on AG; Vic a skill no advancement gave (Block) and one that one did (Frenzy).
const HAL = { id: "p8", rowIndex: 0, number: "8", name: "Hal", nigglingInjuries: 2, niglingInjury: true, statMods: { ag: -1 }, injuryStatMods: { ag: -1 } };
const VIC = {
  id: "p9", rowIndex: 0, number: "9", name: "Vic", extendedContracts: 1,
  extraSkills: [{ name: "Block" }, { name: "Frenzy", access: "primary" }], advancements: [{ type: "primary", grants: { skill: "Frenzy" } }],
};
const ROTTER = { id: "n1", rowIndex: 0, number: "1", name: "Pus" };
const ROTSPAWN = { id: "n2", rowIndex: 3, number: "2", name: "Spawn" };

const roster = (players = PLAYERS, over = {}) => ({ teamSlug: "teams/human", players: structuredClone(players), ...over });
const named = (draft, name) => draft.players.find((player) => player.name === name);
const captains = (draft) => draft.players.filter((player) => player.isCaptain).map(({ name }) => name);
const edit = (number, name) => ({ number, name });
const NUMBER_RANGE = { code: "NUMBER_RANGE", params: { max: 99 } };
const statRefusal = (code, stat) => ({ code, params: { stat } });
/** Why the fix of `player` as it stands, with `fix` over it, is refused, on a roster of him alone. */
const refusalOf = (fix, player = PLAYERS[0], team = human, over = {}) =>
  fixRefusal(team, roster([player], over), player.id, { ...fixFormOf(player), ...fix });

test("a number is a whole number from 1 to 99 that nobody else on the roster wears, those who miss the match too", () => {
  const draft = roster();
  assert.equal(LAST_SHIRT_NUMBER, 99);
  assert.equal(editRefusal(draft, "p7", edit("7", "Grom")), null, "his own number");
  assert.deepEqual(editRefusal(draft, "p1", edit("5", "Ann")), { code: "NUMBER_TAKEN", params: { number: 5, name: "Edda" } });
  assert.deepEqual(editRefusal(draft, "p1", edit("6", "Ann")), { code: "NUMBER_TAKEN", params: { number: 6, name: "Finn" } }, "retired");
  assert.deepEqual(editRefusal(draft, "p1", edit("07", "Ann")), { code: "NUMBER_TAKEN", params: { number: 7, name: "Grom" } }, "by value");
  for (const number of ["0", "100", "1.5", "x", "", " ", "-1", "1e1", "+3"]) {
    assert.deepEqual(editRefusal(draft, "p1", edit(number, "Ann")), NUMBER_RANGE, JSON.stringify(number));
  }
  assert.equal(editRefusal(draft, "p1", edit(" 12 ", "Ann")), null);
  assert.equal(editRefusal(draft, "p1", edit("99", "Ann")), null);
  assert.deepEqual(editPlayer(draft, "p1", { number: " 012 " }), { applied: true, changed: true });
  assert.equal(named(draft, "Ann").number, "12");
  const before = structuredClone(draft);
  assert.deepEqual(editPlayer(draft, "p3", { number: "12" }), { applied: false, code: "NUMBER_TAKEN", params: { number: 12, name: "Ann" } });
  assert.deepEqual(editPlayer(draft, "p3", { number: "100", name: "Cade", captain: true }), { applied: false, ...NUMBER_RANGE });
  assert.ok(sameValues(draft, before), "a refused edit changes nothing");
});

test("a name is what is left without the blanks at its ends, and never nothing", () => {
  const draft = roster();
  assert.deepEqual(editRefusal(draft, "p1", edit("1", "   ")), { code: "NAME_EMPTY", params: {} });
  assert.deepEqual(editRefusal(draft, "p1", edit("x", "")), { code: "NAME_EMPTY", params: {} }, "the name first");
  assert.deepEqual(editRefusal(draft, "p1", edit("x", "Ann")), NUMBER_RANGE, "then the range, then who wears it");
  assert.deepEqual(editPlayer(draft, "p1", { name: "  Ann B  " }), { applied: true, changed: true });
  assert.deepEqual([named(draft, "Ann B").id, named(draft, "Ann B").number], ["p1", "1"]);
  assert.deepEqual(editPlayer(draft, "p1", { name: "\t" }), { applied: false, code: "NAME_EMPTY", params: {} });
  assert.ok(named(draft, "Ann B"));
});

test("one captain: on moves the armband to him, off leaves the team without one", () => {
  const moved = roster();
  assert.deepEqual(editPlayer(moved, "p1", { captain: true }), { applied: true, changed: true });
  assert.deepEqual(captains(moved), ["Ann"]);
  const off = roster();
  assert.deepEqual(editPlayer(off, "p2", { captain: false }), { applied: true, changed: true });
  assert.deepEqual(captains(off), []);
  const stays = roster();
  assert.deepEqual(editPlayer(stays, "p1", { captain: false }), { applied: true, changed: false });
  assert.deepEqual(captains(stays), ["Bors"]);
  const nobody = roster();
  assert.deepEqual(editPlayer(nobody, "p10", { captain: true }), { applied: false, code: "PLAYER_NOT_FOUND", params: {} });
  assert.deepEqual(editPlayer(nobody, null, { captain: true }), { applied: false, code: "PLAYER_NOT_FOUND", params: {} });
  assert.deepEqual(captains(nobody), ["Bors"]);
});

test("a 2.x roster's numeric id: the armband goes to the player the address names, by his own id (K14)", () => {
  const draft = roster(PLAYERS.map((player, n) => ({ ...player, id: n + 1 })));
  assert.deepEqual(editPlayer(draft, "5", { captain: true }), { applied: true, changed: true });
  assert.deepEqual(captains(draft), ["Edda"]);
  assert.equal(named(draft, "Edda").id, 5, "his id stays as stored");
  assert.equal(editRefusal(draft, "5", edit("5", "Edda")), null, "his own number");
  assert.deepEqual(editRefusal(draft, "1", edit("5", "Ann")), { code: "NUMBER_TAKEN", params: { number: 5, name: "Edda" } });
  assert.deepEqual(editPlayer(draft, "5", { captain: false }), { applied: true, changed: true });
  assert.deepEqual(captains(draft), []);
});

test("nothing changed is no change", () => {
  const draft = roster();
  assert.deepEqual(editPlayer(draft, "p2", { number: "2", name: "Bors", captain: true }), { applied: true, changed: false });
  assert.deepEqual(editPlayer(draft, "p2", { number: " 02 ", name: " Bors " }), { applied: true, changed: false });
  assert.deepEqual(editPlayer(draft, "p1", { number: "1", name: "Ann", captain: false }), { applied: true, changed: false });
  assert.deepEqual(draft.players.map(({ number, name }) => `${number} ${name}`), PLAYERS.map(({ number, name }) => `${number} ${name}`));
  assert.deepEqual(captains(draft), ["Bors"]);
  const flagOnly = { id: "p10", rowIndex: 0, number: "10", name: "Old", niglingInjury: true };
  for (const player of [...PLAYERS, HAL, VIC, flagOnly, { ...ROTTER, favouredSkills: [{ name: "Bone Hook", access: "favoured" }] }]) {
    const team = player.id.startsWith("n") ? nurgle : human, fixed = roster([player], team === nurgle ? NURGLE : {});
    assert.deepEqual(applyFix(team, fixed, player.id, fixFormOf(player)), { applied: true, changed: false }, player.name);
  }
});

test("a manual fix: Niggling Injuries as a count, a lasting injury taken off, a characteristic put right, contracts, favoured skills, a skill no advancement gave", () => {
  const fixed = (player, fix, team = human, over = {}) => {
    const draft = roster([player], over);
    assert.deepEqual(applyFix(team, draft, player.id, { ...fixFormOf(player), ...fix }), { applied: true, changed: true }, JSON.stringify(fix));
    return draft.players[0];
  };
  assert.deepEqual(playerInjuries(HAL), { niggling: 2, lasting: [{ stat: "ag", count: 1 }] });
  assert.deepEqual(playerInjuries(PLAYERS[0]), { niggling: 0, lasting: [] });
  assert.deepEqual(fixFormOf(HAL), { niggling: 2, lasting: {}, stats: {}, contracts: 0, favoured: { add: [], remove: [] }, dropSkills: [] });
  assert.equal(fixFormOf({ id: "p10", rowIndex: 0, niglingInjury: true }).niggling, 1, "a 2.x flag without a count is one");
  assert.equal(fixFormOf(VIC).contracts, 1);
  let after = fixed(HAL, { niggling: 1 });
  assert.deepEqual([after.nigglingInjuries, after.niglingInjury], [1, true]);
  after = fixed(HAL, { niggling: 0 });
  assert.deepEqual([after.nigglingInjuries, after.niglingInjury], [0, false]);
  after = fixed({ id: "p10", rowIndex: 0, number: "10", name: "Old", niglingInjury: true }, { niggling: 3 });
  assert.deepEqual([after.nigglingInjuries, after.niglingInjury], [3, true]);
  for (const lasting of [{ ag: 1 }, { ag: 3 }]) {
    after = fixed(HAL, { lasting });
    assert.deepEqual([after.statMods, after.injuryStatMods], [{}, {}], `${JSON.stringify(lasting)}: one taken off, the keys gone`);
    assert.deepEqual(playerInjuries(after).lasting, []);
  }
  const twice = { ...HAL, statMods: { ma: -1 }, injuryStatMods: { ma: -2 } };
  after = fixed(twice, { lasting: { ma: 1 } });
  assert.deepEqual([after.statMods, after.injuryStatMods], [{}, { ma: -1 }], "one of two: his +1 and the other one leave MA as printed");
  after = fixed(PLAYERS[0], { stats: { ma: 1 } });
  assert.deepEqual(after.statMods, { ma: 1 });
  assert.equal(after.injuryStatMods, undefined, "an injury is not a correction");
  after = fixed(HAL, { stats: { ag: 1 } });
  assert.deepEqual([after.statMods, after.injuryStatMods], [{}, { ag: -1 }]);
  after = fixed(PLAYERS[0], { contracts: 2 });
  assert.equal(after.extendedContracts, 2);
  after = fixed(ROTTER, { favoured: { add: ["Tentacles"], remove: [] } }, nurgle, NURGLE);
  assert.deepEqual(after.favouredSkills, [{ name: "Tentacles", access: "favoured" }]);
  after = fixed(after, { favoured: { add: [], remove: ["Tentacles"] } }, nurgle, NURGLE);
  assert.deepEqual(after.favouredSkills, []);
  const legacy = { ...PLAYERS[0], extraSkills: [{ name: "Block" }] };
  assert.deepEqual(legacySkills(rows[0], legacy), ["Block"]);
  assert.deepEqual(legacySkills(rows[0], VIC), ["Block"], "Frenzy an advancement gave");
  after = fixed(legacy, { dropSkills: ["Block"] });
  assert.deepEqual(after.extraSkills, []);
  after = fixed(VIC, { dropSkills: ["Block"] });
  assert.deepEqual(after.extraSkills, [{ name: "Frenzy", access: "primary" }]);
});

test("healing in place: as many as were taken off, never more; a stat without one is left alone", () => {
  const player = structuredClone({ ...HAL, statMods: { ag: -1, ma: 1 }, injuryStatMods: { ag: -1 } });
  healInjuries(player, { lasting: { ag: 2, ma: 1, st: 1 } });
  assert.deepEqual([player.statMods, player.injuryStatMods], [{ ma: 1 }, {}]);
  healInjuries(player, {});
  assert.deepEqual([player.statMods, player.injuryStatMods], [{ ma: 1 }, {}]);
});

test("a characteristic is put right within the rule's limit above and the 2.x bound below; a position without PA has none", () => {
  const catcher = { id: "c1", rowIndex: 2, number: "3", name: "Cade", statMods: { ma: 1 } };
  assert.deepEqual(refusalOf({ stats: { ma: 1 } }, catcher), statRefusal("STAT_LIMIT", "ma"), "MA 10");
  assert.equal(refusalOf({ stats: { ma: -1 } }, catcher), null);
  const healedPast = { ...catcher, statMods: { ma: 0 }, injuryStatMods: { ma: -1 } };
  assert.deepEqual(refusalOf({ lasting: { ma: 1 }, stats: { ma: 1 } }, healedPast), statRefusal("STAT_LIMIT", "ma"), "MA 9 healed, then 10");
  const lineman = PLAYERS[0];
  assert.deepEqual(refusalOf({ stats: { st: -3 } }, lineman), statRefusal("STAT_FLOOR", "st"), "ST 0");
  assert.equal(refusalOf({ stats: { st: -2 } }, lineman), null, "ST 1");
  assert.deepEqual(refusalOf({ stats: { ag: -1 } }, { ...lineman, statMods: { ag: -10 } }), statRefusal("STAT_FLOOR", "ag"));
  assert.equal(refusalOf({ stats: { ag: -3 } }, lineman), null, "AG 6+");
  assert.deepEqual(refusalOf({ stats: { ag: -4 } }, lineman), statRefusal("STAT_FLOOR", "ag"), "AG 7+");
  assert.equal(refusalOf({ stats: { ag: 2 } }, lineman), null, "AG 1+");
  assert.deepEqual(refusalOf({ stats: { ag: 3 } }, lineman), statRefusal("STAT_LIMIT", "ag"), "AG 0+");
  assert.deepEqual(refusalOf({ stats: { pa: -3 } }, lineman), statRefusal("STAT_FLOOR", "pa"), "PA 7+");
  assert.deepEqual(refusalOf({ stats: { ar: 3 } }, lineman), statRefusal("STAT_LIMIT", "ar"), "AR 12+");
  assert.equal(refusalOf({ stats: { ar: -6 } }, lineman), null, "AR 3+");
  assert.deepEqual(refusalOf({ stats: { ar: -7 } }, lineman), statRefusal("STAT_FLOOR", "ar"), "AR 2+");
  const offset = { ...lineman, statMods: {}, injuryStatMods: { ma: -10 } };
  assert.equal(refusalOf({ stats: { ma: -1 } }, offset), null, "MA 5, ten off and nine back");
  assert.deepEqual(refusalOf({ stats: { ma: 1 } }, offset), statRefusal("STAT_FLOOR", "ma"), "MA 7, but eleven put right: the 2.x bound");
  assert.deepEqual(refusalOf({ stats: { ma: 0.5 } }, lineman), statRefusal("STAT_FLOOR", "ma"), "a step is whole");
  const fast = { ...catcher, statMods: { ma: 3 } }, clumsy = { ...lineman, statMods: { ag: -5 } };
  assert.equal(refusalOf({ stats: { ma: -1 } }, fast), null, "MA 11 from 2.x: one down, toward the limit");
  assert.deepEqual(refusalOf({ stats: { ma: 1 } }, fast), statRefusal("STAT_LIMIT", "ma"), "but not up");
  assert.equal(refusalOf({ stats: { ag: 1 } }, clumsy), null, "AG 8+ from 2.x: one better, toward the floor");
  assert.deepEqual(refusalOf({ stats: { ag: -1 } }, clumsy), statRefusal("STAT_FLOOR", "ag"), "but not worse");
  assert.deepEqual(refusalOf({ stats: { pa: 1 } }, ROTSPAWN, nurgle, NURGLE), statRefusal("STAT_NONE", "pa"));
  assert.deepEqual(refusalOf({ stats: { pa: -1 } }, ROTSPAWN, nurgle, NURGLE), statRefusal("STAT_NONE", "pa"));
  assert.equal(refusalOf({ stats: { pa: 0 } }, ROTSPAWN, nurgle, NURGLE), null, "no step, nothing to refuse");
});

test("counts stay in their range; only his own favoured skills and a skill no advancement gave come off", () => {
  assert.deepEqual([MAX_NIGGLING, MAX_CONTRACTS, MAX_STAT_CORRECTION], [9, 20, 10]);
  for (const niggling of [10, -1, 1.5, Number.NaN, "2"]) {
    assert.deepEqual(refusalOf({ niggling }), { code: "NIGGLING_RANGE", params: { max: 9 } }, String(niggling));
  }
  assert.equal(refusalOf({ niggling: 9 }), null);
  for (const contracts of [-1, 21, 1.5]) {
    assert.deepEqual(refusalOf({ contracts }), { code: "CONTRACTS_RANGE", params: { max: 20 } }, String(contracts));
  }
  assert.equal(refusalOf({ contracts: 20 }), null);
  assert.deepEqual(refusalOf({ dropSkills: ["Frenzy"] }, VIC), { code: "SKILL_NOT_EXTRA", params: { skill: "Frenzy" } }, "an advancement's");
  assert.deepEqual(refusalOf({ dropSkills: ["Catch"] }, { ...PLAYERS[2] }), { code: "SKILL_NOT_EXTRA", params: { skill: "Catch" } }, "the position's");
  const boned = { ...ROTTER, favouredSkills: [{ name: "Bone Hook", access: "favoured" }] };
  const favoured = (add, remove = [], player = boned, team = nurgle) => refusalOf({ favoured: { add, remove } }, player, team, NURGLE);
  assert.deepEqual(favoured([], ["Tentacles"]), { code: "FAVOURED_SKILL_NOT_HIS", params: { skill: "Tentacles" } });
  assert.equal(favoured([], [undefined]).code, "FAVOURED_SKILL_NOT_HIS", "nothing named is nothing of his");
  assert.equal(refusalOf({ dropSkills: [null] }, VIC).code, "SKILL_NOT_EXTRA");
  assert.equal(favoured([], ["Bone Hook"]), null);
  assert.deepEqual(favoured(["Block"]), { code: "FAVOURED_SKILL_UNKNOWN", params: { skill: "Block" } });
  assert.deepEqual(favoured(["Bone Hook"]), { code: "FAVOURED_SKILL_HELD", params: { skill: "Bone Hook" } });
  assert.deepEqual(favoured(["Tentacles", "Tentacles"]), { code: "FAVOURED_SKILL_HELD", params: { skill: "Tentacles" } }, "twice in one fix");
  assert.deepEqual(favoured(["Tentacles"], [], ROTSPAWN), { code: "FAVOURED_SKILL_HELD", params: { skill: "Tentacles" } }, "the position's own");
  assert.deepEqual(favoured(["Tentacles"], [], PLAYERS[0], human), { code: "FAVOURED_SKILL_UNKNOWN", params: { skill: "Tentacles" } }, "no favour");
  const everything = { stats: { pa: 1 }, niggling: 10, contracts: 21, favoured: { add: ["Block"], remove: ["Horns"] }, dropSkills: ["Catch"] };
  const order = [["stats", "STAT_NONE"], ["niggling", "NIGGLING_RANGE"], ["contracts", "CONTRACTS_RANGE"], ["add", "FAVOURED_SKILL_UNKNOWN"],
    ["remove", "FAVOURED_SKILL_NOT_HIS"], ["dropSkills", "SKILL_NOT_EXTRA"]];
  const wrong = structuredClone(everything);
  for (const [field, code] of order) {
    assert.equal(refusalOf(wrong, ROTSPAWN, nurgle).code, code, `${field} before what follows`);
    if (field === "add" || field === "remove") wrong.favoured[field] = [];
    else delete wrong[field];
  }
  assert.equal(refusalOf(wrong, ROTSPAWN, nurgle), null);
});

test("the players an edit, a fix or an advancement changes, a mark's injury left to the marks", () => {
  const before = roster([...PLAYERS, HAL, VIC].map((player) => (player.id === "p3" ? { ...player, spp: { touchdowns: 10 } } : player)));
  const fix = (playerId, over) => (draft) => {
    const player = draft.players.find(({ id }) => id === playerId);
    return applyFix(human, draft, playerId, { ...fixFormOf(player), ...over });
  };
  const favour = (draft) => {
    named(draft, "Ann").favouredSkills = [{ name: "Tentacles", access: "favoured" }];
    return { applied: true };
  };
  const changes = [
    ["a number", (draft) => editPlayer(draft, "p1", { number: "12" }), 1],
    ["a name", (draft) => editPlayer(draft, "p1", { name: "Ann B" }), 1],
    ["the armband, from one to another", (draft) => editPlayer(draft, "p1", { captain: true }), 2],
    ["an advancement", (draft) => takeAdvancement(human, rows[2], named(draft, "Cade"), { type: "primary", grant: { skill: "Block" } }, skillGroups), 1],
    ["a favoured skill", favour, 1],
    ["a lasting injury taken off", fix("p8", { lasting: { ag: 1 } }), 1],
    ["the Niggling Injuries", fix("p8", { niggling: 0 }), 1],
    ["a characteristic put right", fix("p1", { stats: { ma: 1 } }), 1],
    ["a contract", fix("p1", { contracts: 2 }), 1],
    ["a skill no advancement gave", fix("p9", { dropSkills: ["Block"] }), 1],
  ];
  for (const [what, change, count] of changes) {
    const after = structuredClone(before);
    assert.equal(change(after).applied, true, what);
    assert.equal(playerEdits(before, after), count, what);
  }
  assert.equal(playerEdits(before, structuredClone(before)), 0);
  for (const mark of [{ code: "lasting", stat: "ag" }, { code: "niggling" }]) {
    const marked = structuredClone(before);
    marked.players[0] = markAbsence(marked.players[0], mark);
    assert.deepEqual([playerEdits(before, marked), markEdits(before, marked)], [0, 1], `${mark.code}: the marks count it`);
    marked.players[0].name = "Ann B";
    assert.equal(playerEdits(before, marked), 1, "a mark and a name");
  }
  const at = before.players.findIndex(({ id }) => id === "p8");
  const beside = [
    ["a missed match, and AG healed", { code: "miss" }, { lasting: { ag: 1 } }],
    ["a lasting MA mark, and the older AG healed", { code: "lasting", stat: "ma" }, { lasting: { ag: 1 } }],
    ["a Niggling mark, and the count put right", { code: "niggling" }, { niggling: 1 }],
  ];
  for (const [what, mark, over] of beside) {
    const after = structuredClone(before);
    after.players[at] = markAbsence(after.players[at], mark);
    assert.deepEqual(fix("p8", over)(after), { applied: true, changed: true }, what);
    assert.deepEqual([playerEdits(before, after), markEdits(before, after)], [1, 1], `${what}: both said (R8)`);
  }
  const out = structuredClone(before);
  out.players[at] = markAbsence(out.players[at], { code: "lasting", stat: "ag" });
  const back = structuredClone(out);
  back.players[at] = clearAbsence(back.players[at]);
  assert.deepEqual([playerEdits(out, back), markEdits(out, back)], [0, 1], "back on the roster: the mark's alone");
  assert.equal(fix("p8", { lasting: { ag: 2 } })(back).applied, true);
  assert.deepEqual([playerEdits(out, back), markEdits(out, back)], [1, 1], "back on the roster, and AG healed");
  const spp = structuredClone(before);
  named(spp, "Ann").spp = { touchdowns: 1 };
  assert.equal(playerEdits(before, spp), 0, "SPP are counted by the SPP");
  const numeric = roster(PLAYERS.map((player, n) => ({ ...player, id: n + 1 })));
  const texts = structuredClone(numeric);
  for (const player of texts.players) player.id = String(player.id);
  assert.equal(playerEdits(numeric, texts), 0, "5 and \"5\" are one player");
  texts.players[0].name = "Ann B";
  assert.equal(playerEdits(numeric, texts), 1);
  const gone = structuredClone(before);
  gone.players = gone.players.filter(({ id }) => id !== "p1");
  gone.players.push({ id: "p11", rowIndex: 0, number: "11", name: "New" });
  assert.equal(playerEdits(before, gone), 0, "who came or went is no edit");
  for (const [was, now] of [[null, before], [before, null], [{}, {}], [undefined, before]]) assert.equal(playerEdits(was, now), 0);
});

test("Favoured of Nurgle: the trigger, the list, what he has, and whether the coach picks or rolls", () => {
  const draft = roster([ROTTER, ROTSPAWN], NURGLE), [rotter, rotspawn] = draft.players;
  const skills = (...held) => ["Tentacles", "Monstrous Mouth", "Bone Hook"].map((name, at) => ({ name, held: held[at] ?? false }));
  // `cost`: what the god's skill adds to his value, a skill's price by his Mutation access (the owner, 2026-10-22): a
  // Rotter Lineman's is primary (+20k), a Rotspawn's secondary (+40k).
  assert.deepEqual(favouredBonus(nurgle, draft, nurgleRows[0], rotter), { alignment: "Nurgle", trigger: 7, random: false, cost: 20, skills: skills() });
  assert.deepEqual(favouredBonus(nurgle, draft, nurgleRows[3], rotspawn), { alignment: "Nurgle", trigger: 7, random: true, cost: 40, skills: skills(true) });
  assert.equal(favouredBonus(human, roster(), rows[0], PLAYERS[0]), null, "no Favoured of…");
  assert.equal(favouredBonus(nurgle, { ...draft, favouredChoice: "" }, nurgleRows[0], rotter), null, "none chosen");
  assert.equal(favouredBonus(nurgle, { ...draft, favouredChoice: "Khorne" }, nurgleRows[0], rotter), null, "not this race's");
  const chosen = race("teams/chaos-chosen"), minotaur = rowsForTeam(chosen)[4];
  assert.deepEqual(favouredBonus(chosen, { favouredChoice: "khorne" }, minotaur, { id: "m1", rowIndex: 4 }),
    { alignment: "Khorne", trigger: 8, random: false, cost: 20,
      skills: [{ name: "Horns", held: true }, { name: "Iron Hard Skin", held: false }, { name: "Prehensile Tail", held: false }] });
  assert.deepEqual(addFavouredSkill(nurgle, draft, nurgleRows[0], rotter, "Tentacles"), { applied: true });
  assert.deepEqual(rotter.favouredSkills, [{ name: "Tentacles", access: "favoured" }]);
  assert.deepEqual(favouredBonus(nurgle, draft, nurgleRows[0], rotter).skills, skills(true));
  assert.deepEqual(addFavouredSkill(nurgle, draft, nurgleRows[0], rotter, "Tentacles"),
    { applied: false, code: "FAVOURED_SKILL_HELD", params: { skill: "Tentacles" } });
  assert.deepEqual(addFavouredSkill(nurgle, draft, nurgleRows[0], rotter, "Block"),
    { applied: false, code: "FAVOURED_SKILL_UNKNOWN", params: { skill: "Block" } });
  assert.deepEqual(rotter.favouredSkills, [{ name: "Tentacles", access: "favoured" }], "a refusal adds nothing");
});

/** The players as the server stores them (`checkRoster`): Humans with Hal and Vic, or two Nurgle players. */
function storedRoster(slug = "teams/human", players = [...PLAYERS, HAL, VIC], over = {}) {
  return JSON.parse(JSON.stringify(checkRoster(slug, { teamSlug: slug, teamName: "Iron Rooks", treasury: 120, players, ...over }).roster));
}
const asStored = (slug, draft) => sameValues(normalizeDraft(checkRoster(slug, draft).roster).players, normalizeDraft(rosterForStorage(draft)).players);

test("an edited player as the server stores him is the player as sent (Review Focus 1)", () => {
  const fix = (playerId, over, team = human) => (draft) => {
    const player = draft.players.find(({ id }) => id === playerId);
    return applyFix(team, draft, playerId, { ...fixFormOf(player), ...over });
  };
  const humans = [
    ["a number", (draft) => editPlayer(draft, "p1", { number: " 012 " })],
    ["a name", (draft) => editPlayer(draft, "p1", { name: "  Ann B  " })],
    ["the armband moved", (draft) => editPlayer(draft, "p1", { captain: true })],
    ["the armband off", (draft) => editPlayer(draft, "p2", { captain: false })],
    ["Niggling Injuries down", fix("p8", { niggling: 0 })],
    ["Niggling Injuries up", fix("p1", { niggling: 3 })],
    ["a lasting injury taken off", fix("p8", { lasting: { ag: 1 } })],
    ["characteristics put right", fix("p1", { stats: { ma: 1, ag: -1 } })],
    ["a correction undone", fix("p4", { stats: { ma: 1 } })],
    ["contracts", fix("p9", { contracts: 2 })],
    ["a skill no advancement gave", fix("p9", { dropSkills: ["Block"] })],
  ];
  for (const [what, step] of humans) {
    const draft = storedRoster();
    assert.deepEqual(step(draft), { applied: true, changed: true }, what);
    assert.ok(asStored("teams/human", draft), `${what} is stored as it was sent`);
  }
  const nurgles = [
    ["a favoured skill added", fix("n1", { favoured: { add: ["Tentacles", "Bone Hook"], remove: [] } }, nurgle)],
    ["a favoured skill taken off", fix("n2", { favoured: { add: [], remove: ["Bone Hook"] } }, nurgle)],
    ["a god's favour with an advancement", (draft) => ({
      ...addFavouredSkill(nurgle, draft, nurgleRows[0], draft.players[0], "Monstrous Mouth"), changed: true })],
  ];
  for (const [what, step] of nurgles) {
    const draft = storedRoster("teams/nurgle", [ROTTER, { ...ROTSPAWN, favouredSkills: ["Bone Hook"] }], NURGLE);
    assert.deepEqual(step(draft), { applied: true, changed: true }, what);
    assert.ok(asStored("teams/nurgle", draft), `${what} is stored as it was sent`);
  }
});

test("every refusal is one the screen words: the edit's and the fix's own, and a player no longer on the team (K9)", () => {
  assert.deepEqual(EDIT_REFUSALS, ["NAME_EMPTY", "NUMBER_RANGE", "NUMBER_TAKEN"]);
  assert.deepEqual(FIX_REFUSALS, ["STAT_NONE", "STAT_LIMIT", "STAT_FLOOR", "NIGGLING_RANGE", "CONTRACTS_RANGE",
    "FAVOURED_SKILL_UNKNOWN", "FAVOURED_SKILL_HELD", "FAVOURED_SKILL_NOT_HIS", "SKILL_NOT_EXTRA"]);
  assert.ok(Object.isFrozen(EDIT_REFUSALS) && Object.isFrozen(FIX_REFUSALS));
  for (const locale of ["en", "ru"]) assert.ok(dictionary(locale)["validation.PLAYER_NOT_FOUND"], `${locale} words PLAYER_NOT_FOUND`);
  const edited = new Set();
  for (const playerId of ["p1", "p2", "p10", "", null, undefined]) {
    for (const number of ["1", "5", "0", "x", " 12 ", undefined]) {
      for (const name of ["Ann", " ", undefined]) {
        for (const captain of [true, false, undefined]) {
          const draft = roster(), before = structuredClone(draft), result = editPlayer(draft, playerId, { number, name, captain });
          if (result.applied) continue;
          edited.add(result.code);
          assert.ok(sameValues(draft, before), `${result.code} changes nothing`);
        }
      }
    }
  }
  assert.deepEqual([...edited].sort(), [...EDIT_REFUSALS, "PLAYER_NOT_FOUND"].sort());
  const fixed = new Set();
  const fixes = [
    {}, { stats: { pa: 1 } }, { stats: { ma: 9 } }, { stats: { st: -9 } }, { stats: { xx: 1 } }, { niggling: 10 }, { contracts: -1 },
    { favoured: { add: ["Block"] } }, { favoured: { add: ["Tentacles"] } }, { favoured: { add: ["Tentacles", "Tentacles"] } },
    { favoured: { remove: ["Horns"] } }, { dropSkills: ["Block"] }, { dropSkills: ["Decay"] }, { lasting: { ag: -2 } },
  ];
  for (const [team, players, over] of [[human, [...PLAYERS, HAL, VIC], {}], [nurgle, [ROTTER, ROTSPAWN], NURGLE]]) {
    for (const playerId of [...players.map(({ id }) => id), "p10"]) {
      for (const fix of fixes) {
        const draft = roster(players, over), before = structuredClone(draft), result = applyFix(team, draft, playerId, fix);
        assert.deepEqual(fixRefusal(team, roster(players, over), playerId, fix), result.applied ? null : { code: result.code, params: result.params });
        if (result.applied) continue;
        fixed.add(result.code);
        assert.ok(sameValues(draft, before), `${result.code} changes nothing`);
      }
    }
  }
  assert.deepEqual([...fixed].sort(), [...FIX_REFUSALS, "PLAYER_NOT_FOUND"].sort());
});
