import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";

import { assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { assertReadable, tokensOf, valuesOf } from "./helpers/contrast.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { expandCollections } = await import("../src/data/reference.mjs");
const { invalidateGames } = await import("../src/data/games.mjs");
const { onMyTeamsChange, setMyTeams } = await import("../src/data/teams.mjs");
const { medicalStaffDefinitions } = await import("../src/domain/league-rules.mjs");
const { COUNTER_KEYS } = await import("../src/screens/team/manage/model.mjs");
const { renderTreasuryStrip, treasuryBlockMarkup, wireMoneyOpeners, wireStripRedraw } = await import("../src/screens/team/manage/strip.mjs");
const { ICON_NAMES } = await import("../src/ui/icons.mjs");

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const [en, ru] = ["en", "ru"].map((locale) => JSON.parse(read(`src/i18n/${locale}.json`)));
const RACES = expandCollections(JSON.parse(read("public/data.en.json"))).teams;
const CSS = "src/screens/team/manage/strip.css";
const TOKEN = "gata-league-auth-token";
const POST = "POST /api/teams/t1/treasury";
const SHEET_HOST = '[data-sheet-host="treasury-money"]';
const TEAM = {
  id: "t1", name: "Wardens", baseTeamSlug: "teams/human", logoData: null, revision: 3, stage: "active",
  roster: { treasury: 70, startingRerolls: 2, teamRerolls: 1, dedicatedFans: 3, assistantCoaches: 1, cheerleaders: 1, apothecary: 1, players: [] },
};
const ENTRY = { id: "l9", kind: "manual", delta: 20, balanceAfter: 90, reason: "sponsor", note: null, pairingId: null, createdAt: "2026-10-18T12:00:00Z" };
const LIVE = { id: "g1", home: { team: { id: "t1" } }, away: { team: { id: "r1" } }, preparationStatus: "in_progress", postMatchStatus: "draft" };

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const toasts = () => document.querySelectorAll("output").map((node) => ({ text: node.textContent, tone: node.className }));
const labels = (scope = document) => scope.querySelectorAll(".g-funds__k").map((node) => node.textContent);
const values = (scope = document) => scope.querySelectorAll(".g-funds__v").map((node) => node.textContent);

/** A coach signed in with the team given (Human `t1`, 70k, revision 3, unless said) and the games given; the toasts of the test before are gone. */
function coach({ team = TEAM, games = [] } = {}) {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  state.auth.currentUser = { id: "u1", login: "coach" };
  // The coach is on t1's page, which the router makes the active team: a write's toast names no team (final Minor 10).
  state.activeTeamId = "t1";
  state.data = { teams: RACES };
  state.myTeams = { items: [structuredClone(team)], loaded: true, loading: false, error: "" };
  state.games.items = games;
}

// What a screen holds while it is up: the strip in a container of its own, wired, taken away at the end of the test.
let root = null;
let unwire = () => {};
afterEach(() => {
  unwire();
  unwire = () => {};
  if (root?.parentNode) root.parentNode.removeChild(root);
  root = null;
  initLocale("en");
});

/** The desk team page's treasury card of t1 (70k), its «+ Add» and «− Take» shut when `live`: what opens the sheet. */
const block = (live = false) => treasuryBlockMarkup({ teamId: "t1", treasury: 70 }, live);

function stand(extra = block()) {
  root = el(document, "div");
  document.body.appendChild(root);
  root.innerHTML = renderTreasuryStrip({ team: state.myTeams.items[0] }) + extra;
  const offs = [wireMoneyOpeners(root), wireStripRedraw(root)];
  unwire = () => { for (const off of offs) off(); };
  return root;
}
const edit = () => root.querySelector("a.g-funds__edit");
const add = () => root.querySelector('.g-manage__treasury [data-treasury-sign="1"]');
const sheetHost = () => document.querySelector(SHEET_HOST);
const sheetDialog = () => document.querySelector(`${SHEET_HOST} dialog#treasury-money`);

test("the strip says the treasury and what the team holds, as on DeskRoster", () => {
  coach();
  const fragment = mount(renderTreasuryStrip({ team: state.myTeams.items[0] }));
  assert.deepEqual(labels(), ["Treasury", "Start RR", "Team RR", "Fans", "Coaches", "Cheer", "Bribes", "Apo"]);
  assert.deepEqual(values(), ["70k", "2", "1", "3", "1", "1", "0", "yes"]);
  const section = document.querySelector("section.g-funds");
  assert.equal(section.getAttribute("data-treasury-strip"), "t1");
  assert.equal(section.getAttribute("aria-label"), "Treasury and resources", "named for what it holds, not for the page its pencil leads to");
  const cells = section.querySelectorAll(".g-funds__cell");
  assert.match(cells[0].getAttribute("class"), /g-funds__cell--money/, "the treasury is the first cell, and the one set apart");
  assert.equal(section.querySelectorAll(".g-funds__cell--money").length, 1);
  // The pencil leads to the team page, «Team, treasury and resources», where all of it is changed (the owner, 2026-11-08).
  const link = document.querySelector("a.g-funds__edit");
  assert.equal(link.getAttribute("href"), "#/t/t1/team");
  assert.equal(link.getAttribute("aria-label"), "Team, treasury and resources");
  assert.equal(link.hasAttribute("data-treasury-money"), false, "it opens no sheet of its own");
  assert.equal(link.querySelector("path").getAttribute("d"), "M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z", "07a draws the same pencil");
  assert.ok(ICON_NAMES.includes("pencil") && !ICON_NAMES.includes("edit"));
  assertCspSafe(fragment);
  assertStyled(fragment, CSS);
  assertDictionaryCovers("src/screens/team/manage/strip.mjs");
});

test("Bribes are on the strip for every race (the owner, 2026-10-28); the medics are the race's own, yes or no", () => {
  const strips = (slug, roster) => {
    coach({ team: { ...TEAM, baseTeamSlug: slug, roster: { ...TEAM.roster, ...roster } } });
    mount(renderTreasuryStrip({ team: state.myTeams.items[0] }));
    return Object.fromEntries(labels().map((label, at) => [label, values()[at]]));
  };
  const goblin = strips("teams/goblin", { bribes: 2, apothecary: 0 });
  assert.deepEqual([goblin.Bribes, goblin.Apo], ["2", "no"]);
  assert.equal(strips("teams/human", { bribes: 4 }).Bribes, "4", "a race without Bribery and Corruption buys them at 100k");
  const undead = strips("teams/necromantic-horror", { apothecary: 1, mortuaryAssistant: 1 });
  assert.deepEqual([undead.Assistant, "Apo" in undead, "Doctor" in undead], ["yes", false, false]);
  assert.equal(strips("teams/nurgle", { plagueDoctor: 0 }).Doctor, "no");
  // The medic's own word, not the half of his name that reads as something else (the owner, 2026-11-11); English in both languages, as the strip's other short labels.
  for (const key of ["plagueDoctor", "mortuaryAssistant"]) assert.equal(en[`treasury.strip.${key}`], ru[`treasury.strip.${key}`], key);
  assert.deepEqual([en["treasury.strip.plagueDoctor"], en["treasury.strip.mortuaryAssistant"]], ["Doctor", "Assistant"]);
});

test("a team whose race has not come yet still has its treasury and counters, and nothing throws", () => {
  coach();
  state.data = null;
  mount(renderTreasuryStrip({ team: state.myTeams.items[0] }));
  assert.deepEqual(labels(), ["Treasury", "Start RR", "Team RR", "Fans", "Coaches", "Cheer"]);
  assert.deepEqual(values(), ["70k", "2", "1", "3", "1", "1"]);
});

test("the strip reads in Russian: the labels the prototype shortens are shortened, the staff's English names stay English", () => {
  coach({ team: { ...TEAM, baseTeamSlug: "teams/goblin" } });
  initLocale("ru");
  mount(renderTreasuryStrip({ team: state.myTeams.items[0] }));
  assert.deepEqual(labels(), ["Казна", "Старт рер", "Ком рер", "Фанаты", "Coaches", "Cheer", "Взятки", "Апот"]);
  assert.equal(values().at(-1), "есть");
  assert.equal(document.querySelector("section.g-funds").getAttribute("aria-label"), "Казна и ресурсы");
  assert.equal(document.querySelector("a.g-funds__edit").getAttribute("aria-label"), "Команда, казна и ресурсы");
  mount(renderTreasuryStrip({ team: { ...state.myTeams.items[0], roster: { ...TEAM.roster, apothecary: 0 } } }));
  assert.equal(values().at(-1), "нет");
});

test("every counter and medic has its label, and the strip's words, in both dictionaries", () => {
  const keys = [...COUNTER_KEYS, ...medicalStaffDefinitions.map((staff) => staff.key)];
  assert.ok(keys.length >= 9);
  for (const dictionary of [en, ru]) {
    for (const key of keys) assert.ok(dictionary[`treasury.strip.${key}`], key);
    for (const key of ["treasury.title", "treasury.strip.yes", "treasury.strip.no"]) assert.ok(dictionary[key], key);
    assert.equal(dictionary["treasury.strip.edit"], undefined, "the pencil is named for the page it leads to");
  }
  // Owner's review of PR 1: the strip says what the team page says, shortened («Взятки», not «Bribes»).
  assert.deepEqual(
    ["startingRerolls", "teamRerolls", "dedicatedFans", "bribes", "apothecary"].map((key) => ru[`treasury.strip.${key}`]),
    ["Старт рер", "Ком рер", "Фанаты", "Взятки", "Апот"],
  );
  for (const key of ["assistantCoaches", "cheerleaders", "mortuaryAssistant", "plagueDoctor"]) {
    assert.equal(ru[`treasury.strip.${key}`], en[`treasury.strip.${key}`], `${key} is the staff's own name in both languages`);
    assert.equal(ru[`savedRoster.${key}`], en[`savedRoster.${key}`], `${key}: the team page keeps it English too`);
  }
});

test("a team with no treasury written has 0k, and a team id is text, not markup", () => {
  coach({ team: { ...TEAM, id: `t"><img src=x>`, roster: { ...TEAM.roster, treasury: null } } });
  const fragment = mount(renderTreasuryStrip({ team: state.myTeams.items[0] }));
  assert.equal(values()[0], "0k");
  assert.equal(document.querySelector("img"), null);
  assert.equal(document.querySelector("section.g-funds").getAttribute("data-treasury-strip"), `t"><img src=x>`);
  assertCspSafe(fragment);
});

test("a team with no roster at all draws a strip of nothing, and does not throw", () => {
  coach({ team: { ...TEAM, roster: null } });
  mount(renderTreasuryStrip({ team: state.myTeams.items[0] }));
  assert.deepEqual(labels(), ["Treasury", "Start RR", "Team RR", "Fans", "Coaches", "Cheer", "Bribes", "Apo"]);
  assert.deepEqual(values(), ["0k", "0", "0", "0", "0", "0", "0", "no"]);
});

test("the desk's treasury card: the sum as a resources' row, one pencil beside it; the strip's pencil is no button of the sheet", () => {
  coach();
  const fragment = mount(block());
  const card = document.querySelector("section.g-manage__treasury");
  assert.equal(card.getAttribute("aria-labelledby"), "manage-treasury-title");
  assert.equal(card.querySelector("h2#manage-treasury-title").textContent, "Treasury");
  assert.equal(card.querySelector(".g-resource .g-manage__treasury-sum").textContent, "70k");
  const buttons = card.querySelectorAll("button");
  assert.deepEqual(buttons.map((button) => [button.getAttribute("class"), button.getAttribute("data-treasury-sign"), button.getAttribute("aria-label"), button.getAttribute("aria-haspopup")]),
    [["g-resource__btn", "1", "Add to or take from the treasury", "dialog"]]);
  assert.equal(buttons[0].hasAttribute("aria-disabled"), false);
  assert.equal(card.querySelector(".g-resource--locked"), null);
  assertCspSafe(fragment);
  mount(block(true));
  const shut = document.querySelector(".g-manage__treasury button");
  assert.deepEqual([shut.getAttribute("aria-disabled"), shut.getAttribute("title")], ["true", "After the match's post-match"], "shut during a match, and saying why");
  assert.ok(document.querySelector(".g-manage__treasury .g-resource--locked"), "the row quiet, as a locked resource's");
});

test("the pencil opens the sheet the phone's card opens, and leaving takes it away", () => {
  coach();
  stand(`${block()}<button type="button" id="take" data-treasury-money="t1" data-treasury-sign="-1">− Take</button>`);
  const off = unwire;
  assert.equal(sheetHost().querySelector("dialog"), null, "the host is mounted at wiring, empty; the dialog is drawn by the press");
  assert.equal(document.body.childNodes.at(-1), sheetHost(), "at the end of the body, as the sheet host puts it");
  const button = add();
  button.focus();
  fireEvent(button, "click");
  assert.ok(sheetDialog().matches(":modal"));
  assert.equal(sheetDialog().querySelector(".g-sheet__title").textContent, "Add to the treasury");
  assert.equal(sheetDialog().querySelector('[data-seg-value="in"]').getAttribute("aria-checked"), "true");
  assert.equal(sheetDialog().querySelector("#money-amount").value, "20");
  fireEvent(sheetDialog().querySelector("[data-sheet-close]"), "click");
  assert.equal(sheetDialog(), null);
  assert.equal(document.activeElement, button, "the focus goes back to the button");
  // The phone's «− Take» is another button of the same kind; its sign is its own.
  fireEvent(root.querySelector("#take"), "click");
  assert.equal(sheetDialog().querySelector(".g-sheet__title").textContent, "Take from the treasury");
  assert.equal(sheetDialog().querySelector('[data-seg-value="out"]').getAttribute("aria-checked"), "true");
  off();
  assert.equal(sheetHost(), null, "leaving takes the host, and the sheet in it, away");
});

test("after leaving the strip hears nothing: the teams change and it stays as it was, and a shut button says nothing", async () => {
  coach();
  stand(block(true));
  const link = edit();
  unwire();
  setMyTeams([{ ...state.myTeams.items[0], roster: { ...TEAM.roster, treasury: 30 } }]);
  assert.equal(root.querySelector(".g-funds__cell--money .g-funds__v").textContent, "70k", "a strip that was still listening would read 30k");
  assert.equal(edit(), link);
  // A press on a shut button is answered by a toast while the strip listens; not after it has left.
  await withoutTimers(async () => {
    fireEvent(add(), "click");
  });
  assert.deepEqual(toasts(), []);
  assert.equal(sheetHost(), null);
});

test("the openers wired twice on one root have one host and open one dialog; the first release leaves them working, the last takes everything away", () => {
  coach();
  stand();
  const first = wireMoneyOpeners(root);
  const second = wireMoneyOpeners(root);
  assert.equal(document.querySelectorAll(SHEET_HOST).length, 1, "the second wiring mounts nothing");
  fireEvent(add(), "click");
  assert.equal(document.querySelectorAll("dialog#treasury-money").length, 1, "one press, one sheet");
  first();
  first();
  assert.equal(document.querySelectorAll(SHEET_HOST).length, 1, "a release is spent once: the other holder keeps the wiring");
  fireEvent(sheetDialog().querySelector("[data-sheet-close]"), "click");
  fireEvent(add(), "click");
  assert.ok(sheetDialog().matches(":modal"), "and the wiring still answers a press");
  second();
  unwire();
  assert.equal(sheetHost(), null, "the last release takes the host and the sheet away");
  unwire = wireMoneyOpeners(root);
  assert.equal(document.querySelectorAll(SHEET_HOST).length, 1, "a root left can be wired again, afresh");
});

test("an entry made from the strip shows on the strip without the screen drawing it again, and the write is announced with the new revision", async () => {
  coach();
  stand();
  const section = root.querySelector("[data-treasury-strip]");
  const heard = [];
  const stop = onMyTeamsChange(() => heard.push(state.myTeams.items[0].revision));
  try {
    fireEvent(add(), "click");
    fireEvent(sheetDialog().querySelector('[data-money-reason="sponsor"]'), "click");
    api.reply(POST, 201, { team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90 } }, entry: ENTRY });
    await withoutTimers(async () => {
      fireEvent(sheetDialog().querySelector("[data-money-apply]"), "click");
      await settle();
    });
  } finally {
    stop();
  }
  assert.equal(root.querySelector(".g-funds__cell--money .g-funds__v").textContent, "90k");
  assert.deepEqual(values(root), ["90k", "2", "1", "3", "1", "1", "0", "yes"], "only the treasury moved");
  assert.equal(root.querySelector("[data-treasury-strip]"), section, "patched in place: the screen around it is not drawn again");
  assert.ok(heard.includes(4), "onMyTeamsChange is the announcement, and the list holds the revision a listener reads");
  assert.equal(state.myTeams.items[0].revision, 4);
  assert.deepEqual(api.calls.find((call) => call.key === POST).body.revision, 3);
  assert.equal(sheetDialog(), null);
});

