/**
 * The post-match the 3.0 steps' tests draw (stage 09b, Tasks 4–8): two teams as the prototypes name them — Mock Team
 * (Human: W. Brandt the captain, O. Krell, L. Ashby, R. Pike, T. Gruk, J. Corr out since the match before) and Mock
 * Rivals (eleven Human Linemen) —, the match's records as the coaches tapped them, and the domain's own actions to bring
 * each side to a step. Every action is read as the server reads it: the records followed before and after
 * (`followEvents`), so a side that has not saved its Players step holds what was tapped.
 */
import { readFileSync } from "node:fs";

import { expandCollections } from "../../src/data/reference.mjs";
import { addJourneyman, createMatchSide } from "../../src/domain/match/roster.mjs";
import { followEvents } from "../../src/domain/post-match/events.mjs";
import { applyPostAction, createPostMatch } from "../../src/domain/post-match/state.mjs";
import { postModel } from "../../src/screens/matches/post-model.mjs";

export const data = expandCollections(JSON.parse(readFileSync(new URL("../../public/data.en.json", import.meta.url), "utf8")));
export const FIXTURE = Object.freeze({ id: "g1", kind: "league", seasonName: "Mock Season", roundNumber: 7 });

/** Players `[rowIndex, …]` of a roster, numbered from 1, each with what `marks` says on top. */
export const players = (prefix, rows, marks = {}) => rows.map((rowIndex, index) => ({
  id: `${prefix}${index + 1}`, rowIndex, number: String(index + 1), name: `${prefix.toUpperCase()}. Player ${index + 1}`, ...marks[index],
}));

