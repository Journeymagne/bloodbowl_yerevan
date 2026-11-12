import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints } from "./helpers/css.mjs";
import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { renderSeeAll } from "../src/ui/see-all.mjs";

const CSS = "src/ui/see-all.css";
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("a see-all link: the words as given, the address checked, the card's class beside the kit's", () => {
  const link = mount(renderSeeAll({ label: "Whole table →", href: "#/t/t1/matches" })).querySelector("a");
  assert.deepEqual([link.getAttribute("class"), link.getAttribute("href"), link.textContent], ["g-seeall", "#/t/t1/matches", "Whole table →"]);
  const placed = mount(renderSeeAll({ label: HOSTILE, href: "#/season", className: "g-guest__more" })).querySelector("a");
  assert.deepEqual([placed.getAttribute("class"), placed.textContent], ["g-seeall g-guest__more", HOSTILE]);
  assert.throws(() => renderSeeAll({ label: "x", href: "javascript:alert(1)" }));
  assert.throws(() => renderSeeAll({ label: "", href: "#/season" }), /label/);
  const fragment = mount(renderSeeAll({ label: "Whole season →", href: "#/t/t1/matches" }));
  assertCspSafe(fragment);
  assertStyled(fragment, "see-all.css");
});

test("one look: the accent's text at 600 14px, no underline until hovered, whole on its line; 44 to touch on a phone, 24 on a desk", () => {
  assert.deepEqual(valuesOf(CSS, ".g-seeall", "font"), ["600 14px/1.2 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-seeall", "color"), ["var(--accent-text)"]);
  assert.deepEqual(valuesOf(CSS, ".g-seeall", "text-decoration"), ["none"]);
  assert.deepEqual(valuesOf(CSS, ".g-seeall:hover", "text-decoration"), ["underline"]);
  assert.deepEqual(valuesOf(CSS, ".g-seeall", "white-space"), ["nowrap"]);
  assert.deepEqual(valuesOf(CSS, ".g-seeall", "min-height"), ["var(--size-touch)", "24px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-seeall", "min-height"), ["24px"]);
  assertReadable(CSS, ".g-seeall", "color", ["--page", "--surface", "--surface-2"], 4.5);
  assertBreakpoints(CSS);
  const styles = read("src/styles.css");
  assert.ok(styles.indexOf('@import url("ui/see-all.css");') < styles.indexOf('@import url("screens/'), "among the ui/ sheets, before every screen's");
});

test("every card that shows part of a list leads to the whole with it, and none keeps a look of its own", () => {
  for (const [file, call] of [
    ["src/screens/team/overview-lists.mjs", 'renderSeeAll({ label: t("teamOverview.wholeSeason")'],
    ["src/screens/season/table.mjs", 'renderSeeAll({ label: t("teamOverview.tableAll")'],
    ["src/screens/matches/lists.mjs", 'renderSeeAll({ label: t("league.calendarAll")'],
    ["src/screens/home/guest.mjs", 'renderSeeAll({ label: t("guestHome.tableAll")'],
  ]) assert.ok(read(file).includes(call), `${file} draws the kit's link`);
  for (const [file, selector] of [["src/screens/season/table.css", ".g-matches__calall"], ["src/screens/home/guest.css", ".g-guest__more"]]) {
    for (const property of ["color", "font", "min-height", "text-decoration"]) assert.deepEqual(valuesOf(file, selector, property), [], `${selector} ${property} is the kit's`);
  }
  for (const gone of ["g-overview__all", "g-minitable__all"]) {
    for (const file of ["src/screens/team/overview-lists.css", "src/screens/season/table.css"]) assert.ok(!read(file).includes(gone), `${gone} left ${file}`);
  }
});
