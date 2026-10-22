import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertContrast, assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { AWAY, FIXTURE, HOME, RECORDS, act, agreed, begin, modelOf, players, reach, tap } from "./helpers/post-cases.mjs";
import { postMatchUrl } from "../src/core/routes.mjs";
import { INJURIES, POST_STATS } from "../src/domain/post-match/rules.mjs";
import { mvpChoices } from "../src/domain/post-match/score.mjs";
import { PLAYERS_SHEET, playerSheetMarkup, playersDraft, playersFooter, playersStep } from "../src/screens/matches/post-players.mjs";

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const CSS = "src/screens/matches/post-players.css";
const words = (fragment, selector) => fragment.querySelectorAll(selector).map((node) => node.textContent);

/** Both sides on the Players step, the records as tapped; `begun` changes the post-match begun. */
const atPlayers = (begun = begin(), score = {}) => reach(agreed(begun, score), { home: 2, away: 2 }, { events: score.events ?? RECORDS });
const modelAt = (state, over = {}) => modelOf(state, "players", {}, over);
const draftOf = (model) => playersDraft(model.post[model.sideName]);
const phone = (model, draft = draftOf(model), open = false) => mount(playersStep(model, draft, { phone: true, open }).contentHtml);
const rowWords = (fragment) => fragment.querySelectorAll(".g-after__event").map((row) => [row.querySelector(".g-after__num").textContent, row.querySelector(".g-after__name").textContent,
  row.querySelector(".g-after__line")?.textContent ?? "", row.querySelector(".g-after__spp").textContent]);

test("the events: rows of those who did something, their counters and SPP; the rest behind a button", () => {
  const model = modelAt(atPlayers());
  const fragment = phone(model);
  const card = fragment.querySelector(".g-after__card--events");
  assert.equal(card.querySelector(".g-after__label").textContent, "Match events");
  assert.equal(card.querySelector(".g-after__note").textContent,
    "From the records of the match (Round 7): taps on the «Roster» during the game: 7. An edit here changes the same records — the player's career stays right.");
  assert.deepEqual(rowWords(card), [
    ["3", "L. Ashby", "Catcher · TD 1 · COMP 1", "+4 SPP"],
    ["5", "T. Gruk", "Thrower · CAS 2", "+4 SPP"],
    ["4", "R. Pike", "Catcher · TD 1", "+3 SPP"],
    ["1", "W. Brandt", "Blitzer · CAS 1", "+2 SPP"],
    ["2", "O. Krell", "Blitzer · injury: Lasting Injury (AG)", "—"],
  ], "most SPP first; the injured after them");
  assert.deepEqual(card.querySelectorAll(".g-after__event").map((row) => [row.tagName, row.getAttribute("data-after-player")]).slice(0, 2), [["BUTTON", "h3"], ["BUTTON", "h5"]]);
  const rest = card.querySelector("[data-after-rest]");
  assert.equal(rest.textContent, "Other players · 6");
  assert.equal(rest.getAttribute("aria-expanded"), "false");
  assert.equal(card.querySelectorAll(".g-after__event").length, 5);
  const open = phone(model, draftOf(model), true);
  assert.equal(open.querySelector("[data-after-rest]").getAttribute("aria-expanded"), "true");
  assert.equal(open.querySelectorAll("#after-rest .g-after__event").length, 6);
  assert.deepEqual(rowWords(open.querySelector("#after-rest"))[0], ["6", "H. Player 6", "Human Lineman", "—"]);
  // A side begun before 3.0 enters its statistics here.
  const old = structuredClone(atPlayers());
  delete old.home.followsEvents;
  assert.equal(phone(modelAt(old)).querySelector(".g-after__card--events .g-after__note").textContent, "The match began before 3.0: there are no records, the statistics are entered here.");
  // The draft's numbers, not the saved ones: a press on its way shows at once.
  const draft = draftOf(model);
  draft.statistics.h6 = { ...draft.statistics.h6, knockouts: 1 };
  assert.deepEqual(rowWords(phone(model, draft))[4], ["6", "H. Player 6", "Human Lineman · KO 1", "+1 SPP"]);
});

