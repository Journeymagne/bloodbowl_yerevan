import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { patch } = await import("../src/core/dom.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { ledgerOf, onLedgerChange, readLedger } = await import("../src/data/treasury.mjs");
const { LEDGER_KINDS, MANUAL_REASONS } = await import("../src/domain/roster/ledger.mjs");
const { HISTORY_PREVIEW, historyExpanded, historyMarkup, ledgerLine, safeMarkup, wireHistory } = await import("../src/screens/team/manage/history.mjs");

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const [en, ru] = ["en", "ru"].map((locale) => JSON.parse(read(`src/i18n/${locale}.json`)));
const CSS = "src/screens/team/manage/manage.css";
const TOKEN = "gata-league-auth-token";
const DAY = "2026-10-18T12:00:00Z";
const SINCE = "2026-10-01T12:00:00Z";
const GAMES = [{ id: "g4", kind: "league", roundNumber: 3 }, { id: "g5", kind: "friendly", roundNumber: null }];

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const pageOf = (teamId, query = "limit=20") => `GET /api/teams/${teamId}/ledger?${query}`;

/** A line of the history as the server writes it. */
const line = (id, extra = {}) => ({ id, kind: "match_income", delta: 60, balanceAfter: 100, reason: null, note: null, pairingId: null, createdAt: DAY, ...extra });
/** `count` lines, newest first, numbered down from `top`. */
const lines = (count, top = count) => Array.from({ length: count }, (_, at) => line(`l${top - at}`, { delta: 10 + at }));
/** What `ledgerOf` holds for a team whose history was read (and, by `extra`, otherwise). */
const held = (extra = {}) => ({ entries: [], next: null, since: null, total: 0, loaded: true, loading: false, error: "", ...extra });

/** A coach signed in. */
function coach() {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = { id: "u1", login: "coach" };
}

// What a screen holds while it is up: the history drawn into the page and wired, taken away at the end of the test.
let unwire = () => {};
afterEach(() => {
  unwire();
  unwire = () => {};
  initLocale("en");
});

/** The history of `teamId` as the page holds it now, drawn; `draw` is also what the page does when it hears a change. */
function stand(teamId, { games = GAMES } = {}) {
  const draw = () => mount(historyMarkup({ teamId, ledger: ledgerOf(teamId), games, expanded: historyExpanded(teamId) }));
  draw();
  const offWire = wireHistory(document.body, teamId, draw);
  const offLedger = onLedgerChange(draw);
  unwire = () => {
    offWire();
    offLedger();
  };
  return draw;
}
const markup = (ledger, { expanded = false } = {}) => mount(historyMarkup({ teamId: "t0", ledger, games: GAMES, expanded }));
const rows = () => document.querySelectorAll("li.g-ledger__row");
const text = (selector) => document.querySelector(selector)?.textContent;
const click = (selector) => fireEvent(document.querySelector(selector), "click");

test("each kind of line says what it was, a hand-written one its reason and comment, a match line its round", () => {
  const words = (entry) => {
    const { title, note, amount, tone } = ledgerLine({ createdAt: DAY, ...entry }, GAMES);
    return [title, note, amount, tone];
  };
  assert.deepEqual(words({ kind: "manual", reason: "friendly", note: "vs Ratwharf", delta: 20 }), ["Friendly match", "vs Ratwharf", "+20k", "in"]);
  assert.deepEqual(words({ kind: "staff", delta: -10 }), ["Staff bought", "", "−10k", "out"], "the minus is U+2212");
  assert.deepEqual(words({ kind: "manual", reason: null, delta: 5 }).slice(0, 1), ["Treasury corrected by hand"]);
  assert.deepEqual(words({ kind: "manual", reason: null, note: undefined, delta: 5 }).slice(1), ["", "+5k", "in"]);
  assert.deepEqual(words({ kind: "admin", delta: -42.5 }), ["Changed by the administrator", "", "−42.5k", "out"]);

  const when = (entry) => ledgerLine({ createdAt: DAY, delta: 60, kind: "match_income", ...entry }, GAMES).when;
  assert.equal(when({}), "18 Oct");
  assert.equal(when({ pairingId: "g4" }), "18 Oct · round 3");
  assert.equal(when({ pairingId: "g5" }), "18 Oct · Friendly match");
  assert.equal(when({ pairingId: "gone" }), "18 Oct", "a game the page does not hold adds nothing");
  assert.equal(ledgerLine(line("l1", { pairingId: "g4" }), null).when, "18 Oct", "no games are no round");
  assert.equal(when({ pairingId: "g4", createdAt: null }), "— · round 3", "a line with no time is a dash, not a day of 1970");
  assert.equal(ledgerLine(line("l1", { pairingId: "g6" }), [{ id: "g6", kind: "league", roundNumber: 0 }]).when, "18 Oct", "a league game with no round has none to say");
});

test("every kind and every reason has its words in both dictionaries", () => {
  for (const kind of LEDGER_KINDS) {
    assert.ok(en[`treasury.kind.${kind}`], `en treasury.kind.${kind}`);
    assert.ok(ru[`treasury.kind.${kind}`], `ru treasury.kind.${kind}`);
    assert.equal(ledgerLine(line("l1", { kind, reason: null }), []).title, en[`treasury.kind.${kind}`]);
  }
  for (const reason of MANUAL_REASONS) {
    assert.ok(en[`treasury.reason.${reason}`], `en treasury.reason.${reason}`);
    assert.ok(ru[`treasury.reason.${reason}`], `ru treasury.reason.${reason}`);
    assert.equal(ledgerLine(line("l1", { kind: "manual", reason }), []).title, en[`treasury.reason.${reason}`]);
  }
});

test("three lines, then the whole history by its count, then more by pages", async () => {
  coach();
  // The cache is filled the way the page fills it: by a read, which the fake API answers.
  api.reply(pageOf("t-pages"), 200, { entries: lines(5, 25), next: "c", since: null, total: 25 });
  await readLedger("t-pages");
  stand("t-pages");
  assert.equal(HISTORY_PREVIEW, 3);
  assert.equal(rows().length, 3);
  assert.equal(text("[data-ledger-all]"), "All history · 25");
  assert.equal(document.querySelector("[data-ledger-more]"), null, "the pages are for the whole history");

  click("[data-ledger-all]");
  assert.equal(historyExpanded("t-pages"), true);
  assert.equal(rows().length, 5);
  assert.deepEqual(rows().map((row) => row.querySelector(".g-ledger__amount").textContent), ["+10k", "+11k", "+12k", "+13k", "+14k"], "newest first, as the server sent them");
  assert.equal(text("[data-ledger-all]"), "Show less");
  assert.equal(text("[data-ledger-more]"), "More");

  api.reply(pageOf("t-pages", "before=c&limit=20"), 200, { entries: lines(5, 20), next: null, since: null, total: 25 });
  click("[data-ledger-more]");
  await settle();
  assert.ok(api.calls.some((call) => call.key === pageOf("t-pages", "before=c&limit=20")), "the page after the cursor");
  assert.equal(rows().length, 10, "the page is added at the end, and the page drew it");
  assert.equal(document.querySelector("[data-ledger-more]"), null, "the end of the history");
  assert.equal(text("[data-ledger-all]"), "Show less");

  click("[data-ledger-all]");
  assert.equal(historyExpanded("t-pages"), false);
  assert.equal(rows().length, 3);
  assert.equal(text("[data-ledger-all]"), "All history · 25");
  api.assertAnswered();
});

test("a team with up to three lines has nothing to unfold, and what is unfolded is a team's own", async () => {
  coach();
  markup(held({ entries: lines(3), total: 3 }));
  assert.equal(rows().length, 3);
  assert.equal(document.querySelector("[data-ledger-all]"), null);
  markup(held({ entries: lines(4), total: 4 }));
  assert.equal(rows().length, 3);
  assert.equal(text("[data-ledger-all]"), "All history · 4");

  api.reply(pageOf("t-own"), 200, { entries: lines(5, 25), next: "c", since: null, total: 25 });
  await readLedger("t-own");
  stand("t-own");
  click("[data-ledger-all]");
  assert.deepEqual([historyExpanded("t-own"), historyExpanded("t-other")], [true, false]);
  click("[data-ledger-all]");
  assert.equal(historyExpanded("t-own"), false);
});

test("a line is its title, its comment when it has one, its day, and its amount in its colour's class", () => {
  markup(held({ entries: [
    line("l3", { kind: "manual", reason: "sponsor", note: "Fan club", delta: 15 }),
    line("l2", { kind: "match_income", pairingId: "g4", delta: 60 }),
    line("l1", { kind: "safe", delta: -20 }),
  ], total: 3 }));
  const [first, second, third] = rows();
  assert.deepEqual(["title", "note", "when", "amount"].map((part) => first.querySelector(`.g-ledger__${part}`).textContent), ["Sponsor or prize", "Fan club", "18 Oct", "+15k"]);
  assert.equal(second.querySelector(".g-ledger__note"), null, "no comment, no empty line");
  assert.equal(second.querySelector(".g-ledger__when").textContent, "18 Oct · round 3");
  assert.ok(second.querySelector(".g-ledger__amount").classList.contains("g-ledger__amount--in"));
  assert.ok(third.querySelector(".g-ledger__amount").classList.contains("g-ledger__amount--out"));
  assert.equal(third.querySelector(".g-ledger__amount").textContent, "−20k");
  assert.equal(document.querySelector("ol.g-ledger").tagName, "OL");
});

test("no lines yet, the history not loaded, and since when it is kept", async () => {
  markup(held({ loaded: true }));
  assert.equal(text(".g-manage__history"), "HistoryNo operations yet.");
  assert.equal(document.querySelector("section.g-manage__history").getAttribute("aria-labelledby"), "manage-history-title");
  assert.equal(text("h2#manage-history-title"), "History");
  assert.equal(document.querySelector("ol"), null);
  assert.equal(document.querySelector("[data-ledger-all]"), null);

  // A history that has not been read is on its way, not empty (a team that has one is not shown as having none).
  for (const unread of [{ loaded: false }, { loaded: false, loading: true }]) {
    markup(held(unread));
    assert.equal(text(".g-ledger__state"), "Loading the history…");
    assert.ok(!document.body.textContent.includes("No operations yet."));
  }

  markup(held({ since: SINCE, loaded: true }));
  assert.equal(text("p.g-ledger__since"), "History is kept since 1 Oct 2026");
  markup(held({ entries: lines(5), total: 5, since: SINCE }));
  assert.equal(text("p.g-ledger__since"), "History is kept since 1 Oct 2026", "under the lines as well");
  markup(held({ since: null }));
  assert.equal(document.querySelector(".g-ledger__since"), null);

  // The history that did not load says why and can be asked for again.
  coach();
  api.reply(pageOf("t-retry"), 500, { error: { code: "SERVER_ERROR", message: "x" } });
  await readLedger("t-retry");
  api.reply(pageOf("t-retry"), 200, { entries: lines(2), next: null, since: SINCE, total: 2 });
  stand("t-retry");
  assert.match(text(".g-ledger__state"), /^The history did not load: .+/);
  assert.equal(text("[data-ledger-retry]"), "Try again");
  assert.equal(document.querySelector("ol"), null);
  click("[data-ledger-retry]");
  await settle();
  assert.equal(api.calls.filter((call) => call.key === pageOf("t-retry")).length, 2, "the first page is asked for again");
  assert.equal(rows().length, 2, "and drawn when it comes");
  assert.equal(document.querySelector("[data-ledger-retry]"), null);
  api.assertAnswered();

  markup(held({ loaded: false, error: "No connection." }));
  assert.equal(text(".g-ledger__state"), "The history did not load: No connection.");
});

test("a failure after the lines came (the next page, a re-read) is said under them, and the lines stay", () => {
  markup(held({ entries: lines(5), next: "c", total: 25, error: "No connection." }), { expanded: true });
  assert.equal(rows().length, 5);
  assert.equal(text(".g-ledger__state"), "The history did not load: No connection.");
  assert.equal(text("[data-ledger-retry]"), "Try again");
  assert.equal(text("[data-ledger-more]"), "More");
});

test("a note a coach typed is text", () => {
  markup(held({ entries: [line("l1", { kind: "manual", reason: "other", note: HOSTILE, delta: 5 })], total: 1 }));
  assert.equal(document.querySelectorAll("img").length, 0);
  assert.equal(text(".g-ledger__note"), HOSTILE);
  markup(held({ error: HOSTILE, loaded: false }));
  assert.equal(document.querySelectorAll("img").length, 0, "nor is what the server said");
  assert.ok(text(".g-ledger__state").includes(HOSTILE));
});

test("the toggle keeps the keyboard focus through the page's redraw, though a button comes before it", () => {
  const host = el(document, "div");
  document.body.appendChild(host);
  const drawn = (expanded, error = "") => historyMarkup({ teamId: "t-focus", ledger: held({ entries: lines(5), next: "c", total: 25, error }), games: GAMES, expanded });
  host.innerHTML = drawn(false);
  const button = host.querySelector("[data-ledger-all]");
  button.focus();
  patch(host, drawn(true));
  assert.ok(host.querySelector("[data-ledger-all]") === button, "the same button, its words changed");
  assert.equal(button.textContent, "Show less");
  // A failed read puts «Try again» ahead of it: the toggle must still be the node that has the focus.
  patch(host, drawn(true, "No connection."));
  assert.ok(host.querySelector("[data-ledger-all]") === button, "the same button, with a line and a button come in ahead of it");
  assert.ok(document.activeElement === button, "and it has the focus still");
  assert.deepEqual(host.querySelectorAll("button").map((node) => node.textContent), ["Try again", "Show less", "More"]);
  document.body.removeChild(host);
});

/** The history drawn as the page draws it, patched in place (a keyed button that stays is the same node), wired and following the cache. */
function standPatched(teamId) {
  for (const child of [...document.body.childNodes]) document.body.removeChild(child);
  const host = el(document, "div");
  document.body.appendChild(host);
  const draw = () => patch(host, historyMarkup({ ledger: ledgerOf(teamId), games: GAMES, expanded: historyExpanded(teamId) }));
  draw();
  const offWire = wireHistory(host, teamId, draw);
  const offLedger = onLedgerChange(draw);
  unwire = () => {
    offWire();
    offLedger();
  };
  return host;
}
const heading = () => document.querySelector("#manage-history-title");

test("a pressed «Try again» that its read takes away leaves the focus on the history's heading, never the body (final Minor 4)", async () => {
  coach();
  api.reply(pageOf("t-focus-retry"), 500, { error: { code: "SERVER_ERROR", message: "x" } });
  await readLedger("t-focus-retry");
  standPatched("t-focus-retry");
  assert.equal(heading().getAttribute("tabindex"), "-1", "a heading the page can give the focus to, out of the tab order");
  api.reply(pageOf("t-focus-retry"), 200, { entries: lines(2), next: null, since: null, total: 2 });
  document.querySelector("[data-ledger-retry]").focus();
  click("[data-ledger-retry]");
  assert.ok(document.querySelector("[data-ledger-retry]") === null, "the read is on its way: no «Try again»");
  assert.ok(document.activeElement === heading(), "the focus is on the heading");
  await settle();
  assert.equal(rows().length, 2);
  assert.ok(document.activeElement === heading(), "and it stays there once the lines come");
  api.assertAnswered();
});

test("the last «More» leaves the focus on the history's heading; a «More» that stays keeps it (final Minor 4)", async () => {
  coach();
  api.reply(pageOf("t-focus-more"), 200, { entries: lines(5, 25), next: "c", since: null, total: 25 });
  await readLedger("t-focus-more");
  standPatched("t-focus-more");
  click("[data-ledger-all]");
  // A page with another after it: «More» stays, and so does the focus.
  api.reply(pageOf("t-focus-more", "before=c&limit=20"), 200, { entries: lines(5, 20), next: "d", since: null, total: 25 });
  const more = document.querySelector("[data-ledger-more]");
  more.focus();
  click("[data-ledger-more]");
  await settle();
  assert.equal(rows().length, 10);
  assert.ok(document.activeElement === more, "the same button, still there, has the focus");
  // The last page: «More» goes.
  api.reply(pageOf("t-focus-more", "before=d&limit=20"), 200, { entries: lines(5, 15), next: null, since: null, total: 25 });
  click("[data-ledger-more]");
  await settle();
  assert.equal(rows().length, 15);
  assert.ok(document.querySelector("[data-ledger-more]") === null, "the end of the history");
  assert.ok(document.activeElement === heading(), "the focus is on the heading");
  api.assertAnswered();
});

test("a press made with the focus elsewhere moves nothing (final Minor 4)", async () => {
  coach();
  api.reply(pageOf("t-focus-none"), 500, { error: { code: "SERVER_ERROR", message: "x" } });
  await readLedger("t-focus-none");
  const host = standPatched("t-focus-none");
  const elsewhere = el(document, "button");
  document.body.appendChild(elsewhere);
  elsewhere.focus();
  api.reply(pageOf("t-focus-none"), 200, { entries: lines(2), next: null, since: null, total: 2 });
  fireEvent(host.querySelector("[data-ledger-retry]"), "click");
  await settle();
  assert.ok(document.activeElement === elsewhere, "the focus stays where it was");
});

test("the line that says how the history stands is a status a screen reader hears, and a «More» on its way says it is loading under the lines (final Minor 4)", async () => {
  for (const ledger of [held({ loaded: false }), held(), held({ error: "No connection." }), held({ entries: lines(2), total: 2, loading: true })]) {
    markup(ledger);
    assert.equal(document.querySelector(".g-ledger__state").getAttribute("role"), "status", JSON.stringify(ledger));
  }
  coach();
  api.reply(pageOf("t-loading"), 200, { entries: lines(5, 25), next: "c", since: null, total: 25 });
  await readLedger("t-loading");
  stand("t-loading");
  click("[data-ledger-all]");
  assert.ok(document.querySelector(".g-ledger__state") === null, "nothing on its way: nothing to say");
  api.reply(pageOf("t-loading", "before=c&limit=20"), 200, { entries: lines(5, 20), next: null, since: null, total: 25 });
  const gate = api.hold(pageOf("t-loading", "before=c&limit=20"));
  click("[data-ledger-more]");
  assert.equal(rows().length, 5, "the lines stay");
  assert.equal(text(".g-ledger__state"), "Loading the history…");
  const all = [...document.body.walk()];
  assert.ok(all.indexOf(document.querySelector(".g-ledger__state")) > all.indexOf(document.querySelector("ol.g-ledger")), "under the lines");
  gate.release();
  await settle();
  assert.equal(rows().length, 10);
  assert.ok(document.querySelector(".g-ledger__state") === null, "the page came: nothing on its way");
});

test("what wireHistory wired is gone when it is released, and a press that is not the history's does nothing", async () => {
  coach();
  const heard = [];
  mount(historyMarkup({ teamId: "t-wire", ledger: held({ entries: lines(5), next: "c", total: 25 }), games: GAMES, expanded: true }));
  const off = wireHistory(document.body, "t-wire", () => heard.push("changed"));
  const before = api.calls.length;
  fireEvent(document.body, "click");
  assert.deepEqual([heard, api.calls.length], [[], before], "a click on nothing");
  off();
  click("[data-ledger-all]");
  click("[data-ledger-more]");
  await settle();
  assert.deepEqual([heard, historyExpanded("t-wire"), api.calls.length], [[], false, before]);
});

test("Coach's Safe: the balance, the rule, the last deposit", () => {
  const entries = [line("l2", { kind: "match_income" }), line("l1", { kind: "safe", delta: -20 })];
  const fragment = mount(safeMarkup({ safe: 20, entries }));
  const card = document.querySelector("section.g-manage__safe");
  assert.equal(card.getAttribute("aria-labelledby"), "manage-safe-title");
  assert.equal(text("h2#manage-safe-title"), "Coach's Safe");
  assert.equal(text(".g-manage__safe-rule"), "Up to 50k of the winnings after each match. It can be spent only after the season.");
  assert.equal(text(".g-manage__safe-amount"), "20k");
  assert.equal(text(".g-manage__safe-last"), "Last deposit: 20k · 18 Oct");
  assertCspSafe(fragment);

  mount(safeMarkup({ safe: 0, entries: [line("l2")] }));
  assert.equal(text(".g-manage__safe-amount"), "0k");
  assert.equal(document.querySelector(".g-manage__safe-last"), null, "no deposit, nothing to say about the last one");
  mount(safeMarkup({ safe: 12.5, entries: [] }));
  assert.equal(text(".g-manage__safe-amount"), "12.5k");
  mount(safeMarkup({ safe: null, entries: [] }));
  assert.equal(text(".g-manage__safe-amount"), "—", "a safe not read is a dash, not NaNk");
});

test("the page speaks Russian when the site does", () => {
  initLocale("ru");
  markup(held({ entries: [line("l2", { pairingId: "g4" }), line("l1", { kind: "manual", reason: "fine", note: "late", delta: -5 }), line("l0", { kind: "mistake", delta: -10 })], total: 25, since: SINCE }));
  assert.equal(text("h2#manage-history-title"), "История");
  assert.equal(rows()[0].querySelector(".g-ledger__title").textContent, "Доход за матч");
  assert.match(rows()[0].querySelector(".g-ledger__when").textContent, /^18 окт.* · тур 3$/);
  assert.equal(rows()[1].querySelector(".g-ledger__title").textContent, ru["treasury.reason.fine"]);
  assert.equal(rows()[1].querySelector(".g-ledger__amount").textContent, "−5k");
  assert.equal(text("[data-ledger-all]"), "Вся история · 25");
  assert.match(text("p.g-ledger__since"), /^История ведётся с 1 окт.* 2026/);
  mount(safeMarkup({ safe: 20, entries: [line("l1", { kind: "safe", delta: -20 })] }));
  assert.equal(text(".g-manage__safe-rule"), "До 50k из дохода после каждого матча. Тратить можно только после сезона.");
  assert.match(text(".g-manage__safe-last"), /^Последний взнос: 20k · 18 окт/);
  markup(held({ error: "Нет связи." }));
  assert.equal(text(".g-ledger__state"), "История не загрузилась: Нет связи.");
  assert.equal(text("[data-ledger-retry]"), "Повторить");
});

test("the history and the safe are styled, safe for the CSP, and in the dictionaries", () => {
  const fragment = mount(historyMarkup({ teamId: "t0", ledger: held({ entries: lines(5), next: "c", total: 25, since: SINCE, error: "x" }), games: GAMES, expanded: true })
    + safeMarkup({ safe: 20, entries: [line("l1", { kind: "safe", delta: -20 })] }));
  assertCspSafe(fragment);
  assertStyled(fragment, CSS, "button.css");
  mount(historyMarkup({ teamId: "t0", ledger: held({ loaded: false }), games: [], expanded: false }));
  assertStyled(document.body, CSS, "button.css");
  assertDictionaryCovers("src/screens/team/manage/history.mjs");
  for (const name of Object.keys(en).filter((key) => key.startsWith("treasury."))) assert.ok(ru[name], `ru ${name}`);
});

test("the cards are surfaces with their own text, a row is 60px, a button is touch-sized, and every amount is readable in every palette", () => {
  assert.deepEqual(valuesOf(CSS, ".g-manage__history", "background"), ["var(--surface)"]);
  assert.deepEqual(valuesOf(CSS, ".g-manage__safe", "background"), ["var(--surface)"]);
  assert.deepEqual(valuesOf(CSS, ".g-ledger__row", "min-height"), ["60px"]);
  assert.deepEqual(valuesOf(CSS, ".g-ledger__action", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(CSS, ".g-ledger__action", "min-width"), ["var(--size-touch)"], "«Ещё» is narrower than a finger (final Minor 5)");
  assert.deepEqual(valuesOf(CSS, ".g-ledger__amount", "white-space"), ["nowrap"]);
  assertReadable(CSS, ".g-ledger__amount--out", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-ledger__amount--in", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-ledger__action", "color", ["--surface"], 4.5);
  for (const selector of [".g-ledger__title", ".g-ledger__note", ".g-ledger__when", ".g-ledger__since", ".g-ledger__state", ".g-manage__history-title", ".g-manage__safe-title", ".g-manage__safe-rule", ".g-manage__safe-last", ".g-manage__safe-amount"]) {
    assertReadable(CSS, selector, "color", ["--surface"], 4.5);
  }
});
