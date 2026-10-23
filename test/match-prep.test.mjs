import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { assertContrast, assertReadable, blocks, inMedia, mediaText, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints } from "./helpers/css.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { initLocale, t } from "../src/core/i18n.mjs";
import { formatMoney } from "../src/core/format.mjs";
import { gameUrl, postMatchUrl, preMatchUrl, teamUrl } from "../src/core/routes.mjs";
import { applyPreparationAction, createPreparation } from "../src/domain/match/preparation.mjs";
import { MATCH_STEPS } from "../src/domain/match/rules.mjs";
import { calculateMatchCtv } from "../src/domain/match/roster.mjs";
import { PREP_OPPONENT_STATES, prepModel } from "../src/screens/matches/prep-model.mjs";
import { prepFrameMarkup } from "../src/screens/matches/prep-frame.mjs";
import { fansMarkup, prepStepMarkup, reviewMarkup, rosterMarkup, weatherMarkup } from "../src/screens/matches/prep-steps.mjs";
import { prepResetWords } from "../src/screens/team/roster/panel.mjs";

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const CSS = "src/screens/matches/prep.css";

/** Players `[rowIndex, …]` of the Human roster, numbered from 1, with what each `marks` says on top. */
const players = (prefix, rows, marks = {}) => rows.map((rowIndex, index) => ({
  id: `${prefix}-${index + 1}`, rowIndex, number: String(index + 1), name: `${prefix} ${index + 1}`, ...marks[index],
}));
const source = (id, name, roster, dedicatedFans = 3) => ({ user: { id: `u-${id}`, login: id },
  team: { id, name, baseTeamSlug: "teams/human", revision: 1, roster: { players: roster, treasury: 70, dedicatedFans } } });
// Ours (PreRoster.html): two Blitzers — W. Brandt the captain —, two Catchers, a Thrower, six Linemen (J. Corr, #9, out) and an Ogre.
const ASH = players("ash", [3, 3, 2, 2, 1, 0, 0, 0, 0, 0, 0, 5], { 0: { name: "W. Brandt", isCaptain: true }, 8: { name: "J. Corr", skipNextGame: true, absence: { code: "miss" } } });
// Theirs: nine Linemen, Dedicated Fans 4.
const SIL = players("sil", [0, 0, 0, 0, 0, 0, 0, 0, 0]);
const FIXTURE = { id: "g1", kind: "league", seasonName: "Mock Season", roundNumber: 7, tableNumber: 1, closed: false };

const FANS = [["home", { type: "fans", value: 2 }], ["away", { type: "fans", value: 1 }]];
const WEATHER = [["home", { type: "weather", season: "Autumn", home: 3, away: 4 }]];
const ROSTERS = [["home", { type: "lock-roster" }], ["away", { type: "lock-roster" }]];
// We are dearer: we buy first.
const BASKETS = [["home", { type: "lock-basket" }], ["away", { type: "lock-basket" }]];

/** The payload `GET …/preparation` sends after `actions`, as the domain applies them. */
function payloadAt(actions = [], over = {}, { ours = ASH, theirs = SIL } = {}) {
  let preparation = createPreparation({ home: source("t1", "Ashgrove Wardens", ours), away: source("r1", "Silverbrook Rangers", theirs, 4) }, data);
  for (const [side, action] of actions) preparation = applyPreparationAction(preparation, side, action, data);
  return { preparation, snapshots: {}, viewerSide: "home", isAdmin: false, fixture: FIXTURE, ...over };
}
const modelAt = (actions, step = "", ui = {}, over = {}) => prepModel(payloadAt(actions, over), "home", step, { data, userId: "u-t1", ...ui });
const frame = (model, phone = true) => mount(prepFrameMarkup(model, { phone, ...prepStepMarkup(model, data, phone) }));
const words = (fragment, selector) => fragment.querySelectorAll(selector).map((node) => node.textContent);

test("the steps as the preparation stands: done, the one on screen, the current, later", () => {
  const model = modelAt(FANS);
  assert.equal(model.current, 1);
  assert.equal(model.step, "weather");
  assert.deepEqual(model.steps.map((step) => step.state), ["done", "current", "later", "later", "later"]);
  assert.deepEqual(model.steps.map((step) => step.href), [preMatchUrl("g1", "fans"), preMatchUrl("g1", "weather"), null, null, null], "links only to the first two");
  assert.equal(model.steps[0].summary, "Fan Factor 5 : 5");
  assert.equal(model.steps[1].summary, "now");
  assert.deepEqual(model.steps.slice(2).map((step) => step.summary), ["", "", ""]);
  // Back on the fans: open, the current still the weather.
  const back = modelAt(FANS, "fans");
  assert.deepEqual(back.steps.map((step) => step.state), ["open", "current", "later", "later", "later"]);
  assert.equal(back.step, "fans");
  // Further on: the weather's name, the lineups, the purchases.
  const later = modelAt([...FANS, ...WEATHER, ...ROSTERS, ...BASKETS]);
  assert.deepEqual(later.steps.map((step) => step.summary), ["Fan Factor 5 : 5", "Perfect Conditions", "11 and 9 in the lineup", `${formatMoney(0)} and ${formatMoney(0)}`, "now"]);
});

