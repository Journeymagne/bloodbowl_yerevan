import assert from "node:assert/strict";
import test from "node:test";

import { createDocument, el, fireEvent, parseHtml } from "./helpers/fake-dom.mjs";

const document = createDocument();

test("markup becomes a tree a test can query", () => {
  const root = parseHtml(document, `<div class="g-a g-b" data-x="1 &amp; 2">
    <button type="button" disabled>Go &lt;now&gt;</button>
    <input value="&quot;q&quot;" required>
    <svg viewBox="0 0 24 24"><path d="M1 1"/></svg>
  </div>`);
  assert.equal(root.tagName, "FRAGMENT");
  const div = root.querySelector("div.g-a.g-b");
  assert.equal(div.getAttribute("data-x"), "1 & 2");
  assert.ok(div.classList.contains("g-b"));
  assert.equal(root.querySelector("button[disabled]").textContent, "Go <now>");
  assert.equal(root.querySelector("input").value, '"q"');
  assert.ok(root.querySelector("input").hasAttribute("required"));
  assert.equal(root.querySelector("svg path").getAttribute("d"), "M1 1");
  assert.equal(root.querySelectorAll("div, button").length, 2);
  assert.equal(root.querySelector('[data-x="1 & 2"] button').getAttribute("type"), "button");
  assert.equal(root.querySelector("path").closest("div"), div);
  assert.equal(div.childNodes.length, 3, "whitespace between tags is dropped");
});

test("broken markup is refused, not guessed", () => {
  for (const bad of ["<div><span></div>", "<div>", "</p>", "<a href='x'>a</a>", "<a href=x>a</a>", "<!-- c -->", "<script>x</script>"]) {
    assert.throws(() => parseHtml(document, bad), /parseHtml/, bad);
  }
});

test("an unsupported selector throws instead of matching nothing", () => {
  assert.throws(() => parseHtml(document, "<p></p>").querySelector("p:first-child"), /selector/);
});

test("events bubble to ancestors, carry currentTarget and can be stopped", () => {
  const root = parseHtml(document, `<section><div><button type="button">x</button></div></section>`);
  const seen = [];
  root.querySelector("section").addEventListener("click", (event) => seen.push(["section", event.currentTarget.tagName]));
  const stopper = (event) => { seen.push(["div", event.target.tagName]); event.stopPropagation(); };
  root.querySelector("div").addEventListener("click", stopper);
  fireEvent(root.querySelector("button"), "click");
  assert.deepEqual(seen, [["div", "BUTTON"]]);
  root.querySelector("div").removeEventListener("click", stopper);
  const event = fireEvent(root.querySelector("button"), "click", { key: "Enter" });
  assert.equal(event.key, "Enter");
  assert.deepEqual(seen.at(-1), ["section", "SECTION"]);
});

test("a dialog opens modally and closing it fires close", () => {
  const dialog = parseHtml(document, `<dialog id="d"></dialog>`).querySelector("#d");
  let closes = 0;
  dialog.addEventListener("close", () => { closes += 1; });
  dialog.showModal();
  assert.equal(dialog.open, true);
  dialog.close();
  assert.equal(dialog.open, false);
  assert.equal(closes, 1);
});

test("the document has an html element above body", () => {
  assert.equal(document.body.parentNode, document.documentElement);
  assert.equal(document.documentElement.tagName, "HTML");
});

test("entities decode once, and only the ones escapeHtml writes are known", () => {
  const root = parseHtml(document, `<p title="&#39;&#x41;&#65;">&amp;lt; &#39;x&#39; &quot;</p>`);
  assert.equal(root.querySelector("p").getAttribute("title"), "'AA");
  assert.equal(root.querySelector("p").textContent, `&lt; 'x' "`);
  for (const bad of ["<p>&nbsp;</p>", "<p>Q & A</p>", "<p>a < b</p>", "<p>&#0;</p>", "<p>&#xD800;</p>", "<p>&amp</p>"]) {
    assert.throws(() => parseHtml(document, bad), /parseHtml/, bad);
  }
});

test("void elements take no closing tag; controls mirror value and checked", () => {
  const root = parseHtml(document, `<form><br><input type="checkbox" checked><input value="7"><img src="a.svg"><select><option value="o" selected>O</option></select></form>`);
  assert.deepEqual(root.querySelector("form").childNodes.map((node) => node.tagName), ["BR", "INPUT", "INPUT", "IMG", "SELECT"]);
  assert.equal(root.querySelector("[type=\"checkbox\"]").checked, true);
  assert.equal(root.querySelector('[value="7"]').value, "7");
  assert.equal(root.querySelector("option").value, "o");
  assert.equal(root.querySelector("br").childNodes.length, 0);
  assert.throws(() => parseHtml(document, "<br></br>"), /parseHtml/, "a void element has no closing tag");
});

