/**
 * «Coaches» (`#/administration`, stage 12, decisions 8–13): DeskAdminUsers.html from 901px, AdminMobile.html up to 900px.
 *
 * A desk: the band «Coaches» with the league's counts (a number has no plural form: «coaches: 6 · teams: 8 · Season
 * 1»), the switch to the season (frame.mjs), the search at the left and «+ Coach with a team» at the right, and the
 * coaches as the prototype's table — the coach (his letter, the login, «admin» for an admin), Telegram, the teams, the
 * last change to one («· in the build» while a team of his is in its build), «Open». A phone: «Administration» as its
 * title, the two buttons of the switch, the card of the round under way (how many results wait, and when the next
 * round can be generated), the search, a row per coach to his page, and «+ Coach with a team» the whole width.
 * «Import as a list» is not drawn (question 4: no such path on the server).
 *
 * The search is the page's own: by login or Telegram, any case, part of either; a keystroke patches the list alone,
 * the focus in the field. The coaches are read when the screen is entered (`GET /api/admin/users`), with the season
 * for its name and its round; a coach who is no admin is shown the banner of the section and nothing is read. The
 * width crossing 900px draws the other form, the focus kept or on the title; leaving stops listening and takes the
 * window of «Coach with a team» (coach-new.mjs) away with the screen. Long names wrap; nothing is cut with «…».
 */
import { drawKeepingFocus, escapeHtml, listenerGroup, patch } from "../../core/dom.mjs";
import { formatDay } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { adminCoachUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { readAdminUsers } from "../../data/admin.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { icon } from "../../ui/icons.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderSearchField } from "../../ui/search-field.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { isPhone, onPhoneChange } from "../team/roster/screen.mjs";
import { closeCoachNew, openCoachNew } from "./coach-new.mjs";
import { adminHeadMarkup, adminRefusalMarkup, avatarMarkup, isAdminViewer } from "./frame.mjs";

/** Text as it is searched: no case, one blank between words, none around. */
const searchable = (text) => String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** A count the server sent, or none. */
const amount = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Whether a moment is on the reader's own today. */
function isToday(iso) {
  const moment = new Date(iso ?? "");
  return !Number.isNaN(moment.getTime()) && moment.toDateString() === new Date().toDateString();
}

/** «14 Oct 2026», «today», with «· in the build» while a team of the coach's is in its build (DeskAdminUsers). */
function editedOf(user) {
  const day = isToday(user.lastTeamUpdatedAt) ? t("administration.today") : formatDay(user.lastTeamUpdatedAt, { year: true });
  return amount(user.draftTeamCount) > 0 ? t("administration.inDraft", { date: day }) : day;
}

/**
 * The round under way (the latest `started`): its pairings of two sides whose result is not confirmed, and the round
 * that comes next; null when none is under way.
 */
function roundOf(season) {
  const started = (season?.rounds ?? []).filter((round) => round.status === "started");
  if (!started.length) return null;
  const round = started.reduce((latest, next) => (amount(next.roundNumber) > amount(latest.roundNumber) ? next : latest));
  const number = amount(round.roundNumber);
  const waiting = (round.pairings ?? []).filter((pairing) => pairing.homeEntryId && pairing.awayEntryId && pairing.resultStatus !== "confirmed").length;
  return { number, waiting, next: number + 1 };
}

/**
 * What «Coaches» says.
 *
 * @param {object} input
 * @param {object[]} input.users the league's coaches (`GET /api/admin/users`)
 * @param {string} [input.query] what the search holds, as typed
 * @param {object|null} [input.season] `/api/season`, null while it is not read
 * @param {boolean} [input.phone] AdminMobile's form, which alone has the round's card
 */
export function coachesModel({ users, query = "", season = null, phone = false }) {
  const wanted = searchable(query);
  const rows = users
    .filter((user) => !wanted || searchable(user.login).includes(wanted) || searchable(user.telegram).includes(wanted))
    .map((user) => ({
      id: user.id, login: user.login ?? "", telegram: user.telegram ?? "", isAdmin: user.isAdmin === true, teams: amount(user.savedTeamCount),
      edited: editedOf(user), draft: amount(user.draftTeamCount) > 0, href: adminCoachUrl(user.id),
    }));
  return {
    phone, query, rows,
    count: { coaches: users.length, teams: users.reduce((sum, user) => sum + amount(user.savedTeamCount), 0) },
    seasonName: season?.season?.name ?? "",
    round: phone ? roundOf(season) : null,
  };
}

