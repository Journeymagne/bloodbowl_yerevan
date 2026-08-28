/**
 * How a league result becomes points, and points become a table.
 *
 * The arithmetic of the season, with nothing in it that touches the database or
 * a request — which is why it can be read, and one day tested, on its own. It
 * was buried among the queries in server.mjs; step 4.9 pulled it out so the
 * season routes could move.
 *
 * Task 14.3 goes further and moves the scoring *rules* into
 * src/domain/league-rules.mjs, where the browser reads them too. Until then
 * this is the only place they are written down.
 */
import crypto from "node:crypto";

import { httpError } from "../http/responses.mjs";
import { publicSeasonEntry } from "../api/serializers.mjs";

export function nullableInteger(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw httpError(400, `${fieldName} must be a non-negative integer.`);
  }
  return number;
}

export function scoreLeagueResult({
  homeTouchdowns,
  awayTouchdowns,
  homeCasualties,
  awayCasualties,
  hasHome = true,
  hasAway = true,
}) {
  if (!hasHome && !hasAway) {
    return { homePoints: null, awayPoints: null, homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null };
  }

  if (homeTouchdowns === null || awayTouchdowns === null || homeTouchdowns === undefined || awayTouchdowns === undefined) {
    return { homePoints: null, awayPoints: null, homeTouchdowns: homeTouchdowns ?? null, awayTouchdowns: awayTouchdowns ?? null, homeCasualties: homeCasualties ?? null, awayCasualties: awayCasualties ?? null };
  }

  let homePoints = homeTouchdowns > awayTouchdowns ? 3 : homeTouchdowns === awayTouchdowns ? 1 : 0;
  let awayPoints = awayTouchdowns > homeTouchdowns ? 3 : homeTouchdowns === awayTouchdowns ? 1 : 0;
  const touchdownGap = Math.abs(homeTouchdowns - awayTouchdowns);

  if (touchdownGap >= 3) {
    if (homeTouchdowns > awayTouchdowns) homePoints += 1;
    if (awayTouchdowns > homeTouchdowns) awayPoints += 1;
  }

  if (homeTouchdowns > 0 && awayTouchdowns === 0) homePoints += 1;
  if (awayTouchdowns > 0 && homeTouchdowns === 0) awayPoints += 1;
  if (homeCasualties >= 4) homePoints += 1;
  if (awayCasualties >= 4) awayPoints += 1;
  return { homePoints, awayPoints, homeTouchdowns, awayTouchdowns, homeCasualties, awayCasualties };
}

export function computeSeasonStandings(entryRows, pairingRows, { includeContacts = true } = {}) {
  const numericResult = (value) => Number(value ?? 0) || 0;
  const standings = new Map(entryRows.map((row) => {
    const entry = publicSeasonEntry(row, { includeContacts });
    return [row.id, {
      entryId: row.id,
      user: entry.user,
      team: entry.team,
      points: 0,
      games: 0,
      byes: 0,
      touchdowns: 0,
      casualties: 0,
      opponents: [],
    }];
  }));

  for (const pairing of pairingRows) {
    if (!["started", "completed"].includes(pairing.round_status)) continue;
    if (!pairing.home_entry_id && !pairing.away_entry_id) continue;

    const home = standings.get(pairing.home_entry_id);
    const away = standings.get(pairing.away_entry_id);

    if (home && !away) {
      if (pairing.home_points == null) continue;
      home.games += 1;
      home.byes += 1;
      home.points += Number(pairing.home_points);
      home.touchdowns += numericResult(pairing.home_touchdowns);
      home.casualties += numericResult(pairing.home_casualties);
      continue;
    }

    if (away && !home) {
      if (pairing.away_points == null) continue;
      away.games += 1;
      away.byes += 1;
      away.points += Number(pairing.away_points);
      away.touchdowns += numericResult(pairing.away_touchdowns);
      away.casualties += numericResult(pairing.away_casualties);
      continue;
    }

    if (!home || !away) continue;
    home.opponents.push(pairing.away_entry_id);
    away.opponents.push(pairing.home_entry_id);

    if (pairing.home_points == null || pairing.away_points == null) {
      continue;
    }

    home.games += 1;
    away.games += 1;
    home.points += Number(pairing.home_points);
    away.points += Number(pairing.away_points);
    home.touchdowns += numericResult(pairing.home_touchdowns);
    away.touchdowns += numericResult(pairing.away_touchdowns);
    home.casualties += numericResult(pairing.home_casualties);
    away.casualties += numericResult(pairing.away_casualties);
  }

  return [...standings.values()]
    .sort((a, b) => b.points - a.points
      || b.touchdowns - a.touchdowns
      || b.casualties - a.casualties
      || b.games - a.games
      || a.user.login.localeCompare(b.user.login, "en")
      || a.team.name.localeCompare(b.team.name, "en"))
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}

export function previousOpponentMap(entryRows, pairingRows) {
  const opponents = new Map(entryRows.map((entry) => [entry.id, new Set()]));
  const byes = new Set();
  for (const pairing of pairingRows) {
    if (!["started", "completed"].includes(pairing.round_status)) continue;
    if (!pairing.home_entry_id && !pairing.away_entry_id) continue;
    if (!pairing.away_entry_id) {
      if (pairing.home_entry_id) byes.add(pairing.home_entry_id);
      continue;
    }
    if (!pairing.home_entry_id) {
      byes.add(pairing.away_entry_id);
      continue;
    }
    opponents.get(pairing.home_entry_id)?.add(pairing.away_entry_id);
    opponents.get(pairing.away_entry_id)?.add(pairing.home_entry_id);
  }
  return { opponents, byes };
}

export function assertNoDraftRound(roundRows) {
  const draft = roundRows.find((round) => round.status === "draft");
  if (draft) {
    throw httpError(409, `Round ${draft.round_number} is still a draft. Start or delete it before creating another round.`);
  }
}

export function assertCurrentRoundComplete(pairingRows) {
  const latestRound = Math.max(0, ...pairingRows
    .filter((pairing) => pairing.round_status === "started")
    .map((pairing) => Number(pairing.round_number)));
  if (!latestRound) return;
  const unfinished = pairingRows.some((pairing) => pairing.round_number === latestRound
    && pairing.round_status === "started"
    && pairing.home_entry_id
    && pairing.away_entry_id
    && (pairing.home_points === null || pairing.away_points === null));
  if (unfinished) {
    throw httpError(409, `Round ${latestRound} has unfinished pairings.`);
  }
}

export function shuffleEntries(entries) {
  const shuffled = [...entries];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
