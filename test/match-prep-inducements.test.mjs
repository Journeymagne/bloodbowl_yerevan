import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { formatMoney } from "../src/core/format.mjs";
import { preMatchUrl } from "../src/core/routes.mjs";
import { matchBudget } from "../src/domain/match/budget.mjs";
import { applyPreparationAction, createPreparation } from "../src/domain/match/preparation.mjs";
import { PREP_TURNS, prepModel } from "../src/screens/matches/prep-model.mjs";
import { prepFrameMarkup } from "../src/screens/matches/prep-frame.mjs";
import { prepStepMarkup } from "../src/screens/matches/prep-steps.mjs";
import { budgetCardMarkup, inducementsMarkup } from "../src/screens/matches/prep-inducements.mjs";
import { effectsFromForm, effectsMarkup } from "../src/screens/matches/prep-effects.mjs";

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const CSS = "src/screens/matches/prep-inducements.css";

const players = (prefix, rows) => rows.map((rowIndex, index) => ({ id: `${prefix}-${index + 1}`, rowIndex, number: String(index + 1), name: `${prefix} ${index + 1}` }));
const source = (id, name, slug, roster, treasury = 70) => ({ user: { id: `u-${id}`, login: id },
  team: { id, name, baseTeamSlug: slug, revision: 1, roster: { players: roster, treasury, dedicatedFans: 3 } } });
// Ours: eight Human Linemen, 400k; theirs: seven and an Ogre, 490k — they buy first, we have 90k of petty cash.
const OURS = source("t1", "Ashgrove Wardens", "teams/human", players("ash", [0, 0, 0, 0, 0, 0, 0, 0]));
const THEIRS = source("r1", "Silverbrook Rangers", "teams/human", players("sil", [0, 0, 0, 0, 0, 0, 0, 5]));
const FIXTURE = { id: "g1", kind: "league", seasonName: "Mock Season", roundNumber: 7, tableNumber: 1, closed: false };
const TO_INDUCEMENTS = [["home", { type: "fans", value: 2 }], ["away", { type: "fans", value: 1 }], ["home", { type: "weather", season: "Autumn", home: 3, away: 4 }],
  ["home", { type: "lock-roster" }], ["away", { type: "lock-roster" }]];
const THEY_BOUGHT = [["away", { type: "lock-basket" }]];
const buy = (id, quantity = 1) => ["home", { type: "basket", id, quantity }];

function payloadAt(actions = [], { ours = OURS, theirs = THEIRS, reference = data } = {}) {
  let preparation = createPreparation({ home: ours, away: theirs }, reference);
  for (const [side, action] of [...TO_INDUCEMENTS, ...actions]) preparation = applyPreparationAction(preparation, side, action, reference);
  return { preparation, snapshots: {}, viewerSide: "home", isAdmin: false, fixture: FIXTURE };
}
const modelAt = (actions, ui = {}, options = {}) => prepModel(payloadAt(actions, options), "home", "inducements", { data: options.reference ?? data, ...ui });
const words = (fragment, selector) => fragment.querySelectorAll(selector).map((node) => node.textContent);
const counter = (fragment, name) => fragment.querySelectorAll(".g-resource").find((row) => row.querySelector(".g-resource__name").textContent === name);

