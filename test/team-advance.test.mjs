import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertContrast, assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  ADVANCED, LIVE_GAME, PLAYERS, STYLES, api, aside, coach, loadGames, playerPage, renderTeamRoster, save, settle, state, team, text, view, withPlayers,
} from "./helpers/roster-page.mjs";

const { prepResetWords } = await import("../src/screens/team/roster/panel.mjs");

// Stage 07d, Task 9: «Advancement» in a player's profile, and «Advance» in the desk's panel, open the advancement — on a
// phone a sheet in steps (Adv1Type, Adv2Category, Adv3Skill, Adv4Done), on a desk a window in three columns
// (DeskRosterAdv.html). The type by its price, the category, the skill of the coach's choice; the take is one step of the
// roster's save queue, and the sheet is on its done step in the same turn. A random skill and the D8 are Task 10's. The
// page, the coach and his team are helpers/roster-page.mjs's: Ann 1 (a Lineman), Bors 2, Cade 3 (a Catcher), and four
// who miss the next match; ADVANCED is Cade with a random skill rolled on the site for his first advancement.

const PATCH = "PATCH /api/teams/t1";
const TEAM_READ = "GET /api/teams/t1";
const ADVANCE = "src/screens/team/roster/advance.css";
const ADVANCE_STYLES = [...STYLES, "src/screens/team/roster/advance.css", "option-card.css"];
const AFTER_POST = "Advancement — after the post-match";
const OTHER_TAB = "Someone signed in or out in another tab, so nothing was saved here.";
const DROPPED = "A match has begun, so the player edits and advancements that were waiting were not saved. Make them again after the post-match.";
const NO_SKILL_LEFT = "The player has every skill of these categories";
const PREP_GAME = { ...LIVE_GAME, id: "g1", preparationStatus: "preparing", postMatchStatus: "not_started" };

const patches = () => api.calls.filter(({ key }) => key === PATCH);
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
const sheet = () => view.querySelector("dialog#player-advance");
const advance = () => view.querySelector("[data-player-advance]");
const typeCard = (type) => sheet().querySelector(`.g-options [data-option-value="${type}"]`);
const types = () => sheet().querySelectorAll(".g-options [data-option-value]");
/** A type's card as it reads: its title, what it adds (or why it is refused), its price. */
const cardWords = (card) => [".g-option__title", ".g-option__sub", ".g-option__pill"].map((part) => card.querySelector(part)?.textContent ?? null);
const categories = () => sheet().querySelectorAll("[data-advance-category]");
const category = (name) => categories().find((card) => card.getAttribute("data-advance-category") === name);
const catWords = (card) => [card.querySelector(".g-advance__catname").textContent, card.querySelector(".g-advance__free").textContent];
const skills = () => sheet().querySelectorAll("[data-advance-skill]");
const skill = (name) => skills().find((row) => row.getAttribute("data-advance-skill") === name);
const tagsOf = (row) => row.querySelectorAll(".g-advance__tag").map((tag) => tag.textContent);
const next = () => sheet().querySelector("[data-advance-next]");
const take = () => sheet().querySelector("[data-advance-take]");
const doneButton = () => sheet().querySelector("[data-advance-done]");
const title = () => sheet().querySelector("h2").textContent;
const sub = () => sheet().querySelector(".g-sheet__sub")?.textContent ?? null;
const dots = () => sheet().querySelector(".g-steps")?.getAttribute("aria-label") ?? null;
const back = () => sheet().querySelector("[data-sheet-back]");
const refusal = () => sheet().querySelector(".g-player-sheet__refusal");
const done = () => sheet().querySelector(".g-advance__done");
const tiles = () => done().querySelectorAll(".g-advance__tile").map((tile) => [tile.querySelector("dt").textContent, tile.querySelector("dd").textContent]);
const summary = () => sheet().querySelector(".g-advance__summary").textContent;
/** t1 on the server with one player in place of his own line. */
const withOne = (player, over = {}) => withPlayers(PLAYERS.map((each) => (each.id === player.id ? player : each)), over);
const ANN = { ...PLAYERS[0], spp: { touchdowns: 10 } };
const CADE = { ...PLAYERS[2], spp: { touchdowns: 10 } };
// An Amazon Jaguar Warrior Blocker, whose Wrestle or Guard would complete an elite combination with his Defensive and Evasive.
const JAGUAR = { id: "j1", rowIndex: 3, number: "4", name: "Ixchel", spp: { touchdowns: 10 } };
const AMAZONS = team({ baseTeamSlug: "teams/amazon", roster: { players: [JAGUAR] } });
/** ADVANCED as the server holds it once the advancement `grant` is saved. */
const advancedWith = (type, skillName) => ({
  ...ADVANCED, extraSkills: [...ADVANCED.extraSkills, { name: skillName, access: "primary" }], advancements: [...ADVANCED.advancements, { type, grants: { skill: skillName } }],
});

/**
 * The advancement open for `id`: on a phone from «Advancement» in his profile, on a desk from «Advance» in the panel (him
 * chosen). The roster as `teamAnswer` says, the games as `games` do.
 */
async function openAdvance(phone, { id = "p3", teamAnswer = withOne(CADE), games = [] } = {}) {
  coach({ teamAnswer, open: phone ? null : `${id}#0` });
  gamesAre(games);
  if (phone) await playerPage(id);
  else await renderTeamRoster("t1");
  fireEvent(advance(), "click");
}

/** A card or a row of a radio group chosen by a press. */
const choose = (element) => fireEvent(element, "click");

