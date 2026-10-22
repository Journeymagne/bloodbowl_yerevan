/**
 * The prototypes draw two chevrons (stage 13, ruling L14). The long one, M9 5l7 7-7 7, is the kit's: the design
 * system's Callout, ListRow, Button and MatchCard, and nearly every screen — Team, Matches, Stats, OppTeam, Ref,
 * Settings' «Сменить пароль», DeskOverview's and DeskSeason's board. The short one, M9 6l6 6-6 6, only CoachProfile's
 * and DeskCoachProfile's teams, AdminMobile's coaches and Settings' «Администрирование» draw; turned down, it is also
 * the «Карьера» toggle's M6 9l6 6 6-6 (PlayerCareer, DeskRosterCareer). `chevron` is the long, `chevronShort` the short.
 *
 * Each place that draws one is checked against its prototype twice: in its markup where a function draws it, and in a
 * map of every call under src/, so a new place has to say which it is.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { document, mount } from "./helpers/ui.mjs";
import { el } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { expandCollections } from "../src/data/reference.mjs";

installFakeApi();
document.body.appendChild(el(document, "section", { id: "app-view" }));
globalThis.location = { hash: "#/", replace() {} };
const { ICON_NAMES, icon } = await import("../src/ui/icons.mjs");
const { renderNavRow } = await import("../src/ui/list-row.mjs");
const { renderCallout } = await import("../src/ui/callout.mjs");
const { renderMatchBoard } = await import("../src/ui/match-board.mjs");
const { profileLinkMarkup } = await import("../src/screens/team/roster/panel.mjs");
const { careerMarkup } = await import("../src/screens/team/roster/career.mjs");
const { settingsMarkup } = await import("../src/screens/settings/index.mjs");
const { coachesMarkup, coachesModel } = await import("../src/screens/admin/coaches.mjs");
const { coachMarkup, coachModel } = await import("../src/screens/coaches/profile.mjs");
const { overviewMarkup, overviewModel } = await import("../src/screens/team/overview.mjs");
const { state } = await import("../src/core/state.mjs");

const LONG = "M9 5l7 7-7 7";
const SHORT = "M9 6l6 6-6 6";
const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
state.data = data;

/** The path and the size of the chevron a node draws: its last glyph, where the prototypes put it. */
function chevronOf(node, what) {
  assert.ok(node, `${what}: not drawn`);
  const svg = node.querySelectorAll("svg.g-icon").at(-1);
  assert.ok(svg, `${what}: no glyph`);
  assert.equal(svg, node.lastElementChild ?? node.childNodes.filter((child) => child.nodeType === 1).at(-1), `${what}: the chevron closes the line`);
  return [svg.querySelector("path").getAttribute("d"), svg.getAttribute("width")];
}

test("two chevrons: the long one is the kit's, the short one is its own glyph", () => {
  assert.ok(ICON_NAMES.includes("chevron") && ICON_NAMES.includes("chevronShort"));
  assert.ok(icon("chevron", 16).includes(`<path d="${LONG}"/>`));
  assert.ok(icon("chevronShort", 16).includes(`<path d="${SHORT}"/>`));
});

test("the long chevron where the prototypes draw it", () => {
  // Ref, DeskRef and the kit's ListRow: a navigation row.
  assert.deepEqual(chevronOf(mount(renderNavRow({ href: "#/ref", title: "Skills", desc: "All of them", count: 82 })).querySelector("a.g-list-row"), "a row"), [LONG, "16"]);
  // The kit's Callout: a banner that is a link.
  assert.deepEqual(chevronOf(mount(renderCallout({ title: "Advancement available", sub: "Ashby · 21 SPP", href: "#/t/t1/roster/p1" })).querySelector("a.g-callout"), "a callout"), [LONG, "16"]);
  // DeskOverview and DeskSeason: the board's «next match», 14; its «previous» is the back arrow.
  const board = mount(renderMatchBoard({ own: { name: "Wardens" }, tabs: true, pager: [{ label: "1", result: "w", current: false }, { label: "2", result: null, current: true }] }));
  assert.deepEqual(chevronOf(board.querySelector('[data-board-step="1"]'), "the board's next"), [LONG, "14"]);
  // Stats (the phone's «Состав»): an open row's «Профиль и прокачка», 14.
  assert.deepEqual(chevronOf(mount(profileLinkMarkup("Profile and advancement", "#/t/t1/roster/p1")).querySelector("a"), "the row's profile"), [LONG, "14"]);
  // Settings and DeskCoach: «Сменить пароль».
  const settings = mount(settingsMarkup({ user: { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: true, createdAt: "2025-03-01T10:00:00Z" }, teamCount: 2, locale: "en", telegram: "@felstell" }));
  assert.deepEqual(chevronOf(settings.querySelector(".g-settings__password-label").parentNode, "the password row"), [LONG, "16"]);
});

