/**
 * What the roster says of each player, read from what the server sends — the roster as GET has it (the
 * draft), its race, the events not settled — and where a tap on a counter goes. Pure: the screen draws it,
 * the tests run it on the real vault.
 *
 * A line is one player: his characteristics and skills, his counters in the three senses the screen needs
 * (what is in the roster, what a match has added, what an edit outside a match is waiting for), his
 * SPP, the advancements he has taken and what the next would cost him, his injuries, and what parting with him
 * gives (a sale, or the cancel of his purchase) and whether the roster may. The mode is what the team's games
 * say the roster is for just now: plain, a preparation, a match.
 *
 * The fallen are lines too (stage 07b): what the roster held when each died, read the way a player of the
 * roster is, with how and when he fell; one the roster as read still holds is drawn there and only there.
 */
import { gameSides } from "../../../data/team-record.mjs";
import { isGameClosedForPlayers } from "../../../data/games.mjs";
import { SPP_EVENT_COUNTERS, careerCounters, eventTotal, statisticsFromEvents } from "../../../domain/post-match/events.mjs";
import {
  ADVANCEMENT_BLOCKED, advancementCostAt, advancementOffers, canTakeAdvancement, playerAdvancementLevel, playerAdvancementSpent, playerSppTotal, sppCounterWeights, tiedFavoured,
} from "../../../domain/roster/progression.mjs";
import { playerCurrentCost } from "../../../domain/roster/costs.mjs";
import { playerInjuries } from "../../../domain/roster/edits.mjs";
import { playerRemoval } from "../../../domain/roster/transfers.mjs";
import { normalizeSppCounters, positionKind, selectedRosterPlayers, skillsForPlayer, storedPlayerId } from "../../../domain/roster/players.mjs";
import { PLAYER_STATS, categoriesForAccess, costToNumber, countToNumber, rowCost, statValueForDisplayByStat } from "../../../domain/roster/values.mjs";
import { currentMatch } from "../../../shell/current-match.mjs";

/** The counters a player's cell shows in full, in the order of the table's columns. */
export const MAIN_COUNTERS = Object.freeze(["touchdowns", "casualties", "completions", "knockouts", "interceptions", "mvps"]);
/** The narrow row under them; a fourth, `catches`, joins it where catches earn SPP (`counterSlots`). */
export const EXTRA_COUNTERS = Object.freeze(["throws", "landings", "bonus"]);

/**
 * The counters the screen lays out for a race, each with what one is worth to it: Brawlin' Brutes
 * score touchdowns for less and casualties for more, and only Passing Virtuosos earn from catches.
 *
 * @returns {{main: {key: string, spp: number}[], extra: {key: string, spp: number}[]}}
 */
export function counterSlots(race) {
  const weights = sppCounterWeights(race);
  const slot = (key) => ({ key, spp: weights[key] });
  return { main: MAIN_COUNTERS.map(slot), extra: [...EXTRA_COUNTERS, ...(weights.catches > 0 ? ["catches"] : [])].map(slot) };
}

// ---------------------------------------------------------------------------
// The mode
// ---------------------------------------------------------------------------

/** The statuses of a preparation that is under way: it is begun, and not yet played. */
const PREPARING = ["preparing", "ready"];

/** When a game last changed, as a number to sort by; a missing or unreadable stamp is the oldest. */
const changedAt = (game) => Date.parse(game.updatedAt) || 0;

/**
 * The preparation of several that the screen is about: a league match before a friendly, and then the one
 * that changed last, as the SideNav's card ranks its games. (The match on is the card's own pick, `currentMatch`.)
 */
const foremost = (games) => [...games].sort((first, second) => (first.kind === "friendly") - (second.kind === "friendly") || changedAt(second) - changedAt(first))[0];

/** The round a game is, or null for a friendly, which has none. */
const roundOf = (game) => (game.kind === "friendly" ? null : game.roundNumber ?? null);

/**
 * What the roster is for just now, by the games the coach has: the team's match on (`currentMatch`'s
 * live phase, which is `isMatchLive` as the server counts it, and the same pick the SideNav's card and
 * stage 08's lock make), else a preparation under way in a game players may still play
 * (`isGameClosedForPlayers`, as the shell's card does), else neither.
 *
 * @param {object[]} games the coach's games, as /api/games sends them
 * @param {string} teamId
 * @returns {{kind: "plain"} | {kind: "prep"|"match", game: object, round: number|null}}
 */
