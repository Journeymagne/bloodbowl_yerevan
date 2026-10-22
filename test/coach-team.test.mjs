import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertContrast, inMedia, tokensOf, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
const replaced = [];
globalThis.location = { hash: "#/coaches/u2/teams/r1", replace(url) { replaced.push(url); } };
const { renderCoachTeam } = await import("../src/screens/coaches/team.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t, initLocale } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const CSS = "src/screens/coaches/team.css";

const COACH = { id: "u2", login: "rival", telegram: "@rival_bb", isAdmin: false, createdAt: "2025-03-01T00:00:00Z" };
const side = (user, id, name, slug) => ({ user: { id: user, login: user }, team: { id, name, baseTeamSlug: slug } });
const OURS = side("u1", "t1", "Ashgrove Wardens", "teams/human");
const THEIRS = side("u2", "r1", "Karak Hold Hammers", "teams/dwarf");

/** A Dwarf (rows: 0 Blocker Lineman, 1 Runner, 2 Blitzer). Brakk took Wrestle with a roll on the site (pre-flight L7). */
const player = (id, rowIndex, number, name, over = {}) => ({ id, rowIndex, number, name, spp: {}, advancements: [], extraSkills: [], ...over });
const PLAYERS = [
  player("d1", 0, "1", "Kor", { isCaptain: true, spp: { touchdowns: 1 } }),
  player("d2", 0, "2", "Dunn", { skipNextGame: true, absence: { code: "miss" } }),
  player("d3", 2, "3", "Brakk", { spp: { touchdowns: 2, casualties: 1 }, extraSkills: [{ name: "Wrestle", access: "primary" }],
    advancements: [{ type: "random", grants: { skill: "Wrestle" }, roll: { id: "x1", via: "site" } }] }),
];
const RIVAL = { id: "r1", name: "Karak Hold Hammers", baseTeamSlug: "teams/dwarf", revision: 3, roster: { treasury: 40, players: PLAYERS } };
const ROLLS = [{ id: "x1", playerId: "d3", purpose: "random_skill", result: { dice: [{ skill: "Wrestle" }, { skill: "Fend" }] } }];

const standing = (id, user, rank, points, team = { id, name: id, baseTeamSlug: "teams/orc" }) => ({ entryId: `e-${id}`, withdrawnAt: null, user: { id: user, login: user }, team, rank, points, games: 2 });
const SEASON = {
  season: { id: "s1", name: "Mock Season", currentRound: 3 },
  standings: [standing("x1", "u9", 1, 6), standing("r1", "u2", 2, 4, THEIRS.team), standing("t1", "u1", 3, 3, OURS.team)],
  rounds: [{ roundNumber: 1, status: "completed", pairings: [{ id: "p1", tableNumber: 1, homeEntryId: "e-r1", awayEntryId: "e-t1", homeTouchdowns: 1, awayTouchdowns: 2,
    homeCasualties: 0, awayCasualties: 1, homePoints: 0, awayPoints: 3, resultStatus: "confirmed" }] }],
};
const game = (id, over = {}) => ({
  id, kind: "league", roundNumber: 3, roundStatus: "started", season: { id: "s1", currentRound: 3 }, resultStatus: "pending",
  preparationStatus: "not_started", postMatchStatus: "not_started", homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null,
  updatedAt: "2026-10-10T10:00:00Z", confirmedAt: null, home: OURS, away: THEIRS, ...over,
});
// Round 1: we won 2–1 away at theirs; round 3 is on, at home.
const MET = game("g0", { roundNumber: 1, roundStatus: "completed", resultStatus: "confirmed", home: THEIRS, away: OURS, homeTouchdowns: 1, awayTouchdowns: 2,
  homeCasualties: 0, awayCasualties: 1, confirmedAt: "2026-10-01T10:00:00Z" });
const GAMES = [MET, game("g1")];
const PAGE = "GET /api/players/u2/teams/r1";

/** The phone's media query, which the test answers and can change. */
function width(phone) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return { cross: (next) => { media.matches = next; listeners.forEach((listener) => listener()); } };
}

