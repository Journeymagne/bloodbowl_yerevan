/**
 * The board of a team's season, as the overview and the matches page draw it (DeskSeason.html, DeskOverview.html,
 * DeskSeasonLive.html; stage 09a, decisions 13–16). A desk pages through it: its items are the team's played matches
 * — the league's of this season and the friendlies, a friendly an «F» among them — in the order they were settled, then
 * the current one (or «the opponent — after round N»). A past one says its opponent with the race and the place, its
 * score in the colour of the result, the outcome and the points, its CAS and MVPs; the current one its state, the
 * opponent's value once his team is read, and the bubbles that open «Before the match». A phone's board stays as it was
 * (decision 13, the owner: «the phone's board stays»): the season's league squares as a list, the current match alone,
 * no bubbles and no chips; the opponent's value is said there too.
 *
 * `bandItems` is the season as items, `bandBoard` what the board says of one of them (the screen's model; the overview
 * keeps its fields), `bandMarkup` draws it with ui/match-board.mjs, and `wireBand` answers its tabs, its way back to
 * the current match and its bubbles. The friendlies of a season are those settled since it was created (pre-flight
 * L13; all of them while the season does not say when). `bandVisit` is the board's part of a screen's visit (pre-flight
 * L10): the match shown, the opponent's team read for the match on, the sheet its bubbles open.
 */
import { teamLogoProps } from "../../ui/team-logo.mjs";
import { delegate } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { pageUrl, playerTeamUrl, teamUrl } from "../../core/routes.mjs";
import { forgetOpponents, readOpponentTeam } from "../../data/match-day.mjs";
import { gameOutcome, gameSides, recentResults, seasonPager, standingOf, teamValue } from "../../data/team-record.mjs";
import { raceTeamOf } from "../../data/teams.mjs";
import { matchPreview } from "../../domain/match/preview.mjs";
import { renderCrest } from "../../shell/crest.mjs";
import { currentMatch, matchActions, sentCasualties, sentScore, subLine } from "../../shell/current-match.mjs";
import {
  renderBoardActions, renderBoardBubble, renderBoardChips, renderBoardToCurrent, renderMatchBoard, wireBoardPager,
} from "../../ui/match-board.mjs";
import { resultLabels } from "../../ui/result-pill.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { beforeFigures, closeBeforeSheet, openBeforeSheet } from "./before.mjs";

/**
 * @typedef {{key: string, gameId: string|null, label: string, title: string, venue: string, round: number|null,
 *   opponent: {name: string, userId: string, teamId: string, race: string}|null, score: string, cas: string, mvps: string[],
 *   result: "w"|"d"|"l"|"t"|null, outcome: "w"|"d"|"l"|null, points: number|null, friendly: boolean, current: boolean}} BandItem
 * `venue` is the team's side (`home`/`away`), `race` the opponent's race by its slug, `result` the square's colour (a
 * friendly's «t»), `outcome` how it ended for the team, `points` the team's in the table (null for a friendly, and for a
 * pair the server scored none).
 */

/** The opponent as an item keeps him: what the board's side and the square's name need. */
const opponentRef = (rival) => ({ name: rival.team?.name ?? "", userId: rival.user?.id ?? "", teamId: rival.team?.id ?? "", race: rival.team?.baseTeamSlug ?? "", ...teamLogoProps(rival.team) });

/** «Round 7» or «Friendly», and the square's label: the round, or the friendly's letter. */
function titled(game) {
  const friendly = game.kind === "friendly";
  return { friendly, round: friendly ? null : game.roundNumber,
    label: friendly ? t("ui.result.t") : String(game.roundNumber),
    title: friendly ? t("matches.before.friendly") : t("matches.before.round", { round: game.roundNumber }) };
}

/** When a game was settled, as a number; a stamp that cannot be read is the oldest. */
const settledAt = (game) => Date.parse(game.confirmedAt ?? game.updatedAt) || 0;

/** @returns {BandItem} */
function pastItem(result, game, teamId) {
  const sides = gameSides(game, teamId);
  const touchdowns = (side) => game[`${side}Touchdowns`];
  const points = game[`${sides.own}Points`];
  return { key: game.id, gameId: game.id, ...titled(game), venue: sides.own, opponent: opponentRef(game[sides.other]),
    score: `${touchdowns(sides.own)}:${touchdowns(sides.other)}`, cas: result.cas, mvps: result.mvps, result: result.result,
    outcome: gameOutcome(game, teamId), points: result.friendly || points === null || points === undefined ? null : Number(points), current: false };
}

