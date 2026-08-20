/**
 * The saved-team draft shape: reading it out of a saved team, writing it
 * back, and the empty starting point for a brand-new one.
 *
 * Mechanically moved out of src/app.js. `normalizeSavedRoster` alone is
 * called from my-teams, the admin screens, the public player profile and
 * saved-roster — genuinely everywhere a saved team gets displayed — so this
 * has to be importable without pulling in a screen.
 *
 * Design spec section 6 flags this as one of **four** places that describe
 * the draft shape (the others are `state.builder`'s initial value in
 * core/state.mjs, and builder.mjs/saved-roster.mjs' own read sites).
 * Collapsing that to one is task 3.2 (`schema.mjs`), not this move.
 */
import { state } from "../core/state.mjs";
import { countToNumber } from "../domain/roster/values.mjs";
import { normalizePurchasedStaff } from "../domain/roster/players.mjs";

export function emptyBuilderState(team = null) {
  return {
    editingTeamId: "",
    teamSlug: team?.slug ?? "",
    teamName: team?.title ?? "",
    favouredChoice: "",
    logoData: "",
    players: [],
    roster: {},
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

export function resetBuilderForTeam(team) {
  state.builder = emptyBuilderState(team);
}

export function builderPayload(team) {
  return {
    editingTeamId: state.builder.editingTeamId,
    teamSlug: team.slug,
    teamName: state.builder.teamName || team.title,
    selectedLeague: state.builder.selectedLeague || "",
    favouredChoice: state.builder.favouredChoice || "",
    logoData: state.builder.logoData || "",
    players: state.builder.players,
    roster: state.builder.roster,
    teamRerolls: state.builder.teamRerolls,
    startingRerolls: state.builder.startingRerolls,
    bribes: state.builder.bribes,
    dedicatedFans: state.builder.dedicatedFans,
    assistantCoaches: state.builder.assistantCoaches,
    cheerleaders: state.builder.cheerleaders,
    apothecary: state.builder.apothecary,
    mortuaryAssistant: state.builder.mortuaryAssistant,
    plagueDoctor: state.builder.plagueDoctor,
    purchasedStaff: state.builder.purchasedStaff ?? {},
    treasury: state.builder.treasury,
    coachesSafe: state.builder.coachesSafe,
  };
}

export function normalizeSavedRoster(savedTeam) {
  const roster = savedTeam.roster ?? {};
  const draft = {
    ...emptyBuilderState(),
    editingTeamId: savedTeam.id,
    teamSlug: savedTeam.baseTeamSlug || roster.teamSlug || "",
    teamName: savedTeam.name || roster.teamName || "",
    selectedLeague: String(roster.selectedLeague ?? ""),
    favouredChoice: String(roster.favouredChoice ?? ""),
    logoData: savedTeam.logoData || roster.logoData || "",
    players: Array.isArray(roster.players) ? roster.players : [],
    roster: roster.roster ?? {},
    teamRerolls: countToNumber(roster.teamRerolls ?? 0),
    startingRerolls: countToNumber(roster.startingRerolls ?? roster.rerolls ?? 0),
    bribes: countToNumber(roster.bribes ?? 0),
    dedicatedFans: countToNumber(roster.dedicatedFans ?? 0),
    assistantCoaches: countToNumber(roster.assistantCoaches ?? 0),
    cheerleaders: countToNumber(roster.cheerleaders ?? 0),
    apothecary: countToNumber(roster.apothecary ?? 0),
    mortuaryAssistant: countToNumber(roster.mortuaryAssistant ?? 0),
    plagueDoctor: countToNumber(roster.plagueDoctor ?? 0),
    purchasedStaff: normalizePurchasedStaff(roster),
    treasury: countToNumber(roster.treasury ?? 0),
    coachesSafe: countToNumber(roster.coachesSafe ?? 0),
  };
  savedTeam.roster = draft;
  savedTeam.name = draft.teamName;
  savedTeam.logoData = draft.logoData;
  savedTeam.baseTeamSlug = draft.teamSlug;
  return draft;
}

export function updateSavedRosterFields(savedTeam, draft) {
  savedTeam.name = draft.teamName;
  savedTeam.logoData = draft.logoData;
  savedTeam.baseTeamSlug = draft.teamSlug;
  savedTeam.roster = draft;
}