test("the budget card says whose turn it is and what is left: the preparation's own numbers", () => {
  const waiting = modelAt([]);
  assert.equal(waiting.step, "inducements");
  assert.equal(waiting.inducements.turn, "wait");
  const card = mount(budgetCardMarkup(waiting));
  assert.equal(card.querySelector(".g-status").textContent, "Waiting for the opponent's purchases: their CTV is higher");
  assert.ok(card.querySelector(".g-status--wait"));
  // They have confirmed theirs (nothing): our turn, 90k of petty cash and up to 50k of the treasury.
  const ours = modelAt(THEY_BOUGHT);
  const budget = matchBudget(ours.preparation, "home", data);
  assert.equal(ours.inducements.turn, "second");
  const fragment = mount(budgetCardMarkup(ours));
  assert.equal(fragment.querySelector(".g-status").textContent, `Your turn · the opponent chose ${formatMoney(0)}`);
  assert.ok(fragment.querySelector(".g-status--wait"), "the warning's tone (pre-flight L17)");
  assert.equal(fragment.querySelector(".g-prep-budget__petty").textContent, `Petty cash ${formatMoney(90)} + from the treasury up to ${formatMoney(50)}`);
  assert.deepEqual(words(fragment, ".g-prep-budget__figure"), [formatMoney(90), formatMoney(50)], "the figures in bold");
  assert.deepEqual([ours.inducements.petty, ours.inducements.treasuryUpTo, ours.inducements.chosen, ours.inducements.remaining], [budget.pettyCash, budget.treasuryLimit, budget.chosen, budget.remaining]);
  assert.equal(fragment.querySelector(".g-prep-budget__chosen").textContent, formatMoney(0));
  assert.equal(fragment.querySelector(".g-prep-budget__hint").textContent, "The treasury is not spent");
  // Spending past the petty cash: the treasury pays, in the warning's colour.
  const spending = modelAt([...THEY_BOUGHT, buy("additional-training"), buy("bloodweiser-keg")]);
  assert.equal(spending.inducements.chosen, 125);
  assert.equal(spending.inducements.hint, `${formatMoney(35)} comes from the treasury at the start of the match`);
  assert.equal(spending.inducements.tone, "warn");
  // We are the dearer side: we buy first; at equal CTVs no order, and a tier bonus is said (pre-flight L8).
  assert.equal(prepModel(payloadAt([], { ours: THEIRS, theirs: OURS }), "home", "inducements", { data }).inducements.turn, "first");
  const gnomes = source("g", "Gnome Glade", "teams/gnome", players("g", Array(11).fill(0)));
  const humans = source("h", "Humans", "teams/human", players("h", Array(11).fill(0)));
  const even = prepModel(payloadAt([], { ours: gnomes, theirs: humans }), "home", "inducements", { data });
  assert.equal(even.inducements.turn, "even");
  const evenCard = mount(budgetCardMarkup(even));
  assert.equal(evenCard.querySelector(".g-status").textContent, "CTVs equal: no petty cash");
  assert.equal(evenCard.querySelector(".g-prep-budget__petty").textContent, `Petty cash ${formatMoney(0)} + from the treasury up to ${formatMoney(0)} + tier bonus ${formatMoney(200)}`);
});

test("only what the team may buy is listed; a plus that cannot be pressed says why", () => {
  const fragment = mount(inducementsMarkup(modelAt(THEY_BOUGHT)));
  const names = words(fragment, ".g-resource__name");
  assert.ok(names.includes("Nuffle's Prayers"));
  assert.ok(!names.includes("Plague Doctor"), "Nurgle's alone (catalogAccess)");
  assert.ok(!names.includes("Rowdy Rookies") && !names.includes("Mark of Chaos"));
  const prayers = counter(fragment, "Nuffle's Prayers");
  assert.match(prayers.querySelector(".g-resource__note").textContent, new RegExp(`^${formatMoney(15)} · up to 3 · Roll on the Nuffle's Prayers table`));
  assert.ok(!prayers.querySelector(".g-resource__btn--inc").hasAttribute("aria-disabled"));
  // Everything spent: one more prayer is 15k short.
  const spent = mount(inducementsMarkup(modelAt([...THEY_BOUGHT, buy("additional-training"), buy("bloodweiser-keg"), buy("nuffles-prayers")])));
  const plus = counter(spent, "Nuffle's Prayers").querySelector(".g-resource__btn--inc");
  assert.equal(plus.getAttribute("aria-disabled"), "true");
  assert.match(plus.getAttribute("title") ?? plus.getAttribute("aria-label") ?? "", /Not enough · 15k/);
  // At its limit: the limit, in the step's words.
  const mascot = counter(mount(inducementsMarkup(modelAt([...THEY_BOUGHT, buy("team-mascot")]))), "Team Mascot");
  assert.equal(mascot.querySelector(".g-resource__value").textContent, "1");
  assert.match(mascot.querySelector(".g-resource__btn--inc").getAttribute("title") ?? "", /The limit is reached/);
  initLocale("ru");
  try {
    const ru = counter(mount(inducementsMarkup(modelAt([...THEY_BOUGHT, buy("additional-training"), buy("bloodweiser-keg"), buy("nuffles-prayers")]))), "Nuffle's Prayers");
    assert.match(ru.querySelector(".g-resource__btn--inc").getAttribute("title") ?? "", /Не хватает · 15k/);
  } finally {
    initLocale("en");
  }
});

