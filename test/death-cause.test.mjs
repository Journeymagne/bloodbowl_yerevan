import assert from "node:assert/strict";
import test from "node:test";

import { assertCspSafe, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { PLAYERS, STYLES, api, aside, coach, died, openRow, renderTeamRoster, settle, toggle, view, withPlayers } from "./helpers/roster-page.mjs";

const { MARK_TEXT, chosenMark, markSheetMarkup } = await import("../src/screens/team/roster/mark-sheet.mjs");

// Stage 13, Task 9 (decision 16; hand-off 07b; pre-flight L22): the cause of a death is written in a field of two lines,
// as StatsMngDead.html (a phone: from 64px, 15/1.4, not resized, the help under it) and DeskRosterDeath.html (a desk:
// from 60px, 14/1.4, taller by hand) draw it. What it holds is counted as before — trimmed, up to the 500 the server
// keeps — and a refusal is said as before. Another reason's words stay one line: the field changes with the reason, and
// the words go with it.

const DEATH = "POST /api/teams/t1/players/p1/death";
const deaths = () => api.calls.filter(({ key }) => key === DEATH);
const markSheet = () => view.querySelector("dialog#roster-mark");
const markOption = (code) => markSheet().querySelectorAll('.g-option[role="radio"]').find((card) => card.getAttribute("data-option-value") === code);
const markText = () => markSheet().querySelector(`#${MARK_TEXT}`);
const sendButton = () => markSheet().querySelector("[data-mark-send]");
const MARK_SHEETS = [...STYLES, "option-card.css", "filter-chips.css", "text-field.css"];
/** The coach types `value` into the field of the cause or of another reason. */
const typeNote = (value) => {
  const field = markText();
  field.focus();
  field.value = value;
  fireEvent(field, "input");
};
/** Ann's sheet open from `root`'s «Miss a match…», «Dead» chosen. */
const chooseDeath = (root) => {
  fireEvent(root.querySelector("[data-roster-mark]"), "click");
  fireEvent(markOption("dead"), "click");
};
const withoutAnn = () => withPlayers(PLAYERS.filter((player) => player.id !== "p1"), { revision: 5 });
const annFell = (cause) => died("f9", { ...PLAYERS[0] }, { cause, diedAt: "2026-10-19T10:00:00Z" });

test("a death's cause is written on two lines, counted as before", async () => {
  for (const phone of [true, false]) {
    await withWindow({ phone }, async () => {
      coach({ open: "p1#0" });
      await renderTeamRoster("t1");
      chooseDeath(phone ? openRow() : aside());
      const area = markText();
      assert.equal(area.tagName, "TEXTAREA", phone ? "StatsMngDead.html" : "DeskRosterDeath.html");
      assert.equal(area.getAttribute("rows"), "2");
      assert.equal(area.getAttribute("class"), "g-field__input g-field__input--area");
      assert.equal(area.getAttribute("name"), MARK_TEXT);
      assert.equal(markSheet().querySelector(`label[for="${MARK_TEXT}"]`).textContent, "Cause of death");
      assert.equal(markSheet().querySelector(`#${MARK_TEXT}-help`).textContent, "Seen on the roster and in the team's history. The player moves to «Fallen».");
      assert.equal(area.getAttribute("aria-describedby"), `${MARK_TEXT}-help`);
      assert.equal(area.hasAttribute("readonly"), false);
      assert.equal(sendButton().textContent, "Write the cause of death");
      typeNote("Foul\nby the Raiders");
      assert.equal(sendButton().textContent, "Mark the death", "a cause of two lines is a cause");
      typeNote(" \n \n ");
      assert.equal(sendButton().textContent, "Write the cause of death", "blank lines are no words");
      assert.ok(sendButton().hasAttribute("disabled"));
      typeNote(`${"x".repeat(250)}\n${"x".repeat(250)}`);
      assert.equal(sendButton().textContent, "No longer than 500 characters", "a line break is a character, as the server counts it");
      assert.ok(sendButton().hasAttribute("disabled"));
      typeNote(`\n ${"x".repeat(250)}\n${"x".repeat(249)} \n`);
      assert.equal(sendButton().textContent, "Mark the death", "trimmed first");
      typeNote("Fo\u0000ul\nby the Raiders");
      assert.equal(sendButton().textContent, "Write the cause of death", "a NUL the server refuses is no cause");
      typeNote("Foul\nby the Raiders");
      assert.ok(markText() === area, "the field the coach types in is kept through the redraws");
      assert.ok(document.activeElement === area);
      assertCspSafe(view);
      assertStyled(view, ...MARK_SHEETS);
      // Another reason's words stay one line; the words go with the reason, both ways.
      fireEvent(markOption("other"), "click");
      assert.equal(markText().tagName, "INPUT");
      assert.equal(markText().getAttribute("value"), "Foul by the Raiders", "a line break is a space on one line");
      assert.equal(markSheet().querySelectorAll(`#${MARK_TEXT}`).length, 1);
      fireEvent(markOption("dead"), "click");
      assert.equal(markText().tagName, "TEXTAREA");
      assert.equal(markText().value, "Foul\nby the Raiders");
      assert.equal(sendButton().textContent, "Mark the death");
      assert.equal(deaths().length, 0);
    });
  }
});

test("the cause goes as written, trimmed, and cannot be typed over on its way; a refusal is said as before", async () => {
  await withoutTimers(async () => {
    coach({ open: "p1#0" });
    await renderTeamRoster("t1");
    chooseDeath(aside());
    typeNote("  Foul\nby the Raiders \n");
    api.reply(DEATH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "DUPLICATE_PLAYER_ID", params: { names: "Ann, Bo" } }] });
    fireEvent(sendButton(), "click");
    await settle();
    assert.deepEqual(deaths().map(({ body }) => body), [{ cause: "Foul\nby the Raiders", revision: 4 }], "one POST, the cause trimmed, its line kept");
    const refusal = markSheet().querySelector(".g-roster__markrefusal");
    assert.equal(refusal.getAttribute("role"), "alert");
    assert.match(refusal.textContent, /Ann, Bo/);
    assert.equal(markText().tagName, "TEXTAREA");
    assert.equal(markText().value, "  Foul\nby the Raiders \n", "the words stay as typed");
    assert.equal(markText().hasAttribute("readonly"), false);
    // On its way the cause cannot be typed over, and the field is still read.
    const death = api.hold(DEATH);
    fireEvent(sendButton(), "click");
    await settle();
    assert.ok(markText().hasAttribute("readonly"));
    assert.equal(markText().hasAttribute("disabled"), false);
    death.release({ status: 201, body: { team: withoutAnn(), fallen: annFell("Foul\nby the Raiders") } });
    await settle();
    assert.equal(deaths().length, 2);
    assert.equal(deaths()[1].body.cause, "Foul\nby the Raiders");
    assert.ok(!markSheet(), "marked: the sheet closes");
    assert.ok(toggle("fallen-f9"), "she is among the fallen");
  });
});