/** On a phone: the type, «Next», the category, «Next», the skill. */
function walkTo(type, categoryName, skillName) {
  choose(typeCard(type));
  fireEvent(next(), "click");
  choose(category(categoryName));
  fireEvent(next(), "click");
  if (skillName) choose(skill(skillName));
}

/** A match begins on another device: the games say so, and `server` is the roster the server holds. */
const matchBegins = async (server) => {
  api.reply(TEAM_READ, 200, { team: server });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: server.revision });
  gamesAre([LIVE_GAME]);
  await loadGames(true);
  await settle();
};

test("«Advancement» opens the types, each with its price by the rank and what it adds to the value", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { id: "p1", teamAnswer: withOne(ANN) });
      const button = advance();
      assert.equal(button.tagName, "BUTTON");
      assert.equal(button.getAttribute("aria-haspopup"), "dialog");
      assert.ok(sheet()?.isModal, "dialog#player-advance, open");
      assert.equal(sheet().getAttribute("class"), "g-sheet g-player-sheet", "in the frame a player's sheets share");
      assert.equal(title(), "Advancement");
      assert.equal(sub(), "30 SPP available · advancement 1 of 6");
      assert.equal(dots(), "Step 1 of 3");
      assert.equal(back(), null, "no way back from the first step");
      const group = sheet().querySelector(".g-options");
      assert.equal(group.getAttribute("role"), "radiogroup");
      assert.equal(group.getAttribute("aria-label"), "Type of advancement");
      assert.deepEqual(types().map(cardWords), [
        ["Random primary skill", "General · +20k", "3 SPP"],
        ["Chosen primary skill", "General · +20k", "6 SPP"],
        ["Chosen secondary skill", "Agility, Strength, Devious · +40k", "10 SPP"],
        ["Characteristic improvement", "D8 roll · +10–50k", "14 SPP"],
      ]);
      assert.deepEqual(types().map((card) => card.getAttribute("aria-checked")), ["false", "false", "false", "false"], "none chosen yet");
      assert.deepEqual(types().map((card) => card.getAttribute("tabindex")), ["0", "-1", "-1", "-1"], "a roving tabindex: the first open one");
      assert.equal(next().textContent, "Next");
      assert.ok(next().hasAttribute("disabled"), "«Next» waits for a type");
      // The arrows choose; the card keeps the focus through the patch, and a phone stays on its step.
      const random = typeCard("random");
      random.focus();
      fireEvent(random, "keydown", { key: "ArrowDown" });
      assert.equal(typeCard("primary").getAttribute("aria-checked"), "true");
      assert.ok(document.activeElement === typeCard("primary"), "the focus on the card chosen");
      assert.equal(typeCard("primary").getAttribute("tabindex"), "0");
      assert.ok(!next().hasAttribute("disabled"));
      assert.equal(title(), "Advancement", "the step is the same until «Next»");
      assertCspSafe(view);
      assertStyled(view, ...ADVANCE_STYLES);
    });
    // A desk lists the same types in its first column (DeskRosterAdv.html).
    await openAdvance(false, { id: "p1", teamAnswer: withOne(ANN) });
    assert.deepEqual(types().map(cardWords).map(([name, , price]) => [name, price]), [
      ["Random primary skill", "3 SPP"], ["Chosen primary skill", "6 SPP"], ["Chosen secondary skill", "10 SPP"], ["Characteristic improvement", "14 SPP"],
    ]);
    assertStyled(view, ...ADVANCE_STYLES);
  });
});

test("a type he cannot pay for is grey and says how much is missing; pressed, it says so and is not chosen", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        // 5 SPP: an MVP.
        await openAdvance(phone, { id: "p1", teamAnswer: withOne({ ...PLAYERS[0], spp: { mvps: 1 } }) });
        assert.deepEqual(types().map(cardWords), [
          ["Random primary skill", "General · +20k", "3 SPP"],
          ["Chosen primary skill", "1 SPP short", "6 SPP"],
          ["Chosen secondary skill", "5 SPP short", "10 SPP"],
          ["Characteristic improvement", "9 SPP short", "14 SPP"],
        ]);
        const secondary = typeCard("secondary");
        assert.equal(secondary.getAttribute("aria-disabled"), "true");
        assert.equal(secondary.hasAttribute("disabled"), false, "it stays in reach, and says why");
        assert.equal(secondary.getAttribute("title"), "5 SPP short");
        assert.ok(secondary.hasAttribute("data-roster-closed"), "K7: a press says it, as the roster's closed controls do");
        choose(secondary);
        assert.equal(toasts().at(-1), "5 SPP short");
        assert.equal(typeCard("secondary").getAttribute("aria-checked"), "false", "not chosen");
        assert.ok(!sheet().querySelector('.g-options [aria-checked="true"]'));
        if (phone) assert.ok(next().hasAttribute("disabled"));
        else assert.equal(summary(), "Choose the type of advancement");
        // The arrows pass it by.
        typeCard("random").focus();
        fireEvent(typeCard("random"), "keydown", { key: "ArrowDown" });
        assert.equal(typeCard("random").getAttribute("aria-checked"), "true", "the only open type, kept");
        assertStyled(view, ...ADVANCE_STYLES);
      });
    }
  });
});