export function rosterMode(games, teamId) {
  const own = games.filter((game) => gameSides(game, teamId));
  const current = currentMatch(own, teamId);
  if (current?.phase === "live") return { kind: "match", game: current.game, round: roundOf(current.game) };
  const preparing = foremost(own.filter((game) => PREPARING.includes(game.preparationStatus) && !isGameClosedForPlayers(game)));
  return preparing ? { kind: "prep", game: preparing, round: roundOf(preparing) } : { kind: "plain" };
}

// ---------------------------------------------------------------------------
// The lines
// ---------------------------------------------------------------------------

/** What a characteristic that a player does not have shows (the StatStrip's dash, not the vault's hyphen). */
const NO_VALUE = "–";

/** What a modifier does to a characteristic whose value is shown. AG and PA are targets, but a raise is a raise. */
const changeOf = (mod) => (mod > 0 ? "up" : mod < 0 ? "down" : "");

/**
 * The five characteristics as the roster shows them. `order` is the number to sort by: the target for AG
 * and PA ("3+" is 3, and the lower is the better), none for a characteristic the player has not.
 */
function statsOf(row, player) {
  return Object.fromEntries(PLAYER_STATS.map((stat) => {
    const mod = countToNumber(player.statMods?.[stat]);
    const written = String(statValueForDisplayByStat(stat, row[stat] ?? "", mod));
    // The vault writes a characteristic a position has not as "-" or as a dash ("—", the Minotaur's PA): a value with no digit in it is none.
    const digits = /\d+/.exec(written);
    const none = !digits;
    return [stat, { text: none ? NO_VALUE : written, change: none ? "" : changeOf(mod), order: digits ? Number(digits[0]) : null }];
  }));
}

/** The ways a skill comes to a player in the league: an advancement, or a god's favour. The captain's Pro comes with the captaincy and is not gained. */
const GAINED = ["primary", "secondary", "favoured"];

/**
 * The skills in the order the player came by them (`skillsForPlayer`), each with the advancement that granted it: the place in
 * `advancements` of the first whose grant names it, null for a skill nothing granted, which a position's, a god's and the
 * captaincy's are, whatever an advancement is written to have granted.
 */
function skillsOf(row, player, advancements) {
  return skillsForPlayer(row, player).map(({ name, access }) => {
    const granted = access === "primary" || access === "secondary" ? advancements.findIndex(({ grants }) => grants?.skill === name) : -1;
    return { name, gained: GAINED.includes(access), source: access, advancement: granted < 0 ? null : granted };
  });
}

/**
 * The advancements he has taken, in the order he took them: what each granted (null where nothing was written), how it was
 * rolled — `site` and the roll's id, `table`, or neither for one the roster has no roll for — what it cost at the rank
 * it was taken at, and the god's skill its D8 brought, tied to it, while he holds it (`favoured`, `tiedFavoured`; only when there is one).
 */
function advancementsOf(player) {
  return player.advancements.map((advancement, rank) => {
    const { type, grants, roll } = advancement, favoured = tiedFavoured(player, advancement);
    return { type, grants: grants ?? null, via: roll?.via ?? "", rollId: roll?.id ?? "", cost: advancementCostAt(rank, type), ...(favoured ? { favoured } : {}) };
  });
}

/**
 * His SPP. The career is what counts, blob and rows waiting alike, so a player who scored in the match
 * he plays can already be told he may advance. The next advancement is the random skill's, the cheapest.
 */
function progressOf(race, player, career) {
  const earned = playerSppTotal(race, { spp: career });
  const spent = playerAdvancementSpent(player);
  const next = canTakeAdvancement(race, { ...player, spp: career }, "random");
  return {
    earned, spent, available: earned - spent, level: playerAdvancementLevel(player),
    cheapest: next.reason === ADVANCEMENT_BLOCKED.MAX_LEVEL ? null : next.cost, ready: next.allowed,
  };
}

/** The injury a match has dealt him that stands, as `{code}` or `{code, stat}`; the Players step's `retire` is not the match's to say. */
function injuryOf(injuries, id) {
  const standing = Object.hasOwn(injuries, id) ? injuries[id] : null;
  return standing ? { code: standing.code, ...(standing.stat ? { stat: standing.stat } : {}) } : null;
}

/**
 * The keys of the lines, in the roster's order: his id — the text a write names him by, a blank in it made `_`, since it
 * would make a list of the id of his panel (RosterTable) — and how many lines before him have that much of a key, so
 * that two 2.x players who share an id are told apart. Not his place in the roster: a death, which takes a place out of
 * it, would re-key every player after it, and his row open on a phone, his place in the panel and his SPP since the
 * screen opened (memory.mjs) would go with the old key (final review, T8).
 * @param {string[]} ids @returns {string[]}
 */
