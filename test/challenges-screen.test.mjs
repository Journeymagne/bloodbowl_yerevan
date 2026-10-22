import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertDictionaryCovers, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { expandCollections } from "../src/data/reference.mjs";

// The API is installed before anything that asks it is imported: the client picks up `fetch` as it loads.
const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/t/t1/challenges", replace() {} };
/** Every address the screen put in place of the one there (`history.replaceState`): no draw, no step in the history. */
const replaced = [];
globalThis.history = { replaceState: (data, unused, url) => { replaced.push(url); } };
const { renderTeamChallenges } = await import("../src/screens/matches/challenges.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
/** announce() writes on a zero timeout: one is let pass. */
const afterAnnouncements = async () => { await settle(); await new Promise((resolve) => { setTimeout(resolve, 5); }); };
/** What the live region says: the status regions outside the page. */
const spoken = () => document.querySelectorAll('[role="status"]').filter((node) => !view.contains(node)).map((node) => node.textContent).join("|");
const silence = async () => {
  await afterAnnouncements();
  for (const node of document.querySelectorAll('[role="status"]')) if (!view.contains(node)) node.textContent = "";
};

/** A moment `days` ago. */
const ago = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

const ME = { id: "u1", login: "coach" };
const coachOf = (id, login, teams) => ({ id, login, teams: teams.map(([teamId, name, slug]) => ({ id: teamId, name, baseTeamSlug: slug })) });
const RIVAL = coachOf("u2", "rival", [["rt1", "Rival Team", "teams/dwarf"], ["rt2", "Rival Raiders", "teams/skaven"]]);
const NAREK = coachOf("u3", "narek", [["n1", "Ararat Lions", "teams/human"], ["n2", "Sevan Raiders", "teams/orc"]]);
const LILIT = coachOf("u4", "lilit", [["l1", "Silverbrook Rangers", "teams/wood-elf"]]);
const ORC_BOSS = coachOf("u5", "orc_boss", [["r1", "Grimtusk Raiders", "teams/orc"]]);
const OPPONENTS = [LILIT, NAREK, ORC_BOSS, RIVAL];
const T1 = { id: "t1", name: "Mock Team", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true, roster: {} };
const T2 = { id: "t2", name: "Mock Humans", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: false, roster: {} };

const named = ({ id, login }) => ({ id, login });
const teamOf = ({ id, name, baseTeamSlug }) => ({ id, name, baseTeamSlug });
/** A challenge as `GET /api/challenges` sends it. */
const challenge = (id, from, to, team, over = {}) => ({
  id, sender: named(from), recipient: named(to), team: teamOf(team), status: "pending", gameId: null, createdAt: ago(1), updatedAt: ago(1), ...over,
});
// orc_boss challenged the coach yesterday with Grimtusk Raiders; the coach challenged lilit with Mock Team.
const INCOMING = challenge("c1", ORC_BOSS, ME, ORC_BOSS.teams[0]);
const OUTGOING = challenge("c2", ME, LILIT, T1);
const CHALLENGES = [INCOMING, OUTGOING];
/** The challenges with some of them changed, by id. */
const changed = (changes, challenges = CHALLENGES) => challenges.map((item) => (changes[item.id] ? { ...item, ...changes[item.id] } : item));

/** Eleven linemen and two rerolls: a value the reference prices. */
const ROSTER = { rerolls: 2, players: Array.from({ length: 11 }, (_, at) => ({ id: `p${at}`, rowIndex: 0, number: String(at + 1), name: `P${at}` })) };
const CHALLENGER_PAGE = "GET /api/players/u5/teams/r1";
const CHALLENGER = { user: { id: "u5", login: "orc_boss", telegram: "@orc_boss" }, team: { id: "r1", name: "Grimtusk Raiders", baseTeamSlug: "teams/orc", roster: ROSTER }, rolls: [] };

/** The server's answer to the list. */
const list = (challenges, opponents = OPPONENTS) => api.reply("GET /api/challenges", 200, { challenges, teams: [], opponents });
const refusal = (code) => ({ error: { code, message: code } });

/** The phone's media query, which the test answers and changes. */
function width(phone) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return { cross: (next) => { media.matches = next; listeners.forEach((listener) => listener()); } };
}

