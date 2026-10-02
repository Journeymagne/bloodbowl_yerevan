/**
 * Turn skill and trait names in already-rendered text into links.
 *
 * Two modes, because the two places names appear are not alike:
 *
 * - A list of names — a roster's skill column — links every name, in any case.
 * - Sentences (`strictLinks`) are stricter. A name must be capitalised the way
 *   it is written, a page never links to itself, and names that are also
 *   ordinary rules words are left alone: "a Block action", "Tackle Zone" and
 *   "Kick-off" do not mean the skill.
 */
const PROSE_SKIP = new Set(["Accurate", "Block", "Catch", "Dodge", "Kick", "Pass", "Tackle"]);

/** A table cell holding sentences rather than a list of names. */
export const SENTENCE = /\.(\s|$)/;

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} html
 * @param {Map<string, object>} pageByTitle
 * @param {object} [options]
 * @param {boolean} [options.strictLinks] the text is sentences, not a list of names
 * @param {object} [options.selfPage] the page being rendered, never linked to itself
 */
export function autoLinkKnownTerms(html, pageByTitle, { strictLinks = false, selfPage = null } = {}) {
  if (html.includes("<a ")) {
    return html;
  }

  const entities = [...pageByTitle.values()]
    .filter((page) => page.kind === "skill" || page.kind === "trait")
    .filter((page) => !strictLinks || (page !== selfPage && !PROSE_SKIP.has(page.title)))
    .sort((a, b) => b.title.length - a.title.length);

  let linked = html;
  for (const page of entities) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(escapeHtml(page.title))})(?=$|[^A-Za-z0-9])`, strictLinks ? "g" : "gi");
    linked = linked
      .split(/(<a\b[^>]*>.*?<\/a>|<[^>]+>)/gi)
      .map((part) => {
        if (part.startsWith("<")) {
          return part;
        }
        return part.replace(pattern, (_match, prefix, label) => `${prefix}<a href="#/${page.slug}">${label}</a>`);
      })
      .join("");
  }

  return linked;
}