test("the sheet draws the field the reason asks for: two lines for a death, one for another reason, none for an injury", () => {
  const line = { number: "1", name: "Ann", position: "Lineman" };
  const sheet = (choice, busy = false) => {
    const host = document.createElement("div");
    host.innerHTML = markSheetMarkup({ line, choice: { stat: "", text: "Foul", ...choice }, busy });
    return host;
  };
  assert.equal(sheet({ code: "dead" }).querySelector(`textarea#${MARK_TEXT}`).value, "Foul");
  assert.equal(sheet({ code: "dead" }).querySelector("input"), null);
  assert.ok(sheet({ code: "dead" }, true).querySelector(`textarea#${MARK_TEXT}`).hasAttribute("readonly"), "busy: not typed over");
  assert.equal(sheet({ code: "other" }).querySelector(`input#${MARK_TEXT}`).getAttribute("value"), "Foul");
  assert.equal(sheet({ code: "other" }).querySelector("textarea"), null);
  for (const code of ["", "miss", "niggling", "lasting"]) assert.equal(sheet({ code }).querySelector(`#${MARK_TEXT}`), null, code);
});

test("a cause keeps its lines; another reason's note, written on one line, keeps none", () => {
  assert.deepEqual(chosenMark({ code: "dead", stat: "", text: " Foul\nby the Raiders\n" }), { code: "dead", cause: "Foul\nby the Raiders" });
  assert.deepEqual(chosenMark({ code: "other", stat: "", text: " Wedding\nin Yerevan\n" }), { code: "other", note: "Wedding in Yerevan" });
  assert.deepEqual(chosenMark({ code: "other", stat: "", text: "Wedding" }), { code: "other", note: "Wedding" }, "as before");
  assert.equal(chosenMark({ code: "dead", stat: "", text: "x".repeat(501) }), null, "500 at most, as before");
  assert.deepEqual(chosenMark({ code: "dead", stat: "", text: ` ${"x".repeat(500)} ` }), { code: "dead", cause: "x".repeat(500) });
});
