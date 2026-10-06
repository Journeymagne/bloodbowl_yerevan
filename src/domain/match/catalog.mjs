import { canonicalLeagueName, teamHasSpecialRule, teamLeagueOptions } from "../roster/team-rules.mjs";
import { costToNumber } from "../roster/values.mjs";
import { MATCH_RULES, teamKey } from "./rules.mjs";

// Prices and limits follow the dedicated content/Gata/Inducements cards.
const COMMON = [
  ["nuffles-prayers", "Nuffle's Prayers", 15, 3, "prayers"],
  ["assistant-coaches", "Assistant Coaches", 10, 5],
  ["cheerleaders", "Cheerleaders", 10, 5],
  ["team-mascot", "Team Mascot", 25, 1],
  ["weather-mage", "Weather Mage", 20, 1],
  ["bloodweiser-keg", "Bloodweiser Keg", 40, 2],
  ["bribe", "Bribe", 100, 3],
  ["additional-training", "Additional Training", 85, 6],
  ["wandering-apothecary", "Wandering Apothecary", 100, 2, "", "apothecary"],
  ["mortuary-assistant", "Mortuary Assistant", 100, 1, "", "Masters of Undeath"],
  ["plague-doctor", "Plague Doctor", 100, 1, "", "Nurgle"],
  ["rowdy-rookies", "Rowdy Rookies", 100, 1, "rookies", "Low Cost Linemen"],
  ["halfling-master-chef", "Halfling Master Chef", 300, 1],
  ["hired-wizard", "Hired Wizard", 150, 1],
  ["ballistics-expert", "Ballistics Expert", 40, 1],
  ["halfling-surprise-pot", 'Halfling Surprise Pot', 80, 1],
  ["mark-of-chaos", "Mark of Chaos", 50, 1, "mark", "favoured"],
  ["frolicking-nurgling", "Frolicking Nurgling", 15, 3, "", "Nurgle"],
  ["rune-priest", "Rune Priest", 50, 1, "", "dwarfLeague"],
  ["waaagh-drummer", "WAAAGH! Drummer", 50, 1, "", "Badlands Brawl"],
  ["bottles-of-grape-day", "Bottles of Grape Day", 30, 3, "", "stunty"],
  ["vishnevsky-ointment", "Vishnevsky Ointment", 60, 1],
];
const PAIRS = { grak: "crumbleberry", dribl: "drull", "lucian-swift": "valen-swift", "lucien-swift": "valen-swift" };

export function starAvailable(star, side) {
  const access = String(star.starPlayer?.availability || "");
  const league = canonicalLeagueName(side.roster.selectedLeague || teamLeagueOptions(side.reference)[0] || "");
  const canonical = text => canonicalLeagueName(text.replace(/Elven Kingdom League/i, "Elven Kingdoms League"));
  if (/any team/i.test(access)) return !/except/i.test(access) || !access.split(/except/i)[1].split(/[,;]/).some(value => canonical(value.trim()) === league);
  return access.split(/[,;]/).some(value => {
    const requiredLeague = canonical(value.trim());
    return Boolean(requiredLeague && requiredLeague === league)
      || Boolean(/Favoured of/i.test(value) && side.roster.favouredChoice && value.toLowerCase().includes(side.roster.favouredChoice.toLowerCase()));
  });
}

function commonItem(definition, side, data) {
  const [id, title, baseCost, maximum, effect = "", access = ""] = definition;
  const page = data.inducements.find(item => item.title === title);
  const halfling = teamKey(side.reference) === "halfling";
  const bribery = teamHasSpecialRule(side.reference, "Bribery and Corruption");
  let cost = baseCost, limit = maximum;
  if (id === "bribe") { cost = bribery ? 50 : 100; limit = Math.max(0, maximum - Number(side.roster.bribes)); }
  if (halfling && id === "halfling-master-chef") cost = 100;
  if (halfling && id === "ballistics-expert") cost = 30;
  if (halfling && id === "halfling-surprise-pot") cost = 60;
  return { id, title, cost, limit, access, effect, category: "help", slug: page?.slug || `inducements/${id}`, body: page?.body || "", slots: 0, spaces: 0 };
}

export function matchCatalog(side, data) {
  const children = new Set(Object.values(PAIRS));
  // The reference collection omits unpriced pair members; their profiles remain in pages.
  const pages = [...new Map([...data.starPlayers, ...data.pages.filter(page => page.kind === "starPlayer")].map(page => [page.slug, page])).values()];
  const stars = pages.filter(page => !children.has(page.slug) && costToNumber(page.starPlayer?.cost) > 0)
    .map(page => {
      const partner = PAIRS[page.slug] && pages.find(item => item.slug === PAIRS[page.slug]);
      const mega = /mega[- ]?star/i.test([...page.tags, page.body.match(/\|[^\n]+\|/g)?.join(" ") || ""].join(" "));
      return { id: `star:${page.slug}`, title: partner ? `${page.title} & ${partner.title}` : page.title,
        cost: costToNumber(page.starPlayer.cost), limit: 1, category: "stars", slug: page.slug,
        body: page.body, members: partner ? [page, partner] : [page], star: page, mega,
        slots: mega ? MATCH_RULES.megaStarSlots : 1, spaces: partner ? 2 : 1 };
    });
  return [...COMMON.map(item => commonItem(item, side, data)), ...stars];
}

export function catalogAccess(item, side) {
  if (item.category === "stars") return starAvailable(item.star, side);
  const leagues = teamLeagueOptions(side.reference);
  const league = canonicalLeagueName(side.roster.selectedLeague || leagues[0] || "");
  const key = item.access;
  if (!key) return true;
  if (key === "apothecary") return side.reference.team.meta.apothecaryAccess?.includes("apothecary");
  if (key === "stunty") return MATCH_RULES.stuntyTeams.includes(teamKey(side.reference));
  if (key === "favoured") return Boolean(side.roster.favouredChoice);
  if (key === "Nurgle") return side.roster.favouredChoice === "Nurgle" || /Favoured of Nurgle/i.test(side.reference.team.meta.specialRules);
  if (key === "dwarfLeague") return ["Old World Classic", "Worlds Edge Superleague"].includes(league);
  const requiredLeague = canonicalLeagueName(key);
  return Boolean(requiredLeague && league === requiredLeague) || teamHasSpecialRule(side.reference, key);
}
