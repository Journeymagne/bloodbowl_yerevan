import { SIDES, matchError } from "./rules.mjs";
import { calculateMatchCtv } from "./roster.mjs";
import { matchBudget, validateBasket } from "./budget.mjs";
import { validateEffects, rookieProfiles, applyTemporaryEffects } from "./effects.mjs";
import { matchCatalog } from "./catalog.mjs";
import { costToNumber } from "../roster/values.mjs";

export function starProfiles(item) {
  return (item.members || []).map((page, index) => {
    const line = page.body.split("\n").find(row => /^\|\s*\d+\s*\|/.test(row));
    const cells = line?.split("|").slice(1, -1).map(cell => cell.trim()) || [];
    const skills = [...String(cells[6] || "").matchAll(/\[\[([^\]]+)\]\]/g)].map(match => match[1]);
    return { id: `star-${page.slug}`, name: page.title, number: `★${index + 1}`, kind: "star", temporary: true,
      stats: Object.fromEntries(["ma", "st", "ag", "pa", "ar"].map((stat, i) => [stat, cells[i] || "-"])),
      skills, value: costToNumber(page.starPlayer?.cost), slug: page.slug };
  });
}

export function createMatchSnapshots(preparation, data) {
  if (preparation.status !== "ready" || !SIDES.every(side => preparation[side].confirmed)) throw matchError("MATCH_WAIT");
  return Object.fromEntries(SIDES.map(name => {
    const side = preparation[name], catalog = matchCatalog(side, data);
    validateBasket(preparation, name, data); validateEffects(preparation, name, data);
    const purchases = catalog.filter(item => side.basket[item.id]).map(item => ({ ...item, quantity: side.basket[item.id] }));
    return [name, { team: side.team, roster: side.roster, rules: preparation.rules, ctv: calculateMatchCtv(side),
      players: matchPlayers(preparation, name, data),
      purchases, budget: matchBudget(preparation, name, data), effects: side.effects,
      fanFactor: Number(side.roster.dedicatedFans) + side.fansRoll, weather: preparation.weather }];
  }));
}

export function matchPlayers(preparation, sideName, data) {
  const side = preparation[sideName];
  const stars = matchCatalog(side, data).filter(item => item.category === "stars" && side.basket[item.id])
    .flatMap(starProfiles).map((player, index) => ({ ...player, number: `★${index + 1}` }));
  return applyTemporaryEffects([...side.players.filter(player => !player.skipNextGame), ...side.journeymen, ...rookieProfiles(side), ...stars], preparation, sideName, data);
}