test("Team's «Доступна прокачка» card leads on with the long chevron, 18", () => {
  const race = data.teams.find((team) => team.slug === "teams/human");
  const team = { id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", revision: 1, roster: { treasury: 120, players: [{ id: "p3", rowIndex: 2, number: "7", name: "Cade", spp: { touchdowns: 9 } }] } };
  const fragment = mount(overviewMarkup(overviewModel({ team, raceTeam: race, seasonData: null, games: [], phone: true })));
  assert.deepEqual(chevronOf(fragment.querySelector("a.g-overview__ready"), "the card"), [LONG, "18"]);
});

test("the short chevron only where CoachProfile, AdminMobile and Settings' «Администрирование» draw it", () => {
  // A row may ask for the short one; nothing else is a row's chevron.
  assert.deepEqual(chevronOf(mount(renderNavRow({ href: "#/administration", title: "Administration", chevron: "chevronShort" })).querySelector("a"), "a short row"), [SHORT, "16"]);
  assert.throws(() => renderNavRow({ href: "#/x", title: "x", chevron: "back" }), /chevron/);
  // Settings: «Администрирование», for an admin.
  const settings = mount(settingsMarkup({ user: { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: true, createdAt: "2025-03-01T10:00:00Z" }, teamCount: 2, locale: "en", telegram: "@felstell" }));
  assert.deepEqual(chevronOf(settings.querySelector(".g-settings__admin a"), "the administration row"), [SHORT, "16"]);
  // AdminMobile: a coach's row.
  const users = [{ id: "u2", login: "orc_boss", telegram: "@orc_boss", isAdmin: false, savedTeamCount: 2, draftTeamCount: 0, lastTeamUpdatedAt: "2026-10-12T10:00:00Z" }];
  const coaches = mount(coachesMarkup(coachesModel({ users, season: null, phone: true })));
  assert.deepEqual(chevronOf(coaches.querySelector("a.g-coaches__item"), "a coach's row"), [SHORT, "16"]);
  // CoachProfile and DeskCoachProfile: a team of his.
  const user = { id: "u2", login: "orc_boss", telegram: "@orc_boss", isAdmin: false, createdAt: "2025-04-02T10:00:00Z", savedTeamCount: 1 };
  const teams = [{ id: "r1", name: "Grimtusk Raiders", baseTeamSlug: "teams/orc", roster: {} }];
  for (const phone of [true, false]) {
    const profile = mount(coachMarkup(coachModel({ user, teams, seasonData: null, games: [], viewerId: "u1" }), { phone }));
    assert.deepEqual(chevronOf(profile.querySelector(".g-coach__team"), `a team, ${phone ? "phone" : "desk"}`), [SHORT, "16"]);
  }
  // PlayerCareer and DeskRosterCareer: «Карьера» toggles with the short one turned down (career.css), their M6 9l6 6 6-6.
  for (const desk of [false, true]) {
    const career = mount(careerMarkup({ line: { id: "p1", earned: 7 }, race: {}, career: null, open: false, desk }));
    assert.deepEqual(chevronOf(career.querySelector(".g-career__toggle"), "the career's toggle"), [SHORT, "18"]);
  }
});

/**
 * Every chevron a module names, with its size where the call gives it, by file — and the prototype it answers to.
 * `ui/list-row.mjs` passes its prop on (checked above); `ui/icons.mjs` holds the glyphs.
 */
const SITES = {
  "src/ui/callout.mjs": ["chevron 16"], // the kit's Callout
  "src/ui/match-board.mjs": ["chevron"], // DeskOverview, DeskSeason: the board's «next match» (14, inside its arrow())
  "src/screens/settings/index.mjs": ["chevron 16", "chevronShort"], // Settings, DeskCoach: «Сменить пароль»; Settings: «Администрирование»
  "src/screens/coaches/profile.mjs": ["chevronShort 16"], // CoachProfile, DeskCoachProfile: the teams
  "src/screens/coaches/team.mjs": ["chevron 16", "chevron 18"], // OppTeam, DeskOppTeam: «Тренер …», «Следующий соперник»
  "src/screens/admin/coaches.mjs": ["chevronShort 16"], // AdminMobile: the coaches
  "src/screens/matches/card.mjs": ["chevron 16", "chevron 16"], // Matches: «Записи матча»; «Подготовка к матчу», «Итоги матча»
  "src/screens/team/overview.mjs": ["chevron 18"], // Team: «Доступна прокачка»
  "src/screens/team/roster/panel.mjs": ["chevron 14"], // Stats: «Профиль и прокачка», «Профиль игрока»
  "src/screens/team/roster/career.mjs": ["chevronShort 18"], // PlayerCareer, DeskRosterCareer: «Карьера», turned down
  "src/screens/team/roster/player-sheets.mjs": ["chevron 16"], // the edit's «fix by hand»: no prototype, so the kit's
  // «История вызовов»: neither Challenges.html nor DeskChallenges.html draws it, so 09c's own glyph (the short one, as
  // `chevron` was then), turned down as the «Карьера» toggle is.
  "src/screens/matches/challenges-view.mjs": ["chevronShort 16"],
};

test("every chevron under src/ is the one its prototype draws", () => {
  const files = readdirSync(new URL("../src/", import.meta.url), { recursive: true })
    .map((name) => `src/${name.split("\\").join("/")}`)
    .filter((file) => file.endsWith(".mjs") && !["src/ui/icons.mjs", "src/ui/list-row.mjs"].includes(file));
  const found = {};
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const named = [...source.matchAll(/"(chevron\w*)"(?:\s*,\s*(\d+))?/g)].map(([, name, size]) => (size ? `${name} ${size}` : name));
    if (named.length) found[file] = named.sort();
  }
  assert.deepEqual(found, Object.fromEntries(Object.entries(SITES).map(([file, names]) => [file, [...names].sort()])));
});

