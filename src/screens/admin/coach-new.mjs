/**
 * «Coach with a team» (stage 12, decision 13): DeskAdminCoachNew.html — a window of 720px from 901px, a sheet from the
 * bottom of a phone. A login, a Telegram contact, a team's name and its race; the entry into the current season, on
 * unless the admin turns it off; and one press that makes them all (`POST /api/admin/coaches`): the account with a
 * temporary password the server makes, the team in its build (`draft`, 600k, nobody in it yet) and, asked, its entry.
 *
 * The prototype draws the password in a field before anything is made; the server makes it here, so the window turns
 * into the news once the coach is in the league (as DeskAdminReset.html draws a reset): the password once, «Copy», the
 * way to the coach's page and «Done». The password lives in this module's sheet while the window shows it, and nowhere
 * else: closing the window by any way drops it, and nothing writes it to the address or to the browser's storage.
 *
 * DeskAdminCoachNew draws five races and «Other…» (L21): «Other…» opens every race of the league in their place, by
 * name. «Create» says what the form still wants («Enter a login», «Choose the race»…) and, pressed, puts the admin
 * there; complete, it sends once (data/admin.mjs: one write at a time, another tab's token sends nothing). An answer
 * that does not come back is never sent again: the coaches are read again, and a coach of that login who was not in
 * the league before is the one made — in the league, the password lost on the way, so the window leads to his page
 * to reset it. A refusal is said in the window, the form as it was.
 *
 * The window stands in a host of its own at the end of <body> (team/manage/sheet-host.mjs): the coaches' screen under
 * it patches its own markup, which would take a dialog standing in it away. It goes with that screen (`closeCoachNew`).
 */
import { escapeHtml, delegate, focusLost } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { adminCoachUrl } from "../../core/routes.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { toast } from "../../components/toast.mjs";
import { adminRequest, readAdminUsers } from "../../data/admin.mjs";
import { raceTeamOf } from "../../data/teams.mjs";
import { LOGIN_MIN_LENGTH, normalizeTelegram, telegramProblem } from "../../domain/account.mjs";
import { startingBudget } from "../../domain/league-rules.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { wireRadioGroups } from "../../ui/choice.mjs";
import { patchWithModal, renderSheet, wireSheets } from "../../ui/sheet.mjs";
import { renderTextField } from "../../ui/text-field.mjs";
import { renderToggle, wireToggles } from "../../ui/toggle.mjs";
import { mountSheetHost } from "../team/manage/sheet-host.mjs";
import { isAdminViewer } from "./frame.mjs";

/** What the window is shown by (`#admin-coach-new`). */
export const COACH_NEW_SHEET_ID = "admin-coach-new";

/** DeskAdminCoachNew's five races, in its order; «Other…» opens the rest. */
const FEATURED_RACES = Object.freeze(["teams/human", "teams/orc", "teams/ogre", "teams/wood-elves", "teams/skaven"]);

/** The fields the form reports by name: the input's `name`, and the key of the sheet's form. */
const FIELDS = new Set(["login", "telegram", "teamName"]);

/** The switch of the season's entry, as `wireToggles` reports it. */
const ENTER_KEY = "coach-enter";

/** What «Create» says while the form wants something, by what it wants. Literal keys, so the dictionary test finds them. */
const NEED = {
  login: () => t("administration.need.login"),
  loginShort: () => t("administration.need.loginShort", { min: LOGIN_MIN_LENGTH }),
  telegram: () => t("administration.need.telegram"),
  telegramFormat: () => t("administration.need.telegramFormat"),
  teamName: () => t("administration.need.teamName"),
  race: () => t("administration.need.race"),
};

/** Where a press of «Create» puts the admin, by what the form wants. */
const PLACE = {
  login: "#coach-new-login",
  loginShort: "#coach-new-login",
  telegram: "#coach-new-telegram",
  telegramFormat: "#coach-new-telegram",
  teamName: "#coach-new-team",
  race: '[data-coach-race][tabindex="0"]',
};

