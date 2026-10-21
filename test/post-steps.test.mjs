import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertContrast, assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { AWAY, FIXTURE, HOME, RECORDS, act, agreed, begin, modelOf, reach, scored, tap } from "./helpers/post-cases.mjs";
import { postMatchUrl } from "../src/core/routes.mjs";
import { postIncome } from "../src/domain/post-match/finance.mjs";
import { RESULT_MODES } from "../src/domain/post-match/rules.mjs";
import { POINT_PARTS, postPoints } from "../src/domain/post-match/score.mjs";
import { prepFrameMarkup } from "../src/screens/matches/prep-frame.mjs";
import { fansDraft, fansStep, opponentLeadMarkup, pointWords, resultAction, resultDraft, resultStep } from "../src/screens/matches/post-steps.mjs";

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const CSS = "src/screens/matches/post.css";
const words = (fragment, selector) => fragment.querySelectorAll(selector).map((node) => node.textContent);
const rows = (fragment) => fragment.querySelectorAll(".g-after__row").map((row) => [row.querySelector(".g-after__rowk").childNodes[0].textContent,
  row.querySelector(".g-after__rowsub")?.textContent ?? "", row.querySelector(".g-after__rowv").textContent]);
/** The score step as the page draws it, the draft as the page starts it with `change` on top. */
const score = (model, change = {}) => resultStep(model, { ...resultDraft(model), ...change });
const drawScore = (model, change) => mount(score(model, change).contentHtml);
const value = (fragment, key) => fragment.querySelector(`[data-score-key="${key}"] .g-after__value`).textContent;

test("the records block: yours with the scorers, the opponent's from their records, how many", () => {
  const fragment = drawScore(modelOf(begin()));
  const card = fragment.querySelector(".g-after__card");
  assert.equal(card.querySelector(".g-after__label").textContent, "From the match records");
  assert.equal(card.querySelector(".g-after__tally").textContent, "records: 7 + 2", "TD, CAS, a completion and an injury of ours; a TD and a CAS of theirs");
  assert.deepEqual(rows(card), [
    ["Yours", "TD: L. Ashby, R. Pike · CAS: W. Brandt, T. Gruk ×2", "TD 2 · CAS 3"], // in the roster's order
    ["Opponent", "from the opponent's records on the «Roster»", "TD 1 · CAS 1"],
  ]);
  assert.match(card.querySelector(".g-after__note").textContent, /^The score below is filled from the records\./);
  // The away side sees its own first.
  const away = drawScore(modelOf(begin(), "", {}, { viewerSide: "away" }));
  assert.equal(away.querySelector(".g-after__tally").textContent, "records: 2 + 7");
  assert.deepEqual(rows(away)[0], ["Yours", "TD: A. Player 1 · CAS: A. Player 2", "TD 1 · CAS 1"]);
  // Nobody scored: a dash where the names go.
  assert.deepEqual(rows(drawScore(modelOf(begin({ events: {} }))))[0], ["Yours", "TD: — · CAS: —", "TD 0 · CAS 0"]);
});

test("a side begun before 3.0 says it has no records, and nothing is said to mismatch them", () => {
  const state = structuredClone(scored(begin(), { away: [3, 1] }));
  assert.ok(drawScore(modelOf(state)).querySelector('[role="alert"]'), "theirs mismatch while they have records");
  delete state.away.followsEvents;
  const fragment = drawScore(modelOf(state));
  assert.deepEqual(rows(fragment)[1], ["Opponent", "begun before 3.0: no records", "—"]);
  assert.equal(fragment.querySelector(".g-after__tally").textContent, "records: 7 + —");
  assert.ok(!fragment.querySelector('[role="alert"]'), "nothing against records a side does not have");
});

