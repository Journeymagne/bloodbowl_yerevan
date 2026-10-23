/**
 * «Coach» (`#/administration/users/:uid`, stage 12, decisions 14–16): DeskAdminUser.html from 901px; up to 900px the
 * same cards in one column, every target 44 (no prototype draws a phone's).
 *
 * The head: «Coach», the path «Administration → Coaches → orc_boss», the switch of the sections. The coach: his letter
 * in its circle of 64, the login, since when he is in the league and, while a session of his is live, his last sign-in
 * (L14: a session ends at a sign-out, a reset, its expiry, so none live says nothing true of the past — nothing is
 * said). Then two cards side by side while they fit:
 *
 * - «Account»: the login a field, Telegram read only (spec 3.0 §4: the admin's edit of a user has no field of it), the
 *   switch «Administrator» with its rule (closed for one's own row and for the server's admin: `renderToggle` knows
 *   `disabled`, L13), «Save» and «Reset password…». «Save» sends the login and, but for one's own row, the rights —
 *   never a password (hand-off 05). One's own row has no reset (the words where to change one's own), and the
 *   server's admin (`managedByServer`) neither: his login and rights are the server's, read only, in its words.
 *   A reset asks first (every session of the coach ends), then shows the password once (coach-sheets.mjs).
 * - «Teams»: «+ Team» (a new one in its build, coach-sheets.mjs), a row each — its tile, its name, its line («Orc · in
 *   the season · matches: 6», «Black Orc · friendlies: 1», «Human · in the build»), «Edit» to the admin's edit of it,
 *   «Delete» — closed with its reason when it has a season history or friendlies (said on a press and in its title),
 *   open, it asks first. Under a rule, «Delete the coach»: closed with its reason, or open, asking first, then the
 *   coaches.
 *
 * Every write keeps data/admin.mjs's rules: one at a time, never under another tab's token, a lost answer not sent
 * again — the coach is read again and the card says what the server holds. A coach who is no admin is shown the
 * banner of the section and nothing is read; a coach the league does not have is said so, with the way to the
 * coaches. The width crossing 900px draws the other form, the focus kept or on the title; leaving stops listening and
 * takes the windows away. Long names wrap; nothing is cut with «…».
 */