/** A login as the server keys it (server/api/serializers.mjs `normalizeLogin`): no case, one blank between words. */
const loginKey = (login) => String(login ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** The races to choose from: the five of the prototype, or every one by name. A race the reference lacks is left out. */
function racesOf(all) {
  const races = state.data?.teams ?? [];
  if (all) return [...races].sort((one, other) => one.title.localeCompare(other.title));
  return FEATURED_RACES.map((slug) => races.find((race) => race.slug === slug)).filter(Boolean);
}

/**
 * The race as a radio group of buttons (DeskAdminCoachNew): Tab enters at the race chosen, or at the first, and the
 * arrows move along it. Short of every race, «Other…» stands last: a button, not a race, that opens them all.
 * While the form is sent the races are closed (`aria-disabled`): the arrows and a click pass them by. A coach's
 * «+ Team» (coach-sheets.mjs) chooses the race the same way.
 * @param {{selected: string, all: boolean, busy: boolean}} props
 */
export function raceChoiceMarkup({ selected, all, busy }) {
  const races = racesOf(all || (selected && !FEATURED_RACES.includes(selected)));
  const checked = races.findIndex((race) => race.slug === selected);
  const entry = Math.max(0, checked);
  const items = races.map((race, index) => `<button type="button" class="g-coachnew__race" role="radio" aria-checked="${index === checked}"`
    + ` tabindex="${index === entry ? 0 : -1}"${busy ? ' aria-disabled="true"' : ""} data-coach-race="${escapeHtml(race.slug)}" data-key="race-${escapeHtml(race.slug)}">${escapeHtml(race.title)}</button>`);
  const more = races.length < (state.data?.teams ?? []).length
    ? `<button type="button" class="g-coachnew__race" aria-expanded="false" data-coach-races-all>${escapeHtml(t("administration.coachNew.other"))}</button>`
    : "";
  // The group is named by its aria-label; the visible word over it is for the eye alone, or a reader would say it twice.
  return `<span class="g-coachnew__label" aria-hidden="true">${escapeHtml(t("administration.coachNew.race"))}</span>`
    + `<div class="g-coachnew__races" role="radiogroup" aria-label="${escapeHtml(t("administration.coachNew.race"))}">${items.join("")}${more}</div>`;
}

/**
 * What the form still wants, the first thing in its order, or "" when it is complete.
 * @param {{login: string, telegram: string, teamName: string, race: string}} form as typed
 */
function wantOf(form) {
  const login = form.login.trim();
  if (!login) return "login";
  if (login.length < LOGIN_MIN_LENGTH) return "loginShort";
  const contact = telegramProblem(form.telegram);
  if (contact) return contact === "TELEGRAM_REQUIRED" ? "telegram" : "telegramFormat";
  if (!form.teamName.trim()) return "teamName";
  return raceTeamOf(form.race) ? "" : "race";
}

/** What is sent: the login and the name trimmed, the contact as the forms take it (a bare name gets its @). */
const bodyOf = (form) => ({
  login: form.login.trim(), telegram: normalizeTelegram(form.telegram), teamName: form.teamName.trim(), baseTeamSlug: form.race, enter: form.enter,
});

/**
 * What the window says to a screen reader alone (what «Create» still wants, the news of the coach made), from inside
 * the window: under a modal the rest of the page, the shell's live region among it, is inert and says nothing. First in
 * the window's body in either of its forms, so a patch keeps the one node and only its words change.
 * @param {string} said
 */
export function windowSaidMarkup(said) {
  return `<p class="g-sr-only" role="status" data-window-said>${escapeHtml(said ?? "")}</p>`;
}

/**
 * Say `words` in the window's own status (`windowSaidMarkup`), emptied first, so the same words twice are heard twice
 * (as components/live-region.mjs does); nothing when the window is no longer the one it was said for.
 * @param {{said?: string}} sheet @param {string} words @param {() => boolean} still whether it is still that window @param {() => void} redraw
 */
export function tell(sheet, words, still, redraw) {
  sheet.said = "";
  redraw();
  setTimeout(() => {
    if (!still()) return;
    sheet.said = words;
    redraw();
  }, 0);
}

/** Always on the page, so a screen reader hears what is put in it: a refusal, or the coach made whose password did not come back. */
function alertMarkup(shown) {
  const lost = shown.lost
    ? renderCallout({ tone: "warn", title: t("administration.createdNoPassword"), sub: shown.lost.login, href: adminCoachUrl(shown.lost.userId) })
    : "";
  const refusal = shown.refusal ? renderCallout({ tone: "danger", title: shown.refusal }) : "";
  return `<div class="g-coachnew__alert" role="alert">${lost}${refusal}</div>`;
}

function formMarkup(shown) {
  const { form, busy } = shown;
  const field = (id, name, label, extra = {}) => renderTextField({ id, name, label, value: form[name], autocomplete: "off", readonly: busy, ...extra });
  const season = state.season.data?.season?.name ?? "";
  return windowSaidMarkup(shown.said) + alertMarkup(shown)
    + `<div class="g-coachnew__fields">${field("coach-new-login", "login", t("administration.coachNew.login"), { verbatim: true })}`
    + `${field("coach-new-telegram", "telegram", t("administration.telegram"), { verbatim: true, placeholder: t("auth.telegramPlaceholder") })}`
    + `${field("coach-new-team", "teamName", t("administration.coachNew.teamName"))}</div>`
    + raceChoiceMarkup({ selected: form.race, all: shown.all, busy })
    + renderToggle({
      key: ENTER_KEY, label: t("administration.coachNew.enter"), caption: season ? t("administration.coachNew.enterCaption", { season }) : "", checked: form.enter,
      disabled: busy,
    })
    + `<p class="g-admin__note">${escapeHtml(t("administration.coachNew.note", { budget: formatMoney(startingBudget) }))}</p>`;
}

/** «Create»: what the form still wants, closed and said on a press; «Creating…» while it is sent. */
function createMarkup(shown) {
  if (shown.busy) return renderButton({ label: t("administration.coachNew.creating"), kind: "primary", busy: true, data: { coachCreate: "" } });
  const want = wantOf(shown.form);
  if (!want) return renderButton({ label: t("administration.coachNew.create"), kind: "primary", data: { coachCreate: "" } });
  return `<button type="button" class="g-btn g-btn--primary" aria-disabled="true" data-coach-create="">${escapeHtml(NEED[want]())}</button>`;
}

/**
 * The temporary password, once, with «Copy» (DeskAdminReset.html's box): monospace on the second surface, the button at
 * its right. What the last «Copy» did is said under it. A reset's window (coach-sheets.mjs) shows its password so too:
 * its title already says «Temporary password», so `labelledBy` names that title and no word stands over the box.
 * @param {{password: string, copied: ""|"done"|"manual"}} props
 * @param {{labelledBy?: string}} [options] the id of what names the password, when it is not the word over it
 */
export function passwordMarkup({ password, copied }, { labelledBy = "" } = {}) {
  const said = { done: t("administration.copied"), manual: t("administration.copyByHand") }[copied] ?? "";
  const label = labelledBy ? "" : `<span class="g-field__label" id="coach-new-password">${escapeHtml(t("administration.password"))}</span>`;
  return label
    + `<div class="g-coachnew__secret"><span class="g-coachnew__password" aria-labelledby="${escapeHtml(labelledBy || "coach-new-password")}">${escapeHtml(password)}</span>`
    + `${renderButton({ label: t("administration.copy"), data: { coachCopy: "" } })}</div>`
    + `<p class="g-coachnew__copied" role="status">${escapeHtml(said)}</p>`;
}

/** The window as the sheet holds it: the form, or the news of the coach made. Closed: `patchWithModal` opens it. */
function sheetMarkup(shown) {
  const { result } = shown;
  if (!result) {
    return renderSheet({
      id: COACH_NEW_SHEET_ID, title: t("administration.coachNew.title"), sub: t("administration.coachNew.sub"), wide: true, className: "g-coachnew",
      bodyHtml: formMarkup(shown),
      footHtml: renderButton({ label: t("common.cancel"), data: { sheetClose: "" } }) + createMarkup(shown),
    });
  }
  return renderSheet({
    id: COACH_NEW_SHEET_ID, title: t("administration.created"), sub: t("administration.createdLine", { login: result.login, team: result.team }), wide: true,
    className: "g-coachnew",
    bodyHtml: windowSaidMarkup(shown.said) + passwordMarkup(result) + `<p class="g-admin__note">${escapeHtml(t("administration.passwordNote"))}</p>`,
    footHtml: renderButton({ label: t("administration.openCoach"), href: adminCoachUrl(result.userId), data: { coachOpen: "" } })
      + renderButton({ label: t("administration.done"), kind: "primary", data: { sheetClose: "", coachDone: "" } }),
  });
}

/** The host, made and wired at the first opening. @type {Element|null} */
let host = null;

/**
 * The window while it is open, and null while it is not: the form as typed, whether every race is shown, a write on
 * its way, what was said of the last one, and the news of the coach made (his password among it).
 * @type {null|{form: {login: string, telegram: string, teamName: string, race: string, enter: boolean}, all: boolean,
 *   busy: boolean, refusal: string, lost: null|{userId: string, login: string}, tried?: {login: string, before: Set<string>}, said?: string,
 *   result: null|{userId: string, login: string, team: string, password: string, copied: ""|"done"|"manual"},
 *   opener: Element|null, users: () => object[], onUsers: (answer: object) => void}}
 */
let shown = null;

/** Patch the window to match the sheet: the focus and the caret stay where they are. A host that left the page shows nothing. */
function draw() {
  if (shown && host?.isConnected) patchWithModal(host, sheetMarkup(shown), `#${COACH_NEW_SHEET_ID}`);
}

/**
 * The window goes, and what it held with it — the password above all. With `focus` (the cross, the backdrop, Escape,
 * «Cancel», «Done») the focus goes back to the button that opened it, or to the page's title when that is gone.
 * @param {{focus?: boolean}} [options]
 */
export function closeCoachNew({ focus = false } = {}) {
  if (!shown) return;
  const { opener } = shown;
  shown = null;
  if (host?.isConnected) patchWithModal(host, "");
  if (focus) (opener && !focusLost(opener) ? opener : view.querySelector("h1"))?.focus();
}

/** A change of the form takes back what was said about the last try. */
function change(changes) {
  if (!shown || shown.busy || shown.result) return;
  Object.assign(shown.form, changes);
  Object.assign(shown, { refusal: "", lost: null });
  draw();
}

/** «Other…»: every race in place of the five, the focus on the one chosen or the first. */
function showAll() {
  if (!shown || shown.busy) return;
  shown.all = true;
  draw();
  host.querySelector('[data-coach-race][tabindex="0"]')?.focus();
}

/** The coaches read again, and handed to the screen under the window. */
async function readCoaches(sheet) {
  const answer = await readAdminUsers();
  sheet.onUsers(answer);
  return answer;
}

/** Said where it can be: in the window that is still the one it was said for, or in a toast when that has gone. */
function say(sheet, changes, words) {
  Object.assign(sheet, { busy: false, ...changes });
  if (shown === sheet) draw();
  else toast(words, { tone: "error" });
}

/**
 * The coach is in the league: the window turns to the news, the password once, «Copy» in focus; the coaches are read
 * again for the screen. A window closed while it was on its way showed the password to nobody: a toast says to reset
 * it on the coach's page. An answer without the password is taken as one that did not come back (`lostAnswer`).
 */
async function created(sheet, sent, answer, before) {
  const password = String(answer.password ?? "");
  if (!password) {
    await lostAnswer(sheet, sent, before);
    return;
  }
  void readCoaches(sheet);
  if (shown !== sheet) {
    say(sheet, {}, t("administration.createdNoPassword"));
    return;
  }
  sheet.busy = false;
  sheet.result = { userId: String(answer.user?.id ?? ""), login: answer.user?.login ?? sent.login, team: answer.team?.name ?? sent.teamName, password, copied: "" };
  draw();
  host.querySelector("[data-coach-copy]")?.focus();
  const news = `${t("administration.created")}. ${t("administration.createdLine", { login: sheet.result.login, team: sheet.result.team })}`;
  tell(sheet, news, () => shown === sheet, draw);
}

/**
 * The answer did not come back: the coaches are read again, never the write sent again. A coach of that login who was
 * not in the league before the press is the one made: in the league, without the password, which is reset on his page.
 * One who was there already proves nothing, and nothing is offered for him.
 */
async function lostAnswer(sheet, sent, before) {
  const answer = await readCoaches(sheet);
  const key = loginKey(sent.login);
  const found = before.has(key) ? null : answer.users?.find((user) => loginKey(user.login) === key) ?? null;
  if (found) say(sheet, { lost: { userId: found.id, login: found.login } }, t("administration.createdNoPassword"));
  else say(sheet, { refusal: t("administration.mayHaveWritten") }, t("administration.mayHaveWritten"));
}

/**
 * «Create»: what the form still wants is said, and the admin is put there; a complete form is sent once. A second
 * press while it is on its way finds the sheet busy and sends nothing. After an answer that did not come back the
 * window remembers the try (its login, and who was in the league before it): a press again of the same login that the
 * server refuses as taken was, most likely, the first try's coach — the coaches are read again against the league of
 * that first press, and the window leads to his page and the reset, not to a refusal.
 */
async function create() {
  const sheet = shown;
  if (!sheet || sheet.busy || sheet.result) return;
  const want = wantOf(sheet.form);
  if (want) {
    host.querySelector(PLACE[want])?.focus();
    tell(sheet, NEED[want](), () => shown === sheet, draw);
    return;
  }
  const sent = bodyOf(sheet.form);
  const again = sheet.tried?.login === loginKey(sent.login) ? sheet.tried : null;
  const before = again?.before ?? new Set(sheet.users().map((user) => loginKey(user.login)));
  Object.assign(sheet, { busy: true, refusal: "", lost: null });
  draw();
  const outcome = await adminRequest("/api/admin/coaches", { method: "POST", body: sent });
  if (outcome.ignored) {
    // Another write of the administration is still on its way: nothing was sent, the button is free again, and the
    // window says why.
    say(sheet, { refusal: outcome.refusal }, outcome.refusal);
    return;
  }
  if (outcome.answer) {
    await created(sheet, sent, outcome.answer, before);
    return;
  }
  if (outcome.unknown || (again && outcome.code === "LOGIN_ALREADY_REGISTERED")) {
    sheet.tried = { login: loginKey(sent.login), before };
    await lostAnswer(sheet, sent, before);
    return;
  }
  say(sheet, { refusal: outcome.refusal }, outcome.refusal);
}

/**
 * The password put on the clipboard: `"done"`, or `"manual"` where the page may not write to it, and the admin copies
 * it by hand (2.x `admin.passwordCopyFallbackMessage`). A reset's window copies with it too.
 * @param {string} password @returns {Promise<"done"|"manual">}
 */
export async function copyPassword(password) {
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof clipboard?.writeText !== "function") throw new Error("no clipboard");
    await clipboard.writeText(password);
    return "done";
  } catch {
    // The page may not write to the clipboard here: the admin copies it.
    return "manual";
  }
}

