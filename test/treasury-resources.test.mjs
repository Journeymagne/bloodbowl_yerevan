import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";

import { assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { expandCollections } = await import("../src/data/reference.mjs");
const { raceTeamOf } = await import("../src/data/teams.mjs");
const { medicalStaffDefinitions } = await import("../src/domain/league-rules.mjs");
const { COUNTER_KEYS, resourceRows } = await import("../src/screens/team/manage/model.mjs");
const { resourceWords, resourcesMarkup, wireResources } = await import("../src/screens/team/manage/resources.mjs");
const { renderResourceCounter } = await import("../src/ui/resource-counter.mjs");
const { renderToggle } = await import("../src/ui/toggle.mjs");

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const [en, ru] = ["en", "ru"].map((locale) => JSON.parse(read(`src/i18n/${locale}.json`)));
const RACES = expandCollections(JSON.parse(read("public/data.en.json"))).teams;
const CSS = "src/screens/team/manage/manage.css";
const TOKEN = "gata-league-auth-token";
const PATCH = "PATCH /api/teams/t1";
const FIRST_PAGE = "GET /api/teams/t1/ledger?limit=20";
const TEAM = {
  id: "t1", name: "Wardens", baseTeamSlug: "teams/human", logoData: null, revision: 3, stage: "active",
  roster: { treasury: 100, startingRerolls: 2, teamRerolls: 1, dedicatedFans: 3, assistantCoaches: 1, cheerleaders: 1, apothecary: 0, players: [] },
};
const LIVE = { id: "g1", home: { team: { id: "t1" } }, away: { team: { id: "r1" } }, preparationStatus: "in_progress", postMatchStatus: "draft" };
const STAGE_LOCKED = { error: { code: "STAGE_PURCHASE_LOCKED", params: { key: "startingRerolls", stage: "active" }, message: "x" } };

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const toasts = () => document.querySelectorAll("output").map((node) => ({ text: node.textContent, tone: node.className }));
const patches = () => api.calls.filter((call) => call.key === PATCH);

/** A coach signed in with the team given (Human `t1`, active, 100k, revision 3, unless said) and the games given; the toasts of the test before are gone. */
function coach({ team = TEAM, roster = {}, games = [] } = {}) {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  state.auth.currentUser = { id: "u1", login: "coach" };
  // The coach is on t1's page, which the router makes the active team: a write's toast names no team (final Minor 10).
  state.activeTeamId = "t1";
  state.data = { teams: RACES };
  state.myTeams = { items: [{ ...structuredClone(team), roster: { ...structuredClone(team.roster), ...roster } }], loaded: true, loading: false, error: "" };
  state.games.items = games;
  api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
}

/** The team as the list holds it, after a save that brought `roster` and the next revision. */
const saved = (roster, extra = {}) => ({ team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, ...roster }, ...extra } });
const rowsOf = ({ locked = false } = {}) => {
  const team = state.myTeams.items[0];
  return resourceRows({ race: raceTeamOf(team.baseTeamSlug), roster: team.roster, stage: team.stage, locked });
};

// What a screen holds while it is up: the section on the page, wired, taken away at the end of the test.
let unwire = () => {};
afterEach(() => {
  unwire();
  unwire = () => {};
  initLocale("en");
});

function draw({ locked = false, busy = false } = {}) {
  unwire();
  const fragment = mount(resourcesMarkup({ rows: rowsOf({ locked }), busy }));
  unwire = wireResources(document.body, "t1");
  return fragment;
}
const counter = (key) => document.querySelector(`[data-resource-key="${key}"]`);
const plus = (key) => counter(key).querySelector('[data-resource-step="1"]');
const minus = (key) => counter(key).querySelector('[data-resource-step="-1"]');
const toggle = (key) => document.querySelector(`.g-toggle[data-toggle-key="${key}"]`);
const click = (node) => fireEvent(node, "click");

