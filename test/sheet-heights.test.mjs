import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

import { mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { inMedia, mediaText } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { ADVANCED, PLAYERS, aside, coach, renderTeamRoster, team, toggle, view, withPlayers } from "./helpers/roster-page.mjs";

const { passwordSheetMarkup } = await import("../src/screens/settings/password-sheet.mjs");
const { newTeamSheetMarkup } = await import("../src/screens/teams/new-sheet.mjs");

// Stage 13, Task 7 (decision 12; hand-offs 07c, 07d): each window of a desk stands as high as its prototype puts it. The
// roster's: the advancement 64 (DeskRosterAdv.html), the hiring 80 (DeskRosterHire.html), the sale 120
// (DeskRosterSell.html); a player's edit, his fix by hand and the undo of his last advancement 120 (DeskRosterEdit.html);
// the mark of a missed match or a death and the undo of a death 120 — they have no window of their own, and stand as the
// pair «Miss a match… | Sell» does. The password 120 (DeskCoachPassword.html), a new team 64 (DeskTeamNew.html). The
// rest stand at sheet.css's 110 (DeskOverview, DeskSeason, DeskOppTeam, DeskAdminReset, DeskAdminCoachNew,
// DeskChallenges); the post-match's have no window in DeskPost*, so they take it too. The roster's own Cade (3, a
// Catcher) has ten touchdowns here, for his advancement; Hal and Ivo make the team nine, so one can be sold.

const CADE = { ...PLAYERS[2], spp: { touchdowns: 10 } };
const HAL = { id: "p8", rowIndex: 2, number: "8", name: "Hal" };
const IVO = { id: "p9", rowIndex: 0, number: "9", name: "Ivo" };
/** The team of nine with 120k: Cade can advance, Hal can be sold, a Lineman can be bought. */
const NINE = team({ roster: { players: [...PLAYERS.map((each) => (each.id === "p3" ? CADE : each)), HAL, IVO], treasury: 120 } });
/** The class of the dialog `id` on the roster, once what opens it is pressed. */
const classOf = (id) => view.querySelector(`dialog#${id}`)?.getAttribute("class") ?? null;
const topOf = (className) => className?.match(/\bg-sheet--at-(\d+)\b/)?.[1] ?? "110";
const press = (selector, root = view) => fireEvent(root.querySelector(selector), "click");

/** The roster drawn on a desk for the coach, with `open` in the panel. */
async function desk(teamAnswer, open) {
  coach({ teamAnswer, open });
  await renderTeamRoster("t1");
}

test("each sheet of the roster at its prototype's height", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: false }, async () => {
      const seen = {};
      await desk(NINE, "p3#0");
      press("[data-player-advance]");
      seen.advance = classOf("player-advance");
      await desk(NINE, "p3#0");
      press("[data-player-edit]");
      seen.edit = classOf("player-edit");
      await desk(withPlayers(PLAYERS.map((each) => (each.id === "p3" ? ADVANCED : each))), "p3#0");
      press("[data-player-edit]");
      press("[data-player-fix]");
      seen.fix = classOf("player-fix");
      press("[data-player-unadvance]");
      seen.unadvance = classOf("player-unadvance");
      await desk(NINE, "p8#0");
      press("[data-roster-sell]", aside());
      seen.sell = classOf("roster-sell");
      await desk(NINE, "p1#0");
      press("[data-roster-mark]", aside());
      seen.mark = classOf("roster-mark");
      await desk(NINE, null);
      press("[data-roster-hire]");
      seen.hire = classOf("roster-hire");
      await desk(team(), null);
      fireEvent(toggle("fallen-f1"), "click");
      press("[data-roster-undo]", aside());
      seen.undo = classOf("roster-undo");
      for (const [sheet, className] of Object.entries(seen)) assert.ok(className, `${sheet}: the sheet is open`);
      assert.deepEqual(Object.fromEntries(Object.entries(seen).map(([sheet, className]) => [sheet, topOf(className)])),
        { advance: "64", edit: "120", fix: "120", unadvance: "120", sell: "120", mark: "120", hire: "80", undo: "120" });
      assert.ok(seen.edit.includes("g-player-sheet") && seen.hire.includes("g-sheet--wide"), "each keeps its own frame and width");
    });
  });
});

