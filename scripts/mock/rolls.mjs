/**
 * The mock API's dice: the roll of a player's advancement step, and the team's rolls (server/routes/team-rolls.mjs and
 * server/api/dice-rolls.mjs are the reference; the rolls themselves are src/domain/roster/dice.mjs's, on the mock's die).
 *
 *   GET  /api/teams/:id/rolls      `{rolls}`, in the order they were rolled, each as `publicRoll` sends it, the rolls
 *                                  of players who have left the roster included. A roll is used (`usedAt`) while an
 *                                  advancement of the saved roster names it (`roll: {id, via: "site"}`) for its player,
 *                                  and waits (`usedAt: null`) otherwise: a save that undoes the advancement gives it back.
 *   POST /api/teams/:id/players/:pid/rolls  `{purpose, category?}`, checked in the server's order: the team (404
 *                                  TEAM_NOT_FOUND), the body (400 FIELD_INVALID `purpose`, or `category` for a random
 *                                  skill), the player (404 PLAYER_NOT_FOUND). Then the player's earliest waiting roll:
 *                                  asked for its purpose, it is the answer, whatever category is asked (a random skill
 *                                  the player holds since comes back `stale: true`); asked for the other, 409
 *                                  DICE_ROLL_WAITING `{purpose}` (`errorPayload`). Else a new roll, 200 `{roll}`, on the
 *                                  mock's die: a characteristic's D8 shows 6 (`{roll: 6, stats: ["ag", "ma"]}`); a random
 *                                  skill's D16 shows 16, then the first face of the category's column (public/data.en.json)
 *                                  whose skill the player does not hold. Every column but General is shorter than 16, so
 *                                  its roll is a blank face and then that skill; General's 16th face is Thick Skull,
 *                                  which ends the roll there unless the player holds it. A category that is not one of
 *                                  the position's primaries is 422 DICE_CATEGORY, a column with nothing left 422
 *                                  DICE_NO_SKILL (`randomSkillRoll` says which).
 *
 * What it does not do: ids are not UUIDs, an id two players share is not refused (DUPLICATE_PLAYER_ID), anybody may
 * roll, and a save of the roster (scripts/mock/treasury.mjs) does not settle the rolls it names: a roll that does not
 * fit the advancement, or one taken out of turn (DICE_ROLL_MISMATCH, DICE_ROLL_USED), is kept as sent.
 *
 * Fixtures: Mock Team (t1) has two rolls. mock-roll-p3 is used: Blitzer Three's random Agility skill, a blank 15 and
 * then Dodge, which his advancement names (scripts/mock-api.mjs). mock-roll-p5 waits: Linewoman Five's characteristic,
 * the D8's 6, so she is asked to take it before any random skill. Every other team has none.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expandCollections } from "../../src/data/reference.mjs";
import { DICE_PURPOSES, SKILL_DIE, randomSkillRoll, rollRefusal, siteRollReferences, statRoll } from "../../src/domain/roster/dice.mjs";
import { canonicalSkillName, heldSkillKeys, normalizeDraftPlayers } from "../../src/domain/roster/players.mjs";
import { rowsForTeam } from "../../src/domain/roster/values.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DAY = 86_400_000;
const LIST = /^\/api\/teams\/([^/]+)\/rolls$/;
const ASK = /^\/api\/teams\/([^/]+)\/players\/([^/]+)\/rolls$/;
// What the mock's D8 always shows: a characteristic of two, Agility or Movement Allowance.
const STAT_FACE = 6;

let reference = null;
/**
 * The built data, read once at the first roll asked or read: the races' positions and the Skill Table. A read that
 * failed is not kept: the next ask reads again (the mock answers the failure as a 500, mock-api.mjs).
 */
const referenceData = () => (reference ??= fs.readFile(path.join(rootDir, "public", "data.en.json"), "utf8")
  .then((text) => expandCollections(JSON.parse(text)))
  .catch((error) => {
    reference = null;
    throw error;
  }));

/** A die that shows `faces` in turn, and the last of them from then on. */
function dieOf(faces) {
  let thrown = 0;
  return () => faces[Math.min(thrown++, faces.length - 1)];
}

/** A roll as the mock keeps it: the fields of the server's `publicRoll`, `stale` aside. */
const rollOf = (id, playerId, purpose, rolled, createdAt, usedAt = null) => ({
  id, playerId, purpose, params: rolled.params, result: rolled.result, usedAt, createdAt,
});

/** The player of a team's roster, as the server reads him (`normalizeDraftPlayers`), with his position; null for none. */
function rosterPlayer(data, found, playerId) {
  const race = data.teams.find((item) => item.slug === found.baseTeamSlug) ?? null;
  const player = race && normalizeDraftPlayers(race, found.roster ?? {}).find((item) => item.id === playerId);
  return player ? { player, row: rowsForTeam(race)[player.rowIndex] } : null;
}

/** Each team's rolls, oldest first: what `GET …/rolls` lists. */
const rolls = new Map();
let lastRoll = 0;
let seeded = null;

/**
 * t1's two rolls, if the mock has t1: Blitzer Three's random skill made as he was before his advancement took it (no
 * Dodge yet), used, and Linewoman Five's characteristic, waiting.
 */
