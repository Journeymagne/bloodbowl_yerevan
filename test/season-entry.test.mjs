import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { expandCollections } from "../src/data/reference.mjs";

/*
 * A coach enters a team into the season from the team's own pages (stage 12, decision 22): the call «Not entered in the
 * season» on the overview and on «Matches» carries the button, asks first, and sends one entry; a coach whose other team
 * plays the season is told so, with no button. The 2.x season screen that did this is gone.
 */

// The API is installed before anything that asks it is imported: the client takes `fetch` when it loads.
const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/t/t4", replace() {} };
// confirmAction asks the browser's own question where there is no <dialog> to build one: the answer is the test's.
const asked = [];
let answer = true;
globalThis.confirm = (message) => {
  asked.push(message);
  return answer;
};

const { enterSeason, seasonCallFor } = await import("../src/data/season-entry.mjs");
const { enterCallMarkup } = await import("../src/screens/season/enter.mjs");
const { renderTeamOverview } = await import("../src/screens/team/overview.mjs");
const { renderTeamMatches } = await import("../src/screens/matches/index.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const flush = async () => {
  for (let turn = 0; turn < 12; turn += 1) await settle();
};
const TOKEN = "gata-league-auth-token";
const COACH = { id: "u1", login: "coach", isAdmin: false, preferences: { activeTeamId: "t4" } };

// The coach's two teams, neither in the season: one in its build, one made before stage 12.
const TEAMS = [
  { id: "t4", name: "Fresh Meat", baseTeamSlug: "teams/orc", stage: "draft", inActiveSeason: false, revision: 1, roster: { treasury: 600 } },
  { id: "t5", name: "Old Guard", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: false, revision: 3, roster: { treasury: 40 } },
];
const entry = (id, team, name, user, login) => ({ id, withdrawnAt: null, user: { id: user, login }, team: { id: team, name, baseTeamSlug: "teams/dwarf" } });
const RIVAL = entry("e-r1", "r1", "Rival Team", "u-r1", "rival");
const OURS = entry("e-t4", "t4", "Fresh Meat", "u1", "coach");
const OLD = entry("e-t5", "t5", "Old Guard", "u1", "coach");
/** `/api/season` with the rival entered, and `mine` as the coach's own entry (`myEntry`) when there is one. */
const seasonWith = (mine = null) => {
  const entries = [RIVAL, ...(mine ? [mine] : [])];
  return {
    season: { id: "s1", name: "Mock Season", status: "active", currentRound: 0, playoffPlaces: null },
    entries, historicalEntries: [], rounds: [], myEntry: mine, currentFixture: null, myTeams: [],
    standings: entries.map((item, index) => ({ entryId: item.id, withdrawnAt: null, user: item.user, team: item.team, rank: index + 1, points: 0, games: 0, byes: 0,
      touchdowns: 0, casualties: 0 })),
  };
};
const OUTSIDE = seasonWith();
const ENTERED = seasonWith(OURS);
const TAKEN = seasonWith(OLD);

/** The phone's media query: what the screens listen to when the width crosses 900px. */
function width(phone) {
  const media = { matches: phone, addEventListener() {}, removeEventListener() {} };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
}

/** The coach on a team's overview (or its «Matches»), the list, the table and the games read. */
async function visit(teamId = "t4", { screen = "overview", season = OUTSIDE, phone = false, teams = TEAMS } = {}) {
  width(phone);
  api.reset();
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  asked.length = 0;
  answer = true;
  state.auth.currentUser = COACH;
  state.myTeams = { items: teams, loaded: true, loading: false, error: "" };
  state.activeTeamId = teamId;
  state.data = data;
  state.season = { data: season, loaded: true, loading: false, error: "" };
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
  for (const { id, revision } of teams) api.reply(`GET /api/teams/${id}/events`, 200, { events: [], revision });
  await (screen === "matches" ? renderTeamMatches(teamId) : renderTeamOverview(teamId));
  await flush();
}

const keys = () => api.calls.map(({ key }) => key);
const posts = () => api.calls.filter(({ key }) => key === "POST /api/season/commit");
const button = () => view.querySelector("[data-season-enter]");
const call = () => button()?.closest(".g-callout") ?? null;
const lastToast = () => document.querySelectorAll("output").at(-1)?.textContent ?? "";
const press = async (element) => {
  assert.ok(element, "the control is on the page");
  fireEvent(element, "click");
  await flush();
};
const it = (name, body) => test(name, () => withoutTimers(body));

