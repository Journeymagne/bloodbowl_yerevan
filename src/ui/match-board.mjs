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
 * the line, the rest of the line after « · ». Each link may carry a tooltip
 * (`hint`), the prototype's. A side given none of them is
 * drawn as before. The stylesheet shows the crest and the letter on a desk
 * only.
 *
 * A desk's board pages through the season (DeskSeason.html, DeskOverview.html;
 * stage 09a): with `tabs` the squares are the tabs of one group between the
 * arrows «‹ ›», the one shown selected, and `wireBoardPager` moves through them
 * (clicks, the arrows, ←/→, Home and End, the focus following). A past match is
 * drawn with its score in the colour of the result (`scoreResult`), the outcome
 * under it (`outcome`), its chips in the middle of the bar (`chipsHtml`,
 * `renderBoardChips`) and the way back to the current one where the actions
 * stand (`toCurrentHtml`, `renderBoardToCurrent`). The current one may carry the
 * screen's bubbles (`bubbles`, `renderBoardBubble`): under our name, under the
 * state, under theirs. A board given none of these props is drawn as before.
 * A phone's squares stay a list and no links (30px is less than a thumb's 44,
 * decision 12 of stage 05): a phone does not page.
 */
import { renderTeamLogo } from "./team-logo.mjs";
import { delegate, escapeHtml, focusLost } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { renderButton } from "./button.mjs";
import { icon } from "./icons.mjs";
import { assertLinkHref, classNames, dataAttributes } from "./markup.mjs";
import { resultLabels } from "./result-pill.mjs";

/** A link the board draws: the address checked, then escaped; a tooltip (`hint`) is text. */
function linkMarkup(className, href, inner, hint = "") {
  assertLinkHref(href);
  const title = hint ? ` title="${escapeHtml(hint)}"` : "";
  return `<a class="${className}" href="${escapeHtml(href)}"${title}>${inner}</a>`;
}

/** The team's name: a link to the team when there is an address for it. */
function nameMarkup({ name, href, hint }) {
  return href ? linkMarkup("g-board__name", href, escapeHtml(name), hint) : `<span class="g-board__name">${escapeHtml(name)}</span>`;
}

/** The line under the name: the race leading to its rules, then « · » and the rest when there is any; the rest alone without a race. */
function lineMarkup({ sub, race }) {
  if (!race) return sub ? `<span class="g-board__sub">${escapeHtml(sub)}</span>` : "";
  const link = linkMarkup("g-board__race", race.href, `${icon("book", 12)}${escapeHtml(race.title)}`, race.hint);
  return `<span class="g-board__sub g-board__sub--race">${link}${sub ? ` · ${escapeHtml(sub)}` : ""}</span>`;
}

/** The crest or the letter at a side's outer edge; "" for neither. The letter is the name's, which is read instead. */
function emblemMarkup({ crestHtml, initial, ...logo }) {
  const crest = crestHtml ? `<span class="g-board__crest">${crestHtml}</span>` : "";
  const fallbackHtml = crest + (initial ? `<span class="g-board__initial" aria-hidden="true">${escapeHtml(initial)}</span>` : "");
  return renderTeamLogo(logo, { fallbackHtml });
}

/**
 * One team: its name, and a line under it when there is one, and the screen's bubble under them; beside them, boxed
 * together, its crest or letter when given. A side with a bubble says so (`g-board__side--bubble`): on a desk it keeps
 * the room its bubble needs on one line, and the other side gives way.
 */
function renderTeam(team, away, bubbleHtml = "") {
  const texts = nameMarkup(team) + lineMarkup(team) + bubbleHtml;
  const emblem = emblemMarkup(team);
  const className = classNames("g-board__side", away && "g-board__side--away", emblem && "g-board__side--emblem", bubbleHtml && "g-board__side--bubble");
  return `<div class="${className}">${emblem ? `${emblem}<span class="g-board__texts">${texts}</span>` : texts}</div>`;
}

/** The opponent's column: the opponent, or the words that say when there will be one. */
function renderOpponent(opponent, pendingText, bubbleHtml) {
  if (opponent) return renderTeam(opponent, true, bubbleHtml);
  return `<div class="g-board__side g-board__side--away"><span class="g-board__pending">${escapeHtml(pendingText)}</span></div>`;
}

/** One square: the round's label, coloured by the result, and named by both; the match the page is about says so. */
function renderSquare({ label, result, current }) {
  const state = result ? resultLabels(result).name : t("ui.board.notPlayed");
  const className = classNames("g-board__square", `g-board__square--${result || "none"}`, current && "g-board__square--current");
  const mark = current ? ' aria-current="true"' : "";
  return `<li class="${className}" aria-label="${escapeHtml(`${label}: ${state}`)}"${mark}>${escapeHtml(label)}</li>`;
}