test("a row opens the player's sheet: every counter a stepper, the injury, the characteristic, the season's toggle", () => {
  const model = modelAt(atPlayers());
  const sheet = mount(playerSheetMarkup(model, draftOf(model), "h3", { phone: true }));
  const dialog = sheet.querySelector(`dialog#${PLAYERS_SHEET}`);
  assert.equal(dialog.querySelector(".g-sheet__title").textContent, "#3 L. Ashby");
  assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "Catcher");
  const steppers = dialog.querySelectorAll("[data-action-key]");
  assert.deepEqual(steppers.map((cell) => cell.getAttribute("data-action-key")), POST_STATS);
  assert.ok(steppers.every((cell) => cell.getAttribute("data-sheet-player") === "h3"), "the sheet's own attribute (pre-flight L6)");
  assert.ok(!dialog.querySelector("[data-after-player]"), "a press in the sheet does not open it again");
  assert.ok(steppers.every((cell) => cell.classList.contains("g-stepper--compact")), "a phone's two-row cells");
  const crowd = dialog.querySelector('[data-action-key="crowdCasualties"]');
  assert.equal(crowd.querySelector(".g-stepper__label").textContent, "Crowd CAS +0");
  assert.equal(crowd.querySelector('[data-action-step="1"]').getAttribute("title"), "Add the CAS first: these are part of it", "no more than CAS (pre-flight L2)");
  assert.equal(dialog.querySelector('[data-action-key="touchdowns"] .g-stepper__value').textContent, "1");
  assert.match(dialog.textContent, /Crowd CAS and Foul CAS are part of CAS/, "said under the steppers (pre-flight L19)");
  const injury = dialog.querySelector('[role="radiogroup"][data-after-injury="h3"]');
  assert.deepEqual(injury.querySelectorAll('[role="radio"]').map((item) => item.getAttribute("data-code")), INJURIES);
  assert.equal(injury.querySelector('[aria-checked="true"]').getAttribute("data-code"), "none");
  assert.ok(!dialog.querySelector("[data-after-stat]"));
  // Lasting: the characteristic and the season's switch.
  const krell = mount(playerSheetMarkup(model, draftOf(model), "h2", { phone: false }));
  assert.ok(krell.querySelectorAll("[data-action-key]").every((cell) => cell.classList.contains("g-stepper--tile")), "a desk's tiles");
  const stat = krell.querySelector('[role="radiogroup"][data-after-stat="h2"]');
  assert.deepEqual(words(stat, '[role="radio"]'), ["MA", "ST", "AG", "PA", "AR"]);
  assert.equal(stat.querySelector('[aria-checked="true"]').getAttribute("data-stat"), "ag");
  assert.equal(krell.querySelector('.g-toggle[data-toggle-key="retire:h2"] .g-toggle__label').textContent, "Out for the rest of the season");
  // CAS cannot go below its parts.
  const draft = draftOf(model);
  draft.statistics.h5 = { ...draft.statistics.h5, crowdCasualties: 2 };
  assert.ok(mount(playerSheetMarkup(model, draft, "h5", { phone: true })).querySelector('[data-action-key="casualties"] [data-action-step="-1"]').hasAttribute("disabled"));
  // Read only once the step is passed: every control closed and why.
  const passed = modelOf(reach(atPlayers(), { home: 3, away: 3 }), "players");
  const shut = mount(playerSheetMarkup(passed, draftOf(passed), "h3", { phone: true }));
  assert.ok(shut.querySelectorAll("[data-action-step]").every((button) => button.getAttribute("aria-disabled") === "true"));
  assert.equal(shut.querySelector("[data-action-step]").getAttribute("title"), "The «Players» step is done: it reads only");
  assert.ok(shut.querySelectorAll("[data-after-injury] [role=\"radio\"]").every((item) => item.getAttribute("aria-disabled") === "true"));
  assert.equal(playerSheetMarkup(model, draftOf(model), "nobody", { phone: true }), "");
});