test("the steppers start at the score sent, else at each side's records; ours at the left", () => {
  const fresh = modelOf(begin());
  assert.deepEqual(resultDraft(fresh), { mode: "played", winner: "", own: { touchdowns: 2, casualties: 3 }, other: { touchdowns: 1, casualties: 1 }, changed: false, unlocked: false });
  const fragment = drawScore(fresh);
  assert.deepEqual(words(fragment, ".g-after__teams span"), ["Mock Team", "Mock Rivals"]);
  assert.deepEqual(["own:touchdowns", "other:touchdowns", "own:casualties", "other:casualties"].map((key) => value(fragment, key)), ["2", "1", "3", "1"]);
  const group = fragment.querySelector('[data-score-key="own:touchdowns"]');
  assert.equal(group.getAttribute("aria-label"), "Mock Team · TD");
  assert.deepEqual(group.querySelectorAll("button").map((button) => [button.getAttribute("data-score-step"), button.getAttribute("aria-label")]),
    [["-1", "Mock Team · TD: fewer"], ["1", "Mock Team · TD: more"]]);
  // A score sent: its numbers, the guests' part at their left.
  const sent = scored(begin(), { home: [3, 2], away: [0, 1] });
  assert.deepEqual(resultDraft(modelOf(sent)).own, { touchdowns: 3, casualties: 2 });
  const away = drawScore(modelOf(sent, "", {}, { viewerSide: "away" }));
  assert.deepEqual(words(away, ".g-after__teams span"), ["Mock Rivals", "Mock Team"]);
  assert.deepEqual(["own:touchdowns", "other:touchdowns"].map((key) => value(away, key)), ["0", "3"]);
  assert.ok(away.querySelector('[data-score-key="own:touchdowns"] [data-score-step="-1"]').hasAttribute("disabled"), "closed at 0");
  assert.ok(!away.querySelector('[data-score-key="own:touchdowns"] [data-score-step="1"]').hasAttribute("disabled"));
  assert.ok(drawScore(fresh, { own: { touchdowns: 99, casualties: 0 } }).querySelector('[data-score-key="own:touchdowns"] [data-score-step="1"]').hasAttribute("disabled"), "closed at 99");
  // What «Send the score» writes: home's and away's parts, as the domain takes them.
  assert.deepEqual(resultAction(modelOf(sent, "", {}, { viewerSide: "away" }), { ...resultDraft(modelOf(sent, "", {}, { viewerSide: "away" })), own: { touchdowns: 1, casualties: 1 } }),
    { type: "result", mode: "played", winner: "", home: { touchdowns: 3, casualties: 2 }, away: { touchdowns: 1, casualties: 1 } });
});

test("the mismatch is said under the score, in the prototype's words", () => {
  const model = modelOf(begin());
  assert.ok(!drawScore(model).querySelector('[role="alert"]'), "the score agrees with the records");
  const fragment = drawScore(model, { own: { touchdowns: 3, casualties: 3 } });
  const alert = fragment.querySelector('.g-after__alert[role="alert"]');
  assert.equal(alert.querySelector(".g-after__alerttitle").textContent, "The score does not match the records");
  assert.equal(alert.querySelector(".g-after__alerttext").textContent,
    "your TD: 3 in the score, 2 in the records. On the «Players» step the players' TD and CAS must add up to the score — add or take away a record there.");
  const both = drawScore(model, { own: { touchdowns: 3, casualties: 4 }, other: { touchdowns: 1, casualties: 0 } });
  assert.match(both.querySelector(".g-after__alerttext").textContent,
    /^your TD: 3 in the score, 2 in the records; your CAS: 4 in the score, 3 in the records; the opponent's score does not match the opponent's records\. /);
  // The order of the cards: the records, the score, the mismatch, how the match ended, the note.
  assert.deepEqual(fragment.childNodes.map((node) => node.getAttribute("class")),
    ["g-after__card g-after__card--tight", "g-after__card", "g-after__alert", "g-after__card", "g-after__note"]);
  // A technical result counts nil against the records.
  assert.ok(drawScore(modelOf(begin({ events: {} })), { mode: "technical", winner: "home" }).querySelector('[role="alert"]') === null);
});

