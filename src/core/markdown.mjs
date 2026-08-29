/**
 * The little bit of Markdown the reference pages actually use.
 *
 * The content vault is Obsidian Markdown, and the build step ships it through
 * to the client almost verbatim. The client does not need a Markdown parser —
 * it needs three things: the first table on a page (the skill and injury
 * tables are rendered as cards on narrow screens), bold/italic inside a table
 * cell, and the stat row of a star player.
 *
 * Everything here is a pure string function, which is the point: table parsing
 * is exactly the kind of code that quietly returns the wrong column when the
 * source changes shape, and it can only be pinned down by tests if it does not
 * touch the DOM.
 */

import { splitList } from "../domain/roster/values.mjs";
import { escapeHtml } from "./dom.mjs";

/**
 * Split a table row on `|`, ignoring the pipe inside an Obsidian wiki link.
 *
 * `[[Skills/Block|Block]]` is one cell, not two. A plain split on "|" gets
 * this wrong and shifts every column after it — which is how a star player
 * ends up costing "Block".
 */
export function splitStarMarkdownTableRow(line = "") {
  const trimmed = String(line).trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let inWikiLink = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const pair = trimmed.slice(index, index + 2);
    if (pair === "[[") {
      inWikiLink = true;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "]]") {
      inWikiLink = false;
      current += pair;
      index += 1;
      continue;
    }
    const char = trimmed[index];
    if (char === "|" && !inWikiLink) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Strip wiki links, bold markers and backticks down to the display text. */
export function cleanMarkdownCell(value = "") {
  return String(value)
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

/**
 * Pull a star player's stat line out of the page body.
 *
 * Returns `{}` when the page has no stat table, so callers fall back to the
 * front-matter values instead of rendering a row of "undefined".
 */
export function starPlayerTableData(page) {
  const lines = String(page?.body ?? "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /\|\s*MA\s*\|\s*ST\s*\|\s*AG\s*\|\s*PA\s*\|\s*AR/i.test(line));
  if (headerIndex === -1) return {};
  const dataLine = lines.slice(headerIndex + 1).find((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && !/^\|\s*-+/.test(trimmed);
  });
  if (!dataLine) return {};
  const cells = splitStarMarkdownTableRow(dataLine).map(cleanMarkdownCell);
  return {
    ma: cells[0] ?? "",
    st: cells[1] ?? "",
    ag: cells[2] ?? "",
    pa: cells[3] ?? "",
    ar: cells[4] ?? "",
    cost: cells[5] ?? "",
    skills: splitList(cells[6] ?? ""),
    keywords: splitList(cells[7] ?? ""),
  };
}

/**
 * Bold and italic, and nothing else.
 *
 * Escapes first, so the tags this adds are the only tags in the result. The
 * order matters: escaping afterwards would turn `<strong>` back into text.
 */
export function inlineSimpleMarkdown(value = "") {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** Split a table row on `|`. Wiki links are not expected here. */
export function splitMarkdownTableRow(line = "") {
  return String(line)
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * The first table on the page, as headers plus rows.
 *
 * A table is two consecutive lines starting with `|`; the second is the
 * `---` separator and is skipped. Returns null when there is no table.
 */
export function parseFirstMarkdownTable(markdown = "") {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const start = lines.findIndex((line, index) => (
    line.trim().startsWith("|")
    && lines[index + 1]?.trim().startsWith("|")
  ));
  if (start === -1) return null;

  const headers = splitMarkdownTableRow(lines[start]);
  const rows = [];
  for (let index = start + 2; index < lines.length && lines[index].trim().startsWith("|"); index += 1) {
    rows.push(splitMarkdownTableRow(lines[index]));
  }
  return { headers, rows };
}

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