test("the categories of the type, with how many of their skills he lacks; a category with none closed", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      choose(typeCard("primary"));
      fireEvent(next(), "click");
      assert.equal(title(), "Skill category");
      assert.equal(sub(), "Chosen primary skill · 6 SPP");
      assert.equal(dots(), "Step 2 of 3");
      assert.ok(back(), "a way back to the type");
      const group = sheet().querySelector(".g-advance__cats");
      assert.equal(group.getAttribute("role"), "radiogroup");
      assert.equal(group.getAttribute("aria-label"), "Category");
      assert.deepEqual(categories().map(catWords), [["Agility", "12 of 14 available"], ["General", "16 of 16 available"]], "a Catcher's Catch and Dodge are his");
      const letter = category("Agility").querySelector(".g-advance__letter");
      assert.equal(letter.textContent, "A");
      assert.equal(letter.getAttribute("aria-hidden"), "true");
      assert.ok(letter.getAttribute("class").includes("g-advance__letter--agility"), "on the category's colour");
      assert.ok(category("General").querySelector(".g-advance__letter").getAttribute("class").includes("g-advance__letter--general"));
      assert.deepEqual(categories().map((card) => [card.getAttribute("role"), card.getAttribute("aria-checked"), card.getAttribute("tabindex")]),
        [["radio", "false", "0"], ["radio", "false", "-1"]]);
      assert.equal(sheet().querySelector(".g-advance__hint").textContent, "Next, only the skills of this category the player does not have yet.");
      assert.ok(next().hasAttribute("disabled"), "«Next» waits for a category");
      choose(category("Agility"));
      assert.equal(category("Agility").getAttribute("aria-checked"), "true");
      assert.ok(!next().hasAttribute("disabled"));
      // The arrows move the choice, the focus stays on the card through the patch.
      const agility = category("Agility");
      agility.focus();
      fireEvent(agility, "keydown", { key: "ArrowRight" });
      assert.equal(category("General").getAttribute("aria-checked"), "true");
      assert.equal(category("Agility").getAttribute("aria-checked"), "false");
      assert.ok(document.activeElement === category("General"), "the focus on the card chosen");
      assert.ok(agility === category("Agility"), "the cards kept: a patch");
      assertCspSafe(view);
      assertStyled(view, ...ADVANCE_STYLES);
    });
    // A category whose every skill he has is closed, saying why; a press says it (K7).
    await withWindow({ phone: true }, async () => {
      coach();
      const agility = state.data.skillGroups.find((group) => group.category === "Agility").skills;
      const allAgility = { ...CADE, extraSkills: agility.filter((name) => !["Catch", "Dodge"].includes(name)).map((name) => ({ name, access: "primary" })) };
      await openAdvance(true, { teamAnswer: withOne(allAgility) });
      choose(typeCard("primary"));
      fireEvent(next(), "click");
      const closed = category("Agility");
      assert.deepEqual(catWords(closed), ["Agility", "0 of 14 available"]);
      assert.equal(closed.getAttribute("aria-disabled"), "true");
      assert.equal(closed.getAttribute("title"), NO_SKILL_LEFT);
      assert.ok(closed.hasAttribute("data-roster-closed"));
      assert.equal(category("General").getAttribute("tabindex"), "0", "the group is entered at the first open card");
      choose(closed);
      assert.equal(toasts().at(-1), NO_SKILL_LEFT);
      assert.equal(category("Agility").getAttribute("aria-checked"), "false");
      assert.ok(next().hasAttribute("disabled"));
    });
  });
});

test("the category's skills in the Skill Table's order: his marked «has it already» and closed, the chosen one «chosen», one that completes an elite combination says so", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      walkTo("primary", "Agility");
      assert.equal(title(), "Choose a skill");
      assert.equal(sub(), "Agility · 6 SPP");
      assert.equal(dots(), "Step 3 of 3");
      const group = sheet().querySelector(".g-advance__skills");
      assert.equal(group.getAttribute("role"), "radiogroup");
      assert.equal(group.getAttribute("aria-label"), "Skill");
      const column = state.data.skillGroups.find((each) => each.category === "Agility").skills;
      assert.deepEqual(skills().map((row) => row.querySelector(".g-advance__skillname").textContent), column, "the Skill Table's order");
      const caught = skill("Catch");
      assert.deepEqual(tagsOf(caught), ["has it already"]);
      assert.equal(caught.getAttribute("aria-disabled"), "true");
      assert.equal(caught.getAttribute("title"), "has it already");
      assert.ok(caught.hasAttribute("data-roster-closed"));
      assert.equal(skill("Diving Catch").getAttribute("tabindex"), "0", "the first he can take");
      assert.deepEqual(tagsOf(skill("Diving Catch")), []);
      assert.equal(take().textContent, "Choose a skill");
      assert.ok(take().hasAttribute("disabled"));
      choose(caught);
      assert.equal(toasts().at(-1), "has it already");
      assert.equal(skill("Catch").getAttribute("aria-checked"), "false");
      choose(skill("Diving Catch"));
      assert.equal(skill("Diving Catch").getAttribute("aria-checked"), "true");
      assert.deepEqual(tagsOf(skill("Diving Catch")), ["chosen"]);
      assert.equal(take().textContent, "Take Diving Catch");
      assert.ok(!take().hasAttribute("disabled"));
      assertCspSafe(view);
      assertStyled(view, ...ADVANCE_STYLES);
      await settle();
      assert.equal(patches().length, 0, "nothing sent before «Take»");
    });
    // An Amazon Jaguar Warrior Blocker: Wrestle would bring an elite combination together.
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { id: "j1", teamAnswer: AMAZONS });
      walkTo("primary", "General");
      assert.deepEqual(tagsOf(skill("Wrestle")), ["+15k · elite combination"]);
      assert.deepEqual(tagsOf(skill("Block")), []);
      choose(skill("Wrestle"));
      assert.deepEqual(tagsOf(skill("Wrestle")), ["+15k · elite combination", "chosen"], "chosen, and still says so");
      assertStyled(view, ...ADVANCE_STYLES);
    });
    // A desk says it too, under the name in its grid.
    await openAdvance(false, { id: "j1", teamAnswer: AMAZONS });
    choose(typeCard("primary"));
    choose(category("General"));
    assert.deepEqual(tagsOf(skill("Wrestle")), ["+15k · elite combination"]);
    assertStyled(view, ...ADVANCE_STYLES);
  });
});