test("the button follows the score: send, confirm the opponent's, wait for the opponent, next", () => {
  const send = score(modelOf(begin())).footer;
  assert.deepEqual([send.kind, send.action, send.label, send.disabled], ["action", "result", "Send the score", false]);
  // The opponent sent it: confirm it, or send our own once changed.
  const theirs = scored(begin(), { by: "away" });
  const confirm = score(modelOf(theirs)).footer;
  assert.deepEqual([confirm.action, confirm.label], ["agree-result", "Confirm the score 2–1"]);
  assert.deepEqual([score(modelOf(theirs), { changed: true }).footer.action, score(modelOf(theirs), { changed: true }).footer.label], ["result", "Send your score"]);
  // We sent it: the way on is closed until the opponent confirms; a change is sent again.
  const ours = scored(begin());
  const wait = score(modelOf(ours)).footer;
  assert.deepEqual([wait.kind, wait.label, wait.disabled, wait.hint], ["next", "Next: income and fans", true, "Opens once the opponent confirms the score"]);
  assert.equal(score(modelOf(ours), { changed: true }).footer.label, "Send the score");
  // Agreed: on to the income, and a quiet way to change the score — which asks first (the screen's), then sends.
  const both = agreed(begin());
  const next = score(modelOf(both, "result")).footer;
  assert.deepEqual([next.kind, next.href, next.disabled, next.quiet], ["next", postMatchUrl("g1", "fans"), false, { action: "unlock-result", label: "Change the score…" }]);
  const steppers = drawScore(modelOf(both, "result"));
  assert.equal(steppers.querySelectorAll(".g-after__step[disabled]").length, 8, "agreed: the steppers are closed until «Change the score…»");
  assert.equal(steppers.querySelectorAll('.g-after__mode[aria-disabled="true"]').length, 4);
  const unlocked = score(modelOf(both, "result"), { unlocked: true });
  assert.deepEqual([unlocked.footer.action, unlocked.footer.disabled, unlocked.footer.hint], ["result", true, "Change the score first"]);
  assert.equal(score(modelOf(both, "result"), { unlocked: true, changed: true }).footer.disabled, false);
  assert.equal(mount(score(modelOf(both, "result"), { unlocked: true }).contentHtml).querySelectorAll(".g-after__step[disabled]").length, 0);
  // The league's score: said, read only, on without a way to change it.
  const official = begin({ official: { mode: "played", official: true, winner: "", accepted: { home: true, away: true }, home: { touchdowns: 2, casualties: 3 }, away: { touchdowns: 1, casualties: 1 } } });
  const league = score(modelOf(official, "result"));
  const fragment = mount(league.contentHtml);
  assert.equal(fragment.querySelector(".g-callout__title").textContent, "The league entered this score");
  assert.ok(!fragment.querySelector("[data-after-mode]"), "no mode to change");
  assert.equal(fragment.querySelectorAll(".g-after__step[disabled]").length, 8);
  assert.deepEqual([league.footer.kind, league.footer.quiet], ["next", null]);
});

test("a technical result closes the steppers at 2–0; a mode other than played asks for the winner", () => {
  const model = modelOf(begin({ events: {} }));
  const played = drawScore(model);
  const modes = played.querySelector('[role="radiogroup"][data-after-mode]');
  assert.equal(modes.getAttribute("aria-label"), "How the match ended");
  assert.deepEqual(modes.querySelectorAll('[role="radio"]').map((item) => [item.textContent, item.getAttribute("data-mode"), item.getAttribute("aria-checked"), item.getAttribute("tabindex")]),
    [["Played", "played", "true", "0"], ["Technical", "technical", "false", "-1"], ["Conceded", "conceded", "false", "-1"], ["Conceded, no penalty", "conceded-safe", "false", "-1"]]);
  assert.ok(!played.querySelector('[data-seg-group="after-winner"]'), "played: no winner to pick");
  const technical = drawScore(model, { mode: "technical", winner: "away" });
  assert.deepEqual(["own:touchdowns", "other:touchdowns", "own:casualties", "other:casualties"].map((key) => value(technical, key)), ["0", "2", "0", "0"]);
  assert.equal(technical.querySelectorAll(".g-after__step[disabled]").length, 8);
  const winner = technical.querySelector('.g-seg[data-seg-group="after-winner"]');
  assert.equal(winner.getAttribute("aria-label"), "Winner");
  assert.deepEqual(words(winner, '[role="radio"]'), ["Mock Team", "Mock Rivals"]);
  assert.equal(winner.querySelector('[aria-checked="true"]').textContent, "Mock Rivals");
  assert.match(technical.textContent, /A technical result is 2–0 to the winner, CAS 0\./);
  assert.deepEqual(resultAction(model, { ...resultDraft(model), mode: "technical", winner: "away" }),
    { type: "result", mode: "technical", winner: "away", home: { touchdowns: 0, casualties: 0 }, away: { touchdowns: 2, casualties: 0 } });
  // No winner picked yet: ours, as the segments show it and the action sends it.
  const conceded = drawScore(model, { mode: "conceded", own: { touchdowns: 2, casualties: 0 }, other: { touchdowns: 0, casualties: 0 } });
  assert.equal(conceded.querySelector('[data-seg-group="after-winner"] [aria-checked="true"]').textContent, "Mock Team");
  assert.equal(resultAction(model, { ...resultDraft(model), mode: "conceded" }).winner, "home");
  // A concession's score the domain refuses closes the button and says why (pre-flight L14).
  const refused = score(model, { mode: "conceded", winner: "home", own: { touchdowns: 1, casualties: 0 }, other: { touchdowns: 0, casualties: 0 } }).footer;
  assert.deepEqual([refused.disabled, refused.hint], [true, "Conceded: the winner has at least 2 TD, the loser none"]);
  assert.equal(score(model, { mode: "conceded-safe", winner: "away", own: { touchdowns: 0, casualties: 0 }, other: { touchdowns: 2, casualties: 0 } }).footer.disabled, false);
});