/*
 * The back arrows mirror the chevrons (review of stage 13): the long M15 5l-7 7 7 7 is the kit's — Team, OppTeam,
 * Player*, Ref*, Adv*, TeamNew and the desk's pages, DeskOverview's board «previous» beside its long «next» —; the short
 * M15 6l-6 6 6 6 only Pre*, Post*, Builder* (and the team's settings, under the builder's head) draw.
 */
const BACK_LONG = "M15 5l-7 7 7 7";
const BACK_SHORT = "M15 6l-6 6 6 6";

const BACK_SITES = {
  "src/ui/match-board.mjs": ["back"], // DeskOverview, DeskSeason: the board's «previous» (14, inside its arrow())
  "src/ui/sheet.mjs": ["back"], // Adv*: a sheet's step back
  "src/screens/ref/frame.mjs": ["back 18"], // Ref*, DeskRef*: «‹ Справочник»
  "src/screens/coaches/team.mjs": ["back 14"], // OppTeam, DeskOppTeam: «‹ Таблица»
  "src/screens/matches/game.mjs": ["back 14"], // the match page: no prototype, so the kit's
  "src/screens/team/roster/profile.mjs": ["back 16"], // Player*: «‹ Состав»
  "src/screens/matches/prep-frame.mjs": ["backShort 18"], // Pre*, Post*, DeskPre*, DeskPost*: the frame's «‹»
  "src/screens/matches/prep.mjs": ["backShort 18"], // the same frame while the preparation is read
  "src/screens/matches/post.mjs": ["backShort 18"], // the same frame while the post-match is read
  "src/screens/teams/builder-view.mjs": ["backShort 18"], // Builder, DeskBuilder
  "src/screens/team/manage/settings-screen.mjs": ["backShort 18"], // the team's settings, under Builder's head
};

test("two back arrows, as the prototypes draw them; the board's «previous» and «next» are a long pair", () => {
  assert.ok(ICON_NAMES.includes("back") && ICON_NAMES.includes("backShort"));
  assert.ok(icon("back", 14).includes(`<path d="${BACK_LONG}"/>`));
  assert.ok(icon("backShort", 18).includes(`<path d="${BACK_SHORT}"/>`));
  const board = mount(renderMatchBoard({ own: { name: "Wardens" }, tabs: true, pager: [{ label: "1", result: "w", current: false }, { label: "2", result: null, current: true }] }));
  const glyph = (step) => board.querySelector(`[data-board-step="${step}"] svg path`).getAttribute("d");
  assert.deepEqual([glyph(-1), glyph(1)], [BACK_LONG, LONG]);
  const files = readdirSync(new URL("../src/", import.meta.url), { recursive: true })
    .map((name) => `src/${name.split("\\").join("/")}`)
    .filter((file) => file.endsWith(".mjs") && file !== "src/ui/icons.mjs");
  const found = {};
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const named = [...source.matchAll(/(?:icon\(|icon: |, )"(back(?:Short)?)"(?:\s*,\s*(\d+))?/g)].map(([, name, size]) => (size ? `${name} ${size}` : name));
    if (named.length) found[file] = named.sort();
  }
  assert.deepEqual(found, BACK_SITES);
});