test("a step asked beyond the current is the current", () => {
  assert.equal(modelAt(FANS, "review").step, "weather");
  assert.equal(modelAt([], "kickoff").step, "fans", "a step the preparation does not have is the current one");
  assert.equal(modelAt([...FANS, ...WEATHER], "fans").step, "fans", "an earlier one is shown");
});

test("a phone's frame: back to the team's matches, the title, the dots, the footer", () => {
  const model = modelAt([["home", { type: "fans", value: 2 }]]);
  const fragment = frame(model);
  const back = fragment.querySelector("a.g-prep__back");
  assert.equal(back.getAttribute("href"), teamUrl("t1", "matches"));
  assert.equal(back.getAttribute("aria-label"), "Back to the matches");
  assert.equal(fragment.querySelector("h1.g-prep__title").textContent, "Before the match");
  assert.equal(fragment.querySelector(".g-prep__sub").textContent, "Round\u00a07 · Ashgrove Wardens — Silverbrook Rangers");
  const dots = fragment.querySelector("nav.g-prep__dots");
  assert.equal(dots.getAttribute("aria-label"), "Preparation steps");
  assert.equal(dots.querySelectorAll(".g-prep__dot").length, 5);
  assert.deepEqual(words(dots, ".g-prep__dotlabel"), ["Fans", "Weather", "Roster", "Inducements", "Start"]);
  const current = dots.querySelector('[aria-current="step"]');
  assert.equal(current.tagName, "A");
  assert.equal(current.getAttribute("href"), preMatchUrl("g1", "fans"));
  assert.deepEqual(dots.querySelectorAll("a").length, 1, "the later steps are no links");
  // The footer: the opponent has not rolled — «Next: Weather» closed, and why.
  assert.equal(fragment.querySelector(".g-prep__opp").textContent, "Waiting for the opponent's roll");
  assert.ok(fragment.querySelector(".g-prep__oppdot--wait"));
  const next = fragment.querySelector(".g-prep__cta");
  assert.equal(next.tagName, "BUTTON");
  assert.equal(next.textContent, "Next: weather");
  assert.ok(next.hasAttribute("disabled"));
  assert.equal(fragment.querySelector(".g-prep__hint").textContent, "Opens once both have rolled");
  // Both rolled: a link on.
  const on = frame(modelAt(FANS, "fans"));
  assert.equal(on.querySelector("a.g-prep__cta").getAttribute("href"), preMatchUrl("g1", "weather"));
  assert.equal(on.querySelector(".g-prep__opp").textContent, "The opponent has entered their roll");
  assert.ok(on.querySelector(".g-prep__oppdot--done"));
  // An administrator who is not this side's coach goes back to the game, and picks the side.
  const admin = frame(prepModel(payloadAt([], { isAdmin: true }), "away", "", { data, userId: "admin" }));
  assert.equal(admin.querySelector("a.g-prep__back").getAttribute("href"), gameUrl("g1"));
  const sides = admin.querySelector('.g-seg[data-seg-group="prep-side"]');
  assert.equal(sides.getAttribute("aria-label"), "Side");
  assert.deepEqual(words(sides, '[role="radio"]'), ["Ashgrove Wardens", "Silverbrook Rangers"]);
  assert.equal(sides.querySelector('[aria-checked="true"]').textContent, "Silverbrook Rangers");
  assert.ok(!frame(model).querySelector('[data-seg-group="prep-side"]'), "a coach has no choice of side");
});

test("a desk's frame: the steps aside with their summaries, the card, the column", () => {
  const model = modelAt([...FANS, ...WEATHER, ...ROSTERS, ...BASKETS]);
  const fragment = frame(model, false);
  assert.equal(fragment.querySelector("h1").textContent, "Before the match · round 7");
  assert.equal(fragment.querySelector(".g-prep__band .g-prep__sub").textContent, "Ashgrove Wardens — Silverbrook Rangers");
  const steps = fragment.querySelector("aside.g-prep__steps");
  assert.equal(steps.querySelectorAll(".g-prep__step").length, 5);
  assert.deepEqual(words(steps, ".g-prep__stepmark"), ["✓", "✓", "✓", "✓", "5"]);
  assert.deepEqual(words(steps, ".g-prep__stepname"), ["Fans", "Weather", "Roster", "Inducements", "Start"]);
  assert.equal(steps.querySelector('[aria-current="step"] .g-prep__stepsum').textContent, "now");
  assert.ok(steps.querySelector(".g-prep__step--current"));
  assert.equal(fragment.querySelector("section.g-prep__card h2").textContent, "Check before the start");
  const column = fragment.querySelector(".g-prep__column");
  assert.equal(column.querySelector(".g-prep__weatherline").textContent, "Perfect Conditions · autumn", "the weather in the right column");
  assert.equal(column.querySelector(".g-prep__team").textContent, "Silverbrook Rangers");
  assert.equal(column.querySelector('[data-prep-action="confirm"]').textContent, "Confirm the preparation");
  assert.ok(!fragment.querySelector(".g-prep__dots"), "no dots on a desk");
  const friendly = frame(modelAt([], "", {}, { fixture: { ...FIXTURE, kind: "friendly", roundNumber: null } }), false);
  assert.equal(friendly.querySelector("h1").textContent, "Before the match · friendly");
  initLocale("ru");
  try {
    assert.equal(frame(modelAt([...FANS, ...WEATHER, ...ROSTERS, ...BASKETS]), false).querySelector("h1").textContent, "Перед матчем · тур 7");
    // The step's name inside the sentence is small, as PreFans.html's «Далее: погода» (the final review, m-1).
    assert.equal(frame(modelAt([]), true).querySelector(".g-prep__cta").textContent, "Далее: погода");
  } finally {
    initLocale("en");
  }
  // The steps 260 + 2×12 and the card 520 + 2×24, content-box as the prototype's (G7).
  assert.deepEqual([valuesOf(CSS, ".g-prep__steps", "box-sizing"), valuesOf(CSS, ".g-prep__card", "box-sizing")], [["content-box"], ["content-box"]]);
});

