/**
 * A coach's profile (`#/coaches/:uid`): CoachProfile.html up to 900px, DeskCoachProfile.html from 901px — since when he
 * coaches and how many teams, his Telegram to write to, his teams with their place in the table, the meetings of the
 * looking coach's teams with his, and the challenge to a friendly (decisions 24–26 of the stage 10 plan).
 *
 * Read from what the server already sends: the coach and his teams (`GET /api/players/:uid`), the table (`/api/season`)
 * and the looking coach's own games (`/api/games`), whose confirmed matches against this coach's teams are «Your
 * meetings», newest first. A team's line is the table's when it has a row there, «friendlies» otherwise; a row leads to
 * the opponent's page (one's own to its overview). One's own profile has no Telegram to press, no meetings and no
 * challenge; a contact the forms would refuse is text. An admin has the way to the coach's page in the administration
 * (stage 12, `adminCoachUrl`). A guest never gets here (the address is a signed-in one, rule 4).
 *
 * The letter's circle is the header's colour: the prototype's maroon has no token. Long names wrap; nothing is cut.
 */
import { teamLogoProps } from "../../ui/team-logo.mjs";
import { drawKeepingFocus, escapeHtml, patch } from "../../core/dom.mjs";
import { formatDay } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { adminCoachUrl, challengeUrl, playerTeamUrl, teamUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { activeTeam } from "../../data/active-team.mjs";
import { readCoach } from "../../data/coaches.mjs";
import { loadGames, onGamesChange } from "../../data/games.mjs";
import { seasonTable, teamTableRow } from "../../data/season-table.mjs";
import { gameOutcome, teamInitials } from "../../data/team-record.mjs";
import { raceTitleOf } from "../../data/teams.mjs";
import { telegramUrl } from "../../domain/account.mjs";
import { renderTeamFace } from "../../shell/team-switcher.mjs";
import { renderButton } from "../../ui/button.mjs";
import { coachInitial, renderCoachLetter } from "../../ui/coach-letter.mjs";
import { icon } from "../../ui/icons.mjs";
import { assertLinkHref, classNames } from "../../ui/markup.mjs";
import { renderPageHead } from "../../ui/page-head.mjs";
import { resultLabels } from "../../ui/result-pill.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { isPhone, onPhoneChange } from "../team/roster/screen.mjs";

/** «Orc · in the season · #5 · 9 · 3/0/3», or «Black Orc · friendlies»; a race the reference does not know is left out. */
function teamLine(team, row) {
  const race = raceTitleOf(team.baseTeamSlug);
  const line = row
    ? t("coach.teamInSeason", { race, place: row.rank, points: row.points, record: `${row.wins}/${row.draws}/${row.losses}` })
    : t("coach.teamFriendlies", { race });
  return race ? line : line.replace(/^\s*·\s*/, "");
}

/** Which side of a game of the looking coach's is ours and which is `userId`'s team; null for any other game. */
function sidesAgainst(game, userId) {
  if (game.home?.user?.id === userId && game.away?.team) return { ours: "away", theirs: "home" };
  if (game.away?.user?.id === userId && game.home?.team) return { ours: "home", theirs: "away" };
  return null;
}

/** When a game was confirmed, as a number to sort by; a stamp that cannot be read is the oldest. */
const confirmedAt = (game) => Date.parse(game.confirmedAt) || 0;

/** «Your meetings» (decision 24): the looking coach's confirmed matches against this coach's teams, newest first, from our side. */
function meetingsOf(games, userId) {
  return games
    .map((game) => {
      const sides = sidesAgainst(game, userId);
      return { game, sides, tone: sides ? gameOutcome(game, game[sides.ours].team.id) : null };
    })
    .filter(({ tone }) => tone)
    .sort((one, other) => confirmedAt(other.game) - confirmedAt(one.game))
    .map(({ game, sides: { ours, theirs }, tone }) => ({
      line: game.kind === "friendly" ? t("coach.meetingFriendly", { date: formatDay(game.confirmedAt) }) : t("coach.meetingLeague", { round: game.roundNumber }),
      teams: t("league.vs", { home: game[ours].team.name ?? "", away: game[theirs].team?.name ?? "" }),
      outcome: `${resultLabels(tone).name} ${Number(game[`${ours}Touchdowns`])}–${Number(game[`${theirs}Touchdowns`])}`,
      tone,
    }));
}

/** The year since which he coaches; "" for a date that cannot be read. */
function sinceOf(createdAt) {
  const year = new Date(createdAt ?? "").getFullYear();
  return Number.isFinite(year) ? t("coach.since", { year }) : "";
}

/**
 * What a coach's profile says.
 *
 * @param {object} input
 * @param {object} input.user the coach (`publicAdminUser`)
 * @param {object[]} input.teams his saved teams (`publicSavedTeamSummary`)
 * @param {object|null} input.seasonData `/api/season`; null while it is not read
 * @param {object[]} input.games the looking coach's games
 * @param {string} input.viewerId the looking coach
 * @param {string|null} [input.activeTeamId] his active team, which challenges; the challenge opens with this coach chosen,
 *   and a coach with no team has none (the server would refuse him: there is no team of his to play)
 * @param {boolean} [input.admin] an admin looks
 */
export function coachModel({ user, teams, seasonData, games = [], viewerId, activeTeamId = null, admin = false }) {
  const mine = viewerId === user.id;
  const table = seasonTable(seasonData);
  return {
    userId: user.id,
    login: user.login ?? "",
    initial: coachInitial(user.login),
    since: sinceOf(user.createdAt),
    teamsLine: t("coach.teamsCount", { count: user.savedTeamCount ?? teams.length }),
    telegram: { handle: user.telegram ?? "", href: telegramUrl(user.telegram) },
    mine,
    teams: teams.map((team) => ({
      id: team.id, name: team.name ?? "", initials: teamInitials(team.name), line: teamLine(team, teamTableRow(table, team.id)),
      ...teamLogoProps(team),
      href: mine ? teamUrl(team.id) : playerTeamUrl(user.id, team.id), draft: team.stage === "draft",
    })),
    meetings: mine ? [] : meetingsOf(Array.isArray(games) ? games : [], user.id),
    challengeHref: !mine && activeTeamId && teams.length > 0 ? challengeUrl(activeTeamId, user.id) : "",
    adminHref: admin ? adminCoachUrl(user) : "",
  };
}

/** A link, its address checked first; Telegram's opens a tab of its own that knows nothing of the page. */
function link(href, className, label, outside = false) {
  assertLinkHref(href);
  return `<a class="${className}" href="${escapeHtml(href)}"${outside ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
}

/** «Write» (a phone's) or «Write on Telegram» (a desk's): only to another coach's contact the forms accept. */
const writeMarkup = (model, key) => (!model.mine && model.telegram.href ? link(model.telegram.href, "g-coach__write", escapeHtml(t(key)), true) : "");

/** The letter in its circle, the login, and the line under it (a desk's with the contact at its end). */
function idMarkup(model, { phone }) {
  const parts = [model.since, model.teamsLine].filter(Boolean).map(escapeHtml);
  if (!phone && model.telegram.handle) parts.push(`${escapeHtml(t("coach.telegram"))} <b>${escapeHtml(model.telegram.handle)}</b>`);
  const actions = phone ? "" : [writeMarkup(model, "coach.writeDesk"), model.challengeHref ? renderButton({ label: t("coach.challengeDesk"), kind: "primary", href: model.challengeHref }) : ""].join("");
  return `<div class="g-coach__id">${renderCoachLetter({ initial: model.initial, size: 64, className: "g-coach__letter" })}<div class="g-coach__who">`
    + `<p class="g-coach__login">${escapeHtml(model.login)}</p><p class="g-coach__line">${parts.join(" · ")}</p></div>`
    + `${actions ? `<div class="g-coach__actions">${actions}</div>` : ""}</div>`;
}

/** A phone's card of the contact (CoachProfile.html): «Telegram» over the contact, «Write», and who sees it. */
function telegramCardMarkup(model) {
  if (!model.telegram.handle) return "";
  return `<div class="g-coach__tgcard"><div class="g-coach__tgrow"><span class="g-coach__tgtext"><span class="g-coach__tglabel">${escapeHtml(t("coach.telegram"))}</span>`
    + `<b class="g-coach__handle">${escapeHtml(model.telegram.handle)}</b></span>${writeMarkup(model, "coach.write")}</div>`
    + `<p class="g-coach__note">${escapeHtml(t("coach.contactNote"))}</p></div>`;
}

/** His teams: each a link to its page, the tile of its letters, its name and line, the short chevron CoachProfile draws. */
const teamsMarkup = (teams) => `<div class="g-coach__teams">${teams.map((team) => link(team.href, "g-coach__team", `${renderTeamFace(team)}${icon("chevronShort", 16)}`)).join("")}</div>`;

/** «Your meetings»: «Round 3 · league» over «Ours — Theirs», the outcome at the right in its tone; the words when there are none. */
function meetingsMarkup(model, heading) {
  if (model.mine) return "";
  const rows = model.meetings.map((meeting) => `<div class="g-coach__meeting"><span class="g-coach__match"><span class="g-coach__when">${escapeHtml(meeting.line)}</span>`
    + `<span class="g-coach__vs">${escapeHtml(meeting.teams)}</span></span>`
    + `<span class="${classNames("g-coach__outcome", `g-coach__outcome--${meeting.tone}`)}">${escapeHtml(meeting.outcome)}</span></div>`).join("");
  const body = rows || `<p class="g-coach__none">${escapeHtml(t("coach.noMeetings"))}</p>`;
  return `<section class="g-coach__meetings g-coach__card" aria-labelledby="coach-meetings">${heading("coach-meetings", t("coach.meetings"))}${body}</section>`;
}

/** The way to the coach's page in the administration, an admin's only. */
const adminMarkup = (model) => (model.adminHref ? link(model.adminHref, "g-coach__admin", escapeHtml(t("coach.admin"))) : "");

/**
 * The profile in the form of the width.
 * @param {ReturnType<typeof coachModel>} model
 * @param {{phone: boolean}} options
 */
export function coachMarkup(model, { phone }) {
  if (phone) {
    const caption = (id, words) => `<h2 class="g-coach__caption" id="${id}">${escapeHtml(words)}</h2>`;
    const challenge = model.challengeHref
      ? `<div class="g-coach__challenge">${renderButton({ label: t("coach.challenge"), kind: "primary", href: model.challengeHref, block: true })}</div>`
      : "";
    return `${renderPageHead({ title: t("coach.title") })}<div class="g-coach g-coach--phone" data-screen="coach-profile">${idMarkup(model, { phone })}`
      + `${telegramCardMarkup(model)}${caption("coach-teams", t("coach.teams"))}${teamsMarkup(model.teams)}${meetingsMarkup(model, caption)}${challenge}${adminMarkup(model)}</div>`;
  }
  const title = (id, words) => `<h2 class="g-coach__title" id="${id}">${escapeHtml(words)}</h2>`;
  return `${renderPageHead({ title: t("coach.title"), sub: t("coach.sub"), metaHtml: adminMarkup(model) })}<div class="g-coach g-coach--desk" data-screen="coach-profile">`
    + `${idMarkup(model, { phone })}<div class="g-coach__grid"><section class="g-coach__card" aria-labelledby="coach-teams">${title("coach-teams", t("coach.teams"))}`
    + `${teamsMarkup(model.teams)}</section>${meetingsMarkup(model, title)}</div></div>`;
}

/** The page while it is read, and the page of a read refused: the title alone, seen on a phone too. */
const bareMarkup = (title) => renderPageHead({ title, phone: true });

/** The page as the visit holds it. */
function markupOf(visit) {
  const { answer } = visit;
  if (!answer) return bareMarkup(t("coach.loading"));
  if (answer.error) return bareMarkup(answer.code === "PLAYER_NOT_FOUND" ? t("coach.notFound") : t("coach.failed", { reason: answer.error }));
  const viewer = state.auth.currentUser;
  const { error: gamesError, loaded, items } = state.games;
  return coachMarkup(coachModel({
    ...answer, seasonData: state.season.data ?? null, games: loaded && !gamesError ? items : [], viewerId: viewer?.id ?? "", activeTeamId: activeTeam()?.id ?? null,
    admin: Boolean(viewer?.isAdmin),
  }), { phone: isPhone() });
}

/**
 * A coach's profile. The title says it is being read, its focus taken; then the coach, the table and the games are
 * read together, and the page is drawn with the title in focus. It is drawn again when the games change and when the
 * width crosses 900px (the focus kept, or on the title). Leaving stops listening.
 * @param {string} userId
 */
export async function renderCoachProfile(userId) {
  const visit = { here: true, answer: null };
  const draw = () => {
    if (visit.here) patch(view, markupOf(visit));
  };
  const offs = [onGamesChange(draw), onPhoneChange(() => drawKeepingFocus(view, draw, "h1"))];
  onScreenLeave("coach-profile", () => {
    visit.here = false;
    for (const off of offs) off();
  });
  patch(view, markupOf(visit));
  view.querySelector("h1")?.focus();
  const [answer] = await Promise.allSettled([readCoach(userId), loadSeason(), loadGames()]);
  if (!visit.here) return;
  visit.answer = answer.value;
  draw();
  view.querySelector("h1")?.focus();
}
