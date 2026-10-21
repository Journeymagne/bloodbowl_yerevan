import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { AWAY, FIXTURE, HOME, RECORDS, act, agreed, begin, data, hurt, modelOf, reach } from "./helpers/post-cases.mjs";
import { formatMoney } from "../src/core/format.mjs";
import { postMatchUrl, teamUrl } from "../src/core/routes.mjs";
import { calculateMatchCtv, createMatchSide } from "../src/domain/match/roster.mjs";
import { postFinance } from "../src/domain/post-match/finance.mjs";
import { projectPostRoster } from "../src/domain/post-match/roster.mjs";
import { prepFrameMarkup } from "../src/screens/matches/prep-frame.mjs";
import { financeDraft, financeStep, nextDraft, nextStep } from "../src/screens/matches/post-money.mjs";
import { completedMarkup, reviewStep } from "../src/screens/matches/post-review.mjs";

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const CSS = "src/screens/matches/post-money.css";
const words = (fragment, selector) => fragment.querySelectorAll(selector).map((node) => node.textContent);
const rows = (fragment) => fragment.querySelectorAll(".g-after__row").map((row) => [row.querySelector(".g-after__rowk").childNodes[0].textContent,
  row.querySelector(".g-after__rowsub")?.textContent ?? "", row.querySelector(".g-after__rowv").textContent]);

/** Ours on `step`, the opponent at `theirs`; `options` for the steps done on the way (`home`/`away`). */
const at = (stage, theirs = stage, begun = begin(), options = {}) => reach(agreed(begun, { events: options.events ?? RECORDS }), { home: stage, away: theirs }, options);
const finance = (model, change = {}) => financeStep(model, { ...financeDraft(model), ...change });
const drawFinance = (model, change) => mount(finance(model, change).contentHtml);
const roster = (state, operation) => act(state, "home", { type: "roster", ...operation });

test("the treasury's lines are the domain's, the safe a counter up to what the match brought", () => {
  let state = at(3, 3);
  state = roster(roster(state, { operation: "staff", key: "assistantCoaches", delta: 1 }), { operation: "staff", key: "cheerleaders", delta: 1 });
  state = act(state, "home", { type: "lock-roster" });
  const model = modelOf(state, "finance");
  assert.equal(model.step, "finance");
  assert.deepEqual(financeDraft(model), { deposit: 0, roll: null, first: null, second: null });
  const fragment = drawFinance(model, { deposit: 20 });
  assert.deepEqual(rows(fragment.querySelector(".g-after__card")), [
    ["Treasury before the match", "", "70k"], ["Income from the match", "", "+80k"], ["Purchases after the match", "Assistant Coaches, Cheerleaders", "−20k"], ["Into the safe", "", "−20k"],
  ]);
  const projected = projectPostRoster({ ...state, home: { ...state.home, deposit: 20, mistake: {} } }, "home", data);
  assert.equal(fragment.querySelector(".g-after__totalk").textContent, "Treasury after");
  assert.equal(fragment.querySelector(".g-after__big--ink").textContent, formatMoney(projected.finance.after));
  assert.equal(projected.finance.after, postFinance({ ...state, home: { ...state.home, deposit: 20 } }, "home", { ...state.home.baseRoster, treasury: 130 }).after);
  // The safe: «now 20k → 40k», its «+» closed at 50k, the income and the treasury.
  const safe = fragment.querySelector('[data-resource-key="deposit"]');
  assert.equal(safe.querySelector(".g-resource__name").textContent, "Coach's Safe");
  assert.equal(safe.querySelector(".g-resource__note").textContent, "Up to 50k of the match income · now 20k → 40k");
  assert.equal(safe.querySelector(".g-resource__value").textContent, "20");
  assert.equal(safe.querySelector('[data-resource-step="1"]').getAttribute("aria-disabled"), null);
  assert.equal(drawFinance(model, { deposit: 50 }).querySelector('[data-resource-key="deposit"] [data-resource-step="1"]').getAttribute("title"), "The safe takes 50k at most now");
  assert.ok(drawFinance(model).querySelector('[data-resource-key="deposit"] [data-resource-step="-1"]').hasAttribute("disabled"));
  // The treasury bounds it when less is left: 80k of income, a Lineman bought, 30k left.
  const spent = act(roster(at(3, 3, begin({ home: { treasury: 0 } })), { operation: "hire", rowIndex: 0 }), "home", { type: "lock-roster" });
  const poor = modelOf(spent, "finance");
  const draw = mount(financeStep(poor, { ...financeDraft(poor), deposit: 30 }).contentHtml);
  assert.equal(draw.querySelector('[data-resource-key="deposit"] [data-resource-step="1"]').getAttribute("title"), "The safe takes 30k at most now");
  // A sale is said.
  const sold = act(roster(at(3, 3), { operation: "sell", playerId: "h3" }), "home", { type: "lock-roster" });
  assert.deepEqual(rows(drawFinance(modelOf(sold, "finance"))).find(([label]) => label === "Sales"), ["Sales", "", `+${formatMoney(37.5)}`]);
});