test("the stars: their places, Take and Remove; a mega star takes two", () => {
  const stars = mount(inducementsMarkup(modelAt(THEY_BOUGHT, { category: "stars" })));
  assert.equal(stars.querySelector('.g-seg[data-seg-group="prep-category"] [aria-checked="true"]').textContent, "Stars");
  assert.equal(stars.querySelector(".g-prep-ind__list--stars .g-prep__note").textContent, "Star places: 0 of 2. A Mega Star takes two.");
  const akhorne = stars.querySelectorAll(".g-prep-ind__star").find((row) => row.querySelector(".g-prep-ind__name").textContent === "Akhorne The Squirrel");
  assert.equal(akhorne.querySelector(".g-prep-ind__note").textContent, `${formatMoney(80)} · Any Team`);
  const take = akhorne.querySelector("[data-prep-star]");
  assert.equal(take.textContent, "Take");
  assert.ok(!take.hasAttribute("aria-disabled"));
  const griff = stars.querySelectorAll(".g-prep-ind__star").find((row) => row.querySelector(".g-prep-ind__name").textContent === "Griff Oberwald");
  assert.equal(griff.querySelector("[data-prep-star]").getAttribute("aria-disabled"), "true", "300k is out of reach");
  assert.match(griff.querySelector(".g-prep-ind__why").textContent, /^Not enough · /);
  // Taken: «Remove», and a place used.
  const taken = mount(inducementsMarkup(modelAt([...THEY_BOUGHT, buy("star:akhorne-the-squirrel")], { category: "stars" })));
  const row = taken.querySelectorAll(".g-prep-ind__star").find((each) => each.querySelector(".g-prep-ind__name").textContent === "Akhorne The Squirrel");
  assert.equal(row.querySelector("[data-prep-star]").textContent, "Remove");
  assert.equal(taken.querySelector(".g-prep-ind__list--stars .g-prep__note").textContent, "Star places: 1 of 2. A Mega Star takes two.");
  // A Mega Star (the reference marks none yet: here Griff is one) says its two places.
  const megaPage = (page) => (page.title === "Griff Oberwald" ? { ...page, tags: [...page.tags, "Mega Star"] } : page);
  const mega = { ...data, starPlayers: data.starPlayers.map(megaPage), pages: data.pages.map(megaPage) };
  const megaRows = mount(inducementsMarkup(modelAt(THEY_BOUGHT, { category: "stars" }, { reference: mega })));
  const megaGriff = megaRows.querySelectorAll(".g-prep-ind__star").find((each) => each.querySelector(".g-prep-ind__name").textContent === "Griff Oberwald");
  assert.equal(megaGriff.querySelector(".g-prep-ind__note").textContent, `${formatMoney(300)} · Mega Star · 2 places`);
});