/** A coach signed in, whose list is read and nothing else; the server answers the team, the table and the games. */
function coach({ team = RIVAL, user = COACH, rolls = [], season = SEASON, games = GAMES } = {}) {
  api.reset();
  replaced.length = 0;
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  state.data = data;
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", roster: {} }], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.season = { data: null, loaded: false, loading: false, error: "" };
  state.games = { items: [], currentItems: [], loaded: false, loading: false, error: "" };
  api.reply(PAGE, 200, { user, team, rolls });
  if (season) api.reply("GET /api/season", 200, season);
  if (games) api.reply("GET /api/games", 200, { games, currentGames: [] });
}

async function visit(over = {}, { phone = false } = {}) {
  const screen = width(phone);
  coach(over);
  await renderCoachTeam("u2", "r1");
  await settle();
  return screen;
}

const words = (node) => node?.textContent.replace(/\s+/g, " ").trim() ?? "";
const rows = () => view.querySelectorAll(".g-opp__squad .g-opp__player");

test("a phone's opponent page: back to the table, his name and race, the next match, the tiles, his form, his coach, his roster", async () => {
  await visit({}, { phone: true });
  assert.equal(view.querySelector("a.g-opp__back").getAttribute("href"), "#/season");
  assert.equal(words(view.querySelector("a.g-opp__back")), "Table");
  assert.equal(view.querySelector("h1").textContent, RIVAL.name);
  assert.ok(document.activeElement === view.querySelector("h1"), "the title takes the focus");
  assert.equal(view.querySelector(".g-opp__race").getAttribute("href"), "#/teams/dwarf");
  assert.equal(view.querySelector(".g-opp__crest").textContent, "KH");
  assert.equal(view.querySelector(".g-opp__meta").textContent, "Dwarf·#2·coach rival", "the race, the place, the coach (the dots a screen reader skips)");
  assert.equal(view.querySelector(".g-opp__coachlink").getAttribute("href"), "#/coaches/u2", "a phone reaches the coach's page from the head");
  assert.match(view.querySelector(".g-opp__next").textContent, /Next opponent.*Round 3 · home/s);
  assert.equal(view.querySelector(".g-opp__next").getAttribute("href"), "#/t/t1/matches");
  assert.deepEqual(view.querySelectorAll(".g-kpi__k").map((node) => node.textContent), ["Team value", "W · D · L", "Points", "TD / CAS difference"]);
  assert.deepEqual(view.querySelectorAll(".g-kpi__v").map((node) => node.textContent).slice(1), ["0 · 0 · 1", "4", "−1 / −1"]);
  assert.deepEqual(view.querySelectorAll(".g-opp__formrow .g-form__item").map((node) => node.getAttribute("data-result")), ["l"]);
  const card = view.querySelector("a.g-opp__coach");
  assert.equal(card.getAttribute("href"), "https://t.me/rival_bb");
  assert.equal(card.getAttribute("target"), "_blank");
  assert.equal(card.getAttribute("rel"), "noopener noreferrer");
  assert.equal(card.querySelector(".g-opp__coachname").textContent, "Coach rival");
  assert.equal(card.querySelector(".g-opp__coachsub").textContent, "@rival_bb · to arrange the match");
  assert.equal(rows().length, RIVAL.roster.players.length);
  assert.deepEqual(rows().map((row) => row.querySelector(".g-opp__pname").textContent), ["Brakk", "Kor", "Dunn"], "the most SPP first, who misses the match last");
  assert.equal(rows()[2].querySelector(".g-opp__pline").textContent, "#2 Dwarf Blocker Lineman · misses the match");
  assert.ok(rows()[1].querySelector(".g-num__captain"), "the captain's mark");
  assert.equal(words(view.querySelector(".g-opp__squadtitle")), "Roster players: 3");
  assert.equal(view.querySelector(".g-opp__readonly").textContent, t("opponent.readOnly"));
  // OppTeam.html's order.
  const order = view.querySelector(".g-opp").childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class").split(" ")[0]);
  assert.deepEqual(order, ["g-opp__back", "g-opp__id", "g-opp__next", "g-opp__meeting", "g-kpis", "g-opp__formrow", "g-opp__coach", "g-opp__squad", "g-opp__readonly"]);
  assert.ok(!view.querySelector(".g-opp__cols"), "no columns on a phone");
  api.assertAnswered();
});

