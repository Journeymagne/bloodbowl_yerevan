import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { document, mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { patch } from "../src/core/dom.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { dropPlayer, hirePlayer, newBuild } from "../src/domain/roster/build.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";
import { builderMarkup, wireBuilder } from "../src/screens/teams/builder-view.mjs";

// Stage 13, decision 21 (hand-offs 06 and 07c): the builder's «−» is disabled in place once its position is empty,
// and a disabled button keeps no focus, so the focus goes to the «+» of the same position, never to the page.

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const human = data.teams.find((team) => team.slug === "teams/human");
const rowOf = (position) => rowsForTeam(human).findIndex((row) => row.position === position);

const HANDLERS = ["onHire", "onStaff", "onToggleStaff", "onRefused", "onRosterToggle", "onNumber", "onName", "onCaptain", "onLogo", "onLogoRemove", "onChoiceOpen", "onChoose", "onChoiceClose", "onRestart", "onSave"];

/**
 * The builder as new.mjs draws it: a step changes the draft and patches the view at once, in the same turn, so the
 * nodes that stay are the same nodes (the «−» at zero among them).
 */
function builder() {
  mount('<section id="app-view"></section>');
  const view = document.querySelector("#app-view");
  const draft = newBuild(human, { name: "Iron Rooks" });
  const draw = () => patch(view, builderMarkup({ race: human, draft }));
  const handlers = Object.fromEntries(HANDLERS.map((name) => [name, () => {}]));
  handlers.onHire = (rowIndex, delta) => {
    if (delta > 0) hirePlayer(human, draft, rowIndex);
    else dropPlayer(human, draft, rowIndex);
    draw();
  };
  draw();
  const release = wireBuilder(view, handlers);
  const step = (position, delta) => view.querySelector(`[data-hire-key="${rowOf(position)}"] [data-hire-step="${delta}"]`);
  const count = (position) => view.querySelector(`[data-hire-key="${rowOf(position)}"] .g-hire__count`).textContent;
  const press = (button) => {
    button.focus();
    fireEvent(button, "click");
  };
  return { release, step, count, press };
}

test("a − that empties the cell keeps the focus on the cell: the builder's, on its +", () => {
  const { release, step, count, press } = builder();
  try {
    press(step("Thrower", 1));
    press(step("Thrower", 1));
    assert.equal(count("Thrower"), "2");
    assert.ok(document.activeElement === step("Thrower", 1), "the + keeps it while it steps");
    const minus = step("Thrower", -1);
    press(minus);
    assert.equal(count("Thrower"), "1");
    assert.ok(document.activeElement === minus, "a − that still steps keeps it");
    press(minus);
    assert.equal(count("Thrower"), "0");
    assert.ok(step("Thrower", -1) === minus && minus.hasAttribute("disabled"), "the − is disabled in place");
    assert.ok(document.activeElement === step("Thrower", 1), "the focus on the Thrower's +, not on a button that takes no press");
  } finally {
    release();
  }
});

test("a + the rules refuse keeps the focus: it is in reach and says why", () => {
  const { release, step, count, press } = builder();
  try {
    const plus = step("Ogre", 1);
    press(plus);
    assert.equal(count("Ogre"), "1");
    assert.equal(plus.getAttribute("aria-disabled"), "true", "the Ogre's maximum is one");
    assert.ok(document.activeElement === plus);
    press(step("Ogre", -1));
    assert.equal(count("Ogre"), "0");
    assert.ok(document.activeElement === step("Ogre", 1), "emptied, the Ogre's + again");
  } finally {
    release();
  }
});
