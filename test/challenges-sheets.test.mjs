import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertContrast, inMedia, mediaText, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const { acceptModel, sendModel } = await import("../src/screens/matches/challenges-model.mjs");
const { ACCEPT_SHEET, SEND_SHEET, acceptSheetMarkup, sendSheetMarkup } = await import("../src/screens/matches/challenges-sheets.mjs");
const { state } = await import("../src/core/state.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
// The model names a race by the reference's words, and prices a team by it.
state.data = expandCollections(JSON.parse(text("public/data.en.json")));
const CSS = "src/screens/matches/challenges-sheets.css";

const TODAY = (hour) => `2026-10-21T${hour}:00:00`;
const TWO_DAYS = "2026-10-19T10:00:00";

const ME = { id: "u1", login: "coach" };
const coach = (id, login, teams) => ({ id, login, teams: teams.map(([teamId, name, slug]) => ({ id: teamId, name, baseTeamSlug: slug })) });
// ChallengeSend.html's coaches: three met lately, the others in the league, nightblade challenged already.
const ORC_BOSS = coach("u5", "orc_boss", [["r1", "Grimtusk Raiders", "teams/orc"], ["r2", "Iron Teeth", "teams/black-orc"]]);
const THALION = coach("u7", "thalion", [["s1", "Silverbrook Rangers", "teams/elven-union"]]);
const STONEBEARD = coach("u8", "stonebeard", [["k1", "Karak Hold Hammers", "teams/dwarf"]]);
const AMAZONA = coach("u6", "amazona", [["a1", "Lustria Valkyries", "teams/amazon"]]);
const FROSTULF = coach("u9", "frostulf", [["f1", "Frostfang Raiders", "teams/norse"]]);
const NIGHTBLADE = coach("u10", "nightblade", [["d1", "Duskspire Knives", "teams/dark-elf"]]);
const ROTFATHER = coach("u11", "rotfather", [["m1", "Mirefen Rotters", "teams/nurgle"], ["m2", "Plaguebearers", "teams/nurgle"]]);
const OPPONENTS = [AMAZONA, FROSTULF, NIGHTBLADE, ORC_BOSS, ROTFATHER, STONEBEARD, THALION];

/** Eleven linemen and two rerolls: a value the reference prices. */
const roster = () => ({ rerolls: 2, players: Array.from({ length: 11 }, (_, at) => ({ id: `p${at}`, rowIndex: 0, number: String(at + 1), name: `P${at}` })) });
const T1 = { id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true, roster: roster() };
const T2 = { id: "t2", name: "Anji Magritta", baseTeamSlug: "teams/imperial-nobility", stage: "active", inActiveSeason: false, roster: roster() };
const TEAMS = [T1, T2];

const named = ({ id, login }) => ({ id, login });
const teamOf = ({ id, name, baseTeamSlug }) => ({ id, name, baseTeamSlug });
const challenge = (id, from, to, team, createdAt, over = {}) => ({
  id, sender: named(from), recipient: named(to), team: teamOf(team), status: "pending", gameId: null, createdAt, updatedAt: createdAt, ...over,
});
/** A game of the coach's with another, last changed at `updatedAt`: what makes that coach a recent opponent. */
const met = (id, other, updatedAt) => ({
  id, kind: "league", resultStatus: "confirmed", preparationStatus: "completed", postMatchStatus: "completed", updatedAt,
  home: { user: named(ME), team: teamOf(T1) }, away: { user: named(other), team: teamOf(other.teams[0]) },
});
const GAMES = [met("g1", ORC_BOSS, TODAY("11")), met("g2", THALION, TODAY("10")), met("g3", STONEBEARD, TODAY("09"))];
// Ours to nightblade, two days ago: he is busy with the Wardens, and older than the three met today.
const PAYLOAD = { challenges: [challenge("c2", ME, NIGHTBLADE, T1, TWO_DAYS)], opponents: OPPONENTS };
const BASE = { payload: PAYLOAD, games: GAMES, teams: TEAMS, teamId: "t1", viewerId: "u1" };

/** The challenge sheet drawn from the model over `over`. */
function send(over = {}, { phone = true, refusal = "", busy = false } = {}) {
  return mount(sendSheetMarkup(sendModel({ ...BASE, ...over }), { phone, refusal, busy }));
}

const OFFER = challenge("c1", ORC_BOSS, ME, ORC_BOSS.teams[0], TODAY("08"));
const SENDER = { user: { id: "u5", login: "orc_boss", telegram: "@orc_boss" }, team: { ...teamOf(ORC_BOSS.teams[0]), roster: roster() }, rolls: [] };
/** The accept sheet drawn from the model over `over`. */
function accept(over = {}, { phone = true, refusal = "", busy = false } = {}) {
  const model = acceptModel({ challenge: OFFER, sender: SENDER, teams: TEAMS, choiceId: "", teamId: "t1", ...over });
  return { model, fragment: mount(acceptSheetMarkup(model, { phone, refusal, busy })) };
}

const words = (node) => node?.textContent.replace(/\s+/g, " ").trim();
const all = (node, selector) => node.querySelectorAll(selector).map(words);
const radios = (node) => node.querySelectorAll('[role="radio"]').map((item) => [
  item.getAttribute("data-friendly-pick") ?? item.getAttribute("data-friendly-team") ?? item.getAttribute("data-friendly-own"),
  item.getAttribute("aria-checked"), item.getAttribute("tabindex"), item.getAttribute("aria-disabled"),
]);

test("a phone's challenge sheet: the search, recent opponents and the others in one radio group, the team chosen, the summary, the button", () => {
  const fragment = send({ chosenId: "u7" });
  const dialog = fragment.querySelector(`dialog#${SEND_SHEET}`);
  assert.equal(SEND_SHEET, "friendly-send");
  assert.ok(dialog.matches(".g-sheet.g-challenge-send"));
  assert.equal(words(dialog.querySelector("h2.g-sheet__title")), "Whom do we challenge");
  assert.equal(dialog.querySelector(".g-sheet__sub"), null, "ChallengeSend.html has no line under its title");

  const search = dialog.querySelector(".g-sheet__body .g-challenge__search input#friendly-search");
  assert.deepEqual([search.getAttribute("type"), search.getAttribute("value"), search.getAttribute("placeholder"), search.hasAttribute("data-friendly-search")],
    ["search", "", "Coach or team", true]);
  assert.equal(words(dialog.querySelector('label[for="friendly-search"]')), "Find a coach or a team");
  assert.equal(dialog.querySelector("[data-friendly-clear]"), null, "nothing typed, nothing to clear");

  const groups = dialog.querySelectorAll(".g-challenge__group");
  assert.equal(groups.length, 1, "recent and the others are one radio group");
  const [group] = groups;
  assert.deepEqual([group.getAttribute("role"), group.getAttribute("aria-label")], ["radiogroup", "Opponent"]);
  assert.ok(group.closest(".g-challenge__list"), "the list is what scrolls");
  assert.deepEqual(all(group, ".g-challenge__caption"), ["Recent opponents", "Other coaches · 4"]);
  assert.deepEqual(radios(group), [
    ["u5", "false", "-1", null], ["u7", "true", "0", null], ["u8", "false", "-1", null],
    ["u6", "false", "-1", null], ["u9", "false", "-1", null], ["u10", "false", "-1", "true"], ["u11", "false", "-1", null],
  ], "the chosen coach is the one tab stop; the busy one cannot be chosen");
  const thalion = group.querySelector('[data-friendly-pick="u7"]');
  assert.deepEqual([thalion.tagName, thalion.getAttribute("type"), thalion.getAttribute("class")], ["BUTTON", "button", "g-challenge__row"]);
  assert.deepEqual([words(thalion.querySelector(".g-challenge__letter")), words(thalion.querySelector(".g-challenge__login")), words(thalion.querySelector(".g-challenge__line"))],
    ["T", "thalion", "Silverbrook Rangers"]);
  assert.equal(thalion.querySelector(".g-challenge__letter").getAttribute("aria-hidden"), "true");
  assert.ok(thalion.querySelector(".g-challenge__radio"));
  assert.equal(words(group.querySelector('[data-friendly-pick="u11"] .g-challenge__line')), "Mirefen Rotters · Plaguebearers");
  const busy = group.querySelector('[data-friendly-pick="u10"]');
  assert.equal(words(busy.querySelector(".g-challenge__busy")), "Challenge sent", "said in the neutral words, not «already challenged»");
  assert.equal(busy.querySelector(".g-challenge__radio"), null);

  const foot = dialog.querySelector(".g-sheet__foot");
  assert.equal(words(foot.querySelector(".g-challenge__label")), "Challenging with");
  const teams = foot.querySelector(".g-challenge__teams");
  assert.deepEqual([teams.getAttribute("role"), teams.getAttribute("aria-label")], ["radiogroup", "Challenging with"]);
  assert.deepEqual(radios(teams), [["t1", "true", "0", null], ["t2", "false", "-1", null]]);
  assert.deepEqual(all(teams, "[data-friendly-team]"), ["Ashgrove Wardens", "Anji Magritta"]);
  assert.equal(words(foot.querySelector(".g-challenge__summary")), "thalion chooses a team on accepting the challenge. You play: Ashgrove Wardens.");
  const cta = foot.querySelector("[data-friendly-challenge]");
  assert.deepEqual([words(cta), cta.getAttribute("class"), cta.hasAttribute("disabled")], ["Challenge thalion", "g-btn g-btn--primary", false]);
  assert.equal(foot.querySelector("[data-sheet-close]"), null, "a phone's foot has the one button");
  assert.equal(dialog.querySelector(".g-sheet__head [data-sheet-close]").getAttribute("aria-label"), "Close");

  const nobody = send();
  assert.equal(nobody.querySelectorAll('[role="radio"][tabindex="0"]').length, 2, "with no one chosen: the first coach, and the team");
  assert.equal(nobody.querySelector('[data-friendly-pick="u5"]').getAttribute("tabindex"), "0");
  const closed = nobody.querySelector("[data-friendly-challenge]");
  assert.deepEqual([words(closed), closed.hasAttribute("disabled")], ["Choose an opponent", true]);
  assert.equal(words(nobody.querySelector(".g-challenge__summary")), "The opponent chooses a team on accepting the challenge.");
  const second = send({ teamChoice: "t2", chosenId: "u10" });
  assert.deepEqual(radios(second.querySelector(".g-challenge__teams")), [["t1", "false", "-1", null], ["t2", "true", "0", null]]);
  assert.equal(second.querySelector('[data-friendly-pick="u10"]').getAttribute("aria-checked"), "true", "with the other team he can be challenged");
  assert.equal(second.querySelector('[data-friendly-pick="u10"] .g-challenge__busy'), null);
});

test("a desk's challenge window: the title and its line, recent as pressed chips, the list in two columns, the team row in the body, Cancel and the button in the foot", () => {
  const fragment = send({ chosenId: "u7" }, { phone: false });
  const dialog = fragment.querySelector(`dialog#${SEND_SHEET}`);
  assert.equal(words(dialog.querySelector("h2.g-sheet__title")), "Challenge to a friendly");
  assert.equal(words(dialog.querySelector(".g-sheet__sub")), "Off the league table · SPP, injuries and the treasury count");

  const recent = dialog.querySelector(".g-sheet__body .g-challenge__recent");
  assert.equal(words(recent.querySelector(".g-challenge__recentlabel")), "Recent:");
  assert.deepEqual(recent.querySelectorAll(".g-challenge__chip").map((chip) => [chip.tagName, chip.getAttribute("data-friendly-pick"), chip.getAttribute("aria-pressed"),
    words(chip.querySelector(".g-challenge__letter")), words(chip.querySelector(".g-challenge__chiplogin"))]), [
    ["BUTTON", "u5", "false", "O", "orc_boss"], ["BUTTON", "u7", "true", "T", "thalion"], ["BUTTON", "u8", "false", "S", "stonebeard"],
  ]);
  assert.equal(recent.querySelector('[role="radio"]'), null, "the chips are toggles, not the radio group's items");
  assert.equal(recent.closest(".g-challenge__group"), null, "outside the radio group: its arrows do not walk them");

  const groups = dialog.querySelectorAll(".g-challenge__group");
  assert.equal(groups.length, 1);
  assert.deepEqual([groups[0].getAttribute("role"), groups[0].getAttribute("aria-label")], ["radiogroup", "Opponent"]);
  assert.deepEqual(all(dialog, ".g-challenge__caption"), ["Other coaches · 4"]);
  assert.deepEqual(radios(groups[0]), [["u6", "false", "0", null], ["u9", "false", "-1", null], ["u10", "false", "-1", "true"], ["u11", "false", "-1", null]],
    "the chosen coach is a chip: the list's tab stop is its first free row");

  const row = dialog.querySelector(".g-sheet__body .g-challenge__with");
  assert.equal(words(row.querySelector(".g-challenge__label")), "Challenging with");
  assert.deepEqual(radios(row.querySelector(".g-challenge__teams")), [["t1", "true", "0", null], ["t2", "false", "-1", null]]);

  const foot = dialog.querySelector(".g-sheet__foot");
  assert.equal(foot.querySelector("[data-friendly-team]"), null, "the team is chosen in the body");
  assert.deepEqual(foot.querySelectorAll("p, button").map((node) => [node.getAttribute("class"), words(node)]), [
    ["g-challenge__summary", "thalion chooses a team on accepting the challenge. You play: Ashgrove Wardens."],
    ["g-btn", "Cancel"],
    ["g-btn g-btn--primary", "Challenge thalion"],
  ]);
  assert.equal(foot.querySelector('[data-sheet-close]').textContent, "Cancel", "«Cancel» closes the window");

  const busy = send({ payload: { challenges: [challenge("c3", ME, THALION, T1, TODAY("11"))], opponents: OPPONENTS } }, { phone: false });
  const chip = busy.querySelector('.g-challenge__chip[data-friendly-pick="u7"]');
  assert.deepEqual([chip.getAttribute("aria-disabled"), chip.getAttribute("aria-pressed"), words(chip.querySelector(".g-challenge__busy"))], ["true", "false", "Challenge sent"],
    "a busy coach among the recent: his chip says why and chooses nothing");
});

test("while searching: found and nothing else; nobody found says so; a long login and long team names wrap", () => {
  for (const phone of [true, false]) {
    const found = send({ query: "raid" }, { phone });
    assert.deepEqual(all(found, ".g-challenge__caption"), ["Found · 2"], "«Recent» hidden while searching");
    assert.equal(found.querySelector(".g-challenge__recent"), null);
    assert.deepEqual(found.querySelectorAll(".g-challenge__group [data-friendly-pick]").map((row) => row.getAttribute("data-friendly-pick")), ["u9", "u5"]);
    assert.equal(found.querySelector("#friendly-search").getAttribute("value"), "raid");
    const clear = found.querySelector(".g-challenge__search [data-friendly-clear]");
    assert.deepEqual([clear.tagName, clear.getAttribute("type"), clear.getAttribute("aria-label")], ["BUTTON", "button", "Clear"]);
    assert.ok(clear.querySelector("svg.g-icon"));

    const nobody = send({ query: "zzz" }, { phone });
    assert.deepEqual(all(nobody, ".g-challenge__caption"), ["Found · 0"]);
    assert.equal(words(nobody.querySelector(".g-challenge__nobody")), "Nobody found. A coach with at least one team can be challenged.");
    assert.equal(nobody.querySelector(".g-challenge__group"), null, "no radio group with nothing in it");
    assert.equal(nobody.querySelector("[data-friendly-challenge]").hasAttribute("disabled"), true);

    const empty = send({ payload: { challenges: [], opponents: [] }, games: [] }, { phone });
    assert.deepEqual(all(empty, ".g-challenge__caption"), ["Other coaches · 0"]);
    assert.ok(empty.querySelector(".g-challenge__nobody"), "no coach at all says the same");

    const allRecent = send({ payload: { challenges: [], opponents: [ORC_BOSS, THALION] } }, { phone });
    assert.deepEqual(all(allRecent, ".g-challenge__caption"), phone ? ["Recent opponents"] : [], "no «Other coaches · 0» under coaches who are all recent");
    assert.equal(allRecent.querySelector(".g-challenge__nobody"), null);
  }
  initLocale("ru");
  try {
    const ru = send({ query: "  RAID " });
    assert.deepEqual(all(ru, ".g-challenge__caption"), ["Найдено · 2"]);
    assert.equal(words(send({ query: "zzz" }).querySelector(".g-challenge__nobody")), "Никого не нашли. Вызвать можно тренера, у которого есть хотя бы одна команда.");
  } finally {
    initLocale("en");
  }

  const long = "x".repeat(60);
  const wide = coach("u12", long, [["w1", `${"Ashgrove".repeat(6)} Wardens`, "teams/human"], ["w2", "Iron".repeat(15), "teams/orc"]]);
  const fragment = send({ payload: { challenges: [], opponents: [wide] }, games: [], chosenId: "u12", teams: [T1, { ...T2, name: "Anji".repeat(15) }] });
  assert.equal(words(fragment.querySelector(".g-challenge__login")), long);
  const css = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /ellipsis|text-overflow|line-clamp|nowrap/, "no «…»: long names wrap");
  for (const selector of [".g-challenge__login", ".g-challenge__line", ".g-challenge__team", ".g-challenge__chip", ".g-challenge__summary",
    ".g-challenge__single", ".g-challenge__title", ".g-challenge__optname", ".g-challenge__optline", ".g-challenge-send .g-sheet__foot .g-btn--primary"]) {
    assert.ok(valuesOf(CSS, selector, "overflow-wrap").includes("anywhere"), `${selector} wraps`);
  }
});

