/**
 * The windows of a coach's page (screens/admin/coach.mjs; stage 12, decisions 15 and 16).
 *
 * - «Temporary password» (DeskAdminReset.html): a window of 520px from 901px, a sheet from the bottom of a phone. Whose
 *   password it is and that every session of the coach has ended, the password once with «Copy», the note on how to
 *   hand it over, «Done». The password lives in this module's sheet while the window shows it, and nowhere else:
 *   closing the window by any way drops it, and nothing writes it to the address or to the browser's storage.
 * - «New team» for the coach: its name and its race, chosen as «Coach with a team» chooses it (coach-new.mjs: five
 *   races and «Other…», which opens every race of the league). The team is born in its build (`draft`) with the
 *   build's 600k and nobody hired (`POST /api/admin/users/:id/teams`); its roster is put together on its pages. «Create»
 *   says what the form still wants and, pressed, puts the admin there; complete, it sends once (data/admin.mjs: one
 *   write at a time, another tab's token sends nothing). An answer that does not come back is never sent again: the
 *   coach is read again, and a team of that name that was not his before is the one made. A refusal is said in the
 *   window, the form as it was.
 *
 * The windows stand in a host of their own at the end of <body> (team/manage/sheet-host.mjs): the coach's page under
 * them patches its own markup, which would take a dialog standing in it away. They go with that page
 * (`closeCoachSheets`). Closed, the focus goes back to the button that opened the window, or, when a redraw took it
 * away, to the page's button of the same kind.
 */
import { delegate, escapeHtml, focusLost } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { view } from "../../core/view.mjs";
import { toast } from "../../components/toast.mjs";
import { adminRequest } from "../../data/admin.mjs";
import { raceTeamOf } from "../../data/teams.mjs";
import { startingBudget } from "../../domain/league-rules.mjs";
import { newBuild } from "../../domain/roster/build.mjs";
import { rosterForStorage } from "../../domain/roster/schema.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { wireRadioGroups } from "../../ui/choice.mjs";
import { patchWithModal, renderSheet, wireSheets } from "../../ui/sheet.mjs";
import { renderTextField } from "../../ui/text-field.mjs";
import { mountSheetHost } from "../team/manage/sheet-host.mjs";
import { copyPassword, passwordMarkup, raceChoiceMarkup, tell, windowSaidMarkup } from "./coach-new.mjs";
import { isAdminViewer } from "./frame.mjs";

/** What the reset's window is shown by (`#admin-reset`). */
export const RESET_SHEET_ID = "admin-reset";

/** What the window of a new team is shown by (`#admin-team-new`). */
export const TEAM_NEW_SHEET_ID = "admin-team-new";

/** What «Create» says while the form wants something, by what it wants. Literal keys, so the dictionary test finds them. */
const NEED = {
  name: () => t("administration.need.teamName"),
  race: () => t("administration.need.race"),
};

/** Where a press of «Create» puts the admin, by what the form wants. */
const PLACE = {
  name: "#team-new-name",
  race: '[data-coach-race][tabindex="0"]',
};

/** What the new team's form still wants, the first thing in its order, or "" when it is complete. */
function wantOf(form) {
  if (!form.name.trim()) return "name";
  return raceTeamOf(form.race) ? "" : "race";
}

/**
 * What is sent for a new team (decision 16, owner: an admin's team starts with 600k): the race, the name, and the
 * build of that race as a new team's builder starts it — the first league and favoured alignment, nobody hired — with
 * the build's whole budget as the treasury.
 * @param {object} race the race's page @param {string} name
 */
const teamBody = (race, name) => ({
  name, baseTeamSlug: race.slug, roster: rosterForStorage({ ...newBuild(race, { name }), treasury: startingBudget }),
});

/** The host, made and wired at the first opening. @type {Element|null} */
let host = null;

/**
 * The window while it is open, and null while it is not. A reset's: whose password, the password, what the last
 * «Copy» did. A new team's: the coach, the form as typed, whether every race is shown, a write on its way, what was
 * said of the last one, and what the page gives it (its teams, a read of the coach, the news of a team made).
 * @type {null|{kind: "reset", id: string, opener: Element|null, refocus: string, login: string, password: string, copied: ""|"done"|"manual"}
 *   |{kind: "team", id: string, opener: Element|null, refocus: string, coach: {id: string, login: string}, form: {name: string, race: string},
 *     all: boolean, busy: boolean, refusal: string, teams: Function, reread: Function, onCreated: Function}}
 */
let shown = null;