/** «Copy»: the clipboard, or the password selected and the words to copy it by hand. */
async function copy() {
  const result = shown?.result;
  if (!result) return;
  const copied = await copyPassword(result.password);
  if (shown?.result !== result) return;
  result.copied = copied;
  draw();
  if (copied === "manual") globalThis.getSelection?.()?.selectAllChildren?.(host.querySelector(".g-coachnew__password"));
}

/** Everything the window listens to, once for the page: the host outlives every window shown in it. */
function wire(root) {
  delegate(root, "input", ".g-coachnew__fields input", (event, input) => {
    const name = input.getAttribute("name");
    if (FIELDS.has(name)) change({ [name]: input.value });
  });
  // There is no submit button in the form's sense: Enter in a field is «Create», as the button is.
  delegate(root, "keydown", ".g-coachnew__fields input", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    void create();
  });
  delegate(root, "click", "[data-coach-create]", () => void create());
  // The radio group has already moved the selection on the page; the sheet follows it, and the button with it.
  wireRadioGroups(root, { group: ".g-coachnew__races", item: "[data-coach-race]", attribute: "data-coach-race", onChange: (slug) => change({ race: slug }) });
  delegate(root, "click", "[data-coach-races-all]", () => showAll());
  wireToggles(root, (key, checked) => {
    if (key === ENTER_KEY) change({ enter: checked });
  });
  delegate(root, "click", "[data-coach-copy]", () => void copy());
  // «Open the coach» leaves the page the window stands over: the password goes first. A press that opens the coach's
  // page elsewhere (a new tab or window, with a modifier or the middle button) leaves this page, and the window, as it is.
  delegate(root, "click", "[data-coach-open]", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.button ?? 0) !== 0) return;
    closeCoachNew();
  });
  wireSheets(root, { onClose: () => closeCoachNew({ focus: true }) });
}

/**
 * Show the window over the coaches, the form empty and the login in focus. Only an admin opens it.
 * @param {Element|null} opener what it was opened from: the focus goes back there when it is closed
 * @param {object} [options]
 * @param {() => object[]} [options.users] the coaches the screen holds just now: who was in the league before a press
 * @param {(answer: {users: object[]}|{error: string, code: string}) => void} [options.onUsers] the coaches read again
 *   after a write, for the screen under the window
 */
export function openCoachNew(opener, { users = () => [], onUsers = () => {} } = {}) {
  if (!isAdminViewer()) return;
  if (!host) {
    host = mountSheetHost(COACH_NEW_SHEET_ID);
    wire(host);
  } else if (!host.isConnected) {
    document.body.append(host);
  }
  shown = {
    form: { login: "", telegram: "", teamName: "", race: "", enter: true }, all: false, busy: false, refusal: "", lost: null, result: null,
    opener, users, onUsers,
  };
  draw();
  host.querySelector("#coach-new-login")?.focus();
}