test("MVP: those who stood out first; one MVP one radio group, two MVPs two pressed buttons at most", () => {
  const model = modelAt(atPlayers());
  const fragment = phone(model);
  const choices = mvpChoices(model.post, "home");
  const group = fragment.querySelector('.g-after__mvp[role="radiogroup"]');
  assert.equal(group.getAttribute("aria-label"), "MVP · +5 SPP");
  assert.deepEqual(words(group, ".g-after__label"), ["Stood out", "Others"]);
  const [top, rest] = group.querySelectorAll(".g-after__chips");
  assert.ok(top.classList.contains("g-after__chips--2") && rest.classList.contains("g-after__chips--3"));
  assert.deepEqual(top.querySelectorAll("[data-after-mvp]").map((chip) => chip.getAttribute("data-after-mvp")), choices.top.map((choice) => choice.id));
  assert.deepEqual(words(top, "[data-after-mvp]"), ["#3 L. Ashby", "#5 T. Gruk", "#4 R. Pike", "#1 W. Brandt"]);
  assert.deepEqual(rest.querySelectorAll("[data-after-mvp]").map((chip) => chip.getAttribute("data-after-mvp")), choices.rest.map((choice) => choice.id));
  assert.equal(group.querySelectorAll('[role="radio"][tabindex="0"]').length, 1, "one way in");
  const chosen = draftOf(model);
  chosen.mvps = ["h6"];
  const picked = phone(model, chosen);
  assert.equal(picked.querySelector('[role="radio"][aria-checked="true"]').getAttribute("data-after-mvp"), "h6");
  assert.equal(picked.querySelector('[role="radio"][tabindex="0"]').getAttribute("data-after-mvp"), "h6");
  // Two MVPs to the winner of a technical result: buttons pressed, two at most, said why a third is closed.
  const technical = atPlayers(begin({ events: {} }), { mode: "technical", home: [2, 0], away: [0, 0] });
  const two = modelAt(technical);
  const twoDraft = { ...draftOf(two), mvps: ["h1", "h3"] };
  const pressed = phone(two, twoDraft);
  assert.ok(!pressed.querySelector('[role="radiogroup"].g-after__mvp'));
  assert.deepEqual(pressed.querySelectorAll('[data-after-mvp][aria-pressed="true"]').map((chip) => chip.getAttribute("data-after-mvp")), ["h1", "h3"]);
  const third = pressed.querySelector('[data-after-mvp="h4"]');
  assert.deepEqual([third.getAttribute("aria-pressed"), third.getAttribute("aria-disabled"), third.getAttribute("title")], ["false", "true", "Two MVPs are chosen — take one off first"]);
  assert.ok(!phone(two, { ...draftOf(two), mvps: ["h1"] }).querySelector('[data-after-mvp][aria-disabled="true"]'), "one of two: the rest stay open");
  // Its loser has none, and says why.
  const loser = phone(modelAt(technical, { viewerSide: "away" }));
  assert.ok(!loser.querySelector("[data-after-mvp]"));
  assert.match(loser.textContent, /No MVP for this side: a technical loss/);
  // Stars and the dead are not offered.
  const dead = draftOf(model);
  dead.injuries.h6 = { code: "dead", retire: false };
  assert.ok(!phone(model, dead).querySelector('[data-after-mvp="h6"]'));
});

test("an injury from the records says so while the side follows them; once saved it is the coach's", () => {
  const state = atPlayers();
  const fragment = phone(modelAt(state));
  const cards = fragment.querySelectorAll(".g-after__card").filter((card) => card.querySelector("[data-after-injury]"));
  assert.equal(cards.length, 1);
  const [card] = cards;
  assert.equal(card.querySelector(".g-after__head .g-after__label").textContent, "Injury · #2 O. Krell");
  assert.equal(card.querySelector(".g-after__fromrec").textContent, "from a match record");
  assert.match(card.textContent, /Marked on the «Roster» during the game: Lasting Injury \(AG\)\. Check it — here the injury is applied for good\./);
  const radios = card.querySelector('[role="radiogroup"][data-after-injury="h2"]');
  assert.deepEqual(radios.querySelectorAll('[role="radio"]').map((item) => [item.querySelector("span").textContent, item.querySelector(".g-after__optsub")?.textContent ?? ""]),
    [["No injury", ""], ["Badly Hurt", ""], ["Seriously Hurt", "misses a match"], ["Serious Injury", "NI + misses a match"], ["Lasting Injury", "−1 stat"], ["Dead", ""]]);
  assert.equal(radios.querySelector('[aria-checked="true"]').getAttribute("data-code"), "lasting");
  assert.ok(card.querySelector('[data-after-stat="h2"] [data-stat="ag"][aria-checked="true"]'));
  assert.ok(card.querySelector('[data-toggle-key="retire:h2"]'));
  assert.match(card.textContent, /Codes as in the Casualty Table\./);
  // Saved: the coach's now, no chip.
  const saved = act(state, "home", { type: "statistics", statistics: state.home.statistics, injuries: state.home.injuries, mvps: ["h3"] });
  assert.equal(saved.home.followsEvents, false);
  const after = phone(modelAt(saved));
  assert.ok(after.querySelector('[data-after-injury="h2"]'));
  assert.ok(!after.querySelector(".g-after__fromrec"));
  // An injury given in the sheet gets its card; «No injury» chosen keeps it to choose again.
  const draft = draftOf(modelAt(state));
  draft.injuries.h6 = { code: "none", retire: false };
  assert.ok(phone(modelAt(state), draft).querySelector('[data-after-injury="h6"]'));
});