test("Expensive Mistakes: a die from 100k, then a D3 or two D6 as the kind needs; under 100k no roll", () => {
  const model = modelOf(at(4, 3), "finance");
  const card = (change) => drawFinance(model, change).querySelectorAll(".g-after__card").at(-1);
  const pending = card({});
  assert.equal(pending.querySelector(".g-after__label").textContent, "Expensive Mistakes");
  assert.match(pending.textContent, /100k or more in the treasury — roll a D6 at the table\./);
  const dice = pending.querySelector('[role="radiogroup"][data-after-mistake]');
  assert.equal(dice.querySelectorAll('[role="radio"]').length, 6);
  assert.equal(pending.querySelector(".g-after__mistake--pending").textContent, "Roll the D6");
  assert.match(pending.textContent, /Money in the safe is not at risk\./);
  // 150k and a 1: a Minor Incident, its D3.
  const minor = card({ roll: 1 });
  assert.equal(minor.querySelector(".g-after__mistake--loss").textContent, "Minor Incident: you lose D3 × 10k");
  const d3 = minor.querySelector('[role="radiogroup"][data-after-extra="first"]');
  assert.equal(d3.querySelectorAll('[role="radio"]').length, 3);
  assert.equal(d3.getAttribute("aria-label"), "D3 at the table");
  assert.equal(card({ roll: 4 }).querySelector(".g-after__mistake").textContent, "Nothing happened");
  // 30k in the safe leaves 120k: still a roll. A treasury of 90k: none.
  const under = modelOf(at(4, 3, begin({ home: { treasury: 10 } })), "finance");
  const none = drawFinance(under).querySelectorAll(".g-after__card").at(-1);
  assert.ok(!none.querySelector("[data-after-mistake]"));
  assert.equal(none.querySelector(".g-after__mistake").textContent, "Less than 100k in the treasury — no roll");
  // A Catastrophe: two D6.
  const rich = modelOf(at(4, 3, begin({ home: { treasury: 600 } })), "finance");
  const catastrophe = drawFinance(rich, { roll: 1 });
  assert.equal(catastrophe.querySelector(".g-after__mistake--loss").textContent, "Catastrophe: 2D6 × 10k is left");
  assert.deepEqual(catastrophe.querySelectorAll('[data-after-extra] ').map((group) => [group.getAttribute("data-after-extra"), group.querySelectorAll('[role="radio"]').length]), [["first", 6], ["second", 6]]);
  assert.equal(drawFinance(rich, { roll: 3 }).querySelector(".g-after__mistake--loss").textContent, "Major Incident: the treasury is halved");
  // The button waits for the dice the kind needs.
  assert.deepEqual([finance(model).footer.disabled, finance(model).footer.hint], [true, "Mark the dice first"]);
  assert.equal(finance(model, { roll: 1 }).footer.hint, "Mark the dice first", "the D3 still to mark");
  assert.deepEqual([finance(model, { roll: 1, first: 2 }).footer.disabled, finance(model, { roll: 1, first: 2 }).footer.action], [false, "finance"]);
  assert.equal(finance(model, { roll: 1, first: 2 }).footer.label, "Next: the next match");
  assert.equal(finance(under).footer.disabled, false, "no roll under 100k");
});

