/**
 * «New team»: its name and its race, in a sheet over the screen it is opened on — from the bottom of a phone
 * (TeamNew) and a window of 760px on a desk (DeskTeamNew). The owner's answer of 2026-10-20 (plan 07d, second owner
 * review, decisions 62–66) makes it the first step of a new team, where stage 06 had a page of its own.
 *
 * It is opened from «New team» of «My teams», «Create a team» of the empty overview, «Change the race or the name»
 * of the builder, and the team switcher, which alone has a way back (`back`: «‹» in a phone's head, «← My teams» in
 * a desk's foot). `#/teams/new` with no build asks for it (`askNewTeamSheet`) and goes on to «My teams», which opens
 * it (`openAskedNewTeamSheet`).
 *
 * What it shows and changes is the build in memory (new-flow.mjs), read with `buildOf()` when it opens and held:
 * a press on a sheet whose build has gone since (the session ended, another coach, the team was made) begins
 * nothing. «Create» takes the sheet away and then begins the build (`startBuild`), so the builder's title can take
 * the focus (a modal dialog keeps it out of reach while it is open), and opens the builder's address unless it is
 * already there. Nothing is written to the server. While it is open a reload asks first, as the builder does, when
 * the build holds a squad.
 *
 * It stands in a host of its own at the end of <body> (`mountSheetHost`), one for the page, wired once: the screens
 * under it patch their own markup, which would take a dialog standing in it away. The cross, the backdrop and Escape
 * close it with the focus back where it was; a link in it, a change of address (one away from the address it was
 * opened on: the router, which hears the same hashchange first, may have just opened it there) and any change of
 * session close it with the screen under it about to be drawn again, or just drawn, whose title then takes the focus.
 */
import { delegate, escapeHtml, focusLost } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { newTeamUrl, refUrl } from "../../core/routes.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { patchWithModal } from "../../components/dialog.mjs";
import { onSessionChange } from "../../data/session.mjs";
import { raceTeamOf } from "../../data/teams.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { wireRadioGroups } from "../../ui/choice.mjs";
import { renderSheet, wireSheets } from "../../ui/sheet.mjs";
import { renderTextField } from "../../ui/text-field.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { mountSheetHost } from "../team/manage/sheet-host.mjs";
import { askBeforeLeaving, buildOf, isCurrentBuild, pickOf, setPick, startBuild } from "./new-flow.mjs";

/** What the sheet is shown by (`#new-team-sheet`). */
export const NEW_TEAM_SHEET_ID = "new-team-sheet";

/** The name and the race are all the sheet asks; its button says which of them is still missing. */
function createLabel(name, raceChosen) {
  if (!name) return t("newTeam.needName");
  if (!raceChosen) return t("newTeam.needRace");
  return t("newTeam.create", { name });
}

/** One radio group of buttons: Tab enters at the chosen race, or at the first when none is, and the arrows move along it. */
function racesMarkup(races, raceSlug) {
  const checked = races.findIndex((race) => race.slug === raceSlug);
  const entry = Math.max(0, checked);
  const items = races.map((race, index) => `<button type="button" class="g-races__item" role="radio" aria-checked="${index === checked}" tabindex="${index === entry ? 0 : -1}"`
    + ` data-race="${escapeHtml(race.slug)}" data-key="race-${escapeHtml(race.slug)}">${escapeHtml(race.title)}</button>`);
  return `<div class="g-races" role="radiogroup" aria-label="${escapeHtml(t("newTeam.race"))}">${items.join("")}</div>`;
}

/**
 * The sheet, closed (`patchWithModal` opens it): TeamNew, DeskTeamNew.
 *
 * @param {object} props
 * @param {string} props.name what the coach typed, as typed (it is trimmed where it is used)
 * @param {string} props.raceSlug the race chosen, or ""
 * @param {{slug: string, title: string}[]} props.races the races to choose from
 * @param {string} props.seasonName the line under the title: the season's name, or "" for the league's
 * @param {boolean} props.resets going on from here to another race would lose a squad that was begun
 * @param {boolean} props.back there is a way back (the switcher's): «‹» in the head, «← My teams» in the foot
 * @param {string} [props.refusal] why the builder's save was refused, when the answer came while the sheet was open, as a sentence
 * @param {string} [props.created] the team the builder's save made while the sheet was open over its build, as a sentence
 * @returns {string}
 */
