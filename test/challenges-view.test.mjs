import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertContrast, inMedia, mediaText, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const { challengesModel } = await import("../src/screens/matches/challenges-model.mjs");
const { challengesMarkup } = await import("../src/screens/matches/challenges-view.mjs");
const { state } = await import("../src/core/state.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
// The model names a race by the reference's words.
state.data = expandCollections(JSON.parse(text("public/data.en.json")));
const CSS = "src/screens/matches/challenges.css";

// The reader's clock: noon of 21 October, local time.
const NOW = new Date("2026-10-21T12:00:00");
const TODAY = "2026-10-21T09:00:00", YESTERDAY = "2026-10-20T00:30:00", TWO_DAYS = "2026-10-19T10:00:00";

const ME = { id: "u1", login: "coach" };
const coach = (id, login, teams) => ({ id, login, teams: teams.map(([teamId, name, slug]) => ({ id: teamId, name, baseTeamSlug: slug })) });
const ORC_BOSS = coach("u5", "orc_boss", [["r1", "Grimtusk Raiders", "teams/orc"], ["r2", "Iron Teeth", "teams/black-orc"]]);
const NIGHTBLADE = coach("u6", "nightblade", [["d1", "Duskspire Knives", "teams/dark-elf"]]);
const RIVAL = coach("u2", "rival", [["rt1", "Rival Team", "teams/dwarf"]]);
const OPPONENTS = [NIGHTBLADE, ORC_BOSS, RIVAL];
const T1 = { id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true };
const T2 = { id: "t2", name: "Anji Magritta", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: false };
const TEAMS = [T1, T2];
const [GRIMTUSK, IRON_TEETH] = ORC_BOSS.teams;

const named = ({ id, login }) => ({ id, login });
const teamOf = ({ id, name, baseTeamSlug }) => ({ id, name, baseTeamSlug });
/** A challenge as `GET /api/challenges` sends it. */
const challenge = (id, from, to, team, createdAt, over = {}) => ({
  id, sender: named(from), recipient: named(to), team: teamOf(team), status: "pending", gameId: null, createdAt, updatedAt: createdAt, ...over,
});
/** One of the coach's games as `/api/games` sends it; `home` and `away` are [user, team]. */
const game = (id, [homeUser, homeTeam], [awayUser, awayTeam], over = {}) => ({
  id, kind: "friendly", season: null, roundNumber: 0, roundStatus: null, resultStatus: "pending", preparationStatus: "not_started",
  postMatchStatus: "not_started", homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null,
  proposedByUserId: null, viewerIsProposer: false, createdAt: TWO_DAYS, updatedAt: TODAY,
  home: { user: named(homeUser), team: teamOf(homeTeam) }, away: { user: named(awayUser), team: teamOf(awayTeam) }, ...over,
});
const played = { resultStatus: "confirmed", preparationStatus: "completed", postMatchStatus: "completed", homeTouchdowns: 2, awayTouchdowns: 1, homeCasualties: 0, awayCasualties: 0 };

// The prototypes' page: orc_boss's challenge of yesterday, ours to nightblade, the Iron Teeth accepted today; one played, one declined.
const CHALLENGES = [
  challenge("c1", ORC_BOSS, ME, GRIMTUSK, YESTERDAY),
  challenge("c2", ME, NIGHTBLADE, T1, TWO_DAYS),
  challenge("c3", ORC_BOSS, ME, IRON_TEETH, TWO_DAYS, { status: "accepted", gameId: "g7", updatedAt: TODAY }),
  challenge("c4", ME, RIVAL, T1, TWO_DAYS, { status: "accepted", gameId: "g6", updatedAt: YESTERDAY }),
  challenge("c5", ME, RIVAL, T2, TWO_DAYS, { status: "declined", updatedAt: TWO_DAYS }),
];
const GAMES = [game("g7", [ORC_BOSS, IRON_TEETH], [ME, T1]), game("g6", [ME, T1], [RIVAL, RIVAL.teams[0]], played)];
const PAGE = { payload: { challenges: CHALLENGES, opponents: OPPONENTS }, readError: "", games: GAMES, gamesError: "", teamId: "t1", viewerId: "u1", teams: TEAMS, now: NOW };

/** The page drawn as a coach would see it, from the model over `over`. */
function page(over = {}, { phone = true, historyOpen = false } = {}) {
  return mount(challengesMarkup(challengesModel({ ...PAGE, ...over, phone }), { historyOpen }));
}
const root = (fragment) => fragment.querySelector(".g-friendly");
/** The element children of a node: the fake DOM keeps only childNodes. */
const children = (node) => node.childNodes.filter((child) => child.nodeType === 1);
const words = (node) => node?.textContent.replace(/\s+/g, " ").trim();
const all = (fragment, selector) => fragment.querySelectorAll(selector).map(words);

test("a phone's page in the prototype's order: the title with played, the note, the button, incoming, outgoing, accepted, the history", () => {
  const fragment = page();
  const screen = root(fragment);
  assert.equal(screen.getAttribute("data-screen"), "team-challenges");
  assert.deepEqual(children(screen).map((child) => [child.getAttribute("class"), child.getAttribute("aria-labelledby")]), [
    ["g-pagehead g-pagehead--phone", null], ["g-friendly__note", null], ["g-btn g-btn--primary g-btn--block", null],
    ["g-friendly__section", "friendly-incoming-title"], ["g-friendly__section", "friendly-outgoing-title"],
    ["g-friendly__section", "friendly-accepted-title"], ["g-friendly__section", "friendly-history-title"],
  ]);
  for (const section of screen.querySelectorAll("section")) {
    assert.ok(section.querySelector(`h2#${section.getAttribute("aria-labelledby")}`), "each section named by its heading");
  }
  assert.equal(words(screen.querySelector("h1")), "Friendlies");
  assert.equal(words(screen.querySelector(".g-pagehead__meta .g-friendly__played")), "played 1");
  assert.equal(words(screen.querySelector(".g-friendly__note")), "A friendly does not count in the table, but SPP, injuries and the treasury count as usual.");
  const send = screen.querySelector("[data-friendly-send]");
  assert.deepEqual([words(send), send.getAttribute("aria-haspopup"), send.hasAttribute("disabled")], ["Challenge", "dialog", false]);
  assert.deepEqual(all(screen, "h2"), ["Incoming · 1", "Outgoing · 1", "Accepted", "Challenge history · 2"]);

  const incoming = screen.querySelector('.g-friendly__section[aria-labelledby="friendly-incoming-title"] .g-friendly__item');
  assert.deepEqual([words(incoming.querySelector(".g-friendly__letter")), words(incoming.querySelector(".g-friendly__login")), words(incoming.querySelector(".g-friendly__line"))],
    ["O", "orc_boss", "Grimtusk Raiders · Orc · challenge yesterday"]);
  const accept = incoming.querySelector("[data-friendly-accept]");
  assert.deepEqual([words(accept), accept.getAttribute("data-friendly-accept"), accept.getAttribute("aria-haspopup")], ["Accept…", "c1", "dialog"]);
  const decline = incoming.querySelector('[data-friendly-answer="decline"]');
  assert.deepEqual([words(decline), decline.getAttribute("data-friendly-id")], ["Decline", "c1"]);

  const outgoing = screen.querySelector('.g-friendly__section[aria-labelledby="friendly-outgoing-title"] .g-friendly__item');
  assert.equal(words(outgoing.querySelector(".g-friendly__line")), "Duskspire Knives · awaiting an answer · 19 Oct");
  assert.equal(words(outgoing.querySelector(".g-status--wait")), "Waiting");
  const cancel = outgoing.querySelector('[data-friendly-answer="cancel"]');
  assert.deepEqual([words(cancel), cancel.getAttribute("data-friendly-id")], ["Cancel the challenge", "c2"]);

  const accepted = screen.querySelector('.g-friendly__section[aria-labelledby="friendly-accepted-title"] .g-friendly__item');
  assert.equal(words(accepted.querySelector(".g-status")), "Friendly · off the table");
  assert.equal(accepted.querySelector(".g-status").getAttribute("class"), "g-status", "the neutral chip");
  assert.equal(words(accepted.querySelector(".g-friendly__when")), "accepted today");
  assert.deepEqual(all(accepted, ".g-friendly__side"), ["Ashgrove Wardens", "Iron Teeth"]);
  assert.equal(words(accepted.querySelector(".g-friendly__vs")), "vs");
  const prepare = accepted.querySelector("a.g-btn--primary");
  assert.deepEqual([words(prepare), prepare.getAttribute("href")], ["Match preparation", "#/games/g7/pre-match"]);
});

test("a desk's page: the band with its line and the button, the two cards side by side, accepted the whole width", () => {
  const fragment = page({}, { phone: false });
  const screen = root(fragment);
  assert.ok(screen.matches(".g-friendly--desk"));
  assert.equal(words(screen.querySelector("h1")), "Friendlies");
  assert.equal(words(screen.querySelector(".g-pagehead__sub")), "Off the table · SPP, injuries and the treasury count");
  const send = screen.querySelector(".g-pagehead__meta [data-friendly-send]");
  assert.deepEqual([words(send), send.getAttribute("class")], ["Challenge", "g-btn g-btn--primary"], "the band's button, not the width of the page");
  assert.equal(screen.querySelector(".g-friendly__played"), null, "DeskChallenges.html draws no count");
  assert.equal(screen.querySelector(".g-friendly__note"), null, "the band's line says it");
  assert.deepEqual(all(screen.querySelector(".g-friendly__grid"), "h2"), ["Incoming", "Outgoing"], "side by side, no count");
  assert.deepEqual(all(screen, "h2"), ["Incoming", "Outgoing", "Accepted", "Challenge history · 2"]);
  assert.ok(!screen.querySelector(".g-friendly__grid").contains(screen.querySelector('[aria-labelledby="friendly-accepted-title"]')), "accepted the whole width");

  assert.equal(words(screen.querySelector('[aria-labelledby="friendly-incoming-title"] .g-friendly__line')), "Grimtusk Raiders · yesterday");
  assert.deepEqual(all(screen.querySelector('[aria-labelledby="friendly-incoming-title"]'), "button"), ["Accept…", "Decline"]);
  const outgoing = screen.querySelector('[aria-labelledby="friendly-outgoing-title"]');
  assert.equal(words(outgoing.querySelector(".g-friendly__line")), "Duskspire Knives · awaiting · 19 Oct");
  assert.equal(outgoing.querySelector(".g-status"), null, "no chip, as DeskChallenges.html");
  assert.equal(words(outgoing.querySelector('[data-friendly-answer="cancel"]')), "Cancel");

  const accepted = screen.querySelector('[aria-labelledby="friendly-accepted-title"] .g-friendly__item');
  assert.equal(words(accepted.querySelector(".g-friendly__pair")), "Ashgrove Wardens vs Iron Teeth");
  assert.equal(accepted.querySelector(".g-friendly__when"), null, "DeskChallenges.html says no day");
  const prepare = accepted.querySelector(".g-friendly__links a");
  assert.deepEqual([words(prepare), prepare.getAttribute("class"), prepare.getAttribute("href")], ["Match preparation", "g-btn g-btn--primary", "#/games/g7/pre-match"]);
});

test("a match on, past its preparation: its records and its post-match; a score sent says it, or asks to confirm it", () => {
  const live = [game("g7", [ORC_BOSS, IRON_TEETH], [ME, T1], { preparationStatus: "in_progress" })];
  for (const phone of [true, false]) {
    const links = page({ games: live }, { phone }).querySelector(".g-friendly__item--accepted .g-friendly__links");
    assert.deepEqual(links.querySelectorAll("a").map((link) => [words(link), link.getAttribute("class")]), [
      ["Match records", "g-friendly__link"], ["Post-match", phone ? "g-btn g-btn--block" : "g-btn"],
    ]);
  }
  const sentBy = (proposer) => [game("g7", [ORC_BOSS, IRON_TEETH], [ME, T1], {
    preparationStatus: "completed", resultStatus: "awaiting_confirmation", proposedHomeTouchdowns: 1, proposedAwayTouchdowns: 2,
    proposedHomeCasualties: 0, proposedAwayCasualties: 1, viewerIsProposer: proposer,
  })];
  const theirs = page({ games: sentBy(false) }).querySelector(".g-friendly__item--accepted");
  assert.equal(words(theirs.querySelector(".g-friendly__links a")), "Confirm the score");
  assert.ok(words(theirs.querySelector(".g-friendly__sent")), "the score as a line");
  const ours = page({ games: sentBy(true) }, { phone: false }).querySelector(".g-friendly__item--accepted");
  assert.equal(ours.querySelector(".g-friendly__links a"), null, "the coach's own score only waits");
  assert.ok(words(ours.querySelector(".g-friendly__sent")));
});

test("nothing yet says so; a section with nothing in it is not drawn", () => {
  for (const phone of [true, false]) {
    const fragment = page({ payload: { challenges: [], opponents: OPPONENTS } }, { phone });
    assert.equal(words(fragment.querySelector(".g-friendly__none")), "No challenges yet. Challenge a coach: the opponent chooses a team on accepting.");
    assert.deepEqual(all(fragment, "h2"), []);
    assert.equal(fragment.querySelector(".g-friendly__grid"), null);
    assert.equal(fragment.querySelector("[data-friendly-send]").hasAttribute("disabled"), false);
  }
  const onlyOutgoing = page({ payload: { challenges: [CHALLENGES[1]], opponents: OPPONENTS } });
  assert.deepEqual(all(onlyOutgoing, "h2"), ["Outgoing · 1"]);
  assert.equal(onlyOutgoing.querySelector(".g-friendly__none"), null);
  initLocale("ru");
  try {
    assert.equal(words(page({ payload: { challenges: [], opponents: [] } }).querySelector(".g-friendly__none")),
      "Вызовов пока нет. Бросьте вызов: соперник выберет свою команду, когда примет вызов.", "the challenge, not «it» (the owner's neutral words)");
  } finally {
    initLocale("en");
  }
});

test("the challenges not read: the danger callout with Refresh, the button closed; the games not read: no accepted, no played", () => {
  for (const phone of [true, false]) {
    const loading = page({ payload: null }, { phone });
    assert.equal(words(loading.querySelector('[role="status"]')), "Reading the challenges…");
    assert.equal(loading.querySelector("[data-friendly-send]").hasAttribute("disabled"), true, "nothing to challenge from yet");
    assert.equal(loading.querySelector(".g-callout"), null);

    const failed = page({ payload: null, readError: "No connection" }, { phone });
    const alert = failed.querySelector('[role="alert"]');
    assert.equal(words(alert.querySelector(".g-callout--danger .g-callout__title")), "The challenges could not be read: No connection");
    assert.equal(words(alert.querySelector(".g-callout__action [data-friendly-retry]")), "Refresh");
    assert.equal(failed.querySelector("[data-friendly-send]").hasAttribute("disabled"), true);
    assert.equal(failed.querySelector('[role="status"]'), null, "not read, and said why: not «reading»");
    assert.deepEqual(all(failed, "h2"), []);

    const both = page({ payload: null, readError: "No connection", games: [], gamesError: "offline" }, { phone });
    assert.deepEqual(all(both, ".g-callout__title"), ["The challenges could not be read: No connection", "The matches did not load: offline"]);
    assert.equal(both.querySelectorAll("[data-friendly-retry]").length, 1, "Refresh once, on the challenges'");

    const loadingGamesFailed = page({ payload: null, games: [], gamesError: "offline" }, { phone });
    assert.equal(words(loadingGamesFailed.querySelector('[role="status"]')), "Reading the challenges…", "the challenges still on their way");
    assert.equal(loadingGamesFailed.querySelector("[data-friendly-retry]"), null);

    const gamesFailed = page({ games: [], gamesError: "offline" }, { phone });
    assert.deepEqual(all(gamesFailed, ".g-callout__title"), ["The matches did not load: offline"]);
    assert.equal(gamesFailed.querySelector("[data-friendly-retry]"), null);
    assert.equal(gamesFailed.querySelector(".g-friendly__played"), null);
    assert.equal(gamesFailed.querySelector(".g-friendly__item--accepted"), null);
    assert.ok(gamesFailed.querySelector(".g-friendly__item [data-friendly-accept]"), "the challenges are drawn all the same");
    assert.equal(gamesFailed.querySelector("[data-friendly-send]").hasAttribute("disabled"), false);
  }
});

test("the history is folded until it is opened", () => {
  for (const phone of [true, false]) {
    const folded = page({}, { phone });
    const toggle = folded.querySelector("[data-friendly-history]");
    assert.equal(toggle.tagName, "BUTTON");
    assert.equal(toggle.closest("h2") !== null, true, "the history's heading is its button");
    assert.deepEqual([words(toggle), toggle.getAttribute("aria-expanded"), toggle.getAttribute("aria-controls")], ["Challenge history · 2", "false", "friendly-history"]);
    assert.equal(folded.querySelector("#friendly-history").hasAttribute("hidden"), true);

    const open = page({}, { phone, historyOpen: true });
    assert.equal(open.querySelector("[data-friendly-history]").getAttribute("aria-expanded"), "true");
    const list = open.querySelector("#friendly-history");
    assert.equal(list.hasAttribute("hidden"), false);
    assert.deepEqual(all(list, "li"), ["rival · with Ashgrove Wardens · match played · yesterday", "rival · with Anji Magritta · declined · 19 Oct"]);
    const link = list.querySelector("a");
    assert.deepEqual([words(link), link.getAttribute("href")], ["rival · with Ashgrove Wardens · match played · yesterday", "#/games/g6"]);
    assert.equal(list.querySelectorAll("a").length, 1, "only the match played leads somewhere");
  }
  assert.equal(page({ payload: { challenges: CHALLENGES.slice(0, 3), opponents: OPPONENTS } }).querySelector("[data-friendly-history]"), null, "no history, no button");
});

test("names are text", () => {
  const hostile = { id: "u9", login: HOSTILE, teams: [{ id: "h1", name: HOSTILE, baseTeamSlug: "teams/orc" }] };
  const own = { ...T1, name: HOSTILE };
  const challenges = [
    challenge("c1", hostile, ME, hostile.teams[0], TODAY),
    challenge("c2", ME, hostile, own, TODAY),
    challenge("c3", hostile, ME, hostile.teams[0], TODAY, { status: "accepted", gameId: "g7" }),
    challenge("c4", hostile, ME, hostile.teams[0], TODAY, { status: "declined" }),
  ];
  const games = [game("g7", [hostile, hostile.teams[0]], [ME, own])];
  for (const phone of [true, false]) {
    const fragment = page({ payload: { challenges, opponents: [hostile] }, games, teams: [own, T2], teamId: "t2" }, { phone, historyOpen: true });
    assertCspSafe(fragment);
    assert.equal(fragment.querySelector("img"), null);
    assert.equal(words(fragment.querySelector(".g-friendly__login")), HOSTILE.replace(/\s+/g, " "));
    assert.equal(fragment.querySelector(".g-friendly__login").textContent, HOSTILE);
    assert.ok(fragment.querySelector("#friendly-history li").textContent.startsWith(HOSTILE));
    const pair = phone ? fragment.querySelectorAll(".g-friendly__side").map((side) => side.textContent) : [fragment.querySelector(".g-friendly__pair").textContent];
    assert.ok(pair.join(" ").includes(HOSTILE));
  }
});

test("a write on its way: the decline or cancel pressed is busy, «Challenge», «Accept…» and the others closed and drawn so", () => {
  const draw = (phone, options) => mount(challengesMarkup(challengesModel({ ...PAGE, phone }), options));
  const flags = (button) => [button.getAttribute("aria-busy"), button.getAttribute("aria-disabled"), button.hasAttribute("disabled")];
  for (const phone of [true, false]) {
    const idle = draw(phone, {});
    assert.equal(idle.querySelectorAll("[aria-disabled]").length + idle.querySelectorAll("[aria-busy]").length, 0, "nothing on its way: all open");
    const declining = draw(phone, { writing: "decline", answering: "c1" });
    assert.deepEqual(flags(declining.querySelector('[data-friendly-answer="decline"]')), ["true", "true", false]);
    for (const selector of ["[data-friendly-send]", '[data-friendly-accept="c1"]', '[data-friendly-answer="cancel"]']) {
      assert.deepEqual(flags(declining.querySelector(selector)), [null, "true", false], selector);
    }
    // A sheet's write: every button of the page under it is closed, none busy.
    const sending = draw(phone, { writing: "send" });
    assert.equal(sending.querySelectorAll("[aria-busy]").length, 0);
    assert.equal(sending.querySelectorAll('[aria-disabled="true"]').length, 4);
    assert.ok(sending.querySelector(".g-friendly__item--accepted .g-btn--primary").getAttribute("href"), "a match's link stays a link");
  }
  // Not read yet: «Challenge» is disabled, not closed.
  const unread = mount(challengesMarkup(challengesModel({ ...PAGE, payload: null, phone: true }), { writing: "decline", answering: "c1" }));
  assert.deepEqual(flags(unread.querySelector("[data-friendly-send]")), [null, null, true]);
  // Drawn as a disabled button is: dimmed, a primary by its grey fill; the one pressed busy.
  assert.deepEqual(valuesOf(CSS, '.g-friendly .g-btn[aria-disabled="true"]', "opacity"), [".6"]);
  assert.deepEqual(valuesOf(CSS, '.g-friendly .g-btn--primary[aria-disabled="true"]', "background"), ["var(--disabled)"]);
  assert.deepEqual(valuesOf(CSS, '.g-friendly .g-btn[aria-busy="true"]', "cursor"), ["progress"]);
});

test("styled", () => {
  for (const phone of [true, false]) {
    for (const over of [{}, { payload: null, readError: "No connection", games: [], gamesError: "offline" }, { payload: null }, { payload: { challenges: [], opponents: [] } }]) {
      assertStyled(page(over, { phone, historyOpen: true }), CSS, "page-head.css", "button.css", "status-chip.css", "callout.css");
    }
  }
  // The order of the stage's sheets, not the end of the file: a stage merged later appends its sheets after them.
  const styles = text("src/styles.css");
  const at = (file) => styles.indexOf(`@import url("${file}");`);
  assert.ok(at("screens/matches/challenges.css") > 0, "imported");
  assert.ok(at("screens/matches/challenges.css") > at("screens/coaches/profile.css"), "after stage 10's sheets");
  assert.ok(at("screens/matches/challenges.css") > styles.lastIndexOf('@import url("ui/'), "after every ui/ sheet it overrides");
  const css = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /ellipsis|text-overflow|line-clamp|nowrap/, "no «…»: long names wrap");
  assert.doesNotMatch(css, /@media \((?!max-width: 900px|min-width: 901px)/, "the 900/901 breakpoints only");
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b|rgba?\(/i, "colours are tokens");
  for (const selector of [".g-friendly__login", ".g-friendly__line", ".g-friendly__side", ".g-friendly__pair", ".g-friendly__past"]) {
    assert.ok(valuesOf(CSS, selector, "overflow-wrap").includes("anywhere"), `${selector} wraps`);
  }
  assert.deepEqual(valuesOf(CSS, ".g-friendly__history[hidden]", "display"), ["none"], "a folded list stays folded under its own display");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-friendly__grid", "grid-template-columns"), ["repeat(auto-fit, minmax(320px, 1fr))"]);
});

test("the prototypes' Oswald titles at Oswald's own line height: the phone's title, a desk's card titles and «Ours vs Theirs»", () => {
  assert.deepEqual(valuesOf(CSS, ".g-friendly .g-pagehead--phone .g-pagehead__title", "font"), ["700 24px/normal var(--font-display)"], "Challenges.html's 36 high");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-friendly__title", "font"), ["700 24px/normal var(--font-display)"], "DeskChallenges.html's cards of 126 and 130");
  assert.deepEqual(valuesOf(CSS, ".g-friendly__pair", "font"), ["700 22px/normal var(--font-display)"]);
});

test("readable: the muted words, the chips, the letter on its circle, in every palette", () => {
  for (const selector of [".g-friendly__line", ".g-friendly__played", ".g-friendly__note", ".g-friendly__caption", ".g-friendly__when", ".g-friendly__none"]) {
    assert.deepEqual(valuesOf(CSS, selector, "color"), ["var(--muted)"], selector);
  }
  assertContrast("--muted", ["--surface", "--surface-2"], 4.5);
  assertContrast("--on-warn-tint", ["--warn-tint"], 4.5);
  assertContrast("--ink-2", ["--surface-3"], 4.5);
  assertContrast("--header-ink", ["--header"], 4.5);
  assert.deepEqual(valuesOf(CSS, ".g-friendly__letter", "background"), ["var(--header)"]);
  assert.deepEqual(valuesOf(CSS, ".g-friendly__letter", "color"), ["var(--header-ink)"]);
  assert.deepEqual(valuesOf(CSS, ".g-friendly__link", "color"), ["var(--accent-text)"]);
  assert.deepEqual(valuesOf(CSS, ".g-friendly__pastlink", "color"), ["var(--accent-text)"]);
  assertContrast("--accent-text", ["--surface"], 4.5);
});

test("D2: 44 to a thumb, the prototypes' 40 from 901px, 48 where they draw it", () => {
  const px = (value) => Number(String(value).replace("px", ""));
  const phoneOf = (selector) => px(valuesOf(CSS, selector, "min-height")[0]);
  const deskOf = (selector) => px(inMedia(CSS, "min-width: 901px", selector, "min-height").at(-1) ?? valuesOf(CSS, selector, "min-height")[0]);
  for (const selector of [".g-friendly__actions .g-btn", ".g-friendly__fold", ".g-friendly__pastlink", ".g-friendly__link"]) {
    assert.ok(phoneOf(selector) >= 44, `${selector}: a thumb's 44 up to 900px`);
    assert.ok(deskOf(selector) >= 24, `${selector}: no less than 24 from 901px`);
  }
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-friendly__actions .g-btn", "min-height"), ["40px"], "DeskChallenges.html's 40");
  assert.deepEqual(valuesOf(CSS, ".g-friendly .g-btn--primary", "min-height"), ["48px"], "«Challenge» and «Match preparation»");
  assert.deepEqual(valuesOf(CSS, ".g-friendly .g-btn--primary", "height"), ["auto"], "not the shared 52");
  assert.equal(mediaText(CSS, "max-width: 900px").includes("min-height: 40px"), false);
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/matches/challenges-view.mjs");
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  const friendly = (words) => Object.keys(words).filter((key) => key.startsWith("friendly."));
  assert.deepEqual(friendly(en), friendly(ru), "the same keys in the same order");
  for (const key of ["friendly.incomingCount", "friendly.outgoingCount", "friendly.history"]) {
    assert.deepEqual([en[key].includes("{count}"), ru[key].includes("{count}")], [true, true], `${key}: a number with no plural form`);
  }
});
