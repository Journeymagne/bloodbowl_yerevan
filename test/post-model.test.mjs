import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, mount } from "./helpers/ui.mjs";
import { AWAY, FIXTURE, HOME, act, agreed, begin, data, modelOf, payloadOf, players, reach, scored } from "./helpers/post-cases.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { gameUrl, postMatchUrl, teamUrl } from "../src/core/routes.mjs";
import { POST_STEPS } from "../src/domain/post-match/rules.mjs";
import { POST_OPPONENT_STATES, opponentState, postAdvanceKey, postModel, scoreWords } from "../src/screens/matches/post-model.mjs";
import { prepFrameMarkup } from "../src/screens/matches/prep-frame.mjs";

const dictionary = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
const frame = (model, phone = true) => mount(prepFrameMarkup(model, { phone, contentHtml: "<p>step</p>", opponentHtml: "" }));
const words = (fragment, selector) => fragment.querySelectorAll(selector).map((node) => node.textContent);

test("the steps as the side stands: done, on screen, current, later; a step asked beyond the current is the current", () => {
  const state = reach(agreed(begin()), { home: 2, away: 2 });
  const model = modelOf(state, "review");
  assert.equal(model.current, 2);
  assert.equal(model.step, "players", "asked beyond the current: the current");
  assert.equal(model.passed, false);
  assert.deepEqual(model.steps.map((step) => step.state), ["done", "done", "current", "later", "later", "later", "later"]);
  assert.deepEqual(model.steps.map((step) => step.href), [postMatchUrl("g1", "result"), postMatchUrl("g1", "fans"), postMatchUrl("g1", "players"), null, null, null, null]);
  assert.deepEqual(model.steps.map((step) => step.label), ["Score", "Income", "Players", "Roster", "Treasury", "Next", "Summary"]);
  assert.equal(model.readonly, false);
  // Back on the score: passed, read only, on screen.
  const back = modelOf(state, "result");
  assert.equal(back.step, "result");
  assert.equal(back.passed, true);
  assert.equal(back.readonly, true);
  assert.deepEqual(back.steps.map((step) => step.state), ["open", "done", "current", "later", "later", "later", "later"]);
  assert.deepEqual(back.steps.map((step) => step.onScreen), [true, false, false, false, false, false, false]);
  assert.equal(modelOf(state, "kickoff").step, "players", "a step the post-match does not have is the current one");
  assert.equal(modelOf(state).step, "players", "none asked: the current one");
  // Before the score is agreed only the score is open.
  const fresh = modelOf(begin(), "players");
  assert.equal(fresh.step, "result");
  assert.deepEqual(fresh.steps.map((step) => step.state), ["current", "later", "later", "later", "later", "later", "later"]);
  // The model carries the post-match's own facts beside the frame's.
  assert.equal(model.post, state);
  assert.equal(model.agreed, true);
  assert.equal(model.completed, false);
  assert.equal(model.confirmed, false);
  assert.equal(model.kind, "league");
  assert.equal(model.preview.roster.dedicatedFans, 4);
  assert.deepEqual([model.own.side, model.own.name, model.other.side, model.other.name], ["home", "Mock Team", "away", "Mock Rivals"]);
  // Confirmed or finished: read only on every step.
  const confirmed = modelOf(reach(state, { home: 7, away: 3 }));
  assert.equal(confirmed.confirmed, true);
  assert.equal(confirmed.readonly, true);
  const finished = structuredClone(reach(state, { home: 7, away: 7 }));
  finished.status = "completed";
  assert.equal(modelOf(finished).completed, true);
  assert.equal(modelOf(finished).readonly, true);
  assert.equal(modelOf(finished).opponent.text, "", "no line about the opponent once the match is finished");
});