async function seed(teams) {
  const data = await referenceData();
  const found = teams.find((item) => item.id === "t1");
  const blitzer = found && rosterPlayer(data, found, "p3");
  if (!blitzer || !rosterPlayer(data, found, "p5")) return;
  const before = { ...blitzer.player, extraSkills: [], advancements: [] };
  const skill = randomSkillRoll({ row: blitzer.row, player: before, category: "Agility", skillGroups: data.skillGroups, rng: dieOf([15, 4]) });
  // The data the seed is made from changed under it (a Blitzer with no Agility, a column without a free skill): said, not a roll with no params.
  if (!skill.ok) throw new Error(`mock rolls: the seed's random skill for p3 is refused (${skill.reason})`);
  const at = (days) => new Date(Date.now() - days * DAY).toISOString();
  rolls.set("t1", [
    rollOf("mock-roll-p3", "p3", "random_skill", { params: { ...skill.params, captain: false }, result: skill.result }, at(9), at(9)),
    rollOf("mock-roll-p5", "p5", "stat", statRoll(dieOf([STAT_FACE])), at(1)),
  ]);
}

/**
 * The team's rolls, each used or waiting as the saved roster says now: used while an advancement of its player names
 * it — since the first time the mock saw so, or the seed's day — and waiting otherwise.
 */
function settled(found) {
  const named = new Set(siteRollReferences(found.roster).map(({ id, playerId }) => JSON.stringify([playerId, id])));
  const listed = rolls.get(found.id) ?? rolls.set(found.id, []).get(found.id);
  for (const roll of listed) {
    roll.usedAt = named.has(JSON.stringify([roll.playerId, roll.id])) ? roll.usedAt ?? new Date().toISOString() : null;
  }
  return listed;
}

/** What a body asks for, as `checkRoll` (server/routes/team-rolls.mjs) reads it: the field that is wrong, or the ask. */
function checkAsk(body) {
  const { purpose, category } = body ?? {};
  if (!DICE_PURPOSES.includes(purpose)) return { field: "purpose" };
  if (purpose === "random_skill" && (typeof category !== "string" || category === "")) return { field: "category" };
  return { ask: { purpose, category } };
}

/** A new roll of the mock's die for the player (see the header), or the refusal of `randomSkillRoll`. */
function rollNew(data, { player, row }, { purpose, category }) {
  if (purpose === "stat") return statRoll(dieOf([STAT_FACE]));
  const held = heldSkillKeys(row, player);
  const column = data.skillGroups.find((group) => group.category === category)?.skills ?? [];
  const free = column.findIndex((skill) => !held.has(canonicalSkillName(skill))) + 1;
  const rolled = randomSkillRoll({ row, player, category, skillGroups: data.skillGroups, rng: dieOf([SKILL_DIE, free]) });
  return rolled.ok ? { ...rolled, params: { ...rolled.params, captain: player.isCaptain } } : rolled;
}

/** `POST …/rolls`: the player's earliest waiting roll, of the purpose asked or refused for the other, else a new one. */
async function rollFor(found, playerId, body, { reply, refuse }) {
  const { field, ask } = checkAsk(body);
  if (field) return refuse(400, "FIELD_INVALID", { field });
  const data = await referenceData();
  const own = rosterPlayer(data, found, playerId);
  if (!own) return refuse(404, "PLAYER_NOT_FOUND");
  const listed = settled(found);
  const earliest = listed.find((roll) => roll.playerId === playerId && roll.usedAt === null);
  if (earliest && earliest.purpose !== ask.purpose) return refuse(409, "DICE_ROLL_WAITING", { purpose: earliest.purpose });
  if (earliest) return reply({ roll: rollRefusal(earliest, own.row, own.player)?.code === "ROLL_STALE" ? { ...earliest, stale: true } : earliest });
  const rolled = rollNew(data, own, ask);
  if (!rolled.ok) return refuse(422, rolled.reason);
  const roll = rollOf(`mock-roll-${++lastRoll}`, playerId, ask.purpose, rolled, new Date().toISOString());
  listed.push(roll);
  return reply({ roll });
}

/**
 * @param {object} request the HTTP request
 * @param {string} pathname
 * @param {{teams: object[], readBody: Function, reply: Function, refuse: Function}} mock the mock's list of teams and
 *   its helpers (mock-api.mjs)
 * @returns {Promise<{status: number, payload: object}|null>} null for a route that is not this module's
 */
export async function answerRolls(request, pathname, mock) {
  const { teams, readBody, reply, refuse } = mock;
  const { method } = request;
  const listing = method === "GET" ? LIST.exec(pathname) : null;
  const asking = method === "POST" ? ASK.exec(pathname) : null;
  const [, id, playerId] = listing ?? asking ?? [];
  if (!id) return null;
  // A seed whose data read failed is not kept either: the next ask seeds again.
  seeded ??= seed(teams).catch((error) => {
    seeded = null;
    throw error;
  });
  await seeded;
  const found = teams.find((item) => item.id === id);
  if (!found) return refuse(404, "TEAM_NOT_FOUND");
  if (listing) return reply({ rolls: settled(found) });
  return rollFor(found, playerId, await readBody(request), mock);
}