test("not our turn, or the basket confirmed: the counters are locked with why, and keep their price and rule", () => {
  const waitModel = modelAt([]);
  const waiting = mount(inducementsMarkup(waitModel));
  const rows = waiting.querySelectorAll(".g-resource");
  assert.ok(rows.length > 5);
  // The final review, m-3: each row keeps its note; «−» is off, «+» says the lock when pressed; the chip says it once.
  for (const [row, data] of rows.map((row, at) => [row, waitModel.inducements.rows[at]])) {
    assert.equal(row.querySelector(".g-resource__note").textContent, data.note);
    assert.ok(row.querySelector('[data-resource-step="-1"]').hasAttribute("disabled"));
    assert.equal(row.querySelector('[data-resource-step="1"]').getAttribute("title"), "The opponent buys first");
  }
  const stars = mount(inducementsMarkup(modelAt([], { category: "stars" })));
  for (const star of stars.querySelectorAll(".g-prep-ind__star")) {
    const take = star.querySelector("[data-prep-star]");
    assert.equal(take.getAttribute("aria-disabled"), "true");
    assert.equal(take.getAttribute("title"), "The opponent buys first");
    assert.notEqual(star.querySelector(".g-prep-ind__why")?.textContent, "The opponent buys first", "said once, not by every row");
  }
  const waitFrame = mount(prepFrameMarkup(modelAt([]), { phone: true, ...prepStepMarkup(modelAt([]), data, true) }));
  const lock = waitFrame.querySelector('.g-prep__cta[data-prep-action="lock-basket"]');
  assert.equal(lock.textContent, "Go on without purchases");
  assert.ok(lock.hasAttribute("disabled"));
  assert.equal(waitFrame.querySelector(".g-prep__opp").textContent, "Waiting for the opponent's purchases: their CTV is higher");
  // Our turn, something chosen: «Confirm the purchases».
  const choosing = modelAt([...THEY_BOUGHT, buy("team-mascot")]);
  const open = mount(prepFrameMarkup(choosing, { phone: true, ...prepStepMarkup(choosing, data, true) }));
  assert.equal(open.querySelector('.g-prep__cta[data-prep-action="lock-basket"]').textContent, "Confirm the purchases");
  assert.ok(!open.querySelector('.g-prep__cta[data-prep-action="lock-basket"]').hasAttribute("disabled"));
  // He bought first: his line says why, as PreInducements.html (G9).
  assert.equal(open.querySelector(".g-prep__opp").textContent, "The opponent bought first: their CTV is higher");
  // Confirmed: locked, «Next: Start» and the quiet way back.
  const locked = modelAt([...THEY_BOUGHT, buy("team-mascot"), ["home", { type: "lock-basket" }]]);
  const fragment = mount(prepFrameMarkup(locked, { phone: true, ...prepStepMarkup(locked, data, true) }));
  for (const row of fragment.querySelectorAll(".g-resource")) assert.equal(row.querySelector('[data-resource-step="1"]').getAttribute("title"), "Purchases confirmed");
  assert.equal(fragment.querySelector("a.g-prep__cta").textContent, "Next: start");
  assert.equal(fragment.querySelector("a.g-prep__cta").getAttribute("href"), preMatchUrl("g1", "review"));
  assert.equal(fragment.querySelector('.g-prep__quiet[data-prep-action="reopen"]').textContent, "Change the purchases");
});

