/**
 * The little bit of Markdown the client still handles.
 *
 * The content vault is Obsidian Markdown, and the build step ships it through
 * to the client almost verbatim. The client does not need a Markdown parser —
 * it needs the plain prose of a page, for search and for a preview to be cut
 * from. (The table, star-player and inline-markup helpers that stood here fed
 * the 2.x reference screens; the 3.0 reference reads the page's built HTML.)
 *
 * A pure string function, which is the point: it is shared with the build, and
 * it can only be pinned down by tests if it does not touch the DOM.
 */

/**
 * A page's prose with the Markdown taken out: what search matches against and
 * what a card preview is cut from.
 *
 * Shipped as a `text` field on every page until step 11.2, which noticed it is
 * derivable from the `body` that ships anyway — 0.19 MB of the built file
 * saying something the file already said. The build no longer writes it and
 * src/data/reference.mjs derives it on load, which costs one pass over 292
 * strings and nothing on the wire.
 *
 * scripts/build-data.mjs imports this rather than keeping its own copy, so the
 * two cannot drift: a search that matched before must match now.
 */
export function stripMarkdownFormatting(value = "") {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => alias || target)
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
