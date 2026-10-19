/**
 * The sheet «Missing the next match» (spec UI §9, StatsMng): the reasons a coach may give, the characteristic a
 * lasting injury lowers, the words of another reason, and one button that says what it still waits for.
 *
 * The reasons are the Casualty Table's that miss a match — the injury's own words and captions (stage 07a) — and
 * another reason, which is the league's or the coach's (decision 10). A Serious or a Lasting Injury does to the
 * player what the post-match does with it (owner's question 1), and the sheet says so before it is done: «Back on the
 * roster» ends the missed match only (decision 2). The words of another reason are counted as the server counts a
 * cause, trimmed (decision 11); a NUL or a broken surrogate, which the database refuses and which would hang the
 * queue, is no reason (K9).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { ABSENCE_NOTE_MAX } from "../../../domain/roster/schema.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderOptionList } from "../../../ui/option-card.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { renderTextField } from "../../../ui/text-field.mjs";
import { MARK_SHEET, MARK_STAT, footButton, statChipsMarkup } from "./sheets.mjs";

/** The id of the field another reason is written in (`#mark-text`), and its name. */
export const MARK_TEXT = "mark-text";

/** The Casualty Table's results that miss the next match, as the injury's sheet names them. */
const INJURY_REASONS = ["miss", "niggling", "lasting"];

/** The injuries whose effect a mark applies, and «Back on the roster» leaves. */
const LASTING_EFFECT = ["niggling", "lasting"];

/**
 * What the coach has chosen in the sheet: a reason's code ("" for none yet), a lasting injury's characteristic, the
 * words of another reason as typed.
 * @typedef {{code: string, stat: string, text: string}} MarkChoice
 */

/**
 * What the roster's jsonb cannot hold: a NUL, or half of a surrogate pair (a pasted fragment of an emoji). The server
 * would answer 500 and the step would head the queue for good (K9), so the sheet takes neither.
 */
const UNSTORABLE = /\u0000|\p{Cs}/u;

/** Another reason's words, trimmed, as the server counts a cause; "" when there are none it would take. */
function noteOf(text) {
  const note = typeof text === "string" ? text.trim() : "";
  return UNSTORABLE.test(note) ? "" : note;
}

/**
 * The mark the sheet's choice makes (what `markSkip` sends), or null while it is not whole: no reason chosen, a
 * lasting injury without its characteristic, another reason without words or with more than the roster keeps.
 *
 * @param {MarkChoice} choice
 * @returns {{code: "miss"|"niggling"} | {code: "lasting", stat: string} | {code: "other", note: string} | null}
 */
export function chosenMark({ code, stat, text }) {
  if (code === "miss" || code === "niggling") return { code };
  if (code === "lasting") return PLAYER_STATS.includes(stat) ? { code, stat } : null;
  if (code !== "other") return null;
  const note = noteOf(text);
  return note && note.length <= ABSENCE_NOTE_MAX ? { code, note } : null;
}

/**
 * What the sheet's button still waits for, in its words (decision 10): a reason, a characteristic, the words of another
 * reason, fewer of them; "" once the mark is whole.
 *
 * @param {MarkChoice} choice
 */
export function markWaits({ code, stat, text }) {
  if (code === "lasting" && !PLAYER_STATS.includes(stat)) return t("teamRoster.mark.chooseStat");
  if (code === "other") {
    const note = noteOf(text);
    if (!note) return t("teamRoster.mark.writeNote");
    return note.length > ABSENCE_NOTE_MAX ? t("teamRoster.mark.tooLong", { max: ABSENCE_NOTE_MAX }) : "";
  }
  return chosenMark({ code, stat, text }) ? "" : t("teamRoster.mark.chooseFirst");
}

/** The reasons as cards: the injuries with what each does, then another reason. */
function reasonOptions() {
  const injuries = INJURY_REASONS.map((code) => ({ value: code, title: t(`teamRoster.injury.${code}`), sub: t(`teamRoster.injuryCaption.${code}`), radio: true }));
  return [...injuries, { value: "other", title: t("teamRoster.mark.other"), sub: t("teamRoster.mark.otherCaption"), radio: true }];
}

/** What the chosen reason asks for under the cards: a lasting injury's characteristic, another reason's words; and an injury's effect, said before it is done. */
function detailMarkup(choice) {
  let detail = "";
  if (choice.code === "lasting") detail = statChipsMarkup({ stat: choice.stat, group: MARK_STAT, label: t("teamRoster.mark.stat") });
  if (choice.code === "other") detail = renderTextField({ id: MARK_TEXT, name: MARK_TEXT, label: t("teamRoster.mark.note"), value: choice.text });
  const effect = LASTING_EFFECT.includes(choice.code) ? `<p class="g-roster__markeffect">${escapeHtml(t("teamRoster.mark.effectsStay"))}</p>` : "";
  return `${detail}${effect}`;
}

/**
 * A missed match of one player who plays it, and why.
 *
 * @param {object} props
 * @param {import("./model.mjs").PlayerLine} props.line the player
 * @param {MarkChoice} props.choice what is chosen in the sheet
 * @param {boolean} [props.busy] a write of the mark is on its way: the button sends no other until it has answered. A
 *   missed match never is (a step of the queue closes the sheet at once); a death, which is no step of it, is (Task 8)
 * @param {string} [props.refusal] why the last press was refused (another tab's coach, the server's rules), "" for none
 * @param {string} [props.reason] why no mark of his can be made just now (`markClosed`), "" when one can
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#roster-mark")` opens it
 */
export function markSheetMarkup({ line, choice, busy = false, refusal = "", reason = "" }) {
  const list = renderOptionList({ label: t("teamRoster.mark.choose"), options: reasonOptions(), selected: choice.code });
  const refused = refusal ? `<p class="g-roster__markrefusal" role="alert">${escapeHtml(refusal)}</p>` : "";
  const waits = markWaits(choice);
  const send = footButton({ label: waits || t("teamRoster.mark.send"), kind: "primary", data: { markSend: true }, disabled: busy || (!reason && Boolean(waits)), reason });
  return renderSheet({
    id: MARK_SHEET,
    title: t("teamRoster.mark.title"),
    sub: t("teamRoster.injury.who", { number: line.number, name: line.name, position: line.position }),
    bodyHtml: `${list}${detailMarkup(choice)}${refused}`,
    footHtml: send,
  });
}
