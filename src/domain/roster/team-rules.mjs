/**
 * Team-level rule lookups: league access, special rules, favoured alignments
 * and which medical staff a team may hire.
 *
 * The vault writes these as prose ("Bribery and Corruption, Badlands Brawl"),
 * so matching is done on canonicalised keys rather than raw strings.
 */
import { favouredAlignments, leagueAccessNames, medicalStaffDefinitions, specialRuleNames } from "../league-rules.mjs";
import { splitList } from "./values.mjs";

export function ruleLookupKey(value = "") {
  return String(value)
    .replace(/\bOId\b/g, "Old")
    .replace(/\bFavored\b/g, "Favoured")
    .replace(/Elven Kingdoms League/i, "Elven Kingdom League")
    .replace(/Worlds Edge/i, "World's Edge")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export const leagueAccessDisplayByKey = new Map(leagueAccessNames.map((name) => [ruleLookupKey(name), name]));

export const specialRuleDisplayByKey = new Map([
  [ruleLookupKey("Architect of Fate"), "Architect of Fate"],
  [ruleLookupKey("Brawlin' Brutes"), "Brawlin' Brutes"],
  [ruleLookupKey("Brawling Brutes"), "Brawlin' Brutes"],
  [ruleLookupKey("Bribery and Corruption"), "Bribery and Corruption"],
  [ruleLookupKey("Explosive Demise"), "Explosive Demise"],
  [ruleLookupKey("Favoured of..."), "Favoured of..."],
  [ruleLookupKey("Favoured of ..."), "Favoured of..."],
  [ruleLookupKey("Favored of..."), "Favoured of..."],
  [ruleLookupKey("Favored of ..."), "Favoured of..."],
  [ruleLookupKey("Low Cost Linemen"), "Low Cost Linemen"],
  [ruleLookupKey("Masters of Undeath"), "Masters of Undeath"],
  [ruleLookupKey("Passing Virtuosos"), "Passing Virtuosos"],
  [ruleLookupKey("Swarming"), "Swarming"],
  [ruleLookupKey("Team Captain"), "Team Captain"],
]);

export function splitRuleAccessParts(value = "") {
  return splitList(value)
    .filter((item) => item !== "-")
    .flatMap((item) => item.split(/\s+or\s+/i))
    .flatMap((item) => item.split(/\s+\+\s+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function canonicalLeagueName(value = "") {
  return leagueAccessDisplayByKey.get(ruleLookupKey(value)) ?? "";
}

export function canonicalSpecialRuleName(value = "") {
  const clean = String(value).replace(/\bFavored\b/g, "Favoured").trim();
  const key = ruleLookupKey(clean);
  if (key.startsWith("favouredof")) {
    return key === ruleLookupKey("Favoured of...") ? "Favoured of..." : clean;
  }
  return specialRuleDisplayByKey.get(key) ?? "";
}

export function uniqueCanonical(values, canonicalizer) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const canonical = canonicalizer(value);
    if (!canonical) continue;
    const key = ruleLookupKey(canonical);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(canonical);
  }
  return output;
}

export function leagueOrder(name) {
  const key = ruleLookupKey(name);
  const index = leagueAccessNames.findIndex((league) => ruleLookupKey(league) === key);
  return index === -1 ? leagueAccessNames.length : index;
}

export function specialRuleOrder(name) {
  const key = ruleLookupKey(name);
  const index = specialRuleNames.findIndex((rule) => key.startsWith("favouredof")
    ? ruleLookupKey(rule) === ruleLookupKey("Favoured of...")
    : ruleLookupKey(rule) === key);
  return index === -1 ? specialRuleNames.length : index;
}

export function teamSpecialRuleTokens(team) {
  const rules = uniqueCanonical(splitRuleAccessParts(team.team?.meta?.specialRules ?? ""), canonicalSpecialRuleName);
  if (!rules.some((rule) => ruleLookupKey(rule) === ruleLookupKey("Team Captain"))) {
    rules.push("Team Captain");
  }
  return rules
    .sort((a, b) => specialRuleOrder(a) - specialRuleOrder(b) || a.localeCompare(b, "en"));
}

export function specialRuleMatchKey(value = "") {
  const key = ruleLookupKey(value);
  return key === "brawlingbrutes" ? "brawlinbrutes" : key;
}

export function teamHasSpecialRule(team, ruleName) {
  const expected = specialRuleMatchKey(ruleName);
  return teamSpecialRuleTokens(team).some((rule) => specialRuleMatchKey(rule) === expected);
}

export function teamLeagueOptions(team) {
  return uniqueCanonical(splitRuleAccessParts(team.team?.meta?.specialRules ?? ""), canonicalLeagueName)
    .sort((a, b) => leagueOrder(a) - leagueOrder(b) || a.localeCompare(b, "en"));
}

export function favouredAlignmentName(value = "") {
  const clean = String(value)
    .replace(/\bFavored\b/g, "Favoured")
    .replace(/^Favoured\s+of/i, "")
    .replace(/\.+$/g, "")
    .trim();
  const key = ruleLookupKey(clean);
  return favouredAlignments.find((alignment) => ruleLookupKey(alignment.name) === key)?.name ?? "";
}

export function teamFavouredOptions(team) {
  const rules = teamSpecialRuleTokens(team).filter((rule) => ruleLookupKey(rule).startsWith("favouredof"));
  if (!rules.length) return [];
  if (rules.some((rule) => ruleLookupKey(rule) === ruleLookupKey("Favoured of..."))) {
    return favouredAlignments.map((alignment) => alignment.name);
  }
  const seen = new Set();
  return rules
    .map(favouredAlignmentName)
    .filter((name) => {
      const key = ruleLookupKey(name);
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function favouredSkillsForChoice(choice = "") {
  const alignment = favouredAlignments.find((item) => ruleLookupKey(item.name) === ruleLookupKey(choice));
  return alignment?.skills ?? [];
}

export function hasBribery(team) {
  return /bribery\s+and\s+corruption/i.test(team.team?.meta?.specialRules ?? "");
}

/** What the page says about medical staff, in the reader's language. */
export function teamApothecaryAccess(team) {
  return team.team?.meta?.apothecary || "-";
}

/**
 * Which medical staff this team may hire: "apothecary", "mortuary", "plague".
 *
 * The build derives these from the English vault and puts the same tokens on
 * both locales (step 16.1). Before that, the rule below read the displayed
 * sentence, so a Russian coach — whose page says one Russian word rather than
 * "Available" — could not hire an apothecary at all.
 */
export function teamMedicalAccess(team) {
  const access = team.team?.meta?.apothecaryAccess;
  return Array.isArray(access) ? access : [];
}

export function teamHasFavouredOf(team, alignment) {
  const expected = ruleLookupKey(`Favoured of ${alignment}`);
  return teamSpecialRuleTokens(team).some((rule) => ruleLookupKey(rule) === expected);
}

export function canHireMedicalStaff(team, staff) {
  const access = teamMedicalAccess(team);
  if (staff.access === "apothecary") return access.includes("apothecary");
  if (staff.access === "mortuary") {
    return access.includes("mortuary") || teamHasSpecialRule(team, "Masters of Undeath");
  }
  if (staff.access === "plague") {
    return access.includes("plague") || teamHasFavouredOf(team, "Nurgle");
  }
  return false;
}

export function availableMedicalStaffDefinitions(team) {
  return medicalStaffDefinitions.filter((staff) => canHireMedicalStaff(team, staff));
}