test("/> closes a void element or anything inside svg, and is refused on other HTML elements", () => {
  const ok = parseHtml(document, `<p><br/><input value="1"/><img src="a.svg"/></p><svg/><svg viewBox="0 0 1 1"><g><path d="M1 1"/><circle r="1"/></g></svg>`);
  assert.deepEqual(ok.childNodes.map((node) => node.tagName), ["P", "SVG", "SVG"]);
  assert.deepEqual(ok.querySelector("p").childNodes.map((node) => node.tagName), ["BR", "INPUT", "IMG"]);
  assert.deepEqual(ok.querySelectorAll("svg *").map((node) => node.tagName), ["G", "PATH", "CIRCLE"]);
  // A browser ignores the slash: the span would stay open and swallow what follows it.
  for (const bad of ["<span/>", "<div/>", '<div><span class="i"/>text<b>x</b></div>', "<svg></svg><span/>", "<svg><path/></svg><div/>", "<textarea/>"]) {
    assert.throws(() => parseHtml(document, bad), /parseHtml: .*\/>/, bad);
  }
});

test("a textarea's value is its text, and a value attribute on textarea or select is refused", () => {
  const root = parseHtml(document, `<textarea id="a">y &lt; z</textarea><textarea id="b"></textarea><textarea id="c">  </textarea><textarea id="d">
line</textarea><textarea id="e">

two</textarea>`);
  assert.equal(root.querySelector("#a").value, "y < z");
  assert.equal(root.querySelector("#b").value, "");
  assert.equal(root.querySelector("#c").value, "  ", "blanks inside a textarea are its value, not formatting");
  assert.equal(root.querySelector("#d").value, "line", "one newline right after the opening tag is dropped");
  assert.equal(root.querySelector("#e").value, "\ntwo", "only one");
  assert.equal(root.querySelector("#a").textContent, "y < z");
  for (const bad of ['<textarea value="x"></textarea>', '<select value="x"><option>a</option></select>', "<textarea><b>x</b></textarea>"]) {
    assert.throws(() => parseHtml(document, bad), /parseHtml/, bad);
  }
});

test("tags and attributes are as strict as the rest", () => {
  for (const bad of ['<a b="1" b="2">x</a>', '<a b="1"c="2">x</a>', '<a b = "1">x</a>', '<a b="1>x</a>', "<a.b>x</a>", "<1a></1a>", "<a>x</b>", "x</a>", "<a>x</a "]) {
    assert.throws(() => parseHtml(document, bad), /parseHtml/, bad);
  }
  const root = parseHtml(document, `top <b>bold</b> level`);
  assert.deepEqual(root.childNodes.map((node) => node.textContent), ["top ", "bold", " level"], "text keeps its spacing");
});

test("selectors: descendants, lists, ids, universal, and values with spaces and commas", () => {
  const root = parseHtml(document, `<ul id="list"><li class="row on" data-k="a, b]"><a href="#x">A</a></li><li class="row"><span><a>B</a></span></li></ul><a>out</a>`);
  assert.equal(root.querySelectorAll("ul a").length, 2, "a descendant at any depth");
  assert.equal(root.querySelectorAll("#list li.row a").length, 2);
  assert.equal(root.querySelectorAll("li.on a, li.row").length, 3, "a list is a union");
  assert.equal(root.querySelectorAll("li.row, li.on").length, 2, "an element matching two parts of the list counts once");
  assert.equal(root.querySelector('[data-k="a, b]"] a').textContent, "A");
  assert.equal(root.querySelector("li.row.on"), root.querySelector("li"));
  assert.equal(root.querySelectorAll("*").length, 7, "the fragment itself is not an element");
  assert.equal(root.querySelectorAll("* a").length, 2, "nor is it an ancestor a descendant selector can match");
  assert.equal(root.querySelector("li.on li"), null);
  assert.equal(root.querySelector("a").matches("li a"), true);
  assert.equal(root.querySelectorAll("a").at(-1).matches("li a"), false);
  assert.equal(root.querySelector("li").closest("ul"), root.querySelector("ul"));
  assert.equal(root.querySelector("li").closest("table"), null);
  assert.equal(root.querySelector("li").closest("li"), root.querySelector("li"), "closest starts at the element itself");
});

