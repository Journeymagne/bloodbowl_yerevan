import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints } from "./helpers/css.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { builderStaffMaximums, medicalStaffDefinitions } from "../src/domain/league-rules.mjs";
import { BUILD_STAFF_KEYS, buildTotals, hirePlayer, newBuild, stepStaff } from "../src/domain/roster/build.mjs";
import { setRosterCaptain } from "../src/domain/roster/players.mjs";
import { PLAYER_STATS, rowsForTeam } from "../src/domain/roster/values.mjs";
import { builderMarkup, buildRefusalText, wireBuilder } from "../src/screens/teams/builder-view.mjs";

const BUILDER_CSS = "src/screens/teams/builder.css";
// The numbers, the names and the captain, the staff and the save: the builder's second sheet (stage 13).
const ROSTER_CSS = "src/screens/teams/builder-roster.css";
const BUILDER_SHEETS = [BUILDER_CSS, ROSTER_CSS];
const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const human = data.teams.find((team) => team.slug === "teams/human");
const goblin = data.teams.find((team) => team.slug === "teams/goblin");
const undead = data.teams.find((team) => team.slug === "teams/shambling-undead");
const rowOf = (team, position) => rowsForTeam(team).findIndex((item) => item.position === position);
const ogre = rowOf(human, "Ogre");

function hire(team, draft, position, times = 1) {
  for (let index = 0; index < times; index += 1) assert.equal(hirePlayer(team, draft, rowOf(team, position)), null);
  return draft;
}

/** Builder.html: 5 linemen, a thrower, a catcher, a blitzer, a start re-roll and a fan: 555k, 45k left. */
function filled(name = "Iron Rooks") {
  const draft = newBuild(human, { name });
  for (const [position, times] of [["Human Lineman", 5], ["Thrower", 1], ["Catcher", 1], ["Blitzer", 1]]) hire(human, draft, position, times);
  stepStaff(human, draft, "startingRerolls", 1);
  stepStaff(human, draft, "dedicatedFans", 1);
  return draft;
}

/** BuilderOver.html: 820k, 220k over. */
function overBudget() {
  const draft = newBuild(human, { name: "Iron Rooks" });
  for (const [position, times] of [["Human Lineman", 3], ["Thrower", 1], ["Catcher", 2], ["Blitzer", 2], ["Ogre", 1]]) hire(human, draft, position, times);
  for (const key of ["startingRerolls", "startingRerolls", "dedicatedFans", "dedicatedFans"]) stepStaff(human, draft, key, 1);
  return draft;
}

const HANDLERS = ["onHire", "onStaff", "onToggleStaff", "onRefused", "onRosterToggle", "onNumber", "onName", "onCaptain", "onLogo", "onLogoRemove", "onChoiceOpen", "onChoose", "onChoiceClose", "onRestart", "onSave"];
const noop = Object.fromEntries(HANDLERS.map((name) => [name, () => {}]));
const failing = (...names) => Object.fromEntries(names.map((name) => [name, () => assert.fail(`${name} was not to be heard`)]));

/** Each test wires the page it mounted; the listener of the one before is released first. */
let release = () => {};
function wire(handlers) {
  release();
  release = wireBuilder(document.body, handlers);
  return release;
}

test("the builder shows the budget, the race, the positions with their limits and the staff the race may buy (Builder)", () => {
  const draft = filled();
  const fragment = mount(builderMarkup({ race: human, draft }));
  assert.equal(fragment.querySelector("h1").textContent, "Iron Rooks");
  assert.equal(fragment.querySelector('[role="progressbar"]').getAttribute("aria-valuenow"), "555");
  assert.match(fragment.querySelector(".g-build__left").textContent, /45k/);
  assert.equal(fragment.querySelectorAll(".g-hire").length, rowsForTeam(human).length);
  assert.equal(fragment.querySelector('[data-hire-key="0"] .g-hire__count').textContent, "5");
  assert.equal(fragment.querySelector("[data-new-team-save]").textContent.trim(), "Save team · 555k");
  assert.match(fragment.querySelector('[data-resource-key="bribes"]').getAttribute("class"), /g-resource--locked/, "humans have no Bribery and Corruption");
  assert.ok(fragment.querySelector('.g-toggle[data-toggle-key="apothecary"]'));
  assertCspSafe(fragment);
  assertStyled(fragment, ...BUILDER_SHEETS, "button.css", "resource-counter.css", "toggle.css", "status-chip.css", "callout.css");
  assertDictionaryCovers("src/screens/teams/builder-view.mjs");
});

test("the head names the team and the race and leads back to the list; the budget says what is spent and left", () => {
  const fragment = mount(builderMarkup({ race: human, draft: filled() }));
  const back = fragment.querySelector(".g-build__head a.g-icon-btn");
  assert.deepEqual([back.getAttribute("href"), back.getAttribute("aria-label"), back.hasAttribute("data-history-back"), back.getAttribute("data-history-fallback")], ["#/teams", "Back", true, "#/teams"]);
  assert.equal(fragment.querySelector(".g-build__head p").textContent, "Human · new team");
  assert.equal(fragment.querySelector(".g-build__head .g-status").textContent, "Draft");
  assert.equal(fragment.querySelector(".g-build__head [data-new-team-restart]").textContent.trim(), "Change the race or the name");
  const budget = fragment.querySelector(".g-build__budget");
  assert.match(budget.textContent, /Budget\s*600k/);
  assert.match(budget.textContent, /Spent\s*555k/);
  assert.match(fragment.querySelector(".g-build__left").parentNode.textContent, /45k\s*left/);
  const bar = fragment.querySelector('[role="progressbar"]');
  assert.deepEqual([bar.getAttribute("aria-valuemin"), bar.getAttribute("aria-valuemax"), bar.getAttribute("aria-label")], ["0", "600", "Spent of the budget"]);
  assert.deepEqual(fragment.querySelectorAll(".g-build__totals dd").map((cell) => cell.textContent), ["485k", "70k", "555k"], "the desk's rows: players, staff, total");
  assert.equal(fragment.querySelector(".g-build__team").textContent.includes("Human · Tier 1"), true, "the race with its tier from the data");
});

test("the doc order is the phone's: head, budget, team, players, numbers, staff, then the save", () => {
  const fragment = mount(builderMarkup({ race: human, draft: filled() }));
  const root = fragment.querySelector(".g-build");
  const children = root.childNodes.filter((node) => node.nodeType === 1);
  assert.deepEqual(children.map((child) => child.getAttribute("class").split(" ")[0]), ["g-build__head", "g-build__budget", "g-build__team", "g-build__players", "g-build__roster", "g-build__staff", "g-build__cta"]);
});