/** DeskAdminReset: the password once, the note, «Done». */
function resetMarkup(sheet) {
  return renderSheet({
    id: RESET_SHEET_ID, title: t("administration.password"), sub: t("administration.resetLine", { login: sheet.login }), className: "g-coachreset",
    bodyHtml: passwordMarkup(sheet, { labelledBy: `${RESET_SHEET_ID}-title` }) + `<p class="g-admin__note">${escapeHtml(t("administration.resetNote"))}</p>`,
    footHtml: renderButton({ label: t("administration.done"), kind: "primary", data: { sheetClose: "", resetDone: "" } }),
  });
}

/** «Create»: what the form still wants, closed and said on a press; «Creating…» while it is sent. */
function createMarkup(sheet) {
  if (sheet.busy) return renderButton({ label: t("administration.coachNew.creating"), kind: "primary", busy: true, data: { teamCreate: "" } });
  const want = wantOf(sheet.form);
  if (!want) return renderButton({ label: t("administration.coachNew.create"), kind: "primary", data: { teamCreate: "" } });
  return `<button type="button" class="g-btn g-btn--primary" aria-disabled="true" data-team-create="">${escapeHtml(NEED[want]())}</button>`;
}

/** The new team's window: the name, the race, the rule of the build; «Cancel» and «Create». */
function teamMarkup(sheet) {
  const { form, busy } = sheet;
  // Always on the page, so a screen reader hears what is put in it.
  const alert = `<div class="g-coachnew__alert" role="alert">${sheet.refusal ? renderCallout({ tone: "danger", title: sheet.refusal }) : ""}</div>`;
  const name = renderTextField({ id: "team-new-name", name: "name", label: t("administration.coachNew.teamName"), value: form.name, autocomplete: "off", readonly: busy });
  return renderSheet({
    id: TEAM_NEW_SHEET_ID, title: t("administration.teamNew.title"), wide: true, className: "g-coachnew",
    sub: t("administration.teamNew.sub", { login: sheet.coach.login, budget: formatMoney(startingBudget) }),
    bodyHtml: windowSaidMarkup(sheet.said) + alert + name + raceChoiceMarkup({ selected: form.race, all: sheet.all, busy })
      + `<p class="g-admin__note">${escapeHtml(t("administration.teamNew.note", { budget: formatMoney(startingBudget) }))}</p>`,
    footHtml: renderButton({ label: t("common.cancel"), data: { sheetClose: "" } }) + createMarkup(sheet),
  });
}

/** Patch the window to match the sheet: the focus and the caret stay where they are. A host that left the page shows nothing. */
function draw() {
  if (!shown || !host?.isConnected) return;
  patchWithModal(host, shown.kind === "reset" ? resetMarkup(shown) : teamMarkup(shown), `#${shown.id}`);
}

/**
 * The window goes, and what it held with it — a password above all. With `focus` (the cross, the backdrop, Escape,
 * «Cancel», «Done», a team made) the focus goes back to the button that opened it, or to the page's button of its kind
 * when a redraw took that one away, or to the page's title.
 * @param {{focus?: boolean}} [options]
 */
export function closeCoachSheets({ focus = false } = {}) {
  if (!shown) return;
  const { opener, refocus } = shown;
  shown = null;
  if (host?.isConnected) patchWithModal(host, "");
  if (!focus) return;
  const back = opener && !focusLost(opener) ? opener : view.querySelector(refocus);
  (back && !focusLost(back) ? back : view.querySelector("h1"))?.focus();
}

/** Mount the host at the first opening, or put it back on a page that lost it. */
function mount() {
  if (!host) {
    host = mountSheetHost("admin-coach");
    wire(host);
  } else if (!host.isConnected) {
    document.body.append(host);
  }
}

/** A change of the new team's form takes back what was said about the last try. */
function change(changes) {
  if (shown?.kind !== "team" || shown.busy) return;
  Object.assign(shown.form, changes);
  shown.refusal = "";
  draw();
}

/** «Other…»: every race in place of the five, the focus on the one chosen or the first. */
function showAll() {
  if (shown?.kind !== "team" || shown.busy) return;
  shown.all = true;
  draw();
  host.querySelector('[data-coach-race][tabindex="0"]')?.focus();
}

/** Said where it can be: in the window that is still the one it was said for, or in a toast when that has gone. */
function say(sheet, refusal) {
  Object.assign(sheet, { busy: false, refusal });
  if (shown === sheet) draw();
  else if (refusal) toast(refusal, { tone: "error" });
}

/** The team is made: the window goes, the focus back on «+ Team», and the page says so. */
function made(sheet, name) {
  sheet.busy = false;
  if (shown === sheet) closeCoachSheets({ focus: true });
  sheet.onCreated(name);
}

