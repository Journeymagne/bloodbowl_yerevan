/**
 * An opponent's page (`#/coaches/:uid/teams/:tid`): OppTeam.html up to 900px, DeskOppTeam.html from 901px — the team's
 * place, form and value, our meeting and the next match, its coach and Telegram, its roster whose skills open their
 * rule and what the dice showed. What it says is team-model.mjs's; this draws it and keeps the visit.
 *
 * A phone's page (OppTeam.html), in its order: «‹ Table», the head (the team's letters in a circle, its name, the race
 * leading to its rules, the place, the coach leading to his page — the prototype has no coach in the line, but a phone
 * has no other way to his page), «Next opponent», «Our meeting», the tiles, the form, the coach's card (his Telegram, or
 * his page for a contact the forms would refuse), the roster as rows, the note that the page is read-only. A desk's
 * (DeskOppTeam.html): the band (the circle, «‹ Season», the name, the line, Telegram at its right), then a column of
 * the next match on the header's colour, our meeting, a card of the tiles and the form and the note, beside the roster
 * as columns in a card that scrolls sideways inside itself.
 *
 * A skill's chip opens the skill's sheet of the roster (07d's `skillSheetMarkup`): its rule and, for a skill an
 * advancement rolled on the site, what the dice showed (`rollBlockMarkup` over the public rolls, stage 10 Task 1).
 * Closing it gives the focus back to the chip. No row leads to a player: an opponent's career is his coach's (07e).
 *
 * One's own team at this address goes to its overview (decision 23). A read the server refused says why, under the
 * page's way back, and nothing else; a coach the league does not have is said as such (pre-flight L8). The table and
 * the games not read say so where the cards would be, and the rest is drawn. Long names wrap; nothing is cut.
 */