test("taken: one PATCH of the whole roster, the done step at once — what he got, how, −8 SPP, +20k, 2 / 6 — and the save's state", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      // K13: ADVANCED Cade's second advancement, the prototype's (Adv4Done.html).
      await openAdvance(true, { teamAnswer: withOne(ADVANCED) });
      assert.equal(sub(), "27 SPP available · advancement 2 of 6");
      walkTo("primary", "Agility", "Diving Catch");
      assert.equal(sub(), "Agility · 8 SPP", "his second advancement's price");
      api.reply(PATCH, 200, { team: withOne(advancedWith("primary", "Diving Catch"), { revision: 5 }) });
      fireEvent(take(), "click");
      assert.ok(sheet()?.isModal, "the sheet stays, on its done step");
      assert.equal(title(), "Done");
      assert.equal(sub(), "Cade");
      assert.equal(back(), null);
      assert.equal(done().querySelector(".g-advance__donetitle").textContent, "Diving Catch");
      assert.equal(done().querySelector(".g-advance__how").textContent, "Chosen primary skill · Agility");
      assert.deepEqual(tiles(), [["SPP", "−8"], ["Value", "+20k"], ["Advancements", "2 / 6"]]);
      assert.equal(done().querySelector(".g-advance__elite"), null);
      const status = done().querySelector(".g-advance__status");
      assert.equal(status.getAttribute("role"), "status");
      assert.equal(status.textContent, "Saving…");
      assert.equal(doneButton().textContent, "Back to the player");
      assert.ok(document.activeElement === doneButton(), "the focus on «Back to the player»");
      assert.equal(take(), null);
      // Drawn at once from the queue's draft: his SPP and his skills behind the sheet.
      assert.equal(view.querySelector(".g-profile__availn").textContent, "19");
      assert.ok(view.querySelector(".g-profile__skills").textContent.includes("Diving Catch"));
      await settle();
      assert.equal(patches().length, 1);
      const [call] = patches();
      assert.equal(call.body.revision, 4, "on the revision as read");
      const cade = call.body.roster.players.find((player) => player.id === "p3");
      assert.deepEqual(cade.advancements.at(-1), { type: "primary", grants: { skill: "Diving Catch" } });
      assert.equal(cade.advancements.length, 2);
      assert.deepEqual(call.body.roster.players.map(({ id }) => id), PLAYERS.map(({ id }) => id), "the whole roster");
      assert.equal(done().querySelector(".g-advance__status").textContent, "Saved");
      assert.equal(save.saveState("t1").waiting, 0);
      assertCspSafe(view);
      assertStyled(view, ...ADVANCE_STYLES);
      fireEvent(doneButton(), "click");
      assert.ok(!sheet());
      assert.ok(!view.querySelector("dialog:modal"));
      assert.ok(document.activeElement === advance(), "the focus back on «Advancement»");
    });
  });
});

test("an elite combination's 15k is in the done step's value", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { id: "j1", teamAnswer: AMAZONS });
      walkTo("primary", "Strength", "Guard");
      api.reply(PATCH, 200, { team: AMAZONS });
      fireEvent(take(), "click");
      assert.deepEqual(tiles(), [["SPP", "−6"], ["Value", "+35k"], ["Advancements", "1 / 6"]]);
      assert.equal(done().querySelector(".g-advance__elite").textContent, "an elite combination +15k included");
      await settle();
    });
  });
});

// Review Focus 2: the take is one step; a second press finds the sheet on its done step, and nothing to take.
test("a second press on «Take» sends nothing more", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openAdvance(phone, { teamAnswer: withOne(ADVANCED) });
        if (phone) walkTo("primary", "Agility", "Diving Catch");
        else {
          choose(typeCard("primary"));
          choose(category("Agility"));
          choose(skill("Diving Catch"));
        }
        const press = take();
        api.reply(PATCH, 200, { team: withOne(advancedWith("primary", "Diving Catch"), { revision: 5 }) });
        fireEvent(press, "click");
        fireEvent(press, "click");
        const late = document.createElement("button");
        late.setAttribute("type", "button");
        late.setAttribute("data-advance-take", "true");
        view.appendChild(late);
        fireEvent(late, "click");
        view.removeChild(late);
        await settle();
        assert.equal(patches().length, 1);
        assert.equal(patches()[0].body.roster.players.find((player) => player.id === "p3").advancements.length, 2, "one advancement, not two");
        assert.equal(save.saveState("t1").waiting, 0);
      });
    }
  });
});

// A phone's one button is patched in place from «Take» to «Back to the player»: the click that takes must not also be
// heard as the done step's (wire.mjs hears the sheet's buttons with one listener).
test("one click on «Take» is one step and leaves the sheet on done; the next click, on «Back to the player», closes it", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne(ADVANCED) });
      walkTo("primary", "Agility", "Diving Catch");
      const button = take();
      api.reply(PATCH, 200, { team: withOne(advancedWith("primary", "Diving Catch"), { revision: 5 }) });
      fireEvent(button, "click");
      assert.ok(sheet()?.isModal, "still open");
      assert.ok(done(), "on its done step");
      assert.ok(button === doneButton(), "the same button, now «Back to the player»");
      assert.equal(button.textContent, "Back to the player");
      await settle();
      assert.equal(patches().length, 1);
      assert.ok(done(), "the answer leaves it on done");
      fireEvent(button, "click");
      assert.ok(!sheet(), "the next click closes it");
      assert.ok(document.activeElement === advance());
      await settle();
      assert.equal(patches().length, 1, "and sends nothing");
    });
  });
});