test("rookie protection is said on the injury", () => {
  const state = atPlayers(begin({ gamesPlayed: 1 }));
  const model = modelAt(state);
  const draft = { ...draftOf(model), injuries: { ...draftOf(model).injuries, h6: { code: "dead", retire: false } } };
  const card = phone(model, draft).querySelectorAll(".g-after__card").find((item) => item.querySelector('[data-after-injury="h6"]'));
  assert.equal(card.querySelector(".g-after__rookie").textContent, "Counts as Badly Hurt: the team has played fewer than 3 games");
  assert.ok(phone(model, draft).querySelector('[data-after-mvp="h6"]'), "dead as Badly Hurt: still an MVP's choice");
  assert.ok(!phone(modelAt(atPlayers())).querySelector(".g-after__rookie"));
});

test("conceding: the veterans' D6, no SPP for the loser", () => {
  const veteran = { advancements: [{ type: "primary", grants: { skill: "Block" } }, { type: "primary", grants: { skill: "Dodge" } }, { type: "primary", grants: { skill: "Fend" } }] };
  const away = players("a", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { 0: { name: "V. Old", ...veteran } });
  const events = { home: [...tap("h3", "touchdowns"), ...tap("h4", "touchdowns")], away: [...tap("a2", "completions")] };
  const state = atPlayers(begin({ events, away: { roster: away } }), { mode: "conceded", home: [2, 0], away: [0, 0], events });
  const model = modelAt(state, { viewerSide: "away" });
  const fragment = phone(model);
  const card = fragment.querySelectorAll(".g-after__card").find((item) => item.querySelector("[data-after-departure]"));
  assert.equal(card.querySelector(".g-after__label").textContent, "Veterans after conceding · D6");
  const dice = card.querySelector('[role="radiogroup"][data-after-departure="a1"]');
  assert.equal(dice.getAttribute("aria-label"), "#1 V. Old · D6");
  assert.deepEqual(dice.querySelectorAll('[role="radio"]').map((face) => face.getAttribute("data-die")), ["1", "2", "3", "4", "5", "6"]);
  assert.match(card.textContent, /A player with 3\+ advancements leaves on 1–3\./);
  assert.deepEqual(rowWords(fragment), [["2", "A. Player 2", "Human Lineman · COMP 1", "—"]], "no SPP for the loser");
  assert.match(fragment.textContent, /Conceded: no SPP for this match/);
  // «No penalty»: SPP, one MVP, no veterans (pre-flight L15).
  const safe = modelAt(atPlayers(begin({ events, away: { roster: away } }), { mode: "conceded-safe", home: [2, 0], away: [0, 0], events }), { viewerSide: "away" });
  const kept = phone(safe);
  assert.ok(!kept.querySelector("[data-after-departure]"));
  assert.deepEqual(rowWords(kept), [["2", "A. Player 2", "Human Lineman · COMP 1", "+1 SPP"]]);
  assert.ok(kept.querySelector('.g-after__mvp[role="radiogroup"]'));
});