test("the effects appear once a prayer is bought, and read back as the form sends them", () => {
  assert.equal(effectsMarkup(modelAt(THEY_BOUGHT)), "", "nothing bought, nothing to record");
  const payload = payloadAt([...THEY_BOUGHT, buy("nuffles-prayers", 2)]);
  payload.preparation.home.effects = { prayers: [{ roll: 3, targets: ["ash-2"] }] };
  const model = prepModel(payload, "home", "inducements", { data });
  const form = mount(effectsMarkup(model)).querySelector("form[data-prep-effects]");
  assert.equal(form.querySelector("h3").textContent, "Prayers and effects");
  assert.deepEqual(words(form, ".g-prep-effects__title"), ["Prayer 1", "Prayer 2"]);
  const result = form.querySelector('select[name="prayer-0-roll"]');
  assert.ok(result.hasAttribute("data-prep-prayer"));
  assert.equal(result.querySelector("option[selected]").getAttribute("value"), "3");
  const target = form.querySelector('select[name="prayer-0-targets"]');
  assert.ok(target.hasAttribute("data-prep-prayer-target"));
  assert.equal(target.querySelector("option[selected]").textContent, "#2 ash-2".replace("ash-2", "ash 2"));
  assert.ok(!form.querySelector('select[name="prayer-1-targets"]'), "no target before a result");
  assert.equal(form.querySelector('button[type="submit"]').textContent, "Save the effects");
  // Read back: 2.x's object, field by field (pre-flight L7: compared with the literal, not with 2.x's module).
  const values = new FormData();
  values.append("prayer-0-roll", "6");
  values.append("prayer-0-targets", "sil-1");
  values.append("prayer-0-targets", "sil-2");
  values.append("prayer-0-count", "2");
  values.append("prayer-1-roll", "16");
  values.append("prayer-1-targets", "ash-1");
  values.append("prayer-1-skill", "Block");
  values.append("markTarget", "");
  values.append("rookieFirst", "2");
  assert.deepEqual(effectsFromForm(values, { kept: true }, 2), {
    kept: true,
    prayers: [{ roll: 6, targets: ["sil-1", "sil-2"], count: 2, skill: "" }, { roll: 16, targets: ["ash-1"], count: null, skill: "Block" }],
    markTarget: "",
    rookies: { first: 2, second: null, rowIndex: 0 },
  });
  assert.deepEqual(effectsFromForm(new FormData(), {}, 1), { prayers: [{ roll: null, targets: [], count: null, skill: "" }], markTarget: "", rookies: { first: null, second: null, rowIndex: 0 } });
  // Closed with the basket.
  const lockedPayload = payloadAt([...THEY_BOUGHT, buy("nuffles-prayers"), ["home", { type: "effects", effects: { prayers: [{ roll: 12, targets: [] }] } }], ["home", { type: "lock-basket" }]]);
  const closed = mount(effectsMarkup(prepModel(lockedPayload, "home", "inducements", { data })));
  assert.ok(closed.querySelector('select[name="prayer-0-roll"]').hasAttribute("disabled"));
  assert.ok(!closed.querySelector('button[type="submit"]'));
});

test("the bar is a class, never a style", () => {
  const steps = [[], [buy("team-mascot")], [buy("additional-training"), buy("bloodweiser-keg")], [buy("additional-training"), buy("bloodweiser-keg"), buy("nuffles-prayers")]];
  const shares = steps.map((actions) => {
    const model = modelAt([...THEY_BOUGHT, ...actions]);
    const fragment = mount(budgetCardMarkup(model));
    assertCspSafe(fragment);
    const bar = fragment.querySelector('[role="progressbar"]');
    assert.equal(bar.getAttribute("aria-label"), "Spent");
    assert.equal(bar.getAttribute("aria-valuemax"), String(model.inducements.maximum));
    assert.equal(bar.getAttribute("aria-valuenow"), String(model.inducements.chosen));
    assert.ok(bar.classList.contains(`g-prep-budget__bar--${model.inducements.share}`));
    assert.ok(bar.classList.contains(`g-prep-budget__bar--${model.inducements.tone}`));
    return [model.inducements.share, model.inducements.tone];
  });
  assert.deepEqual(shares, [[0, "accent"], [2, "accent"], [9, "warn"], [10, "warn"]]);
  for (let share = 0; share <= 10; share += 1) assert.ok(valuesOf(CSS, `.g-prep-budget__bar--${share} .g-prep-budget__fill`, "width").length, `share ${share}`);
});

