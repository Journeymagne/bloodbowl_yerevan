import assert from "node:assert/strict";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { el, fireEvent, parseHtml } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";

/*
 * The game page 2.x after stage 09a (Task 12, spec 3.0 §9.6): a coach has no quick score any more — a match is played
 * through its preparation and post-match — while the confirmation of a score the opponent sent before 3.0 and the
 * preparation's panel stay as they were. The administrator's manual result left it with stage 12: it is the
 * administration's season now (#/administration/season, a pair's «Result…»).
 */

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
// The page puts its panels in with insertAdjacentHTML("afterbegin"), which the fake document does not have.
Object.getPrototypeOf(appView).insertAdjacentHTML ??= function insertAdjacentHTML(position, markup) {
  assert.equal(position, "afterbegin");
  const first = this.firstChild;
  for (const node of [...parseHtml(document, markup).childNodes]) this.insertBefore(node, first);
};
globalThis.location = { hash: "#/games/g1", replace() {} };
const { renderGamePage } = await import("../src/screens/games/game.mjs");
const { preMatchUrl } = await import("../src/core/routes.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const flush = async () => {
  for (let round = 0; round < 6; round += 1) await settle();
};

const side = (id, login, name) => ({ user: { id: `u-${id}`, login }, team: { id, name, baseTeamSlug: "teams/human", logoUrl: null } });
/** A league match of round 3, the round that is on, as `GET /api/games/:id` sends it: nothing sent, nothing begun. */
const game = (over = {}) => ({
  id: "g1", kind: "league", roundNumber: 3, roundStatus: "started", season: { id: "s1", name: "Mock Season", currentRound: 3 },
  resultStatus: "pending", preparationStatus: "not_started", postMatchStatus: "not_started",
  homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null,
  proposedByUserId: null, proposedHomeTouchdowns: null, proposedAwayTouchdowns: null, proposedHomeCasualties: null, proposedAwayCasualties: null,
  home: side("t1", "coach", "Ashgrove Wardens"), away: side("r1", "rival", "Silverbrook Rangers"), viewerIsHome: true, viewerIsProposer: false,
  ...over,
});
/** The rival sent 2–1, casualties 1–0. */
const SENT = { resultStatus: "awaiting_confirmation", proposedByUserId: "u-r1",
  proposedHomeTouchdowns: 2, proposedAwayTouchdowns: 1, proposedHomeCasualties: 1, proposedAwayCasualties: 0 };

/** `user` on the page of `shown`; the game and the list it reads after a write are answered. */
async function visit(shown, user = { id: "u-t1", login: "coach", isAdmin: false }) {
  api.reset();
  view.innerHTML = "";
  state.auth.currentUser = user;
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/games/g1", 200, { game: shown });
  api.reply("GET /api/games", 200, { games: [shown], currentGames: [] });
  await renderGamePage("g1");
  await flush();
}
const ADMIN = { id: "u-admin", login: "admin", isAdmin: true };
const sent = (key) => api.calls.filter((call) => call.key === key);

test("a coach's game page has no score form: nothing to propose a result with", async () => {
  await visit(game());
  assert.ok(view.querySelector(".game-page"), "the page is drawn");
  assert.ok(!view.querySelector("form"), "no form at all");
  assert.ok(!view.querySelector('input[name="homeTouchdowns"]'));
  assert.ok(!view.querySelector('input[type="number"]'));
  // Every control there is pressed, every form there sent: nothing proposes a result.
  for (const form of view.querySelectorAll("form")) fireEvent(form, "submit");
  for (const control of view.querySelectorAll("button, a")) fireEvent(control, "click");
  await flush();
  assert.deepEqual(sent("POST /api/games/g1/propose"), []);
  // A coach whose own score waits for the rival is told so, with no form and no buttons to agree with himself.
  await visit(game({ ...SENT, proposedByUserId: "u-t1", viewerIsProposer: true }));
  assert.ok(view.querySelector("[data-game-awaiting]"));
  assert.ok(!view.querySelector("form"));
  assert.ok(!view.querySelector("[data-game-confirm]"));
  api.assertAnswered();
});

test("the game page has no admin's result form: the administration's season has the result", async () => {
  for (const shown of [game(SENT), game({ ...SENT, resultStatus: "confirmed", homeTouchdowns: 3, awayTouchdowns: 0, homeCasualties: 2, awayCasualties: 2 }), game()]) {
    await visit(shown, ADMIN);
    assert.ok(view.querySelector(".game-page"), "the page is drawn");
    assert.equal(view.querySelector("[data-admin-game-result]"), null);
    assert.equal(view.querySelector("form"), null, "no form at all");
    assert.ok(!view.querySelector('input[type="number"]'));
    for (const control of view.querySelectorAll("button, a")) assert.notEqual(control.getAttribute("type"), "submit");
  }
  // A score the opponent sent is still confirmed or rejected by the admin here, as by a coach.
  await visit(game(SENT), ADMIN);
  assert.ok(view.querySelector("[data-game-confirm]"));
  assert.deepEqual(sent("PATCH /api/games/g1"), []);
  api.assertAnswered();
});

test("a score the opponent sent is still confirmed or rejected here", async () => {
  for (const [selector, action] of [["[data-game-confirm]", "confirm"], ["[data-game-reject]", "reject"]]) {
    await visit(game(SENT));
    assert.ok(view.querySelector("[data-game-confirm]"), "Confirm");
    assert.ok(view.querySelector("[data-game-reject]"), "Reject");
    assert.ok(!view.querySelector("form"), "and no form beside them");
    assert.equal(view.querySelector("[data-game-confirm]").textContent.trim(), t("games.confirmAction"));
    api.reply(`POST /api/games/g1/${action}`, 200, { game: game() });
    fireEvent(view.querySelector(selector), "click");
    await flush();
    assert.deepEqual(sent(`POST /api/games/g1/${action}`).map((call) => call.body), [{}]);
    assert.equal(sent("GET /api/games").length, 1, "the games are read again");
    assert.equal(sent("GET /api/games/g1").length, 2, "the page is drawn anew");
    api.assertAnswered();
  }
});

test("the preparation panel still leads to the preparation", async () => {
  const shown = game();
  await visit(shown);
  const link = view.querySelector(`.pre-game-panel a[href="${preMatchUrl(shown)}"]`);
  assert.ok(link, "the panel's link to the preparation");
  assert.equal(link.textContent.trim(), t("pre.prepareAction"));
  // The administrator has it too.
  await visit(shown, ADMIN);
  assert.ok(view.querySelector(`.pre-game-panel a[href="${preMatchUrl(shown)}"]`));
  api.assertAnswered();
});