test("points for you: a win in parts, a friendly off the table", () => {
  const fragment = drawScore(modelOf(begin()));
  assert.equal(fragment.querySelector(".g-after__for").textContent, "For you: Win");
  assert.equal(fragment.querySelector(".g-after__pts").textContent, "+4 pts");
  const loss = drawScore(modelOf(begin(), "", {}, { viewerSide: "away" }));
  assert.deepEqual([loss.querySelector(".g-after__for").textContent, loss.querySelector(".g-after__pts").textContent], ["For you: Loss", "+0 pts"]);
  assert.equal(drawScore(modelOf(begin()), { own: { touchdowns: 1, casualties: 0 }, other: { touchdowns: 1, casualties: 0 } }).querySelector(".g-after__for").textContent, "For you: Draw");
  const friendly = drawScore(modelOf(begin(), "", {}, { fixture: { ...FIXTURE, kind: "friendly" } }));
  assert.equal(friendly.querySelector(".g-after__for").textContent, "Friendly: off the table");
  assert.ok(!friendly.querySelector(".g-after__pts"));
  // The parts the points add up to, as the summary says them.
  const state = agreed(begin());
  assert.equal(pointWords(postPoints(state, "home", "league")), "+3 for the win, +1 for 3+ CAS");
  assert.equal(pointWords(postPoints(agreed(begin(), { home: [3, 0], away: [0, 0] }), "home", "league")), "+3 for the win, +1 for 3+ TD ahead, +1 for a clean sheet");
});