/** @returns {BandItem} the match `currentMatch` gives, with the score sent when it waits for confirmation */
function currentItem({ game, phase }, teamId) {
  const sides = gameSides(game, teamId);
  const sent = phase === "sent";
  return { key: game.id, gameId: game.id, ...titled(game), venue: sides.own, opponent: opponentRef(game[sides.other]),
    score: sent ? sentScore(game, sides, ":") : "", cas: sent ? sentCasualties(game, sides) : "", mvps: [], result: null, outcome: null,
    points: null, current: true };
}

/** @returns {BandItem|null} «the opponent — after round N» while the team has no match on; none without a season's round */
function nextItem(season) {
  const round = Number(season?.currentRound);
  if (!Number.isInteger(round)) return null;
  return { key: "next", gameId: null, friendly: false, round: round + 1, label: String(round + 1), title: t("matches.before.round", { round: round + 1 }),
    venue: "", opponent: null, score: "", cas: "", mvps: [], result: null, outcome: null, points: null, current: true };
}

/**
 * The team's played matches of the season, the newest first, each with its game: the league's of this season and the
 * friendlies settled since it was created (all of them while it does not say when, or with no season at all); a match
 * still on is the current one's, not one of these. The board, the matches page's results and its calendar read the
 * season the same way (pre-flight L13). A team that is not in the season (`sinceSeason: false`: the matches page's
 * results are its friendlies, decision 8) keeps every friendly, those before the season too (the final review, m-8).
 * @param {object[]} games `/api/games`'s
 * @param {string} teamId
 * @param {object|null} seasonData `/api/season`'s
 * @param {{sinceSeason?: boolean}} [options]
 * @returns {(ReturnType<typeof recentResults>[number] & {game: object})[]}
 */
export function seasonResults(games, teamId, seasonData, { sinceSeason = true } = {}) {
  const season = seasonData?.season ?? null;
  const current = currentMatch(games, teamId);
  const since = sinceSeason ? Date.parse(season?.createdAt) || 0 : 0;
  const byId = new Map(games.map((game) => [game.id, game]));
  const ofSeason = ({ gameId, friendly }) => {
    const game = byId.get(gameId);
    return gameId !== current?.game.id && (friendly ? settledAt(game) >= since : Boolean(season?.id) && game.season?.id === season.id);
  };
  return recentResults(games, teamId, Infinity).filter(ofSeason).map((result) => ({ ...result, game: byId.get(result.gameId) }));
}

/**
 * The season as a desk's board pages it: the team's played matches, the oldest first (`seasonResults`), then the current
 * one, or the opponent to come.
 * @param {object[]} games `/api/games`'s
 * @param {string} teamId
 * @param {object|null} seasonData `/api/season`'s
 * @returns {BandItem[]}
 */
export function bandItems(games, teamId, seasonData) {
  const current = currentMatch(games, teamId);
  const played = seasonResults(games, teamId, seasonData).reverse().map((result) => pastItem(result, result.game, teamId));
  const last = current ? currentItem(current, teamId) : nextItem(seasonData?.season ?? null);
  return last ? [...played, last] : played;
}

/**
 * What the band offers (`matchActions`, in DeskSeason's and DeskSeasonLive's looks): before the match the preparation
 * and then the friendlies; in it the records with their count, outlined, and the post-match, white. A score sent: ours
 * says in a quiet line who confirms it (DeskSeason's `sentNote`, the fidelity pass's G5 — the score and its CAS are on
 * the band already); the opponent's has «Confirm the score» alone. With no match on, the friendlies.
 * @param {ReturnType<typeof currentMatch>} current
 * @param {string} teamId
 * @param {{count: number}|null} records `matchRecords`' of the match on; null while they are not read
 */
export function bandActions(current, teamId, records) {
  const friendlies = { label: t("teamOverview.friendlies"), href: teamUrl(teamId, "challenges"), kind: "light" };
  if (!current) return { links: [friendlies], sentLine: "" };
  const actions = matchActions(current, teamId);
  if (current.phase === "idle") return { ...actions, links: [...actions.links, friendlies] };
  if (current.phase === "sent") {
    const rival = current.game[gameSides(current.game, teamId).other];
    return { ...actions, sentLine: current.game.viewerIsProposer === false ? "" : t("matches.sentWaiting", { team: rival.team?.name ?? "" }) };
  }
  if (current.phase !== "live") return actions;
  const recordsLabel = records ? t("matches.records", { count: records.count }) : t("shell.match.records");
  return { ...actions, links: actions.links.map((link) => (link.kind === "text" ? { ...link, label: recordsLabel, kind: "light" } : { ...link, kind: "primary" })) };
}

