/**
 * How rehearsal:transitions talks to a site: over HTTP and nothing else (scripts/rehearsal-transitions.mjs).
 * The same calls work on 2.1.0 and on 3.0 — the coach's routes of a pre-match and a post-match did not change
 * their shape — so the seed (2.1.0) and the finish (3.0) drive a match with the same few helpers.
 */
import { calculateMatchCtv } from "../../src/domain/match/roster.mjs";

const HUMAN_ROWS = [0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3]; // teams/human: 0 Lineman, 1 Thrower, 2 Catcher, 3 Blitzer

/**
 * A site's API. `request` answers whatever the site answers; `ok` wants a 2xx and throws otherwise, saying the
 * method, the path, the status and the body, so a FAIL line names the call that broke.
 *
 * @param {string} base the site's origin (checked local before this, `assertLocalSite`)
 */
export function siteApi(base) {
  async function request(method, path, { token = null, body } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text.slice(0, 300);
    }
    return { status: response.status, data };
  }
  async function ok(method, path, options = {}) {
    const answer = await request(method, path, options);
    if (answer.status < 200 || answer.status > 299) {
      throw new Error(`${method} ${path} → ${answer.status} ${JSON.stringify(answer.data)?.slice(0, 400)}`);
    }
    return answer.data;
  }
  return { base, request, ok };
}

/**
 * The body of `POST /api/teams` for one team of the seed: Humans, eleven players on the Lineman, Thrower,
 * Catcher and Blitzer rows, 100 in the treasury, 2 dedicated fans, and 30 bonus SPP on the first player — SPP
 * to advance with. The players' ids are `t-<stamp>-<n>`; the seed gives every team its own stamp.
 *
 * @param {string} name the team's name
 * @param {string} stamp what makes this team's player ids its own
 * @returns {{ name: string, baseTeamSlug: string, roster: object }}
 */
export function transitionRoster(name, stamp) {
  const players = HUMAN_ROWS.map((rowIndex, n) => ({
    id: `t-${stamp}-${n}`, rowIndex, number: String(n + 1), name: `Transitions ${n + 1}`, ...(n === 0 ? { spp: { bonus: 30 } } : {}),
  }));
  return { name, baseTeamSlug: "teams/human", roster: { teamSlug: "teams/human", teamName: name, treasury: 100, dedicatedFans: 2, players } };
}

/**
 * A match's pre-match, step by step: each change is sent on the revision of the last answer, by the coach of
 * the side it is for. `answer` is the last answer (`{ preparation, snapshots?, fixture }`).
 *
 * @param {ReturnType<typeof siteApi>} api
 * @param {string} gameId
 * @param {{ home: string, away: string }} tokens each side's coach's session
 */
export function preMatch(api, gameId, tokens) {
  const path = `/api/games/${gameId}/preparation`;
  const match = {
    answer: null,
    async read() {
      match.answer = await api.ok("GET", path, { token: tokens.home });
      return match.answer;
    },
    async act(side, action) {
      match.answer = await api.ok("PATCH", path, { token: tokens[side], body: { revision: match.answer.preparation.revision, action } });
      return match.answer;
    },
    async start() {
      match.answer = await api.ok("POST", `/api/games/${gameId}/start`, { token: tokens.home, body: { revision: match.answer.preparation.revision } });
      return match.answer;
    },
  };
  return match;
}

/** Fans of both sides and the weather: the pre-match on its «Roster» step (`preparationStep` 2). */
export async function openPreMatch(match) {
  if (!match.answer) await match.read();
  for (const side of ["home", "away"]) await match.act(side, { type: "fans", value: 2 });
  await match.act("home", { type: "weather", season: "Autumn", home: 3, away: 4 });
}

/**
 * The rest of a pre-match from its «Roster» step, with no inducements: both rosters locked, the baskets locked
 * in the order the site holds them to — the side with the higher CTV first, either one when they are equal
 * (src/domain/match/budget.mjs) — both sides confirmed, and the match started.
 */
export async function finishPreMatch(match) {
  for (const side of ["home", "away"]) await match.act(side, { type: "lock-roster" });
  const ctv = (side) => calculateMatchCtv(match.answer.preparation[side]).total;
  for (const side of ["home", "away"].sort((a, b) => ctv(b) - ctv(a))) await match.act(side, { type: "lock-basket" });
  for (const side of ["home", "away"]) await match.act(side, { type: "confirm" });
  return match.start();
}

/**
 * A match's post-match, as `preMatch` is its pre-match: `answer` is the last answer (`{ postMatch, … }`).
 *
 * @param {ReturnType<typeof siteApi>} api
 * @param {string} gameId
 * @param {{ home: string, away: string }} tokens
 */
export function postMatch(api, gameId, tokens) {
  const path = `/api/games/${gameId}/post-match`;
  const match = {
    answer: null,
    async read() {
      match.answer = await api.ok("GET", path, { token: tokens.home });
      return match.answer;
    },
    async act(side, action) {
      match.answer = await api.ok("PATCH", path, { token: tokens[side], body: { revision: match.answer.postMatch.revision, action } });
      return match.answer;
    },
    async finish() {
      match.answer = await api.ok("POST", `/api/games/${gameId}/finish`, { token: tokens.home, body: { revision: match.answer.postMatch.revision } });
      return match.answer;
    },
  };
  return match;
}