test("nobody hired, no list of numbers: a heading over nothing is not drawn", () => {
  const empty = mount(builderMarkup({ race: human, draft: newBuild(human, { name: "R" }), rosterOpen: true }));
  assert.equal(empty.querySelector(".g-build__roster"), null);
  assert.equal(empty.querySelector("[data-roster-toggle]"), null);
  assert.equal(empty.querySelector("#new-team-roster"), null);
  const one = newBuild(human, { name: "R" });
  hire(human, one, "Thrower");
  assert.ok(mount(builderMarkup({ race: human, draft: one })).querySelector("[data-roster-toggle]"));
});

test("the bar fills in steps of ten, and goes red and full over the budget", () => {
  const steps = (draft) => mount(builderMarkup({ race: human, draft })).querySelector('[role="progressbar"]').getAttribute("class");
  assert.match(steps(newBuild(human, { name: "R" })), /g-build__bar--0(\s|$)/);
  assert.match(steps(filled()), /g-build__bar--90(\s|$)/, "555 of 600 is 92.5%");
  assert.doesNotMatch(steps(filled()), /--over/);
  assert.match(steps(overBudget()), /g-build__bar--100(\s|$)/);
  assert.match(steps(overBudget()), /g-build__bar--over/);
  const small = newBuild(human, { name: "R" });
  stepStaff(human, small, "cheerleaders", 1);
  assert.match(steps(small), /g-build__bar--10(\s|$)/, "10k of 600k is a sliver, not nothing");
  const css = readFileSync(new URL(`../${BUILDER_CSS}`, import.meta.url), "utf8");
  for (let step = 0; step <= 100; step += 10) assert.match(css, new RegExp(`\\.g-build__bar--${step}(?![\\d-])`), `.g-build__bar--${step} is drawn`);
});

test("the save says what it waits for: players, or the money over (BuilderOver)", () => {
  assert.equal(mount(builderMarkup({ race: human, draft: newBuild(human, { name: "R" }) })).querySelector("[data-new-team-save]").textContent.trim(), "Add players: 7 more");
  const over = mount(builderMarkup({ race: human, draft: overBudget() }));
  assert.equal(over.querySelector("[data-new-team-save]").textContent.trim(), "Over budget by 220k");
  assert.equal(over.querySelector("[data-new-team-save]").hasAttribute("disabled"), true);
  assert.ok(over.querySelector(".g-build__bar--over"));
  assert.match(over.querySelector(".g-build__left").textContent, /220k/);
  assert.match(over.querySelector(".g-build__left").parentNode.textContent, /over/);
  assert.match(over.querySelector(".g-build__cta").textContent, /Remove players or staff to fit into 600k\./);
  assert.match(mount(builderMarkup({ race: human, draft: newBuild(human, { name: "R" }) })).querySelector(".g-build__cta").textContent, /A squad has 7 to 14 players\./);
  assert.match(mount(builderMarkup({ race: human, draft: filled() })).querySelector(".g-build__cta").textContent, /Left in the treasury: 45k/);
});

test("the save is on for a legal squad with a name, and only then; saving changes the words, not the button", () => {
  const save = (props) => mount(builderMarkup({ race: human, ...props })).querySelector("[data-new-team-save]");
  assert.equal(save({ draft: filled() }).hasAttribute("disabled"), false);
  const unnamed = filled();
  unnamed.teamName = "   ";
  assert.equal(save({ draft: unnamed }).hasAttribute("disabled"), true, "the server refuses a team without a name");
  const pending = save({ draft: filled(), pending: true });
  assert.equal(pending.textContent.trim(), "Saving…");
  assert.equal(pending.hasAttribute("disabled"), false, "a disabled button in focus loses it in Chrome: the second press is the screen's to drop");
});

test("a full position and a full squad refuse «+» with the rule, which the coach hears", () => {
  const draft = newBuild(human, { name: "R" });
  hirePlayer(human, draft, ogre);
  const fragment = mount(builderMarkup({ race: human, draft }));
  const plus = fragment.querySelector(`[data-hire-key="${ogre}"] [data-hire-step="1"]`);
  assert.equal(plus.getAttribute("aria-disabled"), "true");
  assert.equal(plus.getAttribute("title"), "Ogre: maximum is 1.");
  const heard = [];
  wire({ ...noop, ...failing("onHire"), onRefused: (reason) => heard.push(reason) });
  fireEvent(plus, "click");
  assert.deepEqual(heard, ["Ogre: maximum is 1."]);
  const other = fragment.querySelector('[data-hire-key="0"] [data-hire-step="1"]');
  assert.equal(other.hasAttribute("aria-disabled"), false, "a position with room is not refused");
  assert.equal(other.hasAttribute("title"), false);
});

test("fourteen players refuse every «+», each with the squad's rule unless the position is full itself", () => {
  const draft = newBuild(human, { name: "R" });
  hire(human, draft, "Human Lineman", 12);
  hire(human, draft, "Ogre");
  hire(human, draft, "Thrower");
  assert.equal(draft.players.length, 14);
  const fragment = mount(builderMarkup({ race: human, draft }));
  const titleOf = (position) => fragment.querySelector(`[data-hire-key="${rowOf(human, position)}"] [data-hire-step="1"]`).getAttribute("title");
  assert.equal(titleOf("Catcher"), "A team has at most 14 players (now 14).");
  assert.equal(titleOf("Human Lineman"), "A team has at most 14 players (now 14).");
  assert.equal(titleOf("Ogre"), "Ogre: maximum is 1.", "the position's own limit is the first thing in the way");
  assert.equal(mount(builderMarkup({ race: human, draft })).querySelector(".g-build__players").textContent.includes("14 of 14"), true);
  assert.equal(fragment.querySelector(`[data-hire-key="${ogre}"] .g-hire__limit`).getAttribute("class").includes("g-hire__limit--max"), true);
});

test("a position the money no longer buys is greyed and still clickable: going over is allowed and shown", () => {
  const plusOf = (fragment, position) => fragment.querySelector(`[data-hire-key="${rowOf(human, position)}"] [data-hire-step="1"]`);
  const tight = mount(builderMarkup({ race: human, draft: filled() }));
  assert.match(plusOf(tight, "Human Lineman").getAttribute("class"), /g-hire__inc--poor/, "50k is more than the 45k left");
  assert.doesNotMatch(plusOf(tight, "Halfling Hopeful").getAttribute("class"), /g-hire__inc--poor/, "30k fits");
  assert.equal(plusOf(tight, "Human Lineman").hasAttribute("aria-disabled"), false, "greyed, not refused");
  const over = mount(builderMarkup({ race: human, draft: overBudget() }));
  assert.match(plusOf(over, "Halfling Hopeful").getAttribute("class"), /g-hire__inc--poor/, "over the budget, nothing is affordable");
  assert.equal(plusOf(over, "Halfling Hopeful").hasAttribute("aria-disabled"), false);
  const heard = [];
  wire({ ...noop, onHire: (row, delta) => heard.push([row, delta]) });
  fireEvent(plusOf(over, "Halfling Hopeful"), "click");
  assert.deepEqual(heard, [[rowOf(human, "Halfling Hopeful"), 1]]);
});