test("the fans' dice are one radio group; the opponent's card says whether they rolled", () => {
  const before = mount(fansMarkup(modelAt([])));
  const group = before.querySelector('[role="radiogroup"][data-prep-fans]');
  assert.equal(group.getAttribute("aria-label"), "Your D3 roll");
  const faces = group.querySelectorAll('[role="radio"]');
  assert.deepEqual(faces.map((face) => [face.textContent, face.getAttribute("aria-checked"), face.getAttribute("tabindex")]),
    [["1", "false", "0"], ["2", "false", "-1"], ["3", "false", "-1"]], "none chosen: the first takes the tab");
  assert.deepEqual(words(before, ".g-prep__panel .g-status"), ["You", "Waiting"]);
  assert.deepEqual(words(before, ".g-prep__muted"), ["Dedicated Fans 3", "Dedicated Fans 4"]);
  const after = mount(fansMarkup(modelAt([["home", { type: "fans", value: 2 }], ["away", { type: "fans", value: 2 }]])));
  const chosen = after.querySelector('[role="radio"][aria-checked="true"]');
  assert.equal(chosen.textContent, "2");
  assert.equal(chosen.getAttribute("tabindex"), "0");
  assert.equal(after.querySelectorAll('[role="radio"][tabindex="0"]').length, 1);
  assert.deepEqual(words(after, ".g-prep__panel .g-status"), ["You", "Rolled"]);
  const [ours, theirs] = after.querySelectorAll(".g-prep__result");
  assert.equal(ours.textContent, "Fan Factor5");
  assert.equal(theirs.textContent, "D3 = 2 · Fan Factor6");
  // Read only once the match has begun.
  const begun = payloadAt(FANS);
  begun.preparation.status = "in_progress";
  assert.ok(mount(fansMarkup(prepModel(begun, "home", "fans", { data }))).querySelectorAll('[aria-disabled="true"]').length === 3);
});

test("the weather: the time of year, both dice rows, the sum, the result and the table with its row lit", () => {
  const fragment = mount(weatherMarkup(modelAt([...FANS, ...WEATHER], "weather"), data));
  const season = fragment.querySelector('.g-seg[data-seg-group="prep-season"]');
  assert.deepEqual(words(season, '[role="radio"]'), ["Spring", "Summer", "Autumn"]);
  assert.equal(season.querySelector('[aria-checked="true"]').textContent, "Autumn");
  assert.equal(fragment.querySelectorAll('[data-prep-weather="home"] [role="radio"]').length, 6);
  assert.equal(fragment.querySelectorAll('[data-prep-weather="away"] [role="radio"]').length, 6);
  assert.equal(fragment.querySelector('[data-prep-weather="home"]').getAttribute("aria-label"), "Ashgrove Wardens · D6");
  assert.equal(fragment.querySelector('[data-prep-weather="away"] [aria-checked="true"]').textContent, "4");
  assert.equal(fragment.querySelector(".g-prep__sum").textContent, "2D6 total: 7");
  assert.equal(fragment.querySelector(".g-prep__weathername").textContent, "Perfect Conditions");
  assert.equal(fragment.querySelector(".g-prep__weather .g-prep__muted").textContent, "Weather for the match · 4–10");
  assert.deepEqual(words(fragment, ".g-prep__wroll"), ["2", "3", "4–10", "11", "12"], "the table's rows, nothing else");
  assert.equal(fragment.querySelector(".g-prep__wrow--lit .g-prep__wroll").textContent, "4–10");
  assert.match(fragment.textContent, /The coaches choose the time of year for this match\./);
  // Before the dice: no result, the sum a dash.
  const open = mount(weatherMarkup(modelAt(FANS), data));
  assert.equal(open.querySelector(".g-prep__sum").textContent, "2D6 total: —");
  assert.ok(!open.querySelector(".g-prep__weathername"));
  assert.ok(!open.querySelector(".g-prep__wrow--lit"));
});

