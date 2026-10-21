/**
 * The sheets of a player's own page and panel (PlayerEdit on a phone, DeskRosterEdit on a desk): the edit, and the
 * undo of his last advancement (Task 11); the fix by hand is fix.mjs's (Task 13).
 *
 * The edit (stage 07d, Task 8) holds his number and his name side by side, a line that says who sees them — or, as they
 * are typed, why the roster would refuse them — and the switch «Team captain», whose line says where the armband goes
 * (PlayerCaptain.html, DeskRosterCaptain.html). On a desk, outside a match, his SPP counters stand under it as the
 * panel's tiles in a match (owner's D3, answer 2: DeskRosterLive.html's D1 block): each press is a step of the queue of
 * its own, as on a phone's open row, which neither «Save» nor «Cancel» touches. «Save» sends the number, the name and
 * the captaincy as one step. Its last line opens his fix by hand (Task 13) in its place.
 *
 * Every sheet here wears the frame `.g-player-sheet` (player-sheets.css: head, body, foot, fields, a switch as a card, the
 * lines of words); what is one sheet's own is styled by its id.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { raceTitleOf } from "../../../data/teams.mjs";
import { playerCurrentCost } from "../../../domain/roster/costs.mjs";
import { editRefusal } from "../../../domain/roster/edits.mjs";
import { undoLastAdvancement } from "../../../domain/roster/progression.mjs";
import { rowsForTeam } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { icon } from "../../../ui/icons.mjs";
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { renderTextField } from "../../../ui/text-field.mjs";
import { renderToggle } from "../../../ui/toggle.mjs";
import { countersMarkup, prepResetWords, sessionMarkup } from "./panel.mjs";
import { gaveWords } from "./player-access.mjs";
import { refusalWordsOf } from "./save.mjs";
import { EDIT_SHEET, PLAYER_FRAME, UNADVANCE_SHEET, footButton } from "./sheets.mjs";

/** What wireToggles reports for «Team captain». */
export const CAPTAIN_TOGGLE = "player-captain";
/** The ids of the edit's two fields, which wire.mjs hears as they are typed. */
export const EDIT_FIELDS = Object.freeze({ number: "player-edit-number", name: "player-edit-name" });
/** The id of the line under the fields, which describes them both. */
const NOTE_ID = "player-edit-note";

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
 * The edit's last line, which opens his fix by hand in its place (fix.mjs; no prototype): the words and a chevron.
 * Closed (`reason`: why the edit is, or that its fields are changed and are saved or cancelled first) it stays in
 * reach, saying why as its title and, pressed, in a message (`data-roster-closed`, K7).
 * @param {import("./model.mjs").PlayerLine} line @param {string} reason
 */
function fixLineMarkup(line, reason) {
  const closed = reason ? ` aria-disabled="true" title="${escapeHtml(reason)}"` : "";
  return `<button type="button" class="g-player-edit__fix" aria-haspopup="dialog"${closed}${dataAttributes({ playerFix: line.key, rosterClosed: Boolean(reason) })}>`
    + `<span class="g-player-edit__fixwords">${escapeHtml(t("teamPlayer.fix.open"))}</span>${icon("chevron", 16)}</button>`;
}

/**
 * His edit (PlayerEdit.html from the bottom on a phone, DeskRosterEdit.html's 480px window on a desk): «position ·
 * race» under the title; the number and the name — the field a refusal names drawn so — and the line that says who
 * sees them, or the refusal as it is typed; «Team captain» with the «C»; on a desk his SPP counters (`sppMarkup`);
 * during a preparation what a save resets (R12), and the last refusal of «Save»; last, the line to his fix by hand
 * (`fixLineMarkup`). «Cancel» and «Save», which waits for a whole, changed form; closed (`reason`), it says why.
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
  const fix = fixLineMarkup(line, reason || (changed ? t("teamPlayer.fix.saveFirst") : ""));
  return renderSheet({
    id: EDIT_SHEET,
    className: PLAYER_FRAME,
    title: t("teamPlayer.edit.title"),
    sub: t("teamPlayer.edit.sub", { position: line.position, race: raceTitleOf(screen.team.baseTeamSlug) }),
    bodyHtml: `${fields}${note}${captain}${sppMarkup(line, screen)}${prep}${alert}${fix}`,
    footStartHtml: renderButton({ label: t("teamPlayer.edit.cancel"), data: { editKeep: true } }),
    footHtml: footButton({ label: t("teamPlayer.edit.save"), kind: "primary", data: { editSave: true }, disabled: !reason && (Boolean(wrong) || !changed), reason }),
  });
}

/**
 * What the undo of his last advancement costs his value: his value now less his value without it, on a copy of him
 * (`undoLastAdvancement`), in thousands; 0 for a player the draft or the race does not hold.
 * @param {import("./model.mjs").PlayerLine} line @param {import("./view.mjs").RosterScreen} screen
 */