test("the treasury's rows add up to «Treasury after»: a Minor Incident's D3 is a row of its own", () => {
  const model = modelOf(at(4, 3), "finance");
  const money = (text) => Number(text.replace("−", "-").replace("+", "").replace(/k$/, ""));
  const card = drawFinance(model, { roll: 1, first: 2 }).querySelector(".g-after__card");
  const lines = rows(card);
  assert.deepEqual(lines.at(-1), ["Expensive Mistakes", "", "−20k"]);
  assert.equal(lines.reduce((sum, [, , value]) => sum + money(value), 0), money(card.querySelector(".g-after__big--ink").textContent));
  // Nothing lost, no row: a 4, or the D3 not yet marked.
  for (const change of [{ roll: 4 }, { roll: 1 }]) {
    assert.ok(!rows(drawFinance(model, change).querySelector(".g-after__card")).some(([label]) => label === "Expensive Mistakes"));
  }
});

test("the treasury step waits for the opponent's Players step", () => {
  const model = modelOf(at(4, 2), "finance");
  assert.equal(model.step, "finance");
  const footer = finance(model, { roll: 4 }).footer;
  assert.deepEqual([footer.disabled, footer.hint], [true, "Opens once the opponent saves the «Players» step"]);
  // Passed: read only, on to the next match.
  const passed = modelOf(at(5, 5), "finance");
  const done = finance(passed);
  assert.deepEqual([done.footer.kind, done.footer.href], ["next", postMatchUrl("g1", "next")]);
  assert.equal(mount(done.contentHtml).querySelector('[data-resource-key="deposit"] [data-resource-step="1"]').getAttribute("aria-disabled"), "true");
});

