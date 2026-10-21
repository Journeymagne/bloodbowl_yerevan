import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { initLocale, t } from "../src/core/i18n.mjs";
import { formatMoney } from "../src/core/format.mjs";
import { matchPreview, BEFORE_GETS } from "../src/domain/match/preview.mjs";
import {
  BEFORE_SHEET_ID, beforeFigures, beforeSheetMarkup, beforeTitle, closeBeforeSheet, openBeforeSheet,
} from "../src/screens/matches/before.mjs";
import { absenceWords } from "../src/screens/team/roster/panel.mjs";

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const BEFORE_CSS = "src/screens/matches/before.css";

/** Players `[rowIndex, …]` of a race, numbered from 1, with what each `marks` says on top. */
const players = (prefix, rows, marks = {}) => rows.map((rowIndex, index) => ({
  id: `${prefix}-${index + 1}`, rowIndex, number: String(index + 1), name: `${prefix} ${index + 1}`, ...marks[index],
}));
const source = (id, name, slug, roster, treasury = 70) => ({ user: { id: `u-${id}`, login: id },
  team: { id, name, baseTeamSlug: slug, revision: 1, roster: { players: roster, treasury } } });

// Ours: 12 humans, J. Corr (#9) out, so 11 linemen in the lineup: 550k. Theirs: 13 humans, two out, 10 linemen and an Ogre: 640k.
const OURS = players("ash", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { 8: { name: "J. Corr", skipNextGame: true, absence: { code: "miss" } } });
const THEIRS = players("sil", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0], {
  3: { name: "Elriel", skipNextGame: true, absence: { code: "niggling" } },
  6: { name: "Thalion", skipNextGame: true, absence: { code: "other", note: "Disqualified" } },
});
const ash = (roster = OURS, treasury = 70) => source("t1", "Ashgrove Wardens", "teams/human", roster, treasury);
const silver = (roster = THEIRS, treasury = 120) => source("r1", "Silverbrook Rangers", "teams/human", roster, treasury);
const ROUND_7 = { id: "g1", kind: "league", roundNumber: 7 };
const FRIENDLY = { id: "gf", kind: "friendly", roundNumber: null };

