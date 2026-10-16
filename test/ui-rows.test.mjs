import assert from "node:assert/strict";
import test from "node:test";

import { assertReadable } from "./helpers/contrast.mjs";
import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { CALLOUT_TONES, renderCallout } from "../src/ui/callout.mjs";
import { renderKeyValueRow, renderNavRow, renderRankedRow } from "../src/ui/list-row.mjs";
import { renderTextField } from "../src/ui/text-field.mjs";
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

test("a text field is a text input unless told otherwise, and says only what it was told", () => {
  const plain = mount(renderTextField({ id: "f", name: "nick", label: "F" })).querySelector("input");
  assert.equal(plain.getAttribute("type"), "text");
  assert.equal(plain.getAttribute("name"), "nick");
  assert.equal(plain.getAttribute("value"), "");
  for (const attribute of ["autocomplete", "inputmode", "placeholder", "required"]) assert.equal(plain.hasAttribute(attribute), false, attribute);

  const full = mount(renderTextField({ id: "f", name: "f", label: "F", type: "tel", autocomplete: "tel", inputmode: "numeric", placeholder: HOSTILE })).querySelector("input");
  assert.equal(full.getAttribute("type"), "tel");
  assert.equal(full.getAttribute("inputmode"), "numeric");
  assert.equal(full.getAttribute("placeholder"), HOSTILE);
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