/** The board's teams and score are the tabs' panel (the final review, m-4): one board on a page, so one id. */
const PANEL_ID = "g-board-panel";
const tabId = (index) => `g-board-tab-${index}`;

/** The tab selected: the one marked, else the last. */
function selectedTab(pager) {
  const marked = pager.findIndex((item) => item.selected);
  return marked === -1 ? pager.length - 1 : marked;
}

/** A square as a tab of the group: named by its match (`title`) and state, selected or not, one of them in the tab order. */
function renderTab({ label, result, current, title }, index, selected) {
  const state = result ? resultLabels(result).name : t("ui.board.notPlayed");
  const className = classNames("g-board__square", `g-board__square--${result || "none"}`, current && "g-board__square--current");
  const mark = current ? ' aria-current="true"' : "";
  return `<button type="button" role="tab" class="${className}" id="${tabId(index)}" aria-controls="${PANEL_ID}" data-board-item="${index}" aria-selected="${selected}"`
    + ` tabindex="${selected ? 0 : -1}" aria-label="${escapeHtml(`${title || label}: ${state}`)}"${mark}>${escapeHtml(label)}</button>`;
}

/** The arrows and the tabs between them; with none selected, the last one is. An arrow at its end is off. */
function renderNav(pager) {
  const at = selectedTab(pager);
  const arrow = (step, key, glyph, off) => `<button type="button" class="g-board__step" data-board-step="${step}" aria-label="${escapeHtml(t(key))}"${off ? " disabled" : ""}>${icon(glyph, 14)}</button>`;
  const tabs = pager.map((item, index) => renderTab(item, index, index === at)).join("");
  return `<div class="g-board__nav">${arrow(-1, "ui.board.prev", "back", at === 0)}`
    + `<div class="g-board__tabs" role="tablist" aria-label="${escapeHtml(t("ui.board.pager"))}">${tabs}</div>`
    + `${arrow(1, "ui.board.next", "chevron", at === pager.length - 1)}</div>`;
}

/** Under a past match's score: «Win · +3 in the table», the outcome in its colour, the note quieter. */
function outcomeMarkup({ label, note, result }) {
  const rest = note ? ` · <span class="g-board__outcome-note">${escapeHtml(note)}</span>` : "";
  return `<span class="g-board__outcome g-board__outcome--${escapeHtml(result)}">${escapeHtml(label)}${rest}</span>`;
}

/**
 * @param {object} props
 * @param {string} [props.overline] the small line over the score: the round and where
 * @param {{name: string, sub?: string, crestHtml?: string}} props.own our team, at the left; `crestHtml`, `renderCrest`'s markup, by the name
 * @param {{name: string, sub?: string, href?: string, hint?: string, initial?: string, race?: {title: string, href: string, hint?: string}}|null} [props.opponent]
 *   theirs, at the right; none while there is no pairing. `href` makes the name a link, `hint` its tooltip, `initial` is
 *   the letter in the circle by it, `race` heads the line, before `sub`
 * @param {string} [props.pendingText] in the opponent's place when there is none: when there will be
 * @param {string} [props.score] "2:1", between the names; the dash pair while there is none
 * @param {string} [props.statusHtml] a status chip, under the score
 * @param {{label: string, result: string|null, current: boolean}[]} [props.pager] the season's matches in order, as squares: `result` is one of RESULT_KINDS, or null for one not played
 * @param {string} [props.actionsHtml] the buttons and links of the bar, such as `renderBoardActions`
 * @param {boolean} [props.live] a match in progress: the board is ringed
 * @param {boolean} [props.tabs] the squares as tabs between the arrows (a desk's); each square may then say `selected`
 *   and be named by its match (`title`)
 * @param {{label: string, note: string, result: "w"|"d"|"l"|"t"}|null} [props.outcome] a past match's, under its score
 * @param {"w"|"l"|""} [props.scoreResult] the score in the colour of a win or a loss
 * @param {string} [props.chipsHtml] `renderBoardChips`' markup, in the middle of the bar
 * @param {{own?: string, mid?: string, other?: string}} [props.bubbles] `renderBoardBubble`'s markup: under our name,
 *   under the state, under theirs
 * @param {string} [props.toCurrentHtml] `renderBoardToCurrent`'s markup, where the actions stand
 */