test("a desk's opponent page: its head with the coach and Telegram, the left column, the roster as columns", async () => {
  await visit();
  const head = view.querySelector("header.g-opp__head");
  assert.ok(head);
  assert.equal(head.querySelector("a.g-opp__back").getAttribute("href"), "#/t/t1/matches");
  assert.equal(words(head.querySelector("a.g-opp__back")), "Season");
  assert.equal(head.querySelector("h1").textContent, RIVAL.name);
  assert.equal(head.querySelector(".g-opp__coachlink").getAttribute("href"), "#/coaches/u2");
  assert.equal(head.querySelector(".g-opp__coachlink").textContent, "coach rival");
  const telegram = head.querySelector("a.g-opp__tg");
  assert.equal(telegram.getAttribute("href"), "https://t.me/rival_bb");
  assert.equal(telegram.getAttribute("rel"), "noopener noreferrer");
  assert.equal(telegram.getAttribute("target"), "_blank");
  assert.equal(words(telegram), "@rival_bb");
  assert.ok(!view.querySelector(".g-opp__coach"), "the coach's card is a phone's");
  const left = view.querySelector(".g-opp__left");
  assert.deepEqual(left.childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class").split(" ")[0]),
    ["g-opp__next", "g-opp__meeting", "g-opp__card", "g-opp__readonly"]);
  assert.deepEqual(left.querySelectorAll(".g-kpi__k").map((node) => node.textContent), ["TV", "W · D · L", "Points", "TD ± / CAS ±"]);
  assert.ok(left.querySelector(".g-opp__card .g-opp__formrow"), "the form in the tiles' card");
  const squad = view.querySelector("section.g-opp__squad");
  assert.equal(squad.querySelector('[role="table"]').getAttribute("aria-labelledby"), "opp-squad");
  assert.deepEqual(squad.querySelectorAll(".g-opp__col").map((node) => node.textContent), ["#", "Player", "Skills", "TD", "CAS", "SPP"]);
  const brakk = rows()[0];
  const cells = brakk.querySelectorAll('[role="cell"]');
  assert.equal(cells.length, 6);
  assert.deepEqual([cells[1].querySelector(".g-opp__pname").textContent, cells[1].querySelector(".g-opp__pline").textContent], ["Brakk", "Blitzer"]);
  assert.deepEqual(cells[2].querySelectorAll("[data-skill]").map((chip) => chip.textContent), ["Block", "Thick Skull", "Tackle", "Diving Tackle", "Wrestle"]);
  assert.deepEqual(cells.slice(3).map((cell) => cell.textContent), ["2", "1", "7"]);
  assert.equal(rows()[2].querySelector(".g-opp__pline").textContent, "Dwarf Blocker Lineman · misses the match");
  // A desk without a team goes back to the league's table.
  await (async () => {
    width(false);
    coach();
    state.activeTeamId = null;
    await renderCoachTeam("u2", "r1");
    await settle();
    assert.equal(view.querySelector("a.g-opp__back").getAttribute("href"), "#/season");
    assert.ok(!view.querySelector(".g-opp__next"), "no active team: no next match");
  })();
});