function keysOf(ids) {
  const seen = new Map();
  return ids.map((id) => {
    const base = id.replace(/\s+/g, "_");
    const nth = seen.get(base) ?? 0;
    seen.set(base, nth + 1);
    return `${base}#${nth}`;
  });
}

/**
 * @typedef {object} PlayerLine
 * @property {string} key `<id>#<n>`, n the lines before him with the same id (`keysOf`): unique in the page even where two 2.x players share an id
 * @property {string} id the stored id a write names (`storedPlayerId`); empty for a player the roster stores none for, whom no write can name
 * @property {number} index the place in the roster
 * @property {string} number
 * @property {string} name
 * @property {string} position the race's own words for it
 * @property {string} kind positionKind(row)
 * @property {boolean} captain
 * @property {boolean} skip skipNextGame
 * @property {{code: string, stat?: string, note?: string, pairingId?: string}|null} absence why he misses the next match, as the roster reads it (normalizeAbsence); null for one who plays, and for a 2.x skip that has no reason
 * @property {boolean} retired temporarilyRetired: out for the season, which `skip` is true for as well
 * @property {Record<"ma"|"st"|"ag"|"pa"|"ar", {text: string, change: "up"|"down"|"", order: number|null}>} stats
 *   `text` as statValueForDisplayByStat writes it, "–" for a characteristic the player has not; `order` — the number to sort by (the target for AG and PA, "3+" → 3), null for none
 * @property {{name: string, gained: boolean, source: "base"|"primary"|"secondary"|"favoured"|"captain", advancement: number|null}[]} skills
 *   `advancement`: the place in `advancements` of the one that granted the skill (by its `grants.skill`), null for a skill none did
 * @property {string[]} primary category names (categoriesForAccess)
 * @property {string[]} secondary category names (categoriesForAccess)
 * @property {Record<string, number>} blob the draft's counters (normalizeSppCounters)
 * @property {Record<string, number>} career careerCounters(player, events not settled)
 * @property {Record<string, number>} match the sum of the live match's own rows per counter (eventTotal), zeros outside a match
 * @property {Record<string, number>} waiting blob + the rows without a match not settled, per counter
 * @property {{code: string, stat?: string}|null} injury the match's standing injury (statisticsFromEvents), null outside a match
 * @property {number} earned playerSppTotal(race, career)
 * @property {number} spent
 * @property {number} available earned − spent
 * @property {number} level advancements taken
 * @property {{type: string, grants: {skill?: string, stat?: string}|null, via: "site"|"table"|"", rollId: string, cost: number, favoured?: string}[]} advancements
 *   in the order taken; `via` how the result was rolled ("" where the roster has no roll for it), `rollId` the site roll's id ("" for none),
 *   `cost` the price of the type at the rank it was taken at
 * @property {ReturnType<typeof advancementOffers>|null} offers what he may take next on the roster's own SPP, the draft's — the blob, which the
 *   rows waiting are not in (decision 4), unlike `available`; null while the Skill Table has not come in (`rosterLines`' `skillGroups`), which is
 *   «unknown»: a skill type is not «no skill left» for a table nobody has read
 * @property {{niggling: number, lasting: {stat: string, count: number}[]}} injuries Niggling Injuries and the points each characteristic lost to a lasting one (playerInjuries)
 * @property {number|null} cheapest the random skill's cost at the next rank, null at the last
 * @property {boolean} ready cheapest !== null && available >= cheapest
 * @property {number} value playerCurrentCost(row, player), in thousands
 * @property {number} price what his position costs to hire, in thousands (costToNumber(rowCost(row))): not his value, which the advancements and the injuries move
 * @property {{type: "sell"|"cancel-purchase", amount: number, blocked: boolean}} removal what parting with him gives, in thousands (playerRemoval, on the draft the lines are made of): a purchase still open is cancelled for what he cost, any other player is sold; `blocked` is a sale that would leave the roster under seven, which a cancel never is
 * @property {number} matchSpp the SPP of the match's own rows (weights × match)
 * @property {number} outsideSpp the SPP of the edits outside a match waiting for its finish (weights × (waiting − blob))
 */