test("a position says its price, its limit, its stats and its skills; none is no skills; the minus is off at zero", () => {
  const fragment = mount(builderMarkup({ race: human, draft: filled() }));
  const lineman = fragment.querySelector('[data-hire-key="0"]');
  assert.equal(lineman.querySelector(".g-hire__name").textContent, "Human Lineman");
  assert.equal(lineman.querySelector(".g-hire__price").textContent, "50k");
  assert.equal(lineman.querySelector(".g-hire__limit").textContent, "5 of 16");
  assert.equal(lineman.querySelector(".g-hire__stats").textContent.replaceAll("\u00a0", " "), "MA 6 · ST 3 · AG 3+ · PA 4+ · AR 9+");
  assert.equal(lineman.querySelector(".g-hire__skills").textContent, "no skills");
  assert.equal(lineman.querySelector(".g-hire__avatar").textContent, "H");
  const thrower = fragment.querySelector(`[data-hire-key="${rowOf(human, "Thrower")}"]`);
  assert.equal(thrower.querySelector(".g-hire__skills").textContent, "Pass, Sure Hands");
  assert.equal(thrower.querySelector('[data-hire-step="1"]').getAttribute("aria-label"), "Add: Thrower");
  assert.equal(thrower.querySelector('[data-hire-step="-1"]').getAttribute("aria-label"), "Remove: Thrower");
  assert.equal(fragment.querySelector(`[data-hire-key="${ogre}"] [data-hire-step="-1"]`).hasAttribute("disabled"), true);
  assert.equal(thrower.querySelector('[data-hire-step="-1"]').hasAttribute("disabled"), false);
  assert.equal(fragment.querySelector(".g-build__players").textContent.includes("8 of 14 · at least 7"), true);
});

test("a position's stats are kept in pairs: a line may wrap between them and nowhere inside one, and never before a dot", () => {
  for (const locale of ["en", "ru"]) {
    initLocale(locale);
    try {
      const text = mount(builderMarkup({ race: human, draft: filled() })).querySelector('[data-hire-key="0"] .g-hire__stats').textContent;
      const units = text.split(" ");
      assert.equal(units.length, PLAYER_STATS.length, `${locale}: ${PLAYER_STATS.length} units to wrap between, not one more`);
      for (const unit of units.slice(0, -1)) assert.match(unit, /^\S+\u00a0\S+\u00a0·$/, `${locale}: label, value and the dot that follows`);
      assert.match(units.at(-1), /^\S+\u00a0\S+$/, `${locale}: the last pair has no dot`);
    } finally {
      initLocale("en");
    }
  }
});

test("every amount on the screen is written as the rest of it is: a thousand and over has its separator (formatMoney)", () => {
  const rich = filled();
  rich.startingRerolls = 30; // 1,800k of re-rolls: no rule in the draft stops a count, the totals only add
  const fragment = mount(builderMarkup({ race: human, draft: rich }));
  const totals = buildTotals(human, rich);
  assert.ok(totals.over > 1000 && totals.total > 1000, `${totals.total} spent, ${totals.over} over`);
  const { over, total } = totals;
  const written = (amount) => `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(amount)}k`;
  assert.equal(fragment.querySelector("[data-new-team-save]").textContent.trim(), `Over budget by ${written(over)}`);
  assert.match(written(over), /^\d,\d{3}k$/);
  assert.match(fragment.querySelector(".g-build__left").textContent, new RegExp(written(over)));
  assert.match(fragment.querySelector(".g-build__figures").textContent, new RegExp(`Spent ${written(total)}`));
  assert.doesNotMatch(fragment.querySelector(".g-build__cta").textContent + fragment.querySelector(".g-build__left").textContent, /\b\d{4}k/);
  // The sentences take the amount written, so the unit is not in them twice (nor once in two ways).
  for (const locale of ["en", "ru"]) {
    const dictionary = JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
    for (const key of ["save", "overBy", "noteOk", "noteOver", "price", "fansNote", "rerollNote"]) assert.doesNotMatch(dictionary[`newTeam.${key}`], /\}k/, `${locale} newTeam.${key}`);
  }
  // The ready squad's button and notes carry the same writing.
  const ready = mount(builderMarkup({ race: human, draft: filled() }));
  assert.equal(ready.querySelector("[data-new-team-save]").textContent.trim(), "Save team · 555k");
  assert.match(ready.querySelector(".g-build__cta").textContent, /Left in the treasury: 45k/);
});

test("drawing the screen hires nobody: the refusals are asked of a copy", () => {
  const draft = filled();
  const before = JSON.stringify(draft);
  mount(builderMarkup({ race: human, draft }));
  mount(builderMarkup({ race: human, draft }));
  assert.equal(JSON.stringify(draft), before, "not a field of the draft is touched");
  assert.equal(draft.players.length, 8);
});

test("numbers, names and the captain: a list a phone opens and a desk always shows; one captain, chosen with the arrows", () => {
  const fragment = mount(builderMarkup({ race: human, draft: filled(), rosterOpen: true }));
  assert.equal(fragment.querySelector("[data-roster-toggle]").getAttribute("aria-expanded"), "true");
  assert.equal(fragment.querySelectorAll("[data-player-number]").length, 8);
  assert.equal(fragment.querySelector('[role="radiogroup"][data-captains]').getAttribute("aria-label"), "Captain");
  const heard = [];
  wire({ ...noop, onCaptain: (id) => heard.push(id), onNumber: (id, value) => heard.push([id, value]) });
  const [first, second] = fragment.querySelectorAll("[data-captain]");
  first.focus();
  fireEvent(first, "keydown", { key: "ArrowDown" });
  assert.equal(document.activeElement, second, "focus moves along the group, not off it");
  fireEvent(Object.assign(fragment.querySelector("[data-player-number]"), { value: "12" }), "input");
  assert.equal(heard.length, 2);
  assert.equal(heard[0], second.getAttribute("data-captain"));
  assert.deepEqual(heard[1], [fragment.querySelector("[data-player-number]").getAttribute("data-player-number"), "12"]);
});

