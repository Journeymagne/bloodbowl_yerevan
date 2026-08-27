/**
 * The roster rules, on the server, from the same modules the browser uses.
 *
 * Until now the API was a hole into the database: whatever JSON a client sent
 * as `roster` was stored. Anyone with a session could `curl` a team of thirty
 * players, or a negative treasury, and the site would render it and the season
 * table would count it. Section 7.4 of the design spec calls this a P0.
 *
 * There is nothing to reimplement — src/domain/roster/* has no DOM in it, which
 * is why task 3 put it there. What the server did lack is the reference data:
 * how many Blitzers an Amazon team may field lives in the content vault, and
 * the built `public/data.en.json` is where that ends up.
 *
 * English is used deliberately: the RU vault is a translation, the rules are
 * the same, and validation returns codes rather than sentences anyway.
 *
 * If that file is missing the server refuses to start rather than skipping
 * validation. Silently accepting anything is how it behaved before, and going
 * back to that quietly is worse than not starting.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { calculateRosterCosts } from "../../src/domain/roster/costs.mjs";
import { ensureDraftPlayers, syncRosterCountsFromPlayers } from "../../src/domain/roster/players.mjs";
import { normalizeDraft } from "../../src/domain/roster/schema.mjs";
import { validateRoster } from "../../src/domain/roster/validate.mjs";

export { normalizeDraft };

/** @type {Map<string, object>|null} slug → the team page, with its roster table */
let teamsBySlug = null;

/**
 * Read the built reference data once. Called at boot, so a missing or malformed
 * file stops the server instead of turning validation off.
 */
export async function loadTeamReference(rootDir) {
  const file = path.join(rootDir, "public", "data.en.json");
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    throw new Error(
      `cannot read ${file}, which the roster rules are built from: ${error.message}. Run \`npm run build\`.`,
      { cause: error },
    );
  }
  const teams = Array.isArray(parsed?.teams) ? parsed.teams : [];
  if (!teams.length) throw new Error(`${file} has no teams in it; the build produced nothing to validate against.`);
  teamsBySlug = new Map(teams.map((team) => [team.slug, team]));
  return teamsBySlug.size;
}

export function teamBySlug(slug) {
  if (!teamsBySlug) throw new Error("team reference data has not been loaded");
  return teamsBySlug.get(String(slug ?? "")) ?? null;
}

/**
 * Check an incoming roster against the league's rules.
 *
 * @param {string} baseTeamSlug the race the team is playing
 * @param {object} roster whatever the client sent
 * @returns {{violations: {code: string, params: object}[], roster: object}}
 *   the violations, and the roster normalised into the stored shape
 */
export function checkRoster(baseTeamSlug, roster) {
  const team = teamBySlug(baseTeamSlug);
  if (!team) {
    return { violations: [{ code: "UNKNOWN_TEAM", params: { slug: String(baseTeamSlug ?? "") } }], roster: normalizeDraft(roster) };
  }
  const draft = normalizeDraft(roster);
  // The counts the rules read are derived from the players, not trusted from
  // the client: sending 7 players and a roster map claiming 11 is the obvious
  // way past a check that believed the map.
  ensureDraftPlayers(team, draft);
  syncRosterCountsFromPlayers(draft);
  const costs = calculateRosterCosts(team, draft);
  return { violations: validateRoster(team, draft, costs), roster: draft };
}

/**
 * Which violations the server refuses a save over.
 *
 * Not all of them, and that is the point. The league editor autosaves on every
 * keystroke, so a coach who deletes a player passes through six players on the
 * way to swapping in another; refusing that save would lose the edit and look
 * like the app eating their work. Being *under* a minimum is a roster in
 * progress, and the editor already says so on screen.
 *
 * Being over a maximum is different: no honest client sends twelve players or
 * three Blitzers where two are allowed, the roster is wrong for everyone who
 * reads it — the season table, the opponent, the public profile — and there is
 * no editing state that legitimately passes through it.
 */
const BLOCKING_CODES = new Set(["ROSTER_MAX_PLAYERS", "POSITION_MAX", "UNKNOWN_TEAM"]);

export function blockingViolations(violations) {
  return violations.filter((violation) => BLOCKING_CODES.has(violation.code));
}