test("our meeting: its outcome, the round from our side, the score", async () => {
  for (const phone of [true, false]) {
    await visit({ games: [MET] }, { phone });
    const meeting = view.querySelector(".g-opp__meeting");
    assert.ok(meeting.querySelector(".g-result.g-result--w"), "a win");
    assert.equal(meeting.querySelector(".g-opp__meetlabel").textContent, "Our meeting");
    assert.equal(meeting.querySelector(".g-opp__meetline").textContent, "Round 1 · away");
    assert.equal(meeting.querySelector(".g-opp__score").textContent, "2–1");
    assert.ok(!view.querySelector(".g-opp__next"), "no match on against him");
  }
});

test("a gained skill's chip opens its rule and what the dice showed", async () => {
  await visit({ rolls: ROLLS }, { phone: true });
  const chip = rows()[0].querySelector('[data-skill="Wrestle"]');
  assert.ok(chip.getAttribute("class").includes("g-skill--gained"), "a gained skill is marked");
  fireEvent(chip, "click");
  const sheet = view.querySelector("dialog#roster-skill");
  assert.ok(sheet?.isModal, "the skill's sheet is open");
  assert.equal(sheet.querySelector("h2").textContent, "Wrestle");
  assert.ok(sheet.querySelector(".g-prose"), "the rule");
  assert.equal(sheet.querySelector(".g-roster__rollpair").textContent, t("teamPlayer.roll.pair", { first: "Wrestle", second: "Fend" }));
  assert.match(sheet.querySelector(".g-roster__rollline").textContent, /^Advancement 1 · /);
  // A roll the answer does not hold: said so, no error.
  await visit({ rolls: [] }, { phone: true });
  fireEvent(rows()[0].querySelector('[data-skill="Wrestle"]'), "click");
  assert.equal(view.querySelector("dialog#roster-skill .g-roster__rollstate").textContent, t("teamPlayer.roll.none"));
});

test("a starting skill's chip opens the rule alone", async () => {
  await visit({ rolls: ROLLS });
  fireEvent(rows()[0].querySelector('[data-skill="Block"]'), "click");
  const sheet = view.querySelector("dialog#roster-skill");
  assert.ok(sheet?.isModal);
  assert.equal(sheet.querySelector("h2").textContent, "Block");
  assert.ok(sheet.querySelector(".g-prose"));
  assert.equal(sheet.querySelector(".g-roster__rollblock"), null, "no advancement's line");
});

test("closing gives the focus back to the chip; leaving closes the sheet", async () => {
  await visit({ rolls: ROLLS }, { phone: true });
  const chip = () => rows()[0].querySelector('[data-skill="Wrestle"]');
  chip().focus();
  fireEvent(chip(), "click");
  fireEvent(view.querySelector("dialog#roster-skill"), "keydown", { key: "Escape" });
  assert.ok(!view.querySelector("dialog#roster-skill"), "the sheet is gone");
  assert.ok(document.activeElement === chip(), "the focus is the chip's again");
  // Its close button too.
  fireEvent(chip(), "click");
  fireEvent(view.querySelector("dialog#roster-skill [data-sheet-close]"), "click");
  assert.ok(document.activeElement === chip());
  // Leaving with the sheet open closes it, and nothing more is heard.
  fireEvent(chip(), "click");
  const sheet = view.querySelector("dialog#roster-skill");
  assert.ok(sheet.isModal);
  releaseCurrentScreen();
  assert.equal(sheet.open, false, "the sheet is closed with the screen");
  fireEvent(chip(), "click");
  assert.ok(!view.querySelector("dialog#roster-skill[open]"), "a chip of a page left opens nothing");
});