test("selector syntax outside the supported set throws", () => {
  const root = parseHtml(document, `<div><a>x</a></div>`);
  for (const bad of ["div > a", "div>a", "div + a", "div ~ a", "a:hover", "a::before", "[a^=\"b\"]", "[a='b']", "[a=b]", "[a=\"b\" i]", "[a", "a]", "", " ", "a,", ",a", "#1a", ".1a", "a#b#c", "a*", "[a]a", ".a\\.b", "a.", "div,,a"]) {
    assert.throws(() => root.querySelector(bad), /fake-dom: unsupported selector/, JSON.stringify(bad));
    assert.throws(() => root.querySelector("div").matches(bad), /unsupported selector/, `matches ${JSON.stringify(bad)}`);
  }
});

test("the old querySelector forms still work on trees built with el()", () => {
  const tree = el(document, "div", { id: "top" }, el(document, "input", { "data-key": "name", role: "x" }), el(document, "p", { "data-key": "spp" }));
  assert.equal(tree.querySelector('[data-key="spp"]').tagName, "P");
  assert.equal(tree.querySelector("[role]").tagName, "INPUT");
  assert.equal(tree.querySelector("#top"), null, "the element itself is never its own descendant");
  assert.equal(tree.querySelector('[data-key="gone"]'), null);
  document.body.append(tree);
  assert.equal(document.body.querySelector("#top"), tree);
  tree.parentNode.removeChild(tree);
});

test("classList reads and writes the class attribute", () => {
  const box = parseHtml(document, `<div class="a b"></div><p></p>`).querySelector("div");
  box.classList.add("c", "a");
  assert.equal(box.getAttribute("class"), "a b c");
  box.classList.remove("b");
  assert.equal(box.getAttribute("class"), "a c");
  assert.equal(box.classList.toggle("a"), false);
  assert.equal(box.classList.toggle("z"), true);
  assert.equal(box.classList.toggle("z", true), true);
  assert.equal(box.classList.toggle("q", false), false);
  assert.equal(box.getAttribute("class"), "c z");
  box.setAttribute("class", "x");
  assert.ok(box.classList.contains("x") && !box.classList.contains("c"));
  const bare = box.parentNode.querySelector("p");
  bare.classList.remove("nothing");
  assert.equal(bare.hasAttribute("class"), false, "no class attribute appears out of nothing");
  assert.throws(() => box.classList.add("two words"), /classList/);
  assert.throws(() => box.classList.add(""), /classList/);
});

test("dispatchEvent reports preventDefault, honours non-bubbling events and clears currentTarget", () => {
  const root = parseHtml(document, `<div><button type="button">b</button></div>`);
  const button = root.querySelector("button");
  const reached = [];
  root.querySelector("div").addEventListener("tap", () => reached.push("div"));
  button.addEventListener("tap", (event) => { reached.push("button"); event.preventDefault(); });
  const tap = fireEvent(button, "tap", { bubbles: false });
  assert.deepEqual(reached, ["button"]);
  assert.equal(tap.defaultPrevented, true);
  assert.equal(tap.currentTarget, null);
  assert.equal(button.dispatchEvent({ type: "tap", bubbles: false, preventDefault() {} }), true, "a plain object is a fine event");
  assert.equal(button.dispatchEvent(fireEvent(button, "none")), true);
  assert.equal(fireEvent(button, "tap", { bubbles: false }).cancelBubble, false);
});

test("a capture listener on an ancestor runs before the target's own, and bubbling ones after", () => {
  const root = parseHtml(document, `<section><div><button type="button">b</button></div></section>`);
  const [section, div, button] = ["section", "div", "button"].map((name) => root.querySelector(name));
  const order = [];
  section.addEventListener("click", () => order.push("section bubble"));
  section.addEventListener("click", (event) => order.push(`section capture ${event.currentTarget.tagName}`), true);
  div.addEventListener("click", () => order.push("div capture"), { capture: true });
  button.addEventListener("click", () => order.push("button bubble"));
  button.addEventListener("click", () => order.push("button capture"), { capture: true });
  const click = fireEvent(button, "click");
  assert.deepEqual(order, ["section capture SECTION", "div capture", "button capture", "button bubble", "section bubble"]);
  assert.equal(click.currentTarget, null);
});

