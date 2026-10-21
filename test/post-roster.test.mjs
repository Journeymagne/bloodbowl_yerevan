import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { AWAY, HOME, RECORDS, act, agreed, begin, hurt, modelOf, players, reach } from "./helpers/post-cases.mjs";
import { formatMoney } from "../src/core/format.mjs";
import { postMatchUrl } from "../src/core/routes.mjs";
import { teamHasSpecialRule } from "../src/domain/roster/team-rules.mjs";
import { HIRE_SHEET, SELL_SHEET, hireSheetMarkup, opLines, rosterStep, sellSheetMarkup } from "../src/screens/matches/post-roster.mjs";

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const CSS = "src/screens/matches/post-money.css";
const words = (fragment, selector) => fragment.querySelectorAll(selector).map((node) => node.textContent);

/** Both sides on the Roster step. */
const atRoster = (begun = begin(), events = RECORDS) => reach(agreed(begun, { events }), { home: 3, away: 3 }, { events });
const modelAt = (state, over = {}) => modelOf(state, "roster", {}, over);
const draw = (model) => mount(rosterStep(model).contentHtml);
const roster = (state, operation) => act(state, "home", { type: "roster", ...operation });

test("the treasury after income and what is left once this step's purchases are paid", () => {
  const state = atRoster();
  const fragment = draw(modelAt(state));
  assert.equal(fragment.querySelector(".g-after__moneyk").textContent, `Treasury after income ${formatMoney(150)}`);
  assert.equal(fragment.querySelector(".g-after__moneyv").textContent, "150k");
  assert.equal(fragment.querySelector(".g-after__left").textContent, "150k");
  assert.match(fragment.textContent, /This step's purchases are paid when the match is finished\./);
  const hired = draw(modelAt(roster(state, { operation: "hire", rowIndex: 0 })));
  assert.equal(hired.querySelector(".g-after__left").textContent, "100k");
  assert.ok(!hired.querySelector(".g-after__left--short"));
  // Below zero (a treasury the income no longer covers): the danger's colour.
  const model = modelAt(state);
  const short = draw({ ...model, preview: { ...model.preview, accounting: { ...model.preview.accounting, purchases: 200 } } });
  assert.equal(short.querySelector(".g-after__left--short").textContent, "-50k");
});

test("staff as counters: Team Re-rolls only up, the others both ways, each closed with why", () => {
  const state = atRoster(begin({ home: { more: { assistantCoaches: 6, cheerleaders: 1 } } }));
  const fragment = draw(modelAt(state));
  const card = fragment.querySelector(".g-after__staff");
  assert.equal(card.querySelector(".g-after__label").textContent, "Staff");
  const counter = (key) => card.querySelector(`[data-resource-key="${key}"]`);
  assert.deepEqual(card.querySelectorAll("[data-resource-key]").map((row) => row.getAttribute("data-resource-key")), ["teamRerolls", "assistantCoaches", "cheerleaders", "apothecary"]);
  assert.equal(counter("teamRerolls").querySelector(".g-resource__name").textContent, "Team Re-rolls · buy more");
  assert.equal(counter("teamRerolls").querySelector(".g-resource__note").textContent, "120k each · now 0");
  assert.ok(counter("teamRerolls").querySelector('[data-resource-step="-1"]').hasAttribute("disabled"), "Team Re-rolls are only bought");
  assert.equal(counter("teamRerolls").querySelector('[data-resource-step="1"]').getAttribute("aria-disabled"), null);
  assert.match(card.querySelector(".g-after__note").textContent, /Team Re-rolls can only be bought after a match; they cannot be sold\./);
  assert.equal(counter("assistantCoaches").querySelector(".g-resource__note").textContent, "10k · now 6");
  assert.equal(counter("assistantCoaches").querySelector('[data-resource-step="1"]').getAttribute("title"), "Assistant Coaches: maximum is 6.");
  assert.ok(!counter("assistantCoaches").querySelector('[data-resource-step="-1"]').hasAttribute("disabled"), "the others go both ways");
  assert.equal(counter("cheerleaders").querySelector(".g-resource__value").textContent, "1");
  // Bought: the count moves, the money too; without the money, «+» says what is missing.
  const bought = roster(state, { operation: "staff", key: "cheerleaders", delta: 1 });
  assert.equal(draw(modelAt(bought)).querySelector('[data-resource-key="cheerleaders"] .g-resource__value').textContent, "2");
  const poor = roster(roster(state, { operation: "hire", rowIndex: 0 }), { operation: "hire", rowIndex: 0 });
  assert.equal(draw(modelAt(poor)).querySelector('[data-resource-key="teamRerolls"] [data-resource-step="1"]').getAttribute("title"), "Not enough treasury · 70k");
  // Re-rolls and Start Re-rolls together: eight at most.
  const full = atRoster(begin({ home: { more: { teamRerolls: 3, startingRerolls: 5 }, treasury: 500 } }));
  assert.equal(draw(modelAt(full)).querySelector('[data-resource-key="teamRerolls"] [data-resource-step="1"]').getAttribute("title"), "Team Re-rolls and Start Re-rolls: 8 at most");
  // Read only once passed.
  const passed = modelOf(reach(state, { home: 4, away: 4 }), "roster");
  assert.ok(draw(passed).querySelectorAll("[data-resource-step]").every((button) => button.getAttribute("aria-disabled") === "true"));
});

test("hire: the race's positions with their price, how many and why one is closed", () => {
  const model = modelAt(atRoster());
  const sheet = mount(hireSheetMarkup(model)).querySelector(`dialog#${HIRE_SHEET}`);
  assert.equal(sheet.querySelector(".g-sheet__title").textContent, "Hire a player");
  const rows = sheet.querySelectorAll(".g-after__pick");
  assert.deepEqual(rows.map((row) => row.querySelector("span").textContent), [
    "Human Lineman · 50k · 6 of 16", "Thrower · 80k · 1 of 2", "Catcher · 75k · 2 of 2", "Blitzer · 80k · 2 of 2", "Halfling Hopeful · 30k · 0 of 3", "Ogre · 140k · 1 of 1",
  ], "J. Corr is back on the roster: six Linemen");
  assert.equal(rows[0].getAttribute("data-after-hire"), "0");
  assert.deepEqual([rows[2].getAttribute("aria-disabled"), rows[2].querySelector(".g-after__why").textContent], ["true", "No place left at this position"]);
  assert.equal(rows[2].getAttribute("data-after-hire"), null, "a closed row writes nothing");
  // Fourteen on the roster: every position closed with that.
  let full = atRoster();
  full = roster(full, { operation: "hire", rowIndex: 4 });
  full = roster(full, { operation: "hire", rowIndex: 4 });
  const fourteen = mount(hireSheetMarkup(modelAt(full))).querySelectorAll(".g-after__pick");
  assert.ok(fourteen.every((row) => row.querySelector(".g-after__why").textContent === "14 on the roster already"));
  // The treasury short: 80k of income, a Thrower bought with it, nothing left for a Lineman.
  const spent = roster(atRoster(begin({ home: { treasury: 0 } })), { operation: "hire", rowIndex: 1 });
  const poor = mount(hireSheetMarkup(modelAt(spent))).querySelectorAll(".g-after__pick");
  assert.equal(poor[0].querySelector(".g-after__why").textContent, "Not enough treasury · 50k");
  assert.equal(poor[1].querySelector(".g-after__why").textContent, "No place left at this position", "the place first, then the money");
});

test("sell: the roster's players with their price; at seven none", () => {
  const model = modelAt(atRoster());
  const sheet = mount(sellSheetMarkup(model)).querySelector(`dialog#${SELL_SHEET}`);
  assert.equal(sheet.querySelector(".g-sheet__title").textContent, "Sell a player");
  const rows = sheet.querySelectorAll(".g-after__pick");
  assert.equal(rows.length, 12);
  assert.equal(rows[2].querySelector("span").textContent, `#3 L. Ashby · +${formatMoney(37.5)}`);
  assert.equal(rows[2].getAttribute("data-after-sell"), "h3");
  // Seven: none is sold.
  const seven = players("h", [3, 3, 2, 2, 1, 0, 0], { 0: { name: "W. Brandt", isCaptain: true }, 2: { name: "L. Ashby" }, 3: { name: "R. Pike" }, 4: { name: "T. Gruk" } });
  const few = mount(sellSheetMarkup(modelAt(atRoster(begin({ home: { roster: seven } })))));
  assert.ok(few.querySelectorAll(".g-after__pick").every((row) => row.getAttribute("aria-disabled") === "true" && !row.hasAttribute("data-after-sell")));
  assert.match(few.textContent, /7 on the roster: no sale/);
});

test("a journeyman of this match can be kept at full price; a dead one cannot", () => {
  // Six of ours: a journeyman made the seven (Gata's sevens).
  const six = HOME.slice(0, 6);
  const state = atRoster(begin({ home: { roster: six, journeymen: [0] } }));
  const fragment = draw(modelAt(state));
  const row = fragment.querySelector(".g-after__keeprow");
  assert.equal(row.querySelector(".g-after__name").textContent, "#7 Human Lineman");
  const keep = row.querySelector("[data-after-keep]");
  assert.deepEqual([keep.textContent, keep.getAttribute("data-after-keep")], ["Keep · 50k", "journeyman-7"]);
  assert.equal(words(fragment, ".g-after__card .g-after__label").includes("Journeymen of this match"), true);
  // Kept: no row any more, its operation said.
  const kept = roster(state, { operation: "keep", playerId: "journeyman-7" });
  assert.ok(!draw(modelAt(kept)).querySelector("[data-after-keep]"));
  assert.deepEqual(opLines(modelAt(kept)), [{ label: "Journeyman stays: Human Lineman", amount: -50 }]);
  // Dead in the match: nothing to keep.
  const events = { home: [...RECORDS.home, ...hurt("journeyman-7", { code: "dead" })], away: RECORDS.away };
  assert.ok(!draw(modelAt(atRoster(begin({ home: { roster: six, journeymen: [0] }, events }), events))).querySelector("[data-after-keep]"));
});

test("Raise Dead only for Masters of Undeath, no more than the other side's dead", () => {
  assert.ok(!draw(modelAt(atRoster())).querySelector("[data-after-raise]"), "humans raise nobody");
  const undead = players("h", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const events = { home: RECORDS.home, away: [...RECORDS.away, ...hurt("a3", { code: "dead" })] };
  const begun = begin({ home: { roster: undead, slug: "teams/shambling-undead" }, events });
  assert.ok(teamHasSpecialRule(begun.home.reference, "Masters of Undeath"));
  const state = atRoster(begun, events);
  const raise = draw(modelAt(state)).querySelectorAll("[data-after-raise]");
  assert.deepEqual(raise.map((button) => [button.textContent, button.getAttribute("data-after-raise")]), [["Raise Dead · Skeleton Lineman", "0"], ["Raise Dead · Zombie Lineman", "1"]]);
  const raised = act(state, "home", { type: "roster", operation: "raise", rowIndex: 1 }, events);
  const shut = draw(modelAt(raised)).querySelectorAll(".g-after__place").filter((button) => /Raise Dead/.test(button.textContent));
  assert.ok(shut.every((button) => button.getAttribute("aria-disabled") === "true" && button.querySelector(".g-after__why").textContent === "No more dead on the other side to raise"));
  assert.deepEqual(opLines(modelAt(raised)), [{ label: "Raise Dead: Zombie Lineman", amount: 0 }]);
});

test("Raise Dead for a side that had a Plague Ridden player in the match (the house rules): the same cap, its own Lineman rows", () => {
  const events = { home: RECORDS.home, away: [...RECORDS.away, ...hurt("a3", { code: "dead" })] };
  // Nurgle: the Rotter Lineman is Plague Ridden; no Masters of Undeath.
  const nurgle = begin({ home: { roster: players("h", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]), slug: "teams/nurgle" }, events });
  assert.ok(!teamHasSpecialRule(nurgle.home.reference, "Masters of Undeath"));
  const state = atRoster(nurgle, events);
  const raise = draw(modelAt(state)).querySelectorAll("[data-after-raise]");
  assert.deepEqual(raise.map((button) => [button.textContent, button.getAttribute("data-after-raise")]), [["Raise Dead · Rotter Lineman", "0"]], "his own team's Lineman only");
  const raised = act(state, "home", { type: "roster", operation: "raise", rowIndex: 0 }, events);
  assert.deepEqual(opLines(modelAt(raised)), [{ label: "Raise Dead: Rotter Lineman", amount: 0 }]);
  assert.throws(() => act(raised, "home", { type: "roster", operation: "raise", rowIndex: 0 }, events), { code: "POST_RAISE" }, "one dead, one raised");
  assert.throws(() => act(state, "home", { type: "roster", operation: "raise", rowIndex: 1 }, events), { code: "POST_RAISE" }, "a Pestigor is no Lineman");
  // Humans with a Plague Ridden player in the match (a star's skills, say) raise a Lineman of theirs; without one, nobody.
  const humans = atRoster(begin({ events }), events);
  assert.throws(() => act(humans, "home", { type: "roster", operation: "raise", rowIndex: 0 }, events), { code: "POST_RAISE" });
  const ridden = structuredClone(humans);
  ridden.home.snapshot.players[0].skills = [...ridden.home.snapshot.players[0].skills, "Plague Ridden"];
  assert.deepEqual(draw(modelAt(ridden)).querySelectorAll("[data-after-raise]").map((button) => button.textContent),
    ["Raise Dead · Human Lineman", "Raise Dead · Halfling Hopeful"]);
  assert.equal(act(ridden, "home", { type: "roster", operation: "raise", rowIndex: 0 }, events).home.operations.length, 1);
  // No dead on the other side: nothing to raise.
  assert.throws(() => act(atRoster(begin({ home: { roster: players("h", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]), slug: "teams/nurgle" } })), "home",
    { type: "roster", operation: "raise", rowIndex: 0 }), { code: "POST_RAISE" });
});