test("the password stands at 120 and a new team at 64, as their prototypes put them", () => {
  const password = mount(passwordSheetMarkup({ current: "", next: "", repeat: "", show: false, pending: false, done: false, error: null })).querySelector("dialog");
  assert.equal(topOf(password.getAttribute("class")), "120", "DeskCoachPassword.html");
  const races = [{ slug: "teams/human", title: "Human" }];
  const fresh = mount(newTeamSheetMarkup({ name: "", raceSlug: "", races, seasonName: "", resets: false, back: false })).querySelector("dialog");
  assert.equal(topOf(fresh.getAttribute("class")), "64", "DeskTeamNew.html");
  assert.ok(fresh.classList.contains("g-new-sheet"));
});

/** Every module under src/ that draws a sheet, with the `at` its renderSheet calls pass ("" for none: the 110). */
function sheetCallers(dir = new URL("../src/", import.meta.url)) {
  const found = {};
  for (const name of readdirSync(dir)) {
    const path = new URL(name, dir);
    if (statSync(path).isDirectory()) Object.assign(found, sheetCallers(new URL(`${name}/`, dir)));
    else if (name.endsWith(".mjs") && !path.pathname.endsWith("/src/ui/sheet.mjs")) {
      const source = readFileSync(path, "utf8");
      const calls = [...source.matchAll(/renderSheet\(\{([\s\S]*?)\}\);/g)].map(([, props]) => props.match(/\bat: (\d+)/)?.[1] ?? "");
      if (calls.length) found[path.pathname.split("/src/")[1]] = calls.join(",");
    }
  }
  return found;
}

test("only the windows whose prototype stands them elsewhere say where; the rest take the 110", () => {
  const callers = sheetCallers();
  const asked = Object.fromEntries(Object.entries(callers).filter(([, tops]) => tops.replaceAll(",", "")));
  assert.deepEqual(asked, {
    "screens/settings/password-sheet.mjs": "120",
    "screens/team/roster/advance-sheet.mjs": "64,64",
    "screens/team/roster/fallen-view.mjs": "120",
    "screens/team/roster/fix.mjs": "120",
    "screens/team/roster/hire-sheet.mjs": "80",
    "screens/team/roster/mark-sheet.mjs": "120",
    "screens/team/roster/player-sheets.mjs": "120,120",
    "screens/team/roster/sell-sheet.mjs": "120",
    "screens/teams/new-sheet.mjs": "64",
  });
  // The administration's (stage 12), the post-match's (09b), the match's «Before the match», the team's, the skill's and
  // the friendlies' (09c: DeskChallenges.html's window at 110).
  for (const file of ["screens/admin/coach-sheets.mjs", "screens/admin/coach-new.mjs", "screens/admin/team-sheets.mjs", "screens/admin/season-entries.mjs",
    "screens/admin/result-sheet.mjs", "screens/matches/post-roster.mjs", "screens/matches/post-players.mjs", "screens/matches/before.mjs",
    "screens/team/manage/money-sheet.mjs", "screens/team/roster/sheets.mjs", "screens/matches/challenges-sheets.mjs"]) {
    assert.ok(file in callers, `${file} draws a sheet`);
    assert.ok(!(file in asked), `${file}: 110, as DeskAdminReset, DeskAdminCoachNew and DeskOverview put theirs`);
  }
});

test("no screen's stylesheet stands its own window: sheet.css does, but for the advancement's height", () => {
  for (const file of ["src/screens/team/roster/advance.css", "src/screens/teams/new.css", "src/screens/team/roster/player-sheets.css",
    "src/screens/admin/coach.css", "src/screens/admin/coaches.css", "src/screens/matches/challenges-sheets.css"]) {
    assert.ok(!/margin:\s*\d+px auto auto/.test(mediaText(file, "min-width: 901px")), `${file} sets no window's top`);
  }
  for (const [file, selector] of [["src/screens/teams/new.css", "dialog.g-sheet.g-new-sheet"], ["src/screens/team/roster/player-sheets.css", "dialog.g-sheet.g-player-sheet"],
    ["src/screens/admin/coach.css", "dialog.g-sheet.g-coachreset"], ["src/screens/admin/coaches.css", "dialog.g-sheet.g-coachnew"],
    ["src/screens/matches/challenges-sheets.css", "dialog.g-sheet.g-challenge-send"]]) {
    assert.deepEqual(inMedia(file, "min-width: 901px", selector, "max-height"), [], `${file}: sheet.css's, for its top`);
  }
  // DeskRosterAdv's window is as tall as the window lets it, 64 over it and 32 under it: its id keeps that over the 86dvh.
  assert.deepEqual(inMedia("src/screens/team/roster/advance.css", "min-width: 901px", "dialog#player-advance", "max-height"), ["calc(100dvh - 96px)"]);
  assert.deepEqual(inMedia("src/screens/team/roster/advance.css", "min-width: 901px", "dialog#player-advance", "margin"), []);
});