/** The letter in the opponent's circle (DeskOverview.html): the name's first, upper case; «?» for a name of nothing. */
const initialOf = (name) => Array.from(name.trim())[0]?.toUpperCase() ?? "?";

/**
 * The opponent's side of the board, with its place short («#1», «1-е»). On a desk (DeskOverview.html, decision 54 of
 * 07d) the name leads to the team's page, the letter stands in a circle by it, and a race the reference knows leads to
 * its rules at the head of the line, the place after it; on a phone the race and the place are a line of text.
 */
export function opponentOf(rival, seasonData, phone) {
  const name = rival.team?.name ?? "";
  const race = raceTeamOf(rival.team?.baseTeamSlug);
  const rank = standingOf(seasonData, rival.team?.id)?.rank;
  const place = rank ? t("teamOverview.opponentPlace", { place: rank }) : "";
  if (phone) return { name, sub: [race?.title, place].filter(Boolean).join(" · "), ...teamLogoProps(rival.team) };
  const href = rival.user?.id && rival.team?.id ? playerTeamUrl(rival.user.id, rival.team.id) : undefined;
  const raceLink = race ? { title: race.title, href: pageUrl(race), hint: t("teamOverview.boardRace") } : undefined;
  return { name, href, hint: t("teamOverview.boardTeam"), sub: place, initial: initialOf(name), race: raceLink, ...teamLogoProps(rival.team) };
}

/** Our side: the race, the place and the value; a desk's has the league's crest. Outside the table, no place. */
export function ownSideOf(team, raceTeam, seasonData, phone) {
  const rank = standingOf(seasonData, team.id)?.rank;
  const value = formatMoney(teamValue(team, raceTeam));
  const sub = !raceTeam ? "" : rank ? t("teamOverview.ownSub", { race: raceTeam.title, place: rank, value })
    : `${raceTeam.title} · ${t("teamOverview.oppValue", { value })}`;
  return { name: team.name, sub, ...teamLogoProps(team), ...(phone ? {} : { crestHtml: renderCrest({ size: "md" }) }) };
}

/** The opponent's value, once his team is read and is the one the match is against; "" otherwise. */
function valueOf(read, teamId) {
  const team = read?.team;
  if (!team || team.id !== teamId) return "";
  const worth = teamValue(team, raceTeamOf(team.baseTeamSlug));
  return worth === null ? "" : t("teamOverview.oppValue", { value: formatMoney(worth) });
}

/** A past match's outcome under its score: «Win · +3 in the table»; a friendly's «Friendly · draw · Does not count…». */
function outcomeOf(item) {
  const name = resultLabels(item.outcome).name;
  if (item.friendly) return { label: `${t("ui.result.tName")} · ${name.toLocaleLowerCase()}`, note: t("matches.band.offTable"), result: item.outcome };
  const note = item.points === null ? "" : t("matches.band.points", { points: item.points > 0 ? `+${item.points}` : String(item.points) });
  return { label: name, note, result: item.outcome };
}

/** The board's sides and middle for a past match: its opponent without a value, its score, outcome and chips. */
function pastBoard(item, seasonData) {
  const { opponent: ref } = item;
  const rival = { user: { id: ref.userId }, team: { id: ref.teamId, name: ref.name, baseTeamSlug: ref.race, ...teamLogoProps(ref) } };
  const chips = [t("matches.band.cas", { cas: item.cas }), ...(item.mvps.length ? [t("matches.band.mvp", { names: item.mvps.join(", ") })] : [])];
  return { overline: subLine({ kind: item.friendly ? "friendly" : "league", roundNumber: item.round }, item.venue), opponent: opponentOf(rival, seasonData, false),
    pendingText: "", score: item.score, status: "none", outcome: outcomeOf(item), scoreResult: item.outcome === "w" || item.outcome === "l" ? item.outcome : "",
    chips, bubbles: {}, toCurrent: true, links: [], sentLine: "" };
}