test("Back walks the steps back; the step dots follow", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      walkTo("primary", "Agility", "Diving Catch");
      assert.equal(dots(), "Step 3 of 3");
      fireEvent(back(), "click");
      assert.equal(title(), "Skill category");
      assert.equal(dots(), "Step 2 of 3");
      assert.equal(category("Agility").getAttribute("aria-checked"), "true", "what was chosen, kept");
      const way = back();
      way.focus();
      fireEvent(way, "click");
      assert.equal(title(), "Advancement");
      assert.equal(dots(), "Step 1 of 3");
      assert.equal(back(), null);
      assert.equal(typeCard("primary").getAttribute("aria-checked"), "true");
      assert.ok(document.activeElement === typeCard("primary"), "the focus on the type chosen, where «Back» was taken away");
      // Another type starts the category and the skill again.
      choose(typeCard("secondary"));
      fireEvent(next(), "click");
      assert.deepEqual(categories().map(catWords).map(([name]) => name), ["Passing", "Strength", "Devious"]);
      assert.ok(!sheet().querySelector('.g-advance__cats [aria-checked="true"]'));
      assert.equal(sub(), "Chosen secondary skill · 10 SPP");
      // «Close» closes from any step, the focus back on «Advancement»; nothing was sent.
      fireEvent(sheet().querySelector("[data-sheet-close]"), "click");
      assert.ok(!sheet());
      assert.ok(document.activeElement === advance());
      await settle();
      assert.equal(patches().length, 0);
    });
  });
});

test("on a desk the same advancement in three columns: the type, the category, the skill, the summary and «Take» at the foot", async () => {
  await withoutTimers(async () => {
    await openAdvance(false, { teamAnswer: withOne(ADVANCED) });
    const button = aside().querySelector("[data-player-advance]");
    assert.equal(button.textContent, "Advance");
    assert.ok(sheet()?.isModal);
    assert.equal(sheet().getAttribute("class"), "g-sheet g-player-sheet");
    const badge = sheet().querySelector(".g-sheet__head .g-num");
    assert.equal(badge.textContent, "3");
    assert.ok(badge.getAttribute("class").includes("g-num--catcher"));
    const head = sheet().querySelector(".g-sheet__head").childNodes.filter((node) => node.nodeType === 1);
    assert.equal(head.indexOf(badge) + 1, head.indexOf(sheet().querySelector(".g-sheet__titles")), "his number before the titles");
    assert.equal(title(), "Advancement · Cade");
    assert.equal(sub(), "27 SPP available · advancement 2 of 6 · Catcher");
    assert.equal(dots(), null, "no step dots: the columns are the steps");
    assert.equal(back(), null);
    const columns = () => sheet().querySelectorAll(".g-advance__col");
    const heads = () => columns().map((column) => column.querySelector(".g-advance__coltitle").textContent);
    const empty = () => columns().map((column) => column.querySelector(".g-advance__empty")?.textContent ?? "");
    assert.deepEqual(heads(), ["1 · Type", "2 · Category", "3 · Skill"]);
    assert.deepEqual(empty(), ["", "Choose the type of advancement first", "Choose a category"]);
    assert.deepEqual(columns().map((column) => column.getAttribute("class").includes("g-advance__col--empty")), [false, true, true]);
    assert.equal(summary(), "Choose the type of advancement");
    const cancel = sheet().querySelector("[data-advance-keep]");
    assert.equal(cancel.textContent, "Cancel");
    assert.equal(take().textContent, "Choose a skill");
    assert.ok(take().hasAttribute("disabled"));
    assert.ok(cancel.closest(".g-sheet__foot") && take().closest(".g-sheet__foot"));
    // The type: its categories in the second column; the summary prices it.
    choose(typeCard("primary"));
    assert.deepEqual(categories().map(catWords), [["Agility", "12 of 14 available"], ["General", "15 of 16 available"]], "Frenzy is his");
    assert.deepEqual(empty(), ["", "", "Choose a category"]);
    assert.equal(summary(), "Chosen primary skill — 8 SPP");
    assert.equal(sheet().querySelector(".g-advance__hint"), null, "a desk's columns say it without the phone's line");
    choose(category("Agility"));
    assert.deepEqual(empty(), ["", "", ""]);
    assert.equal(summary(), "Chosen primary skill · Agility — 8 SPP");
    assert.ok(skill("Catch").getAttribute("aria-disabled") === "true");
    choose(skill("Diving Catch"));
    assert.equal(summary(), "Chosen primary skill · Agility · Diving Catch — 8 SPP", "DeskRosterAdv.html's initialAdv");
    assert.equal(take().textContent, "Take Diving Catch");
    assertCspSafe(view);
    assertStyled(view, ...ADVANCE_STYLES);
    // «Cancel» closes it, the focus back on «Advance».
    fireEvent(cancel, "click");
    assert.ok(!sheet());
    assert.ok(document.activeElement === aside().querySelector("[data-player-advance]"));
    // Again, and taken: done in the window, the save's state in the summary.
    fireEvent(advance(), "click");
    assert.equal(summary(), "Choose the type of advancement", "a sheet opened afresh");
    choose(typeCard("primary"));
    choose(category("Agility"));
    choose(skill("Diving Catch"));
    api.reply(PATCH, 200, { team: withOne(advancedWith("primary", "Diving Catch"), { revision: 5 }) });
    fireEvent(take(), "click");
    assert.equal(done().querySelector(".g-advance__donetitle").textContent, "Cade gets Diving Catch");
    assert.equal(done().querySelector(".g-advance__how").textContent, "Chosen primary skill · Agility · −8 SPP · value +20k");
    assert.equal(done().querySelector(".g-advance__tiles"), null, "DeskRosterAdv.html's line, not a phone's tiles");
    assert.equal(sub(), "19 SPP available · advancement 2 of 6 · Catcher", "the advancement taken, as advDone says it");
    assert.equal(summary(), "Saving…");
    assert.equal(sheet().querySelector("[data-advance-keep]"), null, "no «Cancel» once done");
    assert.equal(doneButton().textContent, "Done");
    assert.ok(document.activeElement === doneButton());
    await settle();
    assert.equal(summary(), "Saved in the player's profile");
    assert.equal(patches().length, 1);
    assertStyled(view, ...ADVANCE_STYLES);
    fireEvent(doneButton(), "click");
    assert.ok(!sheet());
    assert.ok(document.activeElement === aside().querySelector("[data-player-advance]"));
  });
});