test("an active team's resources: Starting rerolls closed with the stage's words, Team Rerolls short of money, fans after matches, bribes for their teams only, the apothecary a switch", () => {
  coach();
  const fragment = draw();
  const section = document.querySelector("section.g-manage__resources");
  assert.equal(section.getAttribute("aria-labelledby"), "manage-resources-title");
  assert.equal(section.hasAttribute("aria-busy"), false);
  assert.equal(document.querySelector("h2#manage-resources-title").textContent, "Resources");
  assert.equal(section.querySelector(".g-manage__resources-sub").textContent, "A purchase is paid from the treasury");
  assert.equal(section.querySelector("p.g-manage__note").textContent, en["treasury.resources.note"]);
  assert.deepEqual(section.querySelectorAll("[data-resource-key]").map((node) => node.getAttribute("data-resource-key")), COUNTER_KEYS);

  assert.equal(document.querySelector('[data-resource-key="startingRerolls"].g-resource--locked .g-resource__note').textContent, "Starting rerolls are bought only while the team is being built");
  assert.equal(document.querySelector('[data-resource-key="teamRerolls"] .g-resource__note--danger').textContent, "Not enough in the treasury\u00a0·\u00a0120k");
  assert.equal(plus("teamRerolls").getAttribute("aria-disabled"), "true");
  assert.equal(plus("teamRerolls").getAttribute("title"), "Not enough in the treasury\u00a0·\u00a0120k");
  assert.equal(counter("teamRerolls").classList.contains("g-resource--locked"), false, "a shortage is not a lock");
  assert.equal(minus("teamRerolls").hasAttribute("disabled"), false);
  assert.equal(document.querySelector('[data-resource-key="dedicatedFans"].g-resource--locked .g-resource__note').textContent, "Change only after matches");
  assert.equal(document.querySelector('[data-resource-key="bribes"].g-resource--locked .g-resource__note').textContent, en["newTeam.bribesLocked"]);
  // The rest are open, with their price.
  assert.equal(counter("cheerleaders").querySelector(".g-resource__note").textContent, "10k each");
  assert.equal(plus("cheerleaders").hasAttribute("aria-disabled"), false);
  assert.equal(counter("cheerleaders").querySelector(".g-resource__value").textContent, "1");

  assert.equal(toggle("apothecary").getAttribute("aria-checked"), "false");
  assert.equal(toggle("apothecary").querySelector(".g-toggle__label").textContent, "Apothecary");
  assert.equal(toggle("apothecary").querySelector(".g-toggle__caption").textContent, "no · buy for 50k");
  assert.equal(toggle("apothecary").hasAttribute("disabled"), false);

  assertCspSafe(fragment);
  assertStyled(fragment, CSS, "resource-counter.css", "toggle.css");
  assertDictionaryCovers("src/screens/team/manage/resources.mjs");
});

test("every word a row can say is in both dictionaries, the ones built from a key too", () => {
  for (const key of COUNTER_KEYS) assert.ok(en[`savedRoster.${key}`] && ru[`savedRoster.${key}`], `savedRoster.${key}`);
  for (const key of ["startingRerolls", "teamRerolls", "dedicatedFans"]) assert.ok(en[`treasury.lock.${key}`] && ru[`treasury.lock.${key}`], `treasury.lock.${key}`);
  for (const key of ["startingRerolls", "teamRerolls"]) assert.ok(en[`treasury.note.${key}`] && ru[`treasury.note.${key}`], `treasury.note.${key}`);
  for (const name of Object.keys(en).filter((key) => key.startsWith("treasury."))) assert.ok(ru[name], `ru ${name}`);
  assert.ok(medicalStaffDefinitions.every(({ title }) => title), "a medic is named by its definition, which both dictionaries leave in English");
});

test("a step saves the roster the 2.x editor would, once", async () => {
  coach();
  draw();
  api.reply(PATCH, 200, saved({ cheerleaders: 2, treasury: 90, purchasedStaff: { cheerleaders: 1 } }));
  click(plus("cheerleaders"));
  await settle();
  assert.equal(patches().length, 1);
  const { body } = patches()[0];
  assert.equal(body.revision, 3);
  assert.equal(body.roster.cheerleaders, 2);
  assert.equal(body.roster.treasury, 90);
  assert.equal(body.roster.purchasedStaff.cheerleaders, 1);
  assert.equal(body.roster.dedicatedFans, 3, "what the step did not touch goes as it was");
  assert.equal(state.myTeams.items[0].roster.cheerleaders, 2, "the answer replaced the team");
  assert.deepEqual(toasts(), []);
});

