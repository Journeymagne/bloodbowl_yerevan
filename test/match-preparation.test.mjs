import test from "node:test";
import assert from "node:assert/strict";
import { createPreparation, applyPreparationAction, resetChangedRosters, preparationStep, upgradePreparation } from "../src/domain/match/preparation.mjs";
import { calculateMatchCtv, journeymanPositions, isLineman } from "../src/domain/match/roster.mjs";
import { readFileSync } from "node:fs";
import { expandCollections } from "../src/data/reference.mjs";
import { matchBudget, validateBasket } from "../src/domain/match/budget.mjs";
import { matchCatalog, starAvailable, catalogAccess } from "../src/domain/match/catalog.mjs";
import { createMatchSnapshots, matchPlayers } from "../src/domain/match/snapshot.mjs";
import { weatherResult } from "../src/domain/match/weather.mjs";

function fixtures(specialRules = "Old World Classic") {
  const row = { qty: "0-16", position: "Human Lineman", tags: ["Lineman"], price: "50K", skills: [], primary: ["G"], ma: "6", st: "3", ag: "3+", pa: "4+", ar: "9+" };
  const reference = { slug: "teams/human", title: "Human", team: { roster: [row], meta: { rerolls: "60K", league: "Tier 1", specialRules, apothecaryAccess: ["apothecary"] } } };
  const data = { teams: [reference], starPlayers: [], inducements: [], pages: [], skillGroups: [{ category: "General", skills: ["Block"] }] };
  const team = (name, price) => ({ user: { id: name, login: name }, team: { id: name, name, revision: 1, baseTeamSlug: reference.slug,
    roster: { players: Array.from({ length: 7 }, (_, i) => ({ id: `${name}-${i}`, rowIndex: 0, number: String(i + 1), name: `Player ${i + 1}` })),
      treasury: 120, dedicatedFans: 2, startingRerolls: price ? 2 : 1, selectedLeague: "Old World Classic" } } });
  const sources = { home: team("home", false), away: team("away", true) };
  return { data, sources, preparation: createPreparation(sources, data) };
}

function readyRosters(preparation) {
  preparation.home.fansRoll = 2; preparation.away.fansRoll = 1;
  preparation.weather = { season: "Autumn", home: 3, away: 4 };
  preparation.home.rosterLocked = true; preparation.away.rosterLocked = true;
  return preparation;
}

test("CTV excludes unavailable players, assistants and money; seasonal rerolls retain ordinary value", () => {
  const { preparation } = fixtures();
  const side = preparation.home;
  side.players[0].skipNextGame = true;
  Object.assign(side.roster, { assistantCoaches: 5, cheerleaders: 5, treasury: 999, coachesSafe: 400, teamRerolls: 1 });
  assert.equal(calculateMatchCtv(side).total, 300 + 120);
});

test("Low Cost Linemen excludes hiring fees but retains advancement value", () => {
  const { preparation } = fixtures("Low Cost Linemen");
  preparation.home.players[0].extraSkills = [{ name: "Block", access: "primary" }];
  assert.equal(calculateMatchCtv(preparation.home).total, 20 + 60);
});

test("lower CTV waits for the higher team; compensation includes actual treasury spend", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  assert.equal(matchBudget(preparation, "home", data).canChoose, false);
  preparation.away.basket = { "bloodweiser-keg": 1 }; preparation.away.basketLocked = true;
  const budget = matchBudget(preparation, "home", data);
  assert.equal(budget.canChoose, true); assert.equal(budget.pettyCash, 100); assert.equal(budget.treasuryLimit, 50);
  preparation.home.basket = { "additional-training": 1 };
  assert.equal(matchBudget(preparation, "home", data).treasuryUsed, 0);
});

test("equal CTV prohibits treasury and zero-purchase progression remains possible", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  preparation.away.roster.startingRerolls = 1;
  assert.equal(matchBudget(preparation, "home", data).treasuryLimit, 0);
  preparation.home.basket = { "team-mascot": 1 };
  assert.throws(() => validateBasket(preparation, "home", data), { code: "MATCH_BUDGET" });
});

test("lower contribution is only the shortfall and may not exceed 50k", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation); preparation.away.basketLocked = true;
  preparation.home.basket = { "additional-training": 1 };
  assert.equal(validateBasket(preparation, "home", data).treasuryUsed, 25);
  preparation.home.basket["team-mascot"] = 1;
  assert.equal(validateBasket(preparation, "home", data).treasuryUsed, 50);
  preparation.home.basket["weather-mage"] = 1;
  assert.throws(() => validateBasket(preparation, "home", data), { code: "MATCH_BUDGET" });
});