test("a non-bubbling event goes down through capture listeners and stops short of bubbling ones", () => {
  const root = parseHtml(document, `<div><dialog id="d"></dialog></div>`);
  const [div, dialog] = [root.querySelector("div"), root.querySelector("dialog")];
  const order = [];
  div.addEventListener("cancel", () => order.push("div bubble"));
  div.addEventListener("cancel", (event) => { order.push(`div capture ${event.target.id}`); event.preventDefault(); }, true);
  dialog.addEventListener("cancel", () => order.push("dialog"));
  const cancel = fireEvent(dialog, "cancel", { bubbles: false });
  assert.deepEqual(order, ["div capture d", "dialog"]);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(fireEvent(dialog, "cancel").defaultPrevented, true, "a bubbling event runs both");
  assert.deepEqual(order.slice(2), ["div capture d", "dialog", "div bubble"]);
});

test("stopPropagation in a capture listener keeps the event from the target, and bubbling is still stopped at the node", () => {
  const root = parseHtml(document, `<section><button type="button">b</button></section>`);
  const [section, button] = [root.querySelector("section"), root.querySelector("button")];
  const order = [];
  button.addEventListener("go", () => order.push("button"));
  section.addEventListener("go", () => order.push("section capture 2"), true);
  const stop = (event) => { order.push("section capture 1"); event.stopPropagation(); };
  section.addEventListener("go", stop, true);
  section.addEventListener("go", () => order.push("section bubble"));
  fireEvent(button, "go");
  assert.deepEqual(order, ["section capture 2", "section capture 1"], "the same node's other capture listeners still run");
  section.removeEventListener("go", stop, true);
  order.length = 0;
  button.addEventListener("go", (event) => event.stopPropagation());
  fireEvent(button, "go");
  assert.deepEqual(order, ["section capture 2", "button"], "stopped at the target: no bubbling");
});

test("removeEventListener matches the capture flag, and the same function can be both kinds", () => {
  const button = parseHtml(document, `<button type="button">b</button>`).querySelector("button");
  const order = [];
  const listener = () => order.push("ran");
  button.addEventListener("go", listener, true);
  button.addEventListener("go", listener, true);
  button.addEventListener("go", listener, false);
  button.addEventListener("go", listener, { capture: false });
  button.addEventListener("go", listener, {});
  fireEvent(button, "go");
  assert.equal(order.length, 2, "one capture and one bubbling registration, never twice of a kind");
  button.removeEventListener("go", listener);
  order.length = 0;
  fireEvent(button, "go");
  assert.equal(order.length, 1, "removed without the flag: only the bubbling one goes");
  button.removeEventListener("go", listener, { capture: true });
  order.length = 0;
  fireEvent(button, "go");
  assert.equal(order.length, 0);
});

test("addEventListener options other than capture still throw", () => {
  const button = parseHtml(document, `<button type="button">b</button>`).querySelector("button");
  const listener = () => {};
  for (const options of [{ once: true }, { passive: true }, { signal: new AbortController().signal }, { capture: true, once: true }, null, 1, "capture"]) {
    assert.throws(() => button.addEventListener("go", listener, options), /options/, JSON.stringify(options));
    assert.throws(() => button.removeEventListener("go", listener, options), /options/, JSON.stringify(options));
  }
});

test("listeners run in subscription order once each, and one removed mid-dispatch does not run", () => {
  const button = parseHtml(document, `<button type="button">b</button>`).querySelector("button");
  const order = [];
  const second = () => order.push("second");
  const first = () => { order.push("first"); button.removeEventListener("go", second); };
  button.addEventListener("go", first);
  button.addEventListener("go", first);
  button.addEventListener("go", second);
  button.addEventListener("go", () => order.push("third"));
  fireEvent(button, "go");
  assert.deepEqual(order, ["first", "third"]);
  assert.throws(() => button.addEventListener("go", first, { once: true }), /options/);
});

test("a dialog is only a dialog, and closing a closed one says nothing", () => {
  const root = parseHtml(document, `<dialog open></dialog><div></div>`);
  const dialog = root.querySelector("dialog");
  assert.equal(dialog.open, true, "the open attribute is the state");
  let closes = 0;
  dialog.addEventListener("close", () => { closes += 1; });
  dialog.close();
  dialog.close();
  assert.equal(closes, 1);
  assert.throws(() => root.querySelector("div").showModal(), /not a dialog/);
  assert.throws(() => root.querySelector("div").close(), /not a dialog/);
});