// ---------------------------------------------------------------------------
// What the call says
// ---------------------------------------------------------------------------

it("the call: enter for a team outside the season, taken when another of the coach's teams plays it, nothing in it or unread", () => {
  assert.deepEqual(seasonCallFor("t4", OUTSIDE, TEAMS), { kind: "enter", draft: true });
  assert.deepEqual(seasonCallFor("t5", OUTSIDE, TEAMS), { kind: "enter", draft: false }, "a team made before stage 12 is in the season already");
  assert.deepEqual(seasonCallFor("t4", TAKEN, TEAMS), { kind: "taken", other: "Old Guard" });
  assert.equal(seasonCallFor("t4", ENTERED, TEAMS), null, "the team is in the season");
  assert.equal(seasonCallFor("t4", null, TEAMS), null, "the season is not read: nothing is said it could contradict");
  // The other team's name is the coach's list's, the one the coach gave it last; the entry's when the list does not have it.
  assert.deepEqual(seasonCallFor("t4", TAKEN, [TEAMS[0], { ...TEAMS[1], name: "Old Guard Renamed" }]), { kind: "taken", other: "Old Guard Renamed" });
  assert.deepEqual(seasonCallFor("t4", TAKEN, []), { kind: "taken", other: "Old Guard" });
  // A withdrawn entry is outside the season: the team may be entered again (the server takes the same entry back).
  const withdrawn = { ...OUTSIDE, historicalEntries: [{ ...OURS, withdrawnAt: "2026-10-10T10:00:00Z" }] };
  assert.deepEqual(seasonCallFor("t4", withdrawn, TEAMS), { kind: "enter", draft: true });
});

it("a team outside the season is entered with one press and a question", async () => {
  await visit("t4");
  assert.equal(call().querySelector(".g-callout__title").textContent, t("teamOverview.notInSeason"));
  assert.equal(call().querySelector(".g-callout__sub").textContent, t("teamOverview.enterNote"));
  assert.equal(call().tagName, "DIV", "the call is no link: the button is its action");
  assert.equal(button().textContent.trim(), "Enter the season");
  assert.equal(button().getAttribute("type"), "button");
  assert.equal(button().getAttribute("aria-haspopup"), "dialog", "it asks first");

  // «No» sends nothing.
  answer = false;
  await press(button());
  assert.deepEqual(asked, [t("teamOverview.enterConfirm", { team: "Fresh Meat", season: "Mock Season" })]);
  assert.equal(asked[0], "Enter «Fresh Meat» in Mock Season? An administrator can move the team into the season.");
  assert.deepEqual(posts(), []);

  // «Yes»: one entry, however many presses while it is on its way.
  answer = true;
  const gate = api.hold("POST /api/season/commit");
  api.reply("POST /api/season/commit", 201, ENTERED);
  api.reply("GET /api/teams", 200, { teams: [{ ...TEAMS[0], inActiveSeason: true }, TEAMS[1]] });
  await press(button());
  assert.equal(button().getAttribute("aria-busy"), "true", "the press on its way is said");
  await press(button());
  await press(button());
  assert.equal(asked.length, 2, "a press while the entry is on its way asks nothing more");
  assert.equal(posts().length, 1);
  assert.deepEqual(posts()[0].body, { teamId: "t4" });
  gate.release();
  await flush();
  assert.deepEqual(keys(), ["POST /api/season/commit", "GET /api/teams"], "the season is the answer; the coach's teams are read again");
  assert.equal(state.season.data, ENTERED);
  assert.equal(button(), null, "the call is gone: the team is in the season");
  assert.equal(view.querySelector(".g-callout"), null);
  assert.equal(lastToast(), t("teamOverview.entered", { team: "Fresh Meat" }));
  assert.equal(document.activeElement, view.querySelector("h1"), "the button went with the call: the focus on the title");
  api.assertAnswered();
});

it("an active team (made before stage 12) is not told an administrator moves it into the season: it is in it already", async () => {
  await visit("t5");
  assert.equal(call().querySelector(".g-callout__sub"), null, "no note under the call");
  answer = false;
  await press(button());
  assert.deepEqual(asked, [t("teamOverview.enterConfirmActive", { team: "Old Guard", season: "Mock Season" })]);
  assert.equal(asked[0], "Enter «Old Guard» in Mock Season?");
  assert.deepEqual(posts(), []);
});