test("taking back what was bought pays it back; what was not bought is not paid for", async () => {
  coach({ roster: { cheerleaders: 3, purchasedStaff: { cheerleaders: 1 }, assistantCoaches: 2 } });
  draw();
  api.reply(PATCH, 200, saved({ cheerleaders: 2, treasury: 110 }));
  click(minus("cheerleaders"));
  await settle();
  assert.deepEqual([patches()[0].body.roster.cheerleaders, patches()[0].body.roster.treasury, patches()[0].body.roster.purchasedStaff.cheerleaders], [2, 110, 0]);
});

test("a step is the whole count's: «−» of a count that is zero is plainly off", () => {
  coach({ roster: { cheerleaders: 0 } });
  draw();
  assert.equal(minus("cheerleaders").hasAttribute("disabled"), true);
  click(minus("cheerleaders"));
  assert.equal(api.calls.length, 0);
});

test("a refused step is heard, not sent", async () => {
  coach();
  draw();
  await withoutTimers(async () => {
    click(plus("startingRerolls"));
    await settle();
  });
  const [heard] = toasts();
  assert.equal(heard.text, "Starting rerolls are bought only while the team is being built");
  assert.match(heard.tone, /toast-error/);
  assert.equal(api.calls.length, 0);
});

test("a stage lock lets a purchase on record be taken back: the row is open to «−», and says why «+» is not", async () => {
  coach({ roster: { startingRerolls: 2, purchasedStaff: { startingRerolls: 1 } } });
  draw();
  const row = counter("startingRerolls");
  assert.equal(row.classList.contains("g-resource--locked"), false, "the row is not shut whole");
  assert.equal(minus("startingRerolls").hasAttribute("aria-disabled"), false);
  assert.equal(minus("startingRerolls").hasAttribute("disabled"), false);
  assert.equal(plus("startingRerolls").getAttribute("title"), en["treasury.lock.startingRerolls"]);
  assert.equal(row.querySelector(".g-resource__note").textContent, "60k · only while building");
  api.reply(PATCH, 200, saved({ startingRerolls: 1, treasury: 160, purchasedStaff: { startingRerolls: 0 } }));
  click(minus("startingRerolls"));
  await settle();
  assert.deepEqual([patches()[0].body.roster.startingRerolls, patches()[0].body.roster.treasury], [1, 160]);
  await withoutTimers(async () => {
    click(plus("startingRerolls"));
    await settle();
  });
  assert.equal(toasts()[0].text, en["treasury.lock.startingRerolls"]);
  assert.equal(patches().length, 1);
});

test("Starting and Team rerolls share eight: at the line the plus says so, naming both", async () => {
  coach({ roster: { startingRerolls: 3, teamRerolls: 5 } });
  draw();
  const title = "Starting rerolls + Team Rerolls: maximum is 8.";
  assert.equal(plus("teamRerolls").getAttribute("title"), title);
  assert.equal(counter("teamRerolls").querySelector(".g-resource__note--danger"), null, "a maximum is not a shortage");
  assert.equal(counter("teamRerolls").querySelector(".g-resource__note").textContent, "120k · bought in the season");
  assert.equal(counter("teamRerolls").querySelector(".g-resource__value").textContent, "5");
  await withoutTimers(async () => {
    click(plus("teamRerolls"));
    await settle();
  });
  assert.equal(toasts()[0].text, title);
  assert.equal(api.calls.length, 0);
  // Cheerleaders have a maximum of their own.
  coach({ roster: { cheerleaders: 6 } });
  draw();
  assert.equal(plus("cheerleaders").getAttribute("title"), "Cheerleaders: maximum is 6.");
});