test("the fans: a D6 after a win, a D3 after conceding, none at a draw; Dedicated Fans as they will be", () => {
  const model = modelOf(agreed(begin()));
  assert.deepEqual(fansDraft(model), { roll: null, technicalRoll: null, painted: false, stalling: false });
  const before = mount(fansStep(model, fansDraft(model)).contentHtml);
  const group = before.querySelector('[role="radiogroup"][data-after-fans]');
  assert.equal(group.getAttribute("aria-label"), "Dedicated Fans · D6 after a win");
  assert.deepEqual(group.querySelectorAll('[role="radio"]').map((face) => [face.textContent, face.getAttribute("data-die"), face.getAttribute("tabindex")]),
    [["1", "1", "0"], ["2", "2", "-1"], ["3", "3", "-1"], ["4", "4", "-1"], ["5", "5", "-1"], ["6", "6", "-1"]]);
  assert.ok(!before.querySelector(".g-after__fans"), "nothing said before the die is marked");
  assert.equal(before.querySelector(".g-after__card .g-after__note").textContent, "Win: if the D6 is at least the current Dedicated Fans (3), they go up by 1, at most 7.");
  const four = mount(fansStep(model, { ...fansDraft(model), roll: 4 }).contentHtml);
  assert.equal(four.querySelector('[aria-checked="true"]').textContent, "4");
  assert.equal(four.querySelector(".g-after__fans--up").textContent, "Dedicated Fans 3 → 4");
  assert.equal(mount(fansStep(model, { ...fansDraft(model), roll: 2 }).contentHtml).querySelector(".g-after__fans").textContent, "Dedicated Fans stay at 3");
  // A loss: the D6 below the fans takes one away.
  const away = modelOf(agreed(begin()), "", {}, { viewerSide: "away" });
  const lost = mount(fansStep(away, { ...fansDraft(away), roll: 1 }).contentHtml);
  assert.equal(lost.querySelector("[data-after-fans]").getAttribute("aria-label"), "Dedicated Fans · D6 after a loss");
  assert.equal(lost.querySelector(".g-after__fans").textContent, "Dedicated Fans 3 → 2");
  // A draw: no die.
  const draw = modelOf(agreed(begin({ events: {} }), { home: [1, 0], away: [1, 0] }));
  const even = mount(fansStep(draw, fansDraft(draw)).contentHtml);
  assert.ok(!even.querySelector('[role="radiogroup"]'));
  assert.match(even.textContent, /A draw: no roll, Dedicated Fans stay at 3\./);
  assert.equal(fansStep(draw, fansDraft(draw)).footer.disabled, false, "nothing to roll");
  // Conceding: a D3; «no penalty» is a loss's D6 (pre-flight L15).
  const conceded = modelOf(agreed(begin({ events: {} }), { mode: "conceded", home: [2, 0], away: [0, 0] }), "", {}, { viewerSide: "away" });
  const d3 = mount(fansStep(conceded, fansDraft(conceded)).contentHtml).querySelector("[data-after-fans]");
  assert.equal(d3.querySelectorAll('[role="radio"]').length, 3);
  assert.equal(d3.getAttribute("aria-label"), "Dedicated Fans · D3 after conceding");
  const safe = modelOf(agreed(begin({ events: {} }), { mode: "conceded-safe", home: [2, 0], away: [0, 0] }), "", {}, { viewerSide: "away" });
  assert.equal(mount(fansStep(safe, fansDraft(safe)).contentHtml).querySelectorAll("[data-after-fans] [role=\"radio\"]").length, 6);
  // The footer: «Next: players» sends it, closed until the die is marked.
  const closed = fansStep(model, fansDraft(model)).footer;
  assert.deepEqual([closed.kind, closed.action, closed.label, closed.disabled, closed.hint], ["action", "fans", "Next: players", true, "Roll the D6 at the table and mark it"]);
  assert.equal(fansStep(model, { ...fansDraft(model), roll: 4 }).footer.disabled, false);
  assert.equal(fansStep(conceded, fansDraft(conceded)).footer.hint, "Roll the D3 at the table and mark it");
  // Passed: read only, on to the players.
  const passed = modelOf(reach(agreed(begin()), { home: 3, away: 3 }), "fans");
  const done = fansStep(passed, fansDraft(passed));
  assert.deepEqual([done.footer.kind, done.footer.href], ["next", postMatchUrl("g1", "players")]);
  assert.equal(mount(done.contentHtml).querySelectorAll('[data-after-fans] [aria-disabled="true"]').length, 6);
  assert.equal(mount(done.contentHtml).querySelector('[data-after-fans] [aria-checked="true"]').textContent, "4", "the roll the side holds");
});

test("the technical win's D3 is the income's, and the button waits for it", () => {
  const winner = modelOf(agreed(begin({ events: {} }), { mode: "technical", home: [2, 0], away: [0, 0] }));
  const fragment = mount(fansStep(winner, { ...fansDraft(winner), roll: 4 }).contentHtml);
  const group = fragment.querySelector('[role="radiogroup"][data-after-technical]');
  assert.equal(group.getAttribute("aria-label"), "Technical win · D3: (D3 + 2) × 10k");
  assert.equal(group.querySelectorAll('[role="radio"]').length, 3);
  assert.deepEqual(fansStep(winner, { ...fansDraft(winner), roll: 4 }).footer.hint, "Roll the D3 at the table and mark it");
  const rolled = mount(fansStep(winner, { ...fansDraft(winner), roll: 4, technicalRoll: 2 }).contentHtml);
  assert.deepEqual(rows(rolled), [["Technical win", "", "40k"]]);
  assert.equal(rolled.querySelector(".g-after__big").textContent, "+40k");
  assert.ok(!rolled.querySelector(".g-toggle"), "no switch earns anything here");
});

