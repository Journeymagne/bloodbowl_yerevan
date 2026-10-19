/**
 * The sheets of a player's own page and panel (PlayerEdit on a phone, DeskRosterEdit on a desk): the edit, and the
 * undo of his last advancement (Task 11); the fix by hand is fix.mjs's (Task 13).
 *
 * The edit (stage 07d, Task 8) holds his number and his name side by side, a line that says who sees them — or, as they
 * are typed, why the roster would refuse them — and the switch «Team captain», whose line says where the armband goes
 * (PlayerCaptain.html, DeskRosterCaptain.html). On a desk, outside a match, his SPP counters stand under it as the
 * panel's tiles in a match (owner's D3, answer 2: DeskRosterLive.html's D1 block): each press is a step of the queue of
 * its own, as on a phone's open row, which neither «Save» nor «Cancel» touches. «Save» sends the number, the name and
 * the captaincy as one step.
 *
 * Every sheet here wears the frame `.g-player-sheet` (player-sheets.css: head, body, foot, fields, a switch as a card, the
 * lines of words); what is one sheet's own is styled by its id.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { raceTitleOf } from "../../../data/teams.mjs";
import { editRefusal } from "../../../domain/roster/edits.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { classNames } from "../../../ui/markup.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { renderTextField } from "../../../ui/text-field.mjs";
import { renderToggle } from "../../../ui/toggle.mjs";
import { countersMarkup, prepResetWords, sessionMarkup } from "./panel.mjs";
import { refusalWordsOf } from "./save.mjs";
import { EDIT_SHEET, footButton } from "./sheets.mjs";

/** What wireToggles reports for «Team captain». */
export const CAPTAIN_TOGGLE = "player-captain";
/** The ids of the edit's two fields, which wire.mjs hears as they are typed. */
export const EDIT_FIELDS = Object.freeze({ number: "player-edit-number", name: "player-edit-name" });
/** The id of the line under the fields, which describes them both. */
const NOTE_ID = "player-edit-note";
/** The frame every sheet of a player's wears (player-sheets.css). */
const FRAME = "g-player-sheet";

/**
 * The edit's form as it stands: why the roster would refuse it (`editRefusal` on the draft: the name first, then the
 * number), and whether it changes anything at all — the number by its value (03 is 3), the name without the blanks at
 * its ends, as the roster would store them, and the armband.
 *
 * @param {object} draft the queue's draft, as the screen draws it
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{number: string, name: string, captain: boolean}} form
 * @returns {{refusal: null | {code: string, params: object}, changed: boolean}}
 */
export function editCheck(draft, line, form) {
  const refusal = editRefusal(draft, line.id, form);
  const number = Number(String(form.number).trim()) !== Number(line.number);
  return { refusal, changed: number || String(form.name).trim() !== line.name || Boolean(form.captain) !== line.captain };
}

/** The «C» before the switch's words, as a captain's badge wears it. */
const captainMarkMarkup = () => `<span class="g-player-edit__c" aria-hidden="true">${escapeHtml(t("ui.badge.captainMark"))}</span>`;

/**
 * The line under «Team captain» (PlayerCaptain.html, DeskRosterCaptain.html), by the captain now — another player of the
 * roster who wears the armband: on, it passes from that captain, or it is worn already; off, who wears it, or that the
 * team has no captain.
 *
 * @param {import("./model.mjs").PlayerLine} line @param {import("./model.mjs").PlayerLine[]} lines the roster's
 * @param {boolean} on
 */
function captainWords(line, lines, on) {
  const other = lines.find((item) => item.captain && item.key !== line.key && !item.fallen);
  if (on) return other ? t("teamPlayer.edit.captainMoves", { name: other.name }) : t("teamPlayer.edit.captainSelf");
  return other ? t("teamPlayer.edit.captainNow", { name: other.name }) : t("teamPlayer.edit.captainNone");
}

