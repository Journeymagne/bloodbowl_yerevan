/** Gata's match-only policies. Money is represented in whole thousands (k). */
export const MATCH_RULES = Object.freeze({
  id: "gata-sevens", version: 2, journeymanTarget: 7, rosterMaximum: 14,
  lowerTreasuryMaximum: 50, megaStarSlots: 2,
  // Explicit format policy, independent of tier and individual player traits.
  stuntyTeams: ["goblin", "halfling", "snotling", "ogre", "gnome", "nurglings"],
});

export const MATCH_STEPS = ["fans", "weather", "roster", "inducements", "review"];
export const SIDES = ["home", "away"];
export const CONFIRM_ACTION = "con" + "firm";
export const otherSide = (side) => side === "home" ? "away" : "home";
export const teamKey = (team) => String(team.slug || team.baseTeamSlug || "").replace(/^teams\//, "");

export function teamTier(team) {
  const tier = String(team.team?.meta?.league || "").match(/(?:tier\s*|^)([123])/i);
  return tier ? Number(tier[1]) : 1;
}

export function tierAllowance(team, opponent) {
  const ours = teamTier(team), theirs = teamTier(opponent);
  if (ours === 2 && theirs === 1) return 200;
  if (ours === 3 && theirs === 1) return 300;
  return ours === 3 && theirs === 2 ? 100 : 0;
}

export function matchError(code, params = {}) {
  const error = new Error(code);
  error.code = code; error.params = params; error.status = 409;
  return error;
}

export function dieValue(value, maximum) {
  if (value === null || value === "" || value === undefined) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) throw matchError("MATCH_DICE", { maximum });
  return number;
}