test("the income is the domain's, with the draft's toggles", () => {
  const state = agreed(begin());
  const model = modelOf(state);
  const draft = { ...fansDraft(model), roll: 4 };
  const fragment = mount(fansStep(model, draft).contentHtml);
  assert.deepEqual(rows(fragment), [
    ["Attendance", "Fan Factor 5 + 5 = 10 × 5k", "50k"], ["Touchdowns", "2 × 10k", "20k"], ["No stalling", "", "10k"], ["Painted team", "", "0k"],
  ]);
  assert.equal(fragment.querySelector(".g-after__totalk").textContent, "Total");
  assert.equal(fragment.querySelector(".g-after__big").textContent, `+${postIncome(state, "home").total}k`);
  assert.equal(fragment.querySelector(".g-after__big").textContent, "+80k");
  const toggles = fragment.querySelectorAll(".g-toggle");
  assert.deepEqual(toggles.map((toggle) => [toggle.getAttribute("data-toggle-key"), toggle.querySelector(".g-toggle__label").textContent, toggle.querySelector(".g-toggle__caption").textContent]),
    [["stalling", "Stalled (stalling)", "If yes — no 10k bonus"], ["painted", "The team is painted", "+15k to income"]]);
  const stalled = mount(fansStep(model, { ...draft, stalling: true, painted: true }).contentHtml);
  assert.deepEqual(rows(stalled).slice(2), [["No stalling", "", "0k"], ["Painted team", "", "15k"]]);
  assert.equal(stalled.querySelector(".g-after__big").textContent, "+85k");
  assert.equal(stalled.querySelector('[data-toggle-key="stalling"]').getAttribute("aria-checked"), "true");
  // The loser of a concession earns nothing (the known difference 3, closed here).
  const conceded = modelOf(agreed(begin({ events: {} }), { mode: "conceded", home: [2, 0], away: [0, 0] }), "", {}, { viewerSide: "away" });
  const none = mount(fansStep(conceded, fansDraft(conceded)).contentHtml);
  assert.match(none.textContent, /Conceded: no income for the loser\./);
  assert.equal(none.querySelector(".g-after__big").textContent, "+0k");
  assert.ok(!none.querySelector(".g-toggle"));
  // Its winner: a crowd paid double, no stalling bonus to earn.
  const won = modelOf(agreed(begin({ events: {} }), { mode: "conceded", home: [2, 0], away: [0, 0] }));
  const double = mount(fansStep(won, { ...fansDraft(won), roll: 4 }).contentHtml);
  assert.equal(rows(double)[0][1], "Fan Factor 5 + 5 = 10 × 10k");
  assert.deepEqual(double.querySelectorAll(".g-toggle").map((toggle) => toggle.getAttribute("data-toggle-key")), ["painted"]);
  // Read only once passed.
  const passed = modelOf(reach(state, { home: 3, away: 3 }), "fans");
  assert.ok(mount(fansStep(passed, fansDraft(passed)).contentHtml).querySelectorAll(".g-toggle[disabled]").length === 2);
});

test("a desk: the cards in the frame's card, the opponent's chip over a 48px button", () => {
  const model = modelOf(agreed(begin()), "result");
  const step = score(model);
  const fragment = mount(prepFrameMarkup({ ...model, footer: step.footer }, { phone: false, ...step, opponentHtml: "", actionLeadHtml: opponentLeadMarkup(model) }));
  assert.equal(fragment.querySelector("section.g-prep__card h2").textContent, "Score");
  const panel = fragment.querySelector(".g-prep__panel--action");
  assert.equal(panel.querySelector(".g-after__lead .g-status--live").textContent, "The opponent confirmed the score 2–1");
  assert.equal(panel.querySelector("a.g-prep__cta").textContent, "Next: income and fans");
  assert.deepEqual(valuesOf(CSS, ".g-after__lead ~ .g-prep__cta", "min-height"), ["48px"]);
  assert.equal(mount(opponentLeadMarkup(modelOf(scored(begin()), "result"))).querySelector(".g-status--wait").textContent, "Waiting for the opponent to confirm");
  assert.equal(opponentLeadMarkup({ opponent: { text: "" } }), "");
});