test("a refused read says the server's words and leads back", async () => {
  for (const [code, words404] of [["TEAM_NOT_FOUND", "The team could not be read: Team not found."], ["PLAYER_NOT_FOUND", "No such coach in the league."]]) {
    width(false);
    coach();
    api.reply(PAGE, 404, { error: { code, message: code } });
    await renderCoachTeam("u2", "r1");
    await settle();
    assert.equal(view.querySelector("h1").textContent, words404, code);
    assert.ok(document.activeElement === view.querySelector("h1"));
    assert.equal(view.querySelector("a.g-opp__back").getAttribute("href"), "#/t/t1/matches");
    assert.equal(view.querySelector(".g-kpi"), null);
    assert.equal(view.querySelector(".g-opp__squad"), null);
  }
  initLocale("ru");
  try {
    assert.equal(t("coach.notFound"), "Такого тренера в лиге нет.", "neutral: no «not found» of a person");
  } finally {
    initLocale("en");
  }
  // While it is read, the title says so.
  width(true);
  coach();
  const held = api.hold(PAGE);
  const drawing = renderCoachTeam("u2", "r1");
  assert.equal(view.querySelector("h1").textContent, "Reading the team…");
  assert.equal(view.querySelector("a.g-opp__back").getAttribute("href"), "#/season");
  held.release();
  await drawing;
  assert.equal(view.querySelector("h1").textContent, RIVAL.name);
});

test("one's own team at an opponent's address goes to its overview", async () => {
  width(false);
  coach();
  await renderCoachTeam("u1", "t1");
  assert.deepEqual(replaced, ["#/t/t1"]);
  assert.equal(api.calls.filter(({ key }) => key.startsWith("GET /api/players")).length, 0, "nothing is read");
  // Another coach's team of the same id is his.
  coach();
  api.reply("GET /api/players/u3/teams/t1", 200, { user: { ...COACH, id: "u3" }, team: { ...RIVAL, id: "t1" }, rolls: [] });
  await renderCoachTeam("u3", "t1");
  await settle();
  assert.deepEqual(replaced, []);
  assert.equal(view.querySelector("h1").textContent, RIVAL.name);
});

test("a race the reference does not know: the words in the roster's place", async () => {
  for (const phone of [true, false]) {
    await visit({ team: { ...RIVAL, baseTeamSlug: "teams/nobody" } }, { phone });
    assert.equal(view.querySelector(".g-opp__norace").textContent, "The team's race is not in the reference: its roster cannot be shown.");
    assert.equal(rows().length, 0);
    assert.equal(view.querySelector(".g-opp__race"), null, "no race to lead to");
    assert.ok(!view.querySelectorAll(".g-kpi__k").map((node) => node.textContent).some((label) => /value|TV/.test(label)), "no value");
  }
});

test("the table or the games not read: their words; the rest is drawn", async () => {
  width(false);
  coach({ season: null, games: null });
  api.reply("GET /api/season", 500, { error: { code: "INTERNAL", message: "x" } });
  api.fail("GET /api/games");
  await renderCoachTeam("u2", "r1");
  await settle();
  const failed = view.querySelector(".g-opp__failed");
  assert.equal(failed.getAttribute("role"), "alert");
  const titles = failed.querySelectorAll(".g-callout__title").map((node) => node.textContent);
  assert.match(titles[0], /^The league table did not load: /);
  assert.match(titles[1], /^The matches did not load: /);
  assert.deepEqual(view.querySelectorAll(".g-kpi__v").map((node) => node.textContent).slice(1), ["–", "–", "–"]);
  assert.ok(!view.querySelector(".g-opp__next") && !view.querySelector(".g-opp__meeting"));
  assert.equal(view.querySelector("h1").textContent, RIVAL.name);
  assert.equal(rows().length, 3, "the roster is drawn");
});

test("crossing 900px draws the other form, the focus kept or on the title", async () => {
  const screen = await visit({ rolls: ROLLS });
  assert.ok(view.querySelector(".g-opp--desk"));
  view.querySelector("a.g-opp__tg").focus();
  screen.cross(true);
  assert.ok(view.querySelector(".g-opp--phone"));
  assert.ok(document.activeElement === view.querySelector("h1"), "the band's link is gone: the title");
  releaseCurrentScreen();
});