test("a strip patched keeps the focus on its pencil, though the cells around it come and go", () => {
  coach({ team: { ...TEAM, baseTeamSlug: "teams/goblin" } });
  stand();
  assert.equal(labels(root).includes("Apo"), true);
  const link = edit();
  link.focus();
  // The race the list names changes: a cell goes, and the pencil, which is last, must be the same node still.
  setMyTeams([{ ...state.myTeams.items[0], baseTeamSlug: "teams/necromantic-horror" }]);
  assert.equal(labels(root).includes("Apo"), false);
  assert.equal(edit(), link);
  assert.equal(document.activeElement, link);
});

test("a team gone from the list leaves its strip as it was, and a strip of another team is not touched", () => {
  coach();
  stand(renderTreasuryStrip({ team: { ...TEAM, id: "t2", roster: { ...TEAM.roster, treasury: 5 } } }));
  const [first, second] = root.querySelectorAll("[data-treasury-strip]");
  setMyTeams([{ ...state.myTeams.items[0], roster: { ...TEAM.roster, treasury: 30 } }]);
  assert.equal(first.querySelector(".g-funds__cell--money .g-funds__v").textContent, "30k");
  assert.equal(second.querySelector(".g-funds__cell--money .g-funds__v").textContent, "5k", "t2 is not on the list: its strip stays");
});