function valueLost(line, screen) {
  const stored = screen.draft?.players?.[line.index];
  const row = stored && screen.race ? rowsForTeam(screen.race)[Number(stored.rowIndex)] : null;
  if (!row) return 0;
  const without = structuredClone(stored);
  undoLastAdvancement(without);
  return playerCurrentCost(row, stored) - playerCurrentCost(row, without);
}

/** What becomes of the advancement once undone: a site roll goes back to the player, one at the table or chosen can be taken again, one that does not say what it gave gives its SPP back only. */
function undoneWords(last) {
  const type = t(`teamAdvance.type.${last.type}`);
  if (!last.grants) return t("teamPlayer.undo.bare");
  return last.via === "site" ? t("teamPlayer.undo.site", { type }) : t("teamPlayer.undo.table");
}

/**
 * The god's skills he holds that no advancement of his names (`favoured`): 2.x's, a post-match's finished before the tie,
 * or one added by hand. An undo leaves them; the coach is pointed to the fix by hand for one this advancement brought.
 * @param {import("./model.mjs").PlayerLine} line
 */
function looseFavoured(line) {
  const tied = new Set(line.advancements.map(({ favoured }) => favoured).filter(Boolean));
  return line.skills.filter(({ source, name }) => source === "favoured" && !tied.has(name)).map(({ name }) => name);
}

/**
 * The undo of his last advancement (decision 18; no prototype — PlayerDeadConfirm.html's question and two buttons, the
 * lines of 07c's sale): «Undo the advancement?» over «name · advancement N of 6»; what it gave — the skill or «MA +1»,
 * its type, how it was rolled — the god's skill its D8 brought, which goes with it (Task 10 review), the SPP that come
 * back and what his value loses; what becomes of it (`undoneWords`) and, for one with no god's skill tied, the god's
 * skills no advancement names, which stay (`looseFavoured`); during a preparation what a save resets (R12), and the
 * last refusal. «Keep», and «Undo advancement» — the main button, never the red one: an undo loses nothing an
 * advancement cannot take again; closed (`reason`), it says why.
 *
 * @param {object} props
 * @param {import("./model.mjs").PlayerLine} props.line the player, on the roster
 * @param {import("./view.mjs").RosterScreen} props.screen
 * @param {{index: number, refusal?: string, reason?: string}} props.sheet `index` his last advancement's, as the sheet named it
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#player-unadvance")` opens it
 */
export function unadvanceSheetMarkup({ line, screen, sheet }) {
  const { index, refusal = "", reason = "" } = sheet;
  const last = line.advancements[index];
  const gave = [last.grants ? gaveWords(last) : "", t(`teamAdvance.type.${last.type}`), last.via ? t(`teamPlayer.via.${last.via}`) : ""];
  const lost = valueLost(line, screen);
  const row = (key, value, className = "") => `<div class="g-unadvance__row"><dt class="g-unadvance__key">${escapeHtml(key)}</dt>`
    + `<dd class="${classNames("g-unadvance__value", className)}">${escapeHtml(value)}</dd></div>`;
  const rows = `<dl class="g-unadvance__rows">${row(t("teamPlayer.undo.what"), gave.filter(Boolean).join(" · "))}`
    + `${last.favoured ? row(t("teamPlayer.undo.favoured"), last.favoured) : ""}`
    + `${row(t("teamPlayer.undo.spp"), `+${last.cost}`, "g-unadvance__back")}`
    + `${row(t("teamPlayer.undo.value"), lost ? `−${formatMoney(lost)}` : t("teamRoster.sell.nothing"))}</dl>`;
  const loose = last.favoured ? [] : looseFavoured(line);
  const stay = loose.length ? `<p class="g-unadvance__note">${escapeHtml(t("teamPlayer.undo.favouredLoose", { skills: loose.join(", ") }))}</p>` : "";
  const prep = screen.mode.kind === "prep" ? `<p class="g-player-sheet__prep">${escapeHtml(prepResetWords())}</p>` : "";
  const alert = refusal ? `<p class="g-player-sheet__refusal" role="alert">${escapeHtml(refusal)}</p>` : "";
  return renderSheet({
    id: UNADVANCE_SHEET,
    className: PLAYER_FRAME,
    title: t("teamPlayer.undo.title"),
    sub: t("teamPlayer.undo.sub", { name: line.name, level: index + 1 }),
    bodyHtml: `${rows}<p class="g-unadvance__note">${escapeHtml(undoneWords(last))}</p>${stay}${prep}${alert}`,
    footStartHtml: renderButton({ label: t("teamPlayer.undo.keep"), data: { unadvanceKeep: true } }),
    footHtml: footButton({ label: t("teamPlayer.undo.send"), kind: "primary", data: { unadvanceSend: true }, reason }),
  });
}