const PLUS = matchPreview({ own: ash(), other: silver() }, data);
const MINUS = matchPreview({ own: silver(THEIRS, 70), other: ash() }, data);
const EVEN = matchPreview({ own: ash(), other: source("r2", "Karak Hold Hammers", "teams/human", OURS) }, data);
const GNOMES = players("gn", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const ELEVEN = players("hu", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const OUR_BONUS = matchPreview({ own: source("g", "Gnome Glade", "teams/gnome", GNOMES), other: source("h", "Humans", "teams/human", ELEVEN) }, data);
// Nobody out on our side: seven humans, 350k against the rival's 640k.
const ALL_IN = matchPreview({ own: ash(players("x", [0, 0, 0, 0, 0, 0, 0])), other: silver() }, data);
const THEIR_BONUS = matchPreview({ own: source("h", "Humans", "teams/human", ELEVEN), other: source("g", "Gnome Glade", "teams/gnome", GNOMES) }, data);

const sheetOf = (preview, game = ROUND_7) => mount(beforeSheetMarkup({ preview, game }));
const textOf = (fragment, selector) => fragment.querySelector(selector)?.textContent ?? null;
const all = (fragment, selector) => fragment.querySelectorAll(selector).map((node) => node.textContent);
const linesOf = (fragment) => fragment.querySelectorAll(".g-before__line").map((line) => [line.querySelector("dt").textContent, line.querySelector("dd").textContent]);

test("the sheet says who gets the inducements and why: CTV against CTV, the amount, the lineups", () => {
  assert.deepEqual([PLUS.gets, PLUS.difference, PLUS.own.ctv, PLUS.other.ctv], ["own", 90, 550, 640], "the fixture is MatchesPrePlus.html's case");
  const sheet = sheetOf(PLUS);
  const dialog = sheet.querySelector(`dialog#${BEFORE_SHEET_ID}`);
  assert.ok(dialog.classList.contains("g-before-sheet") && dialog.classList.contains("g-sheet--wide"));
  assert.equal(textOf(sheet, ".g-sheet__title"), "Before the match · Round\u00a07");
  assert.equal(beforeTitle(FRIENDLY), "Before the match · Friendly");
  assert.ok(sheet.querySelector(".g-before__hero--gets"));
  assert.equal(textOf(sheet, ".g-before__amount"), formatMoney(90));
  assert.equal(textOf(sheet, ".g-before__to"), "inducements to us");
  assert.deepEqual(all(sheet, ".g-before__name"), ["Ashgrove Wardens", "Silverbrook Rangers"]);
  assert.equal(textOf(sheet, ".g-before__side--other .g-before__name"), "Silverbrook Rangers", "the opponent stands at the right");
  assert.deepEqual(all(sheet, ".g-before__ctv"), [formatMoney(550), formatMoney(640)]);
  assert.deepEqual(all(sheet, ".g-before__lineup"), ["In the lineup 11 of 12", "In the lineup 11 of 13"]);
  assert.ok(sheetOf(MINUS).querySelector(".g-before__hero--pays"));
  assert.equal(textOf(sheetOf(MINUS), ".g-before__to"), "inducements to the opponent");
  assert.ok(sheetOf(EVEN).querySelector(".g-before__hero--even"));
  assert.deepEqual([textOf(sheetOf(EVEN), ".g-before__amount"), textOf(sheetOf(EVEN), ".g-before__to")], ["0", "CTVs equal — no inducements"]);
});

test("who misses the match, on each side, with why and when back", () => {
  const sheet = sheetOf(PLUS);
  const ours = sheet.querySelectorAll(".g-before__col")[0].querySelectorAll(".g-before__miss");
  assert.equal(ours.length, 1);
  assert.deepEqual(["who", "pos", "why", "back"].map((part) => ours[0].querySelector(`.g-before__${part}`).textContent),
    ["#9 J. Corr", "Human Lineman", "Seriously Hurt", "back for round 8"]);
  const theirs = sheet.querySelectorAll(".g-before__col--other .g-before__miss");
  assert.deepEqual(theirs.map((item) => item.querySelector(".g-before__who").textContent), ["Elriel #4", "Thalion #7"], "the opponent's name first, at the right (L19)");
  assert.deepEqual(theirs.map((item) => item.querySelector(".g-before__why").textContent), ["Serious Injury", "Disqualified"]);
  assert.equal(sheet.querySelector(".g-before__col--other .g-before__list").getAttribute("aria-label"), "Silverbrook Rangers");
  assert.equal(textOf(sheetOf(PLUS, FRIENDLY), ".g-before__back"), "back for the next match");
  // A season's retirement says so once: its words are the reason, and there is no line of when back (L25).
  const retired = matchPreview({ own: ash(players("ash", [0, 0, 0, 0, 0, 0, 0], { 2: { name: "Old Hob", temporarilyRetired: true } })), other: silver() }, data);
  const item = sheetOf(retired).querySelector(".g-before__miss");
  assert.equal(item.querySelector(".g-before__why").textContent, "Temporarily retired for the season");
  assert.equal(item.querySelector(".g-before__back"), null);
  const none = sheetOf(ALL_IN);
  assert.equal(textOf(none, ".g-before__col .g-before__none"), "No one misses it");
  assert.equal(none.querySelectorAll(".g-before__col--other .g-before__miss").length, 2);
  assert.equal(textOf(sheetOf(MINUS), ".g-before__col--other .g-before__who"), "J. Corr #9");
});

test("the budget lines are the preview's", () => {
  assert.deepEqual(linesOf(sheetOf(PLUS)), [["Petty cash · the CTV difference", "90k"], ["Tier bonus", "0k"], ["From the treasury, on top", "up to 50k"]]);
  assert.equal(textOf(sheetOf(PLUS), ".g-before__note"), t("matches.before.note.own"));
  assert.deepEqual(linesOf(sheetOf(MINUS)), [["Petty cash", "0k"], ["Tier bonus", "0k"], ["From the treasury", "the whole treasury · 70k"]]);
  assert.equal(textOf(sheetOf(MINUS), ".g-before__note"), t("matches.before.note.other"));
  assert.deepEqual(linesOf(sheetOf(EVEN)), [["Petty cash", "0k"], ["From the treasury", "not allowed · CTVs equal"]]);
  assert.equal(textOf(sheetOf(EVEN), ".g-before__note"), t("matches.before.note.even"));
  const shop = sheetOf(PLUS).querySelector(".g-before__shop");
  assert.deepEqual([shop.getAttribute("href"), shop.textContent], ["#/ref/inducements", "What inducements can buy"]);
  // A match begun: the start settled the treasury, and the saved team holds what is left of it (the final review, m-2).
  const begun = { ...ROUND_7, preparationStatus: "in_progress" };
  assert.deepEqual(linesOf(sheetOf(PLUS, begun)).at(-1), ["From the treasury", "settled at the start"]);
  assert.deepEqual(linesOf(sheetOf(MINUS, begun)).at(-1), ["From the treasury", "settled at the start"]);
  assert.deepEqual(linesOf(sheetOf(EVEN, begun)).at(-1), ["From the treasury", "not allowed · CTVs equal"], "a rule, not a figure");
});

test("with equal CTVs and a tier bonus the sheet does not say there are no inducements", () => {
  assert.deepEqual([OUR_BONUS.gets, OUR_BONUS.bonus.own], ["even", 200]);
  const ours = sheetOf(OUR_BONUS);
  assert.equal(textOf(ours, ".g-before__to"), "CTVs equal");
  assert.doesNotMatch(ours.textContent, /no inducements/);
  assert.deepEqual(linesOf(ours), [["Petty cash", "0k"], ["Tier bonus", "200k"], ["From the treasury", "not allowed · CTVs equal"]]);
  assert.equal(textOf(ours, ".g-before__note"), t("matches.before.noteEvenBonus"));
  // The opponent's bonus at equal CTVs: still no «no inducements», and the bonus is named (L8).
  const theirs = sheetOf(THEIR_BONUS);
  assert.equal(textOf(theirs, ".g-before__to"), "CTVs equal");
  assert.doesNotMatch(theirs.textContent, /no inducements/);
  assert.deepEqual(linesOf(theirs), [["Petty cash", "0k"], ["The opponent's tier bonus", "200k"], ["From the treasury", "not allowed · CTVs equal"]]);
  assert.equal(textOf(theirs, ".g-before__note"), t("matches.before.noteEvenBonus"));
});

test("the tile, the line and the bubbles say the same as the sheet", () => {
  const plus = beforeFigures(PLUS), minus = beforeFigures(MINUS), even = beforeFigures(EVEN);
  assert.deepEqual(plus.tile, { who: "we get them", amount: "+90k", tone: "gets" });
  assert.deepEqual(minus.tile, { who: "the opponent's", amount: "−90k", tone: "pays" });
  assert.deepEqual(even.tile, { who: "CTVs equal", amount: "0", tone: "even" });
  // English keeps the injury's name as it is written (the fix wave's parked 6); a shared reason is said once (G4).
  assert.deepEqual(plus.miss, { lead: "Out:", parts: [{ name: "J. Corr", why: "Seriously Hurt" }] });
  assert.deepEqual(minus.miss, { lead: "Out:", parts: [{ name: "Elriel", why: "Serious Injury" }, { name: "Thalion", why: "Disqualified" }] });
  const shared = matchPreview({ own: ash(players("x", [0, 0, 0, 0, 0, 0, 0, 0], {
    0: { name: "Nod", skipNextGame: true, absence: { code: "miss" } }, 1: { name: "Rue", skipNextGame: true, absence: { code: "miss" } },
  })), other: silver() }, data);
  assert.deepEqual(beforeFigures(shared).miss.parts, [{ name: "Nod, Rue", why: "Seriously Hurt" }]);
  assert.deepEqual(beforeFigures(ALL_IN).miss, { lead: "Lineup:", parts: [{ name: "all in", why: "" }] });
  assert.equal(plus.missText, "missing the match: 3");
  assert.equal(beforeFigures(OUR_BONUS).missText, "Everyone is in the lineup");
  assert.deepEqual(plus.bubble, { gets: "own", text: "+90k for inducements" });
  assert.deepEqual(minus.bubble, { gets: "other", text: "+90k for inducements" });
  assert.deepEqual(even.bubble, { gets: null, text: "" }, "no side gets it: no bubble (L29)");
  // Each player his own reason when they differ (G4: one was suspended, the other hurt).
  const two = matchPreview({ own: ash(players("x", [0, 0, 0, 0, 0, 0, 0, 0], {
    0: { name: "Nod", skipNextGame: true, absence: { code: "lasting", stat: "ag" } },
    1: { name: "Rue", skipNextGame: true, absence: { code: "other", note: "Suspended by the league" } },
  })), other: silver() }, data);
  assert.deepEqual(beforeFigures(two).miss.parts, [{ name: "Nod", why: "Lasting Injury (AG)" }, { name: "Rue", why: "Suspended by the league" }]);
  // In Russian only the first letter is made small: a coach's note, or a characteristic, stays as written (L25).
  initLocale("ru");
  try {
    const small = (words) => words.charAt(0).toLocaleLowerCase() + words.slice(1);
    const why = beforeFigures(two).miss.parts.map((part) => part.why);
    assert.deepEqual(why, two.own.missing.map((player) => small(absenceWords(player))));
    assert.equal(why[1], "suspended by the league", "a coach's note keeps the rest as written");
    assert.notEqual(why[0], absenceWords(two.own.missing[0]), "the first letter is made small");
  } finally {
    initLocale("en");
  }
});

test("the sheet opens over the page, gives the focus back on close, and goes with the screen", () => {
  mount('<main><button type="button" id="opener">+90k for inducements</button></main>');
  const button = document.querySelector("#opener");
  button.focus();
  openBeforeSheet(button, { preview: PLUS, game: ROUND_7 });
  const host = () => document.querySelector(`[data-sheet-host="${BEFORE_SHEET_ID}"]`);
  const dialog = () => host()?.querySelector(`dialog#${BEFORE_SHEET_ID}`) ?? null;
  assert.equal(host().parentNode, document.body);
  assert.ok(dialog().open && dialog().matches(":modal"));
  // A browser takes the focus into the modal: the test puts it there.
  dialog().querySelector("[data-sheet-close]").focus();
  assert.notEqual(document.activeElement, button);
  fireEvent(dialog(), "keydown", { key: "Escape" });
  assert.equal(dialog(), null);
  assert.equal(document.activeElement, button);
  // Opened again: the same host, one for the page; and the cross closes it the same way.
  openBeforeSheet(button, { preview: MINUS, game: ROUND_7 });
  assert.equal(document.querySelectorAll(`[data-sheet-host="${BEFORE_SHEET_ID}"]`).length, 1);
  assert.ok(dialog().querySelector(".g-before__hero--pays"));
  dialog().querySelector("[data-sheet-close]").focus();
  fireEvent(dialog().querySelector("[data-sheet-close]"), "click");
  assert.equal(dialog(), null);
  assert.equal(document.activeElement, button);
  // A page that took the host off the body (a test's mount, a screen that emptied the body) gets it back.
  mount('<main><button type="button" id="again">missing the match: 3</button></main>');
  openBeforeSheet(document.querySelector("#again"), { preview: PLUS, game: ROUND_7 });
  assert.ok(dialog().open);
  closeBeforeSheet();
  assert.equal(host(), null);
  closeBeforeSheet();
  assert.equal(host(), null, "twice is the same");
});

test("names are text", () => {
  const hostile = matchPreview({
    own: source("t1", HOSTILE, "teams/human", players("h", [0, 0, 0, 0, 0, 0, 0], { 1: { name: HOSTILE, skipNextGame: true, absence: { code: "other", note: HOSTILE } } })),
    other: source("r1", HOSTILE, "teams/human", OURS),
  }, data);
  const sheet = sheetOf(hostile);
  assertCspSafe(sheet);
  assert.equal(sheet.querySelector("img"), null);
  assert.equal(textOf(sheet, ".g-before__name"), HOSTILE);
  assert.equal(textOf(sheet, ".g-before__why"), HOSTILE);
});

test("every key in both dictionaries, the ones built from who gets the difference too", () => {
  assertDictionaryCovers("src/screens/matches/before.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const gets of BEFORE_GETS) {
      for (const key of [`matches.before.to.${gets}`, `matches.before.note.${gets}`, `matches.before.tileWho.${gets}`]) assert.ok(words[key], `${locale} ${key}`);
    }
  }
  assert.doesNotMatch(dictionary("ru")["matches.before.to.even"], /индусмент/);
});

test("styled as the prototypes draw it; readable; D2; nothing cut", () => {
  for (const preview of [PLUS, MINUS, EVEN, OUR_BONUS]) assertStyled(sheetOf(preview), BEFORE_CSS, "src/ui/sheet.css", "button.css");
  // White on the three backgrounds of the CTV block, the reason in red on the sheet, in every palette.
  assertReadable(BEFORE_CSS, ".g-before__hero", "color", ["--hero-gets", "--hero-pays", "--hero-even"], 4.5);
  assertReadable(BEFORE_CSS, ".g-before__why", "color", ["--surface"], 4.5);
  assertReadable(BEFORE_CSS, ".g-before__line dt", "color", ["--surface-2"], 4.5);
  assertReadable(BEFORE_CSS, ".g-before__shop", "color", ["--surface"], 4.5);
  // The prototypes' values.
  assert.deepEqual(valuesOf(BEFORE_CSS, ".g-before__hero--gets", "background"), ["linear-gradient(90deg, var(--hero-gets) 0 38%, var(--hero-pays) 62% 100%)"]);
  assert.deepEqual(valuesOf(BEFORE_CSS, ".g-before__hero--pays", "background"), ["linear-gradient(90deg, var(--hero-pays) 0 38%, var(--hero-gets) 62% 100%)"]);
  assert.deepEqual(valuesOf(BEFORE_CSS, ".g-before__teams", "grid-template-columns"), ["minmax(0, 1fr) auto minmax(0, 1fr)"]);
  assert.deepEqual(valuesOf(BEFORE_CSS, ".g-before__name", "font"), ["700 19px/1.05 var(--font-display)"]);
  assert.deepEqual(inMedia(BEFORE_CSS, "min-width: 901px", ".g-before__name", "font-size"), ["24px"]);
  assert.deepEqual(inMedia(BEFORE_CSS, "min-width: 901px", ".g-before-sheet .g-sheet__title", "font-size"), ["28px"]);
  assert.deepEqual(valuesOf(BEFORE_CSS, ".g-before__col--other", "border-left"), ["2px solid var(--line)"]);
  assert.deepEqual(valuesOf(BEFORE_CSS, ".g-before__budget", "background"), ["var(--surface-2)"]);
  assert.deepEqual(valuesOf(BEFORE_CSS, ".g-before__line dd", "white-space"), ["nowrap"]);
  // D2: the link is a thumb's up to 900px, never under 24px from 901px.
  assert.deepEqual(inMedia(BEFORE_CSS, "max-width: 900px", ".g-before__shop", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(inMedia(BEFORE_CSS, "min-width: 901px", ".g-before__shop", "min-height"), ["24px"]);
  assert.doesNotMatch(text(BEFORE_CSS).replace(/\/\*[\s\S]*?\*\//g, ""), /ellipsis|text-overflow|line-clamp/);
  assert.ok(text("src/styles.css").includes('@import url("screens/matches/before.css");'), "the sheet reaches the page");
});
