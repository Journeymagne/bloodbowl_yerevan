/**
 * Building markup safely, and listening to it once.
 *
 * The app renders HTML strings and assigns them with innerHTML. That is fine
 * as long as every value that came from a person is escaped: `escapeHtml` on
 * every interpolation (a component's `…Html` prop is only markup another
 * render function made). A missed escape here is stored XSS, and the session
 * token lives in localStorage. (The `html` tagged template and its `raw()`
 * that this module once offered for it never found a reader in 3.0: they went
 * with stage 13's clean-up.)
 */

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape a value for use as HTML text or inside a double-quoted attribute. */
export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

// ---------------------------------------------------------------------------
// patch() — update the live DOM in place instead of replacing it
// ---------------------------------------------------------------------------

/**
 * Rebuilding a screen with `innerHTML = …` throws away the parts of the DOM
 * that are not in the markup: which field has focus, where the caret sits,
 * how far the page is scrolled, which cards are open. The roster editor
 * re-renders on every keystroke, so all of that is lost every time — and the
 * editor grew hand-written patches (four nodes updated by hand for SPP, one
 * for the treasury) to work around its own re-render.
 *
 * `patch()` walks the new markup against the live tree and touches only what
 * differs. Nodes carrying `data-key` are matched by that key, so a row can move
 * without being rebuilt; everything else is matched by position and kind. A
 * node carrying `data-patch-keep` is one the page put in by hand, which no
 * markup draws (the toasts' region in an open sheet, components/toast.mjs):
 * patch leaves it where it is, and one inside a node that goes stays on the
 * page, in the place of the node that went.
 *
 * This is deliberately not a virtual DOM: there is no component model, no
 * state, no scheduling. It is a diff between what is on screen and the string
 * the screen just produced.
 */

const KEY_ATTRIBUTE = "data-key";
const KEEP_ATTRIBUTE = "data-patch-keep";
const VALUE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isElement(node) {
  return node?.nodeType === 1;
}

function isText(node) {
  return node?.nodeType === 3;
}

function keyOf(node) {
  return isElement(node) && typeof node.getAttribute === "function" ? node.getAttribute(KEY_ATTRIBUTE) : null;
}

/** A node no markup draws, which patch never matches, moves or takes away. */
function isKept(node) {
  return isElement(node) && typeof node.hasAttribute === "function" && node.hasAttribute(KEEP_ATTRIBUTE);
}

/** Take a live child away, and leave on the page, under `live`, the kept nodes it held. */
function dropChild(live, child) {
  if (isElement(child) && typeof child.querySelectorAll === "function") {
    for (const kept of [...child.querySelectorAll(`[${KEEP_ATTRIBUTE}]`)]) live.appendChild(kept);
  }
  live.removeChild(child);
}

/** Can `live` be updated into `next`, or does it have to be replaced? */
function sameKind(live, next) {
  if (!live || !next || live.nodeType !== next.nodeType) return false;
  if (!isElement(live)) return true;
  return live.tagName === next.tagName && keyOf(live) === keyOf(next);
}

/**
 * The value of a form control is a property, not an attribute: once someone has
 * typed, the attribute still says what the markup said and the property says
 * what is on screen. Setting it back while the field has focus would fight the
 * person typing, so the focused control is left alone.
 */
function syncControlValue(live, next, activeElement) {
  if (live === activeElement || !VALUE_TAGS.has(live.tagName)) return;
  const wanted = next.value;
  if (wanted !== undefined && wanted !== null && live.value !== wanted) live.value = wanted;
  if (typeof next.checked === "boolean" && live.checked !== next.checked) live.checked = next.checked;
}

function patchAttributes(live, next, activeElement) {
  const wanted = new Set();
  for (const { name, value } of Array.from(next.attributes ?? [])) {
    wanted.add(name);
    if (live.getAttribute(name) !== value) live.setAttribute(name, value);
  }
  // Snapshot before removing: attributes is a live collection.
  for (const { name } of Array.from(live.attributes ?? [])) {
    if (!wanted.has(name)) live.removeAttribute(name);
  }
  syncControlValue(live, next, activeElement);
}

function adopt(parent, node) {
  const document = parent.ownerDocument;
  return typeof document?.importNode === "function" ? document.importNode(node, true) : node;
}

