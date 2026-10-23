/**
 * Where a browser's tree builder puts markup somewhere other than where it was written, though every tag
 * parses: a block closes the `<p>` it stands in, a table part that is not in the part it needs gets that
 * part put around it (or is dropped), and whatever is not a table part is moved out of the table
 * ("foster parenting"). `parseHtml` asks this module about each tag and each run of text; a "no" throws.
 */

// Opening tags that close an open <p> in a browser, so the tree it builds has them after the paragraph, not in it.
const CLOSES_P = new Set([
  "address", "article", "aside", "blockquote", "dd", "details", "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main", "menu", "nav", "ol", "p", "pre", "section", "summary", "table", "ul",
]);
// A <p> beyond one of these is out of reach: the parser looks for the <p> to close no further.
const P_SCOPE_EDGES = new Set(["BUTTON", "TABLE", "TD", "TH", "CAPTION"]);
const OR = new Intl.ListFormat("en", { type: "disjunction" });
// Where each table part must stand. Anywhere else a browser wraps it in the part it needs (a <tbody> around a <tr>) or drops it.
const TABLE_PLACES = [
  { parts: ["tr"], parents: ["THEAD", "TBODY", "TFOOT"], noun: "table section" },
  { parts: ["td", "th"], parents: ["TR"], noun: "table row" },
  { parts: ["thead", "tbody", "tfoot", "caption", "colgroup"], parents: ["TABLE"], noun: "table" },
  { parts: ["col"], parents: ["COLGROUP"], noun: "column group" },
];
// All that a table part holds. Another tag, or text, is moved out of the table. (A browser keeps a <style>, a <form>
// and a hidden <input> in place; this refuses them too, which is the safe side, and nothing here writes one.)
const TABLE_HOLDS = new Map([
  ["TABLE", ["caption", "colgroup", "thead", "tbody", "tfoot"]],
  ["THEAD", ["tr"]],
  ["TBODY", ["tr"]],
  ["TFOOT", ["tr"]],
  ["TR", ["td", "th"]],
  ["COLGROUP", ["col"]],
]);

/**
 * The table part the parser is inside, if the markup itself opened it. The element the markup is set into is not
 * on the parser's stack, so a browser leaves what stands at the top level of a `<tbody>`'s innerHTML where it is.
 */
function openTablePart(open) {
  const tag = open.length > 1 ? open.at(-1).tagName : null;
  return TABLE_HOLDS.has(tag) ? { name: tag.toLowerCase(), holds: TABLE_HOLDS.get(tag) } : null;
}

const holdsOnly = ({ name, holds }) => `a browser moves it out of the table; a <${name}> holds only ${OR.format(holds.map((tag) => `<${tag}>`))}`;

/**
 * An opening tag, checked before it is built. `context` is the tag name of the element the markup is set into;
 * the top level of a <template> takes any table part, as a browser lets its contents start in the middle of a table.
 */
export function checkPlacement(lower, open, context, fail) {
  if (CLOSES_P.has(lower)) {
    for (let index = open.length - 1; index > 0 && !P_SCOPE_EDGES.has(open[index].tagName); index -= 1) {
      if (open[index].tagName === "P") fail(`<${lower}> inside a <p>: a browser closes the <p> before it`);
    }
  }
  const place = TABLE_PLACES.find(({ parts }) => parts.includes(lower));
  const parent = open.length === 1 ? context?.toUpperCase() : open.at(-1).tagName;
  if (place && parent !== "TEMPLATE" && !place.parents.includes(parent)) {
    if (lower === "tr" && parent === "TABLE") fail("<tr> straight in a <table>: a browser puts a <tbody> around it; write the <tbody>");
    fail(`<${lower}> outside a ${place.noun}: put it in a ${OR.format(place.parents.map((tag) => `<${tag.toLowerCase()}>`))}`);
  }
  const inside = openTablePart(open);
  if (inside && !inside.holds.includes(lower)) fail(`<${lower}> straight in a <${inside.name}>: ${holdsOnly(inside)}`);
}

/** Text that is not blanks, about to become a text node. */
export function checkText(open, fail) {
  const inside = openTablePart(open);
  if (inside) fail(`text straight in a <${inside.name}>: ${holdsOnly(inside)}`);
}