test("«Advance» on a desk is closed when no advancement is within his SPP, saying how many more he needs", async () => {
  await withoutTimers(async () => {
    coach({ open: "p1#0" });
    await renderTeamRoster("t1");
    const closed = aside().querySelector("[data-player-advance]");
    assert.equal(closed.tagName, "BUTTON");
    assert.equal(closed.getAttribute("data-player-advance"), "p1#0");
    assert.equal(closed.getAttribute("aria-disabled"), "true");
    assert.equal(closed.getAttribute("title"), "3 more SPP needed");
    assert.equal(closed.textContent, "Advance");
    assert.equal(aside().querySelector(".g-roster__cheapest").textContent, "3 more SPP needed");
    fireEvent(closed, "click");
    assert.equal(toasts().at(-1), "3 more SPP needed");
    assert.ok(!sheet(), "no sheet");
    assert.equal(aside().querySelector("a"), null, "no link to his page in the panel");
    assertStyled(view, ...ADVANCE_STYLES);
  });
});

// Review Focus 4: R8 — nothing is written in a match; the sheet closes, and the keyboard finds the closed button.
test("a match begun while the advancement is open closes it; the focus on the closed «Advancement»", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openAdvance(phone);
        choose(typeCard("primary"));
        typeCard("primary").focus();
        gamesAre([LIVE_GAME]);
        await loadGames(true);
        await settle();
        assert.ok(!sheet(), "R8");
        assert.ok(!view.querySelector("dialog:modal"));
        assert.ok(document.activeElement === advance(), "his button, where the keyboard was");
        assert.equal(advance().getAttribute("aria-disabled"), "true");
        assert.equal(advance().getAttribute("title"), AFTER_POST);
        assert.equal(patches().length, 0);
      });
    }
  });
});

// Review Focus 4: an advancement that waited is a step of the queue, given up with the others when a match begins.
test("an advancement that waited for the network is given up when a match begins, and the coach is told", async () => {
  await withoutTimers(async () => {
    await openAdvance(false, { teamAnswer: withOne(ADVANCED) });
    choose(typeCard("primary"));
    choose(category("Agility"));
    choose(skill("Diving Catch"));
    api.fail(PATCH);
    fireEvent(take(), "click");
    await settle();
    assert.equal(summary(), "Waiting for the network · edits: 1");
    assert.equal(aside().querySelector(".g-roster__availn").textContent, "19", "drawn at once");
    await matchBegins(withOne(ADVANCED, { revision: 5 }));
    assert.equal(toasts().at(-1), DROPPED);
    assert.match(document.querySelectorAll("output").at(-1).className, /toast-error/);
    assert.ok(!sheet(), "R8: the window closes with the match");
    assert.equal(aside().querySelector(".g-roster__availn").textContent, "27", "the server's roster");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(patches().length, 1, "the one try before the network went");
  });
});

test("a refusal of the queue's 422 takes the advancement away: the done step closes, the roster read again", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne(ADVANCED) });
      walkTo("primary", "Agility", "Diving Catch");
      api.reply(PATCH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "SPP_OUT_OF_RANGE", params: { player: "Cade", counter: "TD" } }] });
      fireEvent(take(), "click");
      assert.ok(done());
      await settle();
      assert.ok(!sheet(), "the advancement it showed is no longer his");
      assert.ok(document.activeElement === advance());
      assert.equal(view.querySelector(".g-profile__availn").textContent, "27");
    });
  });
});

test("during a preparation the sheet says what a save resets", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openAdvance(phone, { games: [PREP_GAME] });
        assert.ok(sheet()?.isModal, "a preparation closes nothing");
        assert.equal(sheet().querySelector(".g-player-sheet__prep").textContent, prepResetWords());
        assertStyled(view, ...ADVANCE_STYLES);
      });
    }
  });
});

test("a refusal of the take is said in the sheet, which stays", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openAdvance(phone);
        if (phone) walkTo("primary", "Agility", "Diving Catch");
        else {
          choose(typeCard("primary"));
          choose(category("Agility"));
          choose(skill("Diving Catch"));
        }
        api.items.set("gata-league-auth-token", "another-tab");
        fireEvent(take(), "click");
        assert.equal(refusal().textContent, OTHER_TAB);
        assert.equal(refusal().getAttribute("role"), "alert");
        assert.ok(sheet()?.isModal, "the sheet stays");
        assert.equal(done(), null);
        assert.equal(skill("Diving Catch").getAttribute("aria-checked"), "true", "with what was chosen");
        await settle();
        assert.equal(patches().length, 0);
        assertStyled(view, ...ADVANCE_STYLES);
        // Choosing again: the refusal was the last press's.
        choose(skill("Leap"));
        assert.equal(refusal(), null);
      });
    }
  });
});

