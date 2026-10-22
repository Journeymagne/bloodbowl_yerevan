/**
 * The admin's sheet on a team's roster (stage 12, decision 24; the master plan's «Additions → 12»): a fallen player added
 * afterwards — one taken off the roster before 3.0, with no post-match to record his death. The server keeps him as a
 * whole record of a player of the race (`POST /api/admin/teams/:id/fallen`, spec 3.0 §3.3), so an undo of it puts him on
 * the roster like any other; the roster itself is not written.
 *
 * Its fields are the server's: his name, his position among the race's, his number (none, or 1–99), the cause, the match
 * of the team he died in (none, or one of the confirmed matches the admin's read of the team names), and the day (today
 * unless said, never one to come). What is missing or wrong is said in the sheet before anything is sent
 * (`fallenRequest`), and so is the server's refusal. No prototype draws it: its fields are DeskAdminTeamEdit.html's —
 * 48px, the label over them — in a sheet. The block that opens it and sends it is screens/team/roster/admin-block.mjs.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { rowsForTeam } from "../../domain/roster/values.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderSheet } from "../../ui/sheet.mjs";
import { renderTextField } from "../../ui/text-field.mjs";
import { ADMIN_FALLEN_SHEET } from "../team/roster/sheets.mjs";

/** The ids of the sheet's fields, by the field of the form each one types. */
export const FALLEN_FIELDS = Object.freeze({
  name: "admin-fallen-name", position: "admin-fallen-position", number: "admin-fallen-number", cause: "admin-fallen-cause", match: "admin-fallen-match",
  date: "admin-fallen-date",
});

/** A shirt number as typed: one or two digits, blanks around them allowed. */
const NUMBER = /^\s*\d{1,2}\s*$/;

/** A day as `<input type="date">` writes it (`2026-10-12`), on the admin's own calendar. */
export function localDay(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, at) => String(part).padStart(at ? 2 : 4, "0")).join("-");
}

/**
 * The sheet's form as it opens: nothing typed, the race's first position, no match, today.
 * @param {object} race the team's race (the reference's page)
 * @returns {{name: string, position: string, number: string, cause: string, match: string, date: string}}
 */
export function fallenFormOf(race) {
  return { name: "", position: rowsForTeam(race)[0]?.position ?? "", number: "", cause: "", match: "", date: localDay() };
}

/**
 * The request the form makes, or why it makes none, in the order the fields stand: no name, no cause, a number that is
 * no number of a shirt, a day to come. A number left empty is none; no match is `null`; the day as typed.
 * @param {ReturnType<typeof fallenFormOf>} form
 * @returns {{body: {player: {name: string, position: string, number?: number}, cause: string, pairingId: string|null, diedAt: string|null}} | {refusal: string}}
 */
export function fallenRequest(form) {
  const [name, cause, number] = [form.name, form.cause, form.number].map((value) => String(value ?? "").trim());
  if (!name) return { refusal: t("adminTeam.fallen.needName") };
  if (!cause) return { refusal: t("adminTeam.fallen.needCause") };
  if (number && !(NUMBER.test(number) && Number(number) >= 1)) return { refusal: t("adminTeam.fallen.badNumber") };
  if (form.date && form.date > localDay()) return { refusal: t("adminTeam.fallen.badDate") };
  const player = { name, position: form.position, ...(number ? { number: Number(number) } : {}) };
  return { body: { player, cause, pairingId: form.match || null, diedAt: form.date || null } };
}

/** An option, chosen when it is the value. */
const option = (value, label, chosen) => `<option value="${escapeHtml(value)}"${chosen ? " selected" : ""}>${escapeHtml(label)}</option>`;

/** A match of the team as its option says it: «Round 6 · against Silverbrook Rangers · 2–1», «Friendly · against …»; the score is the team's first. */
function matchLabel({ kind, roundNumber, opponent, score }) {
  const words = kind === "league" && roundNumber ? t("adminTeam.fallen.league", { round: roundNumber, opponent }) : t("adminTeam.fallen.friendly", { opponent });
  return Array.isArray(score) && score.length === 2 ? `${words} · ${score[0]}–${score[1]}` : words;
}

/** A labelled native control of the sheet, as a text field is drawn (text-field.css): its label over it, 48px. */
const controlMarkup = (id, label, controlHtml) => `<div class="g-field"><label class="g-field__label" for="${id}">${escapeHtml(label)}</label>${controlHtml}</div>`;

/**
 * The sheet: the six fields, the last refusal under them, and «Add», busy while the record is on its way.
 * @param {object} props
 * @param {object} props.race the team's race
 * @param {object[]} props.matches the team's matches as the admin's read lists them (`{id, kind, roundNumber, opponent, score}`)
 * @param {string} props.team the team's name, under the title
 * @param {{form: ReturnType<typeof fallenFormOf>, busy: boolean, refusal: string}} props.sheet what is typed and where it stands
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#admin-fallen")` opens it
 */
export function adminFallenSheetMarkup({ race, matches, team, sheet }) {
  const { form, busy, refusal } = sheet;
  const field = (key, label, extra = {}) => renderTextField({ id: FALLEN_FIELDS[key], name: key, label, value: form[key], autocomplete: "off", readonly: busy, ...extra });
  const positions = rowsForTeam(race).map(({ position }) => option(position, position, position === form.position)).join("");
  const games = [option("", t("adminTeam.fallen.noMatch"), !form.match), ...matches.map((match) => option(match.id, matchLabel(match), match.id === form.match))].join("");
  const select = (key, optionsHtml) => `<select class="g-field__input g-adminteam__control" id="${FALLEN_FIELDS[key]}" name="${key}">${optionsHtml}</select>`;
  const day = `<input class="g-field__input g-adminteam__control" id="${FALLEN_FIELDS.date}" name="date" type="date" value="${escapeHtml(form.date)}" max="${localDay()}"${busy ? " readonly" : ""}>`;
  const fields = [
    field("name", t("adminTeam.fallen.name")),
    controlMarkup(FALLEN_FIELDS.position, t("adminTeam.fallen.position"), select("position", positions)),
    field("number", t("adminTeam.fallen.number"), { inputmode: "numeric" }),
    field("cause", t("adminTeam.fallen.cause")),
    controlMarkup(FALLEN_FIELDS.match, t("adminTeam.fallen.match"), select("match", games)),
    controlMarkup(FALLEN_FIELDS.date, t("adminTeam.fallen.date"), day),
  ];
  const refused = refusal ? `<p class="g-adminteam__refusal" role="alert">${escapeHtml(refusal)}</p>` : "";
  return renderSheet({
    id: ADMIN_FALLEN_SHEET,
    title: t("adminTeam.fallen.sheetTitle"),
    sub: team,
    bodyHtml: `<div class="g-adminteam__form">${fields.join("")}${refused}</div>`,
    footHtml: renderButton({ label: t("adminTeam.fallen.send"), kind: "primary", busy, data: { adminFallenSend: true } }),
  });
}