test("who can advance: a card with the SPP and «Advance»; a taken one with «Undo»", () => {
  const state = atPlayers();
  const model = modelAt(state);
  const cards = phone(model).querySelectorAll(".g-after__card--adv");
  assert.deepEqual(cards.map((card) => card.querySelector(".g-after__name").textContent), ["L. Ashby can advance", "R. Pike can advance", "T. Gruk can advance"]);
  assert.equal(cards[0].querySelector(".g-after__line").textContent, "4 SPP available with MVP · optional");
  const button = cards[0].querySelector("[data-player-advance]");
  assert.deepEqual([button.textContent, button.getAttribute("data-player-advance")], ["Advance", "h3#0"]);
  assert.match(phone(model).textContent, /Changing the statistics or the MVP takes the advancements chosen here off\./);
  // A random skill taken at the table, the statistics saved first (a change of them takes it off): «Advancement: Diving Catch», and «Undo».
  const saved = act(state, "home", { type: "statistics", statistics: state.home.statistics, injuries: state.home.injuries, mvps: ["h1"] });
  const taken = act(saved, "home", { type: "advance", playerId: "h3", advancementType: "random", grant: { skill: "Diving Catch" }, roll: { via: "table" } });
  const card = phone(modelAt(taken)).querySelectorAll(".g-after__card--adv").find((item) => item.querySelector('[data-after-untake="h3"]'));
  assert.equal(card.querySelector(".g-after__name").textContent, "Advancement: Diving Catch");
  assert.ok(!card.querySelector("[data-player-advance]"), "1 SPP left: no more to take");
  assert.equal(card.querySelector("[data-after-untake]").getAttribute("data-after-untake"), "h3");
  // Read only: what was taken is said, nothing is offered.
  const passed = modelOf(reach(act(taken, "home", { type: "lock-players" }), { home: 3, away: 3 }), "players");
  const shut = phone(passed);
  assert.equal(shut.querySelectorAll(".g-after__card--adv").length, 1);
  assert.ok(!shut.querySelector("[data-player-advance], [data-after-untake]"));
});

test("the footer is closed while the score and the records disagree, the MVP is missing or a veteran's die is not marked", () => {
  const model = modelAt(atPlayers());
  const draft = draftOf(model);
  const missing = playersFooter(model, draft);
  assert.deepEqual([missing.kind, missing.action, missing.label, missing.disabled, missing.hint], ["action", "lock-players", "Next: roster", true, "Choose the MVP first"]);
  const ready = playersFooter(model, { ...draft, mvps: ["h3"] });
  assert.deepEqual([ready.disabled, ready.hint], [false, ""]);
  const off = { ...draft, mvps: ["h3"], statistics: { ...draft.statistics, h6: { ...draft.statistics.h6, touchdowns: 1 } } };
  assert.equal(playersFooter(model, off).hint, "First make the players' TD and CAS add up to the score");
  const alert = phone(model, off).querySelector('[role="alert"]');
  assert.match(alert.textContent, /your TD: 2 in the score, 3 in the records\./, "the mismatch said on the step that sets it right");
  assert.deepEqual(phone(model, off).childNodes[0].getAttribute("class"), "g-after__alert", "over the events");
  // The opponent's mismatch is theirs to set right: none here.
  const theirs = structuredClone(atPlayers());
  theirs.away.statistics.a5 = { ...theirs.away.statistics.a5, touchdowns: 3 };
  assert.ok(!phone(modelAt(theirs)).querySelector('[role="alert"]'));
  // A veteran's die.
  const veteran = { advancements: [{ type: "primary", grants: { skill: "Block" } }, { type: "primary", grants: { skill: "Dodge" } }, { type: "primary", grants: { skill: "Fend" } }] };
  const events = { home: [...tap("h3", "touchdowns"), ...tap("h4", "touchdowns")], away: [] };
  const conceded = modelAt(atPlayers(begin({ events, away: { roster: players("a", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { 0: veteran }) } }), { mode: "conceded", home: [2, 0], away: [0, 0], events }), { viewerSide: "away" });
  assert.equal(playersFooter(conceded, draftOf(conceded)).hint, "Mark the veterans' D6 first");
  assert.equal(playersFooter(conceded, { ...draftOf(conceded), departures: { a1: 5 } }).disabled, false);
  // Passed: on to the roster.
  const passed = modelOf(reach(atPlayers(), { home: 3, away: 3 }), "players");
  assert.deepEqual([playersFooter(passed, draftOf(passed)).kind, playersFooter(passed, draftOf(passed)).href], ["next", postMatchUrl("g1", "roster")]);
  assert.deepEqual(playersStep(model, draft, { phone: true }).footer, missing);
});