test("closed while the screen is locked: «Take» says why and sends nothing", async () => {
  await withoutTimers(async () => {
    await openAdvance(false);
    choose(typeCard("primary"));
    choose(category("Agility"));
    choose(skill("Diving Catch"));
    // The lock as the press finds it, before the screen is drawn again.
    state.games.loading = true;
    fireEvent(take(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    assert.equal(done(), null);
    state.games.loading = false;
    await settle();
    assert.equal(patches().length, 0);
  });
});

test("offers not known yet (no Skill Table): the types plain, with no price and nothing refused (K28)", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      coach();
      state.data = { ...state.data, skillGroups: undefined };
      await playerPage("p3");
      fireEvent(advance(), "click");
      assert.ok(sheet()?.isModal);
      assert.deepEqual(types().map(cardWords), [
        ["Random primary skill", null, null], ["Chosen primary skill", null, null], ["Chosen secondary skill", null, null], ["Characteristic improvement", null, null],
      ]);
      assert.ok(!types().some((card) => card.hasAttribute("aria-disabled")), "nothing refused for a table nobody has read");
      assert.ok(!sheet().textContent.includes("every skill"));
      choose(typeCard("primary"));
      assert.equal(typeCard("primary").getAttribute("aria-checked"), "true");
      assert.ok(next().hasAttribute("disabled"), "nothing to choose from until the table is in");
      assertCspSafe(view);
    });
  });
});

test("the player's name and a skill are text", async () => {
  await withoutTimers(async () => {
    await openAdvance(false, { teamAnswer: withOne({ ...CADE, name: HOSTILE }) });
    assert.equal(title(), `Advancement · ${HOSTILE}`);
    assert.ok(!sheet().querySelector("img"));
    assertCspSafe(view);
  });
});

test("every key in both dictionaries; styled; readable", () => {
  assertDictionaryCovers("src/screens/team/roster/advance.mjs", "src/screens/team/roster/advance-sheet.mjs", "src/screens/team/roster/panel.mjs");
  // The words name no player's gender (owner's answer on words).
  const gendered = { en: /\b(he|him|his|she|her|hers)\b/i, ru: /(?<![а-яё])(он|она|его|её|ему|ей|получил|получила)(?![а-яё])/iu };
  for (const [locale, pattern] of Object.entries(gendered)) {
    const words = Object.entries(JSON.parse(text(`src/i18n/${locale}.json`))).filter(([key]) => key.startsWith("teamAdvance.") && !key.startsWith("teamAdvance.refusal."));
    assert.ok(words.length >= 40, locale);
    assert.deepEqual(words.filter(([, value]) => pattern.test(value)), [], locale);
  }
  const css = text(ADVANCE);
  assert.doesNotMatch(css, /--focus-ring/);
  const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1].trim());
  assert.deepEqual(queries, ["(max-width: 900px)", "(min-width: 901px)"], "only the stage's two breakpoints");
  // Every rule sets what the 2.x globals would otherwise give: font, letter-spacing, text-transform.
  for (const selector of ["#player-advance .g-option__title", "#player-advance .g-option__sub", "#player-advance .g-option__pill", "#player-advance .g-advance__cat",
    "#player-advance .g-advance__letter", "#player-advance .g-advance__catname", "#player-advance .g-advance__free", "#player-advance .g-advance__hint",
    "#player-advance .g-advance__skill", "#player-advance .g-advance__tag", "#player-advance .g-advance__donetitle", "#player-advance .g-advance__how",
    "#player-advance .g-advance__tilekey", "#player-advance .g-advance__tilevalue", "#player-advance .g-advance__elite", "#player-advance .g-advance__status",
    "#player-advance .g-advance__coltitle", "#player-advance .g-advance__empty", "#player-advance .g-advance__summary"]) {
    for (const property of ["font", "letter-spacing", "text-transform"]) assert.ok(valuesOf(ADVANCE, selector, property).length >= 1, `${selector} ${property}`);
  }
  // The values of Adv1Type…Adv4Done up to 900px, then DeskRosterAdv.html.
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__cats", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__cat", "min-height"), ["112px", "72px"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__letter", "font"), ["700 20px/normal var(--font-display)"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__catname", "font"), ["700 17px/normal var(--font-body)", "700 16px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__hint", "font"), ["400 13px/1.45 var(--font-body)"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__donetitle", "font"), ["700 28px/1.1 var(--font-display)", "700 34px/normal var(--font-display)"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__tiles", "grid-template-columns"), ["repeat(3, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__cols", "grid-template-columns"), ["repeat(auto-fit, minmax(280px, 1fr))"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__cols", "min-height"), ["440px"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__coltitle", "font"), ["700 12px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__coltitle", "text-transform"), ["uppercase"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__coltitle", "letter-spacing"), [".08em"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__col--empty", "background"), ["color-mix(in srgb, var(--surface-2) 50%, var(--surface))"]);
  assert.deepEqual(valuesOf(ADVANCE, "dialog#player-advance", "width"), ["min(1080px, calc(100% - 32px))"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__skills", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  // Line heights are the prototypes': `normal` where they give none (Tasks 7 and 8's lesson).
  for (const selector of ["#player-advance .g-option__title", "#player-advance .g-option__sub", "#player-advance .g-option__pill", "#player-advance .g-advance__free",
    "#player-advance .g-advance__skill", "#player-advance .g-advance__tag", "#player-advance .g-advance__how", "#player-advance .g-advance__tilekey",
    "#player-advance .g-advance__tilevalue", "#player-advance .g-advance__summary"]) {
    assert.ok(valuesOf(ADVANCE, selector, "font").some((value) => /\/normal\b/.test(value)), `${selector}: line height normal`);
  }
  // Readable in every palette: the pill of the type chosen and of a refused one, the words of a refused type, the tags.
  assertReadable("src/ui/option-card.css", '.g-option[aria-checked="true"] .g-option__pill', "color", ["--accent"], 4.5);
  assertReadable(ADVANCE, '#player-advance .g-option[aria-disabled="true"] .g-option__pill', "color", ["--surface-2"], 4.5);
  assertReadable(ADVANCE, '#player-advance .g-option[aria-disabled="true"]', "color", ["--surface-2"], 4.5);
  assertReadable("src/ui/option-card.css", '.g-option[aria-disabled="true"] .g-option__sub', "color", ["--surface-2"], 4.5);
  assertReadable(ADVANCE, "#player-advance .g-advance__free", "color", ["--surface", "--accent-tint-soft"], 4.5);
  assertReadable(ADVANCE, "#player-advance .g-advance__hint", "color", ["--surface"], 4.5);
  assertReadable(ADVANCE, "#player-advance .g-advance__tag", "color", ["--surface", "--accent-tint-soft"], 4.5);
  assertReadable(ADVANCE, "#player-advance .g-advance__tag--held", "color", ["--surface"], 4.5);
  assertReadable(ADVANCE, "#player-advance .g-advance__how", "color", ["--surface"], 4.5);
  assertReadable(ADVANCE, "#player-advance .g-advance__tilekey", "color", ["--surface-2"], 4.5);
  assertReadable(ADVANCE, "#player-advance .g-advance__coltitle", "color", ["--surface"], 4.5);
  assertReadable(ADVANCE, "#player-advance .g-advance__empty", "color", ["color-mix(in srgb, var(--surface-2) 50%, var(--surface))"], 4.5);
  assertReadable(ADVANCE, "#player-advance .g-advance__summary", "color", ["--surface-2"], 4.5);
  // `g-advance__letter--${category}`: every category of the Skill Table with a colour of its own, each on its token.
  for (const category of ["agility", "devious", "general", "mutation", "passing", "strength"]) {
    assert.deepEqual(valuesOf(ADVANCE, `#player-advance .g-advance__letter--${category}`, "background"), [`var(--cat-${category})`]);
    assertContrast("--on-accent", [`--cat-${category}`], 4.5, { what: `a category's letter on --cat-${category}` });
  }
  // Imported after the profile's page and the player's sheets (K5: a relative order).
  const styles = text("src/styles.css");
  const at = (name) => styles.indexOf(`@import url("screens/team/roster/${name}");`);
  assert.ok(at("profile.css") >= 0 && at("player-sheets.css") > at("profile.css") && at("advance.css") > at("player-sheets.css"));
});