import { drawKeepingFocus, escapeHtml, focusLost, listenerGroup, patch } from "../../core/dom.mjs";
import { formatDay } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { adminTeamEditUrl, adminUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { toast } from "../../components/toast.mjs";
import { adminRequest, readAdminUser } from "../../data/admin.mjs";
import { mergeCurrentUser } from "../../data/session.mjs";
import { teamInitials } from "../../data/team-record.mjs";
import { loadMyTeams, raceTitleOf } from "../../data/teams.mjs";
import { refreshShell } from "../../shell/shell.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { coachInitial, renderCoachLetter } from "../../ui/coach-letter.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { confirmAction } from "../../ui/sheet.mjs";
import { renderTextField } from "../../ui/text-field.mjs";
import { renderToggle, wireToggles } from "../../ui/toggle.mjs";
import { isPhone, onPhoneChange } from "../team/roster/screen.mjs";
import { closeCoachSheets, openReset, openTeamNew } from "./coach-sheets.mjs";
import { adminHeadMarkup, adminRefusalMarkup, crumbsMarkup, isAdminViewer } from "./frame.mjs";

/** Why a delete is closed, in the order the server tells it (`deleteBlock`): one's own, a season history, friendlies. */
export const DELETE_BLOCKS = Object.freeze(["self", "server", "season", "friendly"]);

/** The switch «Administrator», as `wireToggles` reports it. */
const ADMIN_KEY = "acoach-admin";

/** A count the server sent, or none. */
const amount = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** A moment the server sent that reads as one. */
const isMoment = (iso) => typeof iso === "string" && !Number.isNaN(Date.parse(iso));

/** Why a delete is closed, in words; "" when it is open. */
const blockWords = (block) => (block ? t(`administration.block.${block}`) : "");

/** «In the league since 3 Feb 2025»; "" for a date that cannot be read. */
const sinceOf = (createdAt) => (isMoment(createdAt) ? t("administration.since", { date: formatDay(createdAt, { year: true }) }) : "");

/** «last sign-in today», «… 20 Oct», the year said when it is another one; "" while no session of the coach is live (L14). */
function lastLoginOf(iso) {
  if (!isMoment(iso)) return "";
  const moment = new Date(iso);
  const now = new Date();
  const day = moment.toDateString() === now.toDateString() ? t("administration.today") : formatDay(iso, { year: moment.getFullYear() !== now.getFullYear() });
  return t("administration.lastLogin", { date: day });
}

/**
 * A team's line: its race; «in the build» while it is in its build; «in the season» while it is in this one; then its
 * matches in the season, or, out of it, its friendlies, or the matches of its past (a number has no plural form).
 */
function teamLine(team) {
  const draft = team.stage === "draft";
  const inSeason = team.inActiveSeason === true;
  const matches = amount(team.matches);
  const friendlies = amount(team.friendlies);
  const parts = [raceTitleOf(team.baseTeamSlug), draft && t("administration.team.draft"), inSeason && t("administration.team.inSeason")];
  if (!draft && (inSeason || (!friendlies && matches))) parts.push(t("administration.team.matches", { count: matches }));
  else if (!draft && friendlies) parts.push(t("administration.team.friendlies", { count: friendlies }));
  return parts.filter(Boolean).join(" · ");
}

/** A team's delete closed as the server says (a season history, friendlies); a team is never one's own account. */
const teamBlock = (block) => (block === "season" || block === "friendly" ? block : null);

/**
 * What «Coach» says.
 *
 * @param {object} input
 * @param {object} input.user the coach (`GET /api/admin/users/:id`)
 * @param {object[]} [input.teams] his teams, as the same answer sends them
 * @param {object|null} [input.viewer] the admin who looks: his own row is closed to a reset, a demotion, a delete
 * @param {boolean} [input.phone] a phone's form
 */
export function adminCoachModel({ user, teams = [], viewer = null, phone = false }) {
  const self = Boolean(viewer?.id) && viewer.id === user.id;
  const envAdmin = user.managedByServer === true;
  return {
    id: String(user.id ?? ""),
    login: user.login ?? "",
    telegram: user.telegram ?? "",
    phone,
    since: sinceOf(user.createdAt),
    lastLogin: lastLoginOf(user.lastLoginAt),
    self,
    envAdmin,
    form: { login: user.login ?? "", isAdmin: user.isAdmin === true },
    canReset: !self && !envAdmin,
    resetWhy: self ? t("administration.ownPassword") : envAdmin ? t("error.ADMIN_PASSWORD_FROM_ENV") : "",
    deleteBlock: self ? "self" : DELETE_BLOCKS.includes(user.deleteBlock) ? user.deleteBlock : null,
    teams: teams.map((team) => ({
      id: String(team.id ?? ""), name: team.name ?? "", initials: teamInitials(team.name), line: teamLine(team),
      editHref: adminTeamEditUrl(user.id, team.id), deleteBlock: teamBlock(team.deleteBlock),
    })),
  };
}

/** A card's words of the last write: a refusal (`role="alert"`), always on the page so a screen reader hears it. */
const alertMarkup = (words) => `<div class="g-acoach__alert" role="alert">${words ? renderCallout({ tone: "danger", title: words }) : ""}</div>`;

/** A card's news of the last write («Account saved»), always on the page so a screen reader hears it. */
const statusMarkup = (words) => `<p class="g-acoach__status" role="status">${escapeHtml(words ?? "")}</p>`;

/** A fact the admin reads and does not edit: its word over its value. */
const factMarkup = (label, value) => `<div class="g-acoach__fact"><span class="g-acoach__factlabel">${escapeHtml(label)}</span>`
  + `<span class="g-acoach__factvalue">${escapeHtml(value || "—")}</span></div>`;

/** A quiet line under a card's controls. */
const noteMarkup = (words, className = "") => `<p class="g-admin__note${className ? ` ${className}` : ""}">${escapeHtml(words)}</p>`;

/** The coach: the letter in its circle, the login, since when and the last sign-in. */
function idMarkup(model) {
  const line = [model.since, model.lastLogin].filter(Boolean).join(" · ");
  return `<div class="g-acoach__id">${renderCoachLetter({ initial: coachInitial(model.login), size: 64 })}<div class="g-acoach__who"><p class="g-acoach__login">${escapeHtml(model.login)}</p>`
    + `${line ? `<p class="g-acoach__line">${escapeHtml(line)}</p>` : ""}</div></div>`;
}

/** «Save», and «Reset password…» where there is one: each says so while it is on its way. */
function accountActionsMarkup(model, now) {
  const saving = now.working === "save";
  const save = model.envAdmin ? "" : renderButton({ label: t(saving ? "administration.saving" : "common.save"), kind: "primary", busy: saving, data: { acoachSave: "" } });
  const resetting = now.working === "reset";
  const reset = model.canReset
    ? renderButton({ label: t(resetting ? "administration.resetting" : "administration.reset"), busy: resetting, dialog: true, data: { acoachReset: "" } })
    : "";
  return save || reset ? `<div class="g-acoach__actions">${save}${reset}</div>` : "";
}

/** «Account» (DeskAdminUser): the login, Telegram, the rights, «Save» and the reset, or why there is none. */
function accountMarkup(model, now) {
  const saving = now.working === "save";
  const login = model.envAdmin
    ? factMarkup(t("administration.coachNew.login"), model.login)
    : renderTextField({ id: "acoach-login", name: "login", label: t("administration.coachNew.login"), value: now.login, verbatim: true, autocomplete: "off", readonly: saving });
  const rights = renderToggle({
    key: ADMIN_KEY, label: t("administration.isAdmin"), caption: t("administration.isAdminCaption"), checked: now.isAdmin, disabled: model.self || model.envAdmin || saving,
  });
  return `<section class="g-admin__card g-acoach__account" aria-labelledby="acoach-account">`
    + `<div class="g-admin__cardhead"><h2 id="acoach-account">${escapeHtml(t("administration.account"))}</h2></div>`
    + alertMarkup(now.alert?.account) + login + factMarkup(t("administration.telegram"), model.telegram) + rights
    + (model.envAdmin ? noteMarkup(t("error.ADMIN_PROFILE_FROM_ENV")) : "")
    + accountActionsMarkup(model, now) + (model.resetWhy ? noteMarkup(model.resetWhy, "g-acoach__why") : "")
    + statusMarkup(now.status?.account) + "</section>";
}

/** A row of «Teams»: the tile, the name over the line, «Edit», «Delete» (closed with its reason). */
function teamRowMarkup(team, now) {
  assertLinkHref(team.editHref);
  const edit = `<a class="g-acoach__btn" href="${escapeHtml(team.editHref)}" aria-label="${escapeHtml(t("administration.editLabel", { team: team.name }))}">`
    + `${escapeHtml(t("administration.edit"))}</a>`;
  const closed = team.deleteBlock ? ` aria-disabled="true" title="${escapeHtml(blockWords(team.deleteBlock))}"` : "";
  const busy = now.working === `team:${team.id}` ? ' aria-busy="true" aria-disabled="true"' : "";
  const remove = `<button type="button" class="g-acoach__btn g-acoach__btn--delete" data-acoach-team-delete="${escapeHtml(team.id)}"`
    + ` aria-label="${escapeHtml(t("administration.deleteLabel", { team: team.name }))}"${closed || busy}>${escapeHtml(t("common.delete"))}</button>`;
  return `<div class="g-acoach__team"><span class="g-acoach__tile" aria-hidden="true">${escapeHtml(team.initials)}</span>`
    + `<span class="g-acoach__teamtext"><b class="g-acoach__teamname">${escapeHtml(team.name)}</b><span class="g-acoach__teamline">${escapeHtml(team.line)}</span></span>`
    + `<span class="g-acoach__teambtns">${edit}${remove}</span></div>`;
}

/** «Delete the coach» under its rule: why it is closed, or what it does; the button, described by those words. */
function dangerMarkup(model, now) {
  const closed = model.deleteBlock ? ' aria-disabled="true"' : now.working === "coach" ? ' aria-busy="true" aria-disabled="true"' : "";
  return `<div class="g-acoach__danger"><span class="g-acoach__dangertext"><b class="g-acoach__dangertitle">${escapeHtml(t("administration.deleteCoach"))}</b>`
    + `<span class="g-acoach__dangerwhy" id="acoach-delete-why">${escapeHtml(blockWords(model.deleteBlock) || t("administration.deleteCoachNote"))}</span></span>`
    + `<button type="button" class="g-acoach__btn g-acoach__btn--delete" data-acoach-delete="" aria-label="${escapeHtml(t("administration.deleteCoach"))}"`
    + ` aria-describedby="acoach-delete-why"${closed}>${escapeHtml(t("common.delete"))}</button></div>`;
}

/** «Teams» (DeskAdminUser): «+ Team», the rows or the words that there is none, the rule of a delete, the coach's delete. */
function teamsMarkup(model, now) {
  const add = renderButton({ label: t("administration.newTeam"), dialog: true, data: { acoachTeamNew: "" } });
  const rows = model.teams.length
    ? model.teams.map((team) => teamRowMarkup(team, now)).join("")
    : `<p class="g-acoach__none">${escapeHtml(t("administration.noTeams"))}</p>`;
  // The coach's delete has its own words, by its button: a refusal there is no team's.
  return `<section class="g-admin__card g-acoach__teamscard" aria-labelledby="acoach-teams">`
    + `<div class="g-admin__cardhead"><h2 id="acoach-teams">${escapeHtml(t("administration.col.teams"))}</h2>${add}</div>`
    + alertMarkup(now.alert?.teams) + statusMarkup(now.status?.teams) + `<div class="g-acoach__teams">${rows}</div>`
    + noteMarkup(t("administration.teamsNote")) + alertMarkup(now.alert?.coach) + dangerMarkup(model, now) + "</section>";
}

/** The screen's frame around what it shows: the head, and the content under it (`data-screen`). */
const frameMarkup = (phone, head, body) => `${head}<div class="g-admin__main g-acoach${phone ? " g-acoach--phone" : ""}" data-screen="admin-coach">${body}</div>`;

/** The head of «Coach», with the path to it when the coach is known. */
function headMarkup(phone, login = "") {
  const crumbsHtml = login ? crumbsMarkup([{ label: t("administration.title") }, { label: t("administration.coaches"), href: adminUrl() }, { label: login }]) : "";
  return adminHeadMarkup({ title: t("administration.coach"), crumbsHtml, section: "coaches", phone });
}

/**
 * «Coach» in the form of the width.
 * @param {ReturnType<typeof adminCoachModel>} model
 * @param {{login?: string, isAdmin?: boolean, working?: string, alert?: {account?: string, teams?: string, coach?: string}, status?: {account?: string, teams?: string}}} [edit]
 *   what the visit holds over the server's: the form as typed, the write on its way, what each card says of the last one
 */
export function adminCoachMarkup(model, edit = {}) {
  const now = { login: model.form.login, isAdmin: model.form.isAdmin, working: "", ...edit };
  const body = idMarkup(model) + `<div class="g-admin__grid">${accountMarkup(model, now)}${teamsMarkup(model, now)}</div>`;
  return frameMarkup(model.phone, headMarkup(model.phone, model.login), body);
}

/** The screen while the coach is read, when he could not be, or when the league has none such. */
function waitMarkup(visit, phone) {
  let body = `<p class="g-admin__note" role="status">${escapeHtml(t("administration.reading"))}</p>`;
  if (visit.code === "USER_NOT_FOUND") {
    body = renderCallout({ tone: "warn", title: t("administration.coachNotFound"), sub: t("administration.toCoaches"), href: adminUrl() });
  } else if (visit.error) {
    const again = renderButton({ label: t("administration.again"), data: { acoachAgain: "" } });
    body = `<div role="alert">${renderCallout({ tone: "danger", title: t("administration.readFailed", { reason: visit.error }), actionHtml: again })}</div>`;
  }
  return frameMarkup(phone, headMarkup(phone), body);
}

/** The model of the visit as it stands. */
const modelOf = (visit) => adminCoachModel({ user: visit.user, teams: visit.teams, viewer: state.auth.currentUser, phone: isPhone() });

/** The page as the visit holds it. */
const markupOf = (visit) => (visit.user ? adminCoachMarkup(modelOf(visit), visit) : waitMarkup(visit, isPhone()));

/** What each card says of the last write, taken back; whether there was anything to take. */
function unsay(visit, card) {
  const said = Boolean(visit.alert[card] || visit.status[card]);
  visit.alert[card] = "";
  visit.status[card] = "";
  return said;
}

/**
 * The coach as read: the account and the teams (and, with `form`, the form as the server holds it), or why not. A
 * coach no longer in the league is the page of none such, whatever was shown before.
 */
function took(visit, answer, { form = true } = {}) {
  if (answer.user) {
    Object.assign(visit, { user: answer.user, teams: answer.teams ?? [], error: "", code: "" });
    if (form) Object.assign(visit, { login: answer.user.login ?? "", isAdmin: answer.user.isAdmin === true });
  } else if (!visit.user || answer.code === "USER_NOT_FOUND") {
    Object.assign(visit, { user: null, teams: [], error: answer.error, code: answer.code });
  }
}

/** Read the coach, the screen saying so meanwhile; the title takes the focus once he is in, as on the way in. */
async function read(visit, draw) {
  Object.assign(visit, { user: null, error: "", code: "" });
  draw();
  const answer = await readAdminUser(visit.userId);
  if (!visit.here) return;
  took(visit, answer);
  draw();
  view.querySelector("h1")?.focus();
}

/** The coach read again after a write, the page still on him; what was read. */
async function readAgain(visit, options) {
  const answer = await readAdminUser(visit.userId);
  if (visit.here) took(visit, answer, options);
  return answer;
}

/** A write of one's own teams on one's own page: the shell's list of them is read again. */
function ownTeamsChanged(visit) {
  if (visit.user?.id && visit.user.id === state.auth.currentUser?.id) void loadMyTeams(true);
}

/**
 * Ask before a delete or a reset: one question at a time, and none while a write is on its way.
 * @returns {Promise<boolean>} whether to go on
 */
async function asked(visit, question) {
  if (visit.working || visit.asking) return false;
  visit.asking = true;
  const yes = await confirmAction({ ...question, destructive: true });
  visit.asking = false;
  return yes && visit.here && !visit.working;
}

/**
 * One write of the page, once: `work` names it while it is on its way (the button that says so). An ignored write
 * (another of the administration still on its way) sent nothing: the page is as it was, and says why.
 */
async function send(visit, draw, work, path, options) {
  visit.working = work;
  draw();
  const outcome = await adminRequest(path, options);
  visit.working = "";
  if (visit.here && outcome.ignored) {
    draw();
    toast(outcome.refusal);
  }
  return outcome;
}

/**
 * «Save»: the login and, but for one's own row, the rights — never a password. The answer is the account as written;
 * one's own goes to the shell's copy of the admin. A lost answer reads the coach again, never sends again.
 */
async function save(visit, draw) {
  if (!visit.user || visit.working || visit.asking) return;
  const model = modelOf(visit);
  if (model.envAdmin) return;
  const body = { login: visit.login.trim(), ...(model.self ? {} : { isAdmin: visit.isAdmin }) };
  unsay(visit, "account");
  const outcome = await send(visit, draw, "save", `/api/admin/users/${encodeURIComponent(visit.userId)}`, { method: "PATCH", body });
  if (!visit.here || outcome.ignored) return;
  const user = outcome.answer?.user;
  if (user) {
    visit.user = { ...visit.user, login: user.login, telegram: user.telegram, isAdmin: user.isAdmin };
    Object.assign(visit, { login: user.login ?? "", isAdmin: user.isAdmin === true });
    visit.status.account = t("administration.accountSaved");
    if (user.id === state.auth.currentUser?.id) {
      mergeCurrentUser(user);
      refreshShell();
    }
  } else if (outcome.answer || outcome.unknown) {
    await readAgain(visit);
    visit.alert.account = t("administration.mayHaveWritten");
  } else {
    visit.alert.account = outcome.refusal;
  }
  draw();
}

/**
 * «Reset password…»: asked first (every session of the coach ends), then sent once; the password is shown once in its
 * window. A lost answer may have reset it with the new one lost on the way: the coach is read again, and the card
 * says to reset it once more.
 */
async function reset(visit, draw, button) {
  if (!visit.user || !modelOf(visit).canReset) return;
  const { login } = visit.user;
  unsay(visit, "account");
  if (!await asked(visit, { message: t("administration.resetConfirm", { login }), confirmLabel: t("administration.resetAction") })) return;
  const outcome = await send(visit, draw, "reset", `/api/admin/users/${encodeURIComponent(visit.userId)}/reset-password`, { method: "POST" });
  if (outcome.ignored) return;
  const password = String(outcome.answer?.password ?? "");
  if (!visit.here) {
    // The page was left while the reset was on its way: the new password reached nobody, and the old one is gone.
    if (password) toast(t("administration.resetUnseen", { login }), { tone: "error" });
    return;
  }
  if (password) {
    // Every session of the coach ended with the reset: none is live to say a last sign-in by.
    visit.user = { ...visit.user, lastLoginAt: null };
    draw();
    openReset(button, { login, password });
    return;
  }
  if (outcome.answer || outcome.unknown) {
    await readAgain(visit, { form: false });
    visit.alert.account = t("administration.resetLost");
  } else {
    visit.alert.account = outcome.refusal;
  }
  draw();
}

/** A team's «Delete»: closed, it says why; open, it asks, then sends once, and the coach is read again. */
async function deleteTeam(visit, draw, button) {
  const team = visit.user ? modelOf(visit).teams.find((row) => row.id === button.getAttribute("data-acoach-team-delete")) : null;
  if (!team) return;
  if (team.deleteBlock) {
    toast(blockWords(team.deleteBlock));
    return;
  }
  unsay(visit, "teams");
  if (!await asked(visit, { message: t("administration.deleteTeamConfirm", { team: team.name }), confirmLabel: t("common.delete") })) return;
  const outcome = await send(visit, draw, `team:${team.id}`, `/api/admin/teams/${encodeURIComponent(team.id)}`, { method: "DELETE" });
  if (!visit.here || outcome.ignored) return;
  if (outcome.answer || outcome.unknown) {
    await readAgain(visit, { form: false });
    if (outcome.answer) visit.status.teams = t("administration.teamDeleted", { team: team.name });
    else visit.alert.teams = t("administration.mayHaveWritten");
    ownTeamsChanged(visit);
  } else {
    // Refused (the team entered into the season meanwhile): the coach is read again, so its «Delete» stands as the
    // server has it now, closed with its reason.
    if (outcome.code !== "OTHER_TAB") await readAgain(visit, { form: false });
    visit.alert.teams = outcome.refusal;
  }
  draw();
  // The row pressed may have gone with the team.
  if (focusLost(globalThis.document?.activeElement)) view.querySelector("[data-acoach-team-new]")?.focus();
}

/**
 * «Delete the coach»: closed, it says why; open, it asks, then sends once, and the page goes to the coaches. A lost
 * answer reads the coach again: one who is gone was deleted.
 */
async function deleteCoach(visit, draw) {
  if (!visit.user) return;
  const model = modelOf(visit);
  if (model.deleteBlock) {
    toast(blockWords(model.deleteBlock));
    return;
  }
  unsay(visit, "teams");
  unsay(visit, "coach");
  if (!await asked(visit, { message: t("administration.deleteCoachConfirm", { login: model.login }), confirmLabel: t("administration.deleteCoach") })) return;
  const outcome = await send(visit, draw, "coach", `/api/admin/users/${encodeURIComponent(visit.userId)}`, { method: "DELETE" });
  if (!visit.here || outcome.ignored) return;
  if (outcome.answer) {
    location.hash = adminUrl();
    return;
  }
  // Refused (the coach entered a team into the season meanwhile) or no answer: the coach is read again, so the button
  // stands as the server has it now — closed with its reason — and the words go by it. One who is gone was deleted.
  const again = outcome.code === "OTHER_TAB" ? null : await readAgain(visit, { form: false });
  if (outcome.unknown && again?.code === "USER_NOT_FOUND") {
    location.hash = adminUrl();
    return;
  }
  visit.alert.coach = outcome.unknown ? t("administration.mayHaveWritten") : outcome.refusal;
  draw();
}

/** «+ Team»: the window of a new team in its build; the coach read again once it is made, and the card saying so. */
function newTeam(visit, draw, button) {
  if (!visit.user || visit.working || visit.asking) return;
  unsay(visit, "teams");
  draw();
  openTeamNew(button, {
    coach: { id: visit.user.id, login: visit.user.login },
    teams: () => visit.teams,
    reread: async () => {
      const answer = await readAgain(visit, { form: false });
      draw();
      return answer;
    },
    onCreated: (name) => {
      if (!visit.here) return;
      visit.status.teams = t("administration.teamCreated", { team: name });
      ownTeamsChanged(visit);
      draw();
    },
  });
}

/** What the page listens to while it is shown. */
function wire(group, visit, draw) {
  group.on("input", "#acoach-login", (event, input) => {
    visit.login = input.value;
    if (unsay(visit, "account")) draw();
  });
  // There is no submit button in the form's sense: Enter in the login is «Save», as the button is.
  group.on("keydown", "#acoach-login", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    void save(visit, draw);
  });
  group.own(wireToggles(view, (key, checked) => {
    if (key !== ADMIN_KEY) return;
    visit.isAdmin = checked;
    if (unsay(visit, "account")) draw();
  }));
  group.on("click", "[data-acoach-save]", () => void save(visit, draw));
  group.on("click", "[data-acoach-reset]", (event, button) => void reset(visit, draw, button));
  group.on("click", "[data-acoach-team-new]", (event, button) => newTeam(visit, draw, button));
  group.on("click", "[data-acoach-team-delete]", (event, button) => void deleteTeam(visit, draw, button));
  group.on("click", "[data-acoach-delete]", () => void deleteCoach(visit, draw));
  group.on("click", "[data-acoach-again]", () => void read(visit, draw));
}

/**
 * «Coach». A coach who is no admin is shown the banner of the section, and nothing is read. Otherwise the title takes
 * the focus, the coach is read, and the page is drawn; the width crossing 900px draws the other form, and leaving
 * stops listening and closes the windows.
 * @param {string} userId
 */
export async function renderAdminCoach(userId) {
  if (!isAdminViewer()) {
    patch(view, adminRefusalMarkup());
    view.querySelector("h1")?.focus();
    return;
  }
  const visit = {
    here: true, userId, user: null, teams: [], error: "", code: "", login: "", isAdmin: false, working: "", asking: false,
    alert: { account: "", teams: "", coach: "" }, status: { account: "", teams: "", coach: "" },
  };
  const draw = () => {
    if (visit.here) patch(view, markupOf(visit));
  };
  const group = listenerGroup(view);
  wire(group, visit, draw);
  group.own(onPhoneChange(() => drawKeepingFocus(view, draw, "h1")));
  onScreenLeave("admin-coach", () => {
    visit.here = false;
    group.release();
    closeCoachSheets();
  });
  draw();
  view.querySelector("h1")?.focus();
  await read(visit, draw);
}