test("names are text", async () => {
  const hostileTeam = { ...RIVAL, name: HOSTILE, roster: { players: [player("d9", 0, "9", HOSTILE)] } };
  for (const phone of [true, false]) {
    await visit({ team: hostileTeam, user: { ...COACH, login: HOSTILE, telegram: HOSTILE } }, { phone });
    assertCspSafe(view);
    assert.equal(view.querySelector("h1").textContent, HOSTILE);
    assert.equal(rows()[0].querySelector(".g-opp__pname").textContent, HOSTILE);
    assert.equal(view.querySelector(".g-opp__coachlink").textContent, `coach ${HOSTILE}`);
    assert.equal(view.querySelector("img"), null);
    assert.ok(!view.querySelectorAll("a").some((link) => /t\.me/.test(link.getAttribute("href"))), "a contact the forms would refuse leads nowhere");
  }
  // On a phone such a contact's card leads to the coach's page.
  await visit({ user: { ...COACH, telegram: "lili" } }, { phone: true });
  assert.equal(view.querySelector("a.g-opp__coach").getAttribute("href"), "#/coaches/u2");
  assert.equal(view.querySelector("a.g-opp__coach").getAttribute("target"), null);
});

test("styled", async () => {
  const sheets = [CSS, "src/screens/season/table.css", "skill-chip.css", "kpi-tile.css", "form-strip.css", "number-badge.css", "result-pill.css", "callout.css"];
  for (const phone of [true, false]) {
    await visit({ rolls: ROLLS }, { phone });
    assertStyled(view, ...sheets);
    fireEvent(rows()[0].querySelector('[data-skill="Wrestle"]'), "click");
    assertStyled(view, ...sheets, "sheet.css", "src/screens/team/roster/sheets.css", "src/screens/team/roster/rolls.css", "src/screens/ref/prose.css", "src/screens/team/roster/roster.css");
  }
  const styles = text("src/styles.css");
  const at = (file) => styles.indexOf(`@import url("${file}");`);
  assert.ok(at("screens/coaches/team.css") > at("screens/season/league.css") && at("screens/season/league.css") > 0, "imported after the stage's sheets before it, at the end");
  assert.doesNotMatch(text(CSS), /ellipsis|@media \((?!max-width: 900px|min-width: 901px)/, "no «…»; the 900/901 breakpoints only");
  for (const selector of [".g-opp__name", ".g-opp__pname", ".g-opp__pline", ".g-opp__meta", ".g-opp__coachname", ".g-opp__tg"]) {
    assert.ok(valuesOf(CSS, selector, "overflow-wrap").includes("anywhere"), `${selector} wraps`);
  }
});

test("readable: the header's words on its colour, the tint's, the links', the muted figures, in every palette", () => {
  assertContrast("--header-ink", ["--header"], 4.5);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-opp__nextlabel", "color"), ["var(--header-tab)"]);
  assertContrast("--header-tab", ["--header"], 4.5, { what: "«NEXT OPPONENT», 12px" });
  assertContrast("--on-accent-tint", ["--accent-tint"], 4.5);
  assertContrast("--accent-text", ["--surface"], 4.5);
  assertContrast("--muted", ["--surface", "--surface-2"], 4.5);
  assertContrast("--ink-2", ["--surface-2"], 4.5);
  assert.deepEqual(valuesOf(CSS, ".g-opp__next", "background"), ["var(--accent-tint)", "var(--header)"]);
  assert.deepEqual(valuesOf(CSS, ".g-opp__next", "color"), ["var(--on-accent-tint)", "var(--header-ink)"]);
  assert.deepEqual(valuesOf(CSS, ".g-opp__race", "color"), ["var(--accent-text)"]);
});

test("D2: a thumb's targets are 44 high up to 900px, a desk's 24 at least", () => {
  const px = (value) => Number(String(value).replace("px", ""));
  for (const selector of [".g-opp__back", ".g-opp__race", ".g-opp__coachlink", ".g-opp .g-skill"]) {
    assert.ok(px(valuesOf(CSS, selector, "min-height")[0]) >= 44, `${selector}: a phone's`);
    assert.ok(px(inMedia(CSS, "min-width: 901px", selector, "min-height").at(-1)) >= 24, `${selector}: a desk's`);
  }
  for (const selector of [".g-opp__next", ".g-opp__coach", ".g-opp__meeting"]) assert.ok(px(valuesOf(CSS, selector, "min-height")[0]) >= 44, selector);
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-opp__tg", "min-height")[0]) >= 24);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-opp__squad", "overflow-x"), ["auto"], "the roster scrolls in its card, never the page");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-opp__inner", "min-width"), ["620px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-opp__player", "grid-template-columns"), ["44px minmax(160px, 1fr) minmax(200px, 1.6fr) 44px 44px 52px"], "DeskOppTeam.html's columns");
  assert.deepEqual(valuesOf(CSS, ".g-opp__player", "grid-template-columns")[0], "36px minmax(0, 1fr) auto", "OppTeam.html's row");
});