/** A coach signed in with two teams; the challenges, the games and the challenger's team answer. */
function coach({ challenges = CHALLENGES, games = [] } = {}) {
  api.reset();
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  state.data = data;
  state.auth.currentUser = { ...ME, preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: [T1, T2], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.games = { items: [], currentItems: [], loaded: false, loading: false, error: "" };
  list(challenges);
  api.reply("GET /api/games", 200, { games, currentGames: [] });
  api.reply(CHALLENGER_PAGE, 200, CHALLENGER);
  replaced.length = 0;
  location.hash = "#/t/t1/challenges";
}

/** The challenges of t1, on a phone unless told otherwise, every read answered. */
async function visit({ phone = true, preset = "", ...over } = {}) {
  const screen = width(phone);
  coach(over);
  await renderTeamChallenges("t1", preset);
  await settle();
  return screen;
}

function leave() {
  releaseCurrentScreen();
  delete globalThis.matchMedia;
}

const sent = (key) => api.calls.filter((call) => call.key === key);
const click = (selector) => fireEvent(view.querySelector(selector), "click");
const sheetOf = (id) => view.querySelector(`dialog#${id}`);
const sendSheet = () => sheetOf("friendly-send");
const acceptSheet = () => sheetOf("friendly-accept");
/** A coach's row in the challenge sheet's radio group. */
const row = (id) => view.querySelector(`#friendly-send .g-challenge__group [data-friendly-pick="${id}"]`);
const teamSegment = (id) => view.querySelector(`#friendly-send [data-friendly-team="${id}"]`);
const cta = () => view.querySelector("#friendly-send [data-friendly-challenge]");
const title = () => view.querySelector("h1");
const words = (selector) => view.querySelectorAll(selector).map((node) => node.textContent);
/** What the page says above its sections: the reads that failed and a write refused. */
const alerts = () => view.querySelector(".g-friendly__failed")?.textContent ?? "";

test("the page reads the challenges and the games and draws them; the tab seen again reads them again", async () => {
  const events = new EventTarget();
  Object.assign(document, { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), visibilityState: "visible" });
  try {
    width(true);
    coach({
      challenges: [...CHALLENGES, challenge("c3", ME, RIVAL, T1, { status: "accepted", gameId: "g7", updatedAt: ago(0) }), challenge("c4", NAREK, ME, NAREK.teams[0], { status: "declined" })],
      games: [{
        id: "g7", kind: "friendly", season: null, roundNumber: 0, roundStatus: null, resultStatus: "pending", preparationStatus: "not_started",
        postMatchStatus: "not_started", homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null, proposedByUserId: null,
        viewerIsProposer: false, createdAt: ago(0), updatedAt: ago(0), home: { user: ME, team: teamOf(T1) }, away: { user: named(RIVAL), team: RIVAL.teams[0] },
      }],
    });
    // While the challenges are on their way the page says so, its title holding the focus.
    const reading = api.hold("GET /api/challenges");
    const drawn = renderTeamChallenges("t1");
    assert.equal(view.querySelector(".g-friendly__loading").textContent, t("friendly.loading"));
    assert.ok(document.activeElement === title(), "the title takes the focus");
    assert.equal(view.querySelector("[data-friendly-send]").hasAttribute("disabled"), true, "nobody to challenge before the list is read");
    reading.release();
    await drawn;
    await settle();
    assert.equal(sent("GET /api/challenges").length, 1);
    assert.equal(sent("GET /api/games").length, 1);
    assert.equal(title().textContent, "Friendlies");
    assert.equal(view.querySelector('[data-friendly-accept="c1"]').textContent, "Accept…");
    assert.deepEqual(words(".g-friendly__login"), ["orc_boss", "lilit"]);
    assert.equal(view.querySelector(".g-friendly__item--accepted .g-btn--primary").getAttribute("href"), "#/games/g7/pre-match", "the match the games name");
    assert.equal(view.querySelector("[data-friendly-send]").hasAttribute("disabled"), false);
    // The history is folded until it is opened, and its button keeps the focus.
    const fold = view.querySelector("[data-friendly-history]");
    fold.focus();
    fireEvent(fold, "click");
    assert.equal(view.querySelector("[data-friendly-history]").getAttribute("aria-expanded"), "true");
    assert.equal(view.querySelector("#friendly-history").hasAttribute("hidden"), false);
    assert.ok(document.activeElement === view.querySelector("[data-friendly-history]"));
    // A tab put away reads nothing; seen again, it reads both.
    document.visibilityState = "hidden";
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(sent("GET /api/challenges").length, 1);
    document.visibilityState = "visible";
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(sent("GET /api/challenges").length, 2);
    assert.equal(sent("GET /api/games").length, 2);
    leave();
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(sent("GET /api/challenges").length, 2, "a page left reads nothing");
    api.assertAnswered();
  } finally {
    leave();
    for (const name of ["addEventListener", "removeEventListener", "visibilityState"]) delete document[name];
  }
});

