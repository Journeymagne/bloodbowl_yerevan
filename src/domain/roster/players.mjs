/**
 * Roster players: normalisation and the view model the screens read.
 *
 * A roster is an array of players. The two earlier shapes this app used to
 * accept — `roster` counts plus `playerEdits`, and the fixed-length `slots`
 * array — are no longer supported: every saved team has been in the current
 * shape for a while, so reading them cost a migration pass on every single
 * read for nothing. `scripts/check-roster-shapes.mjs` verifies that against a
 * live database before this is deployed.
 */
import { advancementRanks, advancementStatCosts, advancementTypeLabels, sppCounterDefinitions } from "../league-rules.mjs";
import { countToNumber, rosterMax, rowsForTeam } from "./values.mjs";
import { createPlayer, normalizePurchasedStaff } from "./schema.mjs";

export function normalizeExtraSkill(skill) {
  if (!skill) return null;
  if (typeof skill === "string") return { name: skill, access: "primary" };
  if (typeof skill === "object" && skill.name) {
    return {
      name: String(skill.name),
      access: skill.access === "secondary" ? "secondary" : "primary",
    };
  }
  return null;
}

export function normalizePlayerExtraSkills(row, skills = []) {
  const seen = new Set(row.skills ?? []);
  return skills
    .map(normalizeExtraSkill)
    .filter(Boolean)
    .map((skill) => ({ ...skill, name: String(skill.name).trim() }))
    .filter((skill) => {
      if (!skill.name || seen.has(skill.name)) return false;
      seen.add(skill.name);
      return true;
    });
}

export function normalizeFavouredSkill(skill) {
  if (!skill) return null;
  if (typeof skill === "string") return { name: skill, access: "favoured" };
  if (typeof skill === "object" && skill.name) {
    return {
      name: String(skill.name),
      access: "favoured",
    };
  }
  return null;
}

export function normalizePlayerFavouredSkills(row, skills = []) {
  const seen = new Set(row.skills ?? []);
  return skills
    .map(normalizeFavouredSkill)
    .filter(Boolean)
    .map((skill) => ({ ...skill, name: String(skill.name).trim() }))
    .filter((skill) => {
      if (!skill.name || seen.has(skill.name)) return false;
      seen.add(skill.name);
      return true;
    });
}

export function normalizeRosterPlayer(player, rows, fallbackIndex = 0) {
  if (!player || typeof player !== "object") return null;
  const rowIndex = Number(player.rowIndex);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) return null;
  const row = rows[rowIndex];
  return {
    id: String(player.id || makeRosterPlayerId()),
    rowIndex,
    number: String(player.number ?? fallbackIndex + 1),
    name: String(player.name || `${row.position} ${fallbackIndex + 1}`),
    statMods: { ...(player.statMods ?? {}) },
    extraSkills: normalizePlayerExtraSkills(row, player.extraSkills ?? []),
    favouredSkills: normalizePlayerFavouredSkills(row, player.favouredSkills ?? []),
    skipNextGame: Boolean(player.skipNextGame),
    niglingInjury: Boolean(player.niglingInjury),
    isCaptain: Boolean(player.isCaptain ?? player.captain),
    extendedContracts: countToNumber(player.extendedContracts),
    spp: normalizeSppCounters(player.spp),
    advancements: normalizePlayerAdvancements(player.advancements),
    purchased: Boolean(player.purchased),
  };
}

export function normalizeSppCounters(spp = {}) {
  return Object.fromEntries(sppCounterDefinitions.map(([key]) => [key, Math.max(0, countToNumber(spp?.[key]))]));
}

/**
 * An advancement is a type plus, optionally, the thing it granted.
 *
 * `grants` is what links spending SPP to actually getting something —
 * `{ skill: "Block" }` or `{ stat: "ma" }`. It is optional because every
 * advancement saved before the link existed has none; those stay readable and
 * simply record that SPP was spent. See domain/roster/progression.mjs for the
 * rules on which grant each type may carry.
 */