test("the document queries from html down, body included", () => {
  const holder = el(document, "section", { id: "s" }, el(document, "em"));
  document.body.append(holder);
  assert.equal(document.querySelector("html"), document.documentElement);
  assert.equal(document.querySelector("body #s em").tagName, "EM");
  assert.equal(document.querySelectorAll("body, section").length, 2);
  assert.equal(holder.isConnected, true);
  assert.equal(document.querySelector("#nope"), null);
  assert.throws(() => document.querySelector("body > section"), /unsupported selector/);
  document.body.removeChild(holder);
});

test("innerHTML and a template parse markup as strictly as parseHtml", () => {
  const document = createDocument();
  const box = document.createElement("div");
  box.innerHTML = `<p class="a">x</p><p>y</p>`;
  assert.equal(box.querySelectorAll("p").length, 2);
  const template = document.createElement("template");
  template.innerHTML = "<b>z</b>";
  assert.equal(template.childNodes.length, 0);
  assert.equal(template.content.querySelector("b").textContent, "z");
  assert.throws(() => { box.innerHTML = "<p>"; }, /parseHtml/);
});

test("patch() takes a markup string in the fake document too, and keeps focus", async () => {
  const document = createDocument();
  globalThis.document = document;
  const { patch } = await import("../src/core/dom.mjs");
  const root = document.createElement("div");
  document.body.appendChild(root);
  patch(root, `<input id="q" value="a"><p>one</p>`);
  root.querySelector("#q").focus();
  patch(root, `<input id="q" value="a"><p>two</p>`);
  assert.equal(document.activeElement, root.querySelector("#q"));
  assert.equal(root.querySelector("p").textContent, "two");
});

test("innerHTML replaces the children, takes the focus with them, and is as empty as it is told", () => {
  const document = createDocument();
  const box = document.createElement("div");
  document.body.appendChild(box);
  box.innerHTML = `<input id="q"><p>a</p>`;
  const old = box.querySelector("p");
  box.querySelector("#q").focus();
  box.innerHTML = "<span>b</span>";
  assert.equal(old.parentNode, null);
  assert.equal(box.childNodes.length, 1);
  assert.equal(box.firstChild.tagName, "SPAN");
  assert.equal(document.activeElement, document.body, "the focused node left the tree");
  box.innerHTML = "";
  assert.equal(box.childNodes.length, 0);
  // Set a second time the template holds the new markup alone.
  const template = document.createElement("template");
  template.innerHTML = "<i>1</i>";
  template.innerHTML = "<b>2</b>";
  assert.equal(template.content.childNodes.length, 1);
  assert.equal(template.content.querySelector("i"), null);
  assert.equal(template.content, template.content, "one fragment, not a new one per read");
});

test("what a browser would build differently from innerHTML is refused", () => {
  const document = createDocument();
  const box = document.createElement("div");
  // A table row outside a table is dropped by the parser; a template and a table body keep it.
  assert.throws(() => { box.innerHTML = "<tr><td>x</td></tr>"; }, /table/);
  assert.throws(() => { box.innerHTML = "<section><td>x</td></section>"; }, /table/);
  box.innerHTML = "<table><thead><tr><th>x</th></tr></thead></table>";
  assert.equal(box.querySelector("th").textContent, "x");
  const template = document.createElement("template");
  template.innerHTML = "<tr><td>x</td></tr>";
  assert.equal(template.content.querySelector("tr td").textContent, "x");
  const body = document.createElement("tbody");
  body.innerHTML = "<tr><td>y</td></tr>";
  assert.equal(body.querySelector("td").textContent, "y");
  // Inside a textarea the markup is text, not elements.
  assert.throws(() => { document.createElement("textarea").innerHTML = "<b>x</b>"; }, /textarea/);
  // A fragment has no innerHTML: a browser would only set a property that parses nothing.
  assert.throws(() => { template.content.innerHTML = "<b>x</b>"; }, /fragment/);
  // Nor can it be read back: the tree is not serialised here.
  assert.throws(() => box.innerHTML, /write-only/);
  // A markup string cannot carry a template: its children belong in .content, which the parser does not model.
  assert.throws(() => parseHtml(document, "<template><b>x</b></template>"), /template/);
  assert.throws(() => { box.innerHTML = "<template></template>"; }, /template/);
  // Only a template has content.
  assert.equal(box.content, undefined);
});
