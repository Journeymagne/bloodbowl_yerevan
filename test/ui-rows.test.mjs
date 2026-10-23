import assert from "node:assert/strict";
import test from "node:test";

import { assertReadable, inMedia, tokensOf, valuesOf } from "./helpers/contrast.mjs";
import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { renderButton } from "../src/ui/button.mjs";
import { CALLOUT_TONES, renderCallout } from "../src/ui/callout.mjs";
import { renderKeyValueRow, renderNavRow, renderRankedRow } from "../src/ui/list-row.mjs";
import { TEXT_FIELD_TYPES, renderTextField } from "../src/ui/text-field.mjs";
import { renderToggle } from "../src/ui/toggle.mjs";

test("a text field ties its label, help and error to the input", () => {
  const fragment = mount(renderTextField({ id: "login", name: "login", label: "Login", value: HOSTILE, help: "3+ characters", error: "Taken", autocomplete: "username", required: true }));
  const input = fragment.querySelector("input.g-field__input");
  assert.equal(fragment.querySelector("label").getAttribute("for"), "login");
  assert.equal(input.getAttribute("value"), HOSTILE);
  assert.equal(input.getAttribute("autocomplete"), "username");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(input.getAttribute("aria-describedby"), "login-help login-error");
  assert.equal(fragment.querySelector("#login-error").textContent, "Taken");
  assert.ok(input.hasAttribute("required"));
  assert.ok(fragment.querySelector(".g-field--invalid"));
  assertCspSafe(fragment);
  assertStyled(fragment, "text-field.css");
});

test("without help or error nothing points at ids that are not there", () => {
  const input = mount(renderTextField({ id: "tg", name: "telegram", label: "Telegram", type: "text" })).querySelector("input");
  assert.equal(input.hasAttribute("aria-describedby"), false);
  assert.equal(input.hasAttribute("aria-invalid"), false);
  assert.equal(input.hasAttribute("placeholder"), false);
});

test("a text field names only the lines it draws, and draws only what it was given", () => {
  const describedBy = (props) => mount(renderTextField({ id: "f", name: "f", label: "F", ...props })).querySelector("input").getAttribute("aria-describedby");
  assert.equal(describedBy({ help: "Seen by opponents" }), "f-help");
  assert.equal(describedBy({ error: "Required" }), "f-error");

  const helpOnly = mount(renderTextField({ id: "f", name: "f", label: "F", help: "Seen by opponents" }));
  assert.equal(helpOnly.querySelector("#f-help").textContent, "Seen by opponents");
  assert.equal(helpOnly.querySelector(".g-field__error"), null);
  assert.equal(helpOnly.querySelector("input").hasAttribute("aria-invalid"), false);
  assert.equal(helpOnly.querySelector(".g-field--invalid"), null);

  const errorOnly = mount(renderTextField({ id: "f", name: "f", label: "F", error: "Required" }));
  assert.equal(errorOnly.querySelector(".g-field__help"), null);
  assert.equal(errorOnly.querySelector("input").getAttribute("aria-invalid"), "true");
});

test("a field the form's one message is about is marked invalid without a line of its own", () => {
  const fragment = mount(renderTextField({ id: "f", name: "f", label: "F", help: "Seen by opponents", invalid: true }));
  const input = fragment.querySelector("input");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(input.getAttribute("aria-describedby"), "f-help");
  assert.ok(fragment.querySelector(".g-field--invalid"));
  assert.equal(fragment.querySelector(".g-field__error"), null);
  assertStyled(fragment, "text-field.css");
  assert.equal(mount(renderTextField({ id: "f", name: "f", label: "F", invalid: false })).querySelector("input").hasAttribute("aria-invalid"), false);
});

test("a field can point at what a form says about it elsewhere, and only at an id", () => {
  const input = mount(renderTextField({ id: "f", name: "f", label: "F", help: "Seen by opponents", invalid: true, describedBy: "form-alert" })).querySelector("input");
  assert.equal(input.getAttribute("aria-describedby"), "f-help form-alert");
  assert.equal(mount(renderTextField({ id: "f", name: "f", label: "F", describedBy: "form-alert" })).querySelector("input").getAttribute("aria-describedby"), "form-alert");
  for (const id of ["two ids", 'a"b']) assert.throws(() => renderTextField({ id: "f", name: "f", label: "F", describedBy: id }), /described/);
});