test("the head line's race and coach: 44 to a thumb, 24 on a desk, and their zones never overlap — each other's on a wrapped line, the name's above, the next block's below", () => {
  // The geometry counts the padding inside min-height: the rule says so itself rather than lean on 2.x's global box-sizing.
  for (const selector of [".g-opp__race", ".g-opp__coachlink"]) assert.deepEqual(valuesOf(CSS, selector, "box-sizing"), ["border-box"], selector);
  const tokens = tokensOf("grass");
  const px = (value) => {
    const token = String(value).match(/^var\((--[\w-]+)\)$/);
    return Number(String(token ? tokens[token[1]] : value).replace("px", ""));
  };
  const box = (shorthand) => {
    const [top, right = top, bottom = top] = shorthand.split(/\s+/).map(px);
    return { top, right, bottom };
  };
  const lineOf = (font) => {
    const [, size, ratio] = font.match(/(\d+)px\/([\d.]+)/);
    return Number(size) * Number(ratio);
  };
  const phone = (selector, property) => valuesOf(CSS, selector, property)[0];
  const desk = (selector, property) => inMedia(CSS, "min-width: 901px", selector, property).at(-1) ?? phone(selector, property);
  const forms = [
    { width: "a phone's", target: 44, at: phone, below: px(phone(".g-opp", "gap")), under: "the page's next block, 20 below the head" },
    { width: "a desk's", target: 24, at: desk, below: box(desk(".g-opp__head", "padding")).bottom, under: "the band's foot" },
  ];
  for (const { width, target, at, below, under } of forms) {
    const line = lineOf(at(".g-opp__meta", "font"));
    const rowGap = px(at(".g-opp__meta", "gap").split(/\s+/)[0]);
    const nameGap = px(at(".g-opp__title", "gap"));
    for (const selector of [".g-opp__race", ".g-opp__coachlink"]) {
      const height = px(at(selector, "min-height"));
      const margin = box(at(selector, "margin"));
      const [above, beneath] = [-margin.top, -margin.bottom];
      assert.ok(height >= target, `${width} ${selector}: ${height} high`);
      assert.ok(above >= 0 && beneath >= 0, `${width} ${selector}: its zone reaches out of the line, never into it`);
      assert.ok(height - above - beneath <= line, `${width} ${selector}: the line keeps the text's height, as the prototype's`);
      assert.ok(above <= nameGap, `${width} ${selector}: ${above} above the line, the name ${nameGap} above it — a tap on the name is the name's`);
      assert.ok(beneath <= below, `${width} ${selector}: ${beneath} below the line, ${under} ${below} below it`);
      assert.ok(rowGap >= above + beneath, `${width} ${selector}: a wrapped line ${rowGap} under the first, the two zones ${above + beneath} into the gap — none lies over another`);
      const padding = box(at(selector, "padding"));
      assert.equal(padding.top - padding.bottom, above - beneath, `${width} ${selector}: its words sit on the line as the plain ones beside them, not lowered by an uneven zone`);
    }
  }
});