test("a team still being built: Starting rerolls open, Team Rerolls closed by the stage", () => {
  coach({ team: { ...TEAM, stage: "draft" }, roster: { teamRerolls: 0 } });
  draw();
  assert.equal(counter("startingRerolls").classList.contains("g-resource--locked"), false);
  assert.equal(counter("startingRerolls").querySelector(".g-resource__note").textContent, "60k · only while building");
  assert.equal(document.querySelector('[data-resource-key="teamRerolls"].g-resource--locked .g-resource__note').textContent, "Team Rerolls open once the team leaves the build");
  // A Team Reroll the team already holds counts as bought (the model's reading of a team saved before purchases were recorded): «−» works.
  coach({ team: { ...TEAM, stage: "draft" } });
  draw();
  assert.equal(counter("teamRerolls").classList.contains("g-resource--locked"), false);
  assert.equal(minus("teamRerolls").hasAttribute("aria-disabled"), false);
  assert.equal(plus("teamRerolls").getAttribute("title"), en["treasury.lock.teamRerolls"]);
});

test("a match on closes every counter and the switch, with the one reason; and a match that went live after the page was drawn is heard at the press", async () => {
  coach({ games: [LIVE] });
  draw({ locked: true });
  for (const key of COUNTER_KEYS.filter((name) => name !== "bribes")) {
    assert.equal(counter(key).querySelector(".g-resource__note").textContent, "After the match's post-match", key);
    assert.ok(counter(key).classList.contains("g-resource--locked"), key);
  }
  assert.equal(toggle("apothecary").hasAttribute("disabled"), true);
  assert.equal(toggle("apothecary").querySelector(".g-toggle__caption").textContent, "After the match's post-match");

  coach();
  draw();
  state.games.items = [LIVE];
  await withoutTimers(async () => {
    click(plus("cheerleaders"));
    await settle();
  });
  assert.equal(toasts()[0].text, "After the match's post-match");
  assert.equal(api.calls.length, 0);
});

test("the apothecary is bought and given back as a switch", async () => {
  coach();
  draw();
  // Bought: the switch moves at once, the roster goes out with the apothecary and 50k less.
  api.reply(PATCH, 422, STAGE_LOCKED);
  const gate = api.hold(PATCH);
  click(toggle("apothecary"));
  assert.equal(toggle("apothecary").getAttribute("aria-checked"), "true", "the switch does not wait for the answer");
  assert.equal(patches().length, 1);
  assert.deepEqual([patches()[0].body.roster.apothecary, patches()[0].body.roster.treasury], [1, 50]);
  // Refused: it goes back to what the team has.
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.equal(toggle("apothecary").getAttribute("aria-checked"), "false");
  assert.equal(toasts()[0].text, en["error.STAGE_PURCHASE_LOCKED"]);

  // Bought for real, then given back.
  api.reply(PATCH, 200, saved({ apothecary: 1, treasury: 50, purchasedStaff: { apothecary: 1 } }));
  click(toggle("apothecary"));
  await settle();
  assert.equal(toggle("apothecary").getAttribute("aria-checked"), "true");
  assert.equal(state.myTeams.items[0].roster.apothecary, 1);
  draw();
  assert.equal(toggle("apothecary").getAttribute("aria-checked"), "true");
  assert.equal(toggle("apothecary").querySelector(".g-toggle__caption").textContent, "yes · 50k");
  api.reply(PATCH, 200, saved({ apothecary: 0, treasury: 100, purchasedStaff: { apothecary: 0 }, }, { revision: 5 }));
  click(toggle("apothecary"));
  await settle();
  const back = patches().at(-1);
  assert.equal(patches().length, 3);
  assert.deepEqual([back.body.roster.apothecary, back.body.roster.treasury, back.body.roster.purchasedStaff.apothecary, back.body.revision], [0, 100, 0, 4]);
});

test("a switch that cannot be afforded is off and says why, a refused save puts it back, a team changed elsewhere shows what the team now has", async () => {
  coach({ roster: { treasury: 40 } });
  draw();
  assert.equal(toggle("apothecary").hasAttribute("disabled"), true);
  assert.equal(toggle("apothecary").querySelector(".g-toggle__caption").textContent, "Not enough in the treasury\u00a0·\u00a050k");

  // The treasury allows it on the page, but another tab has bought the apothecary meanwhile.
  coach();
  draw();
  api.reply(PATCH, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, apothecary: 1, treasury: 50 } } });
  await withoutTimers(async () => {
    click(toggle("apothecary"));
    await settle();
  });
  assert.equal(toasts()[0].text, en["treasury.changedElsewhere"]);
  assert.equal(toggle("apothecary").getAttribute("aria-checked"), "true", "the team has it now: the switch says what the team has, not what it was before the press");
});

