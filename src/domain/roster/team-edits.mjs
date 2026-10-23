/**
 * What a coach may change of a team on the team page (stage 07d; what only the 2.x editor could do): its league and
 * its god from the race's own, its Dedicated Fans put right, its players put in number order, and what the roster
 * breaks of the rules. Never its race: a coach does not change a team's race (owner, 2026-10-20). Each is a copy of the
 * draft the way the server stores it; the name and the logo are the request's, not the draft's.
 *
 * A change is refused with one of `TEAM_EDIT_REFUSALS` as `{code, params}`; the draft handed over is never changed.
 */
import { builderStaffMaximums } from "../league-rules.mjs";
import { calculateRosterCosts } from "./costs.mjs";
import { normalizePlayerExtraSkills, normalizePlayerFavouredSkills, syncRosterCountsFromPlayers } from "./players.mjs";
import { favouredSkillsForChoice, ruleLookupKey, teamFavouredOptions, teamLeagueOptions } from "./team-rules.mjs";
import { validateRoster } from "./validate.mjs";
import { rowsForTeam } from "./values.mjs";

/** Every code a change of the team's settings is refused with; the screen words each as `teamSettings.refusal.<code>`. */
export const TEAM_EDIT_REFUSALS = Object.freeze([
  "TEAM_NAME_EMPTY", "LEAGUE_UNKNOWN", "FAVOURED_UNKNOWN", "FANS_RANGE",
]);

const refusal = (code, params = {}) => ({ code, params });
/** The option of the race's list that `value` names, by its rule key (`ruleLookupKey`), as the list writes it; or undefined. */
const optionOf = (options, value) => options.find((option) => ruleLookupKey(option) === ruleLookupKey(value ?? ""));
const playersOf = (draft) => (Array.isArray(draft.players) ? draft.players : []);

/** Why the team cannot be called this, or null: a name that is nothing once the blanks at its ends are gone. */
export function teamNameRefusal(name) {
  return String(name ?? "").trim() ? null : refusal("TEAM_NAME_EMPTY");
}

/**
 * The draft with `league` as the team's league: one of the race's own (`teamLeagueOptions`).
 * @param {object} race @param {object} draft @param {string} league
 * @returns {{draft: object}|{code: "LEAGUE_UNKNOWN", params: {}}}
 */
export function withLeague(race, draft, league) {
  const option = optionOf(teamLeagueOptions(race), league);
  if (!option) return refusal("LEAGUE_UNKNOWN");
  return { draft: { ...structuredClone(draft), selectedLeague: option } };
}

/**
 * The draft with `alignment` as the team's god, one of the race's own (`teamFavouredOptions`), and every player's
 * favoured skills put right the way the 2.x editor put them right (`sanitizeFavouredSkillsForTeam`): only what the god
 * grants, and none the player has otherwise. `dropped` names, in the order of the roster, each favoured skill a player
 * loses — one the god does not grant; a favoured copy of a skill the player has by an advancement comes off unnamed,
 * since the player keeps the skill.
 * @param {object} race @param {object} draft @param {string} alignment
 * @returns {{draft: object, dropped: {playerId: string, name: string, skill: string}[]}|{code: "FAVOURED_UNKNOWN", params: {}}}
 */
export function withFavoured(race, draft, alignment) {
  const option = optionOf(teamFavouredOptions(race), alignment);
  if (!option) return refusal("FAVOURED_UNKNOWN");
  const next = { ...structuredClone(draft), favouredChoice: option };
  const granted = new Set(favouredSkillsForChoice(option));
  const rows = rowsForTeam(race);
  const dropped = [];
  for (const player of playersOf(next)) {
    const row = rows[player?.rowIndex];
    if (!row) continue;
    const regular = new Set([...(row.skills ?? []), ...normalizePlayerExtraSkills(row, player.extraSkills ?? []).map(({ name }) => name)]);
    const held = normalizePlayerFavouredSkills(row, player.favouredSkills ?? []).filter(({ name }) => !regular.has(name));
    player.favouredSkills = held.filter(({ name }) => granted.has(name));
    for (const { name } of held.filter((skill) => !granted.has(skill.name))) {
      dropped.push({ playerId: String(player.id ?? ""), name: String(player.name ?? ""), skill: name });
    }
  }
  return { draft: next, dropped };
}

/**
 * The draft with `fans` Dedicated Fans: a whole number from 0 to the builder's maximum (6). A correction of a mistake
 * (the owner's ruling): the treasury and the purchased staff stay as they are.
 * @param {object} draft @param {number} fans
 * @returns {{draft: object}|{code: "FANS_RANGE", params: {max: number}}}
 */
export function withFans(draft, fans) {
  const max = builderStaffMaximums.dedicatedFans;
  if (!Number.isInteger(fans) || fans < 0 || fans > max) return refusal("FANS_RANGE", { max });
  return { draft: { ...structuredClone(draft), dedicatedFans: fans } };
}

/** A player's number as a number, or null where it is none: blank, or not a number at all. */
function shirtNumber(player) {
  const text = String(player?.number ?? "").trim();
  return text && Number.isFinite(Number(text)) ? Number(text) : null;
}

/**
 * The draft with its players in the order of their numbers (the owner's ruling: in place of the 2.x editor's drag):
 * 1, 2, 10; a player whose number is no number after them; players of the same number, and those of none, in the
 * order they had. `moved` is whether any player changed place.
 * @param {object} draft @returns {{draft: object, moved: boolean}}
 */
export function byNumber(draft) {
  const next = structuredClone(draft);
  const ranked = playersOf(next).map((player, at) => ({ player, at, number: shirtNumber(player) }))
    .sort((a, b) => Number(a.number === null) - Number(b.number === null) || (a.number ?? 0) - (b.number ?? 0));
  const moved = ranked.some(({ at }, place) => at !== place);
  if (moved) next.players = ranked.map(({ player }) => player);
  return { draft: next, moved };
}

/**
 * What the roster breaks of the rules, as the 2.x editor listed it (`validateRoster` on `calculateRosterCosts`), with
 * the positions counted from the players, as the server counts them, not from a count the draft carries.
 * @param {object} race @param {object} draft @returns {{code: string, params: object}[]}
 */
export function rosterViolations(race, draft) {
  const counted = { ...draft };
  syncRosterCountsFromPlayers(counted);
  return validateRoster(race, counted, calculateRosterCosts(race, counted));
}