test("a verbatim field is not capitalised, corrected or spell-checked; any other field is left to the browser", () => {
  const verbatim = mount(renderTextField({ id: "f", name: "login", label: "Login", verbatim: true })).querySelector("input");
  assert.deepEqual(["autocapitalize", "autocorrect", "spellcheck"].map((name) => verbatim.getAttribute(name)), ["none", "off", "false"]);
  const plain = mount(renderTextField({ id: "f", name: "nick", label: "Nick" })).querySelector("input");
  for (const name of ["autocapitalize", "autocorrect", "spellcheck"]) assert.equal(plain.hasAttribute(name), false, name);
});

test("a text field is a text input unless told otherwise, and says only what it was told", () => {
  const plain = mount(renderTextField({ id: "f", name: "nick", label: "F" })).querySelector("input");
  assert.equal(plain.getAttribute("type"), "text");
  assert.equal(plain.getAttribute("name"), "nick");
  assert.equal(plain.getAttribute("value"), "");
  for (const attribute of ["autocomplete", "inputmode", "placeholder", "required", "readonly", "disabled"]) assert.equal(plain.hasAttribute(attribute), false, attribute);

  const full = mount(renderTextField({ id: "f", name: "f", label: "F", type: "tel", autocomplete: "tel", inputmode: "numeric", placeholder: HOSTILE })).querySelector("input");
  assert.equal(full.getAttribute("type"), "tel");
  assert.equal(full.getAttribute("inputmode"), "numeric");
  assert.equal(full.getAttribute("placeholder"), HOSTILE);
});

test("a read-only field can be focused and read but not typed over, and is not disabled", () => {
  const input = mount(renderTextField({ id: "f", name: "f", label: "F", value: "70", readonly: true })).querySelector("input");
  assert.deepEqual([input.hasAttribute("readonly"), input.hasAttribute("disabled"), input.getAttribute("value")], [true, false, "70"]);
});

test("a text field escapes every string it is given", () => {
  const fragment = mount(renderTextField({ id: "f", name: HOSTILE, label: HOSTILE, value: HOSTILE, help: HOSTILE, error: HOSTILE }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector("label").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-field__help").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-field__error").textContent, HOSTILE);
  assert.equal(fragment.querySelector("input").getAttribute("name"), HOSTILE);
  assertCspSafe(fragment);
});

test("a text field is named, and its id is one an id list can hold", () => {
  assert.throws(() => renderTextField({ name: "x", label: "X" }), /id/);
  assert.throws(() => renderTextField({ id: "two words", name: "x", label: "X" }), /id/);
  assert.throws(() => renderTextField({ id: 'a"b', name: "x", label: "X" }), /id/);
  assert.throws(() => renderTextField({ id: "", name: "x", label: "X" }), /id/);
  assert.throws(() => renderTextField({ id: "x", name: "x", label: "" }), /label/);
  assert.doesNotThrow(() => renderTextField({ id: "new-password_2", name: "x", label: "X" }));
});

test("a callout with a link is one link with a chevron", () => {
  const fragment = mount(renderCallout({ title: "Advancement available", sub: HOSTILE, href: "#/t/1/roster/p1" }));
  const link = fragment.querySelector("a.g-callout");
  assert.equal(link.getAttribute("href"), "#/t/1/roster/p1");
  assert.equal(link.querySelector(".g-callout__sub").textContent, HOSTILE);
  assert.ok(link.querySelector("svg.g-icon"));
  assertCspSafe(fragment);
  assertStyled(fragment, "callout.css");
});

