/**
 * The stylesheet minifier the site build uses.
 *
 * It lives apart from build-site.mjs because that script builds the site the
 * moment it is imported, so a test cannot load anything from it.
 */
export function minifyCss(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    // A space before :is/:where can be a descendant combinator, not decoration.
    // "+" stays out of the list: inside calc() it must keep its spaces, and a
    // sibling combinator is just as valid with them.
    .replace(/\s*([{};,>~])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}
