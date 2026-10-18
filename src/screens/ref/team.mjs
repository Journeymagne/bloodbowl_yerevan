/**
 * A team's rules, the article of a race (`#/teams/human`): the facts a team opens with (its tier, its
 * re-rolls, its medical staff, the leagues it may play in), the roster position by position, its special
 * rules with their text, and the teams of the league that play the race.
 *
 * Everything but the last comes from the team's page in the vault (`page.team`), not from the page's HTML.
 * The special rules' text is the Special Rules page, cut at its `<h3>` lines: its headings are in English
 * in both vaults, and so are the rules' names a team lists. The league's teams are the rows of the season's
 * table: a coach is taken to the team (their own, or a rival's); a guest, who cannot open a coach's page,
 * is shown the names and the places.
 *
 * The roster is drawn twice, as a card for each position and as a table, and the width shows one (the
 * article's sheet). The place is the server's rank as it is: it has gaps where a coach withdrew, as the
 * season's table does.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { playerTeamUrl, teamUrl } from "../../core/routes.mjs";
import { state } from "../../core/state.mjs";
import { specialRuleMatchKey, teamApothecaryAccess, teamLeagueOptions, teamSpecialRuleTokens } from "../../domain/roster/team-rules.mjs";
import { PLAYER_STATS, parseAccessCodes, rowCost, rowsForTeam } from "../../domain/roster/values.mjs";
import { renderKeyValueRow, renderNavRow, renderRankedRow } from "../../ui/list-row.mjs";
import { classNames } from "../../ui/markup.mjs";
import { renderStatStrip } from "../../ui/stat-strip.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { skillLink } from "./bodies.mjs";

const SPECIAL_RULES_ID = "general-information-special-rules";

/** What a team that says `Favoured of Khorne` (or `Favored of Nurgle`) is told: the page has one section for them all. */
const FAVOURED_KEY = specialRuleMatchKey("Favoured of...");

const HEADING = /<h3[^>]*>([\s\S]*?)<\/h3>/g;

/**
 * The Special Rules page cut at its `<h3>` lines: each rule's text (all that stands between its heading and
 * the next) under the key of its heading. The page's opening paragraph belongs to no rule and is left out.
 *
 * @param {{html?: string}|null|undefined} page the Special Rules page
 * @returns {Map<string, {title: string, html: string}>} `title` is the heading's text, `html` what follows it
 */
export function specialRuleSections(page) {
  const html = String(page?.html ?? "");
  const headings = [...html.matchAll(HEADING)];
  return new Map(headings.map((heading, index) => {
    const title = heading[1].replace(/<[^>]*>/g, "").trim();
    const start = heading.index + heading[0].length;
    return [specialRuleMatchKey(title), { title, html: html.slice(start, headings[index + 1]?.index ?? html.length).trim() }];
  }));
}

/** The section a rule of a team stands for: under its own name, and every `Favoured of X` under `Favoured of...`. Null when the page has none. */
export function specialRuleText(sections, rule) {
  const key = specialRuleMatchKey(rule);
  return sections.get(key.startsWith(FAVOURED_KEY) ? FAVOURED_KEY : key) ?? null;
}

/** The rows of the season's table for teams of the race `slug` names (`teams/human`), by place, without the withdrawn. */
export function leagueTeamsOf(standings, slug) {
  return (standings ?? [])
    .filter((entry) => entry.team?.baseTeamSlug === slug && !entry.withdrawnAt)
    .sort((first, second) => first.rank - second.rank);
}

const dash = (value) => value || "-";

function factsMarkup(page) {
  const meta = page.team?.meta ?? {};
  return `<div class="g-ref-team__facts">`
    + renderKeyValueRow({ label: t("roster.tier"), value: dash(meta.league) })
    + renderKeyValueRow({ label: t("sidebar.rerolls"), value: dash(meta.rerolls) })
    + renderKeyValueRow({ label: t("sidebar.apothecary"), value: teamApothecaryAccess(page) })
    + renderKeyValueRow({ label: t("roster.leagueAccess"), value: dash(teamLeagueOptions(page).join(", ")) })
    + `</div>`;
}

/** The skill categories a position may take, written as the vault does but a letter at a time: "G P / A S D". */
function accessOf(row) {
  const letters = (list) => dash(parseAccessCodes(list).join(" "));
  return `${letters(row.primary)} / ${letters(row.secondary)}`;
}

/** The position's own skills, each a link to its page where there is one; empty when it has none. */
const skillsOf = (data, row) => (row.skills ?? []).map((skill) => skillLink(data, skill)).join(", ");

function positionCard(data, row) {
  const skills = skillsOf(data, row);
  const caption = t("ref.team.caption", { qty: row.qty, access: accessOf(row) });
  return `<li class="g-ref-position"><div class="g-ref-position__head"><div class="g-ref-position__who">`
    + `<p class="g-ref-position__name">${escapeHtml(row.position)}</p><p class="g-ref-position__caption">${escapeHtml(caption)}</p></div>`
    + `<span class="g-ref-position__cost">${escapeHtml(rowCost(row))}</span></div>`
    + renderStatStrip({ values: Object.fromEntries(PLAYER_STATS.map((stat) => [stat, row[stat]])) })
    + `${skills ? `<p class="g-ref-position__skills">${skills}</p>` : ""}</li>`;
}