export function newTeamSheetMarkup({ name, raceSlug, races, seasonName, resets, back, refusal = "", created = "" }) {
  const trimmed = String(name).trim();
  const raceChosen = races.some((race) => race.slug === raceSlug);
  // Keyed: a patch puts them in front of the name and the races, and does not rebuild those around them.
  const alert = refusal ? `<div role="alert" data-key="refusal">${renderCallout({ tone: "danger", title: refusal })}</div>` : "";
  const status = created ? `<div role="status" data-key="created">${renderCallout({ title: created })}</div>` : "";
  const field = renderTextField({ id: "new-team-name", name: "name", label: t("newTeam.name"), placeholder: t("newTeam.namePlaceholder"), value: name, autocomplete: "off" });
  // The group is named by its aria-label; the visible word over it is for the eye alone, or a reader would say it twice.
  const bodyHtml = `${alert}${status}${field}<span class="g-new__label" aria-hidden="true">${escapeHtml(t("newTeam.race"))}</span>${racesMarkup(races, raceSlug)}`
    + `${resets ? `<p class="g-races__resets">${escapeHtml(t("newTeam.raceResets"))}</p>` : ""}`
    + `<a class="g-new__ref" href="${escapeHtml(refUrl("teams"))}">${escapeHtml(t("newTeam.raceRules"))}</a>`;
  const footHtml = renderButton({ kind: "primary", label: createLabel(trimmed, raceChosen), disabled: !trimmed || !raceChosen, data: { newTeamCreate: true } });
  // The way back is the head's «‹» on a phone and the foot's button on a desk; new.css shows each where it belongs.
  const footStartHtml = back ? renderButton({ label: t("teams.title"), icon: "back", data: { newTeamBack: true } }) : "";
  return renderSheet({ id: NEW_TEAM_SHEET_ID, title: t("newTeam.title"), sub: seasonName || t("shell.league"), canGoBack: back, className: "g-new-sheet", bodyHtml, footHtml, footStartHtml });
}

/** The host, made and wired at the first opening. @type {Element|null} */
let host = null;

/**
 * The sheet while it is open: the build it shows, the control it was opened from, its way back, the address and the
 * coach it was opened on, and the refusal or the success of a save it says (`sayInNewTeamSheet`,
 * `sayCreatedInNewTeamSheet`). Null while it is closed.
 * @type {{build: import("./new-flow.mjs").Build, opener: Element|null, back: (() => void)|null, openedAt: string, coach: object, refusal: string, created: string}|null}
 */
let shown = null;

/** `#/teams/new` asked for the sheet over «My teams». */
let asked = false;

/** The build the sheet shows, while it is still the coach's. */
const liveBuild = () => (shown && isCurrentBuild(shown.build) ? shown.build : null);

const guardLeaving = (event) => askBeforeLeaving(event, liveBuild());

/** Patch the sheet to match the build: the focus and the caret stay where they are. A host that left the page shows nothing. */
function draw() {
  if (!shown || !host.isConnected) return;
  const { name, raceSlug, resets } = pickOf();
  const seasonName = state.season.data?.season?.name ?? "";
  patchWithModal(host, newTeamSheetMarkup({ name, raceSlug, races: state.data?.teams ?? [], seasonName, resets, back: Boolean(shown.back), refusal: shown.refusal, created: shown.created }), `#${NEW_TEAM_SHEET_ID}`);
}

/**
 * The sheet goes. With `focus` (the cross, the backdrop, Escape) the focus goes back where it was opened from, or to
 * the page's title when that was drawn away meanwhile or a width that crossed 900px hid it (`focusLost`: the phone
 * header's team block on a desk); without, the next thing on the screen takes it.
 */
function close({ focus = false } = {}) {
  if (!shown) return;
  const { opener } = shown;
  shown = null;
  globalThis.removeEventListener?.("beforeunload", guardLeaving);
  patchWithModal(host, "");
  if (focus) (opener && !focusLost(opener) ? opener : view.querySelector("h1"))?.focus();
}

/**
 * The sheet goes with the screen under it (the address or the session changed). A screen drawn while it stood over the
 * page could not take the focus (a modal dialog makes the page inert), and the dialog gives it back to where it was
 * opened from, which may be gone or hidden: then the screen's title takes it, never the body.
 */
function closeUnder() {
  close();
  if (focusLost(document.activeElement)) view.querySelector("h1")?.focus();
}

/** A press on the sheet, made on the build it shows: one that has gone since has nothing to change, and the sheet goes. */
function press(act) {
  if (!shown) return;
  if (liveBuild()) act();
  else close({ focus: true });
}

/**
 * «Create»: the build of this race with this name, and the builder. The sheet goes first, then the build begins, so
 * that the builder (drawn as the build begins, or by its address) can give its title the focus. A second press finds
 * no sheet. A name of blanks or no race begins nothing, the button says what is missing.
 */
function create() {
  const { name, raceSlug } = pickOf();
  if (!name.trim() || !raceTeamOf(raceSlug)) return;
  close();
  if (startBuild() && location.hash !== newTeamUrl()) location.hash = newTeamUrl();
}

/** The keyboard starts in the name, after what it holds: a name kept from before is changed at its end, not typed in front of. */
function focusName() {
  const input = host.querySelector("#new-team-name");
  if (!input) return;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

/** «‹» and «← My teams»: the sheet goes, and the screen it was opened from takes over (the switcher). */
function goBack() {
  const back = shown?.back;
  close();
  back?.();
}

/** A click the browser takes to another tab or window, a download, or not to a link at all: a modifier, or a button but the first. */
const opensElsewhere = (event) => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.button ?? 0) !== 0;

