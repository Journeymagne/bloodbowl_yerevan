import assert from "node:assert/strict";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { valuesOf } from "./helpers/contrast.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  LIVE_GAME, PATCH, PLAYERS, PREP_GAME, READING, api, aside, bodyOf, callKeys, coach, conflictOf, gamesAre,
  invalidateGames, notice, order, page, patches, releaseCurrentScreen, renderTeamRoster, renderTreasuryStrip, save,
  settle, state, status, team, titleOf, toasts, toggle, view,
} from "./helpers/roster-screen.mjs";

// Stage 08's treasury strip over the desk roster (Task 15): what it draws is 08's, where it stands and what it is drawn from the roster's.
// The page is test/helpers/roster-screen.mjs; the other parts of the roster's tests are named there.
const STRIP_HOST = '[data-sheet-host="treasury-money"]';
const moneySheet = () => document.querySelector(`${STRIP_HOST} dialog#treasury-money`);
const stripEdit = () => view.querySelector(".g-roster__strip button.g-funds__edit");
const stripMoney = () => view.querySelector(".g-roster__strip .g-funds__cell--money .g-funds__v").textContent;
const TREASURY = "POST /api/teams/t1/treasury";
const ENTRY = { id: "l9", kind: "manual", delta: 20, balanceAfter: 90, reason: "sponsor", note: null, pairingId: null, createdAt: "2026-10-19T12:00:00Z" };
/** A node as markup draws it: its tag, its attributes and what is in it, nested. */
const shape = (node) => (node.nodeType === 3 ? node.nodeValue : [node.tagName, node.attributes.map(({ name, value }) => `${name}=${value}`), ...node.childNodes.map(shape)]);
/** t1 as a treasury entry of 20k leaves it: 90k, revision 5. */
const funded = (over = {}) => team({ revision: 5, roster: { players: PLAYERS, treasury: 90 }, ...over });
/**
 * Dell back on the roster from the desk's panel: a save of the roster a desk makes outside a match, where its panel
 * taps no counter (D3). Its PATCH lifts his skip (players[3]).
 */
function bringDellBack() {
  fireEvent(toggle("p4#0"), "click");
  fireEvent(aside().querySelector("[data-roster-return]"), "click");
}
const returnOf = () => aside().querySelector("[data-roster-return]");

/** An entry of 20k «sponsor» made from the strip, as a coach makes it: the button, the reason, the sheet's own button. */
async function stripEntry() {
  await withoutTimers(async () => {
    fireEvent(stripEdit(), "click");
    fireEvent(moneySheet().querySelector('[data-money-reason="sponsor"]'), "click");
    fireEvent(moneySheet().querySelector("[data-money-apply]"), "click");
    await settle();
  });
}

test("a desk roster has the treasury strip over the table; a phone has none, the Team tab is its place", async () => {
  coach();
  // The coach's list holds the team as 08's writes leave it, the roster's read does not have the entry yet: the strip is the list's (K4 c).
  state.myTeams = { items: [team({ roster: { players: PLAYERS, treasury: 70 } })], loaded: true, loading: false, error: "" };
  gamesAre([PREP_GAME]);
  await renderTeamRoster("t1");
  const classesOf = (root) => root.childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class"));
  assert.deepEqual(classesOf(view.querySelector(".g-roster")).slice(1), ["g-roster__layout"]);
  // The search's live region stands first, empty with no query (stage 07d, Task 25).
  assert.deepEqual(classesOf(view.querySelector(".g-roster__main")), ["g-roster__found", "g-roster__notices", "g-roster__strip", "g-roster__sections", "g-roster__caption"],
    "between the banners and the table, in the table's column: the panel stands beside them from the top (DeskRoster.html)");
  const strip = view.querySelector(".g-roster__strip");
  const probe = document.createElement("div");
  probe.innerHTML = renderTreasuryStrip({ team: state.myTeams.items[0] });
  assert.deepEqual(strip.childNodes.map(shape), probe.childNodes.map(shape), "08's strip as it is, of the team the list holds");
  assert.equal(strip.querySelector("section.g-funds").getAttribute("data-treasury-strip"), "t1");
  assert.equal(stripMoney(), "70k");
  // The press opens 08's sheet in its own host on the body: a redraw of the roster closes nothing.
  const edit = stripEdit();
  edit.focus();
  fireEvent(edit, "click");
  assert.ok(moneySheet().matches(":modal"));
  assert.equal(moneySheet().querySelector(".g-sheet__title").textContent, "Add to the treasury");
  fireEvent(view.querySelector('[data-sort-key="ma"]'), "click");
  assert.equal(order()[0], "Cade", "the roster drawn again under it");
  assert.ok(moneySheet().matches(":modal"), "and the sheet still open");
  fireEvent(moneySheet().querySelector("[data-sheet-close]"), "click");
  assert.equal(document.activeElement, stripEdit());
  // Drawn again for the same team, the roster shares the one wiring; leaving takes it away.
  await renderTeamRoster("t1");
  assert.equal(document.querySelectorAll(STRIP_HOST).length, 1);
  releaseCurrentScreen();
  assert.equal(document.querySelector(STRIP_HOST), null);
  assert.ok(valuesOf("src/screens/team/roster/roster.css", ".g-roster__strip", "display").includes("none"));
});

