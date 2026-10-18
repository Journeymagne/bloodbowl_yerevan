/**
 * Signing in and registering (`#/login`, `#/register`): one screen with a switch
 * between the two, in place of the 2.x modal. On a phone the league's strip with
 * its crest sits above the form, which is on a sheet; from 901px the league has
 * the left column (crest, pitch, three points, footer) and the form the right.
 *
 * What the coach typed lives in this module's `form`, and every keystroke draws
 * it again (plan stage 05, decision 17: `patch()` puts a field that is not
 * focused back to the markup's value, so an empty `value` would wipe it). The
 * passwords go once the coach signs in or leaves the screen.
 *
 * Where a sign-in leads is not this screen's: the session tells the app, and the
 * router sends the coach back where they were sent from, or home
 * (core/routes.mjs, resolveRedirect).
 */
import { escapeHtml, listenerGroup, patch } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { authUrl, matchRoute, routeFromHash } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { view } from "../../core/view.mjs";
import { setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { refusalText, register, sessionFailureText, signIn } from "../../data/session.mjs";
import { normalizeTelegram, registrationProblems } from "../../domain/account.mjs";
import { renderCrest } from "../../shell/crest.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { renderSegmentedControl } from "../../ui/segmented-control.mjs";
import { renderTextField } from "../../ui/text-field.mjs";
import { renderPasswordMeter } from "./password-meter.mjs";

/**
 * What a rule of `registrationProblems` says when the form breaks it.
 * @param {string} [code] @returns {string} "" for a code that is not one
 */
export function problemText(code) {
  if (code === "LOGIN_TOO_SHORT") return t("error.LOGIN_TOO_SHORT");
  if (code === "TELEGRAM_REQUIRED") return t("error.TELEGRAM_REQUIRED");
  if (code === "TELEGRAM_FORMAT") return t("auth.telegramFormat");
  if (code === "PASSWORD_TOO_SHORT") return t("error.PASSWORD_TOO_SHORT");
  if (code === "PASSWORDS_DIFFER") return t("auth.passwordsDiffer");
  return "";
}

/** The fields a refusal of the server is about, by its code. */
function refusedFields(code) {
  if (code === "WRONG_LOGIN_OR_PASSWORD") return ["login", "password"];
  if (code === "LOGIN_ALREADY_REGISTERED" || code === "LOGIN_TOO_SHORT") return ["login"];
  if (code === "PASSWORD_TOO_SHORT") return ["password"];
  if (code === "TELEGRAM_REQUIRED") return ["telegram"];
  return [];
}

function brandHtml() {
  const point = (number, title, text) => `<li class="g-auth__point"><span class="g-auth__number" aria-hidden="true">${number}</span>`
    + `<span class="g-auth__point-text"><span class="g-auth__point-title">${escapeHtml(title)}</span>`
    + `<span class="g-auth__point-desc">${escapeHtml(text)}</span></span></li>`;
  return `<div class="g-auth__brand">
    <div class="g-auth__mark">${renderCrest({ size: "lg" })}<span class="g-auth__names">`
    + `<span class="g-auth__name">${escapeHtml(t("shell.league"))}</span><span class="g-auth__tagline">${escapeHtml(t("auth.tagline"))}</span></span></div>
    <p class="g-auth__pitch">${escapeHtml(t("auth.pitch"))}</p>
    <ol class="g-auth__points">${point(1, t("auth.point.roster"), t("auth.point.rosterText"))}`
    + `${point(2, t("auth.point.season"), t("auth.point.seasonText"))}${point(3, t("auth.point.ref"), t("auth.point.refText"))}</ol>
  </div>`;
}

/** The toggle at the end of the password's label line. One name in both states; whether it is pressed says which (K10b). */
function renderShowToggle(show) {
  return `<button type="button" class="g-auth__show" data-toggle-password aria-pressed="${show ? "true" : "false"}">${escapeHtml(t("auth.showPassword"))}</button>`;
}

/** The fields, with what is wrong with them: a registration's rules once it was tried, the server's refusal always. */
function fieldsHtml(form) {
  const registering = form.mode === "register";
  const problems = registering && form.touched ? registrationProblems(form) : {};
  const refused = new Set(form.error?.fields ?? []);
  const type = form.show ? "text" : "password";
  // A password drawn as text is not sent to a spell checker nor capitalised by a keyboard: `verbatim`, as in the password sheet.
  const shown = form.show;
  // A field the server refused is marked, and points at the alert that says why.
  const field = (key, props) => renderTextField({ ...props, name: key, error: problemText(problems[key]), invalid: refused.has(key),
    describedBy: refused.has(key) ? "auth-alert" : "" });
  const login = field("login", { id: "auth-login", label: t("auth.loginField"), value: form.login, autocomplete: "username", verbatim: true,
    help: registering && !problems.login ? t("auth.loginHint") : "" });
  if (!registering) {
    return login + field("password", { id: "auth-password", label: t("auth.passwordField"), type, value: form.password,
      autocomplete: "current-password", verbatim: shown, asideHtml: renderShowToggle(form.show) });
  }
  return login
    + field("telegram", { id: "auth-telegram", label: t("auth.telegramField"), value: form.telegram, autocomplete: "off", verbatim: true,
      placeholder: t("auth.telegramPlaceholder"), help: problems.telegram ? "" : t("auth.telegramHint") })
    + field("password", { id: "auth-password", label: t("auth.passwordField"), type, value: form.password,
      autocomplete: "new-password", verbatim: shown, asideHtml: renderShowToggle(form.show) })
    + renderPasswordMeter(form.password)
    + field("repeat", { id: "auth-repeat", label: t("auth.repeatPassword"), type, value: form.repeat, autocomplete: "new-password", verbatim: shown });
}

/** Always on the page, so a screen reader hears what is put in it; empty until a try is refused. */
function alertHtml(error) {
  return `<div class="g-auth__alert" id="auth-alert" role="alert">${error ? renderCallout({ tone: "danger", title: error.text, sub: error.sub ?? "" }) : ""}</div>`;
}

function forgotHtml(open) {
  return `<button type="button" class="g-auth__forgot-toggle" data-forgot aria-expanded="${open ? "true" : "false"}" aria-controls="auth-forgot">`
    + `${escapeHtml(t("auth.forgot"))}</button>`
    + `<p class="g-auth__forgot" id="auth-forgot"${open ? "" : " hidden"}>${escapeHtml(t("auth.forgotText"))}</p>`;
}

function switchHtml(registering) {
  const [question, mode, label] = registering
    ? [t("auth.haveAccountShort"), "login", t("auth.toLogin")]
    : [t("auth.noAccount"), "register", t("auth.toRegister")];
  return `<p class="g-auth__switch">${escapeHtml(question)} <a class="g-auth__link" href="${escapeHtml(authUrl(mode))}">${escapeHtml(label)}</a></p>`;
}

/**
 * @param {object} form what the screen holds
 * @param {"login"|"register"} form.mode
 * @param {string} form.login @param {string} form.password @param {string} form.telegram @param {string} form.repeat as typed
 * @param {boolean} form.show the passwords are drawn as text
 * @param {boolean} form.touched a registration was tried: its rules are said on its fields
 * @param {boolean} form.forgotOpen the password help is open
 * @param {boolean} form.pending a try is on its way
 * @param {boolean} [form.created] the account was made but the session not read: the button signs in to it now
 * @param {null|{text: string, sub?: string, fields: string[], created?: boolean}} form.error what was said about the last try
 * @returns {string}
 */
export function loginMarkup(form) {
  const registering = form.mode === "register";
  const signsIn = !registering || Boolean(form.created);
  // Signing in waits for both fields; a registration may always be tried, and is then told what is missing.
  const ready = !signsIn || (form.login.trim() !== "" && form.password !== "");
  const modes = renderSegmentedControl({
    label: t("auth.modes"),
    items: [{ value: "login", label: t("auth.login"), href: authUrl("login") }, { value: "register", label: t("auth.register"), href: authUrl("register") }],
    selected: form.mode,
  });
  const submit = renderButton({ label: signsIn ? t("auth.toLogin") : t("auth.createAccount"), kind: "primary", type: "submit", disabled: !ready });
  const after = registering ? `<p class="g-auth__note">${escapeHtml(t("auth.registerNote"))}</p>` : forgotHtml(form.forgotOpen);
  return `<div class="g-auth">
  ${brandHtml()}
  <div class="g-auth__sheet">
    <div class="g-auth__panel">
      <h1 class="g-auth__title">${escapeHtml(registering ? t("auth.register") : t("auth.login"))}</h1>
      ${modes}
      <form class="g-auth__form" data-auth-form novalidate${form.pending ? ' aria-busy="true"' : ""}>
        ${alertHtml(form.error)}
        ${fieldsHtml(form)}
        ${submit}
        ${after}
      </form>
      ${switchHtml(registering)}
    </div>
  </div>
  <footer class="g-auth__footer"><span>${escapeHtml(t("footer.unofficialNote"))}</span> <a class="g-auth__link" href="#/legal">${escapeHtml(t("footer.legalLink"))}</a></footer>
</div>`;
}

/**
 * Sign in or register with what the form holds; the contact goes as the server should keep
 * it (`normalizeTelegram`). A registration's own rules are the screen's to check before. An
 * account already made (`form.created`) is signed in to, not registered again.
 *
 * Only a session that /me then read is a success. The 2.x modal closed on any answer to the
 * POST and left the coach a guest without a word; here the coach is told, and the form keeps
 * what was typed.
 *
 * @param {object} form as loginMarkup takes it
 * @returns {Promise<null|{text: string, sub?: string, fields: string[], created?: boolean}>} null once
 *   signed in (the session's listeners and the router take it from there); otherwise what to say, the
 *   fields it is about, and `created` when the account was made all the same
 */
export async function submitAuth(form) {
  const login = String(form.login ?? "").trim();
  const password = String(form.password ?? "");
  const registering = form.mode === "register" && !form.created;
  let status;
  try {
    status = registering
      ? await register({ login, password, telegram: normalizeTelegram(form.telegram) })
      : await signIn({ login, password });
  } catch (error) {
    return { text: refusalText(error), fields: refusedFields(error?.code) };
  }
  if (status === "signed-in") return null;
  // "offline": in, with the account unread; the token stays and the next load reads it. "guest": /me said
  // no one straight after the server said yes, and the session took the token back.
  const said = status === "offline"
    ? { text: sessionFailureText(), sub: t("auth.signedInReload"), fields: [] }
    : { text: t("request.noAnswer"), fields: [] };
  return registering ? { ...said, created: true } : said;
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** What the screen holds between keystrokes. It outlives a redraw and the switch between the two modes. */
const form = { mode: "login", login: "", password: "", telegram: "", repeat: "", show: false, touched: false, forgotOpen: false, pending: false, created: false, error: null };
const TYPED = new Set(["login", "telegram", "password", "repeat"]);
/** The mode on the page, or null while the coach is elsewhere: an answer that comes after they left draws nothing. */
let shown = null;

const isSignInScreen = (hash) => ["login", "register"].includes(matchRoute(routeFromHash(hash)).name);

function draw() {
  patch(view, loginMarkup(form));
}

/** Typing takes back what the server said about the last try. */
function typed(event, input) {
  const name = input.getAttribute("name");
  if (!TYPED.has(name)) return;
  form[name] = input.value;
  form.error = null;
  // Another login is another account: the one made a moment ago is not it.
  if (name === "login") form.created = false;
  draw();
}

async function submit() {
  if (form.pending) return;
  if (form.mode === "register" && !form.created) {
    form.touched = true;
    if (Object.keys(registrationProblems(form)).length) {
      draw();
      view.querySelector('[data-auth-form] [aria-invalid="true"]')?.focus();
      return;
    }
  } else if (!form.login.trim() || !form.password) {
    return;
  }
  form.pending = true;
  form.error = null;
  draw();
  const error = await submitAuth({ ...form });
  form.pending = false;
  if (error) {
    form.error = error;
    if (error.created) form.created = true;
  } else {
    // Signed in, and the router is already on its way: the form is done with.
    Object.assign(form, { login: "", password: "", telegram: "", repeat: "", show: false, touched: false, created: false });
  }
  if (!shown) return;
  draw();
  // Signed in, the router takes the coach on and this form goes: the keyboard starts at the next screen, not
  // at the top of the page, where the pressed button would leave it once it is gone.
  if (!error) view.focus();
  // A refusal about a field puts the coach in it, where the alert is read again as its description.
  else if (error.fields.length) view.querySelector(`#auth-${error.fields[0]}`)?.focus();
}

function wire() {
  const group = listenerGroup(view);
  group.on("input", "[data-auth-form] input", typed);
  group.on("click", "[data-toggle-password]", () => {
    form.show = !form.show;
    draw();
  });
  group.on("click", "[data-forgot]", () => {
    form.forgotOpen = !form.forgotOpen;
    draw();
  });
  group.on("submit", "[data-auth-form]", (event) => {
    event.preventDefault();
    void submit();
  });
  return () => group.release();
}

/** @param {"login"|"register"} mode */
export function renderLogin(mode) {
  const next = mode === "register" ? "register" : "login";
  let release = null;
  // Registered first: drawing again without the router runs the last teardown, and its listeners go before these come.
  onScreenLeave("auth", () => {
    release?.();
    // The router also releases a screen to draw it again, or to draw the other mode: that is not leaving.
    if (isSignInScreen(location.hash)) return;
    shown = null;
    Object.assign(form, { password: "", repeat: "", show: false, touched: false, forgotOpen: false, created: false, error: null });
  });
  if (shown !== next) {
    // Arriving, or switching modes: what was said about the last try is not about this one.
    Object.assign(form, { mode: next, touched: false, forgotOpen: false, created: false, error: null });
  }
  shown = next;
  setActiveNav("login");
  setViewSection("login");
  draw();
  release = wire();
}
