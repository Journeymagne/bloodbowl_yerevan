import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, document, mount } from "./helpers/ui.mjs";
import { PALETTES, assertContrast, assertReadable, colourOf, contrast, inMedia, tokensOf, valuesOf } from "./helpers/contrast.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { BUTTON_KINDS, renderButton, renderIconButton } from "../src/ui/button.mjs";
import { wireRadioGroups } from "../src/ui/choice.mjs";
import { renderSegmentedControl, wireSegmentedControls } from "../src/ui/segmented-control.mjs";
import { renderToggle, wireToggles } from "../src/ui/toggle.mjs";

const MODES = [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }];

test("a primary button names its action and can say what is missing", () => {
  const fragment = mount(renderButton({ label: "Take Diving Catch", kind: "primary", disabled: true, icon: "check" }));
  const button = fragment.querySelector("button");
  assert.equal(button.getAttribute("type"), "button");
  assert.ok(button.classList.contains("g-btn") && button.classList.contains("g-btn--primary"));
  assert.ok(button.hasAttribute("disabled"));
  assert.equal(button.textContent, "Take Diving Catch");
  assert.ok(button.querySelector("svg.g-icon"));
  assertCspSafe(fragment);
  assertStyled(fragment, "button.css");
});

test("a button can be drawn hidden, for the screen to show it when it has something to do", () => {
  for (const props of [{}, { href: "#/login" }]) {
    const fragment = mount(renderButton({ label: "Save", hidden: true, ...props }));
    assert.equal(fragment.querySelector(".g-btn").hasAttribute("hidden"), true);
    assert.equal(mount(renderButton({ label: "Save", ...props })).querySelector(".g-btn").hasAttribute("hidden"), false);
  }
  const css = readFileSync(new URL("../src/ui/button.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.g-btn\[hidden\]\s*\{\s*display:\s*none;\s*\}/, ".g-btn sets a display, which would show a hidden button");
});

test("a button whose press is on its way says so without being disabled, which would take the focus from it", () => {
  const busy = mount(renderButton({ label: "Saving…", kind: "primary", busy: true })).querySelector("button");
  assert.deepEqual([busy.getAttribute("aria-busy"), busy.getAttribute("aria-disabled"), busy.hasAttribute("disabled")], ["true", "true", false]);
  const plain = mount(renderButton({ label: "Save", kind: "primary" })).querySelector("button");
  assert.deepEqual([plain.hasAttribute("aria-busy"), plain.hasAttribute("aria-disabled")], [false, false]);
});

test("every kind has its class, an unknown kind is a bug", () => {
  for (const kind of BUTTON_KINDS) {
    const fragment = mount(renderButton({ label: "x", kind, block: true }));
    assertStyled(fragment, "button.css");
    assert.ok(fragment.querySelector(".g-btn--block"), kind);
  }
  assert.throws(() => renderButton({ label: "x", kind: "ghost" }), /kind/);
});

test("Log out is red words in a grey ring, not a red border (M1, 6)", () => {
  const fragment = mount(renderButton({ label: "Log out", kind: "danger-quiet" }));
  assert.ok(fragment.querySelector("button.g-btn--danger-quiet"));
  assert.ok(BUTTON_KINDS.includes("danger-quiet"));
  assertStyled(fragment, "button.css");
  assert.deepEqual(valuesOf("src/ui/button.css", ".g-btn--danger-quiet", "border-color"), ["var(--control-border)"]);
  assert.deepEqual(valuesOf("src/ui/button.css", ".g-btn--danger-quiet", "color"), ["var(--danger)"]);
  assertReadable("src/ui/button.css", ".g-btn--danger-quiet", "color", ["--surface"], 4.5);
});

// The owner's answer after 07c: the one red filled button of an irreversible step (the sale, a team's delete) wears the
// prototypes' bright fill, #C4352A, with white words; red words elsewhere keep --danger (#A0473A in a light palette).
test("the filled danger button wears --danger-fill with --on-danger-fill, readable in every palette; nothing else wears the fill", () => {
  const fragment = mount(renderButton({ label: "Sell for 47.5k", kind: "danger" }));
  assert.ok(fragment.querySelector("button.g-btn--danger"));
  assertStyled(fragment, "button.css");
  const css = "src/ui/button.css";
  assert.deepEqual(valuesOf(css, ".g-btn--danger", "background"), ["var(--danger-fill)"]);
  assert.deepEqual(valuesOf(css, ".g-btn--danger", "border-color"), ["var(--danger-fill)"]);
  assert.deepEqual(valuesOf(css, ".g-btn--danger", "color"), ["var(--on-danger-fill)"]);
  assertReadable(css, ".g-btn--danger", "color", ["--danger-fill"], 4.5);
  assertReadable(css, ".g-btn--danger", "background", ["--surface"], 3);
  assert.deepEqual(valuesOf(css, ".g-btn--danger-quiet", "color"), ["var(--danger)"]);
  const sheets = readdirSync(new URL("../src/", import.meta.url), { recursive: true }).filter((name) => name.endsWith(".css") && !name.endsWith("tokens.css"));
  const wearers = sheets.filter((name) => /var\(\s*--(?:on-)?danger-fill\s*\)/.test(readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8")));
  assert.deepEqual(wearers.map((name) => name.split("\\").join("/")), ["ui/button.css"]);
});

// 07d fidelity F7: a closed red button used to be the red fill and the white label both dimmed by .g-btn:disabled's
// opacity (a pale red, 2.7:1 in a light palette and 3.7:1 in a dark one). The prototypes' closed main button is the
// grey fill with its full white label, and so is ours: the red shows only when the irreversible step can be taken.
test("a closed danger button is drawn as a closed primary is: the grey fill at full opacity under the undimmed label, in every palette", () => {
  const css = "src/ui/button.css";
  const fragment = mount(renderButton({ label: "Choose a race", kind: "danger", disabled: true }));
  const closed = fragment.querySelector("button");
  assert.ok(closed.hasAttribute("disabled") && closed.classList.contains("g-btn--danger"));
  assertStyled(fragment, "button.css");
  assert.deepEqual(valuesOf(css, ".g-btn:disabled", "opacity"), [".6"], "the base look still dims what is closed");
  // Both closed fills come from one rule, so the two cannot drift apart.
  for (const kind of ["primary", "danger"]) {
    const selector = `.g-btn--${kind}:disabled`;
    assert.deepEqual(valuesOf(css, selector, "background"), ["var(--disabled)"], selector);
    assert.deepEqual(valuesOf(css, selector, "border-color"), ["var(--disabled)"], selector);
    assert.deepEqual(valuesOf(css, selector, "opacity"), ["1"], `${selector}: neither the fill nor the label is dimmed`);
    assert.deepEqual(valuesOf(css, selector, "color"), [], `${selector}: the label keeps the colour of its kind`);
  }
  assert.deepEqual(valuesOf(css, ".g-btn--danger", "color"), ["var(--on-danger-fill)"]);
  // The label on the closed fill, in the four light palettes (a dark one draws no fill: the test below): never less
  // readable than the closed primary's (the same grey under a white label). The prototypes' own #A9B3AE under white is
  // 2.15:1, which is what a closed main button is there (WCAG 1.4.3 leaves an inactive control out); 2 is the floor.
  for (const palette of Object.keys(PALETTES).filter((key) => PALETTES[key] === "light")) {
    const tokens = tokensOf(palette);
    const [fill, danger, primary] = ["--disabled", "--on-danger-fill", "--on-accent"].map((name) => colourOf(`var(${name})`, tokens));
    const [red, main] = [contrast(danger, fill), contrast(primary, fill)];
    assert.ok(red >= main, `${palette}: the closed red label (${red.toFixed(2)}:1) is below the closed primary's (${main.toFixed(2)}:1)`);
    assert.ok(red >= 2, `${palette}: the closed red label is ${red.toFixed(2)}:1`);
  }
  assertReadable(css, ".g-btn--danger", "color", ["--danger-fill"], 4.5);
});

// Stage 13, decision 13 and the owner's answer 3: in a dark palette the grey fill of a closed main button read as one
// more grey button (M2: «almost no different from a plain grey one»). There it is drawn as closed: no fill, a dashed
// ring of --line-strong, the label --muted. The mode is data-mode on <html>, or the system's dark when theme-boot.js did
// not run (tokens.css's own fallback); a light palette keeps the prototypes' grey fill under the white label.
test("a closed main button in a dark palette is an outline, not a grey fill; its label reads 4.5:1", () => {
  const css = "src/ui/button.css";
  const closed = { background: ["transparent"], border: ["1.5px dashed var(--line-strong)"], color: ["var(--muted)"] };
  for (const kind of ["primary", "danger"]) {
    for (const [property, value] of Object.entries(closed)) {
      assert.deepEqual(valuesOf(css, `:root[data-mode="dark"] .g-btn--${kind}:disabled`, property), value, `${kind}, data-mode dark: ${property}`);
      assert.deepEqual(inMedia(css, "prefers-color-scheme: dark", `:root:not([data-mode]) .g-btn--${kind}:disabled`, property), value, `${kind}, the system's dark: ${property}`);
    }
    // The light look is the rule without a mode: the prototypes' grey fill, the label of its kind.
    assert.deepEqual(valuesOf(css, `.g-btn--${kind}:disabled`, "background"), ["var(--disabled)"], kind);
  }
  // Nothing dims it: the closed rule's opacity 1 still holds, so the muted label is what it is.
  assert.deepEqual(valuesOf(css, ".g-btn--primary:disabled", "opacity"), ["1"]);
  assertContrast("--muted", ["--page", "--surface"], 4.5, { what: "a closed main button's label" });
  // The two dark blocks say the same, so the mode set by hand and the system's dark cannot drift apart.
  const bare = readFileSync(new URL("../src/ui/button.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const bodies = [...bare.matchAll(/:root(?:\[data-mode="dark"\]|:not\(\[data-mode\]\)) \.g-btn--primary:disabled,\s*:root[^{]+\{([^}]*)\}/g)].map(([, body]) => body.replace(/\s+/g, " ").trim());
  assert.equal(bodies.length, 2, "one block for data-mode dark, one for the system's dark");
  assert.equal(bodies[0], bodies[1]);
});

// The 06 handoff: no call ever asked for a red-ringed button with red words; «Log out» is danger-quiet (M1, 6).
test("no danger-outline kind is left", () => {
  assert.deepEqual(BUTTON_KINDS, ["primary", "outline", "dark", "danger", "danger-quiet"]);
  assert.throws(() => renderButton({ label: "x", kind: "danger-outline" }), /unknown button kind: danger-outline/);
  const css = readFileSync(new URL("../src/ui/button.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /danger-outline/);
});

// The 07-desk handoff: a tile's count is sized by its container (cqi). A browser without container query units drops
// that declaration whole, and the count would fall to the stepper's base size; 15px, between the tile's 13 and 17,
// stands first in the same rule so the clamp overrides it wherever it is understood.
test("the stepper's figure has a size before its container query", () => {
  const sizes = valuesOf("src/ui/action-stepper.css", ".g-stepper--tile .g-stepper__value", "font-size");
  assert.deepEqual(sizes, ["15px", "clamp(13px, calc(26cqi - 7.6px), 17px)"]);
  const bare = readFileSync(new URL("../src/ui/action-stepper.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [rule] of bare.matchAll(/[^{}]+\{[^{}]*cq[iwhb][^{}]*\}/g)) {
    const declarations = rule.slice(rule.indexOf("{") + 1, -1).split(";").map((part) => part.trim()).filter(Boolean);
    const at = declarations.findIndex((declaration) => /\dcq[iwhb]\b/.test(declaration));
    const property = declarations[at].split(":")[0].trim();
    assert.ok(declarations.slice(0, at).some((declaration) => declaration.split(":")[0].trim() === property && !/cq[iwhb]\b/.test(declaration)),
      `${rule.split("{")[0].trim()}: ${property} has no size before its container query`);
  }
});

test("a button with an href is a link and never disabled", () => {
  const link = mount(renderButton({ label: "Profile", kind: "dark", href: "#/t/1/roster/p1", disabled: true })).querySelector("a");
  assert.equal(link.getAttribute("href"), "#/t/1/roster/p1");
  assert.equal(link.hasAttribute("disabled"), false);
});

test("a button that opens a dialog says so; a link cannot", () => {
  const button = mount(renderButton({ label: "New team", kind: "primary", dialog: true, data: { newTeam: true } })).querySelector("button");
  assert.equal(button.getAttribute("aria-haspopup"), "dialog");
  assert.equal(mount(renderButton({ label: "New team" })).querySelector("button").hasAttribute("aria-haspopup"), false, "only when asked");
  assert.throws(() => renderButton({ label: "New team", href: "#/teams/new", dialog: true }), /a link opens no dialog/);
});

test("labels and data are escaped", () => {
  const fragment = mount(renderButton({ label: HOSTILE, data: { player: HOSTILE } }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector("button").textContent, HOSTILE);
  assert.equal(fragment.querySelector("button").getAttribute("data-player"), HOSTILE);
});

test("an icon button cannot be built without a name", () => {
  assert.throws(() => renderIconButton({ icon: "close" }), /label/);
  const fragment = mount(renderIconButton({ icon: "close", label: "Close", data: { sheetClose: "" } }));
  assert.equal(fragment.querySelector("button.g-icon-btn").getAttribute("aria-label"), "Close");
  assertStyled(fragment, "button.css");
});

test("a segmented control is a radio group with one checked segment", () => {
  const fragment = mount(renderSegmentedControl({ label: "Mode", items: MODES, selected: "dark" }));
  const group = fragment.querySelector('[role="radiogroup"]');
  assert.equal(group.getAttribute("aria-label"), "Mode");
  assert.ok(group.classList.contains("g-seg--3"));
  const radios = fragment.querySelectorAll('[role="radio"]');
  assert.deepEqual(radios.map((radio) => radio.getAttribute("aria-checked")), ["false", "true", "false"]);
  assert.deepEqual(radios.map((radio) => radio.getAttribute("tabindex")), ["-1", "0", "-1"]);
  assertCspSafe(fragment);
  assertStyled(fragment, "segmented-control.css");
});

test("link segments mark the current page instead", () => {
  const fragment = mount(renderSegmentedControl({ label: "View", items: [{ value: "stats", label: "Stats", href: "#/a" }, { value: "spp", label: "SPP", href: "#/b" }], selected: "spp" }));
  assert.equal(fragment.querySelector('a[aria-current="page"]').getAttribute("href"), "#/b");
  assert.equal(fragment.querySelector('[role="radio"]'), null);
});

test("two or three segments, never one or four", () => {
  assert.throws(() => renderSegmentedControl({ label: "x", items: MODES.slice(0, 1), selected: "light" }), RangeError);
  assert.throws(() => renderSegmentedControl({ label: "x", items: [...MODES, { value: "x", label: "X" }], selected: "light" }), RangeError);
});

test("clicking or arrowing moves the selection, reports it, and stops when released", () => {
  const fragment = mount(renderSegmentedControl({ label: "Mode", items: MODES, selected: "light" }));
  const seen = [];
  const release = wireSegmentedControls(fragment, (value) => seen.push(value));
  fireEvent(fragment.querySelector('[data-seg-value="system"]'), "click");
  fireEvent(fragment.querySelector('[data-seg-value="system"]'), "click");
  assert.equal(fragment.querySelector('[aria-checked="true"]').getAttribute("data-seg-value"), "system");
  const key = fireEvent(fragment.querySelector('[data-seg-value="system"]'), "keydown", { key: "ArrowRight" });
  assert.equal(key.defaultPrevented, true);
  assert.equal(document.activeElement.getAttribute("data-seg-value"), "light", "wraps around");
  assert.deepEqual(seen, ["system", "light"], "a click on the checked segment reports nothing");
  release();
  fireEvent(fragment.querySelector('[data-seg-value="dark"]'), "click");
  assert.deepEqual(seen, ["system", "light"]);
});

// Both flip aria-checked before they report, so a group wired twice by the same selector reports once.
test("two groups on one root are wired by name, and each reports only its own", () => {
  const html = renderSegmentedControl({ label: "Language", items: [{ value: "ru", label: "RU" }, { value: "en", label: "EN" }], selected: "en", data: { segGroup: "language" } })
    + renderSegmentedControl({ label: "Mode", items: MODES, selected: "light", data: { segGroup: "mode" } });
  const fragment = mount(html);
  const seen = [];
  wireSegmentedControls(fragment, (value) => seen.push(["language", value]), { group: "language" });
  wireSegmentedControls(fragment, (value) => seen.push(["mode", value]), { group: "mode" });
  fireEvent(fragment.querySelector('[data-seg-group="mode"] [data-seg-value="dark"]'), "click");
  fireEvent(fragment.querySelector('[data-seg-group="language"] [data-seg-value="ru"]'), "click");
  const arrow = fireEvent(fragment.querySelector('[data-seg-group="mode"] [data-seg-value="dark"]'), "keydown", { key: "ArrowRight" });
  assert.equal(arrow.defaultPrevented, true);
  assert.deepEqual(seen, [["mode", "dark"], ["language", "ru"], ["mode", "system"]]);
  assert.throws(() => wireSegmentedControls(fragment, () => {}, { group: 'x"] [y' }), /group/);
});

test("a toggle is a switch row that flips and reports; a disabled one does not move", () => {
  const fragment = mount(renderToggle({ key: "matchReminders", label: "Match reminders", caption: HOSTILE }) + renderToggle({ key: "locked", label: "Locked", disabled: true }));
  const [live, locked] = fragment.querySelectorAll('[role="switch"]');
  assert.equal(live.getAttribute("aria-checked"), "false");
  assert.equal(fragment.querySelector(".g-toggle__caption").textContent, HOSTILE);
  const seen = [];
  wireToggles(fragment, (key, checked) => seen.push([key, checked]));
  fireEvent(live.querySelector(".g-toggle__knob"), "click");
  fireEvent(locked, "click");
  assert.equal(live.getAttribute("aria-checked"), "true");
  assert.equal(locked.getAttribute("aria-checked"), "false");
  assert.deepEqual(seen, [["matchReminders", true]]);
  assertCspSafe(fragment);
  assertStyled(fragment, "toggle.css");
});

// Stage 07d, Task 8: «Team captain» has the «C» before its words (PlayerEdit.html, DeskRosterEdit.html).
test("a switch may carry a mark before its words", () => {
  const plain = renderToggle({ key: "captain", label: "Team captain", caption: "The team has no captain" });
  const marked = renderToggle({ key: "captain", label: "Team captain", caption: "The team has no captain", leadHtml: '<span class="g-mark" aria-hidden="true">C</span>' });
  assert.equal(renderToggle({ key: "captain", label: "Team captain", caption: "The team has no captain", leadHtml: "" }), plain, "without one, as it was");
  assert.equal(marked, plain.replace('<span class="g-toggle__text">', '<span class="g-mark" aria-hidden="true">C</span><span class="g-toggle__text">'));
  const fragment = mount(marked);
  const button = fragment.querySelector('[role="switch"]');
  const parts = button.childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class"));
  assert.deepEqual(parts, ["g-mark", "g-toggle__text", "g-toggle__track"], "the mark first, then the words and the track");
  assert.equal(button.querySelector(".g-mark").getAttribute("aria-hidden"), "true");
  assertCspSafe(fragment);
});

test("a toggle another element describes names it, and is named by its label alone", () => {
  const fragment = mount(`${renderToggle({ key: "outside", label: "Edit outside the match", describedBy: "outside-note" })}<span id="outside-note" hidden>fix an old mistake</span>`
    + renderToggle({ key: "plain", label: "Plain" }));
  const [described, plain] = fragment.querySelectorAll('[role="switch"]');
  assert.equal(described.getAttribute("aria-describedby"), "outside-note");
  assert.equal(described.textContent, "Edit outside the match");
  assert.equal(plain.hasAttribute("aria-describedby"), false);
  // An id with a blank in it would be a list of two; with a quote, an attribute broken.
  for (const describedBy of ["two ids", 'x" onclick="y', "9x"]) assert.throws(() => renderToggle({ key: "x", label: "X", describedBy }), /describedBy/);
});

test("the default button is an outline button of type button, and a form can ask for submit", () => {
  const plain = mount(renderButton({ label: "Skip" })).querySelector("button");
  assert.equal(plain.getAttribute("class"), "g-btn");
  assert.equal(plain.getAttribute("type"), "button");
  assert.equal(plain.hasAttribute("disabled"), false);
  assert.equal(plain.querySelector("svg"), null);
  assert.equal(mount(renderButton({ label: "Save", type: "submit" })).querySelector("button").getAttribute("type"), "submit");
});

test("a button in a sheet's footer can belong to the form in its body", () => {
  const button = mount(renderButton({ label: "Change", kind: "primary", type: "submit", form: "password-form" })).querySelector("button");
  assert.equal(button.getAttribute("form"), "password-form");
  assert.equal(button.getAttribute("type"), "submit");
  assert.equal(mount(renderButton({ label: "Change", type: "submit" })).querySelector("button").hasAttribute("form"), false, "no form unless asked");
  assert.throws(() => renderButton({ label: "Change", form: 'a" onclick="x' }), /form/);
  assert.throws(() => renderButton({ label: "Go", href: "#/x", form: "f" }), /form/, "a link has no form to submit");
});

// Stage 07d, Task 10 (K6): a segment closed just now — the way a roll is made, once it is made on the site.
test("a closed segment says why, takes no click and is skipped by the arrows; the tab stop goes to an open one", () => {
  const items = [{ value: "light", label: "Light", disabled: true, reason: HOSTILE }, { value: "dark", label: "Dark" }, { value: "system", label: "System", disabled: true }];
  const fragment = mount(renderSegmentedControl({ label: "Mode", items, selected: "light" }));
  const radios = fragment.querySelectorAll('[role="radio"]');
  assert.deepEqual(radios.map((radio) => radio.getAttribute("aria-disabled")), ["true", null, "true"]);
  assert.deepEqual(radios.map((radio) => radio.getAttribute("title")), [HOSTILE, null, null], "the reason is its title, escaped");
  assert.deepEqual(radios.map((radio) => radio.getAttribute("aria-checked")), ["true", "false", "false"], "the closed one may still be the one shown");
  assert.deepEqual(radios.map((radio) => radio.getAttribute("tabindex")), ["-1", "0", "-1"], "the tab stop on the open one");
  assert.ok(radios.every((radio) => !radio.hasAttribute("disabled")), "aria-disabled, not disabled: a press can still say why");
  const seen = [];
  wireSegmentedControls(fragment, (value) => seen.push(value));
  fireEvent(radios[2], "click");
  assert.deepEqual(seen, [], "a click on a closed segment chooses nothing");
  fireEvent(radios[1], "click");
  fireEvent(radios[1], "keydown", { key: "ArrowRight" });
  assert.deepEqual(seen, ["dark"], "the arrows find no other open segment");
  // Every one closed: the one shown keeps the tab stop, so the group can still be reached and read.
  const shut = mount(renderSegmentedControl({ label: "Mode", items: MODES.map((item) => ({ ...item, disabled: true })), selected: "dark" }));
  assert.deepEqual(shut.querySelectorAll('[role="radio"]').map((radio) => radio.getAttribute("tabindex")), ["-1", "0", "-1"]);
  assertCspSafe(fragment);
});

test("a segmented control refuses what would leave it unusable", () => {
  const linked = [{ value: "stats", label: "Stats", href: "#/a" }, { value: "spp", label: "SPP" }];
  assert.throws(() => renderSegmentedControl({ label: "x", items: linked, selected: "stats" }), /all links or all buttons/);
  assert.throws(() => renderSegmentedControl({ label: "x", items: MODES, selected: "auto" }), /selected/);
});

test("segment labels, values and data are escaped", () => {
  const items = [{ value: HOSTILE, label: HOSTILE }, { value: "b", label: "B" }];
  const fragment = mount(renderSegmentedControl({ label: HOSTILE, items, selected: HOSTILE, data: { owner: HOSTILE } }));
  const group = fragment.querySelector('[role="radiogroup"]');
  assert.equal(group.getAttribute("aria-label"), HOSTILE);
  assert.equal(group.getAttribute("data-owner"), HOSTILE);
  assert.equal(fragment.querySelector('[role="radio"]').getAttribute("data-seg-value"), HOSTILE);
  assert.equal(fragment.querySelector('[role="radio"]').textContent, HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
});

const CHOICES = [["a", true, false], ["b", false, true], ["c", false, false], ["d", false, true]];

function mountChoices(onChange) {
  const choices = CHOICES.map(([value, on, disabled]) => `<button type="button" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}"${disabled ? ' aria-disabled="true"' : ""} data-choice="${value}">${value}</button>`).join("");
  const fragment = mount(`<div role="radiogroup" aria-label="Choice">${choices}</div>`);
  wireRadioGroups(fragment, { group: '[role="radiogroup"]', item: "[data-choice]", attribute: "data-choice", onChange });
  const at = (value) => fragment.querySelector(`[data-choice="${value}"]`);
  const press = (from, key, init = {}) => fireEvent(at(from), "keydown", { key, ...init });
  return { at, press, fragment };
}

test("arrows, Home and End move through a radio group, skip disabled items and wrap", () => {
  const seen = [];
  const { at, press } = mountChoices((value) => seen.push(value));
  const checked = () => at("a").parentNode.querySelectorAll('[aria-checked="true"]').map((item) => item.getAttribute("data-choice"));

  assert.equal(press("a", "ArrowRight").defaultPrevented, true);
  assert.deepEqual(checked(), ["c"], "b is disabled");
  assert.equal(document.activeElement, at("c"));
  assert.equal(at("c").getAttribute("tabindex"), "0");
  assert.equal(at("a").getAttribute("tabindex"), "-1");

  press("c", "ArrowRight");
  assert.deepEqual(checked(), ["a"], "d is disabled, so the walk wraps to a");
  press("a", "ArrowLeft");
  assert.deepEqual(checked(), ["c"], "and back the other way");
  press("c", "Home");
  assert.deepEqual(checked(), ["a"]);
  press("a", "End");
  assert.deepEqual(checked(), ["c"], "the last item that can be chosen");
  press("c", "ArrowDown");
  press("a", "ArrowUp");
  assert.deepEqual(seen, ["c", "a", "c", "a", "c", "a", "c"]);
});

test("a disabled item cannot be clicked, and a key that is not ours is left to the browser", () => {
  const seen = [];
  const { at, press } = mountChoices((value) => seen.push(value));
  fireEvent(at("b"), "click");
  assert.equal(at("b").getAttribute("aria-checked"), "false");
  assert.equal(at("a").getAttribute("aria-checked"), "true");

  for (const init of [{ key: "Tab" }, { key: "Enter" }, { key: "ArrowRight", altKey: true }, { key: "ArrowRight", ctrlKey: true }, { key: "Home", metaKey: true }]) {
    const event = press("a", init.key, init);
    assert.equal(event.defaultPrevented, false, JSON.stringify(init));
  }
  assert.deepEqual(seen, []);
  assert.equal(at("a").getAttribute("aria-checked"), "true");
});

test("arrowing from a focused disabled item still lands on one that can be chosen", () => {
  const { at, press } = mountChoices(() => {});
  press("b", "ArrowRight");
  assert.equal(at("c").getAttribute("aria-checked"), "true");
  assert.equal(document.activeElement, at("c"));
});

test("a click moves the roving tabindex, and groups under one root stay apart", () => {
  const group = (name) => `<div role="radiogroup" aria-label="${name}" data-group="${name}"><button type="button" role="radio" aria-checked="true" tabindex="0" data-choice="one">1</button><button type="button" role="radio" aria-checked="false" tabindex="-1" data-choice="two">2</button></div>`;
  const fragment = mount(group("first") + group("second"));
  const seen = [];
  wireRadioGroups(fragment, { group: '[role="radiogroup"]', item: "[data-choice]", attribute: "data-choice", onChange: (value, groupElement) => seen.push([value, groupElement.getAttribute("data-group")]) });
  const second = fragment.querySelector('[data-group="second"]');
  fireEvent(second.querySelector('[data-choice="two"]'), "click");
  assert.deepEqual(seen, [["two", "second"]]);
  assert.deepEqual(second.querySelectorAll("button").map((item) => item.getAttribute("tabindex")), ["-1", "0"]);
  const first = fragment.querySelector('[data-group="first"]');
  assert.deepEqual(first.querySelectorAll("button").map((item) => item.getAttribute("aria-checked")), ["true", "false"]);
});

test("an item outside any group is left alone", () => {
  const fragment = mount('<button type="button" role="radio" aria-checked="false" tabindex="-1" data-choice="x">x</button>');
  const seen = [];
  wireRadioGroups(fragment, { group: '[role="radiogroup"]', item: "[data-choice]", attribute: "data-choice", onChange: (value) => seen.push(value) });
  fireEvent(fragment.querySelector("button"), "click");
  const key = fireEvent(fragment.querySelector("button"), "keydown", { key: "ArrowRight" });
  assert.deepEqual(seen, []);
  assert.equal(key.defaultPrevented, false);
});

test("a toggle starts where it is told, flips back on the next click, and stops when released", () => {
  const fragment = mount(renderToggle({ key: "digest", label: "Digest", checked: true }));
  const button = fragment.querySelector("button");
  assert.equal(button.getAttribute("aria-checked"), "true");
  assert.equal(fragment.querySelector(".g-toggle__caption"), null, "no caption, no empty line");
  assert.equal(button.hasAttribute("disabled"), false);
  const seen = [];
  const release = wireToggles(fragment, (key, checked, source) => seen.push([key, checked, source === button]));
  fireEvent(button, "click");
  fireEvent(button, "click");
  assert.deepEqual(seen, [["digest", false, true], ["digest", true, true]]);
  assert.equal(button.getAttribute("aria-checked"), "true");
  release();
  fireEvent(button, "click");
  assert.equal(seen.length, 2);
  assert.equal(button.getAttribute("aria-checked"), "true");
});

test("toggle labels and keys are escaped and the track is hidden from a screen reader", () => {
  const fragment = mount(renderToggle({ key: HOSTILE, label: HOSTILE }));
  assert.equal(fragment.querySelector("button").getAttribute("data-toggle-key"), HOSTILE);
  assert.equal(fragment.querySelector(".g-toggle__label").textContent, HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector(".g-toggle__track").getAttribute("aria-hidden"), "true");
  assert.equal(fragment.querySelector(".g-toggle__knob").getAttribute("aria-hidden"), "true");
  assertCspSafe(fragment);
});

const HIDDEN_SCRIPT = ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "\x01javascript:alert(1)"];

test("a button needs a label: an icon draws nothing a screen reader hears", () => {
  assert.throws(() => renderButton({}), /label/);
  assert.throws(() => renderButton({ label: "", icon: "check", kind: "primary" }), /label/);
});

test("a button link refuses a javascript: href, however it is written", () => {
  for (const href of HIDDEN_SCRIPT) assert.throws(() => renderButton({ label: "Go", href }), /javascript:/, JSON.stringify(href));
});

test("a segmented control needs a label, and link segments refuse a javascript: href", () => {
  assert.throws(() => renderSegmentedControl({ items: MODES, selected: "light" }), /label/);
  assert.throws(() => renderSegmentedControl({ label: "", items: MODES, selected: "light" }), /label/);
  for (const href of HIDDEN_SCRIPT) {
    const items = [{ value: "stats", label: "Stats", href: "#/a" }, { value: "spp", label: "SPP", href }];
    assert.throws(() => renderSegmentedControl({ label: "View", items, selected: "stats" }), /javascript:/, JSON.stringify(href));
  }
});

test("link segments may have no current page; radio segments may not have none checked", () => {
  const links = [{ value: "stats", label: "Stats", href: "#/a" }, { value: "spp", label: "SPP", href: "#/b" }];
  const nav = mount(renderSegmentedControl({ label: "View", items: links, selected: "" }));
  assert.equal(nav.querySelector("[aria-current]"), null);
  assert.equal(nav.querySelectorAll("a").length, 2);
  assertCspSafe(nav);
  assert.throws(() => renderSegmentedControl({ label: "Mode", items: MODES, selected: "" }), /selected/);
});

test("a toggle needs a key, which is all its wiring reports, and a label", () => {
  assert.throws(() => renderToggle({ label: "Digest" }), /key/);
  assert.throws(() => renderToggle({ key: "", label: "Digest" }), /key/);
  assert.throws(() => renderToggle({ key: "digest" }), /label/);
  assert.throws(() => renderToggle({ key: "digest", label: "" }), /label/);
});