it("a stale «Enter the season» (the entry went in from another page) draws the page as it is, sending nothing", async () => {
  await visit("t4");
  state.season.data = ENTERED;
  answer = true;
  await press(button());
  assert.deepEqual(asked, [], "nothing asked");
  assert.deepEqual(posts(), []);
  assert.equal(button(), null, "the call is gone");
});

it("«Matches» has the same call, on a phone and on a desk", async () => {
  for (const phone of [true, false]) {
    await visit("t4", { screen: "matches", phone });
    assert.equal(call().querySelector(".g-callout__title").textContent, t("teamOverview.notInSeason"));
    api.reply("POST /api/season/commit", 201, ENTERED);
    api.reply("GET /api/teams", 200, { teams: TEAMS });
    await press(button());
    assert.equal(posts().length, 1, phone ? "phone" : "desk");
    assert.equal(button(), null);
  }
});

it("a coach whose other team plays this season is told so, with no button", async () => {
  for (const screen of ["overview", "matches"]) {
    for (const phone of [true, false]) {
      await visit("t4", { screen, phone, season: TAKEN });
      const callout = view.querySelector(".g-callout");
      assert.equal(callout.querySelector(".g-callout__title").textContent, t("teamOverview.notInSeason"), `${screen} ${phone}`);
      assert.equal(callout.querySelector(".g-callout__sub").textContent, "«Old Guard» plays this season: one team per coach in a season.");
      assert.equal(callout.querySelector(".g-callout__sub").textContent, t("teamOverview.enterTaken", { other: "Old Guard" }));
      assert.equal(button(), null);
      assert.equal(callout.tagName, "DIV", "and no link to a screen that would enter it");
    }
  }
});

it("a lost answer reads the season and the teams again, and sends nothing twice", async () => {
  await visit("t4");
  api.fail("POST /api/season/commit");
  api.reply("GET /api/season", 200, ENTERED);
  api.reply("GET /api/teams", 200, { teams: TEAMS });
  await press(button());
  assert.deepEqual(keys(), ["POST /api/season/commit", "GET /api/season", "GET /api/teams"], "read again, never sent twice");
  assert.equal(lastToast(), t("teamOverview.enterUnknown"));
  assert.equal(button(), null, "the season read again holds the entry: the call is gone");

  // The season read again without it: the call stays, and a new press is a new entry the coach chose to send.
  await visit("t4");
  api.fail("POST /api/season/commit");
  api.reply("GET /api/season", 200, OUTSIDE);
  api.reply("GET /api/teams", 200, { teams: TEAMS });
  await press(button());
  assert.equal(posts().length, 1);
  assert.ok(button(), "the call is still there");
  assert.equal(button().getAttribute("aria-busy"), null);
});

it("an answer that is no season reads it again: the entry is said made only when the season holds it", async () => {
  for (const [season, made] of [[ENTERED, true], [OUTSIDE, false]]) {
    await visit("t4");
    api.reply("POST /api/season/commit", 200, {});
    api.reply("GET /api/season", 200, season);
    api.reply("GET /api/teams", 200, { teams: TEAMS });
    await press(button());
    assert.deepEqual(keys(), ["POST /api/season/commit", "GET /api/season", "GET /api/teams"]);
    assert.equal(lastToast(), made ? t("teamOverview.entered", { team: "Fresh Meat" }) : t("teamOverview.enterUnknown"));
    assert.equal(Boolean(button()), !made);
  }
});

it("a refusal is the server's words, and the season is read again when it has moved", async () => {
  await visit("t4");
  api.reply("POST /api/season/commit", 409, { error: { code: "ENTRY_ALREADY_COMMITTED" } });
  api.reply("GET /api/season", 200, TAKEN);
  await press(button());
  assert.equal(lastToast(), t("error.ENTRY_ALREADY_COMMITTED"));
  assert.deepEqual(keys(), ["POST /api/season/commit", "GET /api/season"], "another tab may have entered a team: the season as it is now");
  assert.equal(button(), null, "another team of the coach plays: the call says so, with no button");
  assert.equal(view.querySelector(".g-callout__sub").textContent, t("teamOverview.enterTaken", { other: "Old Guard" }));

  await visit("t4");
  api.reply("POST /api/season/commit", 404, { error: { code: "SAVED_TEAM_NOT_FOUND" } });
  await press(button());
  assert.equal(lastToast(), t("error.SAVED_TEAM_NOT_FOUND"));
  assert.deepEqual(keys(), ["POST /api/season/commit"], "any other refusal changed nothing: nothing read again");
  assert.ok(button());
});