test("a desk's table: a real table, the MVP a star button, the injuries at the right", () => {
  const model = modelAt(atPlayers());
  const draft = { ...draftOf(model), mvps: ["h3"] };
  const step = playersStep(model, draft, { phone: false });
  const fragment = mount(step.contentHtml);
  const table = fragment.querySelector("table.g-after__table");
  assert.equal(table.querySelector("caption").textContent, "The match's events, player by player");
  assert.deepEqual(table.querySelectorAll('thead th[scope="col"]').map((head) => head.textContent), ["#", "Player", "TD", "CAS", "COMP", "KO", "MVP", "SPP", "Injury"]);
  const rows = table.querySelectorAll("tbody tr");
  assert.equal(rows.length, 11, "every player of the match");
  const ashby = rows.find((row) => row.querySelector('[data-after-player="h3"]'));
  assert.deepEqual(ashby.querySelectorAll("td").map((cell) => cell.textContent), ["3", "1", "0", "1", "0", "★", "+9", "—"], "SPP with the MVP (L26)");
  const star = ashby.querySelector(".g-after__star");
  assert.deepEqual([star.getAttribute("aria-pressed"), star.getAttribute("aria-label"), star.getAttribute("data-after-mvp")], ["true", "MVP: L. Ashby", "h3"]);
  assert.equal(ashby.querySelector('th[scope="row"] .g-after__line').textContent, "Catcher");
  const krell = rows.find((row) => row.querySelector('[data-after-player="h2"]'));
  assert.equal(krell.querySelector(".g-after__td--hurt").textContent, "Lasting Injury (AG)");
  assert.equal(rows.find((row) => row.querySelector('[data-after-player="h6"]')).querySelector(".g-after__star").getAttribute("aria-pressed"), "false");
  assert.deepEqual(words(fragment, ".g-after__notes .g-after__note"),
    ["Events — from the records of the match (Round 7): taps on the «Roster» during the game. An edit in the player's sheet changes the same records, and the career stays right.",
      "MVP — the star, +5 SPP. Anyone but stars and the dead; after a technical win or the opponent's concession — two MVPs.",
      "Codes as in the Casualty Table. With fewer than 3 games played, any injury counts as Badly Hurt."], "the codes over the table, once (fidelity J6)");
  assert.ok(fragment.querySelector(".g-after__card--adv"), "the advancement cards under the table");
  assert.ok(!fragment.querySelector("[data-after-injury]"), "the injuries are the column's");
  const aside = mount(step.asideHtml);
  assert.ok(aside.querySelector('[data-after-injury="h2"]'));
  // DeskPostPlayers' injury card: the title with its chip, the six injuries, «Characteristic» and the five; no paragraph.
  assert.equal(aside.querySelectorAll(".g-after__note").length, 0, "neither «Marked on the «Roster»…» nor the codes");
  assert.deepEqual(words(aside, ".g-after__label").slice(1), ["Characteristic"]);
  assert.equal(aside.querySelector("[data-after-stat]").getAttribute("aria-label"), "Characteristic");
  assert.match(mount(playersStep(model, draft, { phone: true }).contentHtml).textContent, /Which characteristic.*Codes as in the Casualty Table/s, "a phone's card keeps both");
  // Friendly words, and no star where nobody is MVP.
  const friendly = mount(playersStep(modelAt(atPlayers(), { fixture: { ...FIXTURE, kind: "friendly" } }), draft, { phone: false }).contentHtml);
  assert.match(friendly.querySelector(".g-after__notes").textContent, /\(Friendly\)/);
  const technical = atPlayers(begin({ events: {} }), { mode: "technical", home: [2, 0], away: [0, 0] });
  const loser = mount(playersStep(modelAt(technical, { viewerSide: "away" }), draftOf(modelAt(technical, { viewerSide: "away" })), { phone: false }).contentHtml);
  assert.ok(!loser.querySelector(".g-after__star"));
  assert.match(loser.textContent, /No MVP for this side/);
});