/** A link, its address checked first. */
function link(href, className, content, label = "") {
  assertLinkHref(href);
  return `<a class="${className}" href="${escapeHtml(href)}"${label ? ` aria-label="${escapeHtml(label)}"` : ""}>${content}</a>`;
}

/** The words when the list is empty: nobody by what was searched, or nobody at all. */
function noneMarkup(model) {
  const words = model.query.trim() ? t("administration.nobodyFound", { query: model.query.trim() }) : t("administration.noCoaches");
  return `<p class="g-coaches__none">${escapeHtml(words)}</p>`;
}

/** A desk's row: the coach, his Telegram, the teams, the last change, «Open». */
function rowMarkup(row) {
  const chip = row.isAdmin ? renderStatusChip({ label: t("administration.adminChip"), tone: "live" }) : "";
  const open = link(row.href, "g-coaches__open", escapeHtml(t("administration.open")), t("administration.openLabel", { login: row.login }));
  return '<div class="g-coaches__row" role="row">'
    + `<span class="g-coaches__who" role="cell">${avatarMarkup(row.login, 36)}<b class="g-coaches__login">${escapeHtml(row.login)}</b>${chip}</span>`
    + `<span class="g-coaches__tg" role="cell">${escapeHtml(row.telegram)}</span>`
    + `<span class="g-coaches__count" role="cell">${row.teams}</span>`
    + `<span class="g-coaches__edited" role="cell">${escapeHtml(row.edited)}</span>`
    + `<span class="g-coaches__go" role="cell">${open}</span></div>`;
}

/** DeskAdminUsers' card: the heads in capitals over their rule, a row per coach; the words when there is none. */
function tableMarkup(model) {
  if (!model.rows.length) return `<div class="g-admin__card g-coaches__card">${noneMarkup(model)}</div>`;
  const heads = [t("administration.col.coach"), t("administration.telegram"), t("administration.col.teams"), t("administration.col.edited")]
    .map((words) => `<span role="columnheader">${escapeHtml(words)}</span>`).join("");
  // The last column is «Open»'s: no word over it on the page, its name for a screen reader.
  const go = `<span role="columnheader"><span class="g-sr-only">${escapeHtml(t("administration.col.open"))}</span></span>`;
  return `<div class="g-admin__card g-coaches__card"><div class="g-coaches__table" role="table" aria-label="${escapeHtml(t("administration.coaches"))}">`
    + `<div class="g-coaches__head" role="row">${heads}${go}</div>`
    + `<div class="g-coaches__rows" role="rowgroup">${model.rows.map(rowMarkup).join("")}</div></div></div>`;
}

/** AdminMobile's rows: each a link to the coach, his letter, the login over «@orc_boss · teams: 2», a chevron. */
function itemsMarkup(model) {
  if (!model.rows.length) return noneMarkup(model);
  return model.rows.map((row) => {
    const line = [row.telegram, t("administration.teamsCount", { teams: row.teams })].filter(Boolean).join(" · ");
    const text = `<span class="g-coaches__itemtext"><b class="g-coaches__itemlogin">${escapeHtml(row.login)}</b>`
      + `<span class="g-coaches__itemline">${escapeHtml(line)}</span></span>`;
    return link(row.href, "g-coaches__item", `${avatarMarkup(row.login, 40)}${text}${icon("chevron", 16)}`);
  }).join("");
}

/** The list the search patches: a desk's table, a phone's rows. */
const listMarkup = (model) => (model.phone ? itemsMarkup(model) : tableMarkup(model));

/** AdminMobile's card of the round under way: how many results wait, and when the next round can be generated. */
function roundMarkup(round) {
  if (!round) return "";
  const done = round.waiting === 0;
  const title = done ? t("administration.round.done", { round: round.number }) : t("administration.round.waiting", { round: round.number, count: round.waiting });
  const note = done ? t("administration.round.doneNote", { next: round.next }) : t("administration.round.waitingNote", { next: round.next });
  return `<div class="g-coaches__round${done ? " g-coaches__round--done" : ""}"><b class="g-coaches__roundtitle">${escapeHtml(title)}</b>`
    + `<p class="g-coaches__roundnote">${escapeHtml(note)}</p></div>`;
}

const searchMarkup = (model) => renderSearchField({
  id: "admin-coach-search", label: t("administration.search"), placeholder: t("administration.searchPlaceholder"), value: model.query, data: { coachSearch: "" },
});

/** «+ Coach with a team»: a desk's at the right of the search, a phone's the whole width under the coaches. */
const addMarkup = (phone) => renderButton({ label: t("administration.newCoach"), kind: phone ? "outline" : "primary", block: phone, dialog: true, data: { coachNew: "" } });

