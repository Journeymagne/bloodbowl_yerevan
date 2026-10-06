import { normalizeDraft } from "../roster/schema.mjs";
import { selectedRosterPlayers, skillNamesForPlayer } from "../roster/players.mjs";
import { playerCurrentCost, playerAdjustmentCost } from "../roster/costs.mjs";
import { teamHasSpecialRule } from "../roster/team-rules.mjs";
import { builderStaffCosts, medicalStaffDefinitions } from "../league-rules.mjs";
import { costToNumber, rowsForTeam, rosterMax, statValueForDisplayByStat, PLAYER_STATS } from "../roster/values.mjs";
import { MATCH_RULES, matchError } from "./rules.mjs";

export function isLineman(row) {
  return (row.tags || []).some(tag => /^line(?:man|men|woman|women)$/i.test(tag)) || /\bline(?:man|men|woman|women)\b/i.test(row.position);
}

export function journeymanPositions(reference) {
  return rowsForTeam(reference).map((row, rowIndex) => ({ ...row, rowIndex }))
    .filter(isLineman);
}

export function playerProfile(player) {
  return { ...player, stats: Object.fromEntries(PLAYER_STATS.map(stat => [stat,
    statValueForDisplayByStat(stat, player.row[stat], player.statMods?.[stat] || 0)])),
  skills: skillNamesForPlayer(player.row, player), value: playerCurrentCost(player.row, player) };
}

export function createMatchSide(source, data) {
  const reference = data.teams.find(team => team.slug === source.team.baseTeamSlug);
  if (!reference) throw matchError("UNKNOWN_TEAM", { slug: source.team.baseTeamSlug });
  const roster = normalizeDraft(source.team.roster);
  return { user: source.user, team: source.team, reference, roster,
    players: selectedRosterPlayers(reference, roster).map(playerProfile),
    journeymen: [], fansRoll: null, rosterLocked: false, basket: {}, basketLocked: false,
    effects: {}, confirmed: false };
}

export function addJourneyman(side, rowIndex) {
  const row = journeymanPositions(side.reference).find(item => item.rowIndex === Number(rowIndex));
  const available = side.players.filter(player => !player.skipNextGame).length;
  if (!row || available + side.journeymen.length >= MATCH_RULES.journeymanTarget) throw matchError("MATCH_JOURNEYMEN");
  const maximum = rosterMax(row.qty);
  if ([...side.players.filter(player => !player.skipNextGame), ...side.journeymen].filter(player => player.rowIndex === row.rowIndex).length >= maximum) {
    throw matchError("MATCH_POSITION_LIMIT", { position: row.position, maximum });
  }
  const used = new Set([...side.players, ...side.journeymen].map(player => String(player.number)));
  let number = 1;
  while (used.has(String(number))) number++;
  const player = { id: `journeyman-${number}`, number: String(number), name: row.position,
    rowIndex: row.rowIndex, row, statMods: {}, extraSkills: [], temporary: true, kind: "journeyman" };
  return { ...playerProfile(player), skills: [...row.skills, "Loner (4+)"] };
}

export function calculateMatchCtv(side) {
  const lowCost = teamHasSpecialRule(side.reference, "Low Cost Linemen");
  const players = [...side.players.filter(player => !player.skipNextGame), ...side.journeymen];
  const playersValue = players.reduce((sum, player) => sum + (lowCost && isLineman(player.row)
    ? playerAdjustmentCost(player.row, player) : playerCurrentCost(player.row, player)), 0);
  const draft = side.roster;
  const rerolls = (Number(draft.startingRerolls) + Number(draft.teamRerolls)) * costToNumber(side.reference.team.meta.rerolls);
  const medical = medicalStaffDefinitions.reduce((sum, staff) => sum + Number(draft[staff.key] || 0) * builderStaffCosts[staff.key], 0);
  const bribes = Number(draft.bribes) * 50;
  return { players: players.length, playersValue, rerolls, medical, bribes,
    total: playersValue + rerolls + medical + bribes, lowCost };
}

export function validateMatchPositions(side) {
  const available = [...side.players.filter(player => !player.skipNextGame), ...side.journeymen];
  rowsForTeam(side.reference).forEach((row, index) => {
    const maximum = rosterMax(row.qty);
    if (available.filter(player => player.rowIndex === index).length > maximum) throw matchError("MATCH_POSITION_LIMIT", { position: row.position, maximum });
  });
}