test("journeymen fill availability with Loner without changing permanent roster or treasury", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  preparation.home.rosterLocked = false; preparation.home.players[0].skipNextGame = true;
  const next = applyPreparationAction(preparation, "home", { type: "add-journeyman", rowIndex: 0 }, data);
  assert.equal(next.home.journeymen.length, 1); assert.equal(next.home.journeymen[0].number, "8");
  assert.ok(next.home.journeymen[0].skills.includes("Loner (4+)")); assert.equal(next.home.roster.treasury, 120);
  assert.equal(next.home.roster.players.length, 7); assert.equal(preparation.home.journeymen.length, 0);
  assert.throws(() => applyPreparationAction(next, "home", { type: "add-journeyman", rowIndex: 0 }, data), { code: "MATCH_JOURNEYMEN" });
});

test("wrong dice, fractional quantities and purchases before roster locks are rejected", () => {
  const { preparation, data } = fixtures();
  assert.throws(() => applyPreparationAction(preparation, "home", { type: "fans", value: 4 }, data), { code: "MATCH_DICE" });
  assert.throws(() => applyPreparationAction(preparation, "home", { type: "basket", id: "bribe", quantity: 1 }, data), { code: "MATCH_WAIT" });
  readyRosters(preparation);
  assert.throws(() => applyPreparationAction(preparation, "away", { type: "basket", id: "bribe", quantity: 0.5 }, data), { code: "MATCH_PURCHASE" });
});

test("purchases enforce team access and discounted bribes share permanent allowance", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  preparation.away.basket = { "rowdy-rookies": 1 };
  assert.throws(() => validateBasket(preparation, "away", data), { code: "MATCH_PURCHASE" });
  preparation.away.reference.team.meta.specialRules = "Bribery and Corruption";
  preparation.away.roster.bribes = 2;
  const item = matchCatalog(preparation.away, data).find(item => item.id === "bribe");
  assert.equal(item.cost, 50); assert.equal(item.limit, 1);
});

test("paired stars use a single purchase with two profiles; child is not purchasable", () => {
  const { preparation, data } = fixtures();
  data.starPlayers = ["grak", "crumbleberry"].map((slug, index) => ({ slug, title: slug, tags: [], body: "| 5 | 3 | 3+ | 4+ | 9+ | 205k | [[Block]] | |", starPlayer: { cost: index ? "" : "205K", availability: "Any Team" } }));
  data.pages = [{ ...data.starPlayers.pop(), kind: "starPlayer" }];
  const stars = matchCatalog(preparation.home, data).filter(item => item.category === "stars");
  assert.equal(stars.length, 1); assert.equal(stars[0].cost, 205); assert.equal(stars[0].spaces, 2); assert.equal(stars[0].slots, 1);
});

test("availability normalizes league aliases and respects Any Team exclusions", () => {
  const { preparation } = fixtures();
  preparation.home.roster.selectedLeague = "Elven Kingdoms League";
  assert.equal(starAvailable({ starPlayer: { availability: "Elven Kingdom League" } }, preparation.home), true);
  preparation.home.roster.selectedLeague = "Sylvanian Spotlight";
  assert.equal(starAvailable({ starPlayer: { availability: "Any Team except Sylvanian Spotlight" } }, preparation.home), false);
});

test("bought prayer needs its targets and cannot target a star", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  preparation.away.basket = { "nuffles-prayers": 1 };
  assert.throws(() => applyPreparationAction(preparation, "away", { type: "lock-basket" }, data), { code: "MATCH_EFFECTS" });
  preparation.away.effects = { prayers: [{ roll: 4, targets: ["star-foo"] }] };
  assert.throws(() => applyPreparationAction(preparation, "away", { type: "lock-basket" }, data), { code: "MATCH_EFFECTS" });
  preparation.away.effects.prayers[0].targets = ["away-0"];
  assert.equal(applyPreparationAction(preparation, "away", { type: "lock-basket" }, data).away.basketLocked, true);
});

test("snapshot needs both confirmations; reopening clears dependent purchases and readiness", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  preparation.home.basketLocked = true; preparation.away.basketLocked = true;
  let next = applyPreparationAction(preparation, "home", { type: "confirm" }, data);
  assert.throws(() => createMatchSnapshots(next, data), { code: "MATCH_WAIT" });
  next = applyPreparationAction(next, "away", { type: "confirm" }, data);
  const snapshots = createMatchSnapshots(next, data);
  assert.equal(snapshots.home.players.length, 7); assert.equal(snapshots.home.fanFactor, 4);
  next = applyPreparationAction(next, "home", { type: "reopen" }, data);
  assert.equal(next.home.confirmed, false); assert.equal(next.away.basketLocked, false);
});