/**
 * Match each wanted child to a live one, patch the matches, drop the rest; a kept
 * one (`isKept`) is none of these, and stays after them.
 *
 * Keyed children are matched anywhere in the list — that is what lets a row
 * move without being rebuilt. Unkeyed children are matched strictly in order,
 * so a `<span>` that became a `<button>` at the same position is replaced
 * rather than mistaken for the next `<span>` further down.
 */
function patchChildren(live, next, activeElement) {
  const liveChildren = Array.from(live.childNodes ?? []);
  const keyed = new Map();
  for (const child of liveChildren) {
    const key = keyOf(child);
    if (key !== null && !keyed.has(key) && !isKept(child)) keyed.set(key, child);
  }

  const used = new Set();
  const ordered = [];
  let cursor = 0;

  for (const wanted of Array.from(next.childNodes ?? [])) {
    const key = keyOf(wanted);
    let match = null;
    if (key !== null) {
      const candidate = keyed.get(key);
      if (candidate && !used.has(candidate) && sameKind(candidate, wanted)) match = candidate;
    } else {
      while (cursor < liveChildren.length) {
        const candidate = liveChildren[cursor];
        cursor += 1;
        if (used.has(candidate) || keyOf(candidate) !== null || isKept(candidate)) continue;
        if (sameKind(candidate, wanted)) match = candidate;
        break;
      }
    }
    if (match) {
      used.add(match);
      patchNode(match, wanted, activeElement);
      ordered.push(match);
    } else {
      ordered.push(adopt(live, wanted));
    }
  }

  for (const child of liveChildren) {
    if (!used.has(child) && !isKept(child)) dropChild(live, child);
  }
  reorder(live, ordered);
}

/** Move survivors and newcomers into the order the markup asked for. */
function reorder(live, ordered) {
  for (let index = 0; index < ordered.length; index += 1) {
    const node = ordered[index];
    if (live.childNodes[index] !== node) live.insertBefore(node, live.childNodes[index] ?? null);
  }
}

function patchNode(live, next, activeElement) {
  if (isText(live)) {
    if (live.nodeValue !== next.nodeValue) live.nodeValue = next.nodeValue;
    return live;
  }
  if (!isElement(live)) return live;
  patchAttributes(live, next, activeElement);
  patchChildren(live, next, activeElement);
  return live;
}

/**
 * Parse markup without letting the HTML parser rewrite it.
 *
 * A `<tr>` assigned to a `<div>`'s innerHTML is hoisted out of its table by the
 * parser and silently disappears — which is most of the roster editor. Template
 * contents parse under their own rules and keep it.
 */
function sourceFrom(root, next) {
  if (next && typeof next === "object" && "childNodes" in next) return next;
  const document = root.ownerDocument ?? globalThis.document;
  const template = document.createElement("template");
  // A plain string is markup, exactly as it was when this was `innerHTML = …`.
  // Escaping is `html`'s job, and a caller who wants it passes an html`` value.
  template.innerHTML = typeof next === "string" ? next : toHtml(next);
  return template.content;
}

function captureFocus(document) {
  const element = document?.activeElement;
  if (!element || element === document.body) return null;
  const state = { element, key: keyOf(element), id: element.id || "", start: null, end: null };
  // selectionStart throws on inputs that have no text selection (number, checkbox).
  try {
    state.start = element.selectionStart;
    state.end = element.selectionEnd;
  } catch {
    state.start = null;
  }
  return state;
}

function restoreFocus(root, state) {
  if (!state) return;
  const document = root.ownerDocument ?? globalThis.document;
  const stillAttached = root.contains?.(state.element) ?? false;
  // The identity check alone is not enough: a browser moves focus to the body
  // when the focused node is removed, but only after the removal, so asking
  // "is activeElement still my element" can answer yes about a detached node.
  if (stillAttached && document?.activeElement === state.element) return;
  const selector = state.key ? `[${KEY_ATTRIBUTE}="${state.key}"]` : state.id ? `#${state.id}` : "";
  const target = stillAttached
    ? state.element
    : selector && typeof root.querySelector === "function"
      ? root.querySelector(selector)
      : null;
  if (!target || typeof target.focus !== "function") return;
  target.focus();
  if (state.start === null || typeof target.setSelectionRange !== "function") return;
  try {
    target.setSelectionRange(state.start, state.end);
  } catch {
    // The replacement is not a text field; having focus back is enough.
  }
}

