/**
 * A DOM small enough to test `patch()` against, and nothing more.
 *
 * The project has no jsdom and no browser in `npm test` — that is deliberate,
 * the tests must run on a bare Node. But `patch()` is all node moves, attribute
 * writes and focus bookkeeping, and asserting those against hand-rolled fakes
 * inside each test would bury what is being proved.
 *
 * So: real tree semantics (parentNode, insertBefore that moves, removeChild),
 * real attribute storage, real focus and selection, real event capture and bubbling.
 *
 * Trees come from `el()` and `text()`, handed to `patch()` directly (the second
 * form its signature accepts), or from `parseHtml()` — a strict parser for the
 * markup `src/ui` writes: double-quoted attributes, explicit closing tags, the
 * five escapes `escapeHtml` emits, no comments, no scripts. It throws on
 * anything else instead of guessing the way a browser does, so a component
 * that emits sloppy markup fails its test rather than passing against a tree
 * the real parser would build differently. Selectors are as strict: tags,
 * `#id`, `.class`, `[attr]`, `[attr="value"]`, descendants and lists; any
 * other syntax throws, never "matches nothing".
 *
 * `element.innerHTML = markup` and a `<template>`'s `innerHTML` go through that
 * same parser, so the markup-string form of `patch()` works here and is as
 * strict as everything else. What a browser would build differently from an
 * element's innerHTML is refused too: a table row outside a table, markup
 * assigned to a textarea, a fragment's innerHTML. A template's children live in
 * its `content`, never in its `childNodes`, and a `<template>` cannot be written
 * inside markup (its children would belong there). innerHTML is write-only.
 */

import { matchesList, parseSelectorList, select } from "./fake-dom-selectors.mjs";

/** `savedAt` -> `saved-at`, the way dataset names map onto attributes. */
function dashed(name) {
  return String(name).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** The whitespace HTML knows about — not `\s`, which also swallows a no-break space. */
const BLANK = /[ \t\n\r\f]/;
const BLANKS = /[ \t\n\r\f]+/;
const ONLY_BLANKS = /^[ \t\n\r\f]*$/;

/** `classList` over the `class` attribute, so markup and code see one storage. */
function classListOf(element) {
  const tokens = () => (element.getAttribute("class") ?? "").split(BLANKS).filter(Boolean);
  // Like a browser: an element with no class attribute and nothing to put in it stays without one.
  const write = (next) => {
    if (next.length || element.hasAttribute("class")) element.setAttribute("class", next.join(" "));
  };
  const valid = (token) => {
    if (token === "" || BLANK.test(token)) throw new Error(`classList: bad token ${JSON.stringify(token)}`);
    return token;
  };
  const add = (...names) => {
    const next = tokens();
    for (const name of names) if (!next.includes(valid(name))) next.push(name);
    write(next);
  };
  const remove = (...names) => {
    names.forEach(valid);
    write(tokens().filter((token) => !names.includes(token)));
  };
  const toggle = (name, force) => {
    const present = tokens().includes(valid(name));
    const wanted = force === undefined ? !present : Boolean(force);
    if (wanted && !present) add(name);
    if (!wanted && present) remove(name);
    return wanted;
  };
  return { contains: (token) => tokens().includes(token), add, remove, toggle };
}

/** The event `fireEvent` builds and `close()` sends — the fields a handler can rely on. */
function createEvent(type, init = {}) {
  return {
    type,
    bubbles: true,
    defaultPrevented: false,
    cancelBubble: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.cancelBubble = true; },
    ...init,
  };
}

/**
 * The capture flag of addEventListener's third argument: `true`, `false`, or
 * an object with nothing but `capture` in it. `once`, `passive` and `signal`
 * change what runs and when; ignoring them would be a guess, so they throw.
 */
function captureOf(options) {
  if (options === undefined || typeof options === "boolean") return Boolean(options);
  if (options !== null && typeof options === "object" && Object.keys(options).every((name) => name === "capture")) return Boolean(options.capture);
  throw new Error("fake-dom: addEventListener options other than capture are not supported");
}

function requireDialog(element, method) {
  if (element.tagName !== "DIALOG") throw new Error(`fake-dom: ${method}() on <${element.tagName.toLowerCase()}>, which is not a dialog`);
}