test("a shut button that carries no reason of its own (the phone's treasury card) says the one the strip knows", async () => {
  coach();
  stand(`<button type="button" id="card" data-treasury-money="t1" data-treasury-sign="1" aria-disabled="true">Treasury</button>`);
  await withoutTimers(async () => {
    fireEvent(root.querySelector("#card"), "click");
  });
  assert.deepEqual(toasts().map((toast) => toast.text), ["After the match's post-match"]);
  assert.match(toasts()[0].tone, /g-toast--error/);
  assert.equal(document.querySelector("dialog"), null);
});

test("a live match: a shut «+ Add» is refused with its reason, no sheet opens; the pencil still leads to the team page", async () => {
  coach({ games: [LIVE] });
  stand(block(true));
  assert.equal(edit().getAttribute("href"), "#/t/t1/team", "the team page says what the match closes there");
  assert.equal(edit().hasAttribute("aria-disabled"), false);
  const button = add();
  assert.equal(button.getAttribute("aria-disabled"), "true");
  assert.equal(button.getAttribute("title"), "After the match's post-match");
  await withoutTimers(async () => {
    fireEvent(button, "click");
  });
  assert.equal(sheetDialog(), null);
  assert.equal(document.querySelector("dialog"), null);
  assert.deepEqual(toasts().map((toast) => toast.text), ["After the match's post-match"]);
  assert.match(toasts()[0].tone, /g-toast--error/);
  assert.equal(api.calls.length, 0);
});