test("a desk's column: the budget with the bought lines and its button, the opponent's card", () => {
  const model = modelAt([...THEY_BOUGHT, buy("team-mascot"), buy("nuffles-prayers", 2)]);
  const fragment = mount(prepFrameMarkup(model, { phone: false, ...prepStepMarkup(model, data, false) }));
  const column = fragment.querySelector(".g-prep__column");
  const budget = column.querySelector(".g-prep-budget--desk");
  assert.equal(budget.querySelector(".g-prep__label").textContent, "Budget");
  assert.deepEqual(budget.querySelectorAll(".g-prep-budget__bought").map((line) => [line.querySelector("span").textContent, line.querySelector("b").textContent]),
    [["2 × Nuffle's Prayers", formatMoney(30)], ["1 × Team Mascot", formatMoney(25)]]);
  assert.equal(budget.querySelector('.g-prep__cta[data-prep-action="lock-basket"]').textContent, "Confirm the purchases");
  assert.equal(fragment.querySelectorAll('[data-prep-action="lock-basket"]').length, 1, "the button once, in the budget");
  const opponent = column.querySelectorAll(".g-prep__panel--rows").at(-1);
  assert.equal(opponent.querySelector(".g-prep__team").textContent, "Silverbrook Rangers");
  assert.deepEqual(opponent.querySelectorAll(".g-prep__row").map((row) => [row.querySelector(".g-prep__rowk").textContent, row.querySelector(".g-prep__rowv").textContent]),
    [["CTV", formatMoney(490)], ["Bought first", formatMoney(0)], ["Status", "choice confirmed"]]);
  assert.ok(opponent.querySelector(".g-prep__rowv--done"));
  const card = fragment.querySelector("section.g-prep__card");
  assert.equal(card.querySelector("h2").textContent, "Inducements");
  assert.equal(card.querySelector(".g-prep__note").textContent,
    `The side with the higher CTV buys first — the opponent has ${formatMoney(490)} against your ${formatMoney(400)}. The ${formatMoney(90)} difference is your petty cash.`);
  assert.ok(!card.querySelector(".g-prep-budget"), "the budget is the column's on a desk");
  assert.match(card.textContent, /Mercenaries are not available in Gata League\./);
});

test("names are text", () => {
  const hostile = { ...OURS, team: { ...OURS.team, name: HOSTILE, roster: { ...OURS.team.roster, favouredChoice: HOSTILE } } };
  const payload = payloadAt([...THEY_BOUGHT, buy("nuffles-prayers")], { ours: hostile });
  payload.preparation.home.effects = { prayers: [{ roll: 3, targets: [] }] };
  payload.preparation.home.players[0].name = HOSTILE;
  for (const phone of [true, false]) {
    for (const category of ["help", "stars"]) {
      const model = prepModel(payload, "home", "inducements", { data, category });
      const fragment = mount(prepFrameMarkup(model, { phone, ...prepStepMarkup(model, data, phone) }));
      assert.ok(!fragment.querySelector("img"));
      assertCspSafe(fragment);
    }
  }
});

test("every key in both dictionaries, the turns by their set", () => {
  assertDictionaryCovers("src/screens/matches/prep-model.mjs", "src/screens/matches/prep-inducements.mjs", "src/screens/matches/prep-effects.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const turn of PREP_TURNS) assert.ok(words[`prep.turn.${turn}`], `${locale} prep.turn.${turn}`);
  }
  assert.ok(Object.isFrozen(PREP_TURNS));
  assert.deepEqual([...PREP_TURNS], ["first", "second", "wait", "even"]);
});

