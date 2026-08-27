/**
 * The saved-team draft: reading one out of a saved team, writing it back, and
 * the empty starting point for a brand-new one.
 *
 * The shape itself lives in domain/roster/schema.mjs (step 3.2). What is left
 * here is the part that is about a *saved team* rather than about a draft: the
 * team's own name, slug and logo are stored in their own columns as well as in
 * the roster blob, and the columns win.
 *
 * `normalizeSavedRoster` alone is called from my-teams, the admin screens, the
 * public player profile and saved-roster — genuinely everywhere a saved team
 * gets displayed — so this has to be importable without pulling in a screen.
 */
import { state } from "../core/state.mjs";
import { createDraft, draftPayload, normalizeDraft } from "../domain/roster/schema.mjs";

export function emptyBuilderState(team = null) {
  return createDraft(team);
}

export function resetBuilderForTeam(team) {
  state.builder = createDraft(team);
}

export function builderPayload(team) {
  return {
    ...draftPayload(state.builder),
    teamSlug: team.slug,
    teamName: state.builder.teamName || team.title,
  };
}

export function normalizeSavedRoster(savedTeam) {
  const roster = savedTeam.roster ?? {};
  const draft = normalizeDraft(roster);
  // The columns are the truth for these three: an admin renaming a team writes
  // the column, and the blob it was saved with still says the old name.
  draft.editingTeamId = savedTeam.id;
  draft.teamSlug = savedTeam.baseTeamSlug || roster.teamSlug || "";
  draft.teamName = savedTeam.name || roster.teamName || "";
  draft.logoData = savedTeam.logoData || roster.logoData || "";
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