test("during a match the strip's button is shut and says why, as on the Team page", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const edit = stripEdit();
    assert.equal(edit.getAttribute("aria-disabled"), "true");
    assert.equal(edit.getAttribute("title"), "After the match's post-match");
    api.calls.length = 0;
    fireEvent(edit, "click");
    assert.equal(moneySheet(), null);
    assert.equal(toasts().at(-1), "After the match's post-match");
    assert.deepEqual(api.calls, []);
  });
});

test("a change the strip writes reaches the roster's next save: the team is read again, and the next tap goes on its revision with its treasury", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.equal(stripMoney(), "0k");
  api.reply(TREASURY, 201, { team: funded(), entry: ENTRY });
  api.reply("GET /api/teams/t1", 200, { team: funded() });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
  api.calls.length = 0;
  const reading = api.hold("GET /api/teams/t1");
  await stripEntry();
  // Until the team is read again no save of the roster is made: it would go on the revision before the entry.
  fireEvent(toggle("p4#0"), "click");
  assert.equal(returnOf().getAttribute("title"), READING);
  await withoutTimers(async () => {
    fireEvent(returnOf(), "click");
    await settle();
  });
  assert.equal(toasts().at(-1), READING);
  assert.equal(patches().length, 0);
  reading.release();
  await settle();
  assert.equal(api.calls[0].key, TREASURY);
  assert.deepEqual(callKeys().slice(1).sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events"], "the announcement is followed by a read with the games");
  assert.equal(stripMoney(), "90k");
  assert.equal(moneySheet(), null);
  api.calls.length = 0;
  api.reply(PATCH, 200, { team: funded({ revision: 6 }) });
  fireEvent(returnOf(), "click");
  await settle();
  assert.deepEqual(patches().map(({ body }) => [body.revision, Number(body.roster.treasury), body.roster.players[3].skipNextGame]), [[5, 90, false]],
    "the strip's revision and its treasury: nothing of the entry is laid over");
  assert.deepEqual(callKeys(), [PATCH], "the roster's own save is no write to follow");
  api.assertAnswered();
});

test("a change the strip writes while a step waits takes nothing over it: the step keeps its draft and meets the new revision as a conflict", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.fail(PATCH);
    bringDellBack();
    await settle();
    assert.equal(save.saveState("t1").waiting, 1);
    api.reply(TREASURY, 201, { team: funded(), entry: ENTRY });
    api.calls.length = 0;
    await stripEntry();
    assert.deepEqual(callKeys(), [TREASURY], "no read while a step waits: it would take the step's draft away");
    assert.ok(bodyOf("p4#0").closest("section").classList.contains("g-roster__section--active"), "the step's draft still drawn: Dell plays");
    assert.equal(stripMoney(), "90k");
    api.reply(PATCH, 409, conflictOf(funded()));
    page.dispatchEvent(new Event("online"));
    await settle();
    assert.deepEqual(patches().map(({ body }) => body.revision), [4], "sent on the revision it was taken on");
    assert.equal(titleOf(notice("danger")), "The roster was changed on another device");
    assert.equal(callKeys().includes("GET /api/teams/t1"), false, "the conflict is the coach's to settle");
  });
});

test("a change the strip writes while a step is in the air is followed by nothing: the step's answer settles it", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    const held = api.hold(PATCH);
    bringDellBack();
    await settle();
    api.reply(TREASURY, 201, { team: funded(), entry: ENTRY });
    api.calls.length = 0;
    await stripEntry();
    assert.deepEqual(callKeys(), [TREASURY], "no team is taken while a request of the roster is in the air");
    held.release({ status: 409, body: conflictOf(funded()) });
    await settle();
    assert.equal(titleOf(notice("danger")), "The roster was changed on another device");
    assert.deepEqual(callKeys(), [TREASURY, "GET /api/games"], "a fresh conflict reads the games (final review, Minor 3), and no team");
  });
});

test("a change the strip writes while the roster is read is followed once the read has answered: a read sent before it does not have it", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(stripEdit().getAttribute("aria-disabled"), "true");
    // The match ends elsewhere: the roster is read again, and the strip opens.
    const reading = api.hold("GET /api/teams/t1");
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    await invalidateGames();
    await settle();
    assert.equal(reading.count, 1);
    assert.equal(stripEdit().hasAttribute("aria-disabled"), false);
    api.reply(TREASURY, 201, { team: funded(), entry: ENTRY });
    api.calls.length = 0;
    await stripEntry();
    assert.deepEqual(callKeys(), [TREASURY], "heard while a read is in the air: the read answers first");
    api.reply("GET /api/teams/t1", 200, { team: funded() });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    reading.release({ status: 200, body: { team: team() } });
    await settle();
    assert.deepEqual(callKeys().filter((key) => key === "GET /api/teams/t1"), ["GET /api/teams/t1"], "the read sent before the entry is followed by one after it");
    api.reply(PATCH, 200, { team: funded({ revision: 6 }) });
    bringDellBack();
    await settle();
    assert.deepEqual(patches().map(({ body }) => [body.revision, Number(body.roster.treasury)]), [[5, 90]]);
  });
});