test("names are text", () => {
  const hostile = HOME.map((player, index) => (index === 1 || index === 2 ? { ...player, name: HOSTILE } : player));
  const state = atPlayers(begin({ home: { roster: hostile, team: HOSTILE }, away: { team: HOSTILE, roster: AWAY } }));
  const model = modelAt(state);
  for (const isPhone of [true, false]) {
    const step = playersStep(model, draftOf(model), { phone: isPhone, open: true });
    const fragment = mount(`${step.contentHtml}${step.asideHtml}${playerSheetMarkup(model, draftOf(model), "h2", { phone: isPhone })}`);
    assert.ok(!fragment.querySelector("img"));
    assertCspSafe(fragment);
  }
  assert.equal(phone(model).querySelector('[data-after-player="h3"] .g-after__name').textContent, HOSTILE);
});

test("every key in both dictionaries, the injuries, their lines and the counters by their sets", () => {
  assertDictionaryCovers("src/screens/matches/post-players.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const code of INJURIES) assert.ok(words[`after.injury.${code}`], `${locale} after.injury.${code}`);
    for (const code of ["miss", "niggling", "lasting"]) assert.ok(words[`after.injurySub.${code}`], `${locale} after.injurySub.${code}`);
    for (const counter of POST_STATS) {
      assert.ok(words[`after.stat.${counter}`], `${locale} after.stat.${counter}`);
      assert.ok(words[`after.statName.${counter}`], `${locale} after.statName.${counter}`);
    }
    for (const why of ["technical", "conceded"]) assert.ok(words[`after.mvpWhy.${why}`], `${locale} after.mvpWhy.${why}`);
  }
});

