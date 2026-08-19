/**
 * Roster players: normalisation, migration and the view model the screens read.
 *
 * The saved_teams.roster JSONB blob still holds three generations of shape —
 * `roster` counts plus `playerEdits`, the fixed-length `slots` array, and the
 * current `players` array. playersFromLegacyRoster() understands all three and
 * ensureDraftPlayers() rewrites a draft into the current one. Until the
 * one-off database migration in task 4 of the refactor plan runs, this happens
 * on every read.
 */
import { advancementRanks, advancementTypeLabels, sppCounterDefinitions } from "../league-rules.mjs";
import { countToNumber, makeRosterPlayerId, playerKey, rosterMax, rowsForTeam } from "./values.mjs";

export function normalizePurchasedStaff(roster = {}) {
  const purchased = roster.purchasedStaff ?? {};
  return {
    teamRerolls: countToNumber(purchased.teamRerolls ?? roster.teamRerolls ?? 0),
    startingRerolls: countToNumber(purchased.startingRerolls ?? 0),
    bribes: countToNumber(purchased.bribes ?? 0),
    assistantCoaches: countToNumber(purchased.assistantCoaches ?? 0),
    cheerleaders: countToNumber(purchased.cheerleaders ?? 0),
    apothecary: countToNumber(purchased.apothecary ?? 0),
    mortuaryAssistant: countToNumber(purchased.mortuaryAssistant ?? 0),
    plagueDoctor: countToNumber(purchased.plagueDoctor ?? 0),
  };
}

export function makeRosterPlayer(row, rowIndex, copyIndex = 0, options = {}) {
  return {
    id: makeRosterPlayerId(),
    rowIndex,
    number: String(options.number ?? copyIndex + 1),
    name: `${row.position} ${copyIndex + 1}`,
    statMods: {},
    extraSkills: [],
    favouredSkills: [],
    skipNextGame: false,
    niglingInjury: false,
    isCaptain: false,
    extendedContracts: 0,
    spp: {},
    advancements: [],
    purchased: Boolean(options.purchased),
  };
}

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

export function normalizePlayerAdvancements(advancements = []) {
  const source = Array.isArray(advancements) ? advancements : [];
  return source
    .map((advancement) => {
      const type = typeof advancement === "string" ? advancement : advancement?.type;
      return Object.hasOwn(advancementTypeLabels, type) ? { type } : null;
    })
    .filter(Boolean)
    .slice(0, advancementRanks.length);
}

export function playersFromLegacyRoster(team, draft) {
  const rows = rowsForTeam(team);
  if (Array.isArray(draft.players) && draft.players.length) {
    return draft.players.map((player, index) => normalizeRosterPlayer(player, rows, index)).filter(Boolean);
  }

  if (Array.isArray(draft.slots) && draft.slots.length) {
    return draft.slots.map((slot, index) => normalizeRosterPlayer(slot, rows, index)).filter(Boolean);
  }

  const players = [];
  rows.forEach((row, rowIndex) => {
    const count = Math.max(0, Number(draft.roster?.[rowIndex] ?? 0));
    for (let copyIndex = 0; copyIndex < count; copyIndex += 1) {
      const edit = draft.playerEdits?.[playerKey(rowIndex, copyIndex)] ?? {};
      players.push(normalizeRosterPlayer({
        id: makeRosterPlayerId(),
        rowIndex,
        number: edit.number ?? players.length + 1,
        name: edit.name || `${row.position} ${copyIndex + 1}`,
        statMods: edit.statMods ?? {},
        extraSkills: edit.extraSkills ?? [],
        favouredSkills: edit.favouredSkills ?? [],
        skipNextGame: Boolean(edit.skipNextGame),
        niglingInjury: Boolean(edit.niglingInjury),
        isCaptain: Boolean(edit.isCaptain ?? edit.captain),
        extendedContracts: countToNumber(edit.extendedContracts),
        spp: normalizeSppCounters(edit.spp),
        advancements: normalizePlayerAdvancements(edit.advancements),
      }, rows, copyIndex));
    }
  });
  return players.filter(Boolean);
}

export function ensureDraftPlayers(team, draft) {
  draft.players = playersFromLegacyRoster(team, draft);
  delete draft.slots;
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

export function slotPlayerFromDraft(team, slot, slotIndex) {
  if (!slot) return null;
  const row = rowsForTeam(team)[slot.rowIndex];
  if (!row) return null;
  return {
    key: `slot-${slotIndex}`,
    slotIndex,
    rowIndex: slot.rowIndex,
    copyIndex: slotIndex,
    row,
    name: slot.name || row.position,
    stats: {
      ma: Number(row.ma) + (slot.statMods?.ma ?? 0),
      st: Number(row.st) + (slot.statMods?.st ?? 0),
      ag: row.ag,
      pa: row.pa,
      ar: row.ar,
    },
    statMods: slot.statMods ?? {},
    extraSkills: slot.extraSkills ?? [],
    skipNextGame: Boolean(slot.skipNextGame),
  };
}

export function selectedRosterPlayers(team, draft) {
  if (Array.isArray(draft.players)) {
    return draft.players
      .map((player, index) => rosterPlayerView(team, player, index))
      .filter(Boolean);
  }
  if (Array.isArray(draft.slots)) {
    return draft.slots
      .map((slot, slotIndex) => slotPlayerFromDraft(team, slot, slotIndex))
      .filter(Boolean);
  }
  return rowsForTeam(team).flatMap((row, rowIndex) => {
    const count = draft.roster[rowIndex] ?? 0;
    return Array.from({ length: count }, (_item, copyIndex) => {
      const key = playerKey(rowIndex, copyIndex);
      const edit = draft.playerEdits[key] ?? {};
      return {
        key,
        rowIndex,
        copyIndex,
        row,
        name: edit.name ?? `${row.position} ${copyIndex + 1}`,
        stats: {
          ma: Number(row.ma) + (edit.statMods?.ma ?? 0),
          st: Number(row.st) + (edit.statMods?.st ?? 0),
          ag: row.ag,
          pa: row.pa,
          ar: row.ar,
        },
        statMods: edit.statMods ?? {},
        extraSkills: edit.extraSkills ?? [],
        skipNextGame: Boolean(edit.skipNextGame),
        isCaptain: Boolean(edit.isCaptain ?? edit.captain),
        extendedContracts: countToNumber(edit.extendedContracts),
      };
    });
  });
}
