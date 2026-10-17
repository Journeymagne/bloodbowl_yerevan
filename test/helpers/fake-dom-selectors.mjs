/**
 * Selectors for the fake DOM: a comma list of descendant chains of compounds,
 * each a tag or `*` followed by any of `#id`, `.class`, `[attr]`,
 * `[attr="value"]` and `:modal`. Nothing else is understood, and what is not
 * understood throws — a selector that quietly matched nothing would pass a
 * test that should fail.
 *
 * `:modal` is the one pseudo-class, because `patchWithModal` asks for it: a
 * dialog that `showModal()` opened and that is still open, in the tree.
 *
 * It reads nodes by duck typing (`tagName`, `id`, `classList`, `getAttribute`,
 * `isModal`, `parentNode`, `walk()`), so it does not import the node classes.
 */

/** The whitespace CSS knows about. */
const BLANK = /[ \t\n\r\f]/;

// A CSS identifier, ASCII only: `#1a` is a syntax error in a browser and must be one here.
const IDENTIFIER = /(?:--|-?[a-zA-Z_])[\w-]*/y;

/** Parse to `[[{ tag, id, classes, attributes, modal }, …], …]`: a list of chains, each a list of compounds. */
export function parseSelectorList(source) {
  const fail = (why) => {
    throw new Error(`fake-dom: unsupported selector ${JSON.stringify(source)} (${why})`);
  };
  const identifier = (at) => {
    IDENTIFIER.lastIndex = at;
    const found = IDENTIFIER.exec(source);
    if (!found) fail(`expected a name at ${at}`);
    return found[0];
  };
  const list = [];
  let complex = [];
  let compound = null;
  const closeCompound = () => {
    if (compound) complex.push(compound);
    compound = null;
  };
  const closeComplex = () => {
    closeCompound();
    if (!complex.length) fail("empty selector");
    list.push(complex);
    complex = [];
  };

  let at = 0;
  while (at < source.length) {
    const character = source[at];
    if (character === ",") { closeComplex(); at += 1; continue; }
    if (BLANK.test(character)) { closeCompound(); at += 1; continue; }
    compound ??= { start: at, tag: null, id: null, classes: [], attributes: [], modal: false };
    if (character === "*" || /[a-zA-Z]/.test(character)) {
      if (at !== compound.start) fail("a tag can only come first in a compound");
      const name = character === "*" ? "*" : identifier(at);
      compound.tag = name.toUpperCase();
      at += name.length;
    } else if (character === "#") {
      if (compound.id !== null) fail("two ids in one compound");
      compound.id = identifier(at + 1);
      at += 1 + compound.id.length;
    } else if (character === ".") {
      const name = identifier(at + 1);
      compound.classes.push(name);
      at += 1 + name.length;
    } else if (character === ":") {
      const name = identifier(at + 1);
      if (name !== "modal") fail(`the pseudo-class ":${name}"`);
      compound.modal = true;
      at += 1 + name.length;
    } else if (character === "[") {
      const name = identifier(at + 1);
      at += 1 + name.length;
      let value = null;
      if (source[at] === "=") {
        if (source[at + 1] !== '"') fail("attribute values must be double-quoted");
        const end = source.indexOf('"', at + 2);
        if (end === -1) fail("unterminated attribute value");
        value = source.slice(at + 2, end);
        if (value.includes("\\")) fail("escapes in attribute values");
        at = end + 1;
      }
      if (source[at] !== "]") fail(`expected "]" at ${at}`);
      at += 1;
      compound.attributes.push({ name, value });
    } else {
      fail(`"${character}" at ${at}`);
    }
  }
  closeComplex();
  return list;
}

function matchesCompound(element, compound) {
  // A fragment is a container, not an element: `*` must not match it.
  if (element.isFragment) return false;
  if (compound.tag !== null && compound.tag !== "*" && compound.tag !== element.tagName) return false;
  if (compound.id !== null && element.id !== compound.id) return false;
  if (!compound.classes.every((name) => element.classList.contains(name))) return false;
  if (compound.modal && element.isModal !== true) return false;
  return compound.attributes.every(({ name, value }) => {
    const actual = element.getAttribute(name);
    return actual !== null && (value === null || actual === value);
  });
}

function matchesComplex(element, complex) {
  let index = complex.length - 1;
  if (!matchesCompound(element, complex[index])) return false;
  // Only descendant combinators exist, so the nearest matching ancestor is
  // always the right pick for the compound to its left.
  for (let walk = element.parentNode; walk && index > 0; walk = walk.parentNode) {
    if (matchesCompound(walk, complex[index - 1])) index -= 1;
  }
  return index === 0;
}

export function matchesList(element, list) {
  return list.some((complex) => matchesComplex(element, complex));
}

/** Elements under `root` (and `root` itself on request) that match, in document order. */
export function* select(root, selector, includeRoot) {
  const list = parseSelectorList(selector);
  for (const node of root.walk()) {
    if (node.nodeType !== 1 || (node === root && !includeRoot)) continue;
    if (matchesList(node, list)) yield node;
  }
}