test("the frame's words: a phone's title and sub, a desk's band, back to the team's matches", () => {
  const state = agreed(begin());
  const model = modelOf(state);
  assert.equal(model.title, "After the match");
  assert.equal(model.sub, "Round 7 · Mock Team 2–1 Mock Rivals");
  assert.equal(model.deskTitle, "After the match · round 7");
  assert.equal(model.deskSub, "Mock Team 2–1 Mock Rivals");
  assert.equal(model.stepsLabel, "Post-match steps");
  assert.equal(modelOf(begin()).sub, "Round 7 · Mock Team — Mock Rivals", "no score yet: the two names");
  const friendly = modelOf(state, "", {}, { fixture: { ...FIXTURE, kind: "friendly", roundNumber: null } });
  assert.equal(friendly.sub, "Friendly · Mock Team 2–1 Mock Rivals");
  assert.equal(friendly.deskTitle, "After the match · friendly");
  // The away side sees the score as the head writes it: the home side's first.
  assert.equal(modelOf(state, "", {}, { viewerSide: "away" }).sub, "Round 7 · Mock Team 2–1 Mock Rivals");
  assert.equal(model.back, teamUrl("t-home", "matches"));
  const admin = postModel(payloadOf(state, { isAdmin: true }), "away", "", { data, userId: "admin" });
  assert.equal(admin.back, gameUrl("g1"), "an administrator who is not this side's coach goes back to the game");
  assert.equal(postModel(payloadOf(state, { isAdmin: true }), "home", "", { data, userId: "u-home" }).back, teamUrl("t-home", "matches"));
  // Drawn in the preparation's frame: its own steps' label, seven dots, the head's words, «‹».
  const phone = frame(model);
  assert.equal(phone.querySelector("h1").textContent, "After the match");
  assert.equal(phone.querySelector(".g-prep__sub").textContent, "Round 7 · Mock Team 2–1 Mock Rivals");
  assert.equal(phone.querySelector("nav.g-prep__dots").getAttribute("aria-label"), "Post-match steps");
  assert.equal(phone.querySelectorAll(".g-prep__dot").length, 7);
  assert.equal(phone.querySelector("a.g-prep__back").getAttribute("href"), teamUrl("t-home", "matches"));
  const desk = frame(model, false);
  assert.equal(desk.querySelector("h1").textContent, "After the match · round 7");
  assert.equal(desk.querySelector(".g-prep__steps nav").getAttribute("aria-label"), "Post-match steps");
  assert.equal(desk.querySelector("section.g-prep__card h2").textContent, "Income");
  initLocale("ru");
  try {
    const russian = modelOf(state);
    assert.equal(russian.title, "После матча");
    assert.equal(russian.sub, "Тур 7 · Mock Team 2–1 Mock Rivals");
    assert.equal(russian.deskTitle, "После матча · тур 7");
    assert.deepEqual(russian.steps.map((step) => step.label), ["Счёт", "Доход", "Игроки", "Состав", "Казна", "Дальше", "Итог"]);
    assert.equal(russian.footer.label, "Далее: игроки");
  } finally {
    initLocale("en");
  }
});

test("a desk's summaries", () => {
  const state = reach(agreed(begin()), { home: 6, away: 6 }, { home: { deposit: 10 } });
  const model = modelOf(state);
  assert.equal(model.step, "review");
  assert.deepEqual(model.steps.map((step) => step.summary), ["2–1 · confirmed", "+80k · fans 3 → 4", "+18 SPP · injuries: 1", "0k", "safe +10k", "captain W. Brandt", "now"]);
  // The score while it is being entered, the roster's money with its sign.
  const open = modelOf(scored(begin()), "result");
  assert.deepEqual([open.steps[0].state, open.steps[0].summary], ["current", "being entered"], "DeskPostResult: «вводим», not «now» (fidelity J3)");
  const hired = act(reach(agreed(begin()), { home: 3, away: 3 }), "home", { type: "roster", operation: "hire", rowIndex: 0 });
  const roster = modelOf(hired, "fans");
  assert.equal(roster.steps[3].summary, "now");
  assert.equal(modelOf(act(hired, "home", { type: "lock-roster" })).steps[3].summary, "−50k");
  // The away side's own numbers.
  const away = modelOf(state, "", {}, { viewerSide: "away" });
  assert.equal(away.steps[0].summary, "1–2 · confirmed");
});

test("the opponent's line on each step", () => {
  const cases = [];
  const line = (state, step, viewerSide = "home") => {
    const model = modelOf(state, step, {}, { viewerSide });
    cases.push(model.opponent.state);
    return [model.opponent.state, model.opponent.text, model.opponent.done];
  };
  const fresh = begin();
  assert.deepEqual(line(fresh, "result"), ["none", "The opponent has not entered a score yet", false]);
  const sent = scored(fresh);
  assert.deepEqual(line(sent, "result"), ["waiting", "Waiting for the opponent to confirm", false]);
  assert.deepEqual(line(sent, "result", "away"), ["sent", "The opponent sent the score 1–2", true]);
  const both = agreed(fresh);
  assert.deepEqual(line(both, "result"), ["agreed", "The opponent confirmed the score 2–1", true]);
  assert.deepEqual(line(both, "fans"), ["same", "The opponent is on this step", true], "PostFans.html: the opponent on this step, the accent's dot");
  const behind = reach(both, { home: 3, away: 2 });
  assert.deepEqual(line(behind, "roster"), ["step", "The opponent is on «Players»", false], "PostRoster.html: behind, the warning's dot");
  const ahead = reach(both, { home: 2, away: 3 });
  assert.deepEqual(line(ahead, "players"), ["step", "The opponent is on «Roster»", true], "ahead: done");
  const review = reach(both, { home: 6, away: 6 });
  assert.deepEqual(line(review, "review"), ["confirmWaiting", "Waiting for the opponent to confirm", false]);
  assert.deepEqual(line(reach(review, { home: 6, away: 7 }), "review"), ["confirmed", "The opponent confirmed the summary", true]);
  assert.equal(opponentState(review, "home"), "confirmWaiting", "the side's current step by default");
  assert.equal(opponentState(both, "home"), "same");
  for (const state of cases) assert.ok(POST_OPPONENT_STATES.includes(state), state);
  assert.deepEqual(new Set(cases), new Set(POST_OPPONENT_STATES), "every state is said somewhere");
  // The phone's footer draws the line with its dot.
  const phone = frame(modelOf(behind, "roster"));
  assert.equal(phone.querySelector(".g-prep__opp").textContent, "The opponent is on «Players»");
  assert.ok(phone.querySelector(".g-prep__oppdot--wait"));
  assert.ok(frame(modelOf(both, "result")).querySelector(".g-prep__oppdot--done"));
});