test("names are text", () => {
  const hostile = HOME.map((player, index) => (index === 2 ? { ...player, name: HOSTILE } : player));
  const state = agreed(begin({ home: { roster: hostile, team: HOSTILE }, away: { team: HOSTILE, roster: AWAY } }), { mode: "technical", home: [2, 0], away: [0, 0] });
  const model = modelOf(state, "result");
  const fragment = mount(`${score(model, { unlocked: true }).contentHtml}${fansStep(modelOf(state, "fans"), fansDraft(modelOf(state, "fans"))).contentHtml}`);
  assert.ok(!fragment.querySelector("img"));
  assertCspSafe(fragment);
  assert.equal(fragment.querySelector(".g-after__teams span").textContent, HOSTILE);
  assert.match(fragment.querySelector(".g-after__rowsub").textContent, /<img src=x/);
});

test("every key in both dictionaries, the modes, outcomes and parts by their sets", () => {
  assertDictionaryCovers("src/screens/matches/post-steps.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const mode of RESULT_MODES) assert.ok(words[`after.mode.${mode}`], `${locale} after.mode.${mode}`);
    for (const outcome of ["win", "draw", "loss"]) assert.ok(words[`after.outcome.${outcome}`], `${locale} after.outcome.${outcome}`);
    for (const part of POINT_PARTS) assert.ok(words[`after.part.${part}`], `${locale} after.part.${part}`);
    for (const counter of ["touchdowns", "casualties"]) assert.ok(words[`after.stat.${counter}`], `${locale} after.stat.${counter}`);
  }
});