/** The part of a line that is the player's counters, each read from the rows that are its own. */
function countersOf(race, id, spp, rows) {
  const own = { id, spp };
  const match = Object.fromEntries(SPP_EVENT_COUNTERS.map((counter) => [counter, eventTotal(rows.match, id, counter)]));
  const blob = normalizeSppCounters(spp);
  const waiting = careerCounters(own, rows.outside);
  // The SPP of the match are the rows' worth; a sum below zero (the server refuses a minus that takes back nothing) is read as none.
  return {
    blob, career: careerCounters(own, rows.unsettled), match, waiting,
    matchSpp: playerSppTotal(race, { spp: match }), outsideSpp: playerSppTotal(race, { spp: waiting }) - playerSppTotal(race, { spp: blob }),
  };
}

/**
 * The lines of a roster, in its order. Every player the race has a position for; a stored entry for a
 * row it has not is nobody.
 *
 * @param {object} props
 * @param {object} props.draft the roster as GET /api/teams/:id sends it, normalised
 * @param {object|null} props.race the race's page in the reference data; with none there are no lines
 * @param {object[]} [props.events] GET …/events: every row not settled, with its `pairingId`
 * @param {{kind: string, game?: object}} [props.mode] `rosterMode`'s
 * @param {{category: string, skills: string[]}[]|null} [props.skillGroups] the Skill Table; null (it has not come in) leaves every `offers` null
 * @returns {PlayerLine[]}
 */
export function rosterLines({ draft, race, events = [], mode = { kind: "plain" }, skillGroups = null }) {
  if (!race) return [];
  const unsettled = events.filter((event) => !event.settledAt);
  const rows = {
    unsettled,
    match: mode.kind === "match" ? unsettled.filter((event) => event.pairingId === mode.game.id) : [],
    outside: unsettled.filter((event) => !event.pairingId),
  };
  const players = selectedRosterPlayers(race, draft);
  const ids = players.map((player) => storedPlayerId(player) ?? "");
  const keys = keysOf(ids);
  const { injuries: matchInjuries } = statisticsFromEvents({ players: ids.map((id) => ({ id })) }, rows.match);
  return players.map((player, at) => {
    const { row, index } = player;
    const id = ids[at];
    const counters = countersOf(race, id, player.spp, rows);
    const advancements = advancementsOf(player);
    return {
      key: keys[at], id, index, number: player.number, name: player.name, position: row.position, kind: positionKind(row),
      captain: Boolean(player.isCaptain), skip: player.skipNextGame, absence: player.absence, retired: Boolean(player.temporarilyRetired),
      stats: statsOf(row, player), skills: skillsOf(row, player, advancements),
      primary: categoriesForAccess(row.primary), secondary: categoriesForAccess(row.secondary),
      ...counters, injury: mode.kind === "match" ? injuryOf(matchInjuries, id) : null,
      ...progressOf(race, player, counters.career), value: playerCurrentCost(row, player),
      advancements, offers: skillGroups ? advancementOffers(race, row, player, skillGroups) : null, injuries: playerInjuries(player),
      // What he brings back is the league's rule, kept where the server's save reads it (transfers.mjs): half his value, his full value and ten for each
      // injury under Architect of Fate (content/Gata/General Information/Special Rules.md), and no sale that leaves under seven (content/Gata/Rules/3. Team Management.md).
      price: costToNumber(rowCost(row)), removal: playerRemoval(race, draft, player),
    };
  });
}

/** The head of the screen: how many are on the roster, how many miss the next match, how many can take an advancement now. */
export function rosterCounts(lines) {
  return { players: lines.length, skipping: lines.filter(({ skip }) => skip).length, ready: lines.filter(({ ready }) => ready).length };
}

/** The roster in two: those who play the next match, then those who miss it; each in the order the lines are given. */
export function rosterSections(lines) {
  return { active: lines.filter(({ skip }) => !skip), skipping: lines.filter(({ skip }) => skip) };
}

// ---------------------------------------------------------------------------
// The fallen
// ---------------------------------------------------------------------------

/**
 * @typedef {PlayerLine & {bare: boolean, fallen: {id: string, cause: string|null, fromMatch: boolean, round: number|null, diedAt: string}}} FallenLine
 *   A fallen player as a line: `key` is `fallen-<record id>`, `index` the place in the server's list; he does not miss
 *   a match, is not the captain and takes no advancement (`skip`, `captain`, `ready` false, `offers` maxed with nothing
 *   to offer — never null, which a view reads as «unknown»; no captain's Pro among his skills), no match is on for him
 *   (`injury` null, `match` zeros). `round` is the match's round, null for a friendly, a death by hand and a record the
 *   server has no round for. `bare`: a record the roster cannot read — no row of the race for its snapshot, or no
 *   player in it at all — drawn from what it says of itself; the server would not give him back to the roster
 *   (FALLEN_NOT_RESTORABLE), so no undo of it is offered (K11). One with no id is bare too: no write could name him
 *   back, and no read could find him on the roster to say whether an undo landed. `price` and `removal` are there for
 *   the shape's sake: the dead are neither hired nor sold, and no screen reads them for him.
 */