test("the 2.x public team's rules went with it: no sheet keeps a selector no module draws", () => {
  const sources = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory()
    ? sources(`${dir}/${entry.name}`) : entry.name.endsWith(".mjs") || entry.name.endsWith(".js") ? [text(`${dir}/${entry.name}`)] : []));
  const code = sources("src").join("\n");
  const sheets = ["src/styles/matchday.css", "src/styles/roster.css", "src/styles/responsive.css"].map(text).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const name of ["matchday-public", "matchday-readonly-label", "public-team-coach-block", "matchday-player-name", "matchday-player-details"]) {
    assert.ok(!code.includes(name), `${name}: no module draws it`);
    assert.ok(!sheets.includes(`.${name}`), `${name}: no rule left for it`);
  }
  assert.ok(!code.includes("matchday-jersey"));
  assert.doesNotMatch(sheets, /\.matchday-jersey\s*\{/, "the jersey's own rule is gone");
});

test("the prototypes' sizes: their padding on top of min-height, Oswald's figures at its own line height, a chip 44 wide, no ring on the title", () => {
  // OppTeam.html and DeskOppTeam.html set no box-sizing: a min-height there is the content's, the padding on top of it.
  assert.deepEqual(valuesOf(CSS, ".g-opp__next", "min-height"), ["76px", "88px"], "a phone's 56 + 10·2; a desk's 64 + 12·2");
  assert.deepEqual(valuesOf(CSS, ".g-opp__meeting", "min-height"), ["76px", "0"], "a phone's 56 + 10·2; a desk's has none: its 14·2 and the score make 73");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-opp__player", "min-height"), ["69px"], "a desk's row: 52 + 8·2 + its rule");
  // Oswald's figures as the prototypes write them: no line height of their own, the font's (H4).
  assert.deepEqual(valuesOf(CSS, ".g-opp .g-kpi__v", "line-height"), ["normal"], "a tile 81 high");
  assert.deepEqual(valuesOf(CSS, ".g-opp .g-kpi__k", "line-height"), ["normal"], "the tile's word as the prototypes write it, right on the figure");
  assert.deepEqual(valuesOf(CSS, ".g-opp .g-kpi", "gap"), ["0"]);
  assert.deepEqual(valuesOf(CSS, ".g-opp__score", "font"), ["700 26px/normal var(--font-display)"]);
  assert.deepEqual(valuesOf(CSS, ".g-opp__squadtitle", "font"), ["700 24px/normal var(--font-display)"], "«Roster» 36 high");
  // H1: «Pro» or «Leap» is a target as wide as it is high on a phone.
  assert.deepEqual(valuesOf(CSS, ".g-opp .g-skill", "min-width"), ["44px", "24px"]);
  assert.deepEqual(valuesOf(CSS, ".g-opp .g-skill", "justify-content"), ["center"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-opp .g-skill", "min-width"), ["24px"]);
  // H6: the title takes the focus on arrival, a place the keyboard starts from, not a control (page-head.css's).
  assert.deepEqual(valuesOf(CSS, ".g-opp__name:focus", "outline"), ["none"]);
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/coaches/team.mjs", "src/screens/coaches/team-model.mjs", "src/data/coaches.mjs");
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  assert.deepEqual([en["opponent.loading"], ru["opponent.loading"]], ["Reading the team…", "Читаем команду…"]);
  assert.deepEqual([en["opponent.outDesk"], ru["opponent.outDesk"]], ["{position} · misses the match", "{position} · пропускает матч"]);
  for (const gone of ["admin.loginToViewSavedTeams", "admin.savedRosterSubtitle", "roster.readOnly", "roster.playerDetails"]) {
    assert.ok(!(gone in en) && !(gone in ru), `${gone}: no reader since the 2.x public team went`);
  }
});
