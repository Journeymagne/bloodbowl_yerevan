/**
 * What of a player's own may be written just now, and the controls of his advancements that say so (stage 07d): why
 * his edit is closed (`editClosed`), why an advancement is (`advanceClosed`, and the line under «Advance»), why the undo
 * of his last one and a god's bonus are (`undoClosed`); «Advance» closed, and «Undo the last: …». The desk's panel
 * (panel.mjs) and the phone's profile (profile.mjs) both draw them, and the sheets ask them at a press: a module of
 * their own (K25, Task 11 fix round 1), which imports neither, so that the panel keeps its room and no two of the
 * roster's modules import each other.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { ADVANCEMENT_BLOCKED } from "../../../domain/roster/progression.mjs";
import { icon } from "../../../ui/icons.mjs";
import { dataAttributes } from "../../../ui/markup.mjs";

/**
 * Why his number, name and captaincy cannot be edited just now, "" when they can: a match is on (R8), the screen's
 * lock, no id to name him by.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{mode: {kind: string}, lock: string}} screen
 */
export function editClosed(line, screen) {
  if (screen.mode.kind === "match") return t("teamPlayer.edit.closed");
  if (screen.lock) return screen.lock;
  return line.id ? "" : t("teamPlayer.noId");
}

/**
 * Why no advancement can be taken just now, "" when one can (decision 21): a match is on (R8), the screen's lock, no id
 * to name him by; then, unless `spp` is false, every type refused — at the last rank every advancement is taken, else the
 * SPP the cheapest one is short of. Offers not known yet (no Skill Table, K28) close nothing, nor do a dead line's none:
 * its `maxed` is «nothing to offer», never «every advancement is taken».
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{mode: {kind: string}, lock: string}} screen
 * @param {{spp?: boolean}} [options]
 */
export function advanceClosed(line, screen, { spp = true } = {}) {
  if (screen.mode.kind === "match") return t("teamRoster.afterPost");
  if (screen.lock) return screen.lock;
  if (!line.id) return t("teamPlayer.noId");
  const offers = spp ? line.offers?.offers ?? [] : [];
  if (!offers.length || offers.some(({ refusal }) => !refusal)) return "";
  if (line.offers.maxed) return t("teamRoster.maxed");
  const short = offers.filter(({ refusal }) => refusal.code === ADVANCEMENT_BLOCKED.NOT_ENOUGH_SPP).map(({ refusal }) => refusal.params.missing);
  return short.length ? t("teamPlayer.short", { spp: Math.min(...short) }) : t("teamAdvance.refusal.NO_SKILL_LEFT");
}

/** Why his last advancement cannot be undone, nor a god's bonus added, just now: `advanceClosed` without his SPP (Task 11). */
export const undoClosed = (line, screen) => advanceClosed(line, screen, { spp: false });

/**
 * The line under «Advance»: why it is closed (`advanceClosed`), or what the cheapest type open costs — in the panel's
 * words or (`profile`) the profile's; nothing while the offers are not known (K28).
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{mode: {kind: string}, lock: string}} screen
 * @param {{profile?: boolean}} [options]
 */
export function advanceHintOf(line, screen, { profile = false } = {}) {
  const closed = advanceClosed(line, screen);
  const open = (line.offers?.offers ?? []).filter(({ refusal }) => !refusal);
  if (closed || !open.length) return closed;
  return t(profile ? "teamPlayer.cheapest" : "teamRoster.cheapest", { spp: Math.min(...open.map(({ cost }) => cost)) });
}

/**
 * A control of his advancements that is closed just now: in reach, saying why as its title and, pressed, in a message
 * (`data-roster-closed`, wire.mjs), in the look of a closed control (roster.css) — panel.mjs's `closedMarkup`, with
 * what leads the words (`leadHtml`, markup of `icon()`).
 */
function closedButton({ className, label, reason, data, leadHtml = "" }) {
  return `<button type="button" class="${className} g-roster__closed" aria-disabled="true" title="${escapeHtml(reason)}"`
    + `${dataAttributes({ rosterClosed: true, ...data })}>${leadHtml}${escapeHtml(label)}</button>`;
}

/**
 * «Advance» closed: the arrow and the words, in reach, saying why; the words and what names the button (`data`) are the
 * caller's — the profile's «Advancement» keeps its player, so the focus finds it again.
 * @param {{reason: string, label?: string, data?: Record<string, string|boolean>}} props
 */
export function closedAdvanceMarkup({ reason, label = t("teamRoster.advance"), data = {} }) {
  return closedButton({ className: "g-btn g-btn--primary g-btn--block", label, reason, data, leadHtml: icon("up", 20) });
}

/** What an advancement gave, in a word: its skill, «MA +1», or — one that does not say — its type. */
export const gaveWords = ({ type, grants }) => (grants?.stat ? t("teamPlayer.undo.statPlus", { stat: t(`stats.${grants.stat}`) }) : grants?.skill ?? t(`teamAdvance.type.${type}`));

/**
 * «Undo the last: Frenzy» under «Advance» and its line (decision 18) — the panel's `g-roster__undo` — or under the
 * profile's «Advancement» (`className`: `g-profile__undo`): quiet, for an advancement can be taken again; it asks first
 * (player-sheets.mjs). Closed (`undoClosed`) it says why, keeping his key, so the focus finds it when the sheet closes.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{mode: {kind: string}, lock: string}} screen
 * @param {string} [className]
 */
export function undoLastMarkup(line, screen, className = "g-roster__undo") {
  const last = line.advancements.at(-1);
  if (!last) return "";
  const [label, reason, data] = [t("teamPlayer.undo.open", { what: gaveWords(last) }), undoClosed(line, screen), { playerUnadvance: line.key }];
  if (reason) return closedButton({ className, label, reason, data });
  return `<button type="button" class="${className}" aria-haspopup="dialog"${dataAttributes(data)}>${escapeHtml(label)}</button>`;
}