test("styled as the prototypes draw it; readable; D2; nothing cut with «…»", () => {
  const sheets = [CSS, "src/screens/matches/prep.css", "resource-counter.css", "segmented-control.css", "status-chip.css", "button.css", "callout.css"];
  const payload = payloadAt([...THEY_BOUGHT, buy("nuffles-prayers")]);
  payload.preparation.home.effects = { prayers: [{ roll: 6, targets: [] }] };
  for (const phone of [true, false]) {
    for (const category of ["help", "stars"]) {
      for (const model of [prepModel(payload, "home", "inducements", { data, category }), modelAt([], { category })]) {
        assertStyled(mount(prepFrameMarkup(model, { phone, ...prepStepMarkup(model, data, phone) })), ...sheets);
      }
    }
  }
  const own = (selector, property) => valuesOf(CSS, selector, property);
  assert.deepEqual(own(".g-prep-ind__list .g-resource", "min-height"), ["60px"]);
  assert.deepEqual(own(".g-prep-ind__list .g-resource__btn", "border-radius"), ["9px"]);
  assert.deepEqual(own(".g-prep-budget__chosen", "font"), ["700 24px/1 var(--font-display)"]);
  assert.deepEqual(own(".g-prep-budget__bar", "height"), ["8px"]);
  assert.deepEqual(own(".g-prep-budget__bar", "background"), ["var(--line)"]);
  assert.deepEqual(own(".g-prep-budget__bar--warn .g-prep-budget__fill", "background"), ["var(--warn)"]);
  assert.deepEqual(own(".g-prep-budget__bar--danger .g-prep-budget__fill", "background"), ["var(--danger)"]);
  assert.deepEqual(own(".g-prep-budget__bought", "min-height"), ["36px"]);
  assert.deepEqual(own(".g-prep-budget--desk .g-prep__cta", "min-height"), ["48px"]);
  assert.deepEqual(own(".g-prep-ind__name", "font"), ["600 15px/1.3 var(--font-body)"]);
  assert.deepEqual(own(".g-prep-ind__take", "box-shadow"), ["inset 0 0 0 1px var(--control-border)"]);
  // The help in columns; the stars one column of rows 16 apart, as DeskPreInducements.html (G8).
  const help = ".g-prep-ind__list:not(.g-prep-ind__list--stars)";
  assert.deepEqual(inMedia(CSS, "min-width: 901px", help, "grid-template-columns"), ["repeat(auto-fit, minmax(300px, 1fr))"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", help, "column-gap"), ["var(--space-24)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-prep-ind__list", "grid-template-columns"), [], "no grid for the stars");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-prep-ind__list--stars", "gap"), ["var(--space-16)"]);
  // A «−» or «+» that is off is grey (G6): the list's ink is the live buttons' only.
  for (const off of [".g-prep-ind__list .g-resource__btn:disabled", '.g-prep-ind__list .g-resource__btn[aria-disabled="true"]']) {
    assert.deepEqual(own(off, "color"), ["var(--disabled)"], off);
  }
  // Readable in every palette.
  assertReadable(CSS, ".g-prep-budget__petty", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-prep-budget__hint", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-prep-ind__note", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-prep-ind__take", "color", ["--surface"], 4.5);
  assertReadable(CSS, '.g-prep-ind__take[aria-disabled="true"]', "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-prep-effects__label", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-prep-effects__desc", "color", ["--surface"], 4.5);
  // D2: the stepper and «Take» a thumb's up to 900px; the prototype's 34 and 36 from 901px, each 24 or more.
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-prep-ind__list .g-resource__btn", "width"), ["var(--size-touch)"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-prep-ind__list .g-resource__btn", "height"), ["var(--size-touch)"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-prep-ind__take", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-prep-effects__select", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-prep-ind__list .g-resource__btn", "width"), ["34px"]);
  assert.ok(parseInt(own(".g-prep-ind__take", "min-height")[0], 10) >= 24);
  assert.ok(parseInt(own(".g-prep-effects__select", "min-height")[0], 10) >= 24);
  const bare = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(bare, /ellipsis|text-overflow|nowrap|line-clamp/);
  for (const selector of [".g-prep-ind__name", ".g-prep-ind__note", ".g-prep-ind__why", ".g-prep-budget__petty"]) assert.deepEqual(own(selector, "overflow-wrap"), ["anywhere"], selector);
  assert.doesNotMatch(bare, /--focus-ring|style=/);
  for (const [, query] of text(CSS).matchAll(/@media\s*([^{]+)\{/g)) assert.ok(["(max-width: 900px)", "(min-width: 901px)"].includes(query.trim()), query);
  // Imported after every sheet it was written over (stage 10 adds the season's sheets after it, in the order of its tasks).
  const styles = text("src/styles.css");
  const at = styles.indexOf('@import url("screens/matches/prep-inducements.css");');
  assert.ok(at > styles.indexOf('@import url("screens/matches/prep.css");') && at > styles.lastIndexOf('@import url("ui/'), "imported after the sheets it is written over");
});
