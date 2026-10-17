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
import { authUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { toast } from "../../components/toast.mjs";
import { mergeCurrentUser, signOut } from "../../data/session.mjs";
import { normalizeTelegram, telegramProblem } from "../../domain/account.mjs";
import { renderButton } from "../../ui/button.mjs";
import { icon } from "../../ui/icons.mjs";
import { renderKeyValueRow, renderNavRow } from "../../ui/list-row.mjs";
import { renderSegmentedControl, wireSegmentedControls } from "../../ui/segmented-control.mjs";
import { renderTextField } from "../../ui/text-field.mjs";

/** The year the coach joined, or null when the account carries no usable date. */
function joinedIn(createdAt) {
  const date = createdAt ? new Date(createdAt) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getFullYear() : null;
}

function identityHtml(user, teamCount) {
  const initial = Array.from(String(user.login ?? ""))[0]?.toUpperCase() ?? "";
  const year = joinedIn(user.createdAt);
  const since = year === null ? "" : `<span class="g-settings__since">${escapeHtml(t("settings.coachSince", { year, count: teamCount }))}</span>`;
  return `<div class="g-settings__who">
    <span class="g-settings__avatar" aria-hidden="true">${escapeHtml(initial)}</span>
    <span class="g-settings__identity">
      <span class="g-settings__label">${escapeHtml(t("auth.signedInAs"))}</span>
      <span class="g-settings__login">${escapeHtml(user.login)}</span>
      ${since}
    </span>
  </div>`;
}

/** renderButton cannot draw a button hidden; the stylesheet keeps `.g-btn`'s display from overriding it. */
function saveButtonHtml(visible) {
  const save = renderButton({ label: t("common.save"), kind: "primary", data: { telegramSave: true } });
  return visible ? save : save.replace("<button ", "<button hidden ");
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
    actionHtml: saveButtonHtml(telegram !== (user.telegram ?? "")),
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
 * @param {number} props.teamCount how many teams the coach has
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
 * @param {string} callbacks.saved the contact on file: Save shows while the field differs from it
 * @param {(value: string) => unknown} callbacks.onSaveTelegram the field's value as typed
 * @param {() => unknown} callbacks.onLogout
 * @param {() => unknown} callbacks.onOpenPassword
 * @param {() => unknown} [callbacks.onLocaleSettled] the app has answered a language request, whether or not it switched
 * @returns {() => void} removes the listeners
 */
export function wireSettings(root, { saved, onSaveTelegram, onLogout, onOpenPassword, onLocaleSettled }) {
  const group = listenerGroup(root);
  group.on("input", "#settings-telegram", (event, input) => {
    const button = root.querySelector("[data-telegram-save]");
    if (input.value === saved) button?.setAttribute("hidden", "");
    else button?.removeAttribute("hidden");
  });
  group.on("click", "[data-telegram-save]", () => onSaveTelegram(root.querySelector("#settings-telegram").value));
  group.on("keydown", "#settings-telegram", (event, input) => {
    if (event.key !== "Enter" || event.isComposing || input.value === saved) return;
    event.preventDefault();
    onSaveTelegram(input.value);
  });
  group.on("click", "[data-open-password]", () => onOpenPassword());
  group.on("click", "[data-logout]", () => onLogout());
  // The control shows the new language at once; the app may not manage it, and then it is redrawn from what is true.
  const ask = (locale) => Promise.resolve(requestLocale(locale)).catch(console.error).then(onLocaleSettled);
  group.own(wireSegmentedControls(root, ask, { group: "language" }));
  return () => group.release();
}

/**
 * Save the contact as the registration form takes it. A new contact has to be
 * in that format; one that is already on file is never checked, because it is
 * never saved (the field offers no Save for it).
 *
 * @param {string} value as typed
 * @returns {Promise<{error: string}|null>} null once saved; otherwise why not, as text
 */
export async function saveTelegram(value) {
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

// What the screen holds between its own redraws; it starts afresh each time the route draws it.
const screen = { open: false, saving: false, telegram: "", telegramError: "" };
let release = null;

function draw() {
  const user = state.auth.currentUser;
  release?.();
  patch(view, settingsMarkup({
    user,
    teamCount: state.myTeams.items.length,
    locale: getLocale(),
    telegram: screen.telegram,
    telegramError: screen.telegramError,
  }));
  release = wireSettings(view, {
    saved: user?.telegram ?? "",
    onSaveTelegram: submitTelegram,
    onLogout: logout,
    onOpenPassword() {}, // Task 10 draws the password sheet
    onLocaleSettled: () => { if (screen.open) draw(); },
  });
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
  screen.telegram = failure ? value : state.auth.currentUser?.telegram ?? "";
  screen.telegramError = failure?.error ?? "";
  draw();
}

async function logout() {
  await signOut();
  location.hash = "#/";
}

export function renderSettings() {
  screen.open = true;
  screen.telegram = state.auth.currentUser?.telegram ?? "";
  screen.telegramError = "";
  setActiveNav("settings");
  setViewSection("settings");
  draw();
  onScreenLeave("settings", () => {
    release?.();
    release = null;
    screen.open = false;
  });
}
