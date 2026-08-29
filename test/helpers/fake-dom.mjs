/**
 * A DOM small enough to test `patch()` against, and nothing more.
 *
 * The project has no jsdom and no browser in `npm test` — that is deliberate,
 * the tests must run on a bare Node. But `patch()` is all node moves, attribute
 * writes and focus bookkeeping, and asserting those against hand-rolled fakes
 * inside each test would bury what is being proved.
 *
 * So: real tree semantics (parentNode, insertBefore that moves, removeChild),
 * real attribute storage, real focus and selection. No parser — tests build
 * trees with `el()` and `text()` and hand them to `patch()` directly, which is
 * the second form its signature accepts. The markup-string form goes through
 * `<template>` and is proved in the browser check instead.
 */

/** `savedAt` -> `saved-at`, the way dataset names map onto attributes. */
function dashed(name) {
  return String(name).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
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

  /** `[data-key="…"]`, a bare `[attribute]`, and `#id`. */
  querySelector(selector) {
    const keyed = /^\[data-key="(.*)"\]$/.exec(selector);
    const present = /^\[([\w-]+)\]$/.exec(selector);
    const byId = /^#(.+)$/.exec(selector);
    for (const node of this.walk()) {
      if (node === this || node.nodeType !== 1) continue;
      if (keyed && node.getAttribute("data-key") === keyed[1]) return node;
      if (present && node.getAttribute(present[1]) !== null) return node;
      if (byId && node.id === byId[1]) return node;
    }
    return null;
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

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.body = new FakeElement("body", this);
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

/** A shorthand for asserting structure: tag names and keys, nested. */
export function outline(node) {
  if (node.nodeType === 3) return node.nodeValue;
  const key = node.getAttribute("data-key");
  const name = key ? `${node.tagName.toLowerCase()}#${key}` : node.tagName.toLowerCase();
  if (!node.childNodes.length) return name;
  return `${name}(${node.childNodes.map(outline).join(",")})`;
}
