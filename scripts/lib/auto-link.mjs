/**
 * Turn skill and trait names in already-rendered text into links.
 *
 * Two modes, because the two places names appear are not alike:
 *
 * - A list of names — a roster's skill column — links every name, in any case.
 * - Sentences (`strictLinks`) are stricter. A name must be capitalised the way
 *   it is written, a page never links to itself, and names that are also
 *   ordinary rules words are left alone: "a Block action", "Tackle Zone" and
 *   "Kick-off" do not mean the skill. Inside a comma-separated list they do,
 *   so "Dodge, Leap" still links both.
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
 * Whether the name at [start, end) of `parts[index]` is an item in a
 * comma-separated list — "Dodge, Leap" — which is where a skipped name does
 * mean the skill. Earlier items may already be links, so the text before and
 * after is read across the neighbouring parts with their tags removed.
 */
function inCommaList(parts, index, start, end) {
  const plain = (list) => list.join("").replace(/<[^>]+>/g, "");
  const before = plain(parts.slice(0, index)) + parts[index].slice(0, start);
  const after = parts[index].slice(end) + plain(parts.slice(index + 1));
  return /,\s*$/.test(before) || /^\s*,/.test(after);
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
    .filter((page) => !strictLinks || page !== selfPage)
    .sort((a, b) => b.title.length - a.title.length);

  let linked = html;
  for (const page of entities) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(escapeHtml(page.title))})(?=$|[^A-Za-z0-9])`, strictLinks ? "g" : "gi");
    const listOnly = strictLinks && PROSE_SKIP.has(page.title);
    linked = linked
      .split(/(<a\b[^>]*>.*?<\/a>|<[^>]+>)/gi)
      .map((part, partIndex, parts) => {
        if (part.startsWith("<")) {
          return part;
        }
        return part.replace(pattern, (match, prefix, label, offset) => {
          if (listOnly && !inCommaList(parts, partIndex, offset + prefix.length, offset + match.length)) return match;
          return `${prefix}<a href="#/${page.slug}">${label}</a>`;
        });
      })
      .join("");
  }

  return linked;
}
