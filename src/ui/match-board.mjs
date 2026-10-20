/**
 * The match board: the dark card at the head of a team's overview. Both teams
 * with a line under each name, the round and venue over the score (or a dash
 * pair while there is none), the match's state under it, and in a bar below,
 * the season's matches as squares and what the coach can do about this one.
 *
 * The board does not know what state a match is in or what may be done: the
 * screen decides and passes the state and the actions as markup from other
 * render…() functions (`statusHtml`, `actionsHtml`). Names, lines, the score
 * and the squares' labels are text and are escaped. The squares are no links:
 * they are smaller than a tap (decision 12 of stage 05), and the way to another
 * match is the screen's own.
 *
 * The design system's MatchBoard README is older than 0.9 (its actions are
 * «Start the match» and «Cancel the start»); its anatomy is kept. The actions
 * are 0.9's, from `matchActions` (shell/current-match.mjs); `renderBoardActions`
 * draws them.
 *
 * A side can carry more, as DeskOverview.html's does (stage 07d, decision 54):
 * a crest (`crestHtml`, `renderCrest`'s markup) or a letter in a circle
 * (`initial`, hidden from a screen reader: the name beside it is read) at its
 * outer edge, with the name and its line boxed together beside it; a link on
 * the name (`href`); and a race (`race`) leading to its rules at the head of
 * the line, the rest of the line after « · ». A side given none of them is
 * drawn as before. The stylesheet shows the crest and the letter on a desk
 * only. What the board does not draw, though the prototype does: the
 * opponent's TV, the bubbles of inducements and of players who miss the match,
 * the arrows and the squares as tabs to page through the season's matches,
 * and the «T» of a friendly among them (stage 09 and 09a).
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { renderButton } from "./button.mjs";
import { icon } from "./icons.mjs";
import { assertLinkHref, classNames } from "./markup.mjs";
import { resultLabels } from "./result-pill.mjs";

/** A link the board draws: the address checked, then escaped. */
function linkMarkup(className, href, inner) {
  assertLinkHref(href);
  return `<a class="${className}" href="${escapeHtml(href)}">${inner}</a>`;
}

/** The team's name: a link to the team when there is an address for it. */
function nameMarkup({ name, href }) {
  return href ? linkMarkup("g-board__name", href, escapeHtml(name)) : `<span class="g-board__name">${escapeHtml(name)}</span>`;
}

/** The line under the name: the race leading to its rules, then « · » and the rest when there is any; the rest alone without a race. */
function lineMarkup({ sub, race }) {
  if (!race) return sub ? `<span class="g-board__sub">${escapeHtml(sub)}</span>` : "";
  const link = linkMarkup("g-board__race", race.href, `${icon("book", 12)}${escapeHtml(race.title)}`);
  return `<span class="g-board__sub g-board__sub--race">${link}${sub ? ` · ${escapeHtml(sub)}` : ""}</span>`;
}

/** The crest or the letter at a side's outer edge; "" for neither. The letter is the name's, which is read instead. */
function emblemMarkup({ crestHtml, initial }) {
  const crest = crestHtml ? `<span class="g-board__crest">${crestHtml}</span>` : "";
  return crest + (initial ? `<span class="g-board__initial" aria-hidden="true">${escapeHtml(initial)}</span>` : "");
}

/** One team: its name, and a line under it when there is one; beside them, boxed together, its crest or letter when given. */
function renderTeam(team, away) {
  const texts = nameMarkup(team) + lineMarkup(team);
  const emblem = emblemMarkup(team);
  const className = classNames("g-board__side", away && "g-board__side--away", emblem && "g-board__side--emblem");
  return `<div class="${className}">${emblem ? `${emblem}<span class="g-board__texts">${texts}</span>` : texts}</div>`;
}

/** The opponent's column: the opponent, or the words that say when there will be one. */
function renderOpponent(opponent, pendingText) {
  if (opponent) return renderTeam(opponent, true);
  return `<div class="g-board__side g-board__side--away"><span class="g-board__pending">${escapeHtml(pendingText)}</span></div>`;
}

