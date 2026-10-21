import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertContrast, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";

// The API is installed before anything that asks it is imported (pre-flight L24).
const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/coaches/u2", replace() {} };
const { coachModel, coachMarkup, renderCoachProfile } = await import("../src/screens/coaches/profile.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { initLocale, t } = await import("../src/core/i18n.mjs");
const { formatDay } = await import("../src/core/format.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
// The model names a race by the reference's words.
state.data = data;
const CSS = "src/screens/coaches/profile.css";

const ORC_BOSS = { id: "u2", login: "orc_boss", telegram: "@orc_boss", isAdmin: false, createdAt: "2025-04-02T10:00:00Z", savedTeamCount: 2 };
const TEAMS = [
  { id: "r1", name: "Grimtusk Raiders", baseTeamSlug: "teams/orc", roster: {} },
  { id: "r2", name: "Iron Teeth", baseTeamSlug: "teams/black-orc", roster: {} },
];
const side = (user, id, name, slug) => ({ user: { id: user, login: user }, team: { id, name, baseTeamSlug: slug } });
const OURS = side("u1", "t1", "Ashgrove Wardens", "teams/human");
const RAIDERS = side("u2", "r1", "Grimtusk Raiders", "teams/orc");
const TEETH = side("u2", "r2", "Iron Teeth", "teams/black-orc");

// r1 is fifth with 9 points: three wins and three losses in the league's rounds.
const standing = (id, user, rank, points, team = { id, name: id, baseTeamSlug: "teams/orc" }) => ({ entryId: `e-${id}`, withdrawnAt: null, user: { id: user, login: user }, team, rank, points, games: 6 });
const SEASON = {
  season: { id: "s1", name: "Mock Season", currentRound: 7 },
  standings: [standing("x1", "u9", 1, 15), standing("x2", "u8", 2, 12), standing("x3", "u7", 3, 11), standing("t1", "u1", 4, 10, OURS.team), standing("r1", "u2", 5, 9, RAIDERS.team)],
  rounds: [[2, 0], [0, 1], [1, 0], [0, 2], [3, 1], [1, 2]].map(([own, other], at) => ({ roundNumber: at + 1, status: "completed", pairings: [{
    id: `p${at}`, tableNumber: 1, homeEntryId: "e-r1", awayEntryId: `e-o${at}`, homeTouchdowns: own, awayTouchdowns: other, homeCasualties: 0, awayCasualties: 0,
    homePoints: own > other ? 3 : 0, awayPoints: own < other ? 3 : 0, resultStatus: "confirmed",
  }] })),
};
const confirmed = (id, over) => ({
  id, kind: "league", roundNumber: 3, roundStatus: "completed", season: { id: "s1", currentRound: 7 }, resultStatus: "confirmed",
  preparationStatus: "completed", postMatchStatus: "completed", homeCasualties: 0, awayCasualties: 0, updatedAt: "2026-10-01T10:00:00Z", ...over,
});
// Round 3: we beat the Raiders 2–1 at home; 12 Sept: the Teeth beat us 1–0 at theirs, a friendly; the Raiders drew 1–1 with somebody else.
const WIN = confirmed("g3", { home: OURS, away: RAIDERS, homeTouchdowns: 2, awayTouchdowns: 1, confirmedAt: "2026-10-03T10:00:00Z" });
const LOSS = confirmed("gf", { kind: "friendly", roundNumber: null, season: null, roundStatus: null, home: TEETH, away: OURS, homeTouchdowns: 1, awayTouchdowns: 0, confirmedAt: "2026-09-12T10:00:00Z" });
const OTHER = confirmed("gx", { home: OURS, away: side("u3", "z1", "Someone", "teams/orc"), homeTouchdowns: 1, awayTouchdowns: 1, confirmedAt: "2026-10-05T10:00:00Z" });
const PENDING = confirmed("gp", { roundNumber: 7, roundStatus: "started", resultStatus: "pending", home: OURS, away: RAIDERS, homeTouchdowns: null, awayTouchdowns: null, confirmedAt: null });
const GAMES = [LOSS, WIN, OTHER, PENDING];

const base = { user: ORC_BOSS, teams: TEAMS, seasonData: SEASON, games: GAMES, viewerId: "u1", activeTeamId: "t1", admin: false };

/** The phone's media query. */
function width(phone) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return { cross: (next) => { media.matches = next; listeners.forEach((listener) => listener()); } };
}

function coach({ user = { id: "u1", login: "coach", isAdmin: false }, page = { user: ORC_BOSS, teams: TEAMS }, status = 200 } = {}) {
  api.reset();
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  state.data = data;
  state.auth.currentUser = { preferences: { activeTeamId: "t1" }, ...user };
  state.myTeams = { items: [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", roster: {} }], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.season = { data: null, loaded: false, loading: false, error: "" };
  state.games = { items: [], currentItems: [], loaded: false, loading: false, error: "" };
  api.reply(`GET /api/players/${page.user?.id ?? "u2"}`, status, page);
  api.reply("GET /api/season", 200, SEASON);
  api.reply("GET /api/games", 200, { games: GAMES, currentGames: [] });
}

async function visit(over = {}, { phone = false, userId = "u2" } = {}) {
  const screen = width(phone);
  coach(over);
  await renderCoachProfile(userId);
  await settle();
  return screen;
}

const words = (node) => node?.textContent.replace(/\s+/g, " ").trim() ?? "";

test("the model: since when, how many teams, each team's line and address, your meetings newest first, the challenge", () => {
  const model = coachModel(base);
  assert.deepEqual([model.userId, model.login, model.initial, model.since, model.teamsLine, model.mine], ["u2", "orc_boss", "O", "Coach since 2025", "teams: 2", false]);
  assert.deepEqual(model.telegram, { handle: "@orc_boss", href: "https://t.me/orc_boss" });
  assert.deepEqual(model.teams.map(({ id, name, initials, line, href, draft }) => [id, name, initials, line, href, draft]), [
    ["r1", "Grimtusk Raiders", "GR", "Orc · in the season · #5 · 9 · 3/0/3", "#/coaches/u2/teams/r1", false],
    ["r2", "Iron Teeth", "IT", "Black Orc · friendlies", "#/coaches/u2/teams/r2", false],
  ]);
  assert.deepEqual(model.meetings, [
    { line: "Round 3 · league", teams: "Ashgrove Wardens — Grimtusk Raiders", outcome: "Win 2–1", tone: "w" },
    { line: `${formatDay(LOSS.confirmedAt)} · friendly`, teams: "Ashgrove Wardens — Iron Teeth", outcome: "Loss 0–1", tone: "l" },
  ]);
  assert.equal(model.challengeHref, "#/t/t1/challenges");
  assert.equal(model.adminHref, "");
  // A draw, from our side; a team in its build says so (pre-flight L30); no date says nothing.
  const draw = confirmed("gd", { home: RAIDERS, away: OURS, homeTouchdowns: 1, awayTouchdowns: 1, confirmedAt: "2026-10-04T10:00:00Z", roundNumber: 4 });
  assert.deepEqual(coachModel({ ...base, games: [draw] }).meetings, [{ line: "Round 4 · league", teams: "Ashgrove Wardens — Grimtusk Raiders", outcome: "Draw 1–1", tone: "d" }]);
  assert.equal(coachModel({ ...base, teams: [{ ...TEAMS[1], stage: "draft" }] }).teams[0].draft, true);
  assert.equal(coachModel({ ...base, user: { ...ORC_BOSS, createdAt: "never" } }).since, "");
  assert.equal(coachModel({ ...base, user: { ...ORC_BOSS, savedTeamCount: undefined } }).teamsLine, "teams: 2", "the teams sent, when the count is not");
  assert.equal(coachModel({ ...base, activeTeamId: null }).challengeHref, "", "no team to challenge with");
  assert.equal(coachModel({ ...base, admin: true }).adminHref, "#/administration/users/u2");
});

test("a phone's coach profile: the login, since when and how many teams, Telegram with «Write», his teams, your meetings, the challenge", async () => {
  await visit({}, { phone: true });
  assert.equal(view.querySelector("h1").textContent, "Coach profile", "the title, for a screen reader");
  assert.ok(document.activeElement === view.querySelector("h1"));
  assert.equal(view.querySelector(".g-coach__letter").textContent, "O");
  assert.equal(view.querySelector(".g-coach__login").textContent, "orc_boss");
  assert.equal(view.querySelector(".g-coach__line").textContent, "Coach since 2025 · teams: 2");
  const card = view.querySelector(".g-coach__tgcard");
  assert.equal(card.querySelector(".g-coach__tglabel").textContent, "Telegram");
  assert.equal(card.querySelector(".g-coach__handle").textContent, "@orc_boss");
  const write = card.querySelector("a.g-coach__write");
  assert.deepEqual([write.textContent, write.getAttribute("href"), write.getAttribute("target"), write.getAttribute("rel")], ["Write", "https://t.me/orc_boss", "_blank", "noopener noreferrer"]);
  assert.equal(card.querySelector(".g-coach__note").textContent, t("coach.contactNote"));
  const teams = view.querySelectorAll("a.g-coach__team");
  assert.deepEqual(teams.map((row) => [row.getAttribute("href"), row.querySelector(".g-teamface__name").textContent, row.querySelector(".g-teamface__line").textContent]), [
    ["#/coaches/u2/teams/r1", "Grimtusk Raiders", "Orc · in the season · #5 · 9 · 3/0/3"],
    ["#/coaches/u2/teams/r2", "Iron Teeth", "Black Orc · friendlies"],
  ]);
  const meetings = view.querySelectorAll(".g-coach__meeting");
  assert.equal(meetings.length, 2);
  assert.equal(meetings[0].querySelector(".g-coach__when").textContent, "Round 3 · league");
  assert.equal(meetings[0].querySelector(".g-coach__vs").textContent, "Ashgrove Wardens — Grimtusk Raiders");
  assert.equal(meetings[0].querySelector(".g-coach__outcome").textContent, "Win 2–1");
  assert.ok(meetings[0].querySelector(".g-coach__outcome--w"));
  assert.ok(meetings[1].querySelector(".g-coach__outcome--l"));
  const challenge = view.querySelector(".g-coach__challenge a.g-btn--primary");
  assert.deepEqual([challenge.textContent, challenge.getAttribute("href")], ["Challenge to a friendly", "#/t/t1/challenges"]);
  // CoachProfile.html's order.
  const order = view.querySelector(".g-coach").childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class").split(" ")[0]);
  assert.deepEqual(order, ["g-coach__id", "g-coach__tgcard", "g-coach__caption", "g-coach__teams", "g-coach__meetings", "g-coach__challenge"]);
  api.assertAnswered();
});

test("a desk's coach profile: the band, the row with both buttons, the two cards side by side", async () => {
  await visit();
  const head = view.querySelector("header.g-pagehead");
  assert.equal(head.querySelector("h1").textContent, "Coach profile");
  assert.equal(head.querySelector(".g-pagehead__sub").textContent, "A public page · every coach of the league sees it");
  assert.equal(head.querySelector(".g-pagehead__meta"), null, "a coach has no admin's link");
  assert.equal(view.querySelector(".g-coach__login").textContent, "orc_boss");
  assert.equal(words(view.querySelector(".g-coach__line")), "Coach since 2025 · teams: 2 · Telegram @orc_boss");
  assert.equal(view.querySelector(".g-coach__line b").textContent, "@orc_boss");
  const actions = view.querySelector(".g-coach__actions");
  const [write, challenge] = actions.querySelectorAll("a");
  assert.deepEqual([write.textContent, write.getAttribute("href"), write.getAttribute("rel")], ["Write on Telegram", "https://t.me/orc_boss", "noopener noreferrer"]);
  assert.deepEqual([challenge.textContent, challenge.getAttribute("href")], ["Challenge", "#/t/t1/challenges"]);
  const cards = view.querySelectorAll(".g-coach__grid section.g-coach__card");
  assert.deepEqual(cards.map((card) => card.querySelector("h2").textContent), ["Teams", "Your meetings"]);
  assert.equal(cards[0].querySelectorAll("a.g-coach__team").length, 2);
  assert.equal(cards[1].querySelectorAll(".g-coach__meeting").length, 2);
  assert.equal(view.querySelector(".g-coach__tgcard"), null, "the phone's card is not a desk's");
});

test("one's own profile has no Telegram buttons, no meetings and no challenge; one's own teams lead to their overviews", async () => {
  for (const phone of [true, false]) {
    await visit({ user: { id: "u2", login: "orc_boss", isAdmin: false } }, { phone });
    assert.equal(view.querySelector("a.g-coach__write"), null);
    assert.ok(!view.querySelectorAll("a").some((link) => /t\.me/.test(link.getAttribute("href"))));
    assert.equal(view.querySelector(".g-coach__meetings"), null);
    assert.equal(view.querySelector(".g-coach__challenge"), null);
    assert.equal(view.querySelector(".g-btn--primary"), null);
    assert.deepEqual(view.querySelectorAll("a.g-coach__team").map((row) => row.getAttribute("href")), ["#/t/r1", "#/t/r2"]);
  }
  assert.deepEqual(coachModel({ ...base, viewerId: "u2" }).meetings, []);
  assert.equal(coachModel({ ...base, viewerId: "u2" }).challengeHref, "");
});

test("an admin has the way to manage the coach; a coach has not", async () => {
  await visit({ user: { id: "u1", login: "admin", isAdmin: true } });
  const manage = view.querySelector(".g-pagehead__meta a.g-coach__admin");
  assert.deepEqual([manage.textContent, manage.getAttribute("href")], ["Manage the coach", "#/administration/users/u2"]);
  await visit({ user: { id: "u1", login: "admin", isAdmin: true } }, { phone: true });
  assert.equal(view.querySelector("a.g-coach__admin").getAttribute("href"), "#/administration/users/u2", "a phone's too, under the page");
  await visit();
  assert.equal(view.querySelector(".g-coach__admin"), null);
});

test("a coach not in the league, and a read refused", async () => {
  for (const phone of [true, false]) {
    await visit({ page: { error: { code: "PLAYER_NOT_FOUND", message: "x" } }, status: 404 }, { phone });
    assert.equal(view.querySelector("h1").textContent, "No such coach in the league.");
    assert.ok(document.activeElement === view.querySelector("h1"));
    assert.equal(view.querySelector(".g-coach"), null);
    await visit({ page: { error: { code: "INTERNAL", message: "Boom" } }, status: 500 }, { phone });
    assert.match(view.querySelector("h1").textContent, /^The coach's page could not be read: /);
  }
  initLocale("ru");
  try {
    assert.equal(t("coach.notFound"), "Такого тренера в лиге нет.");
  } finally {
    initLocale("en");
  }
  // While it is read, the title says so.
  width(true);
  coach();
  const held = api.hold("GET /api/players/u2");
  const drawing = renderCoachProfile("u2");
  assert.equal(view.querySelector("h1").textContent, "Reading the coach's page…");
  held.release();
  await drawing;
  assert.equal(view.querySelector(".g-coach__login").textContent, "orc_boss");
});

test("no meetings: the words; a contact the forms would refuse is text", async () => {
  const model = coachModel({ ...base, games: [OTHER, PENDING] });
  assert.deepEqual(model.meetings, []);
  for (const phone of [true, false]) {
    const fragment = document.createElement("div");
    fragment.innerHTML = coachMarkup(model, { phone });
    assert.equal(fragment.querySelector(".g-coach__none").textContent, "No meetings yet");
  }
  const refused = coachModel({ ...base, user: { ...ORC_BOSS, telegram: "t.me/orc" } });
  assert.deepEqual(refused.telegram, { handle: "t.me/orc", href: "" });
  for (const phone of [true, false]) {
    const fragment = document.createElement("div");
    fragment.innerHTML = coachMarkup(refused, { phone });
    assert.ok(!fragment.querySelectorAll("a").some((link) => /t\.me/.test(link.getAttribute("href"))), "no link");
    assert.equal(fragment.querySelector("a.g-coach__write"), null);
    assert.ok(fragment.textContent.includes("t.me/orc"), "the contact as text");
  }
  // No contact at all: no card, no «Telegram» in the line.
  const none = coachModel({ ...base, user: { ...ORC_BOSS, telegram: null } });
  const fragment = document.createElement("div");
  fragment.innerHTML = coachMarkup(none, { phone: true });
  assert.equal(fragment.querySelector(".g-coach__tgcard"), null);
  fragment.innerHTML = coachMarkup(none, { phone: false });
  assert.equal(words(fragment.querySelector(".g-coach__line")), "Coach since 2025 · teams: 2");
});

test("crossing 900px draws the other form, the focus kept or on the title", async () => {
  const screen = await visit();
  view.querySelector(".g-coach__actions a").focus();
  screen.cross(true);
  assert.ok(view.querySelector(".g-coach--phone"));
  assert.ok(document.activeElement === view.querySelector("h1"));
  releaseCurrentScreen();
  screen.cross(false);
  assert.ok(view.querySelector(".g-coach--phone"), "a page left is not drawn again");
});

test("names are text", async () => {
  for (const phone of [true, false]) {
    await visit({ page: { user: { ...ORC_BOSS, login: HOSTILE, telegram: HOSTILE }, teams: [{ ...TEAMS[0], name: HOSTILE }] } }, { phone });
    assertCspSafe(view);
    assert.equal(view.querySelector(".g-coach__login").textContent, HOSTILE);
    assert.equal(view.querySelector(".g-teamface__name").textContent, HOSTILE);
    assert.equal(view.querySelector("img"), null);
  }
});

test("styled", async () => {
  for (const phone of [true, false]) {
    await visit({ user: { id: "u1", login: "admin", isAdmin: true } }, { phone });
    assertStyled(view, CSS, "page-head.css", "button.css", "src/shell/team-switcher.css", "status-chip.css");
  }
  const styles = text("src/styles.css");
  assert.ok(styles.trimEnd().endsWith('@import url("screens/coaches/profile.css");'), "imported last");
  assert.ok(styles.indexOf("screens/coaches/team.css") < styles.indexOf("screens/coaches/profile.css"));
  assert.doesNotMatch(text(CSS), /ellipsis|@media \((?!max-width: 900px|min-width: 901px)/, "no «…»; the 900/901 breakpoints only");
  for (const selector of [".g-coach__login", ".g-coach__handle", ".g-coach .g-teamface__name", ".g-coach .g-teamface__line", ".g-coach__vs"]) {
    assert.ok(valuesOf(CSS, selector, "overflow-wrap").includes("anywhere"), `${selector} wraps`);
  }
  assert.deepEqual(valuesOf(CSS, ".g-coach .g-teamface__name", "white-space"), ["normal"], "the switcher's one line is not the profile's");
});

test("readable: the outcomes, the muted words, the letter on its circle, in every palette", () => {
  assert.deepEqual(valuesOf(CSS, ".g-coach__outcome--w", "color"), ["var(--on-accent-tint)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coach__outcome--l", "color"), ["var(--danger)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coach__outcome--d", "color"), ["var(--ink-2)"]);
  assertContrast("--on-accent-tint", ["--surface"], 4.5);
  assertContrast("--danger", ["--surface"], 4.5);
  assertContrast("--ink-2", ["--surface"], 4.5);
  assertContrast("--muted", ["--surface", "--surface-2"], 4.5);
  assertContrast("--header-ink", ["--header"], 4.5);
});

test("D2: 44 to a thumb, the prototypes' 48 where they draw more", () => {
  const px = (value) => Number(String(value).replace("px", ""));
  assert.ok(px(valuesOf(CSS, ".g-coach__write", "min-height")[0]) >= 44, "«Write»: 44, the prototype's 40 raised");
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-coach__write", "min-height")[0]) >= 48);
  assert.ok(px(valuesOf(CSS, ".g-coach__team", "min-height")[0]) >= 44);
  assert.ok(px(valuesOf(CSS, ".g-coach__meeting", "min-height")[0]) >= 44);
  assert.ok(px(valuesOf(CSS, ".g-coach__admin", "min-height")[0]) >= 44);
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-coach__admin", "min-height")[0]) >= 24);
  assert.deepEqual(valuesOf(CSS, ".g-coach .g-btn--primary", "min-height"), ["48px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-coach__grid", "grid-template-columns"), ["repeat(auto-fit, minmax(360px, 1fr))"]);
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/coaches/profile.mjs", "src/data/coaches.mjs");
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  const coachKeys = (dict) => Object.keys(dict).filter((key) => key.startsWith("coach."));
  assert.deepEqual(coachKeys(en), coachKeys(ru));
  assert.deepEqual([en["coach.teamsCount"], ru["coach.teamsCount"]], ["teams: {count}", "команд: {count}"], "a number with no plural form");
  assert.deepEqual([en["coach.meetingFriendly"], ru["coach.meetingFriendly"]], ["{date} · friendly", "{date} · товарищеский"]);
  for (const gone of ["admin.playerProfileHeading", "admin.loginToViewProfiles", "admin.savedTeamsAndCoachSubtitle", "admin.loadingPlayer"]) {
    assert.ok(!(gone in en) && !(gone in ru), `${gone}: no reader since the 2.x player page went`);
  }
});
