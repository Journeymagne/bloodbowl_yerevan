/**
 * A match as a card: its heading with the state, a line of meta, the two
 * teams with "vs" or the score between them, and then whatever the screen
 * puts in the card (tiles, notes, actions).
 *
 * The card does not know what state a match is in. The screen decides which
 * tiles, notes and buttons a state has and passes them as markup from other
 * render…() functions: `statusHtml`, `tilesHtml`, `bodyHtml`, `actionsHtml`.
 * Names, lines and the score are text and are escaped.
 *
 * A card a heading outside it names (`labelledBy`: the screen's own section
 * heading, stage 09a's «Matches») has no heading of its own: the article is
 * labelled by that one, and the state is the screen's to draw beside it.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { assertLinkHref, classNames } from "./markup.mjs";

/** One team: its name — a link to the team when it has an address —, and a line under it when there is one. */
function renderSide(team, away) {
  const sub = team.sub ? `<span class="g-match__sub">${escapeHtml(team.sub)}</span>` : "";
  if (team.href) assertLinkHref(team.href);
  const name = team.href
    ? `<a class="g-match__name" href="${escapeHtml(team.href)}">${escapeHtml(team.name)}</a>`
    : `<span class="g-match__name">${escapeHtml(team.name)}</span>`;
  return `<div class="${classNames("g-match__side", away && "g-match__side--away")}">${name}${sub}</div>`;
}

/**
 * @param {object} props
 * @param {string} [props.title] "Next match", "Current match"; not needed with `labelledBy`
 * @param {string} [props.labelledBy] the id of a heading outside the card that names it: no heading inside
 * @param {string} [props.statusHtml] a status chip, in the card's heading row
 * @param {{left?: string, right?: string}} [props.meta] the quiet line: the round and where, when; both ends stay in place when only one is given
 * @param {{name: string, sub?: string, href?: string}} props.home us
 * @param {{name: string, sub?: string, href?: string}} props.away them; a name with `href` leads to the team
 * @param {string} [props.score] "2–1", between the names; "vs" while there is none
 * @param {boolean} [props.live] a match in progress: the card is ringed in the accent
 * @param {string} [props.tilesHtml] figures in two columns, such as compact kpi tiles
 * @param {string} [props.bodyHtml] anything else, between the tiles and the actions
 * @param {string} [props.actionsHtml] the buttons, one under another
 */
export function renderMatchCard({ title = "", labelledBy = "", statusHtml = "", meta = {}, home, away, score = "", live = false, tilesHtml = "", bodyHtml = "", actionsHtml = "" }) {
  if (!title && !labelledBy) throw new Error("a match card needs a title: it names the card");
  if (!home?.name) throw new Error("a match card needs a home team with a name");
  if (!away?.name) throw new Error("a match card needs an away team with a name");
  const head = labelledBy ? "" : `<header class="g-match__head"><h3 class="g-match__title">${escapeHtml(title)}</h3>${statusHtml}</header>`;
  const line = meta.left || meta.right
    ? `<div class="g-match__meta"><span>${escapeHtml(meta.left ?? "")}</span><span>${escapeHtml(meta.right ?? "")}</span></div>`
    : "";
  const middle = score
    ? `<span class="g-match__mid g-match__mid--score">${escapeHtml(score)}</span>`
    : `<span class="g-match__mid">${escapeHtml(t("ui.match.vs"))}</span>`;
  const teams = `<div class="g-match__teams">${renderSide(home, false)}${middle}${renderSide(away, true)}</div>`;
  const tiles = tilesHtml ? `<div class="g-match__tiles">${tilesHtml}</div>` : "";
  const actions = actionsHtml ? `<div class="g-match__actions">${actionsHtml}</div>` : "";
  const named = labelledBy ? ` aria-labelledby="${escapeHtml(labelledBy)}"` : "";
  return `<article class="${classNames("g-match", live && "g-match--live")}"${named}>${head}${line}${teams}${tiles}${bodyHtml}${actions}</article>`;
}