/** One square: the round's label, coloured by the result, and named by both; the match the page is about says so. */
function renderSquare({ label, result, current }) {
  const state = result ? resultLabels(result).name : t("ui.board.notPlayed");
  const className = classNames("g-board__square", `g-board__square--${result || "none"}`, current && "g-board__square--current");
  const mark = current ? ' aria-current="true"' : "";
  return `<li class="${className}" aria-label="${escapeHtml(`${label}: ${state}`)}"${mark}>${escapeHtml(label)}</li>`;
}

/**
 * @param {object} props
 * @param {string} [props.overline] the small line over the score: the round and where
 * @param {{name: string, sub?: string, crestHtml?: string}} props.own our team, at the left; `crestHtml`, `renderCrest`'s markup, by the name
 * @param {{name: string, sub?: string, href?: string, initial?: string, race?: {title: string, href: string}}|null} [props.opponent]
 *   theirs, at the right; none while there is no pairing. `href` makes the name a link, `initial` is the letter in the
 *   circle by it, `race` heads the line, before `sub`
 * @param {string} [props.pendingText] in the opponent's place when there is none: when there will be
 * @param {string} [props.score] "2:1", between the names; the dash pair while there is none
 * @param {string} [props.statusHtml] a status chip, under the score
 * @param {{label: string, result: string|null, current: boolean}[]} [props.pager] the season's matches in order, as squares: `result` is one of RESULT_KINDS, or null for one not played
 * @param {string} [props.actionsHtml] the buttons and links of the bar, such as `renderBoardActions`
 * @param {boolean} [props.live] a match in progress: the board is ringed
 */
export function renderMatchBoard({ overline = "", own, opponent = null, pendingText = "", score = "", statusHtml = "", pager = [], actionsHtml = "", live = false }) {
  if (!own?.name) throw new Error("a match board needs our own team with a name");
  const over = overline ? `<span class="g-board__overline">${escapeHtml(overline)}</span>` : "";
  const middle = `<div class="g-board__mid">${over}<span class="g-board__score">${escapeHtml(score || t("ui.board.empty"))}</span>${statusHtml}</div>`;
  const main = `<div class="g-board__main">${renderTeam(own, false)}${middle}${renderOpponent(opponent, pendingText)}</div>`;
  const squares = pager.length ? `<ol class="g-board__pager" role="list" aria-label="${escapeHtml(t("ui.board.pager"))}">${pager.map(renderSquare).join("")}</ol>` : "";
  const actions = actionsHtml ? `<div class="g-board__actions">${actionsHtml}</div>` : "";
  const bar = squares || actions ? `<div class="g-board__bar">${squares}${actions}</div>` : "";
  return `<section class="${classNames("g-board", live && "g-board--live")}">${main}${bar}</section>`;
}

/** How the band draws each kind of action: a button of this ui/button.mjs kind, or (null) a plain link. */
const BUTTON_OF = new Map([["primary", "primary"], ["light", "outline"], ["text", null]]);

function renderBoardLink({ label, href, kind }) {
  if (!BUTTON_OF.has(kind)) throw new Error(`unknown match action kind: ${kind}`);
  const button = BUTTON_OF.get(kind);
  if (button) return renderButton({ label, href, kind: button });
  return linkMarkup("g-board__link", href, escapeHtml(label));
}

/**
 * What a match offers, drawn for the board's bar: the line of a score that is
 * sent, then each action by its kind (the kinds `matchActions` says). A
 * "primary" is the band's light button, a "light" the outlined one, a "text" a
 * plain link; none is asked for by a ui/button.mjs kind, since the band is dark
 * and the buttons' own looks are for a page.
 *
 * @param {{links?: {label: string, href: string, kind: "primary"|"light"|"text"}[], sentLine?: string}} actions `matchActions`'s answer
 * @returns {string} markup for `renderMatchBoard`'s `actionsHtml`; "" for nothing
 */
export function renderBoardActions({ links = [], sentLine = "" } = {}) {
  const note = sentLine ? `<span class="g-board__note">${escapeHtml(sentLine)}</span>` : "";
  return `${note}${links.map(renderBoardLink).join("")}`;
}
