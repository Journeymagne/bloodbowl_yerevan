/**
 * Turn skill and trait names in already-rendered text into links.
 *
 * Two modes, because the two places names appear are not alike:
 *
 * - A list of names — a roster's skill column — links every name, in any case.
 * - Sentences (`prose`) are stricter. A name must start with a capital,
 *   a page never links to itself, and names that are also ordinary rules words
 *   are left alone: "a Block action", "Tackle Zone" and "Kick-off" do not mean
 *   the skill. Inside a comma-separated list they do, so "Dodge, Leap" still
 *   links both.
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

/** One matcher per set of pages: building it is the expensive part, and a build asks thousands of times. */
const linkers = new WeakMap();

function linkerFor(pageByTitle) {
  let linker = linkers.get(pageByTitle);
  if (!linker) {
    const pages = [...pageByTitle.values()].filter((page) => page.kind === "skill" || page.kind === "trait");
    // Longest first, so "Diving Catch" is tried before "Catch".
    const titles = pages.map((page) => escapeHtml(page.title)).sort((a, b) => b.length - a.length);
    linker = {
      byTitle: new Map(pages.map((page) => [escapeHtml(page.title).toLowerCase(), page])),
      pattern: new RegExp(`(?<![A-Za-z0-9])(?:${titles.map(escapeRegExp).join("|")})(?![A-Za-z0-9])`, "gi"),
    };
    linkers.set(pageByTitle, linker);
  }
  return linker;
}

/** Whether a name found in a sentence refers to the skill; `offset` is where `label` starts in `text`. */
function linksInProse(page, label, text, offset, selfPage) {
  if (page === selfPage || label[0] !== label[0].toUpperCase()) return false;
  if (!PROSE_SKIP.has(page.title)) return true;
  return /,\s*$/.test(text.slice(0, offset)) || /^\s*,/.test(text.slice(offset + label.length));
}

/**
 * @param {string} html
 * @param {Map<string, object>} pageByTitle
 * @param {object} [options]
 * @param {boolean} [options.prose] the text is sentences, not a list of names
 * @param {object} [options.selfPage] the page being rendered, never linked to itself
 */
export function autoLinkKnownTerms(html, pageByTitle, { prose = false, selfPage = null } = {}) {
  if (html.includes("<a ")) {
    return html;
  }

  const { byTitle, pattern } = linkerFor(pageByTitle);
  if (!byTitle.size) {
    return html;
  }

  return html
    .split(/(<[^>]+>)/)
    .map((text) => {
      if (text.startsWith("<")) {
        return text;
      }
      return text.replace(pattern, (label, offset) => {
        const page = byTitle.get(label.toLowerCase());
        if (prose && !linksInProse(page, label, text, offset, selfPage)) return label;
        return `<a href="#/${page.slug}">${label}</a>`;
      });
    })
    .join("");
}
