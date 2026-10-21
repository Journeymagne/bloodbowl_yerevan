import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertContrast, assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";

// The client takes `fetch` when it loads (helpers/fake-api.mjs): the fake one first, then the modules that ask it.
const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { state } = await import("../src/core/state.mjs");
const { t } = await import("../src/core/i18n.mjs");
const routes = await import("../src/core/routes.mjs");
const { shellModel } = await import("../src/shell/navigation.mjs");
const { adminRequest, readAdminUser, readAdminUsers, readAwaiting, seasonWrite } = await import("../src/data/admin.mjs");
const { loadSeason } = await import("../src/screens/season/season-data.mjs");
const { adminHeadMarkup, adminRefusalMarkup, avatarMarkup, crumbsMarkup, isAdminViewer } = await import("../src/screens/admin/frame.mjs");

const { adminCoachUrl, adminSeasonUrl, adminTeamEditUrl, adminTeamPlayerUrl, adminUrl, matchRoute, routeFromHash } = routes;
const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const CSS = "src/screens/admin/admin.css";
const TOKEN = "gata-league-auth-token";
const ADMIN = { id: "u1", login: "admin", isAdmin: true };
const ORC_BOSS = { id: "u2", login: "orc_boss", telegram: "@orc_boss", isAdmin: false, savedTeamCount: 2 };
const SEASON = { season: { id: "s1", name: "Season 1", currentRound: 7 }, standings: [], rounds: [] };
const keys = () => api.calls.map(({ key }) => key);

/** The admin signed in on this page, under the token the page read the session with. */
function signIn(token = "tok") {
  api.reset();
  api.items.set(TOKEN, token);
  rememberSessionToken(token);
  state.auth.currentUser = ADMIN;
}

// ---------------------------------------------------------------------------
// The addresses and the head
// ---------------------------------------------------------------------------

test("the addresses of the administration", () => {
  assert.equal(adminUrl(), "#/administration");
  assert.equal(adminCoachUrl("u 1"), "#/administration/users/u%201");
  assert.equal(adminCoachUrl({ id: "u2" }), "#/administration/users/u2", "an entity or its id");
  assert.equal(adminSeasonUrl(), "#/administration/season");
  assert.equal(adminSeasonUrl("entries"), "#/administration/season/entries");
  assert.equal(adminSeasonUrl("rounds"), "#/administration/season", "the rounds are the season's own address");
  assert.equal(adminTeamPlayerUrl("u 1", "t", "p"), "#/administration/users/u%201/teams/t/edit/p");
  assert.equal(adminTeamPlayerUrl({ id: "u/1" }, { id: "t" }, { id: "p 1" }), `${adminTeamEditUrl("u/1", "t")}/p%201`, "a player of the team the admin edits");
  // The coaches and a coach are the routes 2.x drew already; their screens change, not their addresses.
  assert.equal(matchRoute(routeFromHash(adminUrl())).name, "administration");
  assert.deepEqual(matchRoute(routeFromHash(adminCoachUrl("u 1"))), { name: "adminUserProfile", params: { userId: "u 1" } });
  // The SideNav leads an admin there.
  const model = shellModel({ route: { name: "administration", params: {} }, user: ADMIN, team: null });
  assert.equal(model.side.find((item) => item.key === "administration").href, adminUrl());
});

test("the switch leads to the coaches and to the season, the current one marked", () => {
  const page = mount(adminHeadMarkup({ title: "Тренеры", section: "coaches" }));
  assert.equal(page.querySelector("h1").textContent, "Тренеры");
  const links = [...page.querySelectorAll(".g-admin__switch a")];
  assert.deepEqual(links.map((link) => link.getAttribute("href")), ["#/administration", "#/administration/season"]);
  assert.deepEqual(links.map((link) => link.textContent), ["Coaches", "Season"]);
  assert.deepEqual(links.map((link) => link.getAttribute("aria-current")), ["page", null]);
  // The segments draw their own <nav> (L20): the switch around them is a <div>, never a second nav.
  assert.equal(page.querySelector(".g-admin__switch").tagName, "DIV");
  assert.equal(page.querySelectorAll("nav").length, 1);
  assert.equal(page.querySelector("nav").getAttribute("aria-label"), "Administration sections");

  const season = mount(adminHeadMarkup({ title: "Season 1", sub: "Swiss system", section: "season" }));
  assert.deepEqual([...season.querySelectorAll(".g-admin__switch a")].map((link) => link.getAttribute("aria-current")), [null, "page"]);
  assert.equal(season.querySelector(".g-pagehead__sub").textContent, "Swiss system");
  assert.throws(() => adminHeadMarkup({ title: "Teams", section: "teams" }), /section/, "every screen of the administration is one of the two");
});