test("next: who comes back, who misses the next match and why, TV and CTV before and after, the captain", () => {
  const state = at(5, 5);
  const model = modelOf(state, "next");
  const fragment = mount(nextStep(model, nextDraft(model)).contentHtml);
  const cards = fragment.querySelectorAll(".g-after__card");
  assert.equal(cards[0].querySelector(".g-after__label").textContent, "Back for the next match");
  assert.deepEqual(rows(cards[0]), [["#9 J. Corr", "", "in the lineup"]]);
  assert.equal(cards[1].querySelector(".g-after__label").textContent, "Miss the next match");
  assert.deepEqual(rows(cards[1]), [["#2 O. Krell", "", "Lasting Injury · AG 3+ → 4+"]]);
  const value = (roster, all) => {
    const side = createMatchSide({ user: state.home.user, team: { ...state.home.team, roster } }, data);
    return calculateMatchCtv(all ? { ...side, players: side.players.map((player) => ({ ...player, skipNextGame: false })) } : side).total;
  };
  const after = model.preview.roster;
  assert.deepEqual(rows(cards[2]), [
    ["TV", "", `${formatMoney(value(state.home.baseRoster, true))} → ${formatMoney(value(after, true))}`],
    ["CTV", "without those missing", `${formatMoney(value(state.home.baseRoster, false))} → ${formatMoney(value(after, false))}`],
    ["Treasury", "", formatMoney(after.treasury)], ["Coach's Safe", "", formatMoney(after.coachesSafe)],
  ]);
  const captain = fragment.querySelector('[role="radiogroup"][data-after-captain]');
  assert.equal(captain.getAttribute("aria-label"), "Captain for the next match");
  assert.equal(captain.querySelectorAll('[role="radio"]').length, 12);
  assert.equal(captain.querySelector('[aria-checked="true"]').textContent, "#1 W. Brandt", "the captain the team has");
  assert.deepEqual(nextDraft(model), { captain: "h1" });
  // One retired for the season is not a captain's choice; a captain who is is not kept.
  const retiring = { home: [...RECORDS.home.filter((event) => event.counter !== "injury"), ...hurt("h1", { code: "lasting", stat: "ma" })], away: RECORDS.away };
  const retired = at(2, 2, begin({ events: retiring }), { events: retiring });
  const saved = act(retired, "home", { type: "statistics", statistics: retired.home.statistics, injuries: { h1: { code: "lasting", stat: "ma", retire: true } }, mvps: ["h3"] }, retiring);
  const later = modelOf(reach(act(saved, "home", { type: "lock-players" }, retiring), { home: 5, away: 5 }, { events: retiring }), "next");
  assert.ok(!mount(nextStep(later, nextDraft(later)).contentHtml).querySelector('[data-captain="h1"]'));
  assert.equal(nextDraft(later).captain, "h2", "the first who may be");
  assert.match(mount(nextStep(later, nextDraft(later)).contentHtml).textContent, /#1 W. Brandt.*Lasting Injury · MA 7 → 6/);
  // The footer: «Next: summary», closed without a captain.
  const footer = nextStep(model, { captain: "" }).footer;
  assert.deepEqual([footer.action, footer.label, footer.disabled, footer.hint], ["next", "Next: summary", true, "Choose the captain first"]);
  assert.equal(nextStep(model, nextDraft(model)).footer.disabled, false);
  const passed = modelOf(at(6, 6), "next");
  assert.deepEqual([nextStep(passed, nextDraft(passed)).footer.kind, nextStep(passed, nextDraft(passed)).footer.href], ["next", postMatchUrl("g1", "review")]);
});

test("the summary: both sides, confirmed or waiting, MVP, SPP, injuries, the dead, advancements, purchases, money", () => {
  const events = { home: RECORDS.home, away: [...RECORDS.away, ...hurt("a3", { code: "dead" })] };
  let state = at(3, 3, begin({ events }), { events, home: { mvps: ["h3"] } });
  state = act(roster(state, { operation: "staff", key: "assistantCoaches", delta: 1 }), "home", { type: "lock-roster" }, events);
  state = reach(state, { home: 7, away: 6 }, { events });
  const model = modelOf(state, "review");
  const { contentHtml } = reviewStep(model);
  const [ours, theirs] = mount(contentHtml).querySelectorAll(".g-after__side");
  assert.equal(ours.querySelector(".g-after__team").textContent, "Mock Team");
  assert.equal(ours.querySelector(".g-status--live").textContent, "Confirmed");
  assert.equal(theirs.querySelector(".g-status--wait").textContent, "Waiting");
  const after = model.preview.roster;
  assert.deepEqual(rows(ours), [
    ["MVP", "", "L. Ashby · +5 SPP"], ["SPP for the match", "", "+18 · players: 4, with MVP"], ["Injuries", "", "O. Krell · Lasting Injury (AG)"],
    ["Advancement", "", "—"], ["Purchases", "", "Assistant Coaches · −10k"], ["Treasury", "", `70k → ${formatMoney(after.treasury)}`],
    ["Coach's Safe", "", `20k → ${formatMoney(after.coachesSafe)}`], ["Dedicated Fans", "", "3 → 4"],
  ]);
  assert.deepEqual(rows(theirs), [["MVP", "", "A. Player 1"], ["Injuries", "", "—"], ["Death", "", "A. Player 3"], ["Treasury", "", `60k → ${formatMoney(projectPostRoster(state, "away", data).roster.treasury)}`]]);
  // Rookie protection: the dead are Badly Hurt, and no row of the dead.
  const young = at(6, 6, begin({ events, gamesPlayed: 1 }), { events });
  const [, rookies] = mount(reviewStep(modelOf(young, "review")).contentHtml).querySelectorAll(".g-after__side");
  assert.ok(!rows(rookies).some(([label]) => label === "Death"));
  assert.deepEqual(rows(rookies)[1], ["Injuries", "", "A. Player 3 · Badly Hurt"]);
});

test("the summary names the dead and says they go to «Fallen»", () => {
  const model = modelOf(at(6, 6), "review");
  assert.match(mount(reviewStep(model).contentHtml).querySelector(".g-after__note").textContent,
    /^The match is finished once both coaches confirm the summary\. Then the rosters and the treasuries are updated, the dead go to «Fallen», and the result goes into the table\.$/);
  const friendly = modelOf(at(6, 6), "review", {}, { fixture: { ...FIXTURE, kind: "friendly" } });
  assert.doesNotMatch(mount(reviewStep(friendly).contentHtml).querySelector(".g-after__note").textContent, /table/);
  const events = { home: [...RECORDS.home, ...hurt("h6", { code: "dead" })], away: RECORDS.away };
  const dead = modelOf(at(6, 6, begin({ events }), { events }), "review");
  assert.deepEqual(rows(mount(reviewStep(dead).contentHtml).querySelector(".g-after__side")).find(([label]) => label === "Death"), ["Death", "", "H. Player 6"]);
});

test("a desk's result: the score, the outcome and the points in parts", () => {
  const model = modelOf(at(6, 6), "review");
  const step = reviewStep(model);
  assert.equal(step.cardTitle, "Match summary");
  const aside = mount(step.asideHtml);
  assert.deepEqual([aside.querySelector(".g-after__resultk").textContent, aside.querySelector(".g-after__resultscore").textContent, aside.querySelector(".g-after__resultv").textContent],
    ["Result", "2–1", "Win · +3 for the win, +1 for 3+ CAS"]);
  const away = mount(reviewStep(modelOf(at(6, 6), "review", {}, { viewerSide: "away" })).asideHtml);
  assert.deepEqual([away.querySelector(".g-after__resultscore").textContent, away.querySelector(".g-after__resultv").textContent], ["1–2", "Loss · +0 for the loss"]);
  const friendly = mount(reviewStep(modelOf(at(6, 6), "review", {}, { fixture: { ...FIXTURE, kind: "friendly" } })).asideHtml);
  assert.equal(friendly.querySelector(".g-after__resultv").textContent, "Win · Friendly: off the table");
  // In the frame: the card's title is the prototype's.
  const desk = mount(prepFrameMarkup({ ...model, footer: step.footer }, { phone: false, ...step, opponentHtml: "" }));
  assert.equal(desk.querySelector("section.g-prep__card h2").textContent, "Match summary");
  assert.ok(desk.querySelector(".g-prep__column .g-after__resultscore"));
});

test("confirm, then finish once the opponent has confirmed", () => {
  const confirm = reviewStep(modelOf(at(6, 6), "review")).footer;
  assert.deepEqual([confirm.kind, confirm.action, confirm.label, confirm.disabled], ["action", "confirm", "Confirm the summary", false]);
  const waiting = reviewStep(modelOf(at(7, 6), "review")).footer;
  assert.deepEqual([waiting.action, waiting.label, waiting.disabled, waiting.hint], ["finish", "Finish the match", true, "Opens once the opponent confirms"]);
  const ready = at(7, 7);
  assert.equal(ready.status, "ready");
  const finish = reviewStep(modelOf(ready, "review")).footer;
  assert.deepEqual([finish.action, finish.disabled, finish.hint], ["finish", false, ""]);
  const done = structuredClone(ready);
  done.status = "completed";
  assert.equal(reviewStep(modelOf(done, "review")).footer.kind, "none");
  const notice = mount(completedMarkup(modelOf(done, "review")));
  assert.equal(notice.querySelector(".g-callout__title").textContent, "The match is finished");
  assert.deepEqual(notice.querySelectorAll("a").map((link) => [link.textContent, link.getAttribute("href")]),
    [["To the matches", teamUrl("t-home", "matches")], ["To the roster", teamUrl("t-home", "roster")]]);
});

test("names are text", () => {
  const hostile = HOME.map((player, index) => (index === 2 || index === 8 ? { ...player, name: HOSTILE } : player));
  const state = at(5, 5, begin({ home: { roster: hostile, team: HOSTILE }, away: { team: HOSTILE, roster: AWAY } }), { home: { mvps: ["h3"] } });
  const review = at(6, 6, begin({ home: { roster: hostile, team: HOSTILE }, away: { team: HOSTILE, roster: AWAY } }), { home: { mvps: ["h3"] } });
  const fragment = mount(`${finance(modelOf(state, "finance")).contentHtml}${nextStep(modelOf(state, "next"), nextDraft(modelOf(state, "next"))).contentHtml}`
    + `${reviewStep(modelOf(review, "review")).contentHtml}${reviewStep(modelOf(review, "review")).asideHtml}`);
  assert.ok(!fragment.querySelector("img"));
  assertCspSafe(fragment);
  assert.match(fragment.textContent, /<img src=x/);
});

test("every key in both dictionaries, the mistakes by their set", () => {
  assertDictionaryCovers("src/screens/matches/post-money.mjs", "src/screens/matches/post-review.mjs", "src/screens/matches/post-roster.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const kind of ["none", "pending", "minor", "major", "catastrophe", "under"]) assert.ok(words[`after.mistake.${kind}`], `${locale} after.mistake.${kind}`);
  }
});

test("styled as the prototypes draw it; readable; D2; nothing cut with «…»", () => {
  const sheets = [CSS, "src/screens/matches/post.css", "src/screens/matches/post-players.css", "src/screens/matches/prep.css", "resource-counter.css", "status-chip.css", "callout.css", "button.css"];
  const rich = modelOf(at(4, 3, begin({ home: { treasury: 600 } })), "finance");
  for (const [model, change] of [[modelOf(at(4, 3), "finance"), { roll: 1 }], [rich, { roll: 1 }], [modelOf(at(5, 5), "finance"), {}]]) assertStyled(mount(finance(model, change).contentHtml), ...sheets);
  const next = modelOf(at(5, 5), "next");
  assertStyled(mount(nextStep(next, nextDraft(next)).contentHtml), ...sheets);
  const review = modelOf(at(7, 6), "review");
  assertStyled(mount(`${reviewStep(review).contentHtml}${reviewStep(review).asideHtml}${completedMarkup(review)}`), ...sheets);
  const own = (selector, property) => valuesOf(CSS, selector, property);
  // The prototypes' values.
  assert.deepEqual(own(".g-after__big--ink", "color"), ["var(--ink)"], "«Treasury after» in the ink (PostFinance.html)");
  assert.deepEqual(own(".g-after__mistake", "font"), ["700 15px/1.35 var(--font-body)"]);
  assert.deepEqual(own(".g-after__options--captain", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(own(".g-after__sides", "grid-template-columns"), ["repeat(auto-fit, minmax(300px, 1fr))"]);
  assert.deepEqual(own(".g-after__team", "font"), ["700 16px/1.3 var(--font-body)"]);
  assert.deepEqual(own(".g-after__resultscore", "font"), ["700 40px/1.1 var(--font-display)"]);
  assert.deepEqual(own(".g-after__resultv", "font"), ["700 14px/1.35 var(--font-body)"]);
  assert.deepEqual(own(".g-after__sidehead .g-status::before", "width"), ["7px"]);
  // Readable in every palette.
  for (const selector of [".g-after__mistake", ".g-after__mistake--loss", ".g-after__mistake--pending", ".g-after__resultk", ".g-after__resultv", ".g-after__big--ink"]) {
    assertReadable(CSS, selector, "color", ["--surface"], 4.5);
  }
  // D2: the safe's counter a thumb's up to 900px, the prototype's 34px from 901px.
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-after__card--safe .g-resource__btn", "width"), ["34px"]);
  assert.equal(inMedia(CSS, "max-width: 900px", ".g-after__card--safe .g-resource__btn", "width").length, 0, "the counter's own 44px on a phone");
  // Nothing cut.
  const bare = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(bare, /ellipsis|text-overflow|line-clamp|nowrap/);
  assert.ok(own(".g-after__team", "overflow-wrap").includes("anywhere"));
  assert.ok(valuesOf("src/screens/matches/post.css", ".g-after__rowv", "overflow-wrap").includes("anywhere"), "a long value wraps");
});
