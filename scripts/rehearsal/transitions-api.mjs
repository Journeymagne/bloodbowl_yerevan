/**
 * How rehearsal:transitions talks to a site: over HTTP and nothing else (scripts/rehearsal-transitions.mjs).
 * The same calls work on 2.1.0 and on 3.0 — the coach's routes of a pre-match and a post-match did not change
 * their shape — so the seed (2.1.0) and the finish (3.0) drive a match with the same few helpers. Which of the two
 * a site is, is read before anything is written to it (`assertSiteVersion`).
 */
import { calculateMatchCtv } from "../../src/domain/match/roster.mjs";
import { POST_STEPS } from "../../src/domain/post-match/rules.mjs";

const HUMAN_ROWS = [0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3]; // teams/human: 0 Lineman, 1 Thrower, 2 Catcher, 3 Blitzer
/** An id no team has: whose rolls `siteVersion` asks for, with no session. */
const NO_TEAM = "00000000-0000-4000-8000-000000000000";

/**
 * A site's API. `request` answers whatever the site answers, but a redirect: it is followed nowhere, and refused
 * with where it pointed — the site was checked to be this machine's (`assertLocalSite`), and a redirect could send
 * the coaches' passwords and the writes elsewhere. `ok` wants a 2xx and throws otherwise, saying the method, the
 * path, the status and the body, so a FAIL line names the call that broke.
 *
 * @param {string} base the site's origin (checked local before this, `assertLocalSite`)
 */
export function siteApi(base) {
  async function request(method, path, { token = null, body } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      redirect: "manual",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status >= 300 && response.status <= 399) {
      await response.body?.cancel();
      throw new Error(`${method} ${path} → ${response.status}, a redirect to ${response.headers.get("location") ?? "(no Location)"}: `
        + "rehearsal:transitions follows none — give it the address the site answers on");
    }
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
 * Which version a site is, by one read that writes nothing and needs no session: 3.0 keeps a team's rolls
 * (`GET /api/teams/:id/rolls`) and asks a stranger to sign in, 401 NOT_AUTHORIZED; 2.1.0 has no such route, 404
 * ROUTE_NOT_FOUND. Anything else is neither.
 *
 * @param {ReturnType<typeof siteApi>} api
 * @returns {Promise<"2.1.0"|"3.0">}
 * @throws when the answer is neither, saying the site and the answer
 */
export async function siteVersion(api) {
  const answer = await api.request("GET", `/api/teams/${NO_TEAM}/rolls`);
  const code = answer.data?.error?.code;
  if (answer.status === 401 && code === "NOT_AUTHORIZED") return "3.0";
  if (answer.status === 404 && code === "ROUTE_NOT_FOUND") return "2.1.0";
  throw new Error(`${api.base} answers GET /api/teams/…/rolls with ${answer.status} ${JSON.stringify(answer.data)?.slice(0, 200)}: neither 2.1.0 nor 3.0`);
}

/**
 * Refuse a site of the other version before anything is written to it: --seed runs on 2.1.0 only (on 3.0 its
 * post-match would follow the match's records, and its rows would be the dump's new ones), --finish on 3.0 only
 * (on 2.1.0 it would use up the seed's states).
 *
 * @param {ReturnType<typeof siteApi>} api
 * @param {"2.1.0"|"3.0"} wanted
 * @throws naming the site, what it is and what was wanted
 */
export async function assertSiteVersion(api, wanted) {
  const version = await siteVersion(api);
  if (version !== wanted) {
    throw new Error(`${api.base} is a ${version} site, and ${wanted === "2.1.0" ? "--seed" : "--finish"} runs against ${wanted} only — nothing was written to it`);
  }
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
      const call = api.ok("PATCH", path, { token: tokens[side], body: { revision: match.answer.preparation.revision, action } });
      match.answer = await said(call, `the pre-match's ${side} side, «${action.type}»`);
      return match.answer;
    },
    async start() {
      const call = api.ok("POST", `/api/games/${gameId}/start`, { token: tokens.home, body: { revision: match.answer.preparation.revision } });
      match.answer = await said(call, "the pre-match's start");
      return match.answer;
    },
  };
  return match;
}

/** A call of a match's drive whose refusal says where in the match it came, before the call's own words. */
async function said(call, where) {
  try {
    return await call;
  } catch (error) {
    throw new Error(`${where}: ${error.message}`, { cause: error });
  }
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
 * A match's post-match, as `preMatch` is its pre-match: `answer` is the last answer (`{ postMatch, … }`). A refused
 * step says the side, the step it was on and the action, as the pre-match's says the side and the action.
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
      const step = POST_STEPS[match.answer.postMatch[side]?.stage] ?? "?";
      const call = api.ok("PATCH", path, { token: tokens[side], body: { revision: match.answer.postMatch.revision, action } });
      match.answer = await said(call, `the post-match's ${side} side on its «${step}» step, «${action.type}»`);
      return match.answer;
    },
    async finish() {
      const call = api.ok("POST", `/api/games/${gameId}/finish`, { token: tokens.home, body: { revision: match.answer.postMatch.revision } });
      match.answer = await said(call, "the post-match's finish");
      return match.answer;
    },
  };
  return match;
}
