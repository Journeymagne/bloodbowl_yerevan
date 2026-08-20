/**
 * Every number the Gata league rules put on a team, in one place.
 *
 * These used to be scattered through src/app.js (staff prices near the top,
 * skill surcharges inside the cost helpers, the 600k budget written out 21
 * times). The rules text in content/Gata/ states the same numbers, so when a
 * rule changes both this file and the vault have to change together.
 *
 * Pure data: no DOM, no state, safe to import from the server.
 */
export const builderStaffCosts = {
  teamRerolls: 120,
  startingRerolls: 60,
  bribes: 50,
  dedicatedFans: 10,
  assistantCoaches: 10,
  cheerleaders: 10,
  apothecary: 50,
  mortuaryAssistant: 100,
  plagueDoctor: 100,
};

export const builderStaffMaximums = {
  teamRerolls: 8,
  startingRerolls: 8,
  bribes: 3,
  dedicatedFans: 6,
  assistantCoaches: 6,
  cheerleaders: 6,
  apothecary: 1,
  mortuaryAssistant: 1,
  plagueDoctor: 1,
};

export const medicalStaffDefinitions = [
  { key: "apothecary", title: "Apothecary", access: "apothecary" },
  { key: "mortuaryAssistant", title: "Mortuary Assistant", access: "mortuary" },
  { key: "plagueDoctor", title: "Plague Doctor", access: "plague" },
];

export const advancementRanks = [
  { rank: "Experienced", costs: { random: 3, primary: 6, secondary: 10, stat: 14 } },
  { rank: "Veteran", costs: { random: 4, primary: 8, secondary: 12, stat: 16 } },
  { rank: "Emerging Star", costs: { random: 6, primary: 12, secondary: 16, stat: 20 } },
  { rank: "Star", costs: { random: 8, primary: 16, secondary: 20, stat: 24 } },
  { rank: "Superstar", costs: { random: 10, primary: 20, secondary: 24, stat: 28 } },
  { rank: "Legend", costs: { random: 15, primary: 30, secondary: 34, stat: 38 } },
];

export const advancementTypeLabels = {
  random: "Random",
  primary: "Primary",
  secondary: "Secondary",
  stat: "Stat",
};

export const advancementStatCosts = {
  ar: 10,
  pa: 20,
  ma: 30,
  ag: 40,
  st: 50,
};

export const eliteSkillCombos = [
  ["Claws", "Mighty Blow"],
  ["Guard", "Defensive"],
  ["Wrestle", "Evasive"],
];

export const skillAccessMap = {
  A: "Agility",
  D: "Devious",
  G: "General",
  M: "Mutation",
  P: "Passing",
  S: "Strength",
};

export const leagueAccessNames = [
  "Badlands Brawl",
  "Chaos Clash",
  "Elven Kingdoms League",
  "Halfling Thimble Cup",
  "Lustrian Superleague",
  "Old World Classic",
  "Sylvanian Spotlight",
  "Underworld Challenge",
  "Woodland League",
  "Worlds Edge Superleague",
];

export const specialRuleNames = [
  "Architect of Fate",
  "Brawlin' Brutes",
  "Bribery and Corruption",
  "Explosive Demise",
  "Favoured of...",
  "Low Cost Linemen",
  "Masters of Undeath",
  "Passing Virtuosos",
  "Swarming",
  "Team Captain",
];

export const favouredAlignments = [
  {
    name: "Undivided",
    skills: ["Prehensile Tail", "Extra Arms", "Disturbing Presence"],
  },
  {
    name: "Hashut",
    skills: ["Iron Hard Skin", "Horns", "Bone Hook"],
  },
  {
    name: "Slaanesh",
    skills: ["Tentacles", "Foul Appearance", "Extra Arms"],
  },
  {
    name: "Nurgle",
    skills: ["Tentacles", "Monstrous Mouth", "Bone Hook"],
  },
  {
    name: "Khorne",
    skills: ["Horns", "Iron Hard Skin", "Prehensile Tail"],
  },
  {
    name: "Tzeentch",
    skills: ["Two Heads", "Extra Arms", "Very Long Legs"],
  },
];

export const sppCounterDefinitions = [
  ["touchdowns", "TD"],
  ["casualties", "CAS"],
  ["knockouts", "KO"],
  ["completions", "COMP"],
  ["catches", "CATCH"],
  ["interceptions", "INT"],
  ["mvps", "MVP"],
];

/**
 * Numbers that used to be written inline in src/app.js. Values unchanged —
 * this only gives them a name and a single place to edit.
 */
/**
 * What a brand-new team gets to spend on its first purchase, and nothing else.
 * A league constant, not a per-season setting — confirmed by the league owner
 * on 2026-08-21 (question 1 of the design spec's section 13). It therefore has
 * no business in a league team's summary: see task 7.5, which drops the
 * "remaining budget" line for teams already in play.
 */
export const startingBudget = 600;
export const rosterSizeLimits = { min: 7, max: 11 };
export const skillCosts = { primary: 20, secondary: 40, favoured: 0 };
export const extendedContractCost = 20;
export const eliteComboCost = 15;
/** Fallback used when a position's quantity is not written as a range. */
export const defaultPositionMaximum = 16;

const LEAGUE_RULES = Object.freeze({
  startingBudget,
  rosterSizeLimits,
  skillCosts,
  extendedContractCost,
  eliteComboCost,
  defaultPositionMaximum,
  staffCosts: builderStaffCosts,
  staffMaximums: builderStaffMaximums,
  medicalStaff: medicalStaffDefinitions,
  advancementRanks,
  advancementStatCosts,
  eliteSkillCombos,
  sppCounters: sppCounterDefinitions,
});

export default LEAGUE_RULES;