test("the strip is the same whether a match is on or not, and a match that goes live does not touch it", async () => {
  coach();
  const team = state.myTeams.items[0];
  const quiet = renderTreasuryStrip({ team });
  state.games.items = [LIVE];
  assert.equal(renderTreasuryStrip({ team }), quiet, "it reads no games");
  state.games.items = [];
  stand();
  const link = edit();
  api.reply("GET /api/games", 200, { games: [LIVE] });
  await invalidateGames();
  assert.equal(edit(), link);
  assert.equal(link.getAttribute("href"), "#/t/t1/team");
});

test("from 901px only, and the cells wrap rather than clip", () => {
  assert.ok(valuesOf(CSS, ".g-funds", "display").includes("none"), "hidden up to 900px: the phone has the treasury card");
  assert.ok(valuesOf(CSS, ".g-funds", "display").includes("flex"));
  assert.match(read(CSS), /@media \(max-width: 900px\)\s*\{\s*\.g-funds\s*\{\s*display: none;/);
  assert.deepEqual(valuesOf(CSS, ".g-funds", "flex-wrap"), ["wrap"]);
  assert.deepEqual(valuesOf(CSS, ".g-funds__cell", "flex"), ["1 1 auto"]);
  assertReadable(CSS, ".g-funds__cell--money .g-funds__v", "color", ["--accent-tint"], 4.5);
  assertReadable(CSS, ".g-funds__cell--money .g-funds__k", "color", ["--accent-tint"], 4.5);
  assertReadable(CSS, ".g-funds__k", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-funds__v", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-funds__edit", "color", ["--surface", "--surface-2"], 4.5);
  assert.doesNotMatch(read(CSS), /aria-disabled/, "the pencil is a link, never shut");
  assert.deepEqual(valuesOf(CSS, ".g-funds__k", "font"), ["600 11px/1.2 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-funds__v", "font"), ["700 20px/1.1 var(--font-display)"]);
  assert.deepEqual(valuesOf(CSS, ".g-funds__edit", "min-height"), ["var(--size-touch)"]);
  // The button is 44px wide, and the strip leaves exactly that much room at its right edge for it.
  assert.deepEqual(valuesOf(CSS, ".g-funds__edit", "width"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(CSS, ".g-funds", "padding"), ["0 var(--size-touch) 0 0"]);
  assert.equal(tokensOf("grass")["--size-touch"], "44px");
  assert.deepEqual(valuesOf(CSS, ".g-funds__edit:focus-visible", "outline-offset"), ["-3px"], "the strip clips what lies outside it: the ring of the button at its edge is drawn inside");
});