test("D2: up to 900px the types 64px or more, the skills 48px, the button 52px; from 901px the skills 40px, the buttons 48px", () => {
  const css = text(ADVANCE).replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (query) => {
    const start = css.indexOf(`@media (${query}) {`);
    assert.ok(start >= 0, `advance.css has no @media (${query})`);
    return css.slice(start, css.indexOf("\n}", start));
  };
  const px = (found) => (found ? found.slice(1).map(Number) : []);
  const phone = block("max-width: 900px");
  const desk = block("min-width: 901px");
  assert.deepEqual(valuesOf("src/ui/option-card.css", ".g-option", "min-height"), ["64px"], "a type's card, on both");
  assert.deepEqual(px(phone.match(/#player-advance \.g-advance__skill \{[^}]*min-height: (\d+)px;/)), [48], "a phone's skills");
  // A phone's button is the frame's (player-sheets.css), which this sheet does not resize.
  assert.ok(valuesOf("src/screens/team/roster/player-sheets.css", ".g-player-sheet .g-sheet__foot .g-btn", "height").includes("52px"), "a phone's button");
  assert.doesNotMatch(phone, /#player-advance \.g-sheet__foot \.g-btn \{/);
  assert.deepEqual(px(desk.match(/#player-advance \.g-advance__skill \{[^}]*min-height: (\d+)px;/)), [40], "a desk's skills");
  assert.deepEqual(px(desk.match(/#player-advance \.g-sheet__foot \.g-btn \{[^}]*min-height: (\d+)px;/)), [48], "a desk's buttons");
  assert.deepEqual(px(desk.match(/#player-advance \.g-sheet__head \.g-icon-btn \{[^}]*width: (\d+)px;/)), [44], "a desk's close");
});

// The owner's answer on wrapping: a long word wraps in its card; «…» hides nothing in 07d.
test("a long skill, category or refusal wraps in its card; nothing is cut with «…»", () => {
  const css = text(ADVANCE);
  assert.doesNotMatch(css, /text-overflow/);
  for (const selector of ["#player-advance .g-option__title", "#player-advance .g-option__sub", "#player-advance .g-advance__catname", "#player-advance .g-advance__skillname",
    "#player-advance .g-advance__donetitle", "#player-advance .g-advance__summary"]) {
    assert.deepEqual(valuesOf(ADVANCE, selector, "overflow-wrap"), ["anywhere"], selector);
  }
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-option__pill", "white-space"), ["nowrap"], "the price is short, and hides nothing");
});