/** The column classes of the vault's tables (scripts/lib/render-table.mjs), which prose.css draws. */
const CENTRED = "fit-cell center-cell";
const PRICE = "fit-cell number-cell";
const KEPT_WHOLE = "nowrap-cell";

const headerCell = (label, cls = "") => `<th${cls ? ` class="${cls}"` : ""}>${escapeHtml(label)}</th>`;
const bodyCell = (html, cls = "") => `<td${cls ? ` class="${cls}"` : ""}>${html}</td>`;

function positionRow(data, row) {
  return `<tr>${bodyCell(escapeHtml(row.position))}${bodyCell(escapeHtml(row.qty), CENTRED)}${bodyCell(escapeHtml(rowCost(row)), PRICE)}`
    + PLAYER_STATS.map((stat) => bodyCell(escapeHtml(row[stat] ?? ""), CENTRED)).join("")
    + `${bodyCell(skillsOf(data, row))}${bodyCell(escapeHtml(accessOf(row)), KEPT_WHOLE)}</tr>`;
}

function rosterTable(data, rows) {
  const head = [headerCell(t("roster.positionHeader")), headerCell(t("roster.qtyHeader"), CENTRED), headerCell(t("sidebar.cost"), PRICE)]
    .concat(PLAYER_STATS.map((stat) => headerCell(t(`stats.${stat}`), CENTRED)))
    .concat([headerCell(t("roster.skillsLabel")), headerCell(t("ref.team.access"), KEPT_WHOLE)]);
  return `<div class="g-prose g-ref-roster"><div class="table-scroll"><table class="fit-table"><thead><tr>${head.join("")}</tr></thead>`
    + `<tbody>${rows.map((row) => positionRow(data, row)).join("")}</tbody></table></div></div>`;
}

/** A rule is its name over the page's text; where the page has none the name stands alone. The text is the build's own markup, as on the page. */
function ruleMarkup(sections, rule) {
  return `<section class="g-prose g-ref-rule"><h3>${escapeHtml(rule)}</h3>${specialRuleText(sections, rule)?.html ?? ""}</section>`;
}

const sectionMarkup = (title, bodyHtml, extra = "") => `<section class="${classNames("g-ref-team__section", extra)}"><h2>${escapeHtml(title)}</h2>${bodyHtml}</section>`;

function leagueRow(entry, viewer) {
  const { team, user, rank, points } = entry;
  const place = t("ref.team.place", { rank, points });
  if (!viewer.signedIn) return renderRankedRow({ title: team.name, caption: place });
  const href = viewer.teamIds.has(team.id) ? teamUrl(team) : playerTeamUrl(user, team);
  return renderNavRow({ href, title: team.name, desc: place });
}

/**
 * The body of a team's article: what the page says under the title the article draws.
 *
 * @param {object} props
 * @param {object} props.data the content vault of the language
 * @param {object} props.page the team's page
 * @param {object[]} [props.standings] the rows of the season's table, as the server sends them; without any the league's block is not drawn
 * @param {{signedIn: boolean, teamIds: Set<string>}} [props.viewer] whether the visitor has signed in, and which teams are theirs
 */
export function teamRulesMarkup({ data, page, standings = [], viewer = { signedIn: false, teamIds: new Set() } }) {
  const rows = rowsForTeam(page);
  const sections = specialRuleSections((data.pages ?? []).find((item) => item.id === SPECIAL_RULES_ID));
  const league = leagueTeamsOf(standings, page.slug);
  return `<div class="g-ref-team">${factsMarkup(page)}`
    + sectionMarkup(t("ref.team.positions"), `<ul class="g-ref-positions">${rows.map((row) => positionCard(data, row)).join("")}</ul>${rosterTable(data, rows)}`)
    + sectionMarkup(t("roster.specialRules"), teamSpecialRuleTokens(page).map((rule) => ruleMarkup(sections, rule)).join(""))
    + (league.length ? sectionMarkup(t("ref.team.inLeague"), league.map((entry) => leagueRow(entry, viewer)).join(""), "g-ref-inleague") : "")
    + `</div>`;
}

/** What a team's article takes from the app besides its page: the table as it has been read, and who is looking. */
export function teamContext() {
  return {
    standings: state.season.data?.standings ?? [],
    viewer: { signedIn: Boolean(state.auth.currentUser), teamIds: new Set((state.myTeams.items ?? []).map((team) => team.id)) },
  };
}

/**
 * Read the season if it has not been read, and say when it comes. A season that does not come (an error
 * is kept in `state.season`) is not said: the article stays as it was.
 *
 * @param {() => void} redraw draws the article again, now that the table is there
 * @returns {() => void} the visitor has left: the season that comes after this is not said
 */
export function watchSeason(redraw) {
  let here = true;
  if (!state.season.loaded) {
    loadSeason().then(() => {
      if (here && state.season.loaded) redraw();
    });
  }
  return () => {
    here = false;
  };
}