it("another coach's token sends nothing", async () => {
  await visit("t4");
  api.items.set(TOKEN, "another");
  await press(button());
  assert.deepEqual(posts(), []);
  assert.equal(lastToast(), t("auth.otherTab"));
});

it("one entry at a time, whoever asks", async () => {
  await visit("t4");
  const gate = api.hold("POST /api/season/commit");
  api.reply("POST /api/season/commit", 201, ENTERED);
  api.reply("GET /api/teams", 200, { teams: TEAMS });
  const first = enterSeason("t4");
  assert.deepEqual(await enterSeason("t5"), { refusal: "" }, "a second while the first is on its way sends nothing and says nothing");
  gate.release();
  assert.deepEqual(await first, { entered: true });
  assert.equal(posts().length, 1);
  // Signed out while it was on its way: the answer is not put in place for whoever is on the page now.
  await visit("t4");
  const held = api.hold("POST /api/season/commit");
  api.reply("POST /api/season/commit", 201, ENTERED);
  api.reply("GET /api/season", 200, OUTSIDE);
  const outcome = enterSeason("t4");
  state.auth.currentUser = { ...COACH, id: "u9", login: "other" };
  held.release();
  await outcome;
  assert.notEqual(state.season.data, ENTERED, "the answer was the coach's who sent it");
});

// ---------------------------------------------------------------------------
// The rules every screen owes
// ---------------------------------------------------------------------------

it("names are text", () => {
  const hostile = [{ ...TEAMS[0], name: HOSTILE }, { ...TEAMS[1], name: HOSTILE }];
  for (const markup of [enterCallMarkup({ kind: "enter", draft: true }), enterCallMarkup({ kind: "taken", other: HOSTILE }), enterCallMarkup({ kind: "enter", draft: true }, true)]) {
    const fragment = mount(markup);
    assert.equal(fragment.querySelector("img"), null);
    assertCspSafe(fragment);
  }
  assert.ok(mount(enterCallMarkup(seasonCallFor("t4", TAKEN, hostile))).textContent.includes(HOSTILE));
  assert.equal(enterCallMarkup(null), "", "no call, nothing drawn");
});

it("styled: the call and its button are the components'", () => {
  assertStyled(mount(enterCallMarkup({ kind: "enter", draft: true })), "callout.css", "button.css");
  assertStyled(mount(enterCallMarkup({ kind: "taken", other: "Old Guard" })), "callout.css");
  // The button is the component's outline one: 44px on both widths (D2: a desk's target is at least 24px, a phone's 44px).
  assert.match(text("src/ui/button.css"), /\.g-btn \{[^}]*min-height: var\(--size-touch\)/);
  assert.match(text("src/styles/tokens.css"), /--size-touch: 44px;/);
});

it("every key in both dictionaries, in the words of the plan", () => {
  assertDictionaryCovers("src/data/season-entry.mjs", "src/screens/season/enter.mjs", "src/screens/team/overview.mjs", "src/screens/matches/index.mjs");
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  const WORDS = {
    "teamOverview.enter": ["Enter the season", "Заявить в сезон"],
    "teamOverview.enterConfirm": ["Enter «{team}» in {season}? An administrator can move the team into the season.",
      "Заявить «{team}» в {season}? Перевести команду в сезон может администратор."],
    "teamOverview.enterNote": ["An administrator can move the team into the season.", "Перевести команду в сезон может администратор."],
    "teamOverview.enterConfirmActive": ["Enter «{team}» in {season}?", "Заявить «{team}» в {season}?"],
    "teamOverview.enterTaken": ["«{other}» plays this season: one team per coach in a season.", "В этом сезоне играет «{other}»: одна команда тренера на сезон."],
  };
  for (const [key, words] of Object.entries(WORDS)) assert.deepEqual([en[key], ru[key]], words, key);
  for (const key of ["teamOverview.entered", "teamOverview.enterUnknown"]) {
    assert.ok(en[key], `en ${key}`);
    assert.ok(ru[key], `ru ${key}`);
  }
  assert.equal(en["teamOverview.notInSeasonSub"], undefined, "the call no longer sends the coach to a season screen that enters");
  assert.equal(ru["teamOverview.notInSeasonSub"], undefined);
});