export function renderMatchBoard({
  overline = "", own, opponent = null, pendingText = "", score = "", statusHtml = "", pager = [], actionsHtml = "", live = false,
  tabs = false, outcome = null, scoreResult = "", chipsHtml = "", bubbles = {}, toCurrentHtml = "",
}) {
  if (!own?.name) throw new Error("a match board needs our own team with a name");
  const over = overline ? `<span class="g-board__overline">${escapeHtml(overline)}</span>` : "";
  const scoreClass = classNames("g-board__score", scoreResult && `g-board__score--${scoreResult}`);
  const below = `${statusHtml}${bubbles.mid ?? ""}${outcome ? outcomeMarkup(outcome) : ""}`;
  const middle = `<div class="g-board__mid">${over}<span class="${scoreClass}">${escapeHtml(score || t("ui.board.empty"))}</span>${below}</div>`;
  const panel = tabs && pager.length ? ` id="${PANEL_ID}" role="tabpanel" aria-labelledby="${tabId(selectedTab(pager))}"` : "";
  const main = `<div class="g-board__main"${panel}>${renderTeam(own, false, bubbles.own ?? "")}${middle}${renderOpponent(opponent, pendingText, bubbles.other ?? "")}</div>`;
  const list = () => `<ol class="g-board__pager" role="list" aria-label="${escapeHtml(t("ui.board.pager"))}">${pager.map(renderSquare).join("")}</ol>`;
  const squares = pager.length ? (tabs ? renderNav(pager) : list()) : "";
  const chips = chipsHtml ? `<div class="g-board__chips">${chipsHtml}</div>` : "";
  const actions = actionsHtml || toCurrentHtml ? `<div class="g-board__actions">${actionsHtml}${toCurrentHtml}</div>` : "";
  const bar = squares || chips || actions ? `<div class="g-board__bar">${squares}${chips}${actions}</div>` : "";
  return `<section class="${classNames("g-board", live && "g-board--live")}">${main}${bar}</section>`;
}

/** A past match's or a sent score's chips: «CAS 3–1», «MVP Gruk». Text. */
export function renderBoardChips(texts) {
  return texts.map((text) => `<span class="g-board__chip">${escapeHtml(text)}</span>`).join("");
}

/**
 * A bubble that opens more about the match: a 28px button with the «i» after its words. `data` names what the screen
 * answers it by (`{beforeOpen: ""}`); it says it opens a dialog.
 * @param {{text: string, data?: object}} props
 */
export function renderBoardBubble({ text, data = {} }) {
  return `<button type="button" class="g-board__bubble" aria-haspopup="dialog"${dataAttributes(data)}>${escapeHtml(text)}${icon("info", 14)}</button>`;
}

/** «To the current match →», a past match's way back; `wireBand` (screens/matches/band.mjs) answers it. */
export function renderBoardToCurrent() {
  return `<button type="button" class="g-board__tocurrent" data-board-current="">${escapeHtml(t("ui.board.toCurrent"))}</button>`;
}

const TAB = '.g-board__nav [role="tab"]';
/** Where each key moves the selection from `at` of `count`: the neighbour, the first or the last; undefined for any other key. */
const KEY_TARGETS = { ArrowLeft: (at) => at - 1, ArrowRight: (at) => at + 1, Home: () => 0, End: (at, count) => count - 1 };

/**
 * Wire the tabs and the arrows of the boards under `root` (a container that outlives the redraws): a click on a square,
 * an arrow, and on a tab ←/→, Home and End pick another match, `onPick(index)`, which the screen answers by drawing the
 * board with it selected. A key or a click on a square takes the focus to the square picked (the tabs' roving focus); an
 * arrow keeps it, unless the arrow is off at the end now, when it goes to the selected square. Nothing past the ends.
 * @param {Element} root
 * @param {(index: number) => void} onPick
 * @returns {() => void} removes the listeners
 */
export function wireBoardPager(root, onPick) {
  const tabs = () => root.querySelectorAll(TAB);
  const selected = () => [...tabs()].findIndex((tab) => tab.getAttribute("aria-selected") === "true");
  const focusOn = (index) => root.querySelector(`.g-board__nav [data-board-item="${index}"]`)?.focus();
  const pick = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= tabs().length || index === selected()) return false;
    onPick(index);
    return true;
  };
  const offs = [
    delegate(root, "click", TAB, (event, tab) => {
      const index = Number(tab.getAttribute("data-board-item"));
      pick(index);
      focusOn(index);
    }),
    delegate(root, "click", ".g-board__nav [data-board-step]", (event, arrow) => {
      pick(selected() + Number(arrow.getAttribute("data-board-step")));
      if (arrow.disabled || focusLost(arrow)) focusOn(selected());
    }),
    delegate(root, "keydown", TAB, (event, tab) => {
      const target = Object.hasOwn(KEY_TARGETS, event.key) ? KEY_TARGETS[event.key] : null;
      if (!target) return;
      event.preventDefault();
      const index = target(Number(tab.getAttribute("data-board-item")), tabs().length);
      if (pick(index)) focusOn(index);
    }),
  ];
  return () => offs.forEach((off) => off());
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