test("this step's operations in words with their money, and «Undo the last»", () => {
  let state = atRoster();
  assert.ok(!draw(modelAt(state)).querySelector(".g-after__undo"), "nothing to undo");
  state = roster(state, { operation: "hire", rowIndex: 0 });
  state = roster(state, { operation: "staff", key: "assistantCoaches", delta: 1 });
  state = roster(state, { operation: "staff", key: "assistantCoaches", delta: 1 });
  state = roster(state, { operation: "sell", playerId: "h3" });
  assert.deepEqual(opLines(modelAt(state)), [
    { label: "Hire: Human Lineman", amount: -50 }, { label: "Assistant Coaches 0 → 1", amount: -10 }, { label: "Assistant Coaches 1 → 2", amount: -10 }, { label: "Sale: L. Ashby", amount: 37.5 },
  ]);
  const fragment = draw(modelAt(state));
  const card = fragment.querySelectorAll(".g-after__card").at(-1);
  assert.equal(card.querySelector(".g-after__label").textContent, "This step's operations");
  assert.deepEqual(card.querySelectorAll(".g-after__row").map((row) => [row.querySelector(".g-after__rowk").textContent, row.querySelector(".g-after__rowv").textContent, row.querySelector(".g-after__rowv").getAttribute("class")]), [
    ["Hire: Human Lineman", "−50k", "g-after__rowv g-after__rowv--danger"], ["Assistant Coaches 0 → 1", "−10k", "g-after__rowv g-after__rowv--danger"],
    ["Assistant Coaches 1 → 2", "−10k", "g-after__rowv g-after__rowv--danger"], ["Sale: L. Ashby", `+${formatMoney(37.5)}`, "g-after__rowv g-after__rowv--gain"],
  ]);
  const undo = card.querySelector(".g-after__undo");
  assert.deepEqual([undo.textContent, undo.getAttribute("data-prep-action")], ["Undo the last", "undo-roster"]);
  assert.equal(fragment.querySelector(".g-after__left").textContent, `${formatMoney(150 - 50 - 20 + 37.5)}`);
  // The footer locks the step; once passed, on to the treasury, nothing to undo.
  const footer = rosterStep(modelAt(state)).footer;
  assert.deepEqual([footer.kind, footer.action, footer.label, footer.disabled], ["action", "lock-roster", "Next: treasury", false]);
  const passed = modelOf(reach(state, { home: 4, away: 4 }), "roster");
  assert.deepEqual([rosterStep(passed).footer.kind, rosterStep(passed).footer.href], ["next", postMatchUrl("g1", "finance")]);
  assert.ok(!draw(passed).querySelector(".g-after__undo"));
  assert.ok(draw(passed).querySelectorAll("[data-after-open]").every((button) => button.getAttribute("aria-disabled") === "true"));
  assert.deepEqual(words(draw(modelAt(atRoster())), "[data-after-open]"), ["+ Hire", "Sell…"]);
});

