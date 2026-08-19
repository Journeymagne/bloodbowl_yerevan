/**
 * Deterministic roster cases shared by the fixture generator and the tests.
 *
 * `buildRosterCases()` produces, for a set of real teams, one draft of each
 * roster generation the app has to understand, plus everything the domain
 * computes from it. The random source is a fixed-seed LCG, so the same input
 * data always produces the same cases.
 */
import { calculateRosterCosts, applyPaidStaffChange, syncMedicalStaffForTeam } from "../../src/domain/roster/costs.mjs";
import { ensureDraftPlayers, selectedRosterPlayers, skillNamesForPlayer } from "../../src/domain/roster/players.mjs";
import {
  playerAvailableSpp,
  playerLevelRank,
  playerSppTotal,
  rosterTotalSpp,
} from "../../src/domain/roster/progression.mjs";
import {
  hasBribery,
  teamApothecaryAccess,
  teamFavouredOptions,
  teamLeagueOptions,
} from "../../src/domain/roster/team-rules.mjs";
import { playerCurrentCost } from "../../src/domain/roster/costs.mjs";

// Eight teams chosen to cover the special rules the domain branches on:
// Brawlin' Brutes and Passing Virtuosos (SPP maths), Bribery and Corruption,
// Mortuary Assistant, Plague Doctor, Favoured Of, and two plain teams.
export const FIXTURE_TEAM_SLUGS = [
  "teams/amazon",
  "teams/black-orc",
  "teams/chaos-chosen",
  "teams/necromantic-horror",
  "teams/nurgle",
  "teams/goblin",
  "teams/elven-union",
  "teams/lizardmen",
];

const SKILLS = ["Block", "Dodge", "Guard", "Mighty Blow", "Claws", "Wrestle", "Evasive", "Defensive", "Sure Hands", "Pro"];
const STATS = ["ma", "st", "ag", "pa", "ar"];
const SPP_KEYS = ["touchdowns", "casualties", "knockouts", "completions", "catches", "interceptions", "mvps"];
const ADVANCEMENT_TYPES = ["random", "primary", "secondary", "stat"];
const STAFF_KEYS = ["teamRerolls", "startingRerolls", "bribes", "assistantCoaches", "apothecary", "dedicatedFans"];

function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function emptyDraft(team) {
  return {
    editingTeamId: "",
    teamSlug: team.slug,
    teamName: team.title,
    selectedLeague: "",
    favouredChoice: "",
    logoData: "",
    players: [],
    roster: {},
    playerEdits: {},
    teamRerolls: 0,
    startingRerolls: 0,
    bribes: 0,
    dedicatedFans: 0,
    assistantCoaches: 0,
    cheerleaders: 0,
    apothecary: 0,
    mortuaryAssistant: 0,
    plagueDoctor: 0,
    purchasedStaff: {},
    treasury: 0,
    coachesSafe: 0,
  };
}

/** Current shape: an explicit players array. */
function modernDraft(team, random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const draft = emptyDraft(team);
  const rows = team.team?.roster ?? [];
  if (!rows.length) return draft;
  const count = 1 + Math.floor(random() * 11);
  for (let index = 0; index < count; index += 1) {
    const rowIndex = Math.floor(random() * rows.length);
    const row = rows[rowIndex];
    draft.players.push({
      id: `fixture-player-${index}`,
      rowIndex,
      number: String(index + 1),
      name: `${row.position} ${index + 1}`,
      statMods: random() > 0.5 ? { [pick(STATS)]: 1 + Math.floor(random() * 2) } : {},
      extraSkills: random() > 0.4 ? [{ name: pick(SKILLS), access: random() > 0.5 ? "primary" : "secondary" }] : [],
      favouredSkills: random() > 0.8 ? [{ name: pick(SKILLS), access: "favoured" }] : [],
      skipNextGame: random() > 0.85,
      niglingInjury: random() > 0.9,
      isCaptain: index === 0 && random() > 0.5,
      extendedContracts: random() > 0.8 ? 1 : 0,
      spp: Object.fromEntries(SPP_KEYS.map((key) => [key, Math.floor(random() * 4)])),
      advancements: random() > 0.6 ? [{ type: pick(ADVANCEMENT_TYPES) }] : [],
    });
  }
  draft.teamRerolls = Math.floor(random() * 3);
  draft.startingRerolls = Math.floor(random() * 3);
  draft.bribes = Math.floor(random() * 2);
  draft.dedicatedFans = Math.floor(random() * 4);
  draft.assistantCoaches = Math.floor(random() * 3);
  draft.cheerleaders = Math.floor(random() * 3);
  draft.apothecary = random() > 0.5 ? 1 : 0;
  draft.mortuaryAssistant = random() > 0.7 ? 1 : 0;
  draft.plagueDoctor = random() > 0.7 ? 1 : 0;
  draft.treasury = Math.floor(random() * 200);
  draft.coachesSafe = Math.floor(random() * 100);
  draft.purchasedStaff = { teamRerolls: draft.teamRerolls, apothecary: draft.apothecary };
  return draft;
}