test("the search's keyboard ring goes round its box, «Clear» inside it, not round the input alone", () => {
  assert.deepEqual(valuesOf(CSS, ".g-challenge__search:has(.g-search__input:focus-visible)", "outline"), ["3px solid var(--accent-text)"]);
  assert.deepEqual(valuesOf(CSS, ".g-challenge__search:has(.g-search__input:focus-visible)", "outline-offset"), ["0"]);
  assert.deepEqual(valuesOf(CSS, ".g-challenge__search .g-search__input:focus-visible", "outline"), ["none"]);
  assert.deepEqual(valuesOf("src/ui/base.css", ":where(:focus-visible)", "outline"), ["3px solid var(--accent-text)"], "base.css's ring");
});

test("the accept's body: ChallengeAccept.html's 16 to a phone, the window's 24 from 901px, on the edge of its head and foot", () => {
  assert.deepEqual(valuesOf(CSS, ".g-challenge-accept .g-sheet__body", "gap"), ["var(--space-14)"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-challenge-accept .g-sheet__body", "padding"), ["var(--space-10) var(--space-16) var(--space-12)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-challenge-accept .g-sheet__body", "padding"), ["var(--space-16) var(--space-24) var(--space-12)"]);
  assert.deepEqual(inMedia("src/ui/sheet.css", "min-width: 901px", ".g-sheet__head", "padding"), ["var(--space-20) var(--space-24) var(--space-16)"], "the window's head, 24 in");
});

test("one team is a line, not a group", () => {
  for (const phone of [true, false]) {
    const fragment = send({ teams: [T1], chosenId: "u7" }, { phone });
    assert.equal(fragment.querySelector(".g-challenge__teams"), null);
    assert.equal(fragment.querySelector("[data-friendly-team]"), null);
    const line = fragment.querySelector(".g-challenge__single");
    assert.equal(words(line), "Challenging with Ashgrove Wardens");
    assert.ok(line.closest(phone ? ".g-sheet__foot" : ".g-sheet__body"), phone ? "in a phone's foot" : "in a desk's body");
    assert.equal(fragment.querySelectorAll('[role="radiogroup"]').length, 1, "the opponents' group alone");
  }
});

test("a refusal is said in the sheet as an alert; a coach the address names who cannot be challenged is said over the list", () => {
  for (const phone of [true, false]) {
    const refused = send({ chosenId: "u7" }, { phone, refusal: "Challenge already sent" });
    const alert = refused.querySelector('.g-sheet__body [role="alert"]');
    assert.deepEqual([alert.getAttribute("class"), words(alert)], ["g-challenge__refusal", "Challenge already sent"]);
    assert.ok(alert.closest(".g-challenge__top"), "beside the search, where the list's scroll does not take it away");
    assert.equal(send({}, { phone }).querySelector('[role="alert"]'), null, "nothing refused, nothing said");

    const unknown = send({ presetId: "zz", chosenId: "zz" }, { phone });
    assert.equal(words(unknown.querySelector(".g-challenge__top .g-challenge__note")), "This coach cannot be challenged: a coach with at least one team can be.");
    assert.equal(unknown.querySelector('[role="radio"][aria-checked="true"][data-friendly-pick]'), null);
    assert.equal(send({ presetId: "u7", chosenId: "u7" }, { phone }).querySelector(".g-challenge__note"), null);

    const { fragment } = accept({}, { phone, refusal: "The challenge is closed" });
    const said = fragment.querySelector(`#${ACCEPT_SHEET} .g-sheet__body [role="alert"]`);
    assert.deepEqual([said.getAttribute("class"), words(said)], ["g-challenge__refusal", "The challenge is closed"]);
    assert.equal(accept({}, { phone }).fragment.querySelector('[role="alert"]'), null);
  }
});

test("a write on its way: the sheet's button says so and takes no second press", () => {
  for (const phone of [true, false]) {
    const sending = send({ chosenId: "u7" }, { phone, busy: true }).querySelector("[data-friendly-challenge]");
    assert.deepEqual([sending.getAttribute("aria-busy"), sending.getAttribute("aria-disabled"), sending.hasAttribute("disabled")], ["true", "true", false],
      "busy, not disabled: the focus stays on it");
    assert.equal(send({ chosenId: "u7" }, { phone }).querySelector("[data-friendly-challenge]").hasAttribute("aria-busy"), false);
    const accepting = accept({}, { phone, busy: true }).fragment.querySelector("[data-friendly-confirm]");
    assert.deepEqual([accepting.getAttribute("aria-busy"), accepting.hasAttribute("disabled")], ["true", false]);
  }
});

test("the accept sheet: the challenger, the coach's teams as one radio group, the note, the button", () => {
  for (const phone of [true, false]) {
    const { model, fragment } = accept({}, { phone });
    const dialog = fragment.querySelector(`dialog#${ACCEPT_SHEET}`);
    assert.equal(ACCEPT_SHEET, "friendly-accept");
    assert.ok(dialog.matches(".g-sheet.g-challenge-accept"));
    assert.equal(words(dialog.querySelector("h2.g-sheet__title")), "Accept the challenge");
    const card = dialog.querySelector(".g-sheet__body .g-challenge__card");
    assert.deepEqual([words(card.querySelector(".g-challenge__letter")), words(card.querySelector(".g-challenge__title")), words(card.querySelector(".g-challenge__line"))],
      ["O", "orc_boss · Grimtusk Raiders", model.line]);
    assert.match(model.line, /^Orc · TV [\d,.]+k · Telegram @orc_boss$/);
    assert.equal(words(dialog.querySelector(".g-challenge__caption")), "Which team do you play");
    const group = dialog.querySelector(".g-challenge__own");
    assert.deepEqual([group.getAttribute("role"), group.getAttribute("aria-label")], ["radiogroup", "Which team do you play"]);
    assert.deepEqual(radios(group), [["t1", "true", "0", null], ["t2", "false", "-1", null]], "the page's team by default");
    assert.deepEqual(group.querySelectorAll("[data-friendly-own]").map((option) => [option.tagName, option.getAttribute("type"),
      words(option.querySelector(".g-challenge__optname")), words(option.querySelector(".g-challenge__optline"))]), model.options.map(({ name, line }) => ["BUTTON", "button", name, line]));
    assert.match(words(group.querySelector('[data-friendly-own="t1"] .g-challenge__optline')), /^Human · TV [\d,.]+k · in the season$/);
    assert.equal(words(dialog.querySelector(".g-challenge__any")), "Any of your teams can play, one not entered in the season too.");
    const cta = dialog.querySelector(".g-sheet__foot [data-friendly-confirm]");
    assert.deepEqual([words(cta), cta.getAttribute("class"), cta.hasAttribute("disabled")], ["Accept and go to the preparation", "g-btn g-btn--primary", false]);
  }
  const chosen = accept({ choiceId: "t2" }).fragment;
  assert.deepEqual(radios(chosen.querySelector(".g-challenge__own")), [["t1", "false", "-1", null], ["t2", "true", "0", null]]);
  const reading = accept({ sender: null }).fragment;
  assert.equal(words(reading.querySelector(".g-challenge__card .g-challenge__line")), "Orc", "while the team is read: the race alone");
  const raceless = acceptModel({ challenge: { ...OFFER, team: { id: "r1", name: "Grimtusk Raiders" } }, sender: null, teams: TEAMS, teamId: "t1" });
  assert.equal(mount(acceptSheetMarkup(raceless, {})).querySelector(".g-challenge__card .g-challenge__line"), null, "no line with nothing in it");
  const none = accept({ teams: [] }).fragment;
  assert.equal(none.querySelector("[data-friendly-confirm]").hasAttribute("disabled"), true, "no team to play: nothing to accept with");
});

test("names are text", () => {
  const hostile = coach("u12", HOSTILE, [["h1", HOSTILE, "teams/orc"]]);
  const own = { ...T1, name: HOSTILE };
  const games = [{ ...met("g9", hostile, TODAY("11")), home: { user: named(ME), team: teamOf(own) } }];
  for (const phone of [true, false]) {
    for (const over of [{ chosenId: "u12" }, { query: HOSTILE }]) {
      const fragment = send({ payload: { challenges: [], opponents: [hostile, AMAZONA] }, games, teams: [own, T2], ...over }, { phone, refusal: HOSTILE });
      assertCspSafe(fragment);
      assert.equal(fragment.querySelector("img"), null);
      assert.equal(fragment.querySelector(".g-challenge__login, .g-challenge__chiplogin").textContent, HOSTILE);
      assert.equal(fragment.querySelector('[data-friendly-team="t1"]').textContent, HOSTILE);
      assert.equal(fragment.querySelector(".g-challenge__refusal").textContent, HOSTILE);
    }
    assert.equal(send({ payload: { challenges: [], opponents: [hostile] }, games: [], query: HOSTILE }, { phone }).querySelector("#friendly-search").getAttribute("value"), HOSTILE);
    const offer = challenge("c9", hostile, ME, hostile.teams[0], TODAY("08"));
    const { fragment } = accept({ challenge: offer, sender: { user: { id: "u12", login: HOSTILE, telegram: HOSTILE }, team: { ...teamOf(hostile.teams[0]), roster: roster() } }, teams: [own, T2] }, { phone, refusal: HOSTILE });
    assertCspSafe(fragment);
    assert.equal(fragment.querySelector("img"), null);
    assert.ok(fragment.querySelector(".g-challenge__title").textContent.startsWith(HOSTILE));
    assert.ok(fragment.querySelector(".g-challenge__line").textContent.endsWith(HOSTILE));
    assert.equal(fragment.querySelector('[data-friendly-own="t1"] .g-challenge__optname').textContent, HOSTILE);
  }
});

test("styled", () => {
  const SHEETS = [CSS, "sheet.css", "button.css", "search-field.css"];
  for (const phone of [true, false]) {
    for (const over of [{ chosenId: "u7" }, { query: "raid" }, { query: "zzz" }, { teams: [T1] }, { presetId: "zz" },
      { payload: { challenges: [challenge("c3", ME, THALION, T1, TODAY("11"))], opponents: OPPONENTS } }]) {
      assertStyled(send(over, { phone, refusal: "Refused", busy: true }), ...SHEETS);
    }
    assertStyled(accept({}, { phone, refusal: "Refused", busy: true }).fragment, ...SHEETS);
  }
  // The order of the stage's sheets, not the end of the file: a stage merged later appends its sheets after them.
  const styles = text("src/styles.css");
  const at = (file) => styles.indexOf(`@import url("${file}");`);
  assert.ok(at("screens/matches/challenges-sheets.css") > at("screens/matches/challenges.css"), "after the page's sheet");
  assert.ok(at("screens/matches/challenges.css") > 0);
  assert.ok(at("screens/matches/challenges-sheets.css") > styles.lastIndexOf('@import url("ui/'), "after ui/sheet.css, which it overrides");
  const css = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /@media \((?!max-width: 900px|min-width: 901px)/, "the 900/901 breakpoints only");
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b|rgba?\(/i, "colours are tokens");
  assert.deepEqual(inMedia(CSS, "max-width: 900px", "dialog.g-sheet.g-challenge-send", "height"), ["92dvh"], "ChallengeSend.html's 92%");
  assert.deepEqual(inMedia(CSS, "max-width: 900px", "dialog.g-sheet.g-challenge-send", "max-height"), ["92dvh"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", "dialog.g-sheet.g-challenge-accept", "max-height"), ["88dvh"], "ChallengeAccept.html's 88%");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", "dialog.g-sheet.g-challenge-send", "width"), ["min(760px, calc(100% - 32px))"], "DeskChallenges.html's 760");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-challenge-send .g-sheet__title", "font-size"), ["28px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-challenge__group", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"], "two columns");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-challenge__group", "max-height"), ["300px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-challenge__group", "overflow-y"), ["auto"]);
  assert.deepEqual(valuesOf(CSS, ".g-challenge__teams", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"], "the team's segments, two to a row");
  assert.deepEqual(valuesOf(CSS, '.g-challenge__team[aria-checked="true"]', "box-shadow"), ["var(--shadow-thumb)"], "the segment's lift");
  assert.deepEqual(valuesOf(CSS, '.g-challenge__row[aria-checked="true"]', "background"), ["var(--accent-tint-soft)"]);
  assert.deepEqual(valuesOf(CSS, '.g-challenge__row[aria-checked="true"]', "box-shadow"), ["var(--ring-selected)"]);
  assert.deepEqual(valuesOf(CSS, '.g-challenge__row[aria-checked="true"] .g-challenge__radio', "box-shadow"), ["inset 0 0 0 6px var(--accent)"]);
  assert.deepEqual(valuesOf(CSS, '.g-challenge__option[aria-checked="true"]', "box-shadow"), ["var(--ring-selected)"]);
  assert.deepEqual(valuesOf("src/ui/button.css", ".g-btn--primary:disabled", "background"), ["var(--disabled)"], "a closed button greyed, its label whole");
});

test("readable: the muted words, the chip, the refusal, on what they sit in every palette", () => {
  for (const selector of [".g-challenge__line", ".g-challenge__caption", ".g-challenge__summary", ".g-challenge__note", ".g-challenge__nobody",
    ".g-challenge__label", ".g-challenge__recentlabel", ".g-challenge__optline", ".g-challenge__any", ".g-challenge__single", ".g-challenge__clear"]) {
    assert.deepEqual(valuesOf(CSS, selector, "color"), ["var(--muted)"], selector);
  }
  assertContrast("--muted", ["--surface", "--surface-2", "--accent-tint-soft"], 4.5);
  assert.deepEqual([valuesOf(CSS, ".g-challenge__busy", "background"), valuesOf(CSS, ".g-challenge__busy", "color")], [["var(--warn-tint)"], ["var(--on-warn-tint)"]]);
  assertContrast("--on-warn-tint", ["--warn-tint"], 4.5);
  assert.deepEqual([valuesOf(CSS, ".g-challenge__refusal", "background"), valuesOf(CSS, ".g-challenge__refusal", "color")], [["var(--danger-tint)"], ["var(--on-danger-tint)"]]);
  assertContrast("--on-danger-tint", ["--danger-tint"], 4.5);
  assert.deepEqual(valuesOf(CSS, ".g-challenge__letter", "background"), ["var(--header)"]);
  assert.deepEqual(valuesOf(CSS, ".g-challenge__letter", "color"), ["var(--header-ink)"]);
  assertContrast("--header-ink", ["--header"], 4.5);
  assertContrast("--ink", ["--seg-on", "--surface-3", "--accent-tint-soft"], 4.5);
});

test("D2: 44 to a thumb, the prototypes' values from 901px and never under 24, 60 a coach's row, 56 a team to play", () => {
  const px = (value) => Number(String(value).replace("px", ""));
  const phoneOf = (selector) => px(inMedia(CSS, "max-width: 900px", selector, "min-height").at(-1) ?? valuesOf(CSS, selector, "min-height")[0]);
  const deskOf = (selector) => px(inMedia(CSS, "min-width: 901px", selector, "min-height").at(-1) ?? valuesOf(CSS, selector, "min-height")[0]);
  const phone = { ".g-challenge__row": 60, ".g-challenge__clear": 44, ".g-challenge__team": 44, ".g-challenge__option": 56,
    ".g-challenge-send .g-sheet__foot .g-btn--primary": 52, ".g-challenge-accept .g-sheet__foot .g-btn--primary": 48 };
  for (const [selector, size] of Object.entries(phone)) assert.equal(phoneOf(selector), size, `${selector}: ${size} up to 900px`);
  const desk = { ".g-challenge__row": 60, ".g-challenge__clear": 36, ".g-challenge__team": 38, ".g-challenge__chip": 36, ".g-challenge__option": 56,
    ".g-challenge-send .g-sheet__foot .g-btn--primary": 48, ".g-challenge-send .g-sheet__foot .g-btn": 48, ".g-challenge-accept .g-sheet__foot .g-btn--primary": 48 };
  for (const [selector, size] of Object.entries(desk)) {
    assert.equal(deskOf(selector), size, `${selector}: the prototype's ${size} from 901px`);
    assert.ok(size >= 24);
  }
  // The close: sheet.css's 44 to a thumb, DeskChallenges.html's 40 from 901px.
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-challenge-send .g-sheet__head .g-icon-btn", "height"), ["40px"]);
  assert.deepEqual(valuesOf("src/ui/button.css", ".g-icon-btn", "height"), ["var(--size-touch)"]);
  assert.doesNotMatch(mediaText(CSS, "max-width: 900px"), /min-height: (?:[0-3]\d|4[0-3])px|height: (?:[0-3]\d|4[0-3])px/, "nothing under 44 up to 900px");
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/matches/challenges-sheets.mjs");
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  const friendly = (words) => Object.keys(words).filter((key) => key.startsWith("friendly."));
  assert.deepEqual(friendly(en), friendly(ru), "the same keys in the same order");
  for (const key of ["friendly.sheetTitle", "friendly.sheetTitleDesk", "friendly.sheetSubDesk", "friendly.search", "friendly.searchPlaceholder", "friendly.clear",
    "friendly.opponentGroup", "friendly.recent", "friendly.recentDesk", "friendly.nobody", "friendly.busy", "friendly.withTeamLabel", "friendly.acceptTitle",
    "friendly.whichTeam", "friendly.anyTeam"]) {
    assert.ok(en[key] && ru[key], key);
  }
  assert.equal(ru["friendly.busy"], "Вызов отправлен", "neutral: no participle with a gender");
});