test("names are text", () => {
  const hostile = HOME.slice(0, 6).map((player, index) => (index === 2 ? { ...player, name: HOSTILE } : player));
  let state = atRoster(begin({ home: { roster: hostile, team: HOSTILE, journeymen: [0], treasury: 300 }, away: { team: HOSTILE, roster: AWAY } }));
  state = roster(roster(state, { operation: "hire", rowIndex: 0 }), { operation: "hire", rowIndex: 0 });
  state = roster(state, { operation: "sell", playerId: "h3" });
  const model = modelAt(state);
  const fragment = mount(`${rosterStep(model).contentHtml}${hireSheetMarkup(model)}${sellSheetMarkup(model)}`);
  assert.ok(!fragment.querySelector("img"));
  assertCspSafe(fragment);
  assert.equal(opLines(model)[2].label, `Sale: ${HOSTILE}`);
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/matches/post-roster.mjs");
});

test("styled as the prototype draws it; readable; D2; nothing cut with «…»", () => {
  const sheets = [CSS, "src/screens/matches/post.css", "src/screens/matches/post-players.css", "resource-counter.css", "sheet.css", "button.css"];
  let state = atRoster(begin({ home: { roster: HOME.slice(0, 6), journeymen: [0], treasury: 300 } }));
  state = roster(roster(roster(state, { operation: "hire", rowIndex: 0 }), { operation: "hire", rowIndex: 0 }), { operation: "sell", playerId: "h3" });
  for (const model of [modelAt(state), modelOf(reach(state, { home: 4, away: 4 }), "roster")]) {
    assertStyled(mount(`${rosterStep(model).contentHtml}${hireSheetMarkup(model)}${sellSheetMarkup(model)}`), ...sheets);
  }
  const model = modelAt(state);
  assertStyled(mount(rosterStep({ ...model, preview: { ...model.preview, accounting: { ...model.preview.accounting, purchases: 900 } } }).contentHtml), ...sheets);
  const own = (selector, property) => valuesOf(CSS, selector, property);
  // The prototype's values (PostRoster.html).
  assert.deepEqual(own(".g-after__left", "font"), ["700 24px/1 var(--font-display)"]);
  assert.deepEqual(own(".g-after__left--short", "color"), ["var(--danger)"]);
  assert.deepEqual(own(".g-after__moneyk", "font"), ["400 14px/1.35 var(--font-body)"]);
  assert.deepEqual(own(".g-after__opens", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(own(".g-after__open", "box-shadow"), ["inset 0 0 0 1px var(--control-border)"]);
  assert.deepEqual(own(".g-after__open", "font"), ["600 14px/1.25 var(--font-body)"]);
  assert.deepEqual(valuesOf("src/ui/resource-counter.css", ".g-resource", "min-height"), ["58px"], "the staff's rows 58px");
  // Readable in every palette.
  for (const selector of [".g-after__rowv--danger", ".g-after__rowv--gain", ".g-after__moneyk", ".g-after__left", ".g-after__left--short", ".g-after__undo"]) assertReadable(CSS, selector, "color", ["--surface"], 4.5);
  assertReadable(CSS, '.g-after__pick[aria-disabled="true"]', "color", ["--surface-2"], 4.5);
  // D2: a thumb's up to 900px; from 901px the prototype's (the counters' 34px, «Undo the last» 36px), never under 24.
  const px = (value) => ({ "var(--size-touch)": 44, "var(--size-cta)": 52 })[value] ?? parseInt(value, 10);
  for (const [selector, property] of [[".g-after__open", "min-height"], [".g-after__place", "min-height"], [".g-after__undo", "min-height"]]) assert.ok(px(own(selector, property)[0]) >= 44, selector);
  assert.equal(px(own(".g-after__pick", "min-height").at(-1)), 52, "a sheet's row, the prototype's 52px");
  assert.ok(px(valuesOf("src/ui/resource-counter.css", ".g-resource__btn", "width")[0]) >= 44, "the counters' buttons on a phone");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-after__staff .g-resource__btn", "width"), ["34px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-after__undo", "min-height"), ["36px"]);
  // Nothing cut.
  const bare = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(bare, /ellipsis|text-overflow|line-clamp|nowrap/);
  assert.doesNotMatch(bare, /--focus-ring|style=/);
  for (const selector of [".g-after__moneyk", ".g-after__why"]) assert.ok(own(selector, "overflow-wrap").includes("anywhere"), selector);
  for (const [, query] of text(CSS).matchAll(/@media\s*([^{]+)\{/g)) assert.ok(["(max-width: 900px)", "(min-width: 901px)"].includes(query.trim()), query);
  const styles = text("src/styles.css");
  assert.ok(styles.indexOf('@import url("screens/matches/post-money.css");') > styles.indexOf('@import url("screens/matches/post-players.css");'), "the money's sheet after the players'");
});