/** The bubbles of the current match on a desk, from the same preview as «Before the match»; none for a score sent. */
function bubblesOf(current, preview, phone) {
  if (phone || !current || current.phase === "sent" || !preview) return {};
  const figures = beforeFigures(preview);
  return { own: figures.bubble.gets === "own" ? figures.bubble.text : undefined, mid: figures.missText,
    other: figures.bubble.gets === "other" ? figures.bubble.text : undefined };
}

/** The current match's chips on a desk: a score sent its CAS, a friendly that it does not count in the league's table. */
function currentChips(item, current, phone) {
  if (phone || !current) return [];
  if (current.phase === "sent") return item.cas ? [t("matches.band.cas", { cas: item.cas })] : [];
  return item.friendly ? [t("matches.band.friendlyChip")] : [];
}

/** The board's sides and middle for the current match, or for the opponent to come. */
function currentBoard(item, input) {
  const { team, seasonData, current, preview, opponent: read, records, phone, gamesRead = true } = input;
  const sides = current && gameSides(current.game, team.id);
  const rival = sides && current.game[sides.other];
  const opponent = rival ? opponentOf(rival, seasonData, phone) : null;
  const value = rival ? valueOf(read, rival.team?.id) : "";
  if (opponent && value) opponent.sub = [opponent.sub, value].filter(Boolean).join(" · ");
  const round = seasonData?.season?.currentRound;
  return { overline: sides ? subLine(current.game, sides.own) : "", opponent,
    pendingText: gamesRead && round ? t("teamOverview.opponentLater", { round }) : "",
    score: item?.score ?? "", status: current?.phase ?? "none", outcome: null, scoreResult: "",
    chips: item ? currentChips(item, current, phone) : [], bubbles: bubblesOf(current, preview, phone), toCurrent: false,
    ...bandActions(current, team.id, records) };
}

/**
 * What the board says of the item `index` (null — the current one, the last): the screen's model of it. A desk's squares
 * are `items` as tabs; a phone's are the season's league matches (`seasonPager`), the current one alone drawn.
 * @param {{items: BandItem[], index: number|null, games: object[], team: object, raceTeam: object|null, seasonData: object|null,
 *   current: ReturnType<typeof currentMatch>, preview: object|null, opponent: {team: object}|{error: string}|null,
 *   records: {count: number}|null, phone: boolean, gamesRead?: boolean}} input
 */
export function bandBoard(input) {
  const { items, games, team, raceTeam, seasonData, current, phone } = input;
  const last = items.length - 1;
  const shown = phone || input.index === null || input.index === undefined || input.index > last ? last : input.index;
  const item = items[shown] ?? null;
  const pager = phone
    ? seasonPager(games, team.id, seasonData, current?.game.id).map((square) => ({ label: String(square.round), result: square.result, current: square.current }))
    : items.map((each, at) => ({ label: each.label, result: each.result, current: each.current, selected: at === shown,
      title: each.opponent ? t("matches.band.square", { title: each.title, opponent: each.opponent.name }) : each.title }));
  const body = item && !item.current ? pastBoard(item, seasonData) : currentBoard(item, input);
  return { index: shown, tabs: !phone && items.length > 0, own: ownSideOf(team, raceTeam, seasonData, phone), pager, ...body };
}

/** The state under the score: not begun, in play, waiting for a confirmation; nothing for none (the dark band's chip). */
export function statusChip(status) {
  if (status === "idle") return renderStatusChip({ label: t("teamOverview.status.idle"), onDark: true });
  if (status === "live") return renderStatusChip({ label: t("shell.match.live"), tone: "live", onDark: true });
  if (status === "sent") return renderStatusChip({ label: t("shell.match.awaiting"), tone: "wait", onDark: true });
  return "";
}

const BUBBLE = { beforeOpen: "" };
const bubble = (text) => (text ? renderBoardBubble({ text, data: BUBBLE }) : undefined);

/** The board `bandBoard` describes, drawn. */
export function bandBoardMarkup(board) {
  return renderMatchBoard({
    overline: board.overline, own: board.own, opponent: board.opponent, pendingText: board.pendingText, score: board.score,
    statusHtml: statusChip(board.status), pager: board.pager, tabs: board.tabs, live: board.status === "live",
    outcome: board.outcome, scoreResult: board.scoreResult, chipsHtml: renderBoardChips(board.chips),
    bubbles: { own: bubble(board.bubbles.own), mid: bubble(board.bubbles.mid), other: bubble(board.bubbles.other) },
    actionsHtml: renderBoardActions({ links: board.links, sentLine: board.sentLine }), toCurrentHtml: board.toCurrent ? renderBoardToCurrent() : "",
  });
}

