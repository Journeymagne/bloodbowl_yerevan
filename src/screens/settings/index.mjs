/**
 * Settings (`#/settings`): the account and the language. A coach sees who they
 * are, can change the Telegram contact opponents use, and signs out; a guest is
 * shown the way in. The look of the site (the theme) is drawn beside the account
 * as `appearanceHtml` by the screen that owns it; on a phone the language is
 * here too, since the side navigation that holds it on a wide screen is not.
 *
 * Changing the password is a sheet of its own, and the account the server's
 * settings keep (`managedByServer`) cannot change its login, contact or password
 * from here at all, so those are text and a note.
 */
import { errorText } from "../../core/api.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { escapeHtml, listenerGroup, patch } from "../../core/dom.mjs";
import { getLocale, t } from "../../core/i18n.mjs";
import { requestLocale } from "../../core/locale-request.mjs";
import { authUrl, routeFromHash } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { patchWithModal } from "../../components/dialog.mjs";
import { announce } from "../../components/live-region.mjs";
import { setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { toast } from "../../components/toast.mjs";
import { mergeCurrentUser, signOut } from "../../data/session.mjs";
import { normalizeTelegram, telegramProblem } from "../../domain/account.mjs";
import { renderButton } from "../../ui/button.mjs";
import { icon } from "../../ui/icons.mjs";
import { renderKeyValueRow, renderNavRow } from "../../ui/list-row.mjs";
import { renderSegmentedControl, wireSegmentedControls } from "../../ui/segmented-control.mjs";
import { renderTextField } from "../../ui/text-field.mjs";
import { changePassword, passwordReady, passwordSheetMarkup, wirePasswordSheet } from "./password-sheet.mjs";

/** The year the coach joined, or null when the account carries no usable date. */
function joinedIn(createdAt) {
  const date = createdAt ? new Date(createdAt) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getFullYear() : null;
}

/**
 * Whether the field holds the contact that is on file, which is nothing to save: the same text, or the
 * contact as the form would send it (a bare name gets its @, blanks are trimmed). A contact on file
 * without its @ is not the same as one with it: that one can still be saved.
 */
function isSameContact(typed, saved) {
  const onFile = String(saved ?? "");
  return typed === onFile || normalizeTelegram(typed) === onFile.trim();
}

function identityHtml(user, teamCount) {
  const initial = Array.from(String(user.login ?? ""))[0]?.toUpperCase() ?? "";
  const year = joinedIn(user.createdAt);
  // A count the app has not got (the list is still coming, or could not be read) is left out, not drawn as none.
  const line = typeof teamCount === "number" ? t("settings.coachSince", { year, count: teamCount }) : t("settings.coachSinceYear", { year });
  const since = year === null ? "" : `<span class="g-settings__since">${escapeHtml(line)}</span>`;
  return `<div class="g-settings__who">
    <span class="g-settings__avatar" aria-hidden="true">${escapeHtml(initial)}</span>
    <span class="g-settings__identity">
      <span class="g-settings__label">${escapeHtml(t("auth.signedInAs"))}</span>
      <span class="g-settings__login">${escapeHtml(user.login)}</span>
      ${since}
    </span>
  </div>`;
}

/** The login is text on every account; the contact is a field, and the password a sheet, unless the server keeps them. */
function editableHtml(user, telegram, telegramError) {
  const field = renderTextField({
    id: "settings-telegram",
    name: "telegram",
    label: t("auth.telegramField"),
    value: telegram,
    placeholder: t("auth.telegramPlaceholder"),
    autocomplete: "off",
    help: t("settings.telegramHint"),
    error: telegramError,
    actionHtml: renderButton({ label: t("common.save"), kind: "primary", hidden: isSameContact(telegram, user.telegram), data: { telegramSave: true } }),
  });
  const password = `<button type="button" class="g-settings__password" data-open-password aria-haspopup="dialog">${icon("lock", 20)}`
    + `<span class="g-settings__password-label">${escapeHtml(t("settings.changePassword"))}</span>${icon("chevron", 16)}</button>`;
  return field + password;
}

function managedHtml(user) {
  return renderKeyValueRow({ label: t("auth.telegramField"), value: user.telegram })
    + `<p class="g-settings__managed">${escapeHtml(t("settings.managedByServer"))}</p>`;
}

function accountHtml({ user, teamCount, telegram, telegramError }) {
  const admin = user.isAdmin
    ? `<div class="g-settings__admin">${renderNavRow({ href: "#/administration", title: t("nav.administration"), desc: t("settings.adminHint") })}</div>`
    : "";
  return identityHtml(user, teamCount)
    + (user.managedByServer === true ? managedHtml(user) : editableHtml(user, telegram, telegramError))
    + admin
    + renderButton({ label: t("auth.logout"), kind: "danger-outline", block: true, data: { logout: true } });
}

function guestHtml() {
  return `<p class="g-settings__guest">${escapeHtml(t("settings.guestText"))}</p>`
    + renderButton({ label: t("auth.toLogin"), kind: "primary", href: authUrl("login") })
    + renderButton({ label: t("auth.register"), block: true, href: authUrl("register") });
}

function languageHtml(locale) {
  const control = renderSegmentedControl({
    label: t("settings.language"),
    items: [{ value: "ru", label: t("settings.language.ru") }, { value: "en", label: t("settings.language.en") }],
    selected: locale,
    data: { segGroup: "language" },
  });
  // The control names itself to a screen reader; the caption is for the eyes.
  return `<div class="g-settings__language"><span class="g-settings__caption" aria-hidden="true">${escapeHtml(t("settings.language"))}</span>${control}</div>`;
}

/**
 * @param {object} props
 * @param {object|null} props.user the signed-in coach, null for a guest
 * @param {number|null} props.teamCount how many teams the coach has; null while the app does not know
 * @param {string} props.locale "ru" or "en"
 * @param {string} props.telegram what the contact field holds (the contact on file, or what was typed over it)
 * @param {string} [props.telegramError] why the last save was refused
 * @param {string} [props.appearanceHtml] markup from a render…() function: the theme
 */
export function settingsMarkup({ user, teamCount, locale, telegram = "", telegramError = "", appearanceHtml = "" }) {
  return `<section class="g-settings">
    <div class="g-settings__head">
      <h1 class="g-settings__title">${escapeHtml(t("settings.title"))}</h1>
      <p class="g-settings__subtitle">${escapeHtml(t("settings.subtitle"))}</p>
    </div>
    <section class="g-settings__section g-settings__account" aria-labelledby="settings-account-title">
      <h2 class="g-settings__heading" id="settings-account-title">${escapeHtml(t("auth.account"))}</h2>
      ${user ? accountHtml({ user, teamCount, telegram, telegramError }) : guestHtml()}
    </section>
    <section class="g-settings__section g-settings__appearance" aria-labelledby="settings-appearance-title">
      <h2 class="g-settings__heading" id="settings-appearance-title">${escapeHtml(t("settings.appearance"))}</h2>
      ${appearanceHtml}
      ${languageHtml(locale)}
    </section>
  </section>`;
}

/**
 * Wire the screen's controls. The language goes to `requestLocale` (the app
 * owns the reload) and the rest to the callbacks.
 *
 * @param {Element} root the container the markup is in; it may be drawn again
 * @param {object} callbacks
 * @param {string} callbacks.saved the contact on file: Save shows while the field holds another
 * @param {(value: string) => unknown} callbacks.onSaveTelegram the field's value as typed
 * @param {() => unknown} callbacks.onLogout
 * @param {() => unknown} callbacks.onOpenPassword
 * @param {(value: string) => unknown} [callbacks.onInput] the field's value, at every keystroke
 * @param {(locale: string) => unknown} [callbacks.onLocaleSettled] the app has answered a request for this language, whether or not it switched
 * @returns {() => void} removes the listeners
 */
export function wireSettings(root, { saved, onSaveTelegram, onLogout, onOpenPassword, onInput, onLocaleSettled }) {
  const group = listenerGroup(root);
  group.on("input", "#settings-telegram", (event, input) => {
    const button = root.querySelector("[data-telegram-save]");
    if (isSameContact(input.value, saved)) button?.setAttribute("hidden", "");
    else button?.removeAttribute("hidden");
    onInput?.(input.value);
  });
  group.on("click", "[data-telegram-save]", () => onSaveTelegram(root.querySelector("#settings-telegram").value));
  group.on("keydown", "#settings-telegram", (event, input) => {
    if (event.key !== "Enter" || event.isComposing || isSameContact(input.value, saved)) return;
    event.preventDefault();
    onSaveTelegram(input.value);
  });
  group.on("click", "[data-open-password]", () => onOpenPassword());
  group.on("click", "[data-logout]", () => onLogout());
  // The control shows the new language at once; the app may not manage it, and then it is redrawn from what is true.
  const ask = (locale) => Promise.resolve(requestLocale(locale)).catch(console.error).then(() => onLocaleSettled?.(locale));
  group.own(wireSegmentedControls(root, ask, { group: "language" }));
  return () => group.release();
}

/**
 * Save the contact as the registration form takes it. A new contact has to be
 * in that format; the one already on file is never checked, because it is
 * never sent (the field offers no Save for it, and nothing here sends it).
 *
 * @param {string} value as typed
 * @returns {Promise<{error: string}|null>} null once saved, or when it is the contact on file; otherwise why not, as text
 */
export async function saveTelegram(value) {
  if (isSameContact(value, state.auth.currentUser?.telegram)) return null;
  const telegram = normalizeTelegram(value);
  const problem = telegramProblem(telegram);
  if (problem === "TELEGRAM_REQUIRED") return { error: t("error.TELEGRAM_REQUIRED") };
  if (problem) return { error: t("auth.telegramFormat") };
  try {
    const answer = await apiRequest("/api/auth/profile", { method: "PATCH", body: JSON.stringify({ telegram }) });
    mergeCurrentUser(answer.user);
    return null;
  } catch (error) {
    return { error: errorText(error) };
  }
}

/**
 * What the screen holds between its own redraws. `telegram` is what the field holds, which a redraw
 * puts back (a field that is not focused is returned to the markup's value). It outlives a redraw of
 * this very route (a language switch, a change of session), and is dropped when the coach goes to
 * another screen or another coach is on: `who`.
 *
 * `password` is the password sheet while it is open, with the three passwords typed in it, and null
 * while it is not. It follows the same rule, and more: closing the sheet drops it too, and a password
 * is never kept past the sheet that holds it.
 */
const screen = { open: false, saving: false, who: null, telegram: "", telegramError: "", password: null };
let release = null;
let releaseSheet = null;

const BLANK_PASSWORD = { current: "", next: "", repeat: "", show: false, pending: false, done: false, error: null };

/** A guest has no password to change, and the account the server's settings keep has one only there (R4). */
const canChangePassword = (user) => Boolean(user) && user.managedByServer !== true;

function draw() {
  const user = state.auth.currentUser;
  const teams = state.myTeams;
  // The sheet is for an account whose password this screen may change, whatever was open when that stopped being so.
  if (!canChangePassword(user)) screen.password = null;
  release?.();
  const sheet = screen.password;
  patchWithModal(view, settingsMarkup({
    user,
    teamCount: teams.loaded && !teams.error ? teams.items.length : null,
    locale: getLocale(),
    telegram: screen.telegram,
    telegramError: screen.telegramError,
  }) + (sheet ? passwordSheetMarkup(sheet) : ""), sheet ? "#password-sheet" : "");
  release = wireSettings(view, {
    saved: user?.telegram ?? "",
    onSaveTelegram: submitTelegram,
    onInput: typed,
    onLogout: logout,
    onOpenPassword: openPassword,
    onLocaleSettled: languageSettled,
  });
}

/** Typing takes back what was said about the last try, and is what a redraw puts back. */
function typed(value) {
  screen.telegram = value;
  if (!screen.telegramError) return;
  screen.telegramError = "";
  draw();
}

/** A switch that worked has been drawn by the route; one that did not leaves the control on a language that is not the page's. */
function languageSettled(locale) {
  if (getLocale() === locale) return;
  toast(t("settings.languageFailed"), { tone: "error" });
  if (screen.open) draw();
}

async function submitTelegram(value) {
  if (screen.saving) return;
  screen.saving = true;
  const failure = await saveTelegram(value);
  screen.saving = false;
  if (!failure) toast(t("settings.telegramSaved"));
  if (!screen.open) {
    if (failure) toast(failure.error, { tone: "error" });
    return;
  }
  // The Save button is about to go; the focus on it would go to the page with it.
  const onSave = document.activeElement === view.querySelector("[data-telegram-save]");
  const now = view.querySelector("#settings-telegram")?.value ?? value;
  const goneOn = now !== value; // the coach kept typing while it was on its way: that is theirs, not the answer's
  screen.telegram = failure || goneOn ? now : state.auth.currentUser?.telegram ?? "";
  screen.telegramError = failure?.error ?? "";
  draw();
  const input = view.querySelector("#settings-telegram");
  // A field that has the focus keeps what it holds through a redraw, so it is told.
  if (input && input.value !== screen.telegram) input.value = screen.telegram;
  if (failure) announce(failure.error);
  else if (onSave) input?.focus();
}

async function logout() {
  await signOut();
  location.hash = "#/";
}

/** The row that opens the sheet is not drawn for an account the server keeps, and the opener asks again: a late /me may say so. */
function openPassword() {
  if (!canChangePassword(state.auth.currentUser)) return;
  screen.password = { ...BLANK_PASSWORD };
  draw();
  view.querySelector("#password-current")?.focus();
}

/** Typing takes back what was said about the last try. */
function typedPassword(name, value) {
  const sheet = screen.password;
  if (!sheet) return;
  sheet[name] = value;
  sheet.error = null;
  draw();
}

function toggleShowPasswords() {
  if (!screen.password) return;
  screen.password.show = !screen.password.show;
  draw();
}

/** What a changed password means, both halves: it is changed, and the other devices have to sign in again. */
const changedNews = () => `${t("password.done")}. ${t("password.doneText")}`;

async function submitPassword() {
  const sheet = screen.password;
  if (!sheet || sheet.pending || sheet.done || !passwordReady(sheet)) return;
  sheet.pending = true;
  sheet.error = null;
  draw();
  const failure = await changePassword({ current: sheet.current, next: sheet.next });
  if (screen.password !== sheet) {
    // The coach closed the sheet or left the screen while it was on its way: nothing of it is on the page to say it.
    if (failure) toast([failure.text, failure.sub].filter(Boolean).join(" "), { tone: "error" });
    else toast(changedNews());
    return;
  }
  if (failure) {
    sheet.pending = false;
    sheet.error = failure;
  } else {
    // From the blank sheet, so that nothing the form held (a password, whether it was shown) is carried into the news.
    screen.password = { ...BLANK_PASSWORD, done: true };
  }
  draw();
  if (failure) {
    // A refusal that is a field's puts the coach in it, where the reason is read as its description.
    if (failure.field) view.querySelector(`#password-${failure.field}`)?.focus();
    return;
  }
  // The button that was pressed is gone with the form; Done is where the focus goes, and the news is said aloud.
  view.querySelector("[data-password-done]")?.focus();
  announce(changedNews());
}

/** Every way out of the sheet: the passwords go with it, and the focus goes back to the row that opened it. */
function closePassword() {
  screen.password = null;
  draw();
  view.querySelector("[data-open-password]")?.focus();
}

export function renderSettings() {
  const user = state.auth.currentUser;
  if (screen.who !== (user?.id ?? null)) {
    screen.who = user?.id ?? null;
    screen.telegram = user?.telegram ?? "";
    screen.password = null;
  }
  screen.open = true;
  screen.telegramError = "";
  setActiveNav("settings");
  setViewSection("settings");
  draw();
  releaseSheet = wirePasswordSheet(view, { onInput: typedPassword, onToggleShow: toggleShowPasswords, onSubmit: submitPassword, onClose: closePassword });
  onScreenLeave("settings", () => {
    release?.();
    release = null;
    releaseSheet?.();
    releaseSheet = null;
    screen.open = false;
    // The router also releases a screen to draw the same route again: that is not leaving.
    if (routeFromHash(location.hash) !== "settings") {
      screen.who = null;
      screen.password = null;
    }
  });
}
