/**
 * The sheet «Missing the next match» (spec UI §9, StatsMng): the reasons a coach may give, the characteristic a
 * lasting injury lowers, the words of another reason or the cause of a death, and one button that says what it still
 * waits for.
 *
 * The reasons are the Casualty Table's that miss a match — the injury's own words and captions (stage 07a) — then
 * «Dead», which takes the player off the roster with its cause (Task 8: no step of the queue, but stage 03's write of
 * the fallen, marks.mjs), and another reason, which is the league's or the coach's (decision 10). A Serious or a
 * Lasting Injury does to the player what the post-match does with it (owner's question 1), and the sheet says so
 * before it is done: «Back on the roster» ends the missed match only (decision 2). The words of another reason are
 * counted as the server counts a cause, trimmed (decision 11); a NUL or a broken surrogate, which the database refuses
 * and which would hang the queue, is no reason (K9). A cause of death is counted the same way, and the server refuses a
 * NUL in it too.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { ABSENCE_NOTE_MAX } from "../../../domain/roster/schema.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderOptionList } from "../../../ui/option-card.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { renderTextField } from "../../../ui/text-field.mjs";
import { MARK_SHEET, MARK_STAT, footButton, statChipsMarkup } from "./sheets.mjs";

/** The id of the field another reason or a death's cause is written in (`#mark-text`), and its name (K17). */
export const MARK_TEXT = "mark-text";

/** The Casualty Table's results that miss the next match, as the injury's sheet names them. */
const INJURY_REASONS = ["miss", "niggling", "lasting"];

/** The injuries whose effect a mark applies, and «Back on the roster» leaves. */
const LASTING_EFFECT = ["niggling", "lasting"];

/** The longest cause of death the server keeps (`MAX_CAUSE_LENGTH`, server/routes/team-fallen.mjs), trimmed. */
const CAUSE_MAX = 500;

/** The reasons whose words are written in the field, and how many of them each keeps. */
const WORDS_MAX = Object.freeze({ dead: CAUSE_MAX, other: ABSENCE_NOTE_MAX });

/**
 * What the coach has chosen in the sheet: a reason's code ("" for none yet), a lasting injury's characteristic, the
 * words of another reason or the cause of a death as typed (one field: the words stay when the reason changes).
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
 * The mark the sheet's choice makes (what `markSkip` sends, or for a death what `markDeath` does), or null while it is
 * not whole: no reason chosen, a lasting injury without its characteristic, another reason or a death without words
 * or with more than the server keeps.
 *
 * @param {MarkChoice} choice
 * @returns {{code: "miss"|"niggling"} | {code: "lasting", stat: string} | {code: "other", note: string} | {code: "dead", cause: string} | null}
 */
export function chosenMark({ code, stat, text }) {
  if (code === "miss" || code === "niggling") return { code };
  if (code === "lasting") return PLAYER_STATS.includes(stat) ? { code, stat } : null;
  if (!Object.hasOwn(WORDS_MAX, code)) return null;
  const words = noteOf(text);
  if (!words || words.length > WORDS_MAX[code]) return null;
  return code === "dead" ? { code, cause: words } : { code, note: words };
}

/**
 * What the sheet's button still waits for, in its words (decision 10): a reason, a characteristic, the words of another
 * reason or the cause of a death, fewer of them; "" once the mark is whole.
 *
 * @param {MarkChoice} choice
 */
export function markWaits({ code, stat, text }) {
  if (code === "lasting" && !PLAYER_STATS.includes(stat)) return t("teamRoster.mark.chooseStat");
  if (Object.hasOwn(WORDS_MAX, code)) {
    const words = noteOf(text);
    if (!words) return code === "dead" ? t("teamRoster.mark.writeCause") : t("teamRoster.mark.writeNote");
    return words.length > WORDS_MAX[code] ? t("teamRoster.mark.tooLong", { max: WORDS_MAX[code] }) : "";
  }
  return chosenMark({ code, stat, text }) ? "" : t("teamRoster.mark.chooseFirst");
}

/** The reasons as cards: the injuries with what each does, a death, then another reason. */
function reasonOptions() {
  const injuries = INJURY_REASONS.map((code) => ({ value: code, title: t(`teamRoster.injury.${code}`), sub: t(`teamRoster.injuryCaption.${code}`), radio: true }));
  return [
    ...injuries,
    { value: "dead", title: t("teamRoster.injury.dead"), sub: t("teamRoster.mark.deadCaption"), radio: true },
    { value: "other", title: t("teamRoster.mark.other"), sub: t("teamRoster.mark.otherCaption"), radio: true },
  ];
}

/**
 * What the chosen reason asks for under the cards: a lasting injury's characteristic, another reason's words, a
 * death's cause (not typed over while the death is on its way); and an injury's effect, said before it is done.
 */
function detailMarkup(choice, busy) {
  let detail = "";
  if (choice.code === "lasting") detail = statChipsMarkup({ stat: choice.stat, group: MARK_STAT, label: t("teamRoster.mark.stat"), plain: true });
  if (choice.code === "other") detail = renderTextField({ id: MARK_TEXT, name: MARK_TEXT, label: t("teamRoster.mark.note"), value: choice.text });
  if (choice.code === "dead") {
    const help = t("teamRoster.mark.causeHelp");
    detail = renderTextField({ id: MARK_TEXT, name: MARK_TEXT, label: t("teamRoster.fallen.cause"), help, value: choice.text, readonly: busy });
  }
  const effect = LASTING_EFFECT.includes(choice.code) ? `<p class="g-roster__markeffect">${escapeHtml(t("teamRoster.mark.effectsStay"))}</p>` : "";
  return `${detail}${effect}`;
}

/**
 * A missed match of one player who plays it, and why; or his death and its cause.
 *
 * @param {object} props
 * @param {import("./model.mjs").PlayerLine} props.line the player
 * @param {MarkChoice} props.choice what is chosen in the sheet
 * @param {boolean} [props.busy] a write of the mark is on its way: the button sends no other until it has answered. A
 *   missed match never is (a step of the queue closes the sheet at once); a death, which is no step of it, is
 * @param {string} [props.refusal] why the last press was refused (another tab's coach, the server's rules), "" for none
 * @param {string} [props.reason] why no mark of his can be made just now (`markClosed`; for a death, with the steps of the
 *   queue that wait: K6), "" when one can
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#roster-mark")` opens it
 */
export function markSheetMarkup({ line, choice, busy = false, refusal = "", reason = "" }) {
  const list = renderOptionList({ label: t("teamRoster.mark.choose"), options: reasonOptions(), selected: choice.code });
  const refused = refusal ? `<p class="g-roster__markrefusal" role="alert">${escapeHtml(refusal)}</p>` : "";
  const waits = markWaits(choice);
  const label = waits || (choice.code === "dead" ? t("teamRoster.mark.sendDead") : t("teamRoster.mark.send"));
  const send = footButton({ label, kind: "primary", data: { markSend: true }, busy, disabled: !reason && Boolean(waits), reason });
  return renderSheet({
    id: MARK_SHEET,
    title: t("teamRoster.mark.title"),
    sub: t("teamRoster.injury.who", { number: line.number, name: line.name, position: line.position }),
    bodyHtml: `${list}${detailMarkup(choice, busy)}${refused}`,
    footHtml: send,
  });
}