test("the list is shut on a phone until it is asked for, and the toggle says what it does", () => {
  const shut = mount(builderMarkup({ race: human, draft: filled() }));
  const toggle = shut.querySelector("[data-roster-toggle]");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-controls"), "new-team-roster");
  assert.match(toggle.textContent, /Numbers, names and captain · 8/);
  assert.ok(shut.querySelector("#new-team-roster.g-build__roster-list--shut"));
  const open = mount(builderMarkup({ race: human, draft: filled(), rosterOpen: true }));
  assert.match(open.querySelector("[data-roster-toggle]").textContent, /Hide/);
  assert.equal(open.querySelector("#new-team-roster").getAttribute("class").includes("--shut"), false);
  const css = readFileSync(new URL(`../${ROSTER_CSS}`, import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 900px\)\s*\{[^@]*\.g-build__roster-list--shut\s*\{\s*display:\s*none/, "shut on a phone only");
  assert.match(css, /@media \(min-width: 901px\)\s*\{[^@]*\.g-build__roster-toggle\s*\{\s*display:\s*none/, "no toggle on a desk, where the list is always there");
});

test("a row of the list: the number, the name with the position as its hint, the captain; one captain at most", () => {
  const draft = filled();
  setRosterCaptain(draft, draft.players[2].id);
  const fragment = mount(builderMarkup({ race: human, draft }));
  const rows = fragment.querySelectorAll(".g-roster-row");
  assert.equal(rows.length, 8);
  const number = rows[0].querySelector("[data-player-number]");
  assert.deepEqual(["type", "min", "max", "inputmode", "value", "aria-label"].map((attribute) => number.getAttribute(attribute)), ["number", "1", "99", "numeric", "1", "Number"]);
  const name = rows[0].querySelector("[data-player-name]");
  assert.equal(name.getAttribute("value"), draft.players[0].name);
  assert.equal(name.getAttribute("placeholder"), "Human Lineman");
  assert.equal(name.getAttribute("aria-label"), "Player's name");
  assert.equal(name.getAttribute("id"), `new-team-name-${draft.players[0].id}`);
  assert.equal(rows[0].querySelector(".g-roster-row__position").getAttribute("id"), `new-team-position-${draft.players[0].id}`);
  const checked = fragment.querySelectorAll('[data-captain][aria-checked="true"]');
  assert.equal(checked.length, 1);
  assert.equal(checked[0].getAttribute("data-captain"), draft.players[2].id);
  assert.equal(checked[0].getAttribute("role"), "radio");
  assert.deepEqual(fragment.querySelectorAll("[data-captain]").map((radio) => radio.getAttribute("tabindex")), ["-1", "-1", "0", "-1", "-1", "-1", "-1", "-1"], "Tab enters the group once, at the captain");
  assert.deepEqual(mount(builderMarkup({ race: human, draft: filled() })).querySelectorAll("[data-captain]").map((radio) => radio.getAttribute("tabindex")).slice(0, 2), ["0", "-1"], "with no captain, at the first");
});

/** What a screen reader calls an element: its aria-labelledby resolved (a text field gives its value), else its aria-label or its text. */
function accessibleName(root, element) {
  const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  if (!ids.length) return element.getAttribute("aria-label") ?? element.textContent.trim();
  return ids.map((id) => {
    const target = root.querySelector(`#${id}`);
    assert.ok(target, `aria-labelledby points at #${id}, which is not on the page`);
    return target.tagName === "INPUT" ? target.getAttribute("value") : target.textContent.trim();
  }).filter(Boolean).join(" ").trim();
}

test("each captain is named by its player, and the text fields stand outside the radio group", () => {
  const draft = filled();
  draft.players[0].name = "Brandt";
  const fragment = mount(builderMarkup({ race: human, draft, rosterOpen: true }));
  const radios = fragment.querySelectorAll("[data-captain]");
  const names = radios.map((radio) => accessibleName(fragment, radio));
  assert.equal(new Set(names).size, 8, "a screen reader hears eight different radios, not eight times «Captain»");
  // The word is in each name, not only in the group's: Safari does not follow aria-owns, and there a radio is read alone.
  assert.equal(names[0], "Captain Brandt Human Lineman", "the word, then the player's name, then the position");
  assert.ok(names.every((name) => name.startsWith("Captain ")), names.join(" | "));
  draft.players.forEach((player, index) => assert.ok(names[index].includes(player.name), `${names[index]} has ${player.name}`));
  const word = fragment.querySelector("#new-team-captain-label");
  assert.equal(word.textContent, "Captain");
  assert.ok(word.getAttribute("class").includes("g-sr-only"), "for a screen reader, not for the eye: the radio shows a «C»");
  assert.equal(radios[0].getAttribute("aria-labelledby").split(" ")[0], "new-team-captain-label");
  assert.equal(radios.some((radio) => radio.hasAttribute("aria-label")), false, "the name is the labelledby's: an aria-label would be a second, losing one");
  // The group owns the radios and wraps nothing else: focusing a number or a name does not announce «Captain, radio group».
  const group = fragment.querySelector('[role="radiogroup"][data-captains]');
  assert.equal(group.getAttribute("aria-label"), "Captain");
  assert.equal(group.childNodes.length, 0);
  assert.deepEqual(group.getAttribute("aria-owns").split(" "), radios.map((radio) => radio.getAttribute("id")));
  assert.ok(radios.every((radio) => radio.getAttribute("id")));
  for (const field of fragment.querySelectorAll("input")) assert.equal(field.closest('[role="radiogroup"]'), null, `${field.getAttribute("data-player-name") ?? field.getAttribute("type")} is inside the radio group`);
  // The visible «C» is the same in every row; it is not what names the radio.
  assert.ok(radios.every((radio) => radio.textContent === "C" && !names.includes("C")));
});

test("a typed name is the radio's name too, and a cleared one leaves the position", () => {
  const draft = filled();
  draft.players[1].name = "";
  const fragment = mount(builderMarkup({ race: human, draft, rosterOpen: true }));
  assert.equal(accessibleName(fragment, fragment.querySelectorAll("[data-captain]")[1]), "Captain Human Lineman");
  draft.players[1].name = HOSTILE;
  assert.equal(accessibleName(mount(builderMarkup({ race: human, draft, rosterOpen: true })), document.querySelectorAll("[data-captain]")[1]), `Captain ${HOSTILE} Human Lineman`);
});

test("a name a coach typed is text, in the title and in the fields", () => {
  const draft = filled(HOSTILE);
  draft.players[0].name = HOSTILE;
  const fragment = mount(builderMarkup({ race: human, draft, rosterOpen: true }));
  assert.equal(fragment.querySelector("h1").textContent, HOSTILE);
  assert.equal(fragment.querySelector("[data-player-name]").getAttribute("value"), HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
});

test("a race with a choice of league opens a sheet of options; one with a single league shows it as text", () => {
  const halfling = data.teams.find((team) => team.slug === "teams/halfling");
  const choosing = mount(builderMarkup({ race: halfling, draft: newBuild(halfling, { name: "H" }), choice: "league" }));
  assert.ok(choosing.querySelector('dialog#new-team-choice .g-options[role="radiogroup"]'));
  assert.equal(choosing.querySelectorAll("dialog#new-team-choice [data-option-value]").length, 3);
  assert.equal(choosing.querySelector('dialog#new-team-choice [aria-checked="true"]').getAttribute("data-option-value"), "Halfling Thimble Cup");
  assert.equal(mount(builderMarkup({ race: human, draft: newBuild(human, { name: "H" }) })).querySelector('[data-new-team-choice="league"]'), null);
  assert.equal(mount(builderMarkup({ race: human, draft: newBuild(human, { name: "H" }) })).querySelector(".g-build__team").textContent.includes("Old World Classic"), true);
  assertStyled(choosing, ...BUILDER_SHEETS, "button.css", "resource-counter.css", "toggle.css", "status-chip.css", "callout.css", "sheet.css", "option-card.css");
});

test("the league and the favoured alignment are each chosen from a sheet, when there are two or more to choose from", () => {
  const chosen = data.teams.find((team) => team.slug === "teams/chaos-chosen");
  const norse = data.teams.find((team) => team.slug === "teams/norse");
  const draft = newBuild(chosen, { name: "C" });
  const fragment = mount(builderMarkup({ race: chosen, draft }));
  assert.equal(fragment.querySelector('[data-new-team-choice="league"]'), null, "one league");
  assert.ok(fragment.querySelector('[data-new-team-choice="favoured"]'));
  assert.equal(fragment.querySelector(".g-build__team").textContent.includes("Favoured Of"), true);
  assert.equal(fragment.querySelector(".g-build__team").textContent.includes("Undivided"), true);
  const league = mount(builderMarkup({ race: norse, draft: newBuild(norse, { name: "N" }) }));
  assert.ok(league.querySelector('[data-new-team-choice="league"]'));
  assert.equal(league.querySelector('[data-new-team-choice="favoured"]'), null, "one alignment");
  const opened = mount(builderMarkup({ race: chosen, draft, choice: "favoured" }));
  assert.equal(opened.querySelector("dialog#new-team-choice .g-sheet__title").textContent, "Favoured Of");
  assert.equal(opened.querySelectorAll("dialog#new-team-choice [data-option-value]").length, 6);
  const nothing = mount(builderMarkup({ race: chosen, draft, choice: "league" }));
  assert.equal(nothing.querySelector("dialog"), null, "a choice with nothing to choose from opens no sheet");
  assert.equal(mount(builderMarkup({ race: chosen, draft, choice: "bogus" })).querySelector("dialog"), null);
});

test("the sheet and the buttons of the screen tell what was chosen, asked or closed", () => {
  const halfling = data.teams.find((team) => team.slug === "teams/halfling");
  const fragment = mount(builderMarkup({ race: halfling, draft: newBuild(halfling, { name: "H" }), choice: "league" }));
  const heard = [];
  wire({ ...noop, onChoiceOpen: (kind) => heard.push(["open", kind]), onChoose: (kind, value) => heard.push(["choose", kind, value]), onChoiceClose: () => heard.push(["close"]), onRestart: () => heard.push(["restart"]), onSave: () => heard.push(["save"]) });
  fireEvent(fragment.querySelector('[data-option-value="Woodland League"]'), "click");
  fireEvent(fragment.querySelector("[data-sheet-close]"), "click");
  fireEvent(fragment.querySelector('[data-new-team-choice="league"]'), "click");
  // The save is heard from a squad that may be saved: a disabled button takes no click in a browser.
  const legal = mount(builderMarkup({ race: human, draft: filled() }));
  assert.equal(legal.querySelector("[data-new-team-save]").hasAttribute("disabled"), false);
  fireEvent(legal.querySelector("[data-new-team-restart]"), "click");
  fireEvent(legal.querySelector("[data-new-team-save]"), "click");
  assert.deepEqual(heard, [["choose", "league", "Woodland League"], ["close"], ["open", "league"], ["restart"], ["save"]]);
});

test("«Change the race or the name» opens a dialog: onRestart is handed its button", () => {
  const fragment = mount(builderMarkup({ race: human, draft: filled() }));
  const button = fragment.querySelector("[data-new-team-restart]");
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.getAttribute("aria-haspopup"), "dialog", "the first step is a sheet over the builder now, and the button says it opens one");
  const heard = [];
  wire({ ...noop, onRestart: (opener) => heard.push(opener) });
  fireEvent(button, "click");
  assert.deepEqual(heard, [button], "the sheet gives the focus back to it when it closes");
});

test("the staff the race may buy: counters with their price, medics as switches, bribes where Bribery allows them", () => {
  const fragment = mount(builderMarkup({ race: human, draft: filled() }));
  const counter = (key) => fragment.querySelector(`[data-resource-key="${key}"]`);
  assert.deepEqual(["startingRerolls", "dedicatedFans", "assistantCoaches", "cheerleaders", "bribes"].map((key) => counter(key) !== null), [true, true, true, true, true]);
  assert.equal(counter("startingRerolls").querySelector(".g-resource__name").textContent, "Starting rerolls");
  assert.equal(counter("startingRerolls").querySelector(".g-resource__note").textContent, "60k each");
  assert.equal(counter("startingRerolls").querySelector(".g-resource__value").textContent, "1");
  assert.equal(counter("dedicatedFans").querySelector(".g-resource__note").textContent, "10k · in the season they change only after matches");
  assert.equal(counter("cheerleaders").querySelector(".g-resource__note").textContent, "10k each");
  assert.equal(counter("bribes").querySelector(".g-resource__note").textContent, "Only for teams with Bribery and Corruption");
  assert.deepEqual(fragment.querySelectorAll(".g-toggle").map((toggle) => toggle.getAttribute("data-toggle-key")), ["apothecary"], "humans have the apothecary and no other medic");
  assert.equal(fragment.querySelector(".g-toggle").getAttribute("aria-checked"), "false");
  assert.match(fragment.querySelector(".g-toggle").textContent, /Apothecary\s*50k/);
  // Stage 12 (decision 26): the team is saved as a draft, which buys Start Re-rolls on its page too; Team Re-rolls wait for the season.
  assert.match(fragment.querySelector(".g-build__staff").textContent,
    /Start Re-rolls cost 60k while the team is in its build: buy them now or later on the team's page, while it is in the build\. Team Re-rolls at 120k — on the team's page once it is in the season; an administrator can move the team into the season\./);

  const mob = newBuild(goblin, { name: "G" });
  stepStaff(goblin, mob, "bribes", 1);
  stepStaff(goblin, mob, "apothecary", 1);
  const bribery = mount(builderMarkup({ race: goblin, draft: mob }));
  assert.equal(bribery.querySelector('[data-resource-key="bribes"]').getAttribute("class").includes("--locked"), false, "a Bribery race buys them");
  assert.equal(bribery.querySelector('[data-resource-key="bribes"] .g-resource__value').textContent, "1");
  assert.equal(bribery.querySelector('[data-resource-key="bribes"] .g-resource__note').textContent, "50k each");

  const dead = mount(builderMarkup({ race: undead, draft: newBuild(undead, { name: "U" }) }));
  assert.deepEqual(dead.querySelectorAll(".g-toggle").map((toggle) => toggle.getAttribute("data-toggle-key")), ["mortuaryAssistant"], "the undead have their own medic");
  assert.equal(dead.querySelector(".g-toggle").getAttribute("aria-checked"), "false");
  const hired = newBuild(undead, { name: "U" });
  stepStaff(undead, hired, "mortuaryAssistant", 1);
  assert.equal(mount(builderMarkup({ race: undead, draft: hired })).querySelector(".g-toggle").getAttribute("aria-checked"), "true");
});

test("the staff at their maximum refuse «+» and say which staff, by the title of the code's key (T6)", () => {
  const draft = newBuild(human, { name: "R" });
  for (let index = 0; index < builderStaffMaximums.cheerleaders; index += 1) stepStaff(human, draft, "cheerleaders", 1);
  const fragment = mount(builderMarkup({ race: human, draft }));
  const plus = fragment.querySelector('[data-resource-key="cheerleaders"] [data-resource-step="1"]');
  assert.equal(plus.getAttribute("aria-disabled"), "true");
  assert.equal(plus.getAttribute("title"), "Cheerleaders: maximum is 6.");
  assert.doesNotMatch(fragment.querySelector(".g-build").textContent + plus.getAttribute("title"), /\{/, "no placeholder is left in the page");
  const heard = [];
  wire({ ...noop, ...failing("onStaff"), onRefused: (reason) => heard.push(reason) });
  fireEvent(plus, "click");
  fireEvent(fragment.querySelector('[data-resource-key="bribes"] [data-resource-step="1"]'), "click");
  assert.deepEqual(heard, ["Cheerleaders: maximum is 6.", "Only for teams with Bribery and Corruption"]);
  assert.equal(fragment.querySelector('[data-resource-key="assistantCoaches"] [data-resource-step="1"]').hasAttribute("aria-disabled"), false);
});

test("the staff clicks, the switches and the other buttons reach the screen with what the build needs", () => {
  const fragment = mount(builderMarkup({ race: human, draft: filled() }));
  const heard = [];
  wire({
    ...noop,
    onHire: (row, delta) => heard.push(["hire", row, delta]),
    onStaff: (key, delta) => heard.push(["staff", key, delta]),
    onToggleStaff: (key, on) => heard.push(["toggle", key, on]),
    onRosterToggle: () => heard.push(["roster"]),
    onName: (id, value) => heard.push(["name", id, value]),
  });
  fireEvent(fragment.querySelector('[data-hire-key="0"] [data-hire-step="1"]'), "click");
  fireEvent(fragment.querySelector('[data-hire-key="0"] [data-hire-step="-1"]'), "click");
  fireEvent(fragment.querySelector(`[data-hire-key="${rowOf(human, "Thrower")}"] [data-hire-step="1"]`), "click");
  fireEvent(fragment.querySelector(`[data-hire-key="${ogre}"] [data-hire-step="-1"]`), "click");
  fireEvent(fragment.querySelector('[data-resource-key="cheerleaders"] [data-resource-step="1"]'), "click");
  fireEvent(fragment.querySelector('[data-resource-key="startingRerolls"] [data-resource-step="-1"]'), "click");
  fireEvent(fragment.querySelector('[data-toggle-key="apothecary"]'), "click");
  fireEvent(fragment.querySelector("[data-roster-toggle]"), "click");
  const nameField = Object.assign(fragment.querySelector("[data-player-name]"), { value: "Brandt" });
  fireEvent(nameField, "input");
  assert.deepEqual(heard, [
    ["hire", 0, 1],
    ["hire", 0, -1],
    ["hire", rowOf(human, "Thrower"), 1],
    ["staff", "cheerleaders", 1],
    ["staff", "startingRerolls", -1],
    ["toggle", "apothecary", true],
    ["roster"],
    ["name", nameField.getAttribute("data-player-name"), "Brandt"],
  ]);
  assert.equal(heard[0][1], 0);
  assert.equal(typeof heard[2][1], "number", "a row index, not the text of an attribute: a string index silently breaks the position count (T6)");
});

test("a logo is picked with a label that a keyboard reaches, shown as a picture, and taken away", () => {
  const empty = mount(builderMarkup({ race: human, draft: filled() }));
  const input = empty.querySelector("input#new-team-logo");
  assert.deepEqual([input.getAttribute("type"), input.getAttribute("accept")], ["file", "image/png,image/jpeg"]);
  assert.equal(empty.querySelector('label.g-btn[for="new-team-logo"]').textContent.trim(), "Upload");
  assert.match(empty.querySelector(".g-build__team").textContent, /PNG or JPG up to 2 MB · optional/);
  assert.equal(empty.querySelector(".g-build__team img"), null);
  assert.equal(empty.querySelector("[data-new-team-logo-remove]"), null);
  assert.equal(input.getAttribute("class").includes("g-sr-only"), true, "hidden to the eye, not to the keyboard");

  const scripted = filled();
  scripted.logoData = 'javascript:alert(1)" onerror="x';
  assert.equal(mount(builderMarkup({ race: human, draft: scripted })).querySelector(".g-build__team img"), null, "only a picture is shown as one");

  const withLogo = filled();
  withLogo.logoData = "data:image/png;base64,AAAA";
  const shown = mount(builderMarkup({ race: human, draft: withLogo }));
  assert.deepEqual([shown.querySelector(".g-build__team img").getAttribute("alt"), shown.querySelector(".g-build__team img").getAttribute("src")], ["", "data:image/png;base64,AAAA"]);
  assert.equal(shown.querySelector("[data-new-team-logo-remove]").textContent.trim(), "Remove logo");
  assertCspSafe(shown);

  const picked = [];
  wire({ ...noop, onLogo: (file) => picked.push(file), onLogoRemove: () => picked.push("removed") });
  const file = { name: "logo.png", size: 10 };
  fireEvent(Object.assign(shown.querySelector("input#new-team-logo"), { files: [file], value: "C:\\fakepath\\logo.png" }), "change");
  assert.deepEqual(picked, [file]);
  assert.equal(shown.querySelector("input#new-team-logo").value, "", "the same file can be picked again after it was taken away");
  fireEvent(Object.assign(shown.querySelector("input#new-team-logo"), { files: [] }), "change");
  fireEvent(shown.querySelector("[data-new-team-logo-remove]"), "click");
  assert.deepEqual(picked, [file, "removed"], "no file, nothing heard");
});

test("a refusal of the save is said above the button, and a name typed is text", () => {
  const fragment = mount(builderMarkup({ race: human, draft: newBuild(human, { name: HOSTILE }), refusal: "Breaks the rules." }));
  assert.equal(fragment.querySelector('.g-build__cta [role="alert"] .g-callout__title').textContent, "Breaks the rules.");
  assert.equal(fragment.querySelector("img"), null);
  assert.ok(fragment.querySelector(".g-build__cta .g-callout--danger .g-callout__icon"), "a fault leads with its sign");
  assert.equal(mount(builderMarkup({ race: human, draft: filled() })).querySelector('.g-build__cta [role="alert"]'), null);
  assertStyled(fragment, ...BUILDER_SHEETS, "button.css", "resource-counter.css", "toggle.css", "status-chip.css", "callout.css");
});

test("the rule's words for the four refusals the build gives are in both dictionaries, and fill every placeholder (K5c)", () => {
  const squad = newBuild(human, { name: "R" });
  hire(human, squad, "Ogre");
  while (squad.players.length < 14) hire(human, squad, "Human Lineman");
  const coaches = newBuild(human, { name: "R" });
  for (let index = 0; index < builderStaffMaximums.assistantCoaches; index += 1) stepStaff(human, coaches, "assistantCoaches", 1);
  const refusals = [
    hirePlayer(human, squad, ogre),
    hirePlayer(human, squad, rowOf(human, "Catcher")),
    stepStaff(human, coaches, "assistantCoaches", 1),
    stepStaff(human, coaches, "bribes", 1),
    stepStaff(undead, newBuild(undead, { name: "U" }), "apothecary", 1),
  ];
  assert.deepEqual(refusals.map((refusal) => refusal.code), ["POSITION_MAX", "ROSTER_MAX_PLAYERS", "STAFF_MAX", "STAFF_UNAVAILABLE", "STAFF_UNAVAILABLE"]);
  const said = {
    en: ["Ogre: maximum is 1.", "A team has at most 14 players (now 14).", "Assistant Coaches: maximum is 6.", "Bribes: not for this race.", "Apothecary: not for this race."],
    ru: ["Ogre: максимум 1.", "Игроков в команде — не больше 14 (сейчас 14).", "Assistant Coaches: максимум 6.", "Взятки: этой расе недоступно.", "Apothecary: этой расе недоступно."],
  };
  for (const locale of ["en", "ru"]) {
    initLocale(locale);
    try {
      assert.deepEqual(refusals.map(buildRefusalText), said[locale], locale);
    } finally {
      initLocale("en");
    }
  }
  for (const locale of ["en", "ru"]) {
    const dictionary = JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
    for (const code of refusals.map((refusal) => refusal.code)) assert.ok(dictionary[`validation.${code}`], `${locale} validation.${code}`);
  }
});

test("every staff the build sells has a name, every medic its own, and every stat a label in both dictionaries", () => {
  const dictionaries = {};
  for (const locale of ["en", "ru"]) dictionaries[locale] = JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
  for (const key of BUILD_STAFF_KEYS) {
    const text = buildRefusalText({ code: "STAFF_MAX", params: { key, max: 1 } });
    assert.match(text, /^[A-Z][A-Za-z ]+: maximum is 1\.$/, `${key}: "${text}"`);
    assert.notEqual(text.split(":")[0], key, `${key} is named, not shown as its key`);
  }
  for (const staff of medicalStaffDefinitions) assert.ok(buildRefusalText({ code: "STAFF_UNAVAILABLE", params: { key: staff.key } }).startsWith(`${staff.title}: `));
  for (const locale of ["en", "ru"]) for (const stat of PLAYER_STATS) assert.ok(dictionaries[locale][`stats.${stat}`], `${locale} stats.${stat}`);
});

test("the screen speaks Russian when the site does, and leaves no placeholder, no undefined and no key", () => {
  initLocale("ru");
  try {
    const fragment = mount(builderMarkup({ race: human, draft: filled(), rosterOpen: true }));
    assert.equal(fragment.querySelector("[data-new-team-save]").textContent.trim(), "Сохранить команду · 555k");
    assert.equal(fragment.querySelector(".g-build__head p").textContent, "Human · новая команда");
    assert.equal(fragment.querySelector(".g-build__head a.g-icon-btn").getAttribute("aria-label"), "Назад");
    assert.equal(fragment.querySelector(".g-build__head .g-status").textContent, "Набор");
    assert.match(fragment.querySelector("[data-roster-toggle]").textContent, /Свернуть/);
    assert.equal(fragment.querySelector('[data-hire-key="0"] .g-hire__limit').textContent, "5 из 16");
    assert.equal(fragment.querySelector('[data-hire-key="0"] .g-hire__skills').textContent, "без навыков");
    assert.equal(fragment.querySelector('[role="radiogroup"][data-captains]').getAttribute("aria-label"), "Капитан");
    assert.equal(accessibleName(fragment, fragment.querySelector("[data-captain]")), "Капитан Human Lineman 1 Human Lineman");
    assert.equal(fragment.querySelector('[data-resource-key="bribes"] .g-resource__note').textContent, "Только для команд с Bribery and Corruption");
    const text = fragment.querySelector(".g-build").textContent;
    assert.doesNotMatch(text, /[{}]|undefined|NaN|newTeam\.|validation\./);
    const over = mount(builderMarkup({ race: human, draft: overBudget() }));
    assert.equal(over.querySelector("[data-new-team-save]").textContent.trim(), "Перерасход 220k");
    const rich = filled();
    rich.startingRerolls = 30;
    const russian = (amount) => `${new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(amount)}k`;
    assert.equal(mount(builderMarkup({ race: human, draft: rich })).querySelector("[data-new-team-save]").textContent.trim(), `Перерасход ${russian(buildTotals(human, rich).over)}`);
    assert.match(over.querySelector(".g-build__cta").textContent, /Уберите игроков или персонал, чтобы уложиться в 600k\./);
    const ogreDraft = newBuild(human, { name: "R" });
    hirePlayer(human, ogreDraft, ogre);
    assert.equal(mount(builderMarkup({ race: human, draft: ogreDraft })).querySelector(`[data-hire-key="${ogre}"] [data-hire-step="1"]`).getAttribute("title"), "Ogre: максимум 1.");
  } finally {
    initLocale("en");
  }
});

test("the totals add up to the build's own numbers", () => {
  for (const draft of [newBuild(human, { name: "R" }), filled(), overBudget()]) {
    const totals = buildTotals(human, draft);
    const fragment = mount(builderMarkup({ race: human, draft }));
    const bar = fragment.querySelector('[role="progressbar"]');
    assert.equal(bar.getAttribute("aria-valuenow"), String(Math.min(totals.total, 600)), "a bar never reads past its end; the text says what was spent");
    assert.equal(bar.getAttribute("aria-valuetext"), `Spent ${totals.total}k`);
    assert.deepEqual(fragment.querySelectorAll(".g-build__totals dd").map((cell) => cell.textContent), [`${totals.playersCost}k`, `${totals.staffCost}k`, `${totals.total}k`]);
    assert.equal(fragment.querySelector(".g-build__left").textContent, `${Math.abs(totals.left)}k`);
  }
});

test("the desk's three sums are named in both languages (newTeam.totals.*)", () => {
  const labels = { en: ["Players", "Staff and re-rolls", "Total"], ru: ["Игроки", "Персонал и Re-rolls", "Всего"] };
  for (const locale of ["en", "ru"]) {
    initLocale(locale);
    try {
      assert.deepEqual(mount(builderMarkup({ race: human, draft: filled() })).querySelectorAll(".g-build__totals dt").map((cell) => cell.textContent), labels[locale]);
    } finally {
      initLocale("en");
    }
  }
});

test("a screen that is released stops hearing the buttons, and one wired without a handler is a mistake found at once", () => {
  const fragment = mount(builderMarkup({ race: human, draft: filled() }));
  const heard = [];
  const off = wire({ ...noop, onSave: () => heard.push("save") });
  fireEvent(fragment.querySelector("[data-new-team-save]"), "click");
  off();
  fireEvent(fragment.querySelector("[data-new-team-save]"), "click");
  assert.deepEqual(heard, ["save"]);
  const { onSave, ...missing } = noop;
  assert.throws(() => wireBuilder(document.body, missing), /onSave/);
});

test("the look: contrast on what each text sits on, no inline widths, and the breakpoints are 900 and 901", () => {
  const sheetText = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const css = sheetText(BUILDER_CSS);
  const roster = sheetText(ROSTER_CSS);
  // The limit at its maximum is a pill on the warning tint (K5b): no new token.
  assertReadable(BUILDER_CSS, ".g-hire__limit--max", "color", ["--warn-tint"], 4.5);
  assert.deepEqual(valuesOf(BUILDER_CSS, ".g-hire__limit--max", "background"), ["var(--warn-tint)"]);
  assert.doesNotMatch(css, /--warn-text/);
  assertReadable(BUILDER_CSS, ".g-hire__limit", "color", ["--surface", "--page"], 4.5);
  assertReadable(BUILDER_CSS, ".g-hire__price", "color", ["--surface", "--page"], 4.5);
  assertReadable(BUILDER_CSS, ".g-hire__stats", "color", ["--surface", "--page"], 4.5);
  assertReadable(BUILDER_CSS, ".g-hire__skills", "color", ["--surface", "--page"], 4.5);
  assertReadable(BUILDER_CSS, ".g-build__remains", "color", ["--surface"], 4.5);
  assertReadable(BUILDER_CSS, ".g-build__remains--over", "color", ["--surface"], 4.5);
  assertReadable(BUILDER_CSS, ".g-build__count--short", "color", ["--surface", "--page"], 4.5);
  assertReadable(BUILDER_CSS, ".g-build__label", "color", ["--surface", "--page"], 4.5);
  assertReadable(BUILDER_CSS, ".g-build__hint", "color", ["--surface", "--page"], 4.5);
  assertReadable(ROSTER_CSS, ".g-build__reroll-note", "color", ["--surface", "--page"], 4.5);
  assertReadable(ROSTER_CSS, ".g-roster-row__position", "color", ["--surface", "--page"], 4.5);
  assertReadable(BUILDER_CSS, ".g-build__h", "color", ["--surface", "--page"], 4.5);
  assertReadable(BUILDER_CSS, ".g-hire__name", "color", ["--surface", "--page"], 4.5);
  assertReadable(BUILDER_CSS, ".g-build__title", "color", ["--header"], 4.5);
  assertReadable(BUILDER_CSS, ".g-build__sub", "color", ["--header"], 4.5);
  assertReadable(BUILDER_CSS, ".g-build__head .g-btn", "color", ["--header"], 4.5);
  assertReadable(BUILDER_CSS, ".g-hire__avatar", "color", ["--pos-lineman", "--pos-big", "--pos-thrower", "--pos-catcher", "--pos-blitzer"], 4.5);
  assertReadable(ROSTER_CSS, ".g-roster-row__captain", "color", ["--surface", "--page"], 4.5);
  assertReadable(ROSTER_CSS, '.g-roster-row__captain[aria-checked="true"]', "color", ["--crest-gold"], 4.5);
  // The first band's two cards end on one line on a desk.
  assert.deepEqual(valuesOf(BUILDER_CSS, ".g-build__players", "align-self"), ["stretch"]);
  assert.deepEqual(valuesOf(BUILDER_CSS, ".g-build__team", "align-self"), ["stretch"]);
  for (const sheet of [css, roster]) assert.doesNotMatch(sheet, /\bstyle\s*=/);
  assert.ok([BUILDER_CSS, ROSTER_CSS].flatMap((file) => assertBreakpoints(file)).length >= 2, "only the stage's two breakpoints, both");
  // The save stands at the foot of a phone's screen and is an ordinary block on a desk.
  assert.match(roster, /@media \(max-width: 900px\)\s*\{[^@]*\.g-build__cta\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0/);
  assert.match(roster, /@media \(min-width: 901px\)\s*\{[^@]*\.g-build__cta\s*\{[^}]*position:\s*static/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) 360px/);
  assert.match(readFileSync(new URL(`../${BUILDER_CSS}`, import.meta.url), "utf8"), /focus order/i, "the desk's columns reorder the page; the sheet says so");
});

// Stage 13 (Task 1): builder.css ran to 705 lines. Cut where its own sections meet — the head, the budget, the sections, the
// team and the players in one, the numbers, names and captain, the staff and the save in the other — and the second
// imported right after the first, so the cascade is the one sheet's.
test("the builder's two sheets, each 600 lines at most, imported in order", () => {
  for (const file of BUILDER_SHEETS) {
    const lines = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("\n").length;
    assert.ok(lines <= 600, `${file}: ${lines} lines`);
  }
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /@import url\("screens\/teams\/builder\.css"\);\n@import url\("screens\/teams\/builder-roster\.css"\);\n/);
  const roster = readFileSync(new URL(`../${ROSTER_CSS}`, import.meta.url), "utf8");
  for (const section of ["Numbers, names and the captain", "The staff", "The save"]) assert.match(roster, new RegExp(`---- ${section} ----`), section);
  const builder = readFileSync(new URL(`../${BUILDER_CSS}`, import.meta.url), "utf8");
  for (const section of ["The head", "The budget", "Sections", "The team", "The players"]) assert.match(builder, new RegExp(`---- ${section} ----`), section);
  assert.doesNotMatch(builder, /\.g-roster-row|\.g-build__cta|\.g-build__roster-/, "what moved is in one sheet only");
});
