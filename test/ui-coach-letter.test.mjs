import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { assertContrast, assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { COACH_LETTER_SIZES, coachInitial, renderCoachLetter } from "../src/ui/coach-letter.mjs";

/*
 * One coach's letter in its circle (stage 13; 09c's hand-off, ruling L27): the administration's (stage 12's
 * `avatarMarkup`), a coach's profile's (stage 10's `initial`) and the friendlies' (09c's `coachInitial`) were three
 * copies of one circle; they are the kit's now, at the prototypes' sizes.
 */
const CSS = "src/ui/coach-letter.css";
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("a coach's letter: the login's first letter in capitals, in a circle of the prototypes' sizes, hidden from a screen reader", () => {
  assert.deepEqual(COACH_LETTER_SIZES, [36, 40, 44, 64]);
  for (const size of COACH_LETTER_SIZES) {
    const letter = mount(renderCoachLetter({ initial: coachInitial("orc_boss"), size })).querySelector("span");
    assert.equal(letter.getAttribute("class"), `g-coach-letter g-coach-letter--${size}`);
    assert.equal(letter.textContent, "O");
    assert.equal(letter.getAttribute("aria-hidden"), "true", "the login beside it is what is read");
  }
  assert.deepEqual([coachInitial("  élan"), coachInitial("𝔊rim"), coachInitial(""), coachInitial("   "), coachInitial(null)], ["É", "𝔊", "?", "?", "?"]);
  assert.throws(() => renderCoachLetter({ initial: "O", size: 48 }), RangeError);
  // A screen's hook for its own figure (ChallengeSend's 17px letter, DeskCoachProfile's 72).
  assert.equal(mount(renderCoachLetter({ initial: "O", size: 36, className: "g-challenge__letter" })).querySelector("span").getAttribute("class"), "g-coach-letter g-coach-letter--36 g-challenge__letter");
  const hostile = mount(renderCoachLetter({ initial: coachInitial(HOSTILE), size: 64 }));
  assert.equal(hostile.querySelector("span").textContent, "<");
  assertCspSafe(hostile);
  assertStyled(hostile, "coach-letter.css");
});

test("its sizes and colours: the letter half the circle, white Oswald on the header's green, readable in every palette", () => {
  for (const size of COACH_LETTER_SIZES) {
    const selector = `.g-coach-letter--${size}`;
    assert.deepEqual([valuesOf(CSS, selector, "width"), valuesOf(CSS, selector, "height"), valuesOf(CSS, selector, "font-size")], [[`${size}px`], [`${size}px`], [`${size / 2}px`]], selector);
  }
  assert.deepEqual(valuesOf(CSS, ".g-coach-letter", "border-radius"), ["var(--radius-full)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coach-letter", "background"), ["var(--header)"]);
  assertReadable(CSS, ".g-coach-letter", "color", ["--header"], 4.5);
  assertContrast("--header-ink", ["--header"], 4.5);
  assert.match(read("src/styles.css"), /@import url\("ui\/coach-letter\.css"\);/);
});

test("no screen draws a circle of its own: every one is the kit's", () => {
  const scripts = readdirSync(new URL("../src/", import.meta.url), { recursive: true })
    .map((name) => `src/${name.split("\\").join("/")}`).filter((file) => file.endsWith(".mjs") && file !== "src/ui/coach-letter.mjs");
  const drawing = scripts.filter((file) => read(file).includes("renderCoachLetter(")).sort();
  assert.deepEqual(drawing, ["src/screens/admin/coach.mjs", "src/screens/admin/coaches.mjs", "src/screens/coaches/profile.mjs",
    "src/screens/matches/challenges-sheets.mjs", "src/screens/matches/challenges-view.mjs"]);
  for (const file of scripts) {
    assert.doesNotMatch(read(file), /avatarMarkup|g-admin__avatar|g-friendly__letter|class="g-coach__letter"|class="g-challenge__letter"/, file);
    assert.doesNotMatch(read(file), /export function coachInitial/, `${file}: the kit's coachInitial`);
  }
  // The screens' sheets keep only their own figures: ChallengeSend's 17, the desk's chip of 28, DeskCoachProfile's 72.
  assert.deepEqual(valuesOf("src/screens/matches/challenges-sheets.css", ".g-challenge__letter", "width"), []);
  assert.deepEqual(valuesOf("src/screens/coaches/profile.css", ".g-coach__letter", "background"), []);
  assert.deepEqual(valuesOf("src/screens/coaches/profile.css", ".g-coach__letter", "width"), ["72px"]);
  for (const sheet of ["src/screens/admin/admin.css", "src/screens/matches/challenges.css"]) assert.doesNotMatch(read(sheet), /avatar|__letter/, sheet);
});