test("the weather in Russian: the reference heads the season in its own word, and the table is still read", () => {
  const russian = expandCollections(JSON.parse(text("public/data.ru.json")));
  initLocale("ru");
  try {
    const model = prepModel(payloadAt([...FANS, ...WEATHER]), "home", "weather", { data: russian });
    const fragment = mount(weatherMarkup(model, russian));
    assert.equal(fragment.querySelectorAll(".g-prep__wrow").length, 5);
    assert.ok(fragment.querySelector(".g-prep__wrow--lit"));
    assert.ok(fragment.querySelector(".g-prep__weathername").textContent.length > 0);
    assert.notEqual(prepModel(payloadAt([...FANS, ...WEATHER]), "home", "roster", { data: russian }).steps[1].summary, "—");
  } finally {
    initLocale("en");
  }
});

test("the roster: who plays, who misses it and why, the journeymen positions closed with why", () => {
  const model = modelAt([...FANS, ...WEATHER], "roster");
  const fragment = mount(rosterMarkup(model));
  assert.equal(fragment.querySelector(".g-prep__lineup").textContent, "In the lineup 11 of 12");
  assert.equal(fragment.querySelector(".g-prep__listhead .g-prep__muted").textContent, `CTV ${formatMoney(calculateMatchCtv(model.preparation.home).total)}`);
  const out = fragment.querySelector(".g-prep__player--out");
  assert.deepEqual(words(out, "span"), ["9", "J. Corr", "misses it · Seriously Hurt"]);
  assert.equal(fragment.querySelectorAll(".g-prep__players")[0].querySelectorAll(".g-prep__player")[1].querySelector(".g-prep__ppos").textContent, "Blitzer · C");
  // Eleven in the lineup: the journeyman is closed — seven already.
  const hire = fragment.querySelector(".g-prep__hire");
  assert.equal(hire.getAttribute("aria-disabled"), "true");
  assert.match(hire.textContent, /^\+ Journeyman · Human Lineman/);
  assert.equal(hire.querySelector(".g-prep__why").textContent, "Seven in the lineup already");
  assert.equal(fragment.querySelector("details.g-prep__more summary").textContent, "The opponent's lineup");
  assert.equal(fragment.querySelectorAll("details.g-prep__more .g-prep__player").length, 9);
  // Five in the lineup: the button is open, and a journeyman hired is listed with «Remove».
  const few = players("few", [0, 0, 0, 0, 0]);
  let thin = payloadAt([...FANS, ...WEATHER], {}, { ours: few });
  const open = mount(rosterMarkup(prepModel(thin, "home", "roster", { data })));
  assert.equal(open.querySelector(".g-prep__hire").getAttribute("data-prep-hire"), "0");
  thin = payloadAt([...FANS, ...WEATHER, ["home", { type: "add-journeyman", rowIndex: 0 }]], {}, { ours: few });
  const hired = mount(rosterMarkup(prepModel(thin, "home", "roster", { data })));
  const remove = hired.querySelector("[data-prep-remove]");
  assert.equal(remove.textContent, "Remove");
  assert.equal(remove.closest(".g-prep__player").querySelector(".g-prep__pname").textContent, "Journeyman");
  assert.equal(hired.querySelector(".g-prep__lineup").textContent, "In the lineup 6 of 6");
  // The footer: confirm, then on and a quiet way back.
  const lock = frame(model);
  assert.equal(lock.querySelector('.g-prep__cta[data-prep-action="lock-roster"]').textContent, "Confirm the roster");
  const locked = modelAt([...FANS, ...WEATHER, ...ROSTERS], "roster");
  const after = frame(locked);
  assert.equal(after.querySelector("a.g-prep__cta").textContent, "Next: inducements");
  assert.equal(after.querySelector('.g-prep__quiet[data-prep-action="reopen"]').textContent, "Change the roster");
  assert.equal(mount(rosterMarkup(locked)).querySelector(".g-prep__hire .g-prep__why").textContent, "The roster is confirmed");
  assert.equal(after.querySelector(".g-prep__opp").textContent, "The opponent confirmed the roster: 9 in the lineup");
  // Ours confirmed, theirs not: on is closed, with why.
  const half = frame(modelAt([...FANS, ...WEATHER, ROSTERS[0]], "roster"));
  assert.ok(half.querySelector("button.g-prep__cta").hasAttribute("disabled"));
  assert.equal(half.querySelector(".g-prep__hint").textContent, "Opens once both rosters are confirmed");
  assert.equal(half.querySelector(".g-prep__opp").textContent, "The opponent has not confirmed the roster yet");
});