/** Generation 1: counts in `roster` plus edits keyed by `rowIndex:copyIndex`. */
function legacyEditsDraft(team, random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const draft = emptyDraft(team);
  delete draft.players;
  const rows = team.team?.roster ?? [];
  rows.forEach((row, rowIndex) => {
    const count = Math.floor(random() * 3);
    if (!count) return;
    draft.roster[rowIndex] = count;
    for (let copyIndex = 0; copyIndex < count; copyIndex += 1) {
      // Key format has to match playerKey() in src/domain/roster/values.mjs.
      draft.playerEdits[`${rowIndex}-${copyIndex}`] = {
        name: `Old ${rowIndex}-${copyIndex}`,
        statMods: { st: 1 },
        extraSkills: [{ name: pick(SKILLS), access: "primary" }],
        skipNextGame: random() > 0.8,
        isCaptain: false,
        extendedContracts: 1,
        spp: { touchdowns: 2, casualties: 1, mvps: 1 },
        advancements: [{ type: "primary" }],
      };
    }
  });
  return draft;
}

/** Generation 2: the fixed-length `slots` array. */
function legacySlotsDraft(team, random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const draft = emptyDraft(team);
  delete draft.players;
  const rows = team.team?.roster ?? [];
  draft.slots = Array.from({ length: 14 }, (_slot, index) => {
    if (!rows.length || random() > 0.5) return null;
    const rowIndex = Math.floor(random() * rows.length);
    return {
      rowIndex,
      name: `Slot ${index}`,
      statMods: { ma: 1 },
      extraSkills: [{ name: pick(SKILLS), access: "secondary" }],
      spp: { touchdowns: 1 },
      advancements: [],
    };
  });
  return draft;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Player ids are generated, so they are normalised out of every comparison. */
export function stableJson(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (key === "row") return item?.position;
    if (key === "id" || key === "key") return typeof item === "string" ? "<id>" : item;
    return item;
  }));
}

/** Everything the domain derives from one draft, as plain JSON. */
export function describeCase(team, rawDraft) {
  const draft = clone(rawDraft);
  ensureDraftPlayers(team, draft);

  const roster = selectedRosterPlayers(team, draft);
  const staffChanges = {};
  for (const key of STAFF_KEYS) {
    const up = clone(draft);
    applyPaidStaffChange(up, key, 0, 2);
    const down = clone(up);
    applyPaidStaffChange(down, key, 2, 1);
    staffChanges[key] = {
      up: { value: up[key], treasury: up.treasury, purchasedStaff: up.purchasedStaff },
      down: { value: down[key], treasury: down.treasury, purchasedStaff: down.purchasedStaff },
    };
  }

  const medical = clone(draft);
  syncMedicalStaffForTeam(team, medical);

  return stableJson({
    // Only the parts migration actually rewrites: the rest of the draft is
    // carried over unchanged and would just bloat the fixture file.
    migratedPlayers: draft.players,
    rosterCounts: draft.roster,
    hasLegacyShapes: { slots: "slots" in draft, playerEdits: Object.keys(draft.playerEdits ?? {}).length },
    costs: calculateRosterCosts(team, draft),
    costsWithFans: calculateRosterCosts(team, draft, { includeDedicatedFans: true }),
    totalSpp: rosterTotalSpp(team, draft),
    team: {
      leagueOptions: teamLeagueOptions(team),
      favouredOptions: teamFavouredOptions(team),
      bribery: hasBribery(team),
      apothecary: teamApothecaryAccess(team),
    },
    players: roster.map((player) => ({
      name: player.name,
      position: player.row.position,
      cost: playerCurrentCost(player.row, player, true),
      skills: skillNamesForPlayer(player.row, player),
      sppTotal: playerSppTotal(team, player),
      sppAvailable: playerAvailableSpp(team, player),
      level: playerLevelRank(player),
    })),
    staffChanges,
    medicalStaff: {
      apothecary: medical.apothecary,
      mortuaryAssistant: medical.mortuaryAssistant,
      plagueDoctor: medical.plagueDoctor,
      treasury: medical.treasury,
    },
  });
}

export function buildRosterCases(allTeams) {
  const teams = FIXTURE_TEAM_SLUGS
    .map((slug) => allTeams.find((team) => team.slug === slug))
    .filter(Boolean);

  const cases = [];
  for (const team of teams) {
    for (const [generation, make] of [
      ["modern", modernDraft],
      ["legacy-edits", legacyEditsDraft],
      ["legacy-slots", legacySlotsDraft],
    ]) {
      // A per-case seed keeps cases independent: changing one generator does
      // not shift every other case's random draw.
      const random = makeRandom(hashSeed(`${team.slug}/${generation}`));
      const draft = make(team, random);
      cases.push({
        team: team.slug,
        generation,
        draft: clone(draft),
        expected: describeCase(team, draft),
      });
    }
  }
  return cases;
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash & 0x7fffffff;
}