/**
 * Update `root`'s children to match `next`, touching only what differs.
 *
 * @param {Element} root live element whose children are updated in place
 * @param {object|string} next markup from `html\`\``, or a node to copy from
 * @returns {Element} `root`
 */
export function patch(root, next) {
  const document = root.ownerDocument ?? globalThis.document ?? null;
  const focus = captureFocus(document);
  patchChildren(root, sourceFrom(root, next), document?.activeElement ?? null);
  restoreFocus(root, focus);
  return root;
}

/** The identity (`data-screen`) of the screen `root` holds, or null for one that carries none. */
const screenOf = (root) => root.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null;

/**
 * Draw a screen into `root` (the view) and start the page over when it is another screen than the one
 * that was there. Nothing resets the window's scroll on a hash change and `patch` keeps it, so a tap on
 * a row, a search result, a prose link or a tile would show the next screen at the old screen's offset.
 * The same screen drawn again (a language switch, a keystroke in a field, a season that arrived) keeps
 * the page where it is. A screen is what its root's `data-screen` says; the screen of another module,
 * which carries none, is another one than any of these.
 *
 * @param {Element} root
 * @param {string} markup the screen's markup, whose root carries the identity
 */
export function drawScreen(root, markup) {
  const before = screenOf(root);
  patch(root, markup);
  if (screenOf(root) !== before) globalThis.scrollTo?.(0, 0);
}

/**
 * Whether a focus is left on nothing: on no element, on the body, on a node no longer in the page, or on one still in
 * it that a stylesheet hides (it draws no box, and a browser drops that focus to the body a moment later).
 *
 * @param {Element|null} active what `document.activeElement` is
 * @returns {boolean}
 */
export function focusLost(active) {
  return !active || active === active.ownerDocument?.body || !active.isConnected || active.getClientRects?.().length === 0;
}

/**
 * Draw a screen again in another form (a width that crossed 900px): a node the focus was on may be gone with the old
 * form, or kept and hidden by the new one's stylesheet. A focus `root` held that the draw left on nothing (`focusLost`)
 * goes to the first node of `root` that `target` names, the place a keyboard goes on from; one the new form keeps and
 * shows, or one outside `root`, stays where it is.
 *
 * @param {Element} root the view
 * @param {() => void} draw
 * @param {string} target a selector
 */
export function drawKeepingFocus(root, draw, target) {
  const document = root.ownerDocument ?? globalThis.document;
  const held = root.contains(document.activeElement);
  draw();
  if (held && focusLost(document.activeElement)) root.querySelector(target)?.focus();
}

/**
 * One listener for a whole list instead of one per row.
 *
 * The screens re-render by replacing innerHTML, which throws away every
 * listener attached to the old nodes; delegating to a container that survives
 * the re-render means handlers do not have to be attached again each time.
 *
 * @returns {() => void} removes the listener
 */
export function delegate(root, eventName, selector, handler) {
  const listener = (event) => {
    // Duck-typed rather than `instanceof Element`: text nodes and the document
    // have no `closest` either, and `instanceof` is false across realms, so a
    // click inside an iframe or a printed document would be silently dropped.
    const source = event?.target;
    const target = typeof source?.closest === "function" ? source.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(eventName, listener);
  return () => root.removeEventListener(eventName, listener);
}

/**
 * A set of delegated listeners that are dropped together.
 *
 * Screens re-run their wiring on every render. While a render replaced the
 * whole subtree that was self-correcting — the old nodes and their listeners
 * went with it. Delegated listeners live on the container instead, which
 * survives, so wiring twice means handling every click twice.
 *
 * So a screen wires into a group and hands `release` to
 * core/screen-lifecycle.mjs under a stable key: re-registering the key drops
 * the previous group, and leaving the route drops the last one.
 *
 * @param {Element} root the container the listeners sit on
 */
export function listenerGroup(root) {
  const offs = [];
  return {
    /** @param {string} eventName @param {string} selector @param {Function} handler */
    on(eventName, selector, handler) {
      offs.push(delegate(root, eventName, selector, handler));
    },
    /** Take ownership of an unsubscribe produced elsewhere. */
    own(off) {
      if (typeof off === "function") offs.push(off);
    },
    release() {
      while (offs.length) offs.pop()();
    },
  };
}
