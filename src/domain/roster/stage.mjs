/**
 * Which re-roll a team may still buy, by where it is in its life.
 *
 * The rule is in content/Gata/Rules/3. Team Management.md: a Team Reroll "is not
 * doubled during team drafting, but it is doubled if purchased during the
 * season". The builder keeps that as two counters with two prices — Starting
 * rerolls at 60k and Team rerolls at 120k (`builderStaffCosts`) — so the rule
 * becomes a lock on each counter: Starting rerolls grow only while the team is
 * a `draft`, Team rerolls only once it is `active`. Every other counter grows in
 * both stages.
 *
 * Only growth is refused. Lowering a counter is the coach taking a purchase
 * back, and a team that is already over the line (a re-roll bought before the
 * stages existed) stays editable.
 *
 * Pure: the server calls it on the stored roster and the new one.
 */
import { normalizeDraft } from "./schema.mjs";

/** The stages migration 009 allows in `saved_teams.stage`. */
export const TEAM_STAGES = Object.freeze(["draft", "active"]);

// The one stage each locked counter may grow in; every other counter grows in both.
const ONLY_IN = Object.freeze({ startingRerolls: "draft", teamRerolls: "active" });

/**
 * May this counter grow in this stage? A stage nobody knows buys neither kind
 * of re-roll: refusing is the safe answer when the rule cannot be read.
 */
export function canBuy(stage, key) {
  if (!Object.hasOwn(ONLY_IN, key)) return true;
  return stage === ONLY_IN[key];
}

/**
 * Every locked counter that grew between two rosters, one violation per key.
 * Both sides are read through normalizeDraft, so a roster stored under the
 * first builder's name `rerolls` is compared as `startingRerolls`.
 *
 * @returns {Array<{code: "STAGE_PURCHASE_LOCKED", params: {key: string, stage: string}}>}
 */
export function stageViolations(before, after, stage) {
  const was = normalizeDraft(before);
  const now = normalizeDraft(after);
  return Object.keys(ONLY_IN)
    .filter((key) => now[key] > was[key] && !canBuy(stage, key))
    .map((key) => ({ code: "STAGE_PURCHASE_LOCKED", params: { key, stage } }));
}