test("the start: both sides' rows, the start closed until the opponent confirms", () => {
  const actions = [...FANS, ...WEATHER, ...ROSTERS, ...BASKETS];
  const fragment = mount(reviewMarkup(modelAt(actions), data));
  assert.equal(fragment.querySelector(".g-prep__weatherline").textContent, "Perfect Conditions · autumn");
  const [ours, theirs] = fragment.querySelector(".g-prep__sides").childNodes;
  assert.equal(ours.querySelector(".g-status").textContent, "Waiting");
  const rows = (card) => card.querySelectorAll(".g-prep__row").map((row) => [row.querySelector(".g-prep__rowk").textContent, row.querySelector(".g-prep__rowv").textContent]);
  assert.deepEqual(rows(ours).map(([label]) => label), ["Fan Factor", "In the lineup", "CTV", "Inducements", "From the treasury"]);
  assert.deepEqual(rows(ours)[1], ["In the lineup", "11 · no Journeymen"]);
  assert.deepEqual(rows(ours)[3], ["Inducements", "—"]);
  assert.deepEqual(rows(ours)[4], ["From the treasury", `${formatMoney(0)} · treasury ${formatMoney(70)}`]);
  assert.deepEqual(rows(theirs)[1], ["In the lineup", "9"], "the opponent's lineup without «no Journeymen» (pre-flight L19)");
  assert.equal(rows(theirs).length, 4, "no treasury for the opponent");
  // We confirmed: «Start the match» closed until the opponent does.
  const waiting = frame(modelAt([...actions, ["home", { type: "confirm" }]]));
  assert.deepEqual(words(waiting, ".g-prep__sides .g-status"), ["Confirmed", "Waiting"]);
  const start = waiting.querySelector('.g-prep__cta[data-prep-action="start"]');
  assert.equal(start.textContent, "Start the match");
  assert.ok(start.hasAttribute("disabled"));
  assert.equal(waiting.querySelector(".g-prep__hint").textContent, "The button opens once the opponent confirms");
  assert.equal(waiting.querySelector(".g-prep__opp").textContent, "Waiting for the opponent to confirm");
  const ready = frame(modelAt([...actions, ["home", { type: "confirm" }], ["away", { type: "confirm" }]]));
  assert.equal(ready.querySelector('.g-prep__cta[data-prep-action="start"]').hasAttribute("disabled"), false);
  assert.ok(!ready.querySelector(".g-prep__hint"));
  // Purchases and their effects are said.
  const bought = payloadAt([...FANS, ...WEATHER, ...ROSTERS, ["home", { type: "basket", id: "nuffles-prayers", quantity: 1 }]]);
  bought.preparation.home.effects = { prayers: [{ roll: 12, targets: [] }] };
  const card = mount(reviewMarkup(prepModel(bought, "home", "review", { data }), data)).querySelector(".g-prep__sides").childNodes[0];
  assert.deepEqual(rows(card).find(([label]) => label === "Inducements"), ["Inducements", `Nuffle's Prayers · ${formatMoney(15)}`]);
  assert.deepEqual(rows(card).at(-1), ["Effects", "Prayers: 12"]);
});

test("a match begun, or a round closed, reads only: the callout says so and leads to the records and the post-match", () => {
  const begun = payloadAt([...FANS, ...WEATHER, ...ROSTERS, ...BASKETS]);
  begun.preparation.status = "in_progress";
  const model = prepModel(begun, "home", "", { data });
  assert.equal(model.readonlyWhy, "started");
  const fragment = frame(model);
  assert.equal(fragment.querySelector(".g-prep__notices .g-callout__title").textContent, "The match has begun: the preparation is read-only.");
  assert.deepEqual(fragment.querySelectorAll(".g-prep__notices a").map((link) => [link.textContent, link.getAttribute("href")]),
    [["Match records", teamUrl("t1", "roster")], ["Post-match", postMatchUrl("g1")]]);
  assert.ok(!fragment.querySelector("[data-prep-action]"), "no write");
  assert.ok(!fragment.querySelector(".g-prep__foot"));
  const closed = frame(modelAt(FANS, "", {}, { fixture: { ...FIXTURE, closed: true } }));
  assert.equal(closed.querySelector(".g-callout--warn .g-callout__title").textContent, "The round is closed: the preparation is read-only.");
  assert.ok(!closed.querySelector("[data-prep-action], a.g-prep__cta, button.g-prep__cta"));
  assert.equal(closed.querySelectorAll('.g-prep__face[aria-disabled="true"]').length, 12, "the weather's step is on screen; its dice are closed too");
  const roster = mount(rosterMarkup(prepModel(begun, "home", "roster", { data })));
  assert.ok(!roster.querySelector("[data-prep-hire], [data-prep-remove]"));
  // A write refused is said, as an alert.
  const refused = frame(modelAt(FANS, "", { error: "Somebody changed the preparation." }));
  assert.equal(refused.querySelector('.g-prep__alert[role="alert"] .g-callout__title').textContent, "Somebody changed the preparation.");
});