/** @param {Parameters<typeof bandBoard>[0]} input @returns {string} */
export function bandMarkup(input) {
  return bandBoardMarkup(bandBoard(input));
}

/**
 * Wire the band under `root` (a container that outlives the redraws): its tabs and arrows (`wireBoardPager`), «To the
 * current match →» — the last item, the focus on its square —, and the bubbles, `onBefore(button)`.
 * @param {Element} root
 * @param {{onPick: (index: number) => void, onBefore: (button: Element) => void}} handlers
 * @returns {() => void} removes the listeners
 */
export function wireBand(root, { onPick, onBefore }) {
  const offs = [
    wireBoardPager(root, onPick),
    delegate(root, "click", "[data-board-current]", () => {
      const last = root.querySelectorAll('.g-board__nav [role="tab"]').length - 1;
      if (last < 0) return;
      onPick(last);
      root.querySelector(`.g-board__nav [data-board-item="${last}"]`)?.focus();
    }),
    delegate(root, "click", "[data-before-open]", (event, button) => onBefore(button)),
  ];
  return () => offs.forEach((off) => off());
}

/**
 * «Before the match» for the match on: the preparation the server would build from our saved team and the opponent's,
 * as his public page has it (`matchPreview`); null while he is not read, for another match's opponent, and where the
 * rules cannot say (a race the reference does not know, the reference not read whole).
 * @param {{team: object, current: ReturnType<typeof currentMatch>, opponent: {team: object}|{error: string}|null, data: object|null, teamId: string}} input
 */
export function previewFor({ team, current, opponent, data, teamId }) {
  const sides = current && gameSides(current.game, teamId);
  const rival = sides && current.game[sides.other];
  if (!rival || !opponent?.team || opponent.team.id !== rival.team?.id) return null;
  return matchPreview({ own: { user: current.game[sides.own].user, team }, other: { user: rival.user, team: opponent.team } }, data);
}

/**
 * The board's part of a visit (pre-flight L10): which item is shown (`key`, null for the current one; it stays while the
 * games still hold it — Review Focus 5), the opponent's team for the match on (read on the first draw and whenever the
 * games change, once a visit for the game as it stands — L11 —, taken only while the visit lasts and only for the match
 * still on), and «Before the match» from the bubbles. `read()` is the state as it is now; `draw()` draws the screen
 * again. `release()` as the screen is left: the listeners go, and the sheet with its host.
 * @param {{teamId: string, root: Element, read: () => {team: object|undefined, games: object[]|null, seasonData: object|null, data: object|null}, draw: () => void}} props
 */
export function bandVisit({ teamId, root, read, draw }) {
  forgetOpponents();
  let here = true;
  let key = null;
  let opponent = null;
  const itemsNow = () => {
    const { games, seasonData } = read();
    return Array.isArray(games) ? bandItems(games, teamId, seasonData) : [];
  };
  const currentNow = () => (Array.isArray(read().games) ? currentMatch(read().games, teamId) : null);
  const readRival = async () => {
    const current = currentNow();
    if (!current) {
      opponent = null;
      return;
    }
    const answer = await readOpponentTeam(current.game, teamId);
    if (!here || currentNow()?.game.id !== current.game.id) return;
    opponent = answer;
    draw();
  };
  const unwire = wireBand(root, {
    onPick: (index) => {
      const items = itemsNow();
      key = index >= items.length - 1 ? null : items[index]?.key ?? null;
      draw();
    },
    onBefore: (button) => {
      const { team, data } = read();
      const current = currentNow();
      const preview = team && previewFor({ team, current, opponent, data, teamId });
      if (preview) openBeforeSheet(button, { preview, game: current.game });
    },
  });
  return {
    get key() { return key; },
    get opponent() { return opponent; },
    /** The games answered (the first time, or changed): the item shown stays if they still hold it; the opponent is read. */
    gamesChanged() {
      if (key !== null && !itemsNow().some((item) => item.key === key)) key = null;
      void readRival();
    },
    release() {
      here = false;
      unwire();
      closeBeforeSheet();
    },
  };
}