test("styled as the prototypes draw it; readable; D2; nothing cut with «…»", () => {
  const sheets = [CSS, "src/screens/matches/post.css", "src/ui/action-stepper.css", "src/ui/sheet.css", "toggle.css", "button.css"];
  const states = [atPlayers(), atPlayers(begin({ gamesPlayed: 1 })), atPlayers(begin({ events: {} }), { mode: "technical", home: [2, 0], away: [0, 0] })];
  for (const state of states) {
    for (const viewerSide of ["home", "away"]) {
      const model = modelAt(state, { viewerSide });
      const draft = { ...draftOf(model), injuries: { ...draftOf(model).injuries, [`${viewerSide[0]}6`]: { code: "dead", retire: false } } };
      for (const isPhone of [true, false]) {
        const step = playersStep(model, draft, { phone: isPhone, open: true });
        assertStyled(mount(`${step.contentHtml}${step.asideHtml}`), ...sheets);
        assertStyled(mount(playerSheetMarkup(model, draft, `${viewerSide[0]}3`, { phone: isPhone })), ...sheets);
      }
    }
  }
  const own = (selector, property) => valuesOf(CSS, selector, property);
  // The prototypes' values (PostPlayers.html, DeskPostPlayers.html).
  assert.deepEqual(own(".g-after__event", "min-height"), ["52px"]);
  assert.deepEqual(own(".g-after__num", "font"), ["700 17px/1 var(--font-display)"]);
  assert.deepEqual(own(".g-after__num", "width"), ["28px"]);
  assert.deepEqual(own(".g-after__name", "font"), ["700 15px/1.3 var(--font-body)"]);
  assert.deepEqual(own(".g-after__chips--2", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(own(".g-after__chips--3", "grid-template-columns"), ["repeat(3, minmax(0, 1fr))"]);
  assert.deepEqual(own('.g-after__chip[aria-checked="true"]', "box-shadow"), ["inset 0 0 0 2px var(--accent)"]);
  assert.deepEqual(own(".g-after__fromrec", "min-height"), ["26px"]);
  assert.deepEqual(own(".g-after__fromrec::before", "width"), ["7px"]);
  assert.deepEqual(own(".g-after__option--injury", "min-height"), ["48px", "44px"], "48px, a desk's 44px");
  assert.deepEqual(own(".g-after__options--stat", "grid-template-columns"), ["repeat(5, minmax(0, 1fr))"]);
  assert.deepEqual(own(".g-after__optsub", "font"), ["500 11px/1.2 var(--font-body)"]);
  assert.deepEqual(own(".g-after__card--adv", "background"), ["var(--accent-tint-soft)"]);
  assert.deepEqual(own(".g-after__advance", "background"), ["var(--accent)"]);
  assert.deepEqual(own(".g-after__th", "letter-spacing"), ["0.04em"]);
  assert.deepEqual(own(".g-after__th", "font"), ["700 12px/1.3 var(--font-body)"]);
  // A label that wraps keeps its neighbours at the top, as 2.x's th rule held them before it went (stage 13, Task 23).
  assert.deepEqual(own(".g-after__th", "vertical-align"), ["top"]);
  assert.deepEqual(own(".g-after__td", "height"), ["52px"]);
  assert.deepEqual(own(".g-after__table", "font-variant-numeric"), ["tabular-nums"]);
  assert.deepEqual(own(".g-after__star", "color"), ["var(--warn)"]);
  // Fidelity J4, J5, J11: DeskPostPlayers' columns (36 · 1.4fr · 5 × 52 · 64 · 1.2fr, gap 8: border-box cells 0 4 in),
  // only the MVP's ★ gold, «+4 SPP» 16px.
  assert.deepEqual(["1", "2", "n+3):nth-child(-n+7", "8", "9"].map((n) => own(`.g-after__th:nth-child(${n})`, "width")), [["44px"], ["53.8%"], ["60px"], ["72px"], ["46.2%"]]);
  assert.deepEqual(own('.g-after__star[aria-pressed="false"]', "color"), ["var(--muted)"]);
  assert.deepEqual(own(".g-after__spp", "font"), ["700 16px/1.3 var(--font-body)"]);
  // Readable in every palette.
  assertContrast("--warn", ["--surface"], 3, { what: "the MVP's star, a large mark" });
  assertReadable(CSS, '.g-after__star[aria-pressed="false"]', "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-after__td--hurt", "color", ["--surface"], 4.5);
  assertContrast("--on-accent-tint", ["--accent-tint-soft"], 4.5, { what: "the accent's ink on the advancement card" });
  for (const selector of [".g-after__spp", ".g-after__line", ".g-after__th", ".g-after__td--none", ".g-after__rookie", ".g-after__td--spp", ".g-after__rest", ".g-after__untake"]) {
    assertReadable(CSS, selector, "color", ["--surface"], 4.5);
  }
  assertReadable(CSS, ".g-after__line", "color", ["--accent-tint-soft"], 4.5);
  assertReadable(CSS, ".g-after__fromrec", "color", ["--accent-tint"], 4.5);
  assertReadable(CSS, ".g-after__optsub", "color", ["--surface", "--accent-tint-soft"], 4.5);
  // D2: a thumb's up to 900px; from 901px the prototype's, never under 24.
  const px = (value) => ({ "var(--size-touch)": 44 })[value] ?? parseInt(value, 10);
  for (const [selector, property] of [[".g-after__event", "min-height"], [".g-after__chip", "min-height"], [".g-after__option", "min-height"], [".g-after__option--injury", "min-height"],
    [".g-after__advance", "min-height"], [".g-after__untake", "min-height"], [".g-after__rest", "min-height"]]) {
    assert.ok(px(own(selector, property)[0]) >= 44, `${selector} ${property}`);
  }
  for (const selector of [".g-after__chip", ".g-after__option", ".g-after__advance", ".g-after__untake"]) assert.deepEqual(inMedia(CSS, "min-width: 901px", selector, "min-height"), ["40px"], selector);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-after__option--injury", "min-height"), ["44px"]);
  assert.ok(px(own(".g-after__star", "height")[0]) >= 24, "the star is a desk's only: 32px");
  assert.ok(px(own(".g-after__cellbtn", "min-height")[0]) >= 24);
  // Nothing cut; names wrap.
  const bare = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(bare, /ellipsis|text-overflow|line-clamp|nowrap/);
  assert.doesNotMatch(bare, /--focus-ring|style=/);
  for (const selector of [".g-after__name", ".g-after__line", ".g-after__chip", ".g-after__td--hurt"]) assert.ok(own(selector, "overflow-wrap").includes("anywhere"), selector);
  for (const [, query] of text(CSS).matchAll(/@media\s*([^{]+)\{/g)) assert.ok(["(max-width: 900px)", "(min-width: 901px)"].includes(query.trim()), query);
  const styles = text("src/styles.css");
  assert.ok(styles.indexOf('@import url("screens/matches/post-players.css");') > styles.indexOf('@import url("screens/matches/post.css");'), "after the post-match's own sheet");
});