test("the steps' names are the preparation's, and the roster's and the team page's banners name them", () => {
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const step of MATCH_STEPS) assert.ok(words[`pre.step.${step}`], `${locale} pre.step.${step}`);
    assert.equal(words["pre.step.kickoff"], undefined, `${locale}: no «Kick / receive» any more`);
  }
  assert.deepEqual(MATCH_STEPS.map((step) => dictionary("en")[`pre.step.${step}`]), ["Fans", "Weather", "Roster", "Inducements", "Start"]);
  assert.deepEqual(MATCH_STEPS.map((step) => dictionary("ru")[`pre.step.${step}`]), ["Фанаты", "Погода", "Состав", "Индьюсменты", "Старт"]);
  assert.doesNotMatch(readFileSync(new URL("../src/i18n/ru.json", import.meta.url), "utf8"), /ндусмент/, "no «индусмент» left in the Russian interface (pre-flight L24)");
  assert.match(prepResetWords("teamRoster.prep.banner"), /«Roster», «Inducements» and «Start»/);
  initLocale("ru");
  try {
    assert.match(prepResetWords("teamRoster.prep.banner"), /«Состав», «Индьюсменты» и «Старт»/);
  } finally {
    initLocale("en");
  }
  for (const file of ["src/screens/team/roster/panel.mjs", "src/screens/team/manage/index.mjs"]) assert.doesNotMatch(text(file), /pre\.step\.kickoff/, file);
});