test("a phone's head stands as a title; a desk's is the band", () => {
  const phone = mount(adminHeadMarkup({ title: "Administration", section: "coaches", phone: true }));
  assert.ok(phone.querySelector(".g-admin__head .g-pagehead").classList.contains("g-pagehead--phone"));
  const desk = mount(adminHeadMarkup({ title: "Coaches", section: "coaches" }));
  assert.equal(desk.querySelector(".g-admin__head .g-pagehead").classList.contains("g-pagehead--phone"), false);
});

test("the path in the head: its links, its arrows not read aloud", () => {
  const crumbsHtml = crumbsMarkup([{ label: t("administration.title"), href: adminUrl() }, { label: "orc_boss", href: adminCoachUrl("u2") }, { label: "Grimtusk Raiders" }]);
  const page = mount(adminHeadMarkup({ title: "Coach's team", crumbsHtml, section: "coaches" }));
  // In the band, under the title (DeskAdminTeamEdit.html, DeskAdminUser.html).
  const crumbs = page.querySelector(".g-admin__head .g-admin__crumbs");
  assert.equal(crumbs.textContent, "Administration → orc_boss → Grimtusk Raiders");
  assert.deepEqual([...crumbs.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")]),
    [["Administration", "#/administration"], ["orc_boss", "#/administration/users/u2"]]);
  assert.deepEqual([...crumbs.querySelectorAll('[aria-hidden="true"]')].map((arrow) => arrow.textContent), [" → ", " → "]);
  assert.throws(() => crumbsMarkup([{ label: "x", href: "javascript:alert(1)" }]));
  assert.throws(() => crumbsMarkup([]), /path/);
});

test("a coach who is no admin is shown the banner home, and only the admin is an admin viewer", () => {
  for (const [user, admin] of [[null, false], [ORC_BOSS, false], [{ ...ORC_BOSS, isAdmin: "yes" }, true], [ADMIN, true]]) {
    state.auth.currentUser = user;
    assert.equal(isAdminViewer(), admin);
  }
  const page = mount(adminRefusalMarkup());
  assert.equal(page.querySelector("h1").textContent, "Administration");
  const banner = page.querySelector("a.g-callout");
  assert.equal(banner.getAttribute("href"), "#/");
  assert.equal(page.querySelector(".g-callout__title").textContent, t("administration.only"));
  assert.equal(page.querySelector(".g-callout__sub").textContent, t("administration.onlySub"));
  assert.equal(page.querySelector(".g-admin__switch"), null, "no way into the sections");
});

test("a coach's letter in its circle: three sizes, the first letter in capitals", () => {
  for (const size of [36, 40, 64]) {
    const avatar = mount(avatarMarkup("orc_boss", size)).querySelector(".g-admin__avatar");
    assert.ok(avatar.classList.contains(`g-admin__avatar--${size}`));
    assert.equal(avatar.textContent, "O");
    assert.equal(avatar.getAttribute("aria-hidden"), "true", "the login beside it is what is read");
  }
  assert.equal(mount(avatarMarkup("  élan", 40)).querySelector(".g-admin__avatar").textContent, "É");
  assert.equal(mount(avatarMarkup("", 40)).querySelector(".g-admin__avatar").textContent, "?");
  assert.throws(() => avatarMarkup("orc_boss", 48), RangeError);
});

// ---------------------------------------------------------------------------
// The admin's writes (Review Focus 1)
// ---------------------------------------------------------------------------

test("a write with another coach's token sends nothing; a lost answer says so and is not sent again; a refusal is the server's words", async () => {
  signIn();
  // Another tab signed in as someone else since this page read its session.
  api.items.set(TOKEN, "another");
  assert.deepEqual(await adminRequest("/api/admin/users/u2", { method: "PATCH", body: { login: "orc_boss" } }),
    { refusal: t("auth.otherTab"), code: "OTHER_TAB", unknown: false });
  assert.equal(api.calls.length, 0, "nothing sent");

  // No answer to stand behind: no connection, a server that failed, a proxy's answer without the server's words.
  for (const fail of [() => api.fail("POST /api/admin/users/u2/reset-password"), () => api.reply("POST /api/admin/users/u2/reset-password", 500, { error: { code: "SERVER_ERROR" } }),
    () => api.reply("POST /api/admin/users/u2/reset-password", 502, {})]) {
    signIn();
    fail();
    const lost = await adminRequest("/api/admin/users/u2/reset-password", { method: "POST" });
    assert.equal(lost.refusal, t("administration.mayHaveWritten"));
    assert.equal(lost.unknown, true);
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.deepEqual(keys(), ["POST /api/admin/users/u2/reset-password"], "sent once, never again");
  }

  signIn();
  api.reply("PATCH /api/admin/users/u1", 409, { error: { code: "SELF_ADMIN_DEMOTE", message: "You cannot." } });
  assert.deepEqual(await adminRequest("/api/admin/users/u1", { method: "PATCH", body: { login: "admin", isAdmin: false } }),
    { refusal: t("error.SELF_ADMIN_DEMOTE"), code: "SELF_ADMIN_DEMOTE", unknown: false });
  assert.deepEqual(api.calls[0].body, { login: "admin", isAdmin: false }, "the body as given, and nothing else");

  signIn();
  api.reply("DELETE /api/admin/teams/t1", 200, { ok: true });
  assert.deepEqual(await adminRequest("/api/admin/teams/t1", { method: "DELETE" }), { answer: { ok: true } });
  api.assertAnswered();
});

test("a second write while one is on its way sends nothing; a read still goes; the next write after it does", async () => {
  signIn();
  api.reply("POST /api/admin/coaches", 201, { user: ORC_BOSS });
  const gate = api.hold("POST /api/admin/coaches");
  const first = adminRequest("/api/admin/coaches", { method: "POST", body: { login: "orc_boss" } });
  assert.deepEqual(await adminRequest("/api/admin/coaches", { method: "POST", body: { login: "orc_boss" } }), { ignored: true });
  assert.deepEqual(await adminRequest("/api/admin/users/u2", { method: "DELETE" }), { ignored: true }, "any write: one on its way at a time");
  api.reply("GET /api/admin/users", 200, { users: [ADMIN, ORC_BOSS] });
  assert.deepEqual(await readAdminUsers(), { users: [ADMIN, ORC_BOSS] }, "a read writes nothing and goes");
  assert.deepEqual(keys(), ["POST /api/admin/coaches", "GET /api/admin/users"]);
  gate.release();
  assert.deepEqual(await first, { answer: { user: ORC_BOSS } });

  api.reply("DELETE /api/admin/users/u2", 200, { ok: true });
  assert.deepEqual(await adminRequest("/api/admin/users/u2", { method: "DELETE" }), { answer: { ok: true } });
  // A lost answer frees the way as well: the screen reads again, and its next press is its own.
  api.fail("POST /api/admin/coaches");
  assert.equal((await adminRequest("/api/admin/coaches", { method: "POST", body: { login: "orc_boss" } })).unknown, true);
  api.reply("POST /api/admin/coaches", 409, { error: { code: "LOGIN_ALREADY_REGISTERED" } });
  assert.equal((await adminRequest("/api/admin/coaches", { method: "POST", body: { login: "orc_boss" } })).code, "LOGIN_ALREADY_REGISTERED");
  assert.deepEqual(keys(), ["POST /api/admin/coaches", "GET /api/admin/users", "DELETE /api/admin/users/u2", "POST /api/admin/coaches", "POST /api/admin/coaches"]);
});

test("a season write puts the server's season in place", async () => {
  signIn();
  api.reply("POST /api/season/admin/rounds/generate", 201, SEASON);
  const done = await seasonWrite("/api/season/admin/rounds/generate", { method: "POST" });
  assert.equal(done.answer, SEASON);
  assert.equal(state.season.data, SEASON, "the answer is the season, as the server holds it");
  assert.deepEqual(keys(), ["POST /api/season/admin/rounds/generate"], "nothing read: the answer is the season");

  // An answer that is not the season (a game's) changed it all the same: the season is read.
  signIn();
  const after = { ...SEASON, rounds: [{ roundNumber: 7, status: "started", pairings: [] }] };
  api.reply("POST /api/games/g1/confirm", 200, { game: { id: "g1" } });
  api.reply("GET /api/season", 200, after);
  assert.deepEqual((await seasonWrite("/api/games/g1/confirm", { method: "POST" })).answer, { game: { id: "g1" } });
  assert.deepEqual(keys(), ["POST /api/games/g1/confirm", "GET /api/season"]);
  assert.equal(state.season.data, after);

  // A refusal changes nothing and reads nothing.
  signIn();
  api.reply("PATCH /api/season/admin/settings", 422, { error: { code: "FIELD_INVALID" } });
  const refused = await seasonWrite("/api/season/admin/settings", { method: "PATCH", body: { playoffPlaces: 99 } });
  assert.equal(refused.code, "FIELD_INVALID");
  assert.deepEqual(keys(), ["PATCH /api/season/admin/settings"]);
  assert.equal(state.season.data, after);
});

test("a read of the season on its way when a season write is answered does not put back the season from before the write", async () => {
  signIn();
  const before = { ...SEASON, rounds: [{ roundNumber: 8, status: "draft", pairings: [] }] };
  const after = { ...SEASON, rounds: [{ roundNumber: 8, status: "started", pairings: [{ id: "p1", homeTeamId: null, awayTeamId: null }] }] };
  // A screen's background refresh (or afterSessionChange's loadSeason) went out before the write did.
  api.reply("GET /api/season", 200, before);
  const reading = api.hold("GET /api/season");
  const refresh = loadSeason(true);
  api.reply("POST /api/season/admin/rounds/r8/pairings", 201, after);
  const written = seasonWrite("/api/season/admin/rounds/r8/pairings", { method: "POST" });
  let second;
  try {
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(reading.count, 1, "the older read is still on its way");
    second = await seasonWrite("/api/season/admin/rounds/r8/pairings", { method: "POST" });
  } finally {
    // Released whatever the asserts say, so the read on its way does not outlive this test.
    reading.release();
    await refresh;
  }
  assert.deepEqual(second, { ignored: true }, "the way stays held until the write's season is in place: a second «+ pair» sends nothing");
  assert.equal((await written).answer, after);
  assert.equal(state.season.data, after, "the write's season stands, not the older read's");
  assert.equal(state.season.loading, false);
  assert.deepEqual(keys(), ["GET /api/season", "POST /api/season/admin/rounds/r8/pairings"], "nothing read again, nothing sent twice");
  api.assertAnswered();

  // Signed out while that read was waited for: the admin's answer is not put in place; the season is read for whoever is here.
  signIn();
  const guest = { ...SEASON, rounds: [] };
  api.reply("GET /api/season", 200, guest);
  const held = api.hold("GET /api/season");
  const older = loadSeason(true);
  api.reply("POST /api/season/admin/rounds/r8/pairings", 201, after);
  const answered = seasonWrite("/api/season/admin/rounds/r8/pairings", { method: "POST" });
  try {
    await new Promise((resolve) => { setImmediate(resolve); });
    state.auth.currentUser = null;
  } finally {
    held.release({ status: 200, body: before });
    await older;
  }
  assert.equal((await answered).answer, after);
  assert.equal(state.season.data, guest, "what the server holds for the guest, not the admin's answer");
  assert.deepEqual(keys(), ["GET /api/season", "POST /api/season/admin/rounds/r8/pairings", "GET /api/season"]);
  api.assertAnswered();
});

test("a lost answer reads again and sends nothing twice", async () => {
  signIn();
  const held = { ...SEASON, rounds: [{ roundNumber: 8, status: "draft", pairings: [] }] };
  api.fail("POST /api/season/admin/rounds/generate");
  api.reply("GET /api/season", 200, held);
  const lost = await seasonWrite("/api/season/admin/rounds/generate", { method: "POST" });
  assert.deepEqual(lost, { refusal: t("administration.mayHaveWritten"), code: "", unknown: true });
  assert.deepEqual(keys(), ["POST /api/season/admin/rounds/generate", "GET /api/season"], "read again, never sent again");
  assert.equal(state.season.data, held, "the screen shows what the server holds");

  // A press while the season is being read again sends nothing either: the write is not over until it is read.
  signIn();
  api.fail("POST /api/season/admin/rounds/generate");
  api.reply("GET /api/season", 200, held);
  const reading = api.hold("GET /api/season");
  const second = seasonWrite("/api/season/admin/rounds/generate", { method: "POST" });
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(reading.count, 1);
  assert.deepEqual(await seasonWrite("/api/season/admin/rounds/generate", { method: "POST" }), { ignored: true });
  reading.release();
  assert.equal((await second).unknown, true);
  assert.deepEqual(keys(), ["POST /api/season/admin/rounds/generate", "GET /api/season"]);

  // Another tab's token: nothing sent, nothing read.
  signIn();
  api.items.set(TOKEN, "another");
  assert.equal((await seasonWrite("/api/season/admin/rounds/generate", { method: "POST" })).code, "OTHER_TAB");
  assert.deepEqual(keys(), []);
});

test("the reads: the coaches, a coach, the scores awaiting; a refusal in its words; an answer without what it holds is none", async () => {
  signIn();
  api.reply("GET /api/admin/users", 200, { users: [ADMIN, ORC_BOSS] });
  assert.deepEqual(await readAdminUsers(), { users: [ADMIN, ORC_BOSS] });
  api.reply("GET /api/admin/users/u%202", 200, { user: ORC_BOSS, teams: [{ id: "t1" }] });
  assert.deepEqual(await readAdminUser("u 2"), { user: ORC_BOSS, teams: [{ id: "t1" }] });
  api.reply("GET /api/admin/users/u2", 200, { user: ORC_BOSS });
  assert.deepEqual(await readAdminUser("u2"), { user: ORC_BOSS, teams: [] }, "teams that are not a list are none");
  api.reply("GET /api/admin/awaiting", 200, { games: [{ id: "g1" }] });
  assert.deepEqual(await readAwaiting(), { games: [{ id: "g1" }] });

  api.reply("GET /api/admin/users/u3", 404, { error: { code: "USER_NOT_FOUND" } });
  assert.deepEqual(await readAdminUser("u3"), { error: t("error.USER_NOT_FOUND"), code: "USER_NOT_FOUND" });
  api.fail("GET /api/admin/awaiting");
  assert.deepEqual(await readAwaiting(), { error: t("request.offline"), code: "" });
  for (const answer of [{}, { users: "u1" }]) {
    api.reply("GET /api/admin/users", 200, answer);
    assert.deepEqual(await readAdminUsers(), { error: t("request.noAnswer"), code: "" });
  }
  api.reply("GET /api/admin/users/u4", 200, { teams: [] });
  assert.deepEqual(await readAdminUser("u4"), { error: t("request.noAnswer"), code: "" });
});

// ---------------------------------------------------------------------------
// The rules every screen owes
// ---------------------------------------------------------------------------

test("a name is text; no inline style; styled", () => {
  const crumbsHtml = crumbsMarkup([{ label: HOSTILE, href: adminCoachUrl(HOSTILE) }, { label: HOSTILE }]);
  for (const phone of [true, false]) {
    const page = mount(adminHeadMarkup({ title: HOSTILE, sub: HOSTILE, crumbsHtml, section: "coaches", phone }) + avatarMarkup(HOSTILE, 64) + adminRefusalMarkup());
    assert.equal(page.querySelector("img"), null);
    assert.equal(page.querySelector("h1").textContent, HOSTILE);
    assert.equal(page.querySelector(".g-admin__crumbs").textContent, `${HOSTILE} → ${HOSTILE}`);
    assert.equal(page.querySelector(".g-admin__avatar").textContent, "<");
    assertCspSafe(page);
    assertStyled(page, CSS, "page-head.css", "segmented-control.css", "callout.css");
  }
  const styles = text("src/styles.css");
  const at = (file) => styles.indexOf(`@import url("${file}");`);
  assert.ok(at("screens/admin/admin.css") > at("screens/matches/post-money.css"), "after the sheets before it, the ui/ ones it overrides among them");
  assert.ok(at("screens/admin/admin.css") > styles.lastIndexOf('@import url("ui/'));
});

test("nothing wraps into «…»; long lines wrap; the 900/901 breakpoints only", () => {
  assert.doesNotMatch(text(CSS), /ellipsis|nowrap|@media \((?!max-width: 900px|min-width: 901px)/);
  for (const selector of [".g-admin__crumbs", ".g-admin__note", ".g-admin__cardhead"]) {
    assert.ok(valuesOf(CSS, selector, "overflow-wrap").includes("anywhere"), `${selector} wraps`);
  }
});

test("the prototypes' measures: the band, the switch, the card, the grid", () => {
  // DeskAdminSeason.html's segments: 420 wide, 38 high, 14px; AdminMobile.html's two buttons: 48 high, 8 apart, radius 12.
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-admin__switch", "max-width"), ["420px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-admin__switch .g-seg__item", "min-height"), ["38px"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-admin__switch .g-seg", "gap"), ["var(--space-8)"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-admin__switch .g-seg__item", "min-height"), ["48px"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-admin__switch .g-seg__item", "box-shadow"), ["inset 0 0 0 1px var(--control-border)"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", '.g-admin__switch .g-seg__item[aria-current="page"]', "background"), ["var(--accent)"]);
  // The band of DeskAdminUser.html: 20 32 on the card colour over a rule, the path under the title.
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-admin__head", "padding"), ["var(--space-20) 32px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-admin__head", "background"), ["var(--surface)"]);
  assert.deepEqual(valuesOf(CSS, ".g-admin__card", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(valuesOf(CSS, ".g-admin__card", "border-radius"), ["var(--radius-2xl)"]);
  assert.deepEqual(valuesOf(CSS, ".g-admin__card", "padding").slice(0, 1), ["18px var(--space-20)"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-admin__card", "padding"), ["var(--space-14) var(--space-16)"]);
  assert.deepEqual(valuesOf(CSS, ".g-admin__grid", "grid-template-columns").slice(0, 1), ["repeat(auto-fit, minmax(340px, 1fr))"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-admin__grid", "grid-template-columns"), ["minmax(0, 1fr)"]);
  for (const [size, font] of [[36, "18px"], [40, "20px"], [64, "32px"]]) {
    assert.deepEqual([valuesOf(CSS, `.g-admin__avatar--${size}`, "width"), valuesOf(CSS, `.g-admin__avatar--${size}`, "font-size")], [[`${size}px`], [font]]);
  }
});

test("D2: a thumb's switch 44 and more, a desk's 24 and more", () => {
  const px = (value) => Number(String(value).replace("px", ""));
  assert.ok(px(inMedia(CSS, "max-width: 900px", ".g-admin__switch .g-seg__item", "min-height")[0]) >= 44);
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-admin__switch .g-seg__item", "min-height")[0]) >= 24);
});

test("readable: the letter on its circle, the muted words, the path's links, the switch, in every palette", () => {
  assertContrast("--header-ink", ["--header"], 4.5);
  assertContrast("--muted", ["--surface"], 4.5);
  assertReadable(CSS, ".g-admin__avatar", "color", ["--header"], 4.5);
  assertReadable(CSS, ".g-admin__crumbs", "color", ["--surface", "--page"], 4.5);
  assertReadable(CSS, ".g-admin__crumbs a", "color", ["--surface", "--page"], 4.5);
  assertReadable(CSS, ".g-admin__note", "color", ["--surface", "--surface-2"], 4.5);
  assertReadable(CSS, ".g-admin__switch .g-seg__item", "color", ["--surface"], 4.5);
  assertReadable(CSS, '.g-admin__switch .g-seg__item[aria-current="page"]', "color", ["--accent"], 4.5);
});

test("every key in both dictionaries, in the plan's words", () => {
  assertDictionaryCovers("src/screens/admin/frame.mjs", "src/data/admin.mjs");
  const [en, ru] = ["en", "ru"].map((locale) => JSON.parse(text(`src/i18n/${locale}.json`)));
  assert.deepEqual(Object.keys(ru).filter((key) => key.startsWith("administration.")), Object.keys(en).filter((key) => key.startsWith("administration.")),
    "the same keys in the same order");
  // The frame's own keys; the screens of the administration add theirs to the same namespace (Task 9 on).
  const own = ["title", "sections", "coaches", "season", "only", "onlySub", "mayHaveWritten", "reading", "readFailed", "again"].map((key) => `administration.${key}`);
  assert.deepEqual(Object.fromEntries(own.map((key) => [key, ru[key]])), {
    "administration.title": "Администрирование",
    "administration.sections": "Разделы администрирования",
    "administration.coaches": "Тренеры",
    "administration.season": "Сезон",
    "administration.only": "Раздел только для администратора",
    "administration.onlySub": "Войдите под учётной записью администратора лиги.",
    "administration.mayHaveWritten": "Ответ не пришёл: сайт читает данные заново — проверьте, сохранилось ли.",
    "administration.reading": "Читаем…",
    "administration.readFailed": "Не удалось прочитать: {reason}",
    "administration.again": "Повторить",
  });
  for (const key of own) assert.ok(en[key] && en[key] !== ru[key], `${key}: an English of its own`);
  assert.match(en["administration.readFailed"], /\{reason\}/);
});