/** Everything the sheet listens to, once for the page: the host outlives every sheet shown in it. */
function wire(root) {
  delegate(root, "input", "#new-team-name", (event, input) => press(() => {
    setPick({ name: input.value });
    draw();
  }));
  // The radio group has already moved the selection on the page; the build follows it, and the button with it.
  wireRadioGroups(root, { group: ".g-races", item: "[data-race]", attribute: "data-race", onChange: (slug) => press(() => {
    setPick({ raceSlug: slug });
    draw();
  }) });
  delegate(root, "click", "[data-new-team-create]", () => press(create));
  delegate(root, "click", "[data-new-team-back]", () => goBack());
  // A link followed here: the sheet goes with the page it stood over. One opened elsewhere (a new tab or window, a
  // download, the middle button) leaves the page as it is, and the sheet open on it.
  delegate(root, "click", "a", (event) => {
    if (!opensElsewhere(event)) close();
  });
  wireSheets(root, { onClose: () => close({ focus: true }), onBack: () => goBack() });
  // The router (src/app.js) hears the change first and may have drawn the next screen under the sheet, or opened the
  // sheet there: the address it was opened on leaves it. A capture listener would not be heard first: on `window`,
  // which is no node, a browser calls its listeners in the order they were added (Chrome, checked in 07d's final wave).
  globalThis.addEventListener?.("hashchange", () => {
    if (shown && location.hash !== shown.openedAt) closeUnder();
  });
  // Any change of session: the build may be gone with it, and the screen under the sheet is drawn again, by the router,
  // which hears it first. A sheet opened while the change is told (the router drew «My teams» for the same coach) was
  // opened for the coach told of.
  onSessionChange(() => {
    if (shown && state.auth.currentUser !== shown.coach) closeUnder();
  });
}

/**
 * Show the sheet over the screen, the build's name and race in it, the focus in the name.
 *
 * @param {Element|null} opener what it was opened from: the focus goes back there when it is closed
 * @param {{back?: (() => void)|null}} [options] the way back, when there is one (the switcher's)
 */
export function openNewTeamSheet(opener, { back = null } = {}) {
  // While a session is read again nobody is signed in: a build asked for now would be an empty one in place of the coach's.
  if (!state.auth.currentUser) return;
  const build = buildOf();
  if (!host) {
    host = mountSheetHost("new-team");
    wire(host);
  } else if (!host.isConnected) {
    document.body.append(host);
  }
  if (!shown) globalThis.addEventListener?.("beforeunload", guardLeaving);
  shown = { build, opener, back, openedAt: location.hash, coach: state.auth.currentUser, refusal: "", created: "" };
  draw();
  focusName();
  // A page opened on this screen may not have read the season yet: its name stands under the title once it is in.
  void loadSeason().then(draw);
}

/**
 * The builder's save of `build` refused while the sheet is open over it (over the builder, or over the screen the
 * coach went on to): the page under a modal sheet is inert, and a toast or the builder's line there is neither seen
 * nor heard. The sheet says it, at the top of its body, until it closes.
 * @param {import("./new-flow.mjs").Build} build @param {string} refusal as a sentence
 * @returns {boolean} whether the sheet said it: when it did, nothing else is to
 */
export function sayInNewTeamSheet(build, refusal) {
  if (!shown || shown.build !== build || !liveBuild()) return false;
  shown.refusal = refusal;
  draw();
  // A body taller than the window scrolls: the alert is at its top, out of view when the coach is among the races.
  host.querySelector('[role="alert"]')?.scrollIntoView?.({ block: "nearest" });
  return true;
}

/**
 * The builder's save of `build` went through while the sheet is open over it, over another screen: that build is done
 * (`endBuild`), and a press on it would begin nothing. The sheet takes the coach's next build, empty, and says the
 * team is made at the top of its body, as a refusal is said: the page under a modal sheet is inert.
 * @param {import("./new-flow.mjs").Build} build @param {string} created as a sentence
 * @returns {boolean} whether the sheet said it: when it did, nothing else is to
 */
export function sayCreatedInNewTeamSheet(build, created) {
  if (!shown || shown.build !== build || !state.auth.currentUser) return false;
  Object.assign(shown, { build: buildOf(), refusal: "", created });
  draw();
  // A patch leaves a focused field as typed: the name is the done build's, and the next one has none.
  const input = host.querySelector("#new-team-name");
  if (input) input.value = "";
  host.querySelector('[role="status"]')?.scrollIntoView?.({ block: "nearest" });
  return true;
}

/** `#/teams/new` with no build: «My teams», where the coach is sent, opens the sheet (decision 63). */
export function askNewTeamSheet() {
  asked = true;
}

/**
 * Open the sheet if `#/teams/new` asked for it, and forget that it did.
 * @param {Element|null} opener
 * @returns {boolean} whether it opened
 */
export function openAskedNewTeamSheet(opener) {
  if (!asked) return false;
  asked = false;
  openNewTeamSheet(opener);
  return shown !== null;
}