/** The head of the form of the width: a desk's band with the counts, a phone's title. */
function headMarkup(model) {
  if (model.phone) return adminHeadMarkup({ title: t("administration.title"), section: "coaches", phone: true });
  const sub = [t("administration.count", model.count), model.seasonName].filter(Boolean).join(" · ");
  return adminHeadMarkup({ title: t("administration.coaches"), sub, section: "coaches" });
}

/** The screen's frame around what it shows: the head, and the content under it (`data-screen`). */
const frameMarkup = (phone, head, body) => `${head}<div class="g-admin__main g-coaches g-coaches--${phone ? "phone" : "desk"}" data-screen="admin-coaches">${body}</div>`;

/**
 * «Coaches» in the form of the width.
 * @param {ReturnType<typeof coachesModel>} model
 */
export function coachesMarkup(model) {
  const list = `<div class="g-coaches__list" data-coach-list>${listMarkup(model)}</div>`;
  const body = model.phone
    ? `${roundMarkup(model.round)}${searchMarkup(model)}${list}<div class="g-coaches__add">${addMarkup(true)}</div>`
    : `<div class="g-coaches__tools">${searchMarkup(model)}<div class="g-coaches__new">${addMarkup(false)}</div></div>${list}`;
  return frameMarkup(model.phone, headMarkup(model), body);
}

/** The screen while the coaches are read, or when they could not be: the head, and the words. */
function waitMarkup(visit, phone) {
  const head = phone
    ? adminHeadMarkup({ title: t("administration.title"), section: "coaches", phone: true })
    : adminHeadMarkup({ title: t("administration.coaches"), section: "coaches" });
  const body = visit.error
    ? `<div role="alert">${renderCallout({ tone: "danger", title: t("administration.readFailed", { reason: visit.error }), actionHtml: renderButton({ label: t("administration.again"), data: { coachesAgain: "" } }) })}</div>`
    : `<p class="g-admin__note" role="status">${escapeHtml(t("administration.reading"))}</p>`;
  return frameMarkup(phone, head, body);
}

/** The model of the visit as it stands. */
const modelOf = (visit) => coachesModel({ users: visit.users, query: visit.query, season: state.season.data ?? null, phone: isPhone() });

/** The page as the visit holds it. */
const markupOf = (visit) => (visit.users ? coachesMarkup(modelOf(visit)) : waitMarkup(visit, isPhone()));

/** The coaches as read: the list, or why not. */
function took(visit, answer) {
  if (answer.users) Object.assign(visit, { users: answer.users, error: "" });
  else if (!visit.users) visit.error = answer.error;
}

/**
 * Read the coaches (and the season, for its name and its round), the screen saying so meanwhile; the title takes the
 * focus once they are in, as on the way in. The season is read anew, not taken as the page loaded it: a phone's card
 * says how the round stands now (results confirmed since, a round started).
 */
async function read(visit, draw) {
  Object.assign(visit, { users: null, error: "" });
  draw();
  const [answer] = await Promise.all([readAdminUsers(), loadSeason(true)]);
  if (!visit.here) return;
  took(visit, answer);
  draw();
  view.querySelector("h1")?.focus();
}

/**
 * «Coaches». A coach who is no admin is shown the banner of the section, and nothing is read. Otherwise the title
 * takes the focus, the coaches are read, and the list is drawn; a keystroke in the search patches the list alone,
 * the width crossing 900px draws the other form, and leaving stops listening and closes the window of a new coach.
 */
export async function renderAdminCoaches() {
  if (!isAdminViewer()) {
    patch(view, adminRefusalMarkup());
    view.querySelector("h1")?.focus();
    return;
  }
  const visit = { here: true, users: null, error: "", query: "" };
  const draw = () => {
    if (visit.here) patch(view, markupOf(visit));
  };
  const group = listenerGroup(view);
  group.on("input", "[data-coach-search]", (event, input) => {
    visit.query = input.value;
    const list = view.querySelector("[data-coach-list]");
    if (list && visit.users) patch(list, listMarkup(modelOf(visit)));
  });
  group.on("click", "[data-coach-new]", (event, button) => openCoachNew(button, {
    users: () => visit.users ?? [],
    onUsers: (answer) => {
      if (!visit.here) return;
      took(visit, answer);
      draw();
    },
  }));
  group.on("click", "[data-coaches-again]", () => void read(visit, draw));
  group.own(onPhoneChange(() => drawKeepingFocus(view, draw, "h1")));
  onScreenLeave("admin-coaches", () => {
    visit.here = false;
    group.release();
    closeCoachNew();
  });
  draw();
  view.querySelector("h1")?.focus();
  await read(visit, draw);
}