// Stage 12 (the hand-off of 08, its final review's T1): the stage's refusal may mean the stage the list holds is old — an
// admin moved the team into the season — so the list is read again (src/data/treasury.mjs `refusal`); any other refusal
// is an answer, with nothing to find out.
test("a refusal of the save is said; the stage's reads the coach's list again, any other reads nothing", async () => {
  coach();
  draw();
  api.reply(PATCH, 422, STAGE_LOCKED);
  api.reply("GET /api/teams", 200, { teams: [TEAM] });
  await withoutTimers(async () => {
    click(plus("cheerleaders"));
    await settle();
    await settle();
  });
  const [said] = toasts();
  assert.equal(said.text, en["error.STAGE_PURCHASE_LOCKED"]);
  assert.match(said.tone, /toast-error/);
  assert.equal(state.myTeams.items[0].roster.cheerleaders, 1, "nothing changed");
  assert.equal(api.calls.filter((call) => call.key === "GET /api/teams").length, 1, "the stage the list held may be old: read once more");

  coach();
  draw();
  api.reply(PATCH, 422, { error: { code: "TEAM_NAME_REQUIRED", params: {}, message: "x" } });
  await withoutTimers(async () => {
    click(plus("cheerleaders"));
    await settle();
  });
  assert.match(toasts()[0].tone, /toast-error/);
  assert.equal(api.calls.some((call) => call.key === "GET /api/teams"), false, "a refusal is an answer: nothing to find out");
});

test("a lost answer to a step is said in its own words: the change may have been saved, look at the counters", async () => {
  coach();
  draw();
  api.fail(PATCH);
  await withoutTimers(async () => {
    click(plus("cheerleaders"));
    await settle();
  });
  assert.equal(toasts()[0].text, en["treasury.resources.mayHaveSaved"]);
  assert.match(en["treasury.resources.mayHaveSaved"], /counters/);
  assert.match(ru["treasury.resources.mayHaveSaved"], /счётчик/);
});

test("a lost answer reads the coach's list again, so the counters show what the server holds", async () => {
  coach();
  draw();
  api.fail(PATCH);
  // The server wrote the step and only its answer was lost.
  api.reply("GET /api/teams", 200, { teams: [{ ...TEAM, revision: 4, roster: { ...TEAM.roster, cheerleaders: 2, treasury: 90 } }] });
  await withoutTimers(async () => {
    click(plus("cheerleaders"));
    await settle();
    await settle();
  });
  assert.equal(toasts()[0].text, en["treasury.resources.mayHaveSaved"]);
  assert.equal(api.calls.filter((call) => call.key === "GET /api/teams").length, 1);
  assert.deepEqual([state.myTeams.items[0].roster.cheerleaders, state.myTeams.items[0].roster.treasury, state.myTeams.items[0].revision], [2, 90, 4]);
});

test("a second press while the first save is on its way is told, and sends nothing", async () => {
  coach();
  draw();
  api.reply(PATCH, 200, saved({ cheerleaders: 2, treasury: 90 }));
  const gate = api.hold(PATCH);
  await withoutTimers(async () => {
    click(plus("cheerleaders"));
    click(plus("cheerleaders"));
    click(toggle("apothecary"));
    assert.equal(patches().length, 1);
    await settle();
    assert.equal(toasts()[0].text, en["treasury.writing"]);
    assert.equal(toggle("apothecary").getAttribute("aria-checked"), "false", "a switch pressed in vain goes back");
    gate.release();
    await settle();
  });
  assert.equal(patches().length, 1);
});