test("the score in words: ours first", () => {
  const state = agreed(begin());
  assert.equal(scoreWords(state, "home"), "2–1");
  assert.equal(scoreWords(state, "away"), "1–2");
  assert.equal(scoreWords(begin(), "home"), "");
});

test("a projection the domain refuses is drawn without the roster's steps, and says why", () => {
  const seven = players("h", [3, 3, 2, 2, 1, 0, 0], { 0: { name: "W. Brandt", isCaptain: true }, 2: { name: "L. Ashby" }, 3: { name: "R. Pike" }, 4: { name: "T. Gruk" } });
  const state = structuredClone(reach(agreed(begin({ home: { roster: seven } })), { home: 3, away: 3 }));
  state.home.operations.push({ type: "sell", id: "post-g1-home-9", playerId: "h1", rowIndex: 0 });
  state.home.deposit = 0;
  const model = modelOf(state);
  assert.equal(model.preview.invalid, "POST_SELL");
  assert.equal(model.preview.roster.players.length, 7, "the sale is not taken");
  assert.deepEqual(model.preview.accounting.transactions, []);
  assert.equal(model.error, "Selling this player would leave fewer than seven rostered players.");
  // A write's refusal is said first.
  assert.equal(modelOf(state, "", { error: "Refused." }).error, "Refused.");
  // A projection the domain takes: nothing invalid, nothing said.
  assert.equal(modelOf(reach(agreed(begin()), { home: 3, away: 3 })).preview.invalid, undefined);
  assert.equal(modelOf(reach(agreed(begin()), { home: 3, away: 3 })).error, "");
  assert.equal(frame(model).querySelector('.g-prep__alert[role="alert"] .g-callout__title').textContent, model.error, "said where a write's refusal is");
});

test("the footer leads on to the next step once it is open, and waits with why until then", () => {
  const fresh = modelOf(scored(begin()));
  assert.deepEqual([fresh.footer.kind, fresh.footer.label, fresh.footer.disabled, fresh.footer.hint], ["next", "Next: income and fans", true, "Opens once the opponent confirms the score"]);
  const passed = modelOf(reach(agreed(begin()), { home: 3, away: 3 }), "fans");
  assert.deepEqual([passed.footer.label, passed.footer.href, passed.footer.disabled], ["Next: players", postMatchUrl("g1", "players"), false]);
  const current = modelOf(reach(agreed(begin()), { home: 3, away: 3 }));
  assert.deepEqual([current.footer.label, current.footer.disabled, current.footer.hint], ["Next: treasury", true, "Opens once this step is done"]);
  assert.equal(modelOf(reach(agreed(begin()), { home: 6, away: 6 })).footer.kind, "none", "the summary leads nowhere further");
});

test("the key of the roster sheet's line of a post-match player", () => {
  assert.equal(postAdvanceKey("h3"), "h3#0");
  assert.equal(postAdvanceKey("old id"), "old_id#0");
});

test("names are text", () => {
  const hostile = HOME.map((player, index) => (index === 0 ? { ...player, name: HOSTILE } : player));
  const state = reach(agreed(begin({ home: { roster: hostile, team: HOSTILE }, away: { team: HOSTILE, roster: AWAY } })), { home: 6, away: 6 });
  for (const phone of [true, false]) {
    const fragment = mount(prepFrameMarkup(modelOf(state, "", { error: HOSTILE }, { isAdmin: true }), { phone, contentHtml: "", opponentHtml: "", noticesHtml: "" }));
    assert.ok(!fragment.querySelector("img"));
    assertCspSafe(fragment);
  }
  assert.match(modelOf(state).steps[5].summary, /captain <img/);
});

test("every key in both dictionaries, the steps' and the opponent's by their sets", () => {
  assertDictionaryCovers("src/screens/matches/post-model.mjs", "src/screens/matches/prep-frame.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const step of POST_STEPS) assert.ok(words[`after.step.${step}`], `${locale} after.step.${step}`);
    for (const step of POST_STEPS.slice(1)) assert.ok(words[`after.next.${step}`], `${locale} after.next.${step}`);
    for (const state of POST_OPPONENT_STATES) assert.ok(words[`after.opponent.${state}`], `${locale} after.opponent.${state}`);
    for (const key of Object.keys(words).filter((key) => key.startsWith("after."))) assert.ok(dictionary(locale === "en" ? "ru" : "en")[key], `${key} in both`);
  }
  assert.ok(Object.isFrozen(POST_OPPONENT_STATES));
  assert.deepEqual(words(frame(modelOf(agreed(begin()))), ".g-prep__dotlabel"), ["Score", "Income", "Players", "Roster", "Treasury", "Next", "Summary"]);
});