import { drawKeepingFocus, escapeHtml, focusLost, patch } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { teamUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { activeTeam } from "../../data/active-team.mjs";
import { readCoachTeam } from "../../data/coaches.mjs";
import { loadGames, onGamesChange } from "../../data/games.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { renderFormStrip } from "../../ui/form-strip.mjs";
import { icon } from "../../ui/icons.mjs";
import { renderKpiGrid } from "../../ui/kpi-tile.mjs";
import { assertLinkHref, classNames, dataAttributes } from "../../ui/markup.mjs";
import { renderPlayerBadge } from "../../ui/number-badge.mjs";
import { renderResultPill } from "../../ui/result-pill.mjs";
import { patchWithModal, wireSheets } from "../../ui/sheet.mjs";
import { renderSkillChips, wireSkillChips } from "../../ui/skill-chip.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { rollBlockMarkup } from "../team/roster/roll-view.mjs";
import { isPhone, onPhoneChange } from "../team/roster/screen.mjs";
import { SKILL_SHEET, skillSheetMarkup } from "../team/roster/sheets.mjs";
import { opponentModel, wayBack } from "./team-model.mjs";

/** A link, its address checked first. */
function link(href, className, inner, extra = "") {
  assertLinkHref(href);
  return `<a class="${className}" href="${escapeHtml(href)}"${extra}>${inner}</a>`;
}

/** Telegram opens in a tab of its own, telling it nothing of the page it came from. */
const OUTSIDE = ' target="_blank" rel="noopener noreferrer"';

/** «‹ Table» on a phone, «‹ Season» on a desk. */
const backMarkup = ({ label, href }) => link(href, "g-opp__back", `${icon("back", 14)}<span>${escapeHtml(label)}</span>`);

/** The line under the name: the race leading to its rules, the place, the coach leading to his page. */
function metaMarkup(model) {
  const parts = [
    model.race ? link(model.race.href, "g-opp__race", `${icon("book", 12)}<span>${escapeHtml(model.race.title)}</span>`, ` title="${escapeHtml(t("league.raceTitle"))}"`) : "",
    model.place === null ? "" : `<span>${escapeHtml(t("opponent.place", { place: model.place }))}</span>`,
    link(model.coach.href, "g-opp__coachlink", escapeHtml(t("opponent.coachLine", { coach: model.coach.login }))),
  ].filter(Boolean);
  return `<p class="g-opp__meta">${parts.join('<span aria-hidden="true">·</span>')}</p>`;
}

/** The team's letters in a circle, its name, and the line under it. */
const idMarkup = (model) => `<span class="g-opp__crest" aria-hidden="true">${escapeHtml(model.initials)}</span>`
  + `<div class="g-opp__title">${model.phone ? "" : backMarkup(model.back)}<h1 class="g-opp__name" tabindex="-1">${escapeHtml(model.name)}</h1>${metaMarkup(model)}</div>`;

/** «Next opponent» and the round: a card that leads to the active team's matches. */
function nextMarkup(next) {
  if (!next) return "";
  return link(next.href, "g-opp__next", `<span class="g-opp__nexttext"><span class="g-opp__nextlabel">${escapeHtml(t("opponent.next"))}</span>`
    + `<span class="g-opp__nextline">${escapeHtml(next.line)}</span></span>${icon("chevron", 18)}`);
}

/** «Our meeting»: its outcome, the round or «Friendly», and the score, ours first. */
function meetingMarkup(meeting) {
  if (!meeting) return "";
  return `<div class="g-opp__meeting">${renderResultPill({ result: meeting.result })}<span class="g-opp__meettext">`
    + `<span class="g-opp__meetlabel">${escapeHtml(t("opponent.meeting"))}</span><span class="g-opp__meetline">${escapeHtml(meeting.line)}</span></span>`
    + `<span class="g-opp__score">${escapeHtml(meeting.score)}</span></div>`;
}

/** The table and the games, each said when it could not be read. */
function failuresMarkup(failures) {
  const lines = [
    failures.season ? renderCallout({ tone: "danger", title: t("teamOverview.seasonFailed", { reason: failures.season }) }) : "",
    failures.games ? renderCallout({ tone: "danger", title: t("teamOverview.gamesFailed", { reason: failures.games }) }) : "",
  ].join("");
  return lines ? `<div class="g-opp__failed" role="alert">${lines}</div>` : "";
}

/** «Form» and its five squares, the oldest first; nothing outside the table. */
function formMarkup(form) {
  if (!form.length) return "";
  return `<div class="g-opp__formrow"><span class="g-opp__formlabel">${escapeHtml(t("opponent.form"))}</span>${renderFormStrip({ results: form })}</div>`;
}

/** A phone's card of the coach: his Telegram to arrange the match, or his page for a contact the forms would refuse. */
function coachCardMarkup({ coach, telegram }) {
  const sub = telegram.handle ? `<span class="g-opp__coachsub">${escapeHtml(t("opponent.coachCardSub", { telegram: telegram.handle }))}</span>` : "";
  const inner = `<span class="g-opp__plane">${icon("send", 18)}</span><span class="g-opp__coachtext">`
    + `<span class="g-opp__coachname">${escapeHtml(t("opponent.coachCard", { coach: coach.login }))}</span>${sub}</span>${icon("chevron", 16)}`;
  return telegram.href ? link(telegram.href, "g-opp__coach", inner, OUTSIDE) : link(coach.href, "g-opp__coach", inner);
}

/** A desk's Telegram at the right of the band: a link, or the contact as text when the forms would refuse it. */
function telegramMarkup({ handle, href }) {
  if (!handle) return "";
  const inner = `<span class="g-opp__plane">${icon("send", 18)}</span><span>${escapeHtml(handle)}</span>`;
  return href ? link(href, "g-opp__tg", inner, OUTSIDE) : `<span class="g-opp__tg g-opp__tg--text">${inner}</span>`;
}

/** A player's chips, wrapping; none for a player with no skill (the prototypes draw nothing). */
const chipsMarkup = (skills) => (skills.length ? `<div class="g-opp__chips">${renderSkillChips({ skills })}</div>` : "");

/** The SPP figure and its word, a phone's at the right of a row. */
const sppMarkup = (spp) => `<span class="g-opp__spp"><span class="g-opp__sppn">${escapeHtml(spp)}</span>`
  + `<span class="g-opp__sppk">${escapeHtml(t("teamRoster.group.spp"))}</span></span>`;

/** A phone's row (OppTeam.html): the number, the name and its line, the chips under them, the SPP. */
const phoneRowMarkup = (row) => `<div class="g-opp__player" role="listitem"${dataAttributes({ squadKey: row.key })}>`
  + `${renderPlayerBadge({ number: row.number, kind: "lineman", captain: row.captain })}<div class="g-opp__who">`
  + `<span class="g-opp__pname">${escapeHtml(row.name)}</span><span class="g-opp__pline">${escapeHtml(row.line)}</span>${chipsMarkup(row.skills)}</div>`
  + `${sppMarkup(row.spp)}</div>`;

/** A desk's row (DeskOppTeam.html): the number, the name over the position, the chips, TD, CAS and SPP in columns. */
function deskRowMarkup(row) {
  const cell = (className, inner) => `<span class="${className}" role="cell">${inner}</span>`;
  const position = row.out ? t("opponent.outDesk", { position: row.position }) : row.position;
  return `<div class="g-opp__player" role="row"${dataAttributes({ squadKey: row.key })}>`
    + cell("g-opp__cell", renderPlayerBadge({ number: row.number, kind: "lineman", captain: row.captain }))
    + cell("g-opp__who", `<span class="g-opp__pname">${escapeHtml(row.name)}</span><span class="g-opp__pline">${escapeHtml(position)}</span>`)
    + cell("g-opp__cell", chipsMarkup(row.skills))
    + cell("g-opp__num", escapeHtml(row.touchdowns)) + cell("g-opp__num", escapeHtml(row.casualties))
    + cell("g-opp__sppn", escapeHtml(row.spp)) + "</div>";
}

/** The desk's heads of the columns: «#», «Player», «Skills», TD, CAS, SPP. */
function columnsMarkup() {
  const words = ["#", t("opponent.col.player"), t("opponent.col.skills"), t("teamRoster.counter.touchdowns"), t("teamRoster.counter.casualties"), t("teamRoster.group.spp")];
  const sides = ["", "", "", "center", "center", "end"];
  return `<div role="rowgroup"><div class="g-opp__cols" role="row">${words.map((word, at) => `<span class="${classNames("g-opp__col", sides[at] && `g-opp__col--${sides[at]}`)}" role="columnheader">${escapeHtml(word)}</span>`).join("")}</div></div>`;
}

/** «Roster» and how many; the rows, or the words for a race the reference does not know. */
function squadMarkup(model) {
  const head = `<h2 class="g-opp__squadtitle" id="opp-squad">${escapeHtml(t("opponent.squad"))}`
    + ` <span class="g-opp__count">${escapeHtml(t("opponent.count", { count: model.squad.length }))}</span></h2>`;
  if (!model.raceKnown) return `<section class="g-opp__squad" aria-labelledby="opp-squad">${head}<p class="g-opp__norace">${escapeHtml(t("opponent.noRace"))}</p></section>`;
  if (model.phone) return `<section class="g-opp__squad" aria-labelledby="opp-squad">${head}<div role="list">${model.squad.map(phoneRowMarkup).join("")}</div></section>`;
  return `<section class="g-opp__squad" aria-labelledby="opp-squad"><div class="g-opp__inner">${head}<div class="g-opp__rows" role="table" aria-labelledby="opp-squad">`
    + `${columnsMarkup()}<div role="rowgroup">${model.squad.map(deskRowMarkup).join("")}</div></div></div></section>`;
}

const readOnlyMarkup = () => `<p class="g-opp__readonly">${escapeHtml(t("opponent.readOnly"))}</p>`;

/** The skill's sheet over the page, for the chip pressed: its rule and what the dice showed; nothing for a row or skill gone. */
function sheetMarkup(model, sheet, data) {
  const line = sheet && model.lines.find((item) => item.key === sheet.key);
  if (!line || !line.skills.some(({ name }) => name === sheet.name)) return "";
  return skillSheetMarkup({ data, line, name: sheet.name, advancementHtml: rollBlockMarkup({ line, skill: sheet.name, rolls: { rolls: model.rolls } }) });
}

/**
 * The page in the form of the width.
 * @param {ReturnType<typeof opponentModel>} model
 * @param {{sheet?: {key: string, name: string}|null, failures?: {season?: string, games?: string}, data?: object}} [options]
 */
export function opponentMarkup(model, { sheet = null, failures = {}, data = state.data } = {}) {
  const play = renderButton({ label: t("nav.tabletop"), href: `/play?team=${encodeURIComponent(model.teamId)}` });
  const tiles = renderKpiGrid(model.tiles);
  const squad = squadMarkup(model);
  const sheetHtml = sheetMarkup(model, sheet, data);
  if (model.phone) {
    return `<div class="g-opp g-opp--phone" data-screen="coach-team">${backMarkup(model.back)}<div class="g-opp__id">${idMarkup(model)}</div>`
      + `${failuresMarkup(failures)}${nextMarkup(model.next)}${meetingMarkup(model.meeting)}${tiles}${formMarkup(model.form)}`
      + `${coachCardMarkup(model)}${play}${squad}${readOnlyMarkup()}${sheetHtml}</div>`;
  }
  const card = tiles || model.form.length ? `<section class="g-opp__card">${tiles}${formMarkup(model.form)}</section>` : "";
  return `<div class="g-opp g-opp--desk" data-screen="coach-team"><header class="g-opp__head"><div class="g-opp__id">${idMarkup(model)}</div>`
    + `${telegramMarkup(model.telegram)}</header><div class="g-opp__body"><div class="g-opp__left">${failuresMarkup(failures)}${nextMarkup(model.next)}`
    + `${meetingMarkup(model.meeting)}${card}${play}${readOnlyMarkup()}</div>${squad}</div>${sheetHtml}</div>`;
}

/** The page while the team is read, and the page of a read refused: the way back and the title alone. */
function bareMarkup(title, phone) {
  const back = backMarkup(wayBack({ phone, activeTeamId: activeTeam()?.id ?? null }));
  return `<div class="${classNames("g-opp", phone ? "g-opp--phone" : "g-opp--desk g-opp--bare")}" data-screen="coach-team">${back}`
    + `<h1 class="g-opp__name" tabindex="-1">${escapeHtml(title)}</h1></div>`;
}

/** What a refusal says: a coach the league does not have in its own words (pre-flight L8), any other the server's. */
const refusalTitle = ({ error, code }) => (code === "PLAYER_NOT_FOUND" ? t("coach.notFound") : t("opponent.failed", { reason: error }));

/** The page as the visit holds it: the wait, a refusal, or the team with the table and the games as last read. */
function markupOf(visit) {
  const phone = isPhone();
  if (!visit.answer) return bareMarkup(t("opponent.loading"), phone);
  if (visit.answer.error) return bareMarkup(refusalTitle(visit.answer), phone);
  const { error: gamesError, loaded, items } = state.games;
  const seasonError = state.season.data ? "" : state.season.error;
  const model = opponentModel({
    ...visit.answer, seasonData: state.season.data ?? null, games: loaded && !gamesError ? items : [], activeTeamId: activeTeam()?.id ?? null, phone,
  });
  if (visit.sheet && !sheetMarkup(model, visit.sheet, state.data)) Object.assign(visit, { sheet: null, opener: null });
  return opponentMarkup(model, { sheet: visit.sheet, failures: { season: seasonError, games: gamesError } });
}

/** One's own team: the overview is where it is seen. */
const ownTeam = (userId, teamId) => state.auth.currentUser?.id === userId && state.myTeams.items.some((item) => item.id === teamId);

/** The listeners of a visit: the games, the width, a chip pressed, a sheet closed. */
function wireVisit(visit, draw) {
  return [
    onGamesChange(draw),
    onPhoneChange(() => drawKeepingFocus(view, draw, "h1")),
    wireSkillChips(view, (name, chip) => {
      const key = chip.closest("[data-squad-key]")?.getAttribute("data-squad-key");
      if (!key || !visit.answer || visit.answer.error) return;
      Object.assign(visit, { sheet: { key, name }, opener: chip });
      draw();
    }),
    wireSheets(view, {
      onClose: (id) => {
        if (id !== SKILL_SHEET) return;
        const { opener } = visit;
        Object.assign(visit, { sheet: null, opener: null });
        draw();
        (opener && !focusLost(opener) ? opener : view.querySelector("h1"))?.focus();
      },
    }),
  ];
}

/**
 * The opponent's page. One's own team goes to its overview, and nothing is read. Otherwise the title says the team is
 * being read, its focus taken; then the team, the table and the games are read together, and the page is drawn with
 * the title in focus. It is drawn again when the games change and when the width crosses 900px (the focus kept, or on
 * the title), and with a skill's sheet open or closed. Leaving closes the sheet and stops listening.
 * @param {string} userId @param {string} teamId
 */
export async function renderCoachTeam(userId, teamId) {
  if (ownTeam(userId, teamId)) {
    location.replace(teamUrl(teamId));
    return;
  }
  const visit = { here: true, answer: null, sheet: null, opener: null };
  const draw = () => {
    if (visit.here) patchWithModal(view, markupOf(visit), visit.sheet ? `#${SKILL_SHEET}` : "");
  };
  const offs = wireVisit(visit, draw);
  onScreenLeave("coach-team", () => {
    visit.here = false;
    for (const dialog of view.querySelectorAll("dialog")) if (dialog.open) dialog.close();
    for (const off of offs) off();
  });
  patch(view, markupOf(visit));
  view.querySelector("h1")?.focus();
  const [answer] = await Promise.allSettled([readCoachTeam(userId, teamId), loadSeason(), loadGames()]);
  if (!visit.here) return;
  visit.answer = answer.value;
  draw();
  view.querySelector("h1")?.focus();
}