class FakeNode {
  constructor(nodeType, ownerDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  insertBefore(node, reference) {
    node.parentNode?.removeChild(node);
    const at = reference ? this.childNodes.indexOf(reference) : -1;
    if (at === -1) this.childNodes.push(node);
    else this.childNodes.splice(at, 0, node);
    node.parentNode = this;
    return node;
  }

  /** The modern spelling; only the single-node form is used. */
  append(node) {
    return this.appendChild(node);
  }

  appendChild(node) {
    return this.insertBefore(node, null);
  }

  removeChild(node) {
    const at = this.childNodes.indexOf(node);
    if (at === -1) throw new Error("removeChild: not a child");
    this.childNodes.splice(at, 1);
    node.parentNode = null;
    // A browser drops focus to the body when the focused node leaves the tree.
    // Without this the fake keeps reporting a detached element as focused, and
    // patch()'s restore path would never be exercised.
    const document = this.ownerDocument;
    if (document?.activeElement && node.contains(document.activeElement)) document.activeElement = document.body;
    return node;
  }

  /** In the document, not merely constructed — code caches nodes on this. */
  get isConnected() {
    for (let walk = this; walk; walk = walk.parentNode) if (walk === this.ownerDocument?.body) return true;
    return false;
  }

  contains(node) {
    for (let walk = node; walk; walk = walk.parentNode) if (walk === this) return true;
    return false;
  }

  /** Depth-first, self included — enough for the selectors patch() uses. */
  *walk() {
    yield this;
    for (const child of [...this.childNodes]) yield* child.walk();
  }

  /** The text of the whole subtree, for readable assertions. */
  get textContent() {
    if (this.nodeType === 3) return this.nodeValue;
    return this.childNodes.map((child) => child.textContent).join("");
  }

  /** Assigning it replaces the children with one text node, as a browser does. */
  set textContent(value) {
    if (this.nodeType === 3) { this.nodeValue = String(value); return; }
    for (const child of [...this.childNodes]) this.removeChild(child);
    if (value !== "") this.appendChild(this.ownerDocument.createTextNode(String(value)));
  }
}

class FakeText extends FakeNode {
  constructor(value, ownerDocument) {
    super(3, ownerDocument);
    this.nodeValue = String(value);
  }
}

/** Input types with no text selection — reading selectionStart throws on these. */
const UNSELECTABLE_TYPES = new Set(["number", "checkbox", "radio", "range", "color", "date", "file"]);

class FakeElement extends FakeNode {
  constructor(tagName, ownerDocument) {
    super(1, ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.attributes = [];
    this.listeners = new Map();
    this.captureListeners = new Map();
    this.classList = classListOf(this);
    this.value = undefined;
    this.checked = undefined;
    // A text field always has a caret, at 0 until something moves it. Getting
    // this wrong hides the bug patch() is meant to prevent: a rebuilt field
    // that takes focus back but drops the caret to the end.
    const textual = this.tagName === "INPUT" || this.tagName === "TEXTAREA";
    this.selectionStart = textual ? 0 : null;
    this.selectionEnd = textual ? 0 : null;
    // dataset.status and getAttribute("data-status") are the same storage in a
    // browser, and code written against one is read by the other.
    this.dataset = new Proxy(this, {
      get: (element, name) => element.getAttribute(`data-${dashed(name)}`) ?? undefined,
      set: (element, name, value) => { element.setAttribute(`data-${dashed(name)}`, String(value)); return true; },
      has: (element, name) => element.getAttribute(`data-${dashed(name)}`) !== null,
    });
  }

  get id() {
    return this.getAttribute("id") ?? "";
  }

  getAttribute(name) {
    return this.attributes.find((attribute) => attribute.name === name)?.value ?? null;
  }

  hasAttribute(name) {
    return this.attributes.some((attribute) => attribute.name === name);
  }

  setAttribute(name, value) {
    const existing = this.attributes.find((attribute) => attribute.name === name);
    if (existing) existing.value = String(value);
    else this.attributes.push({ name, value: String(value) });
    if (name === "type" && this.tagName === "INPUT" && UNSELECTABLE_TYPES.has(String(value))) {
      this.selectionStart = null;
      this.selectionEnd = null;
    }
  }

  removeAttribute(name) {
    this.attributes = this.attributes.filter((attribute) => attribute.name !== name);
  }

  /** The first descendant that matches — see `parseSelectorList` for the syntax. */
  querySelector(selector) {
    return select(this, selector, false).next().value ?? null;
  }

  querySelectorAll(selector) {
    return [...select(this, selector, false)];
  }

  matches(selector) {
    return matchesList(this, parseSelectorList(selector));
  }

  /** This element or the nearest ancestor that matches. */
  closest(selector) {
    const list = parseSelectorList(selector);
    for (let walk = this; walk; walk = walk.parentNode) if (matchesList(walk, list)) return walk;
    return null;
  }

  addEventListener(type, listener, options) {
    const lists = captureOf(options) ? this.captureListeners : this.listeners;
    const list = lists.get(type) ?? [];
    if (!list.includes(listener)) list.push(listener);
    lists.set(type, list);
  }

  removeEventListener(type, listener, options) {
    const list = (captureOf(options) ? this.captureListeners : this.listeners).get(type);
    if (list?.includes(listener)) list.splice(list.indexOf(listener), 1);
  }

  /**
   * Capture listeners of the ancestors run first, from the top down; then
   * this node's own, capture ones before bubbling ones; then, unless the event
   * does not bubble, the bubbling listeners of each ancestor up through
   * `parentNode`. Within a node listeners run in subscription order.
   * `stopPropagation()` ends the walk after the current node's listeners.
   * Returns false when a listener called `preventDefault()`.
   */
  dispatchEvent(event) {
    event.target ??= this;
    const ancestors = [];
    for (let node = this.parentNode; node; node = node.parentNode) ancestors.push(node);
    const run = (node, ...maps) => {
      event.currentTarget = node;
      for (const list of maps.map((map) => map.get(event.type) ?? [])) {
        // A listener removed by an earlier one on the same node does not run.
        for (const listener of [...list]) if (list.includes(listener)) listener.call(node, event);
      }
      return !event.cancelBubble;
    };
    const goingDown = [...ancestors].reverse().every((node) => run(node, node.captureListeners));
    if (goingDown && run(this, this.captureListeners, this.listeners) && event.bubbles !== false) {
      ancestors.every((node) => run(node, node.listeners));
    }
    // A browser clears it once dispatch is over; keeping it would hide a
    // handler that reads `currentTarget` from a timer. `cancelBubble` stays,
    // so a test can see that a handler stopped the event.
    event.currentTarget = null;
    return !event.defaultPrevented;
  }

  /** A template keeps what it holds in `content`, a fragment of its own, and its `childNodes` stay empty. */
  get content() {
    if (this.tagName !== "TEMPLATE") return undefined;
    this.templateContent ??= new FakeFragment(this.ownerDocument);
    return this.templateContent;
  }

  /** Writing replaces the children (a template's, its content) with what `parseHtml` builds; see `setInnerHtml`. */
  set innerHTML(markup) {
    setInnerHtml(this, markup);
  }

  /** Serialising a tree would be a second source of truth for the parser; read it with queries and textContent. */
  get innerHTML() {
    throw new Error("fake-dom: innerHTML is write-only; read the tree with querySelector and textContent");
  }

  /** Reflects the `open` attribute, as `<dialog>` and `<details>` do. */
  get open() {
    return this.hasAttribute("open");
  }

  showModal() {
    requireDialog(this, "showModal");
    this.setAttribute("open", "");
  }

  /** A closed dialog says nothing; an open one fires a `close` that does not bubble. */
  close() {
    requireDialog(this, "close");
    if (!this.open) return;
    this.removeAttribute("open");
    this.dispatchEvent(createEvent("close", { bubbles: false }));
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  setSelectionRange(start, end) {
    if (this.selectionStart === null) throw new Error("no selection on this control");
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

/** What `parseHtml` returns: a holder for the top-level nodes, which selectors never treat as an element. */
class FakeFragment extends FakeElement {
  constructor(ownerDocument) {
    super("fragment", ownerDocument);
    this.isFragment = true;
  }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.documentElement = new FakeElement("html", this);
    this.body = new FakeElement("body", this);
    this.documentElement.appendChild(this.body);
  }

  /** The `html` element is a candidate too, as it is a child of a real document. */
  querySelector(selector) {
    return select(this.documentElement, selector, true).next().value ?? null;
  }

  querySelectorAll(selector) {
    return [...select(this.documentElement, selector, true)];
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createTextNode(value) {
    return new FakeText(value, this);
  }

  importNode(node, deep = false) {
    if (node.nodeType === 3) return this.createTextNode(node.nodeValue);
    const copy = this.createElement(node.tagName);
    for (const { name, value } of node.attributes) copy.setAttribute(name, value);
    if (node.value !== undefined) copy.value = node.value;
    if (node.checked !== undefined) copy.checked = node.checked;
    if (deep) for (const child of node.childNodes) copy.appendChild(this.importNode(child, true));
    return copy;
  }
}

export function createDocument() {
  return new FakeDocument();
}

/**
 * Build a tree.
 *
 *   el(document, "tr", { "data-key": "p1" }, el(document, "td", {}, "Grak"))
 *
 * String children become text nodes. `value` and `checked` are set as
 * properties as well as attributes, the way a parsed control behaves.
 */
export function el(document, tagName, attributes = {}, ...children) {
  const element = document.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    element.setAttribute(name, value);
    if (name === "value") element.value = String(value);
    if (name === "checked") element.checked = true;
  }
  for (const child of children.flat()) {
    element.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return element;
}

/** Dispatch a new event at `target` and hand it back, so a test can read what handlers did to it. */
export function fireEvent(target, type, init = {}) {
  const event = createEvent(type, init);
  target.dispatchEvent(event);
  return event;
}

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ENTITIES = new Map([["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", '"']]);

// One piece of an opening tag, after its name: the gap, then `>` / `/>`, or an
// attribute — bare, or `=` and a double-quoted value (group 5 is missing when
// the value is not one, which is the error to report).
const TAG_PART = /([ \t\n\r\f]*)(?:(\/?>)|([a-zA-Z_:][\w:.-]*)(=(?:"([^"]*)")?)?)/y;
const TAG_NAME = /<([a-zA-Z][\w-]*)/y;
const CLOSING_TAG = /<\/([a-zA-Z][\w-]*)>/y;
const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);|&/gi;

/** The five escapes `escapeHtml` writes, plus numeric references; anything else is a mistake. */
function decodeEntities(text, fail) {
  return text.replace(ENTITY, (whole, name) => {
    if (name === undefined) return fail('a bare "&" — write &amp;');
    if (name[0] !== "#") return ENTITIES.get(name) ?? fail(`unknown entity ${whole}`);
    const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    const surrogate = code >= 0xd800 && code <= 0xdfff;
    if (!(code > 0 && code <= 0x10ffff) || surrogate) return fail(`bad character reference ${whole}`);
    return String.fromCodePoint(code);
  });
}

/**
 * Parse the strict markup `src/ui` writes into a fragment of fake nodes.
 *
 * Text becomes text nodes (whitespace-only ones are dropped, as between tags in
 * a formatted template), tags become elements, `value` and `checked` are
 * mirrored into properties the way `el()` does it. Everything a browser would
 * quietly repair — an unclosed tag, a stray `</p>`, single-quoted or unquoted
 * attributes, a bare `&` or `<`, a comment, a script — throws.
 */
export function parseHtml(document, markup) {
  const fail = (message, at) => {
    throw new Error(`parseHtml: ${message} (at ${at}: ${JSON.stringify(String(markup).slice(at, at + 24))})`);
  };
  if (typeof markup !== "string") fail("markup must be a string", 0);
  const root = new FakeFragment(document);
  const open = [root];

  let at = 0;
  while (at < markup.length) {
    if (markup[at] !== "<") {
      const end = markup.indexOf("<", at);
      const stop = end === -1 ? markup.length : end;
      let text = markup.slice(at, stop);
      // Inside a textarea blanks are the field's value, not formatting, and a
      // browser drops one newline right after the opening tag.
      const field = open.at(-1).tagName === "TEXTAREA";
      if (field && !open.at(-1).childNodes.length && text.startsWith("\n")) text = text.slice(1);
      if (text !== "" && (field || !ONLY_BLANKS.test(text))) {
        open.at(-1).appendChild(document.createTextNode(decodeEntities(text, (message) => fail(message, at))));
      }
      at = stop;
    } else if (markup.startsWith("<!", at)) {
      fail("comments, doctypes and CDATA are not supported", at);
    } else if (markup.startsWith("</", at)) {
      CLOSING_TAG.lastIndex = at;
      const closing = CLOSING_TAG.exec(markup);
      if (!closing) fail("malformed closing tag", at);
      const name = closing[1].toUpperCase();
      if (open.length === 1) fail(`</${closing[1]}> closes nothing`, at);
      if (open.at(-1).tagName !== name) fail(`</${closing[1]}> where <${open.at(-1).tagName.toLowerCase()}> is still open`, at);
      const closed = open.pop();
      if (closed.tagName === "TEXTAREA") closed.value = closed.textContent;
      at = CLOSING_TAG.lastIndex;
    } else {
      at = parseOpeningTag(document, markup, at, open, fail);
    }
  }
  if (open.length > 1) fail(`<${open.at(-1).tagName.toLowerCase()}> is never closed`, markup.length);
  return root;
}

/** One `<name …>` or `<name …/>`: builds the element, nests it, and returns where scanning resumes. */
function parseOpeningTag(document, markup, start, open, fail) {
  TAG_NAME.lastIndex = start;
  const named = TAG_NAME.exec(markup);
  if (!named) fail('a bare "<" — write &lt;', start);
  const name = named[1];
  const lower = name.toLowerCase();
  if (lower === "script") fail("<script> is not supported", start);
  if (lower === "template") fail("a <template> in markup keeps its children in .content, which is not modelled; set innerHTML on a template element instead", start);
  if (open.at(-1).tagName === "TEXTAREA") fail("a <textarea> holds text only", start);

  const element = document.createElement(name);
  const seen = new Set();
  let at = TAG_NAME.lastIndex;
  let selfClosing = false;
  for (;;) {
    TAG_PART.lastIndex = at;
    const part = TAG_PART.exec(markup);
    if (!part) fail(`unexpected character inside <${name}>`, at);
    const [whole, gap, end, attribute, equals, quoted] = part;
    at += whole.length;
    if (end) { selfClosing = end === "/>"; break; }
    if (gap === "") fail(`attributes need a space before them in <${name}>`, at - whole.length);
    if (seen.has(attribute)) fail(`duplicate attribute ${attribute} in <${name}>`, at - whole.length);
    seen.add(attribute);
    if (equals !== undefined && quoted === undefined) fail(`${attribute} needs a double-quoted value`, at - whole.length);
    const value = quoted === undefined ? "" : decodeEntities(quoted, (message) => fail(message, at - whole.length));
    if (attribute === "value" && (lower === "textarea" || lower === "select")) {
      fail(`a browser ignores value on <${lower}>; ${lower === "textarea" ? "put the text between the tags" : "mark an <option> selected"}`, start);
    }
    element.setAttribute(attribute, value);
    if (attribute === "value") element.value = value;
    if (attribute === "checked") element.checked = true;
  }

  const isVoid = VOID_ELEMENTS.has(lower);
  const inSvg = lower === "svg" || open.some((node) => node.tagName === "SVG");
  // In HTML a browser ignores the slash on any other element and leaves it open.
  if (selfClosing && !isVoid && !inSvg) fail(`"/>" on <${name}> would be ignored by a browser and leave it open; write <${name}></${name}>`, start);
  open.at(-1).appendChild(element);
  if (!selfClosing && !isVoid) open.push(element);
  return at;
}

// Contexts whose innerHTML a browser reads as text, not as markup.
const TEXT_CONTEXTS = new Set(["TEXTAREA", "TITLE", "STYLE", "SCRIPT"]);
// A browser's parser drops these where no table is being built, and a template or a table part is where one is.
const TABLE_PARTS = new Set(["TR", "TD", "TH", "TBODY", "THEAD", "TFOOT", "CAPTION", "COLGROUP", "COL"]);
const TABLE_CONTEXTS = new Set(["TEMPLATE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "COLGROUP"]);

/**
 * `element.innerHTML = markup`: the children (a template's content) are replaced
 * by what `parseHtml` builds. Parsing comes first, so markup that does not parse
 * leaves the element as it was; the old children are removed one by one, so
 * focus drops to the body when the focused node leaves, as it does in a browser.
 */
function setInnerHtml(element, markup) {
  const name = element.tagName.toLowerCase();
  if (element.isFragment) throw new Error("fake-dom: a fragment has no innerHTML; a browser would set a property that parses nothing");
  if (TEXT_CONTEXTS.has(element.tagName)) throw new Error(`fake-dom: innerHTML on a <${name}> is text in a browser, not markup; set textContent`);
  const parsed = parseHtml(element.ownerDocument, markup);
  if (!TABLE_CONTEXTS.has(element.tagName)) {
    for (const node of parsed.walk()) {
      if (TABLE_PARTS.has(node.tagName) && !node.closest("table")) {
        throw new Error(`fake-dom: a browser drops <${node.tagName.toLowerCase()}> assigned to a <${name}>'s innerHTML outside a table; parse it in a <template>`);
      }
    }
  }
  const target = element.content ?? element;
  for (const child of [...target.childNodes]) target.removeChild(child);
  for (const child of [...parsed.childNodes]) target.appendChild(child);
}

/** A shorthand for asserting structure: tag names and keys, nested. */
export function outline(node) {
  if (node.nodeType === 3) return node.nodeValue;
  const key = node.getAttribute("data-key");
  const name = key ? `${node.tagName.toLowerCase()}#${key}` : node.tagName.toLowerCase();
  if (!node.childNodes.length) return name;
  return `${name}(${node.childNodes.map(outline).join(",")})`;
}