test("changed roster preserves recorded fans/weather but resets dependency chain", () => {
  const { preparation, data, sources } = fixtures(); readyRosters(preparation);
  sources.home.team.revision = 2;
  const next = resetChangedRosters(preparation, sources, data);
  assert.equal(next.home.team.revision, 2); assert.equal(next.home.rosterLocked, false);
  assert.equal(next.home.fansRoll, 2); assert.equal(next.weather.home, 3);
});

test("seasonal weather uses league table instead of standard core table", () => {
  const data = { pages: [{ title: "Weather", body: "## Spring\n| 4-10 | 3-4 | Normal | Calm |\n## Autumn\n| 11 | 5 | Pouring Rain | Slippery |" }] };
  assert.equal(weatherResult(data, { season: "Autumn", home: 6, away: 5 }).name, "Pouring Rain");
});

test("both coaches can approve directly after inducements without selecting kick or receive", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  preparation.home.basketLocked = true; preparation.away.basketLocked = true;
  assert.equal(preparationStep(preparation), 4);
  let next = applyPreparationAction(preparation, "home", { type: "confirm" }, data);
  next = applyPreparationAction(next, "away", { type: "confirm" }, data);
  assert.equal(next.status, "ready");
  assert.equal(Object.hasOwn(createMatchSnapshots(next, data).home, "receiving"), false);
  for (const type of ["rolloff", "receiving"]) assert.throws(() => applyPreparationAction(preparation, "home", { type }, data), { code: "MATCH_ACTION" });
});

test("six available players can finish the checklist and start without mandatory journeymen", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  preparation.home.rosterLocked = false; preparation.home.players[0].skipNextGame = true;
  let next = applyPreparationAction(preparation, "home", { type: "lock-roster" }, data);
  next.away.basketLocked = true;
  next = applyPreparationAction(next, "home", { type: "lock-basket" }, data);
  next = applyPreparationAction(next, "home", { type: "confirm" }, data);
  next = applyPreparationAction(next, "away", { type: "confirm" }, data);
  assert.equal(createMatchSnapshots(next, data).home.players.length, 6);
  assert.equal(next.home.journeymen.length, 0);
});

test("all league Lineman positions are available for journeymen, independent of quantity", () => {
  const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
  for (const reference of data.teams) {
    const eligible = journeymanPositions(reference);
    reference.team.roster.forEach((row, index) => {
      assert.equal(eligible.some(item => item.rowIndex === index), isLineman(row), `${reference.slug}: ${row.position}`);
    });
  }
  assert.ok(journeymanPositions(data.teams.find(team => team.slug === "teams/dwarf")).some(row => row.position === "Dwarf Blocker Lineman"));
});

test("journeymen respect a limited Lineman position and exclude MNG from its count", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  preparation.home.rosterLocked = false; preparation.home.reference.team.roster[0].qty = "0-6";
  preparation.home.players[0].skipNextGame = true; preparation.home.players[1].skipNextGame = true;
  const next = applyPreparationAction(preparation, "home", { type: "add-journeyman", rowIndex: 0 }, data);
  assert.equal(calculateMatchCtv(next.home).players, 6);
  assert.throws(() => applyPreparationAction(next, "home", { type: "add-journeyman", rowIndex: 0 }, data), { code: "MATCH_POSITION_LIMIT" });
});

test("upgrading an existing preparation preserves choices and sealed started match state", () => {
  const { preparation } = fixtures(); readyRosters(preparation);
  preparation.rules = { ...preparation.rules, version: 1 }; preparation.home.basket = { "bloodweiser-keg": 1 };
  preparation.home.confirmed = true; preparation.kickoff = { home: 6, away: 1, receiving: "home" };
  const next = upgradePreparation(preparation);
  assert.equal(next.rules.version, 2); assert.equal(next.revision, preparation.revision + 1);
  assert.equal(next.home.fansRoll, 2); assert.deepEqual(next.home.basket, preparation.home.basket);
  assert.equal(next.home.confirmed, false); assert.equal(Object.hasOwn(next, "kickoff"), false);
  assert.equal(upgradePreparation(next), next);
  preparation.status = "in_progress";
  assert.equal(upgradePreparation(preparation), preparation);
});