test("names are text", () => {
  const hostile = players("h", [0, 0, 0, 0, 0, 0, 0], { 1: { name: HOSTILE, skipNextGame: true, absence: { code: "other", note: HOSTILE } } });
  let preparation = createPreparation({ home: source("t1", HOSTILE, hostile), away: source("r1", HOSTILE, SIL) }, data);
  preparation = applyPreparationAction(preparation, "home", { type: "fans", value: 1 }, data);
  const payload = { preparation, snapshots: {}, viewerSide: "home", isAdmin: true, fixture: FIXTURE };
  for (const step of ["fans", "weather", "roster", "review"]) {
    for (const phone of [true, false]) {
      const model = prepModel(payload, "home", step, { data, error: HOSTILE });
      const fragment = mount(prepFrameMarkup(model, { phone, ...prepStepMarkup(model, data, phone), contentHtml: `${fansMarkup(model)}${rosterMarkup(model)}${reviewMarkup(model, data)}` }));
      assert.ok(!fragment.querySelector("img"));
      assertCspSafe(fragment);
    }
  }
  const fragment = mount(rosterMarkup(prepModel(payload, "home", "roster", { data })));
  assert.equal(fragment.querySelector(".g-prep__player--out .g-prep__pname").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-prep__player--out .g-prep__ppos").textContent, `misses it · ${HOSTILE}`);
});

test("every key in both dictionaries, the waits and the opponent's states by their sets", () => {
  assertDictionaryCovers("src/screens/matches/prep-model.mjs", "src/screens/matches/prep-frame.mjs", "src/screens/matches/prep-steps.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    // The start leads nowhere further: no wait of its own (the final review, m-5).
    for (const step of MATCH_STEPS.slice(0, -1)) assert.ok(words[`prep.wait.${step}`], `${locale} prep.wait.${step}`);
    assert.equal(words["prep.wait.review"], undefined);
    for (const state of PREP_OPPONENT_STATES) assert.ok(words[`prep.opponent.${state}`], `${locale} prep.opponent.${state}`);
    for (const season of ["Spring", "Summer", "Autumn"]) assert.ok(words[`pre.season.${season}`], `${locale} pre.season.${season}`);
  }
  assert.ok(Object.isFrozen(PREP_OPPONENT_STATES));
  assert.equal(PREP_OPPONENT_STATES.length, 8);
  // Every state the model can say is one of them.
  const said = new Set();
  for (const actions of [[], FANS, [...FANS, ...WEATHER], [...FANS, ...WEATHER, ...ROSTERS], [...FANS, ...WEATHER, ...ROSTERS, ...BASKETS]]) {
    for (const step of MATCH_STEPS) said.add(modelAt(actions, step).opponent.state);
  }
  for (const state of said) assert.ok(state === "" || PREP_OPPONENT_STATES.includes(state), state);
  assert.equal(t("prep.opponent.locked", { count: 9 }), "The opponent confirmed the roster: 9 in the lineup");
});

test("styled as the prototypes draw it; readable; D2; nothing cut with «…»", () => {
  // The inducements' step draws prep-inducements.css's rows (stage 09a Task 10).
  const sheets = [CSS, "src/screens/matches/prep-inducements.css", "resource-counter.css", "status-chip.css", "segmented-control.css", "callout.css", "button.css"];
  const stages = [[], FANS, [...FANS, ...WEATHER], [...FANS, ...WEATHER, ...ROSTERS], [...FANS, ...WEATHER, ...ROSTERS, ...BASKETS]];
  for (const actions of stages) {
    for (const step of MATCH_STEPS) for (const phone of [true, false]) assertStyled(frame(modelAt(actions, step, {}, { isAdmin: true }), phone), ...sheets);
  }
  const begun = payloadAt(FANS);
  begun.preparation.status = "in_progress";
  assertStyled(frame(prepModel(begun, "home", "", { data, error: "x" })), ...sheets);
  const own = (selector, property) => valuesOf(CSS, selector, property);
  // The prototypes' values.
  assert.deepEqual(own(".g-prep", "background"), ["var(--surface-2)"]);
  assert.deepEqual(own(".g-prep", "min-height"), ["100dvh"]);
  assert.deepEqual(own(".g-prep__head", "padding"), ["var(--space-10) var(--space-14) var(--space-12)"]);
  assert.deepEqual(own(".g-prep__title", "font"), ["600 21px/1.15 var(--font-display)"]);
  assert.deepEqual(own(".g-prep__dotlist", "grid-template-columns"), ["repeat(5, minmax(0, 1fr))"]);
  assert.deepEqual(own(".g-prep__dotmark", "width"), ["24px"]);
  assert.deepEqual(own(".g-prep__dotlabel", "font"), ["500 10px/1.2 var(--font-body)"]);
  assert.deepEqual(own(".g-prep--phone .g-prep__foot", "position"), ["sticky"], "the footer stays at the bottom (pre-flight L19)");
  assert.deepEqual(own(".g-prep__cta", "font"), ["700 17px/1.2 var(--font-body)"]);
  assert.deepEqual(own(".g-prep__cta:disabled", "background"), ["var(--disabled)"]);
  assert.deepEqual(own(".g-prep__panel", "border-radius"), ["var(--radius-2xl)"]);
  assert.deepEqual(own(".g-prep__panel", "padding"), ["var(--space-14) var(--space-16)"]);
  assert.deepEqual(own(".g-prep__face", "min-height"), ["52px"]);
  assert.deepEqual(own(".g-prep__faces--6 .g-prep__face", "min-height"), ["46px"]);
  assert.deepEqual(own('.g-prep__face[aria-checked="true"]', "box-shadow"), ["inset 0 0 0 2px var(--accent)"]);
  assert.deepEqual(own('.g-prep__face[aria-checked="true"]', "background"), ["var(--accent-tint-soft)"]);
  assert.deepEqual(own(".g-prep__wrow--lit", "background"), ["var(--accent-tint)"], "the table's row in the tint (pre-flight L19)");
  assert.deepEqual(own(".g-prep__weather", "background"), ["var(--accent-tint-soft)"]);
  assert.deepEqual(own(".g-prep__weathername", "font"), ["700 26px/1.1 var(--font-display)"]);
  assert.deepEqual(own(".g-prep__label", "letter-spacing"), ["0.06em"]);
  assert.deepEqual(own(".g-prep__row", "min-height"), ["44px"]);
  assert.deepEqual(own(".g-prep__steps", "flex"), ["0 1 260px"]);
  assert.deepEqual(own(".g-prep__step", "min-height"), ["56px"]);
  assert.deepEqual(own(".g-prep__stepmark", "width"), ["28px"]);
  assert.deepEqual(own(".g-prep__step--current", "background"), ["var(--accent-tint)"]);
  assert.deepEqual(own(".g-prep__step--later .g-prep__stepmark", "background"), ["var(--surface-3)"]);
  assert.deepEqual(own(".g-prep__card", "flex"), ["3 1 520px"]);
  assert.deepEqual(own(".g-prep__cardtitle", "font"), ["700 20px/1.15 var(--font-display)"]);
  assert.deepEqual(own(".g-prep__column", "flex"), ["1 1 300px"]);
  assert.deepEqual(own(".g-prep__band .g-prep__title", "font"), ["600 28px/1.1 var(--font-display)"]);
  // Readable in every palette.
  assertReadable(CSS, ".g-prep__cta", "color", ["--accent"], 4.5);
  assertReadable(CSS, ".g-prep__dotlabel", "color", ["--header"], 4.5);
  assertReadable(CSS, ".g-prep__sub", "color", ["--header"], 4.5);
  assertReadable(CSS, ".g-prep__big--ours", "color", ["--surface"], 4.5);
  assertContrast("--on-accent-tint", ["--accent-tint-soft", "--accent-tint"], 4.5, { what: "the accent's ink on its tints" });
  assertReadable(CSS, ".g-prep__label", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-prep__note", "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-prep__player--out", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-prep__weatherdesc", "color", ["--accent-tint-soft"], 4.5);
  assertReadable(CSS, ".g-prep__stepsum", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-prep__step--current .g-prep__stepsum", "color", ["--accent-tint"], 4.5);
  assertReadable(CSS, ".g-prep__step--later .g-prep__stepmark", "color", ["--surface-3"], 4.5);
  assertReadable(CSS, ".g-prep__hint", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-prep__quiet", "color", ["--surface"], 4.5);
  // D2: «‹», the dots, the faces, the buttons a thumb's up to 900px; from 901px 24 or more.
  const px = (value) => ({ "var(--size-touch)": 44, "var(--size-cta)": 52 })[value] ?? parseInt(value, 10);
  for (const [selector, property] of [[".g-prep__back", "width"], [".g-prep__back", "height"], [".g-prep__dot", "min-height"], [".g-prep__face", "min-height"],
    [".g-prep__faces--6 .g-prep__face", "min-height"], [".g-prep__cta", "min-height"], [".g-prep__quiet", "min-height"], [".g-prep__hire", "min-height"], [".g-prep__summary", "min-height"]]) {
    assert.ok(px(own(selector, property)[0]) >= 44, `${selector} ${property}`);
  }
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-prep .g-seg__item", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-prep__remove", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-prep .g-seg__item", "min-height"), ["38px"]);
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-prep__remove", "min-height")[0]) >= 24);
  assert.deepEqual(own(".g-prep__band .g-prep__back", "width"), ["40px"], "a desk's «‹» is the prototype's 40px (24 or more)");
  assert.ok(px(own(".g-prep__step", "min-height")[0]) >= 24);
  // Nothing cut: a step's name, the subtitle and a reason wrap.
  const bare = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(bare, /ellipsis|text-overflow|nowrap|line-clamp/);
  for (const selector of [".g-prep__sub", ".g-prep__stepname", ".g-prep__why", ".g-prep__pname", ".g-prep__title"]) assert.deepEqual(own(selector, "overflow-wrap"), ["anywhere"], selector);
  // A dot's label is one word, never broken inside — not by the line, not by a hyphen —; one wider than its fifth or
  // seventh stands centred under its dot, over the gap (J13: «Treasur|y», «Summar|y» at 320, «Индьюсмент|ы» to 386).
  assert.deepEqual(own(".g-prep__dotlabel", "overflow-wrap"), ["normal"]);
  assert.deepEqual(own(".g-prep__dotlabel", "max-width"), [], "as wide as its word, centred by the dot");
  assert.doesNotMatch(bare, /hyphens:\s*auto/);
  assert.doesNotMatch(bare, /--focus-ring/);
  // Under 370px the labels are 9px, so the seven fit their cells of 40 at 320; the dots stay a thumb's high.
  assertBreakpoints(CSS, { also: ["max-width: 369px"] });
  assert.deepEqual(inMedia(CSS, "max-width: 369px", ".g-prep__dotlabel", "font-size"), ["9px"]);
  assert.deepEqual(blocks(mediaText(CSS, "max-width: 369px")).map((block) => block.selectors), [[".g-prep__dotlabel"]], "the label only");
  const styles = text("src/styles.css");
  assert.ok(styles.indexOf('@import url("screens/matches/prep.css");') > styles.indexOf('@import url("screens/matches/matches.css");'), "after the matches' sheet");
  assert.ok(styles.indexOf('@import url("screens/matches/prep.css");') < styles.indexOf('@import url("screens/matches/prep-inducements.css");'), "before the inducements' sheet");
  assert.ok(!document.querySelector("script"));
});

test("a frame given none of the new props is drawn as before", () => {
  // The markup stage 09a drew, taken before the post-match's props came (stage 09b Task 4): the same, string for string.
  const before = JSON.parse(text("test/fixtures/prep-frame-09a.json"));
  const phone = prepModel(payloadAt(FANS, { isAdmin: true }), "away", "fans", { data, userId: "admin", error: "Refused." });
  assert.equal(prepFrameMarkup(phone, { phone: true, contentHtml: "<p>step</p>" }), before.phone);
  const desk = modelAt([...FANS, ...WEATHER, ...ROSTERS, ...BASKETS]);
  assert.equal(prepFrameMarkup(desk, { phone: false, contentHtml: "<p>step</p>" }), before.desk);
});

test("with them: no opponent card, a lead before the button, notices under the head, the steps' own label", () => {
  const model = { ...modelAt([...FANS, ...WEATHER, ...ROSTERS, ...BASKETS]), stepsLabel: "Post-match steps" };
  const props = { contentHtml: "<p>step</p>", opponentHtml: "", actionLeadHtml: '<span class="g-status">Lead</span>', noticesHtml: '<p class="g-prep__note">Said.</p>' };
  const desk = mount(prepFrameMarkup(model, { phone: false, ...props }));
  assert.ok(!desk.querySelector(".g-prep__panel--rows"), "no opponent card");
  const panel = desk.querySelector(".g-prep__panel--action");
  assert.deepEqual(panel.childNodes.map((node) => node.getAttribute("class")), ["g-status", "g-prep__cta"], "the lead before the button");
  assert.equal(desk.querySelector(".g-prep__notices .g-prep__note").textContent, "Said.");
  assert.equal(desk.querySelector(".g-prep__steps nav").getAttribute("aria-label"), "Post-match steps");
  // Another card in the opponent's place, a lead with no button, notices after a refusal.
  const other = mount(prepFrameMarkup({ ...model, footer: { kind: "none" }, error: "Refused." }, { phone: false, ...props, opponentHtml: '<div class="g-prep__panel">Theirs</div>' }));
  assert.equal(other.querySelector(".g-prep__column").textContent, "TheirsLead");
  const notices = other.querySelector(".g-prep__notices");
  assert.deepEqual(notices.childNodes.map((node) => node.getAttribute("class")), ["g-prep__alert", "g-prep__note"], "the screen's own after the refusal");
  const phone = mount(prepFrameMarkup(model, { phone: true, ...props }));
  assert.equal(phone.querySelector("nav.g-prep__dots").getAttribute("aria-label"), "Post-match steps");
  assert.equal(phone.querySelector(".g-prep__notices .g-prep__note").textContent, "Said.");
  assert.ok(!phone.querySelector(".g-status"), "a phone has no lead: its footer says the opponent's line");
});