test("a fault leads with the «!» sign; news and a warning do not", () => {
  assert.ok(mount(renderCallout({ title: "Wrong", tone: "danger" })).querySelector(".g-callout--danger .g-callout__icon svg.g-icon"));
  assert.equal(mount(renderCallout({ title: "News" })).querySelector(".g-callout__icon"), null);
  assert.equal(mount(renderCallout({ title: "Mind", tone: "warn" })).querySelector(".g-callout__icon"), null);
  const link = mount(renderCallout({ title: "Wrong", tone: "danger", href: "#/x" })).querySelector("a.g-callout");
  assert.equal(link.firstChild.getAttribute("class"), "g-callout__icon", "a danger link leads with it too, before its text");
  assert.equal(mount(renderCallout({ title: "Wrong", tone: "danger" })).querySelector(".g-callout").firstChild.getAttribute("class"), "g-callout__icon", "and so does a plain banner");
  assert.equal(mount(renderCallout({ title: "Wrong", tone: "danger" })).querySelector(".g-callout__icon svg").getAttribute("aria-hidden"), "true");
  const fragment = mount(renderCallout({ title: "Wrong", tone: "danger" }));
  assertStyled(fragment, "callout.css");
  assert.deepEqual(valuesOf("src/ui/callout.css", ".g-callout__icon", "color"), ["var(--danger)"]);
  assertReadable("src/ui/callout.css", ".g-callout__icon", "color", ["--danger-tint"], 3);
  assert.deepEqual(valuesOf("src/ui/callout.css", ".g-callout--danger", "align-items"), ["flex-start"], "the sign stands at the first line of a refusal; an accent or warn banner's chevron or action stays centred");
  assert.deepEqual(valuesOf("src/ui/callout.css", ".g-callout--danger", "align-content"), ["center"], "a one-line refusal sits in the middle of the box, not at its top");
});

test("a match banner carries its toggle and is not a link", () => {
  const fragment = mount(renderCallout({ title: "Match in progress · round 7", tone: "warn", actionHtml: renderToggle({ key: "offMatch", label: "Edit outside the match" }) }));
  assert.equal(fragment.querySelector("a"), null);
  assert.ok(fragment.querySelector(".g-callout--warn .g-callout__action [role=\"switch\"]"));
  assertStyled(fragment, "callout.css", "toggle.css");
});

test("a callout cannot be both, and its tones are fixed", () => {
  assert.throws(() => renderCallout({ title: "x", href: "#/", actionHtml: "<b>y</b>" }), /href/);
  assert.throws(() => renderCallout({ title: "x", tone: "info" }), /tone/);
  assertStyled(mount(renderCallout({ title: "Score does not match the records", tone: "danger" })), "callout.css");
});

test("every tone has its look and the accent one is the base", () => {
  assert.deepEqual(CALLOUT_TONES, ["accent", "warn", "danger"]);
  for (const tone of CALLOUT_TONES) {
    for (const props of [{ href: "#/x" }, { actionHtml: "<span>y</span>" }, {}]) {
      const fragment = mount(renderCallout({ title: "x", tone, ...props }));
      const callout = fragment.querySelector(".g-callout");
      assert.equal(callout.classList.contains(`g-callout--${tone}`), tone !== "accent", tone);
      assertStyled(fragment, "callout.css");
    }
  }
});

test("a callout says what it was given and nothing else", () => {
  const bare = mount(renderCallout({ title: HOSTILE })).querySelector(".g-callout");
  assert.equal(bare.tagName, "DIV");
  assert.equal(bare.querySelector(".g-callout__title").textContent, HOSTILE);
  assert.equal(bare.querySelector(".g-callout__sub"), null);
  assert.equal(bare.querySelector(".g-callout__action"), null);
  assert.equal(bare.querySelector("svg"), null, "no destination, no chevron");
  assert.equal(bare.querySelector("img"), null);

  const link = mount(renderCallout({ title: "x", href: '#/a?b="c"&d=<e>' })).querySelector("a");
  assert.equal(link.getAttribute("href"), '#/a?b="c"&d=<e>');
  assert.equal(link.querySelector(".g-callout__sub"), null);
});

test("a callout has a title", () => {
  assert.throws(() => renderCallout({ title: "" }), /title/);
  assert.throws(() => renderCallout({ sub: "x" }), /title/);
});

