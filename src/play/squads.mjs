export const PRACTICE_TEAMS = [
  { name: "Yerevan Griffins", race: "Human", baseTeamSlug: "teams/human", rerolls: 2 },
  { name: "Red Gorge Clan", race: "Orc", baseTeamSlug: "teams/orc", rerolls: 2 },
];

export const teamInfo = (state, side) => state.teams?.[side] || PRACTICE_TEAMS[side];
export const teamName = (state, side) => teamInfo(state, side).name;
export const automatedSkills = new Set(["Block", "Dodge", "Evasive", "Tackle", "Pass", "Sure Hands", "Catch"]);

export function openingLineup(players) {
  let specialists = 0;
  return players.filter(player => {
    if (!player.available || (player.specialist && specialists >= 4)) return false;
    if (player.specialist) specialists++;
    return true;
  }).slice(0, 7).map(player => player.id);
}

export function squadPlayers(teams) {
  return teams.flatMap((team, side) => {
    const first = team.lineup.map(id => team.players.find(player => player.id === id));
    const rest = team.players.filter(player => !team.lineup.includes(player.id));
    return [...first, ...rest].map((player, slot) => ({
      ...player, sourceId: player.id, id: `${side}:${player.id}`, team: side, slot,
      status: !player.available ? "unavailable" : slot < first.length ? "standing" : "reserve",
      x: -1, y: -1, used: false, moved: 0, acted: false, dodgeUsed: false, stunTurn: -1,
    }));
  });
}