test("malformed effects cannot replace the form state", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  assert.throws(() => applyPreparationAction(preparation, "away", { type: "effects", effects: null }, data), { code: "MATCH_EFFECTS" });
});

test("match profiles show temporary own and opposing effects without changing CTV or stored players", () => {
  const { preparation, data } = fixtures();
  preparation.home.basket = { "nuffles-prayers": 1 };
  preparation.home.effects = { prayers: [{ roll: 4, targets: ["home-0"] }] };
  preparation.away.basket = { "nuffles-prayers": 1 };
  preparation.away.effects = { prayers: [{ roll: 7, targets: ["home-0"] }] };
  const ctv = calculateMatchCtv(preparation.home).total;
  const player = matchPlayers(preparation, "home", data)[0];
  assert.equal(player.stats.ar, "10+"); assert.equal(player.stats.ma, "5");
  assert.equal(preparation.home.players[0].stats.ar, "9+");
  assert.equal(calculateMatchCtv(preparation.home).total, ctv);
});

test("available position limits exclude MNG before locking the match roster", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  preparation.home.rosterLocked = false; preparation.home.reference.team.roster[0].qty = "0-6";
  assert.throws(() => applyPreparationAction(preparation, "home", { type: "lock-roster" }, data), { code: "MATCH_POSITION_LIMIT" });
});

test("tier allowance never compensates the opponent, while actual extra spending does", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  preparation.away.reference = structuredClone(preparation.away.reference);
  preparation.away.reference.team.meta.league = "Tier 2";
  preparation.away.basket = { "hired-wizard": 1, "additional-training": 1 }; preparation.away.basketLocked = true;
  assert.equal(matchBudget(preparation, "away", data).bonus, 200);
  assert.equal(matchBudget(preparation, "away", data).treasuryUsed, 35);
  assert.equal(matchBudget(preparation, "home", data).pettyCash, 95);
  preparation.away.roster.startingRerolls = 1;
  assert.equal(matchBudget(preparation, "away", data).treasuryLimit, 0);
  assert.throws(() => validateBasket(preparation, "away", data), { code: "MATCH_BUDGET" });
  preparation.away.basket = { "additional-training": 2 };
  assert.equal(validateBasket(preparation, "away", data).unspent, 30);
});

test("a Mega-Star consumes two choices, with four choices only in the Stunty profile", () => {
  const { preparation, data } = fixtures(); readyRosters(preparation);
  data.starPlayers = ["mega", "ordinary"].map((slug, index) => ({ slug, title: slug, body: "", tags: index ? [] : ["Mega-Star"], starPlayer: { cost: "10K", availability: "Any Team" } }));
  preparation.away.basket = { "star:mega": 1, "star:ordinary": 1 };
  assert.throws(() => validateBasket(preparation, "away", data), { code: "MATCH_STAR_LIMIT" });
  preparation.away.reference = { ...preparation.away.reference, slug: "teams/halfling" };
  assert.equal(validateBasket(preparation, "away", data).chosen, 20);
});

test("Rowdy Rookies ignore the team size limit while keeping unique temporary numbers", () => {
  const { preparation, data } = fixtures("Low Cost Linemen"); readyRosters(preparation);
  preparation.home.players.push(...preparation.home.players.map((player, index) => ({ ...player, id: `extra-${index}`, number: String(index + 8) })));
  preparation.away.basketLocked = true;
  preparation.home.basket = { "rowdy-rookies": 1 };
  preparation.home.effects = { rookies: { first: 3, second: 3, rowIndex: 0 } };
  assert.equal(validateBasket(preparation, "home", data).chosen, 100);
  const players = matchPlayers(preparation, "home", data);
  assert.equal(players.length, 21); assert.equal(new Set(players.map(player => player.number)).size, 21);
  assert.equal(players.filter(player => player.kind === "rookie").length, 7);
  assert.equal(calculateMatchCtv(preparation.home).players, 14);
});

test("missing league metadata cannot grant medical or Favoured-only access", () => {
  const { preparation, data } = fixtures("");
  preparation.home.roster.selectedLeague = "";
  const mortuary = matchCatalog(preparation.home, data).find(item => item.id === "mortuary-assistant");
  assert.equal(catalogAccess(mortuary, preparation.home), false);
  assert.equal(starAvailable({ starPlayer: { availability: "Favoured of Nurgle" } }, preparation.home), false);
  preparation.home.roster.favouredChoice = "Nurgle";
  assert.equal(starAvailable({ starPlayer: { availability: "Favoured of Nurgle" } }, preparation.home), true);
});