/** Mock Team: two Blitzers, two Catchers, a Thrower, six Linemen (#9 J. Corr out since the match before) and an Ogre. */
export const HOME = players("h", [3, 3, 2, 2, 1, 0, 0, 0, 0, 0, 0, 5], {
  0: { name: "W. Brandt", isCaptain: true }, 1: { name: "O. Krell" }, 2: { name: "L. Ashby" }, 3: { name: "R. Pike" }, 4: { name: "T. Gruk" },
  8: { name: "J. Corr", skipNextGame: true, absence: { code: "miss" } },
});
/** Mock Rivals: eleven Human Linemen. */
export const AWAY = players("a", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

/** One step of a match's records: a counter's +1, `times` over; an injury put on. */
export const tap = (playerId, counter, times = 1) => Array.from({ length: times }, () => ({ playerId, counter, delta: 1 }));
export const hurt = (playerId, injury) => [{ playerId, counter: "injury", delta: 1, injury }];

/**
 * What the coaches tapped (PostResult.html's numbers): ours — TD Ashby and Pike, CAS Gruk ×2 and Brandt, a completion
 * by Ashby, Krell's Lasting Injury (AG); theirs — a TD and a CAS. The score 2–1, CAS 3–1, agrees with them.
 */
export const RECORDS = Object.freeze({
  home: [...tap("h3", "touchdowns"), ...tap("h3", "completions"), ...tap("h4", "touchdowns"), ...tap("h5", "casualties", 2), ...tap("h1", "casualties"),
    ...hurt("h2", { code: "lasting", stat: "ag" })],
  away: [...tap("a1", "touchdowns"), ...tap("a2", "casualties")],
});

/** A team as its coach brings it to the match. */
function source(name, { id, team, roster, slug, gamesPlayed, treasury, dedicatedFans, coachesSafe, more }) {
  return { user: { id: `u-${name}`, login: name }, gamesPlayed,
    team: { id, name: team, revision: 2, baseTeamSlug: slug, roster: { treasury, dedicatedFans, coachesSafe, players: roster, ...more } } };
}

/** The snapshot of a side at the kick-off: who plays (not who misses the match), the journeymen hired, the Fan Factor. */
function snapshotOf(item, journeymen = []) {
  const side = createMatchSide(item, data);
  for (const rowIndex of journeymen) side.journeymen.push(addJourneyman(side, rowIndex));
  return { ...side, players: [...side.players.filter((player) => !player.skipNextGame), ...side.journeymen], fanFactor: Number(item.team.roster.dedicatedFans) + 2, effects: {} };
}

/**
 * A post-match just begun, its records followed. `home`/`away` change a team: `roster`, `slug`, `treasury`,
 * `dedicatedFans`, `coachesSafe`, `more` (roster fields), `journeymen` (rows of the journeymen it hired).
 */
export function begin({ gamesPlayed = 4, events = RECORDS, home = {}, away = {}, official = null } = {}) {
  const sides = {
    home: { id: "t-home", team: "Mock Team", roster: HOME, slug: "teams/human", gamesPlayed, treasury: 70, dedicatedFans: 3, coachesSafe: 20, ...home },
    away: { id: "t-away", team: "Mock Rivals", roster: AWAY, slug: "teams/human", gamesPlayed, treasury: 60, dedicatedFans: 3, coachesSafe: 0, ...away },
  };
  const sources = Object.fromEntries(Object.entries(sides).map(([name, side]) => [name, source(name, side)]));
  const snapshots = Object.fromEntries(Object.entries(sources).map(([name, item]) => [name, snapshotOf(item, sides[name].journeymen)]));
  return followEvents(createPostMatch("g1", sources, snapshots, data, official), events);
}

/** One action of the post-match, as the server takes it: the records followed before and after. */
export const act = (state, side, action, events = RECORDS) => followEvents(applyPostAction(followEvents(state, events), side, action, data), events);

/** The score sent by `by`: `home`/`away` are `[TD, CAS]`; a mode other than "played" is won by `winner`. */
export function scored(state, { home = [2, 3], away = [1, 1], mode = "played", winner = mode === "played" ? "" : "home", by = "home", events = RECORDS } = {}) {
  return act(state, by, { type: "result", mode, winner, home: { touchdowns: home[0], casualties: home[1] }, away: { touchdowns: away[0], casualties: away[1] } }, events);
}

/** The score sent by `by` and confirmed by the other side. */
export function agreed(state, options = {}) {
  const by = options.by ?? "home";
  return act(scored(state, options), by === "home" ? "away" : "home", { type: "agree-result" }, options.events ?? RECORDS);
}

/** The side's step done with the defaults the tests need: a D6 of 4 (a D3 of 2 after conceding; a technical win's D3 of 2), the records saved as they are with the first MVP, nothing bought, no deposit, a 6 on the Expensive Mistakes, the captain kept (else the first player). */
export function stepDone(state, side, events = RECORDS, options = {}) {
  const stage = state[side].stage;
  if (stage === 1) {
    const { mode, winner } = state.result;
    const roll = options.roll ?? (mode === "conceded" && winner !== side ? 2 : 4), technicalRoll = options.technicalRoll ?? (mode === "technical" && winner === side ? 2 : "");
    return act(state, side, { type: "fans", roll, technicalRoll, painted: false, stalling: false }, events);
  }
  if (stage === 2) {
    const mvps = options.mvps ?? [state[side].snapshot.players[0].id];
    const saved = act(state, side, { type: "statistics", statistics: state[side].statistics, injuries: state[side].injuries, mvps, departures: options.departures ?? {} }, events);
    return act(saved, side, { type: "lock-players" }, events);
  }
  if (stage === 3) return act(state, side, { type: "lock-roster" }, events);
  if (stage === 4) return act(state, side, { type: "finance", deposit: options.deposit ?? 0, mistake: options.mistake ?? { roll: 6 } }, events);
  if (stage === 5) return act(state, side, { type: "next", captain: options.captain ?? (state[side].baseRoster.players.find((player) => player.isCaptain) ?? state[side].baseRoster.players[0])?.id ?? "" }, events);
  if (stage === 6) return act(state, side, { type: "confirm" }, events);
  throw new Error(`no step to do at stage ${stage}`);
}

/**
 * Both sides brought to `stages` (`{home, away}`, each a stage 1…6, or 7 for confirmed), from a score agreed: the
 * Players steps first, as the Treasury waits for the opponent's.
 */
export function reach(state, stages, { events = RECORDS, ...options } = {}) {
  let next = state;
  const want = (side) => stages[side] ?? 1;
  const at = (side) => next[side].stage + (next[side].confirmed ? 1 : 0);
  for (const limit of [3, 7]) {
    for (const side of ["home", "away"]) {
      while (at(side) < Math.min(want(side), limit)) next = stepDone(next, side, events, options[side] ?? {});
    }
  }
  return next;
}

/** The payload `GET …/post-match` sends. */
export const payloadOf = (state, over = {}) => ({ postMatch: state, viewerSide: "home", isAdmin: false, rosterChanged: { home: false, away: false }, fixture: FIXTURE, ...over });

/** What the post-match says to `side` (home by default) on `step`. */
export const modelOf = (state, step = "", ui = {}, over = {}) => postModel(payloadOf(state, over), over.viewerSide ?? "home", step, { data, userId: `u-${over.viewerSide ?? "home"}`, ...ui });