test("styled as the prototypes draw it; readable; D2; nothing cut with «…»", () => {
  const sheets = [CSS, "src/screens/matches/prep.css", "toggle.css", "segmented-control.css", "callout.css", "status-chip.css"];
  const states = [begin(), scored(begin()), agreed(begin()), agreed(begin({ events: {} }), { mode: "technical", home: [2, 0], away: [0, 0] }),
    agreed(begin({ events: {} }), { mode: "conceded", home: [2, 0], away: [0, 0] })];
  for (const state of states) {
    for (const viewerSide of ["home", "away"]) {
      const model = modelOf(state, "result", {}, { viewerSide });
      assertStyled(mount(score(model, { own: { touchdowns: 5, casualties: 0 } }).contentHtml), ...sheets);
      if (state.result && model.agreed) assertStyled(mount(fansStep(modelOf(state, "fans", {}, { viewerSide }), { ...fansDraft(model), roll: 3 }).contentHtml), ...sheets);
    }
  }
  assertStyled(mount(opponentLeadMarkup(modelOf(begin()))), ...sheets);
  const own = (selector, property) => valuesOf(CSS, selector, property);
  // The prototypes' values (PostResult.html, PostFans.html).
  assert.deepEqual(own(".g-after__card", "border-radius"), ["var(--radius-2xl)"]);
  assert.deepEqual(own(".g-after__card", "padding"), ["var(--space-14) var(--space-16)"]);
  assert.deepEqual(own(".g-after__card", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(own(".g-after__label", "font"), ["700 12px/1.3 var(--font-body)"]);
  assert.deepEqual(own(".g-after__label", "letter-spacing"), ["0.06em"]);
  assert.deepEqual(own(".g-after__row", "min-height"), ["44px"]);
  assert.deepEqual(own(".g-after__row", "font"), ["400 15px/1.25 var(--font-body)"]);
  assert.deepEqual(own(".g-after__rowv--keep", "white-space"), ["nowrap"], "the score's totals on one line; the other values wrap");
  assert.deepEqual(own(".g-after__rowv", "overflow-wrap"), ["anywhere"]);
  assert.deepEqual(own(".g-after__note", "font"), ["400 13px/1.45 var(--font-body)"]);
  assert.deepEqual(own(".g-after__big", "font"), ["700 28px/1 var(--font-display)"]);
  assert.deepEqual(own(".g-after__score", "grid-template-columns"), ["minmax(0, 1fr) auto minmax(0, 1fr)", "repeat(2, auto)"], "under 370px, two columns under the word");
  assert.deepEqual(own(".g-after__counter", "background"), ["var(--surface-2)"]);
  assert.deepEqual(own(".g-after__counter", "border-radius"), ["var(--radius-lg)"]);
  assert.deepEqual(own(".g-after__step", "border-radius"), ["9px"]);
  assert.deepEqual(own(".g-after__value", "font"), ["700 20px/1 var(--font-display)"]);
  assert.deepEqual(own(".g-after__alert", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(own(".g-after__alert", "padding"), ["var(--space-12) var(--space-14)"]);
  assert.deepEqual(own('.g-after__mode[aria-checked="true"]', "box-shadow"), ["inset 0 0 0 2px var(--accent)"]);
  assert.deepEqual(own('.g-after__mode[aria-checked="true"]', "background"), ["var(--accent-tint-soft)"]);
  assert.deepEqual(own(".g-after__modes", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(own(".g-after__fans", "font"), ["700 16px/1.3 var(--font-body)"]);
  assert.deepEqual(own(".g-after__card--switches .g-toggle", "min-height"), ["56px"]);
  assert.deepEqual(own(".g-prep__dotlist:has(> :nth-child(7))", "grid-template-columns"), ["repeat(7, minmax(0, 1fr))"], "seven dots");
  // Readable in every palette.
  assertContrast("--on-danger-tint", ["--danger-tint"], 4.5, { what: "the mismatch's words" });
  assertReadable(CSS, ".g-after__tally", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-after__pts", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-after__big", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-after__fans--up", "color", ["--surface"], 4.5);
  for (const selector of [".g-after__label", ".g-after__note", ".g-after__rowk", ".g-after__rowsub", ".g-after__for", ".g-after__counterk", ".g-after__fans", ".g-after__totalk"]) {
    assertReadable(CSS, selector, "color", ["--surface"], 4.5);
  }
  // D2: a thumb's up to 900px, the prototype's from 901px and never under 24.
  const px = (value) => ({ "var(--size-touch)": 44 })[value] ?? parseInt(value, 10);
  for (const [selector, property] of [[".g-after__step", "height"], [".g-after__step", "width"], [".g-after__mode", "min-height"], [".g-after__card--switches .g-toggle", "min-height"]]) {
    assert.ok(px(own(selector, property)[0]) >= 44, `${selector} ${property}`);
  }
  assert.ok(px(valuesOf("src/screens/matches/prep.css", ".g-prep__faces--6 .g-prep__face", "min-height")[0]) >= 44, "the faces, the preparation's 46px");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-after__step", "height"), ["40px"]);
  assert.equal(inMedia(CSS, "max-width: 900px", ".g-after__step", "height").length, 0, "nothing smaller on a phone");
  // Nothing cut; the names wrap.
  const bare = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(bare, /ellipsis|text-overflow|line-clamp/);
  assert.doesNotMatch(bare, /--focus-ring|style=/);
  for (const selector of [".g-after__teams", ".g-after__mode", ".g-after__label"]) assert.deepEqual(own(selector, "overflow-wrap"), ["anywhere"], selector);
  assert.deepEqual(own(".g-after__rowk", "overflow-wrap"), ["break-word"], "a row's label wraps between its words, never inside one");
  for (const [, query] of text(CSS).matchAll(/@media\s*([^{]+)\{/g)) assert.ok(["(max-width: 900px)", "(min-width: 901px)", "(max-width: 369px)"].includes(query.trim()), query);
  // Under 370px the score's word goes over its two steppers, the figure narrower; the buttons keep 44px (the final review).
  assert.deepEqual(inMedia(CSS, "max-width: 369px", ".g-after__score > .g-after__counterk", "grid-row"), ["1"]);
  assert.deepEqual(inMedia(CSS, "max-width: 369px", ".g-after__value", "min-width"), ["24px"]);
  assert.equal(inMedia(CSS, "max-width: 369px", ".g-after__step", "width").length, 0, "the 44px buttons stay");
  const styles = text("src/styles.css");
  assert.ok(styles.indexOf('@import url("screens/matches/post.css");') > styles.indexOf('@import url("screens/matches/prep.css");'), "after the preparation's sheet it draws over");
});

test("the records followed as tapped: a tap moves the draft's start, not a score sent", () => {
  const more = { home: [...RECORDS.home, ...tap("h6", "touchdowns")], away: RECORDS.away };
  assert.deepEqual(resultDraft(modelOf(begin({ events: more }))).own, { touchdowns: 3, casualties: 3 });
  const sent = act(scored(begin()), "away", { type: "agree-result" }, more);
  assert.deepEqual(resultDraft(modelOf(sent, "result")).own, { touchdowns: 2, casualties: 3 });
});