export function normalizePlayerAdvancements(advancements = []) {
  const source = Array.isArray(advancements) ? advancements : [];
  return source
    .map((advancement) => {
      const type = typeof advancement === "string" ? advancement : advancement?.type;
      if (!Object.hasOwn(advancementTypeLabels, type)) return null;
      const grants = normalizeAdvancementGrant(advancement?.grants);
      return grants ? { type, grants } : { type };
    })
    .filter(Boolean)
    .slice(0, advancementRanks.length);
}

/** A grant is one skill or one stat, never both, never neither. */
function normalizeAdvancementGrant(grants) {
  if (!grants || typeof grants !== "object") return null;
  const skill = typeof grants.skill === "string" ? grants.skill.trim() : "";
  const stat = typeof grants.stat === "string" ? grants.stat.trim().toLowerCase() : "";
  if (skill && !stat) return { skill };
  if (stat && !skill && Object.hasOwn(advancementStatCosts, stat)) return { stat };
  return null;
}

/** Every player in the draft, normalised. */
export function normalizeDraftPlayers(team, draft) {
  const rows = rowsForTeam(team);
  return (Array.isArray(draft.players) ? draft.players : [])
    .map((player, index) => normalizeRosterPlayer(player, rows, index))
    .filter(Boolean);
}

export function ensureDraftPlayers(team, draft) {
  draft.players = normalizeDraftPlayers(team, draft);
  syncRosterCountsFromPlayers(draft);
  return draft.players;
}

export function syncRosterCountsFromPlayers(draft) {
  const counts = {};
  (draft.players ?? []).forEach((player) => {
    counts[player.rowIndex] = (counts[player.rowIndex] ?? 0) + 1;
  });
  draft.roster = counts;
}

export function rowCountInPlayers(draft, rowIndex) {
  return (draft.players ?? []).filter((player) => player.rowIndex === rowIndex).length;
}

export function canAddRowToDraft(row, rowIndex, draft, enforceMaximum = true) {
  if (!enforceMaximum) return true;
  return rowCountInPlayers(draft, rowIndex) < rosterMax(row.qty);
}

export function rosterPlayerView(team, player, index = 0) {
  const row = rowsForTeam(team)[player.rowIndex];
  if (!row) return null;
  return {
    ...player,
    key: player.id,
    index,
    row,
    rowIndex: player.rowIndex,
    copyIndex: index,
    number: String(player.number ?? index + 1),
    name: player.name || `${row.position} ${index + 1}`,
    statMods: player.statMods ?? {},
    extraSkills: normalizePlayerExtraSkills(row, player.extraSkills ?? []),
    favouredSkills: normalizePlayerFavouredSkills(row, player.favouredSkills ?? []),
    skipNextGame: Boolean(player.skipNextGame),
    niglingInjury: Boolean(player.niglingInjury),
    isCaptain: Boolean(player.isCaptain ?? player.captain),
    extendedContracts: countToNumber(player.extendedContracts),
    spp: normalizeSppCounters(player.spp),
    advancements: normalizePlayerAdvancements(player.advancements),
  };
}

export function baseSkillsForPlayer(row) {
  return (row.skills ?? []).map((name) => ({ name, access: "base" }));
}

export function skillNamesForPlayer(row, player) {
  const seen = new Set();
  return [
    ...baseSkillsForPlayer(row),
    ...normalizePlayerExtraSkills(row, player.extraSkills ?? []),
    ...normalizePlayerFavouredSkills(row, player.favouredSkills ?? []),
    ...(player.isCaptain ? [{ name: "Pro", access: "captain" }] : []),
  ]
    .map((skill) => skill.name)
    .filter((name) => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
}

export function setRosterCaptain(draft, playerId, isCaptain = true) {
  if (!Array.isArray(draft.players)) return;
  draft.players.forEach((player) => {
    player.isCaptain = Boolean(isCaptain && player.id === playerId);
  });
}


export function selectedRosterPlayers(team, draft) {
  return (Array.isArray(draft.players) ? draft.players : [])
    .map((player, index) => rosterPlayerView(team, player, index))
    .filter(Boolean);
}


/**
 * The shape of a player and of purchased staff moved to schema.mjs in step 3.2,
 * which is now the only place either is described. The names stay: every caller
 * uses them, and renaming was not what the step was for.
 */
export { normalizePurchasedStaff };
export const makeRosterPlayer = createPlayer;