/** No rows: the dead have none, so the counters of a line made for them are the snapshot's own. */
const NO_ROWS = Object.freeze({ unsettled: [], match: [], outside: [] });

/** A field of a snapshot as text: a number is its digits (an admin writes 5, not "5"), anything else that is not text is none. */
const textOf = (value) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

/**
 * The line of a snapshot that no row of the race fits: no position index, one the race has not, the shape
 * a league admin writes (`{name, position, number}`). Only what the snapshot says of himself, dashes where
 * the characteristics would be, and nothing to count.
 */
function bareLine(race, snapshot) {
  const id = storedPlayerId(snapshot) ?? "";
  const counters = countersOf(race, id, {}, NO_ROWS);
  return {
    key: "", id, index: 0, number: textOf(snapshot.number), name: textOf(snapshot.name), position: textOf(snapshot.position), kind: "lineman",
    captain: false, skip: false, absence: null, retired: false,
    stats: Object.fromEntries(PLAYER_STATS.map((stat) => [stat, { text: NO_VALUE, change: "", order: null }])), skills: [], primary: [], secondary: [],
    ...counters, injury: null,
    earned: 0, spent: 0, available: 0, level: 0, cheapest: null, ready: false, value: 0,
    advancements: [], offers: { level: 0, maxed: true, available: 0, offers: [] }, injuries: { niggling: 0, lasting: [] },
    price: 0, removal: { type: "sell", amount: 0, blocked: true },
  };
}

/**
 * The fallen as lines, in the order the server lists them. A player the roster as read still holds is not
 * one (he is drawn on the roster, once: decision 21), and with no race there is nothing to read them by.
 * A snapshot the race has a row for is read as a player of the roster is, its career the counters it
 * carries; one it has none for (and an entry that is no object) is a bare line.
 *
 * @param {object} props
 * @param {object[]} props.fallen GET /api/teams/:id/fallen: `{id, player, cause, roundNumber, diedAt, fromMatch}`
 * @param {object|null} props.race
 * @param {string[]} [props.rosterIds] the stored ids (`PlayerLine.id`) of the roster as read
 * @returns {FallenLine[]}
 */
export function fallenLines({ fallen, race, rosterIds = [] }) {
  if (!race) return [];
  const held = new Set(rosterIds);
  return (Array.isArray(fallen) ? fallen : []).flatMap((record, index) => {
    const snapshot = record.player && typeof record.player === "object" ? record.player : {};
    if (held.has(storedPlayerId(snapshot))) return [];
    const [read] = rosterLines({ draft: { players: [snapshot] }, race });
    const line = read ?? bareLine(race, snapshot);
    return [{
      ...line,
      // The captain's Pro goes with the captaincy, which the dead do not hold (and an undo gives back only to an empty chair).
      skills: line.skills.filter(({ source }) => source !== "captain"),
      key: `fallen-${record.id}`, index, skip: false, captain: false, ready: false, offers: { level: line.level, maxed: true, available: 0, offers: [] }, absence: null, retired: false, injury: null, bare: !read || !line.id,
      fallen: { id: record.id, cause: record.cause ?? null, fromMatch: Boolean(record.fromMatch), round: record.roundNumber ?? null, diedAt: record.diedAt },
    }];
  });
}

/**
 * A death the screen undoes (K11): one a coach marked, in a record the roster reads; one a post-match recorded, and a
 * bare record, are the league administrator's to correct — and on the admin's visit (stage 12, pre-flight L10) one a
 * post-match recorded is undone too (the server lets the admin, `returnPlayer`). A bare record the server would not give back.
 * @param {FallenLine|PlayerLine|null} line @param {{admin?: boolean}} [options] `admin` is the admin's visit
 */
export const undoable = (line, { admin = false } = {}) => Boolean(line?.fallen) && (admin || !line.fallen.fromMatch) && !line.bare;

// ---------------------------------------------------------------------------
// Where a tap goes
// ---------------------------------------------------------------------------

