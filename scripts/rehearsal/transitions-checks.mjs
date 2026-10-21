/**
 * The pure part of rehearsal:transitions (scripts/rehearsal-transitions.mjs): which site it may talk to, what
 * its command line says, what a record of the seed holds, and what a finished match must show.
 *
 * The checks count for themselves. SPP after a match is the roster's SPP before it plus the statistics the
 * post-match was given and one MVP per mention, added up here from the counters' names (`MATCH_COUNTERS`,
 * `normalizeSppCounters`), not by the post-match's own domain, which is what is being checked. The match's
 * records are summed here, and the money is checked against the teams as the API shows them before and after.
 * Only a played match (mode «Сыграно») is counted: every state the seed makes is one.
 */
import { MATCH_COUNTERS } from "../../src/domain/post-match/events.mjs";
import { normalizeSppCounters } from "../../src/domain/roster/players.mjs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const RECORD_VERSION = 1;
const STATE_NAMES = ["preparation", "started", "postPlayers", "proposed", "challenge"];
// The lists of a record's `seeded`, named as strings: a key one letter past a project export trips check-references.
const SEEDED_LISTS = ["pairingIds", "challengeIds", "teamIds"];
const USAGE ="npm run rehearsal:transitions -- --seed <url of the 2.1.0 site> | --finish <url of the 3.0 site>";

// What each state of a record must name, beyond being an object.
const STATE_FIELDS = {
  preparation: ["gameId", "step"],
  started: ["gameId", "teamIds"],
  postPlayers: ["gameId", "teamIds", "before", "statistics", "mvps"],
  proposed: ["gameId", "score"],
  challenge: ["challengeId", "teamId"],
};

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const count = (value) => Number(value ?? 0) || 0;

/**
 * The site rehearsal:transitions may talk to: plain http on this machine, nothing else. It writes coaches,
 * teams and matches through the API, so a production address must never get this far.
 *
 * @param {string} url
 * @returns {string} the site's origin, without a trailing slash
 * @throws when the address is not http on localhost, 127.0.0.1 or [::1]
 */
export function assertLocalSite(url) {
  let parsed = null;
  try {
    parsed = new URL(String(url));
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== "http:" || !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`a seed or a finish runs only against a local site (http on localhost, 127.0.0.1 or [::1]), not ${JSON.stringify(String(url))}`);
  }
  return parsed.origin;
}

/**
 * The command line: exactly one of `--seed <url>` and `--finish <url>`, and nothing else.
 *
 * @param {string[]} argv the arguments after the script's name
 * @returns {{ mode: "seed"|"finish", base: string }}
 * @throws with the usage when the line says anything else
 */
export function parseTransitionsArgs(argv) {
  const flags = argv.filter((arg) => arg === "--seed" || arg === "--finish");
  if (flags.length !== 1) throw new Error(`exactly one of --seed <url> and --finish <url>: ${USAGE}`);
  const at = argv.indexOf(flags[0]), url = argv[at + 1];
  if (!url || url.startsWith("--")) throw new Error(`${flags[0]} needs the address of the site: ${USAGE}`);
  const rest = argv.filter((_, index) => index !== at && index !== at + 1);
  if (rest.length) throw new Error(`unexpected ${rest.join(" ")}: ${USAGE}`);
  return { mode: flags[0].slice(2), base: assertLocalSite(url) };
}

function missingOfCoach(coach) {
  return ["login", "password", "id"].filter((key) => typeof coach?.[key] !== "string" || !coach[key]);
}

/**
 * A record of the seed as --finish reads it back: this version, both coaches with what signs them in, and
 * every one of the five states with what its finish needs.
 *
 * @param {unknown} value the parsed output/rehearsal/transitions.json
 * @returns {object} the record, unchanged
 * @throws naming what is missing
 */
export function assertTransitionsRecord(value) {
  const fail = (what) => { throw new Error(`output/rehearsal/transitions.json is not a record of rehearsal:transitions: ${what} — seed again`); };
  if (!isObject(value)) fail("not an object");
  if (value.version !== RECORD_VERSION) fail(`version ${value.version}, this script reads ${RECORD_VERSION}`);
  for (const side of ["home", "away"]) {
    const missing = missingOfCoach(value.coaches?.[side]);
    if (missing.length) fail(`coaches.${side} has no ${missing.join(", ")}`);
  }
  for (const name of STATE_NAMES) {
    const state = value.cases?.[name];
    if (!isObject(state)) fail(`no state ${name}`);
    const missing = STATE_FIELDS[name].filter((key) => state[key] === undefined || state[key] === null);
    if (missing.length) fail(`state ${name} has no ${missing.join(", ")}`);
  }
  return value;
}

/**
 * The rows a seed made, for rehearsal:check to mark in its report and leave out of the open states it counts
 * (scripts/rehearsal-check.mjs): its pairings, its challenges and its teams. Null for anything that is not a
 * record of a seed — no file, or one without them.
 *
 * @param {unknown} value the parsed output/rehearsal/transitions.json, or null
 * @returns {{ pairingIds: string[], challengeIds: string[], teamIds: string[] }|null}
 */
export function seededRows(value) {
  const seeded = isObject(value) ? value.seeded : null;
  if (!isObject(seeded)) return null;
  return Object.fromEntries(SEEDED_LISTS.map((key) => [key, Array.isArray(seeded[key]) ? seeded[key].map(String) : []]));
}