test("a switch pressed twice while its first save is on its way stays on until the answer comes", async () => {
  coach();
  draw();
  api.reply(PATCH, 200, saved({ apothecary: 1, treasury: 50, purchasedStaff: { apothecary: 1 } }));
  const gate = api.hold(PATCH);
  await withoutTimers(async () => {
    click(toggle("apothecary"));
    click(toggle("apothecary"));
    await settle();
    assert.equal(toggle("apothecary").getAttribute("aria-checked"), "true", "the second press is not a way back: the first save is still on its way");
    assert.equal(toasts()[0].text, en["treasury.writing"]);
    assert.equal(patches().length, 1);
    gate.release();
    await settle();
  });
  assert.equal(toggle("apothecary").getAttribute("aria-checked"), "true");
  assert.equal(state.myTeams.items[0].roster.apothecary, 1);
  assert.equal(patches().length, 1);
});

test("a switch that is on and shut by a match stays on, and says why", () => {
  coach({ games: [LIVE], roster: { apothecary: 1 } });
  draw({ locked: true });
  assert.equal(toggle("apothecary").getAttribute("aria-checked"), "true");
  assert.equal(toggle("apothecary").hasAttribute("disabled"), true);
  assert.equal(toggle("apothecary").querySelector(".g-toggle__caption").textContent, "After the match's post-match", "the lock's reason, not «yes · 50k»: the track shows the state");
  click(toggle("apothecary"));
  assert.equal(toggle("apothecary").getAttribute("aria-checked"), "true");
  assert.equal(api.calls.length, 0);
});

test("a press the page did not draw for the team is not judged: a stray switch is left alone, and a failing step is said, not lost", async () => {
  coach();
  unwire();
  mount(resourcesMarkup({ rows: rowsOf() })
    + renderToggle({ key: "mortuaryAssistant", label: "Mortuary Assistant" })
    + renderResourceCounter({ key: "plagueDoctor", name: "Plague Doctor", value: 1 }));
  unwire = wireResources(document.body, "t1");
  await withoutTimers(async () => {
    click(document.querySelector('.g-toggle[data-toggle-key="mortuaryAssistant"]'));
    await settle();
    assert.deepEqual(toasts(), [], "a medic the Human race cannot have is not a row of the team: nothing to step, nothing to say");
    click(document.querySelector('[data-resource-key="plagueDoctor"] [data-resource-step="1"]'));
    await settle();
  });
  // The step of a counter that is no row throws; the press says so instead of leaving an unhandled rejection to fail the run.
  assert.equal(toasts().length, 1);
  assert.match(toasts()[0].tone, /toast-error/);
  assert.equal(api.calls.length, 0);
});

test("a step is the team's own: one that has left the list is not written", async () => {
  coach();
  draw();
  state.myTeams = { ...state.myTeams, items: [] };
  await withoutTimers(async () => {
    click(plus("cheerleaders"));
    await settle();
  });
  assert.equal(toasts()[0].text, en["error.TEAM_NOT_FOUND"]);
  assert.equal(api.calls.length, 0);
});

test("a busy section says so to a screen reader, and the wiring stops when it is released", () => {
  coach();
  draw({ busy: true });
  assert.equal(document.querySelector("section.g-manage__resources").getAttribute("aria-busy"), "true");
  unwire();
  unwire = () => {};
  click(plus("cheerleaders"));
  assert.equal(api.calls.length, 0);
});

test("the words of a row, by what closes it", () => {
  coach();
  const words = Object.fromEntries(rowsOf().map((row) => [row.key, resourceWords(row)]));
  assert.deepEqual(words.startingRerolls, { name: "Starting rerolls", note: "60k · only while building", noteTone: "", lockedReason: en["treasury.lock.startingRerolls"], incBlockedReason: en["treasury.lock.startingRerolls"], caption: "" });
  assert.deepEqual(words.teamRerolls, { name: "Team Rerolls", note: "Not enough in the treasury\u00a0·\u00a0120k", noteTone: "danger", lockedReason: "", incBlockedReason: "Not enough in the treasury\u00a0·\u00a0120k", caption: "" });
  assert.equal(words.dedicatedFans.lockedReason, "Change only after matches");
  assert.equal(words.bribes.lockedReason, en["newTeam.bribesLocked"]);
  assert.deepEqual([words.apothecary.name, words.apothecary.caption, words.apothecary.lockedReason], ["Apothecary", "no · buy for 50k", ""]);
});