test("a list that could not be read says why with Refresh, which reads it again", async () => {
  try {
    width(true);
    coach();
    api.fail("GET /api/challenges");
    await renderTeamChallenges("t1", "u3");
    await settle();
    assert.ok(alerts().includes(t("friendly.unread", { reason: t("request.offline") })));
    assert.equal(view.querySelector("[data-friendly-send]").hasAttribute("disabled"), true);
    assert.equal(sendSheet(), null, "no sheet for the coach the address names before there is anyone to offer");
    list(CHALLENGES);
    click("[data-friendly-retry]");
    await settle();
    assert.equal(sent("GET /api/challenges").length, 2);
    assert.equal(alerts(), "");
    assert.ok(view.querySelector('[data-friendly-accept="c1"]'));
    assert.ok(sendSheet()?.isModal, "the coach the address names is offered once the list is read");
    assert.equal(row("u3").getAttribute("aria-checked"), "true");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a second press while the challenge is on its way sends nothing", async () => {
  try {
    await visit();
    await silence();
    click("[data-friendly-send]");
    assert.ok(sendSheet()?.isModal);
    fireEvent(row("u2"), "click");
    assert.equal(cta().textContent, "Challenge rival");
    const sending = api.hold("POST /api/challenges");
    api.reply("POST /api/challenges", 201, { id: "c9" });
    click("[data-friendly-challenge]");
    click("[data-friendly-challenge]");
    await settle();
    assert.equal(sent("POST /api/challenges").length, 1);
    assert.deepEqual(sent("POST /api/challenges")[0].body, { opponentId: "u2", teamId: "t1" });
    assert.equal(cta().getAttribute("aria-busy"), "true", "the button says it is on its way");
    list([...CHALLENGES, challenge("c9", ME, RIVAL, T1, { createdAt: ago(0) })]);
    sending.release();
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges").length, 1);
    assert.equal(sent("GET /api/challenges").length, 2, "the list is read after it");
    assert.equal(sendSheet(), null, "the sheet is closed");
    assert.ok(document.activeElement === view.querySelector("[data-friendly-send]"));
    assert.ok(words(".g-friendly__login").includes("rival"), "the challenge sent is among the outgoing");
    await afterAnnouncements();
    assert.equal(spoken(), "Challenge sent: rival");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a lost send is not sent again: the list is read and says what came of it", async () => {
  try {
    // It went: the list read again names it.
    await visit();
    await silence();
    click("[data-friendly-send]");
    fireEvent(row("u2"), "click");
    api.fail("POST /api/challenges");
    list([...CHALLENGES, challenge("c9", ME, RIVAL, T1, { createdAt: ago(0) })]);
    click("[data-friendly-challenge]");
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges").length, 1);
    assert.equal(sent("GET /api/challenges").length, 2);
    assert.equal(sendSheet(), null);
    await afterAnnouncements();
    assert.equal(spoken(), "Challenge sent: rival");
    // It did not: the sheet says so, and nothing is sent again by itself.
    await visit();
    click("[data-friendly-send]");
    fireEvent(row("u2"), "click");
    api.fail("POST /api/challenges");
    click("[data-friendly-challenge]");
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges").length, 1);
    assert.equal(sent("GET /api/challenges").length, 2);
    assert.ok(sendSheet()?.isModal, "the sheet stays open");
    const said = view.querySelector("#friendly-send .g-challenge__refusal");
    assert.equal(said.textContent, t("friendly.lost"));
    assert.equal(said.getAttribute("role"), "alert");
    assert.equal(row("u2").getAttribute("aria-checked"), "true", "the choice stays: a press sends it, nothing else does");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("CHALLENGE_ALREADY_SENT from another device: the sheet says it, the list is read, the coach is busy", async () => {
  try {
    await visit();
    click("[data-friendly-send]");
    fireEvent(row("u2"), "click");
    api.reply("POST /api/challenges", 409, refusal("CHALLENGE_ALREADY_SENT"));
    list([...CHALLENGES, challenge("c9", ME, RIVAL, T1, { createdAt: ago(0) })]);
    cta().focus();
    click("[data-friendly-challenge]");
    await settle();
    await settle();
    assert.ok(sendSheet()?.isModal);
    assert.equal(view.querySelector("#friendly-send .g-challenge__refusal").textContent, t("error.CHALLENGE_ALREADY_SENT"));
    assert.ok(document.activeElement === view.querySelector("#friendly-search"), "the button under the focus is closed: the focus goes to the search");
    assert.equal(sent("GET /api/challenges").length, 2);
    assert.equal(row("u2").getAttribute("aria-disabled"), "true");
    assert.equal(row("u2").getAttribute("aria-checked"), "false");
    assert.equal(row("u2").querySelector(".g-challenge__busy").textContent, "Challenge sent");
    assert.equal(cta().textContent, "Choose an opponent");
    assert.equal(cta().hasAttribute("disabled"), true);
    // Another team may challenge him.
    fireEvent(teamSegment("t2"), "click");
    assert.equal(row("u2").getAttribute("aria-disabled"), null);
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("accept: the team picked, one request with it, the games read again, the address is the new match's preparation", async () => {
  try {
    await visit();
    click('[data-friendly-accept="c1"]');
    await settle();
    assert.ok(acceptSheet()?.isModal);
    assert.equal(view.querySelector('[data-friendly-own="t1"]').getAttribute("aria-checked"), "true", "the page's team by default");
    fireEvent(view.querySelector('[data-friendly-own="t2"]'), "click");
    assert.equal(view.querySelector('[data-friendly-own="t2"]').getAttribute("aria-checked"), "true");
    api.reply("POST /api/challenges/c1/accept", 200, { gameId: "g9" });
    click("[data-friendly-confirm]");
    click("[data-friendly-confirm]");
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges/c1/accept").length, 1);
    assert.deepEqual(sent("POST /api/challenges/c1/accept")[0].body, { teamId: "t2" });
    assert.equal(location.hash, "#/games/g9/pre-match");
    assert.equal(sent("GET /api/games").length, 2, "the games are read again: the friendly is one of them");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("an accept whose answer was lost goes to the match the list now names", async () => {
  try {
    await visit();
    click('[data-friendly-accept="c1"]');
    await settle();
    api.fail("POST /api/challenges/c1/accept");
    list(changed({ c1: { status: "accepted", gameId: "g9", updatedAt: ago(0) } }));
    click("[data-friendly-confirm]");
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges/c1/accept").length, 1);
    assert.equal(sent("GET /api/challenges").length, 2);
    assert.equal(location.hash, "#/games/g9/pre-match");
    assert.equal(sent("GET /api/games").length, 2);
    // Not accepted after all: the sheet says no answer came, and nothing is sent again.
    await visit();
    click('[data-friendly-accept="c1"]');
    await settle();
    api.fail("POST /api/challenges/c1/accept");
    click("[data-friendly-confirm]");
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges/c1/accept").length, 1);
    assert.equal(location.hash, "#/t/t1/challenges");
    assert.ok(acceptSheet()?.isModal);
    assert.equal(view.querySelector("#friendly-accept .g-challenge__refusal").textContent, t("friendly.lost"));
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("an accept lost whose list could not be read again says so; a later read goes to the match it names, or says it is closed", async () => {
  const events = new EventTarget();
  Object.assign(document, { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), visibilityState: "visible" });
  /** The accept of c1 pressed, its answer lost and the list read after it failing. */
  const lostUnread = async () => {
    await visit();
    click('[data-friendly-accept="c1"]');
    await settle();
    api.fail("POST /api/challenges/c1/accept");
    api.fail("GET /api/challenges");
    click("[data-friendly-confirm]");
    await settle();
    await settle();
    assert.equal(sent("GET /api/challenges").length, 2);
    assert.ok(acceptSheet()?.isModal, "the sheet stays: what came of it is not known");
    assert.equal(view.querySelector("#friendly-accept .g-challenge__refusal").textContent, t("friendly.lostUnread"), "not that the list was read");
  };
  try {
    // The tab seen again: the list names c1 accepted — it goes to its match, as the answer would have.
    await lostUnread();
    list(changed({ c1: { status: "accepted", gameId: "g9", updatedAt: ago(0) } }));
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    await settle();
    assert.equal(location.hash, "#/games/g9/pre-match");
    assert.equal(sent("POST /api/challenges/c1/accept").length, 1, "never sent again");
    // Or it names c1 cancelled: the sheet closes, the page saying so — not that no answer came.
    await lostUnread();
    list(changed({ c1: { status: "cancelled", updatedAt: ago(0) } }));
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    await settle();
    assert.ok(acceptSheet() === null);
    assert.equal(location.hash, "#/t/t1/challenges");
    assert.ok(alerts().includes(t("error.CHALLENGE_CLOSED")));
    assert.ok(!alerts().includes(t("friendly.lostUnread")));
    api.assertAnswered();
  } finally {
    leave();
    for (const name of ["addEventListener", "removeEventListener", "visibilityState"]) delete document[name];
  }
});

test("a challenge cancelled meanwhile: the accept is refused in the server's words, the list is read again, the sheet closes", async () => {
  try {
    for (const code of ["CHALLENGE_CLOSED", "CHALLENGE_NOT_FOUND"]) {
      await visit();
      const button = view.querySelector('[data-friendly-accept="c1"]');
      button.focus();
      fireEvent(button, "click");
      await settle();
      api.reply("POST /api/challenges/c1/accept", code === "CHALLENGE_CLOSED" ? 409 : 404, refusal(code));
      list(code === "CHALLENGE_CLOSED" ? changed({ c1: { status: "cancelled", updatedAt: ago(0) } }) : [OUTGOING]);
      click("[data-friendly-confirm]");
      await settle();
      await settle();
      assert.equal(acceptSheet(), null, `${code}: the sheet closes`);
      assert.equal(sent("GET /api/challenges").length, 2);
      assert.ok(alerts().includes(t(`error.${code}`)), "said on the page, where it is seen");
      assert.equal(view.querySelector(".g-friendly__failed").getAttribute("role"), "alert");
      assert.equal(view.querySelector('[data-friendly-accept="c1"]'), null, "its card is gone");
      assert.ok(document.activeElement === title(), "the button that opened it is gone: the title");
      assert.equal(location.hash, "#/t/t1/challenges");
    }
    // The next action takes the words away.
    click("[data-friendly-send]");
    assert.equal(alerts(), "");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a challenge that stops waiting while its sheet is open closes it, the page saying why", async () => {
  const events = new EventTarget();
  Object.assign(document, { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), visibilityState: "visible" });
  try {
    await visit();
    click('[data-friendly-accept="c1"]');
    await settle();
    list(changed({ c1: { status: "cancelled", updatedAt: ago(0) } }));
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(acceptSheet(), null);
    assert.ok(alerts().includes(t("error.CHALLENGE_CLOSED")));
    assert.ok(document.activeElement === title());
    api.assertAnswered();
  } finally {
    leave();
    for (const name of ["addEventListener", "removeEventListener", "visibilityState"]) delete document[name];
  }
});

test("a write whose sheet was closed meanwhile says what came of it on the page, and leaves the focus alone", async () => {
  try {
    await visit();
    click('[data-friendly-accept="c1"]');
    await settle();
    const accepting = api.hold("POST /api/challenges/c1/accept");
    api.reply("POST /api/challenges/c1/accept", 409, refusal("CHALLENGE_CLOSED"));
    list(changed({ c1: { status: "cancelled", updatedAt: ago(0) } }));
    click("[data-friendly-confirm]");
    fireEvent(acceptSheet(), "keydown", { key: "Escape" });
    assert.equal(acceptSheet(), null);
    const send = view.querySelector("[data-friendly-send]");
    send.focus();
    accepting.release();
    await settle();
    await settle();
    assert.ok(alerts().includes(t("error.CHALLENGE_CLOSED")));
    assert.ok(document.activeElement === view.querySelector("[data-friendly-send]"), "the focus stays where the coach put it");
    // The challenge sheet closed while its challenge was on its way: the refusal is said on the page.
    click("[data-friendly-send]");
    fireEvent(row("u2"), "click");
    const sending = api.hold("POST /api/challenges");
    api.reply("POST /api/challenges", 404, refusal("CHALLENGE_OPPONENT_UNAVAILABLE"));
    click("[data-friendly-challenge]");
    fireEvent(sendSheet(), "keydown", { key: "Escape" });
    sending.release();
    await settle();
    await settle();
    assert.equal(sendSheet(), null);
    assert.ok(alerts().includes(t("error.CHALLENGE_OPPONENT_UNAVAILABLE")));
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("decline and cancel: one request each; the card goes and the focus is on the title", async () => {
  try {
    await visit();
    await silence();
    api.reply("POST /api/challenges/c1/decline", 200, {});
    const declined = changed({ c1: { status: "declined", updatedAt: ago(0) } });
    list(declined);
    const decline = view.querySelector('[data-friendly-answer="decline"]');
    assert.equal(decline.getAttribute("data-friendly-id"), "c1");
    decline.focus();
    fireEvent(decline, "click");
    fireEvent(decline, "click");
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges/c1/decline").length, 1);
    assert.deepEqual(sent("POST /api/challenges/c1/decline")[0].body, {});
    assert.equal(sent("GET /api/challenges").length, 2);
    assert.equal(view.querySelector('[data-friendly-accept="c1"]'), null);
    assert.ok(document.activeElement === title());
    await afterAnnouncements();
    assert.equal(spoken(), "Challenge declined");
    api.reply("POST /api/challenges/c2/cancel", 200, {});
    list(changed({ c2: { status: "cancelled", updatedAt: ago(0) } }, declined));
    const cancel = view.querySelector('[data-friendly-answer="cancel"]');
    assert.equal(cancel.textContent, "Cancel the challenge");
    cancel.focus();
    fireEvent(cancel, "click");
    fireEvent(cancel, "click");
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges/c2/cancel").length, 1);
    assert.deepEqual(sent("POST /api/challenges/c2/cancel")[0].body, {});
    assert.equal(view.querySelector('[data-friendly-answer="cancel"]'), null);
    assert.ok(document.activeElement === title());
    await afterAnnouncements();
    assert.equal(spoken(), "Challenge cancelled");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a decline or a cancel on its way: its button is busy and keeps the focus, the page's other buttons are closed", async () => {
  try {
    for (const [action, id, status] of [["decline", "c1", "declined"], ["cancel", "c2", "cancelled"]]) {
      await visit();
      const key = `POST /api/challenges/${id}/${action}`;
      const answering = api.hold(key);
      api.reply(key, 200, {});
      list(changed({ [id]: { status, updatedAt: ago(0) } }));
      const button = () => view.querySelector(`[data-friendly-answer="${action}"][data-friendly-id="${id}"]`);
      const pressed = button();
      pressed.focus();
      fireEvent(pressed, "click");
      await settle();
      assert.ok(button() === pressed, `${action}: the same button, still in the page`);
      assert.deepEqual([pressed.getAttribute("aria-busy"), pressed.getAttribute("aria-disabled"), pressed.hasAttribute("disabled")], ["true", "true", false],
        `${action}: busy, and not disabled, which would take the focus from it`);
      assert.ok(document.activeElement === pressed, `${action}: the focus stays on it`);
      const others = [...view.querySelectorAll("[data-friendly-send]"), ...view.querySelectorAll("[data-friendly-accept]"), ...view.querySelectorAll("[data-friendly-answer]")]
        .filter((other) => other !== pressed);
      assert.equal(others.length, 3);
      for (const other of others) {
        assert.deepEqual([other.getAttribute("aria-disabled"), other.getAttribute("aria-busy")], ["true", null], `${action}: «${other.textContent}» closed`);
      }
      // A press of another one while it is on its way sends nothing.
      fireEvent(others.find((other) => other.hasAttribute("data-friendly-answer")), "click");
      answering.release();
      await settle();
      await settle();
      assert.deepEqual(api.calls.filter((call) => call.key.startsWith("POST")).map((call) => call.key), [key]);
      assert.ok(button() === null, `${action}: its card is gone`);
      assert.equal(view.querySelectorAll("[aria-disabled]").length + view.querySelectorAll("[aria-busy]").length, 0, `${action}: done, every button open again`);
    }
    api.assertAnswered();
  } finally {
    leave();
  }
});

/** Two challenges each way: narek's c5 came before orc_boss's c1, the coach's c6 to rival before his c2 to lilit. */
const TWO_EACH_WAY = [...CHALLENGES, challenge("c5", NAREK, ME, NAREK.teams[0], { createdAt: ago(2) }), challenge("c6", ME, RIVAL, T1, { createdAt: ago(2) })];

test("decline and cancel with another card under the one pressed: the focus goes to the title, never to that card's button", async () => {
  try {
    for (const phone of [true, false]) {
      const form = phone ? "phone" : "desk";
      await visit({ phone, challenges: TWO_EACH_WAY });
      api.reply("POST /api/challenges/c1/decline", 200, {});
      const declined = changed({ c1: { status: "declined", updatedAt: ago(0) } }, TWO_EACH_WAY);
      list(declined);
      const decline = view.querySelector('[data-friendly-answer="decline"]');
      assert.equal(decline.getAttribute("data-friendly-id"), "c1", "the newest first");
      decline.focus();
      fireEvent(decline, "click");
      await settle();
      await settle();
      assert.ok(view.querySelector('[data-friendly-accept="c1"]') === null);
      assert.ok(view.querySelector('[data-friendly-answer="decline"][data-friendly-id="c5"]'), "narek's card stays");
      assert.ok(document.activeElement === title(), `${form}: the title, not narek's «Decline»`);
      api.reply("POST /api/challenges/c2/cancel", 200, {});
      list(changed({ c2: { status: "cancelled", updatedAt: ago(0) } }, declined));
      const cancel = view.querySelector('[data-friendly-answer="cancel"]');
      assert.equal(cancel.getAttribute("data-friendly-id"), "c2");
      cancel.focus();
      fireEvent(cancel, "click");
      await settle();
      await settle();
      assert.ok(view.querySelector('[data-friendly-answer="cancel"][data-friendly-id="c6"]'), "the challenge to rival stays");
      assert.ok(document.activeElement === title(), `${form}: the title, not the «Cancel» of the challenge to rival`);
      assert.deepEqual(api.calls.filter(({ key }) => key.startsWith("POST")).map(({ key }) => key),
        ["POST /api/challenges/c1/decline", "POST /api/challenges/c2/cancel"]);
    }
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("while a decline or a challenge is on its way, «Accept…» and «Challenge» open nothing; once it is done, they open again", async () => {
  try {
    await visit({ challenges: TWO_EACH_WAY });
    await silence();
    const declining = api.hold("POST /api/challenges/c1/decline");
    api.reply("POST /api/challenges/c1/decline", 200, {});
    // narek cancels c5 meanwhile: the list read after the decline has neither waiting.
    list(changed({ c1: { status: "declined", updatedAt: ago(0) }, c5: { status: "cancelled", updatedAt: ago(0) } }, TWO_EACH_WAY));
    click('[data-friendly-answer="decline"]');
    click('[data-friendly-accept="c5"]');
    click('[data-friendly-accept="c1"]');
    click("[data-friendly-send]");
    await settle();
    assert.ok(view.querySelector("dialog[open]") === null, "no sheet opens while the decline is on its way");
    declining.release();
    await settle();
    await settle();
    assert.ok(view.querySelector('[data-friendly-accept="c5"]') === null);
    assert.equal(alerts(), "");
    await afterAnnouncements();
    assert.equal(spoken(), "Challenge declined");
    click("[data-friendly-send]");
    assert.ok(sendSheet()?.isModal, "«Challenge» opens its sheet again");
    // The challenge sheet closed while its challenge is on its way: the page opens nothing until it is done.
    await visit({ challenges: TWO_EACH_WAY });
    click("[data-friendly-send]");
    fireEvent(row("u3"), "click");
    const sending = api.hold("POST /api/challenges");
    api.reply("POST /api/challenges", 201, { id: "c9" });
    list([...changed({ c5: { status: "cancelled", updatedAt: ago(0) } }, TWO_EACH_WAY), challenge("c9", ME, NAREK, T1, { createdAt: ago(0) })]);
    click("[data-friendly-challenge]");
    fireEvent(sendSheet(), "keydown", { key: "Escape" });
    assert.ok(sendSheet() === null);
    click('[data-friendly-accept="c5"]');
    click("[data-friendly-send]");
    await settle();
    assert.ok(view.querySelector("dialog[open]") === null, "no sheet opens while the challenge is on its way");
    sending.release();
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges").length, 1);
    assert.ok(view.querySelector('[data-friendly-accept="c5"]') === null);
    assert.equal(alerts(), "");
    click('[data-friendly-accept="c1"]');
    await settle();
    assert.ok(acceptSheet()?.isModal, "«Accept…» opens its sheet again");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a read after a write that drops the open accept sheet's challenge closes the sheet with why; the page still opens sheets", async () => {
  try {
    await visit({ challenges: TWO_EACH_WAY });
    click('[data-friendly-accept="c1"]');
    await settle();
    assert.ok(acceptSheet()?.isModal);
    // A browser keeps the page under the open sheet out of reach; the decline pressed there stands for any write whose
    // list is read while the sheet is open. orc_boss cancels c1 meanwhile.
    api.reply("POST /api/challenges/c5/decline", 200, {});
    list(changed({ c5: { status: "declined", updatedAt: ago(0) }, c1: { status: "cancelled", updatedAt: ago(0) } }, TWO_EACH_WAY));
    click('[data-friendly-answer="decline"][data-friendly-id="c5"]');
    await settle();
    await settle();
    assert.ok(acceptSheet() === null, "the sheet closes");
    assert.ok(alerts().includes(t("error.CHALLENGE_CLOSED")), "the page says why");
    assert.ok(document.activeElement === title(), "its button is gone: the title");
    click("[data-friendly-send]");
    assert.ok(sendSheet()?.isModal, "«Challenge» opens its sheet");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a refused decline is said on the page; a lost one is read again and never sent twice", async () => {
  try {
    await visit();
    api.reply("POST /api/challenges/c1/decline", 409, refusal("CHALLENGE_CLOSED"));
    list(changed({ c1: { status: "cancelled", updatedAt: ago(0) } }));
    click('[data-friendly-answer="decline"]');
    await settle();
    await settle();
    assert.ok(alerts().includes(t("error.CHALLENGE_CLOSED")));
    assert.equal(view.querySelector('[data-friendly-accept="c1"]'), null, "the list read again has no card for it");
    // Lost, and still waiting: the page says no answer came; lost, and done: it is done.
    await visit();
    api.fail("POST /api/challenges/c1/decline");
    click('[data-friendly-answer="decline"]');
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges/c1/decline").length, 1);
    assert.ok(alerts().includes(t("friendly.lost")));
    assert.ok(view.querySelector('[data-friendly-accept="c1"]'), "the card stays");
    await silence();
    list(changed({ c1: { status: "declined", updatedAt: ago(0) } }));
    click('[data-friendly-answer="decline"]');
    await settle();
    await settle();
    assert.equal(sent("POST /api/challenges/c1/decline").length, 2, "a second press is the coach's");
    assert.equal(alerts(), "");
    assert.equal(view.querySelector('[data-friendly-accept="c1"]'), null);
    await afterAnnouncements();
    assert.equal(spoken(), "Challenge declined");
    api.assertAnswered();
  } finally {
    leave();
  }
});

/** A friendly of the coach's Mock Team against `other`'s `team`, its preparation not started, as `GET /api/games` sends it. */
const friendlyGame = (id, other, team) => ({
  id, kind: "friendly", season: null, roundNumber: 0, roundStatus: null, resultStatus: "pending", preparationStatus: "not_started",
  postMatchStatus: "not_started", homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null, proposedByUserId: null,
  viewerIsProposer: false, createdAt: ago(0), updatedAt: ago(0), home: { user: ME, team: teamOf(T1) }, away: { user: named(other), team },
});

test("a write whose list names a challenge accepted meanwhile reads the games too: its match is on the page", async () => {
  try {
    // lilit accepts the coach's c2 while he declines c1: the list read after the decline names her match, g8.
    await visit();
    api.reply("POST /api/challenges/c1/decline", 200, {});
    list(changed({ c1: { status: "declined", updatedAt: ago(0) }, c2: { status: "accepted", gameId: "g8", updatedAt: ago(0) } }));
    api.reply("GET /api/games", 200, { games: [friendlyGame("g8", LILIT, LILIT.teams[0])], currentGames: [] });
    click('[data-friendly-answer="decline"]');
    await settle();
    await settle();
    await settle();
    assert.equal(sent("GET /api/games").length, 2, "the games are read again: the list names a match they lack");
    assert.equal(view.querySelector('[data-friendly-answer="cancel"]'), null, "c2 is no longer waiting");
    assert.deepEqual(words(".g-friendly__item--accepted .g-friendly__side"), ["Mock Team", "Silverbrook Rangers"], "it is accepted, with its match");
    assert.equal(view.querySelector(".g-friendly__item--accepted .g-btn--primary").getAttribute("href"), "#/games/g8/pre-match");
    // A cancel whose list names no match the games lack reads the list alone.
    await visit();
    api.reply("POST /api/challenges/c2/cancel", 200, {});
    list(changed({ c2: { status: "cancelled", updatedAt: ago(0) } }));
    click('[data-friendly-answer="cancel"]');
    await settle();
    await settle();
    await settle();
    assert.equal(sent("GET /api/challenges").length, 2);
    assert.equal(sent("GET /api/games").length, 1, "nothing new to read in the games");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a coach named in the address is chosen when the sheet opens; closing it puts the address back without drawing again", async () => {
  const proto = Object.getPrototypeOf(view);
  const scrolled = [];
  proto.scrollIntoView = function scrollIntoView(options) { scrolled.push([this.getAttribute("data-friendly-pick"), options]); };
  try {
    await visit({ preset: "u3" });
    assert.ok(sendSheet()?.isModal, "the sheet is open at once");
    assert.equal(row("u3").getAttribute("aria-checked"), "true");
    assert.equal(row("u3").getAttribute("tabindex"), "0");
    assert.equal(cta().textContent, "Challenge narek");
    assert.deepEqual(scrolled, [["u3", { block: "nearest" }]], "and in view");
    assert.equal(view.querySelector("#friendly-send .g-challenge__note"), null);
    const reads = sent("GET /api/challenges").length;
    fireEvent(view.querySelector("#friendly-send [data-sheet-close]"), "click");
    assert.equal(sendSheet(), null);
    assert.deepEqual(replaced, ["#/t/t1/challenges"]);
    assert.equal(sent("GET /api/challenges").length, reads, "nothing is read again");
    assert.ok(document.activeElement === view.querySelector("[data-friendly-send]"));
    // Opened again by its button, the sheet has nobody chosen, and the address stays.
    click("[data-friendly-send]");
    assert.equal(view.querySelector('#friendly-send [data-friendly-pick][aria-checked="true"]'), null);
    fireEvent(view.querySelector("#friendly-send [data-sheet-close]"), "click");
    assert.deepEqual(replaced, ["#/t/t1/challenges"]);
    api.assertAnswered();
  } finally {
    delete proto.scrollIntoView;
    leave();
  }
});

test("a coach named in the address: sending puts the address back too", async () => {
  try {
    await visit({ preset: "u3" });
    api.reply("POST /api/challenges", 201, { id: "c9" });
    list([...CHALLENGES, challenge("c9", ME, NAREK, T1, { createdAt: ago(0) })]);
    click("[data-friendly-challenge]");
    await settle();
    await settle();
    assert.deepEqual(sent("POST /api/challenges")[0].body, { opponentId: "u3", teamId: "t1" });
    assert.equal(sendSheet(), null);
    assert.deepEqual(replaced, ["#/t/t1/challenges"]);
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a busy or unknown coach in the address is not chosen; the unknown one is said", async () => {
  const proto = Object.getPrototypeOf(view);
  const scrolled = [];
  proto.scrollIntoView = function scrollIntoView() { scrolled.push(this.getAttribute("data-friendly-pick")); };
  try {
    // lilit has Mock Team's challenge waiting: her chip shows, in view, and she is not chosen.
    await visit({ preset: "u4" });
    assert.ok(sendSheet()?.isModal);
    assert.deepEqual(scrolled, ["u4"]);
    assert.equal(row("u4").getAttribute("aria-checked"), "false");
    assert.equal(row("u4").getAttribute("aria-disabled"), "true");
    assert.equal(view.querySelector("#friendly-send .g-challenge__note"), null, "the chip says why");
    assert.equal(cta().hasAttribute("disabled"), true);
    for (const preset of ["u1", "zz"]) {
      await visit({ preset });
      assert.ok(sendSheet()?.isModal, preset);
      assert.equal(view.querySelector("#friendly-send .g-challenge__note").textContent, t("friendly.unknownCoach"));
      assert.equal(view.querySelector('#friendly-send [data-friendly-pick][aria-checked="true"]'), null);
      fireEvent(sendSheet(), "keydown", { key: "Escape" });
      assert.deepEqual(replaced, ["#/t/t1/challenges"]);
    }
    assert.deepEqual(scrolled, ["u4"], "no row to bring into view for a coach not offered");
    api.assertAnswered();
  } finally {
    delete proto.scrollIntoView;
    leave();
  }
});

test("typing keeps the focus in the field; Clear empties it and gives the focus back to it", async () => {
  try {
    await visit();
    click("[data-friendly-send]");
    const field = view.querySelector("#friendly-search");
    field.focus();
    field.value = "RAID";
    field.selectionStart = 4;
    field.selectionEnd = 4;
    fireEvent(field, "input");
    assert.ok(document.activeElement === view.querySelector("#friendly-search"), "the same field holds the focus");
    assert.equal(view.querySelector("#friendly-search").selectionStart, 4);
    // narek's Sevan Raiders, orc_boss's Grimtusk Raiders, rival's Rival Raiders.
    assert.deepEqual(words("#friendly-send .g-challenge__caption"), ["Found · 3"]);
    assert.deepEqual(view.querySelectorAll("#friendly-send [data-friendly-pick]").map((item) => item.getAttribute("data-friendly-pick")), ["u3", "u5", "u2"]);
    click("[data-friendly-clear]");
    assert.equal(view.querySelector("#friendly-search").value, "");
    assert.ok(document.activeElement === view.querySelector("#friendly-search"));
    assert.equal(view.querySelector("[data-friendly-clear]"), null);
    assert.ok(words("#friendly-send .g-challenge__caption").includes("Recent opponents"));
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("switching the team clears a coach now busy", async () => {
  try {
    await visit();
    click("[data-friendly-send]");
    assert.equal(teamSegment("t1").getAttribute("aria-checked"), "true", "the page's team by default");
    assert.equal(row("u4").getAttribute("aria-disabled"), "true");
    fireEvent(teamSegment("t2"), "click");
    fireEvent(row("u4"), "click");
    assert.equal(row("u4").getAttribute("aria-checked"), "true");
    assert.equal(cta().textContent, "Challenge lilit");
    assert.match(view.querySelector("#friendly-send .g-challenge__summary").textContent, /You play: Mock Humans\.$/);
    fireEvent(teamSegment("t1"), "click");
    assert.equal(row("u4").getAttribute("aria-checked"), "false");
    assert.equal(cta().textContent, "Choose an opponent");
    fireEvent(teamSegment("t2"), "click");
    assert.equal(row("u4").getAttribute("aria-checked"), "false", "let go, not chosen again by itself");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("crossing 900px keeps the sheet open with the query and the choice", async () => {
  try {
    const screen = await visit({ phone: true });
    click("[data-friendly-send]");
    const field = view.querySelector("#friendly-search");
    field.value = "a";
    fireEvent(field, "input");
    fireEvent(row("u3"), "click");
    fireEvent(teamSegment("t2"), "click");
    screen.cross(false);
    assert.ok(sendSheet()?.isModal, "still open");
    assert.equal(sendSheet().querySelector("h2").textContent, "Challenge to a friendly", "now the desk's window");
    assert.equal(view.querySelector("#friendly-search").value, "a");
    assert.equal(row("u3").getAttribute("aria-checked"), "true");
    assert.equal(teamSegment("t2").getAttribute("aria-checked"), "true");
    assert.ok(view.querySelector(".g-friendly--desk"));
    screen.cross(true);
    assert.equal(sendSheet().querySelector("h2").textContent, "Whom do we challenge");
    assert.equal(cta().textContent, "Challenge narek");
    // The accept sheet too.
    fireEvent(sendSheet(), "keydown", { key: "Escape" });
    click('[data-friendly-accept="c1"]');
    await settle();
    fireEvent(view.querySelector('[data-friendly-own="t2"]'), "click");
    screen.cross(false);
    assert.ok(acceptSheet()?.isModal);
    assert.equal(view.querySelector('[data-friendly-own="t2"]').getAttribute("aria-checked"), "true");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("crossing 900px with a recent row focused leaves the focus in the sheet", async () => {
  try {
    const screen = await visit({ phone: true });
    click("[data-friendly-send]");
    // orc_boss is a recent opponent: a row on a phone, a chip on a desk.
    const recent = row("u5");
    assert.ok(recent);
    recent.focus();
    screen.cross(false);
    assert.equal(row("u5"), null, "a chip now");
    assert.ok(view.querySelector('.g-challenge__recent [data-friendly-pick="u5"]'));
    assert.ok(sendSheet().contains(document.activeElement), "the focus is in the sheet");
    assert.ok(document.activeElement === view.querySelector("#friendly-search"));
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a desk's recent chips choose the coach; a busy one chooses nothing", async () => {
  try {
    await visit({ phone: false });
    click("[data-friendly-send]");
    const chip = (id) => view.querySelector(`.g-challenge__recent [data-friendly-pick="${id}"]`);
    fireEvent(chip("u5"), "click");
    assert.equal(chip("u5").getAttribute("aria-pressed"), "true");
    assert.equal(cta().textContent, "Challenge orc_boss");
    fireEvent(chip("u4"), "click");
    assert.equal(chip("u4").getAttribute("aria-pressed"), "false", "lilit has Mock Team's challenge waiting");
    assert.equal(cta().textContent, "Challenge orc_boss");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("closing a sheet gives the focus back to the button that opened it", async () => {
  try {
    await visit();
    const send = view.querySelector("[data-friendly-send]");
    send.focus();
    fireEvent(send, "click");
    fireEvent(sendSheet(), "keydown", { key: "Escape" });
    assert.equal(sendSheet(), null);
    assert.ok(document.activeElement === view.querySelector("[data-friendly-send]"));
    const accept = view.querySelector('[data-friendly-accept="c1"]');
    accept.focus();
    fireEvent(accept, "click");
    await settle();
    fireEvent(view.querySelector("#friendly-accept [data-sheet-close]"), "click");
    assert.equal(acceptSheet(), null);
    assert.ok(document.activeElement === view.querySelector('[data-friendly-accept="c1"]'));
    // A desk's «Cancel» closes its window the same way.
    await visit({ phone: false });
    click("[data-friendly-send]");
    fireEvent(view.querySelector("#friendly-send .g-sheet__foot [data-sheet-close]"), "click");
    assert.equal(sendSheet(), null);
    assert.ok(document.activeElement === view.querySelector("[data-friendly-send]"));
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("leaving closes the sheet and stops listening; an answer after it draws nothing and leads nowhere", async () => {
  try {
    const screen = await visit();
    click("[data-friendly-send]");
    const dialog = sendSheet();
    assert.ok(dialog.isModal);
    releaseCurrentScreen();
    assert.equal(dialog.open, false, "the sheet is closed with the screen");
    click('[data-friendly-accept="c1"]');
    assert.equal(view.querySelector("dialog[open]"), null, "a page left opens nothing");
    screen.cross(false);
    assert.ok(view.querySelector(".g-friendly--phone"), "nor is it drawn again");
    // An accept on its way when the coach leaves: the games are read (a match was made), the address stays.
    await visit();
    click('[data-friendly-accept="c1"]');
    await settle();
    const accepting = api.hold("POST /api/challenges/c1/accept");
    api.reply("POST /api/challenges/c1/accept", 200, { gameId: "g9" });
    click("[data-friendly-confirm]");
    releaseCurrentScreen();
    accepting.release();
    await settle();
    await settle();
    assert.equal(location.hash, "#/t/t1/challenges");
    assert.equal(sent("GET /api/games").length, 2);
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("the accept sheet reads the challenger's team once; a read that fails leaves the line without it", async () => {
  try {
    await visit();
    click('[data-friendly-accept="c1"]');
    assert.equal(view.querySelector("#friendly-accept .g-challenge__card .g-challenge__line").textContent, "Orc", "while it is read, the race");
    await settle();
    assert.match(view.querySelector("#friendly-accept .g-challenge__card .g-challenge__line").textContent, /^Orc · TV \S+ · Telegram @orc_boss$/);
    fireEvent(view.querySelector('[data-friendly-own="t2"]'), "click");
    fireEvent(view.querySelector("#friendly-accept [data-sheet-close]"), "click");
    click('[data-friendly-accept="c1"]');
    await settle();
    assert.equal(sent(CHALLENGER_PAGE).length, 1);
    assert.match(view.querySelector("#friendly-accept .g-challenge__card .g-challenge__line").textContent, /Telegram @orc_boss$/);
    // A read refused: the race alone; opened again, it is read again.
    await visit();
    api.reply(CHALLENGER_PAGE, 404, refusal("TEAM_NOT_FOUND"));
    click('[data-friendly-accept="c1"]');
    await settle();
    assert.equal(view.querySelector("#friendly-accept .g-challenge__card .g-challenge__line").textContent, "Orc");
    assert.equal(view.querySelector("[data-friendly-confirm]").hasAttribute("disabled"), false, "the accept does not wait for it");
    fireEvent(view.querySelector("#friendly-accept [data-sheet-close]"), "click");
    click('[data-friendly-accept="c1"]');
    await settle();
    assert.equal(sent(CHALLENGER_PAGE).length, 2);
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/matches/challenges.mjs");
});