/**
 * Each roster player's SPP after a played match: the SPP before it, plus the side's statistics counter by
 * counter, plus one MVP for each time the side names the player. Only the players of the roster before the
 * match: a journeyman or a star of the match roster has no SPP on the roster to count.
 *
 * @param {object[]} beforePlayers the roster's players before the match (`GET /api/teams/:id`)
 * @param {{ statistics: Record<string, object>, mvps: string[] }} side what the side's post-match was given
 * @returns {Map<string, Record<string, number>>} player id → every SPP counter
 */
export function sppAfterMatch(beforePlayers, side) {
  const expected = new Map();
  for (const player of beforePlayers) {
    const spp = normalizeSppCounters(player.spp);
    const statistics = side.statistics?.[player.id] ?? {};
    for (const counter of MATCH_COUNTERS) spp[counter] += count(statistics[counter]);
    spp.mvps += (side.mvps ?? []).filter((id) => id === player.id).length;
    expected.set(player.id, spp);
  }
  return expected;
}

/**
 * Where the roster after the match is not what `sppAfterMatch` expects.
 *
 * @param {Map<string, Record<string, number>>} expected
 * @param {object[]} afterPlayers the roster's players after the match
 * @returns {string[]} "<id>: <counter> <expected> ≠ <actual>", or that the player is gone
 */
export function sppMismatches(expected, afterPlayers) {
  const after = new Map(afterPlayers.map((player) => [player.id, normalizeSppCounters(player.spp)]));
  const mismatches = [];
  for (const [id, counters] of expected) {
    const actual = after.get(id);
    if (!actual) {
      mismatches.push(`${id}: not on the roster after the match`);
      continue;
    }
    for (const [counter, value] of Object.entries(counters)) {
      if (actual[counter] !== value) mismatches.push(`${id}: ${counter} ${value} ≠ ${actual[counter]}`);
    }
  }
  return mismatches;
}

/**
 * Where a team's records of the match (`GET /api/teams/:id/events?pairing=`) are not what a finished match
 * leaves: a record not settled, or a counter whose records do not add up to the statistics the post-match
 * applied. The injury is no count and is left out of the sums.
 *
 * @param {object[]} events the records, as the API lists them
 * @param {Record<string, object>} statistics player id → the side's statistics
 * @returns {string[]}
 */
export function eventMismatches(events, statistics) {
  const mismatches = [];
  const unsettled = events.filter((event) => !event.settledAt).length;
  if (unsettled) mismatches.push(`${unsettled} record(s) of the match not settled`);
  const sums = new Map();
  for (const event of events.filter((item) => MATCH_COUNTERS.includes(item.counter))) {
    const key = `${event.playerId}\u0000${event.counter}`;
    sums.set(key, (sums.get(key) ?? 0) + count(event.delta));
  }
  for (const [id, stats] of Object.entries(statistics ?? {})) {
    for (const counter of MATCH_COUNTERS) {
      if (count(stats?.[counter]) && !sums.has(`${id}\u0000${counter}`)) sums.set(`${id}\u0000${counter}`, 0);
    }
  }
  for (const [key, recorded] of sums) {
    const [id, counter] = key.split("\u0000");
    const entered = count(statistics?.[id]?.[counter]);
    if (entered !== recorded) mismatches.push(`${id}: ${counter} ${entered} in the statistics ≠ ${recorded} in the records`);
  }
  return mismatches;
}

/**
 * Where a side's account of the finish (`settlement.accounting`) does not add up, or does not match the
 * team before and after: it opens at the treasury the team had, the treasury plus the winnings and the sales
 * less the purchases, the deposit and the loss is what it closes at, the team holds that afterwards, and the
 * coach's safe grows by the deposit to what the team holds in it.
 *
 * @param {object} accounting
 * @param {object} before the roster before the match
 * @param {object} after the roster after it
 * @returns {string[]}
 */
export function moneyMismatches(accounting, before, after) {
  const { opening, winnings, sales, purchases, deposit, loss, closing, safeOpening, safeClosing } = accounting ?? {};
  const mismatches = [];
  if (opening !== count(before?.treasury)) mismatches.push(`the account opens at ${opening}, the team had ${count(before?.treasury)}`);
  if (opening + winnings + sales - purchases - deposit - loss !== closing) {
    mismatches.push(`${opening} + ${winnings} + ${sales} − ${purchases} − ${deposit} − ${loss} ≠ ${closing}`);
  }
  if (count(after?.treasury) !== closing) mismatches.push(`the team has ${count(after?.treasury)} after the match, the account closes at ${closing}`);
  if (count(safeOpening) + deposit !== safeClosing) mismatches.push(`the safe: ${count(safeOpening)} + ${deposit} ≠ ${safeClosing}`);
  if (count(after?.coachesSafe) !== safeClosing) mismatches.push(`the safe holds ${count(after?.coachesSafe)} after the match, the account closes it at ${safeClosing}`);
  return mismatches;
}

/**
 * The league table of `GET /api/season`, as two versions of the site answer it alike: the season's id and,
 * for each entry, its points, games, byes, touchdowns and casualties. The rest of the answer differs between
 * 2.1.0 and 3.0, or moves with any team's save (`updatedAt`), and says nothing about the table.
 *
 * @param {object} payload the answer of `GET /api/season`, read without a session
 * @returns {{ id: string|null, standings: object[] }}
 */
export function seasonTable(payload) {
  const standings = Array.isArray(payload?.standings) ? payload.standings : [];
  return {
    id: payload?.season?.id ?? null,
    standings: standings.map(({ entryId, points, games, byes, touchdowns, casualties }) => ({ entryId, points, games, byes, touchdowns, casualties })),
  };
}