test("the section speaks Russian when the site does", () => {
  coach();
  initLocale("ru");
  draw();
  assert.equal(document.querySelector("h2#manage-resources-title").textContent, "Ресурсы");
  assert.equal(document.querySelector('[data-resource-key="startingRerolls"] .g-resource__note').textContent, ru["treasury.lock.startingRerolls"]);
  assert.equal(document.querySelector('[data-resource-key="startingRerolls"] .g-resource__name').textContent, "Стартовые рероллы");
  assert.match(document.querySelector('[data-resource-key="teamRerolls"] .g-resource__note--danger').textContent, /^Не хватает казны\u00a0·\u00a0120/);
  assert.match(toggle("apothecary").querySelector(".g-toggle__caption").textContent, /^нет · купить за 50/);
});

test("the card is a surface with its own text, readable in every palette, and its head drops the sub line under the title on a narrow phone", () => {
  assert.deepEqual(valuesOf(CSS, ".g-manage__resources", "background"), ["var(--surface)"]);
  assertReadable(CSS, ".g-manage__resources-title", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-manage__resources-sub", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-manage__note", "color", ["--surface"], 4.5);
  assert.deepEqual(valuesOf(CSS, ".g-manage__resources-head", "flex-wrap"), ["wrap"]);
  assert.deepEqual(valuesOf(CSS, ".g-manage__resources-sub", "white-space"), ["nowrap"]);
});

test("a sub line dropped under the title keeps the head's gap above the first row, as the title keeps it beside the sub line", () => {
  // T1 at 390 (and a desk at 901px): the sub line sat on «Starting rerolls». The title's bottom margin is the head's gap.
  assert.deepEqual(valuesOf(CSS, ".g-manage__resources-title", "margin"), ["var(--space-12) 0"]);
  assert.deepEqual(valuesOf(CSS, ".g-manage__resources-sub", "margin-bottom"), ["var(--space-12)"]);
  // One rule for every width: beside the title the sub's margin ends above the h2's, so no breakpoint undoes it.
  assert.equal(read(CSS).match(/\.g-manage__resources-sub\s*\{/g).length, 1);
});

test("a shortfall keeps its amount on the line of its words: «treasury · 120k» is joined by no-break spaces in both dictionaries", () => {
  // X1 at 390 in English: «120k» wrapped onto a line of its own after «·».
  for (const [locale, dictionary] of [["en", en], ["ru", ru]]) {
    assert.match(dictionary["treasury.short"], /\S · \{price\}$/, locale);
  }
  // The rest still wraps: neither the counter's note nor a switch's caption keeps the whole line from breaking.
  assert.deepEqual(valuesOf("src/ui/resource-counter.css", ".g-resource__note", "white-space"), []);
  assert.deepEqual(valuesOf("src/ui/toggle.css", ".g-toggle__caption", "white-space"), []);
  coach();
  draw();
  assert.match(document.querySelector('[data-resource-key="teamRerolls"] .g-resource__note--danger').textContent, /treasury · 120k$/);
});

test("a switch that cannot be pressed keeps its reason readable, as a locked counter keeps its note: the name goes quiet, not the words", () => {
  // The kit dims a disabled switch whole (toggle.css, opacity .6), which left «After the match's post-match» at 2.5:1 (T6).
  assert.deepEqual(valuesOf(CSS, ".g-manage__resources .g-toggle:disabled", "opacity"), ["1"]);
  assertReadable(CSS, ".g-manage__resources .g-toggle:disabled .g-toggle__caption", "color", ["--surface"], 4.5);
  assert.deepEqual(valuesOf(CSS, ".g-manage__resources .g-toggle:disabled .g-toggle__label", "color"), ["var(--faint)"]);
  assert.deepEqual(valuesOf("src/ui/resource-counter.css", ".g-resource--locked .g-resource__name", "color"), ["var(--faint)"], "the name a locked counter has");
  assert.deepEqual(valuesOf(CSS, ".g-manage__resources .g-toggle:disabled .g-toggle__track", "opacity"), [".6"]);
});