test("a link that would run script is refused, not drawn as a link", () => {
  for (const href of ["javascript:alert(1)", "JavaScript:alert(1)", "  javascript:alert(1)", "\tjava\nscript:alert(1)", "\u0001javascript:alert(1)"]) {
    assert.throws(() => renderCallout({ title: "x", href }), /javascript:/, JSON.stringify(href));
    assert.throws(() => renderNavRow({ href, title: "x" }), /javascript:/, JSON.stringify(href));
  }
  // A path that only mentions the word is a path.
  assertCspSafe(mount(renderCallout({ title: "x", href: "#/ref/javascript:" }) + renderNavRow({ href: "/ref/javascript:", title: "y" })));
});

test("rows: navigation, key–value and ranked", () => {
  const fragment = mount(
    renderNavRow({ href: "#/ref/skills", title: "Skills", desc: "By category", count: "84" })
    + renderKeyValueRow({ label: "Apothecary", value: "50k" })
    + renderRankedRow({ leadHtml: "<span>1</span>", title: HOSTILE, caption: "Human · 3rd", value: "18" }),
  );
  assert.equal(fragment.querySelector("a.g-list-row").getAttribute("href"), "#/ref/skills");
  assert.equal(fragment.querySelector(".g-list-row__count").textContent, "84");
  assert.equal(fragment.querySelector(".g-kv__value").textContent, "50k");
  assert.equal(fragment.querySelector(".g-ranked__title").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-ranked__lead span").textContent, "1");
  assertCspSafe(fragment);
  assertStyled(fragment, "list-row.css");
});

test("a navigation row is one link: text, count, chevron", () => {
  const link = mount(renderNavRow({ href: '#/ref?a="1"&b=<2>', title: HOSTILE, desc: HOSTILE, count: 0 })).querySelector("a");
  assert.equal(link.getAttribute("href"), '#/ref?a="1"&b=<2>');
  assert.equal(link.querySelector(".g-list-row__title").textContent, HOSTILE);
  assert.equal(link.querySelector(".g-list-row__desc").textContent, HOSTILE);
  assert.equal(link.querySelector(".g-list-row__count").textContent, "0", "a count of nothing is still a count");
  assert.equal(link.querySelector("img"), null);
  assert.ok(link.querySelector("svg.g-icon"));
  assert.deepEqual(link.childNodes.map((node) => node.getAttribute("class")), ["g-list-row__text", "g-list-row__count", "g-icon"]);
});

test("a navigation row leaves out the description and count it was not given", () => {
  const link = mount(renderNavRow({ href: "#/ref/skills", title: "Skills" })).querySelector("a");
  assert.deepEqual(link.childNodes.map((node) => node.getAttribute("class")), ["g-list-row__text", "g-icon"]);
  assert.equal(link.querySelector(".g-list-row__desc"), null);
  assert.equal(link.querySelector(".g-list-row__count"), null);
});

test("a navigation row needs somewhere to go and something to say", () => {
  assert.throws(() => renderNavRow({ title: "Skills" }), /href/);
  assert.throws(() => renderNavRow({ href: "", title: "Skills" }), /href/);
  assert.throws(() => renderNavRow({ href: "#/ref" }), /title/);
});

test("a key–value row escapes both sides", () => {
  const row = mount(renderKeyValueRow({ label: HOSTILE, value: HOSTILE })).querySelector(".g-kv");
  assert.equal(row.querySelector(".g-kv__label").textContent, HOSTILE);
  assert.equal(row.querySelector(".g-kv__value").textContent, HOSTILE);
  assert.equal(row.querySelector("img"), null);
  assert.equal(mount(renderKeyValueRow({ label: "Rerolls", value: 0 })).querySelector(".g-kv__value").textContent, "0");
});

test("a ranked row keeps its lead column and drops the lines it was not given", () => {
  const full = mount(renderRankedRow({ leadHtml: "<b>SPP</b>", title: "Ashby", caption: "#3 Catcher", value: "27" })).querySelector(".g-ranked");
  assert.deepEqual(full.childNodes.map((node) => node.getAttribute("class")), ["g-ranked__lead", "g-ranked__text", "g-ranked__value"]);
  assert.equal(full.querySelector(".g-ranked__lead b").textContent, "SPP");
  assert.equal(full.querySelector(".g-ranked__caption").textContent, "#3 Catcher");
  assert.equal(full.querySelector(".g-ranked__value").textContent, "27");

  const bare = mount(renderRankedRow({ title: "Ashby" })).querySelector(".g-ranked");
  assert.deepEqual(bare.childNodes.map((node) => node.getAttribute("class")), ["g-ranked__lead", "g-ranked__text"], "the title stays in its column without a lead");
  assert.equal(bare.querySelector(".g-ranked__caption"), null);
  assert.equal(mount(renderRankedRow({ title: "Ashby", value: 0 })).querySelector(".g-ranked__value").textContent, "0");
  assert.throws(() => renderRankedRow({ leadHtml: "<i>1</i>" }), /title/);
});

test("a ranked row escapes what is text and inserts what is markup", () => {
  const fragment = mount(renderRankedRow({ leadHtml: '<span class="g-result g-result--w">W</span>', title: HOSTILE, caption: HOSTILE, value: HOSTILE }));
  assert.ok(fragment.querySelector(".g-ranked__lead .g-result--w"));
  assert.equal(fragment.querySelector(".g-ranked__title").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-ranked__caption").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-ranked__value").textContent, HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
});

test("a placeholder is text a reader can read in the field, not the faint grey", () => {
  // --faint is 3.1-3.4:1 on the light palettes' field.
  assertReadable("src/ui/text-field.css", ".g-field__input::placeholder", "color", ["--field"], 4.5);
});

test("a text field takes the input types a form uses, and nothing else", () => {
  for (const type of TEXT_FIELD_TYPES) assert.equal(mount(renderTextField({ id: `f-${type}`, name: "x", label: "X", type })).querySelector("input").getAttribute("type"), type);
  for (const type of ["hidden", "checkbox", '"onfocus=x']) assert.throws(() => renderTextField({ id: "f", name: "x", label: "X", type }), /type/);
});

test("a missing value is an empty field, not the word null", () => {
  assert.equal(mount(renderTextField({ id: "n1", name: "x", label: "X", value: null })).querySelector("input").getAttribute("value"), "");
  assert.equal(mount(renderKeyValueRow({ label: "Apothecary", value: null })).querySelector(".g-kv__value").textContent, "");
});

test("a field can carry a control beside its label and one beside its input", () => {
  const fragment = mount(renderTextField({
    id: "pw", name: "password", label: "Password", type: "password",
    asideHtml: renderButton({ label: "Show", data: { togglePassword: "" } }),
    actionHtml: renderButton({ label: "Save", kind: "primary" }),
  }));
  assert.ok(fragment.querySelector(".g-field__head label[for=\"pw\"]"));
  assert.ok(fragment.querySelector(".g-field__head [data-toggle-password]"));
  const control = fragment.querySelector(".g-field__control");
  assert.deepEqual(control.childNodes.map((node) => node.tagName), ["INPUT", "BUTTON"]);
  assertCspSafe(fragment);
  assertStyled(fragment, "text-field.css", "button.css");
});

test("each side control wraps only what it sits beside, and a field without them is label and input as before", () => {
  const row = (props) => mount(renderTextField({ id: "f", name: "f", label: "F", help: "h", ...props })).querySelector(".g-field");
  const tags = (node) => node.childNodes.map((child) => child.tagName);
  assert.deepEqual(tags(row({})), ["LABEL", "INPUT", "P"]);
  assert.deepEqual(tags(row({ asideHtml: "<a href=\"#/x\">Forgot</a>" })), ["DIV", "INPUT", "P"]);
  assert.deepEqual(tags(row({ actionHtml: "<span>go</span>" })), ["LABEL", "DIV", "P"]);
  assert.deepEqual(tags(row({ asideHtml: "<i></i>", actionHtml: "<i></i>" })), ["DIV", "DIV", "P"]);
  assert.deepEqual(row({ asideHtml: "<i></i>" }).querySelector(".g-field__head").childNodes.map((node) => node.tagName), ["LABEL", "I"]);
});

test("a value of zero is a value, and an undefined one is as empty as null; a type must be a string of the list", () => {
  assert.equal(mount(renderTextField({ id: "z", name: "x", label: "X", value: 0 })).querySelector("input").getAttribute("value"), "0");
  assert.equal(mount(renderTextField({ id: "u", name: "x", label: "X", value: undefined })).querySelector("input").getAttribute("value"), "");
  assert.equal(mount(renderKeyValueRow({ label: "Rerolls", value: undefined })).querySelector(".g-kv__value").textContent, "");
  assert.throws(() => renderTextField({ id: "f", name: "x", label: "X", type: null }), /type/);
  assert.throws(() => renderTextField({ id: "f", name: "x", label: "X", type: "TEXT" }), /type/);
});

// Stage 13, Task 9 (decision 16; hand-off 07b): a field of several lines, as StatsMngDead.html (a phone) and
// DeskRosterDeath.html (a desk) draw the cause of a death. Pre-flight L22: renderTextField's tests live here.
test("a field may take several lines: a textarea with the same label, help and error", () => {
  const fragment = mount(renderTextField({
    id: "cause", name: "cause", label: "Cause of death", value: HOSTILE, help: "Seen on the roster", error: "Too long", multiline: true,
    required: true, readonly: true, placeholder: HOSTILE,
  }));
  const area = fragment.querySelector("textarea");
  assert.ok(area, "a textarea");
  assert.equal(fragment.querySelector("input"), null, "and no one-line input beside it");
  assert.equal(area.getAttribute("class"), "g-field__input g-field__input--area");
  assert.equal(area.id, "cause");
  assert.equal(area.getAttribute("name"), "cause");
  assert.equal(area.getAttribute("rows"), "2", "two lines, as both prototypes");
  assert.equal(area.value, HOSTILE, "the value is the field's text, escaped");
  assert.equal(area.getAttribute("placeholder"), HOSTILE);
  assert.equal(fragment.querySelector("label").getAttribute("for"), "cause");
  assert.equal(fragment.querySelector("label").textContent, "Cause of death");
  assert.equal(area.getAttribute("aria-describedby"), "cause-help cause-error");
  assert.equal(area.getAttribute("aria-invalid"), "true");
  assert.equal(fragment.querySelector("#cause-help").textContent, "Seen on the roster");
  assert.equal(fragment.querySelector("#cause-error").textContent, "Too long");
  assert.ok(area.hasAttribute("required"));
  assert.ok(area.hasAttribute("readonly"));
  assert.ok(fragment.querySelector(".g-field--invalid"));
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
  assertStyled(fragment, "text-field.css");
  // Without help or error it points at nothing and is not invalid.
  const bare = mount(renderTextField({ id: "cause", name: "cause", label: "Cause", multiline: true })).querySelector("textarea");
  assert.equal(bare.hasAttribute("aria-describedby"), false);
  assert.equal(bare.hasAttribute("aria-invalid"), false);
  assert.equal(bare.value, "");
});

test("a field of several lines has no type, input mode or autocomplete, and takes 1 to 8 rows", () => {
  const area = mount(renderTextField({ id: "f", name: "f", label: "F", multiline: true, type: "tel", inputmode: "numeric", autocomplete: "off", verbatim: true, rows: 3 })).querySelector("textarea");
  for (const name of ["type", "inputmode", "autocomplete", "value"]) assert.equal(area.hasAttribute(name), false, name);
  assert.equal(area.getAttribute("rows"), "3");
  assert.equal(area.getAttribute("spellcheck"), "false", "taken verbatim, whatever its lines");
  for (const rows of [1, 8]) assert.equal(mount(renderTextField({ id: "f", name: "f", label: "F", multiline: true, rows })).querySelector("textarea").getAttribute("rows"), String(rows));
  for (const rows of [0, 9, 2.5, "2", null, Number.NaN, -1]) {
    assert.throws(() => renderTextField({ id: "f", name: "f", label: "F", multiline: true, rows }), /rows/, JSON.stringify(rows));
  }
  // Its type is still checked: a field's props mean the same, whatever its lines.
  assert.throws(() => renderTextField({ id: "f", name: "f", label: "F", multiline: true, type: "hidden" }), /type/);
  // One line unless told otherwise.
  const line = mount(renderTextField({ id: "f", name: "f", label: "F" }));
  assert.equal(line.querySelector("textarea"), null);
  assert.equal(line.querySelector("input").getAttribute("class"), "g-field__input");
});

test("a field of several lines keeps a value that starts on a new line; a zero is a zero and nothing is empty", () => {
  // A browser drops one newline right after <textarea>: the coach's own first one must survive a redraw.
  const area = (value) => mount(renderTextField({ id: "f", name: "f", label: "F", multiline: true, value })).querySelector("textarea");
  assert.equal(area("\nFoul\nby the Raiders").value, "\nFoul\nby the Raiders");
  assert.equal(area("Foul").value, "Foul");
  assert.equal(area(0).value, "0");
  assert.equal(area(null).value, "");
  assert.equal(area(undefined).value, "");
  // Beside a control too.
  const control = mount(renderTextField({ id: "f", name: "f", label: "F", multiline: true, actionHtml: "<span>go</span>" })).querySelector(".g-field__control");
  assert.deepEqual(control.childNodes.map((node) => node.tagName), ["TEXTAREA", "SPAN"]);
});

test("the area's sizes are the prototypes': 64px of content on a phone, 60 on a desk, with their 10px above and below", () => {
  const FILE = "src/ui/text-field.css";
  const AREA = ".g-field__input--area";
  const tokens = tokensOf("grass");
  const resolved = (value) => value.replace(/var\((--[\w-]+)\)/g, (whole, name) => tokens[name] ?? whole);
  const desk = (property) => inMedia(FILE, "min-width: 901px", AREA, property);
  // Every value the sheet gives the area, in file order: StatsMngDead.html's first, for every width, then DeskRosterDeath.html's from 901px.
  const all = (property) => valuesOf(FILE, AREA, property).map(resolved);
  // The prototypes' 64 and 60 are content-box (Chrome draws them 84 and 80); this sheet counts the border box (fidelity N5).
  assert.deepEqual(all("min-height"), ["84px", "80px"]);
  assert.deepEqual(desk("min-height"), ["80px"]);
  const [, padY] = all("padding")[0].match(/^(\d+)px/);
  assert.deepEqual([84 - 2 * padY, 80 - 2 * padY], [64, 60]);
  assert.deepEqual(all("border-radius"), ["12px", "10px"]);
  // A phone's 16px (StatsMngDead's 15 + 1): under 16px iPhone's Safari zooms the page into the field it focuses (review of
  // stage 13). Two rows fit either minimum.
  assert.deepEqual(valuesOf(FILE, AREA, "font"), ["400 16px/1.4 var(--font-body)", "400 14px/1.4 var(--font-body)"], "the page's font, as the prototypes inherit it");
  assert.deepEqual(valuesOf(FILE, ".g-field__input", "font"), ["400 16px/1.2 var(--font-body)"], "the one line's 16 too");
  assert.ok(16 * 1.4 * 2 + 2 * padY <= 84 && 14 * 1.4 * 2 + 2 * padY <= 80);
  assert.deepEqual(all("resize"), ["none", "vertical"]);
  assert.deepEqual(desk("resize"), ["vertical"]);
  assert.deepEqual(all("padding"), ["10px 12px"], "10 12 on both");
  assert.deepEqual(all("height"), ["auto"], "the one line's 48px is not the area's");
  // A phone's values stand to 900px: nothing narrower changes them.
  assert.deepEqual(inMedia(FILE, "max-width: 900px", AREA, "min-height"), []);
  // The ring is the field's: 1px of --line-strong, #DCE3DF in grass, as both prototypes draw it.
  assert.deepEqual(valuesOf(FILE, ".g-field__input", "box-shadow"), ["var(--ring)"]);
  assert.equal(resolved(tokens["--ring"]), "inset 0 0 0 1px #DCE3DF");
  // The help under it: 12px, --muted (StatsMngDead.html).
  assert.deepEqual(valuesOf(FILE, ".g-field__help", "color"), ["var(--muted)"]);
  assert.deepEqual(valuesOf(FILE, ".g-field__help", "font"), ["400 12px/1.4 var(--font-body)"]);
});