/**
 * «Create»: what the form still wants is said, and the admin is put there; a complete form is sent once, and the
 * coach is read again. A second press while it is on its way finds the sheet busy and sends nothing. An answer that
 * did not come back (or came without the team) is never sent again: in the coach as read again, a team of that name
 * that was not his before the press is the one made; none is, and the window says it may have been.
 */
async function create() {
  const sheet = shown;
  if (sheet?.kind !== "team" || sheet.busy) return;
  const want = wantOf(sheet.form);
  if (want) {
    host.querySelector(PLACE[want])?.focus();
    tell(sheet, NEED[want](), () => shown === sheet, draw);
    return;
  }
  const name = sheet.form.name.trim();
  const before = new Set(sheet.teams().map((team) => team.id));
  Object.assign(sheet, { busy: true, refusal: "" });
  draw();
  const outcome = await adminRequest(`/api/admin/users/${encodeURIComponent(sheet.coach.id)}/teams`, { method: "POST", body: teamBody(raceTeamOf(sheet.form.race), name) });
  if (outcome.ignored) {
    // Another write of the administration is still on its way: nothing was sent, the button is free again, and the
    // window says why.
    say(sheet, outcome.refusal);
    return;
  }
  if (outcome.answer?.team) {
    await sheet.reread();
    made(sheet, outcome.answer.team.name || name);
    return;
  }
  if (outcome.answer || outcome.unknown) {
    const answer = await sheet.reread();
    const found = answer?.teams?.find((team) => !before.has(team.id) && team.name === name);
    if (found) made(sheet, found.name);
    else say(sheet, t("administration.mayHaveWritten"));
    return;
  }
  say(sheet, outcome.refusal);
}

/** «Copy»: the clipboard, or the password selected and the words to copy it by hand. */
async function copy() {
  const sheet = shown;
  if (sheet?.kind !== "reset") return;
  const copied = await copyPassword(sheet.password);
  if (shown !== sheet) return;
  sheet.copied = copied;
  draw();
  if (copied === "manual") globalThis.getSelection?.()?.selectAllChildren?.(host.querySelector(".g-coachnew__password"));
}

/** Everything the windows listen to, once for the page: the host outlives every window shown in it. */
function wire(root) {
  delegate(root, "input", "#team-new-name", (event, input) => change({ name: input.value }));
  // There is no submit button in the form's sense: Enter in the name is «Create», as the button is.
  delegate(root, "keydown", "#team-new-name", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    void create();
  });
  delegate(root, "click", "[data-team-create]", () => void create());
  // The radio group has already moved the selection on the page; the sheet follows it, and the button with it.
  wireRadioGroups(root, { group: ".g-coachnew__races", item: "[data-coach-race]", attribute: "data-coach-race", onChange: (slug) => change({ race: slug }) });
  delegate(root, "click", "[data-coach-races-all]", () => showAll());
  delegate(root, "click", "[data-coach-copy]", () => void copy());
  wireSheets(root, { onClose: () => closeCoachSheets({ focus: true }) });
}

/**
 * Show the temporary password of a reset, once, «Copy» in focus. Only an admin opens it.
 * @param {Element|null} opener «Reset password…»: the focus goes back there when it is closed
 * @param {{login: string, password: string}} reset
 */
export function openReset(opener, { login, password }) {
  if (!isAdminViewer()) return;
  mount();
  shown = { kind: "reset", id: RESET_SHEET_ID, opener, refocus: "[data-acoach-reset]", login, password, copied: "" };
  draw();
  host.querySelector("[data-coach-copy]")?.focus();
}

/**
 * Show the window of a new team for the coach, the form empty and the name in focus. Only an admin opens it.
 * @param {Element|null} opener «+ Team»: the focus goes back there when it is closed
 * @param {object} options
 * @param {{id: string, login: string}} options.coach whose team it is
 * @param {() => object[]} options.teams the coach's teams the page holds just now: which were his before a press
 * @param {Function} options.reread the coach read again, and drawn, after a write: it answers what was read (`{teams}`, or why not)
 * @param {(name: string) => void} options.onCreated the team made, for the page to say
 */
export function openTeamNew(opener, { coach, teams, reread, onCreated }) {
  if (!isAdminViewer()) return;
  mount();
  shown = {
    kind: "team", id: TEAM_NEW_SHEET_ID, opener, refocus: "[data-acoach-team-new]", coach, form: { name: "", race: "" }, all: false, busy: false,
    refusal: "", teams, reread, onCreated,
  };
  draw();
  host.querySelector("#team-new-name")?.focus();
}