/**
 * Where a tap on a counter goes and where it stops, which is where the server would refuse it
 * (`EVENT_BELOW_ZERO`, `POST_PLAYER`): a step down takes back a step up, and only of the same kind.
 *
 *   - roster: outside a match (and in a preparation, which is none) the tap changes the roster's own counter;
 *     the − stops at the roster's zero. The + is stopped only by the largest count a roster is taken with,
 *     which the save refuses.
 *   - match: a tap of the match is a row of it. The − stops where the match's own rows add up to nothing; the
 *     MVP is picked in the post-match, so its + is refused; a player who sits it out is not in the match.
 *   - outside: an edit of the roster made while a match is on waits as a row for its finish. The − stops where the
 *     roster's count and the edits waiting on it add up to nothing; here the MVP and the one who sits out are allowed.
 *
 * @param {PlayerLine} line built by `rosterLines` with the same `mode` it is given here: a line made outside a
 *   match has no rows of a match in it, and a rule for a match read from it would stop the minus at zero
 * @param {string} counter one of `SPP_EVENT_COUNTERS`
 * @param {{mode: {kind: string}, outside?: boolean}} options `outside` is the screen's «edit outside the match»
 * @returns {{via: "roster"|"match"|"outside", decDisabled: boolean, incBlocked: ""|"mvp", locked: ""|"notPlaying"}}
 */
export function stepRule(line, counter, { mode, outside = false }) {
  const none = (count) => !(count > 0);
  if (mode.kind !== "match") return { via: "roster", decDisabled: none(line.blob[counter]), incBlocked: "", locked: "" };
  if (outside) return { via: "outside", decDisabled: none(line.waiting[counter]), incBlocked: "", locked: "" };
  return { via: "match", decDisabled: none(line.match[counter]), incBlocked: counter === "mvps" ? "mvp" : "", locked: line.skip ? "notPlaying" : "" };
}

// ---------------------------------------------------------------------------
// The order
// ---------------------------------------------------------------------------

/** The columns a roster can be sorted by: the player (by number), the characteristics, the main counters, the SPP. */
export const SORT_KEYS = Object.freeze(["player", ...PLAYER_STATS, ...MAIN_COUNTERS, "earned", "available"]);

/** What a column is sorted by in a line; a null is a value the player has not. */
const SORT_VALUES = {
  player: (line) => {
    const number = Number.parseFloat(line.number);
    return Number.isFinite(number) ? number : null;
  },
  ...Object.fromEntries(PLAYER_STATS.map((stat) => [stat, (line) => line.stats[stat].order])),
  ...Object.fromEntries(MAIN_COUNTERS.map((counter) => [counter, (line) => line.career[counter]])),
  earned: (line) => line.earned,
  available: (line) => line.available,
};

/** The columns whose first press puts the best first: the player by his number, and AG and PA, where less is better. */
const BEST_FIRST_UP = ["player", "ag", "pa"];

function checkedKey(key) {
  if (!SORT_KEYS.includes(key)) throw new Error(`unknown sort key: ${JSON.stringify(key)}`);
  return key;
}

/**
 * The sort a press on a column makes: the first press puts the best first (numbers down, AG and PA up, the
 * player by his number up), the same column again turns it round.
 *
 * @param {{key: string, dir: "asc"|"desc"}|null} current
 * @param {string} key one of `SORT_KEYS`
 * @returns {{key: string, dir: "asc"|"desc"}}
 */
export function nextSort(current, key) {
  checkedKey(key);
  if (current?.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: BEST_FIRST_UP.includes(key) ? "asc" : "desc" };
}

/**
 * The lines in the order of a sort, as a copy; none is the roster's order. A line with no value in the column
 * goes last whichever way it is sorted, and lines that are equal stay in the roster's order.
 *
 * @param {PlayerLine[]} lines
 * @param {{key: string, dir: "asc"|"desc"}|null} sort
 * @returns {PlayerLine[]}
 */
export function sortLines(lines, sort) {
  if (!sort) return [...lines].sort((first, second) => first.index - second.index);
  const valueOf = SORT_VALUES[checkedKey(sort.key)];
  if (sort.dir !== "asc" && sort.dir !== "desc") throw new Error(`unknown sort direction: ${JSON.stringify(sort.dir)}`);
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...lines].sort((first, second) => {
    const [one, other] = [valueOf(first), valueOf(second)];
    if (one === null || other === null) return (one === null) - (other === null) || first.index - second.index;
    return sign * (one - other) || first.index - second.index;
  });
}