/**
 * A desk's SPP counters in the edit, outside a match (owner's D3, answer 2): «SPP · manual edit» with what the edits
 * have moved his SPP since the screen opened, the tiles three by three as the panel's in a match (D1), and that each
 * press is saved at once. A phone's are its open row's: none here.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 */
function sppMarkup(line, screen) {
  if (screen.phone || screen.mode.kind === "match") return "";
  return `<section class="g-player-edit__spp"><div class="g-roster__sppline"><h3 class="g-player-edit__spptitle">${escapeHtml(t("teamPlayer.edit.spp"))}</h3>`
    + `${sessionMarkup(line, screen)}</div>${countersMarkup(line, screen, { desk: true })}`
    + `<p class="g-player-edit__sppnote">${escapeHtml(t("teamPlayer.edit.sppNote"))}</p></section>`;
}

/**
 * His edit (PlayerEdit.html from the bottom on a phone, DeskRosterEdit.html's 480px window on a desk): «position ·
 * race» under the title; the number and the name — the field a refusal names drawn so — and the line that says who
 * sees them, or the refusal as it is typed; «Team captain» with the «C»; on a desk his SPP counters (`sppMarkup`);
 * during a preparation what a save resets (R12), and the last refusal of «Save». «Cancel» and «Save», which waits for
 * a whole, changed form; closed (`reason`), it says why.
 *
 * @param {object} props
 * @param {import("./model.mjs").PlayerLine} props.line the player, on the roster
 * @param {import("./model.mjs").PlayerLine[]} props.lines the roster's lines: who wears the armband now
 * @param {import("./view.mjs").RosterScreen} props.screen
 * @param {{form: {number: string, name: string, captain: boolean}, refusal?: string, reason?: string}} props.sheet
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#player-edit")` opens it
 */
export function editSheetMarkup({ line, lines, screen, sheet }) {
  const { form, refusal = "", reason = "" } = sheet;
  const { refusal: wrong, changed } = editCheck(screen.draft, line, form);
  const named = wrong ? (wrong.code === "NAME_EMPTY" ? "name" : "number") : "";
  const fields = `<div class="g-player-edit__fields">${renderTextField({
    id: EDIT_FIELDS.number, name: "number", label: t("teamPlayer.edit.number"), type: "text", inputmode: "numeric", value: form.number,
    invalid: named === "number", describedBy: NOTE_ID,
  })}${renderTextField({ id: EDIT_FIELDS.name, name: "name", label: t("teamPlayer.edit.name"), value: form.name, invalid: named === "name", autocomplete: "off", describedBy: NOTE_ID })}</div>`;
  const words = wrong ? refusalWordsOf("teamPlayer", wrong) : t("teamPlayer.edit.note");
  const note = `<p class="${classNames("g-player-edit__note", wrong && "g-player-edit__note--bad")}" id="${NOTE_ID}" role="status">${escapeHtml(words)}</p>`;
  const captain = renderToggle({
    key: CAPTAIN_TOGGLE, label: t("teamPlayer.edit.captain"), caption: captainWords(line, lines, form.captain), checked: form.captain, leadHtml: captainMarkMarkup(),
  });
  const prep = screen.mode.kind === "prep" ? `<p class="g-player-sheet__prep">${escapeHtml(prepResetWords())}</p>` : "";
  const alert = refusal ? `<p class="g-player-sheet__refusal" role="alert">${escapeHtml(refusal)}</p>` : "";
  return renderSheet({
    id: EDIT_SHEET,
    className: FRAME,
    title: t("teamPlayer.edit.title"),
    sub: t("teamPlayer.edit.sub", { position: line.position, race: raceTitleOf(screen.team.baseTeamSlug) }),
    bodyHtml: `${fields}${note}${captain}${sppMarkup(line, screen)}${prep}${alert}`,
    footStartHtml: renderButton({ label: t("teamPlayer.edit.cancel"), data: { editKeep: true } }),
    footHtml: footButton({ label: t("teamPlayer.edit.save"), kind: "primary", data: { editSave: true }, disabled: !reason && (Boolean(wrong) || !changed), reason }),
  });
}
