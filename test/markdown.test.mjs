import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanMarkdownCell,
  inlineSimpleMarkdown,
  parseFirstMarkdownTable,
  splitMarkdownTableRow,
  splitStarMarkdownTableRow,
  starPlayerTableData,
} from "../src/core/markdown.mjs";

// ---------------------------------------------------------------------------
// Wiki links are the whole reason this parser exists
// ---------------------------------------------------------------------------

test("a pipe inside a wiki link does not start a new cell", () => {
  // The bug this prevents: splitting naively on "|" turns one cell into two
  // and shifts every column after it, so the cost column reads "Block".
  const row = "| 6 | 4 | 3+ | 5+ | 10+ | 250,000 | [[Skills/Block\\|Block]], Loner | Star |";
  const cells = splitStarMarkdownTableRow(row.replace(/\\\|/g, "|"));
  assert.equal(cells.length, 8);
  assert.equal(cells[5], "250,000");
  assert.equal(cells[6], "[[Skills/Block|Block]], Loner");
});

test("leading and trailing pipes do not produce empty cells", () => {
  assert.deepEqual(splitStarMarkdownTableRow("| a | b |"), ["a", "b"]);
  assert.deepEqual(splitStarMarkdownTableRow("a | b"), ["a", "b"]);
});

test("cleanMarkdownCell reduces a cell to what a reader should see", () => {
  assert.equal(cleanMarkdownCell("[[Skills/Block|Block]]"), "Block");
  assert.equal(cleanMarkdownCell("[[Sure Hands]]"), "Sure Hands");
  assert.equal(cleanMarkdownCell("**Loner (4+)**"), "Loner (4+)");
  assert.equal(cleanMarkdownCell("`Dodge`"), "Dodge");
  assert.equal(cleanMarkdownCell("  spaced  "), "spaced");
});

// ---------------------------------------------------------------------------
// Star player stat lines
// ---------------------------------------------------------------------------

const STAR_BODY = [
  "# Griff Oberwald",
  "",
  "| MA | ST | AG | PA | AR | Cost | Skills | Keywords |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  "| 7 | 4 | 2+ | 3+ | 9+ | 280,000 | [[Skills/Block|Block]], Dodge | Human, Old World |",
].join("\n");

test("the stat row is read from the table, not guessed", () => {
  const star = starPlayerTableData({ body: STAR_BODY });
  assert.equal(star.ma, "7");
  assert.equal(star.st, "4");
  assert.equal(star.ag, "2+");
  assert.equal(star.pa, "3+");
  assert.equal(star.ar, "9+");
  assert.equal(star.cost, "280,000");
  assert.deepEqual(star.skills, ["Block", "Dodge"]);
  assert.deepEqual(star.keywords, ["Human", "Old World"]);
});

test("the separator row is skipped rather than read as data", () => {
  const star = starPlayerTableData({ body: STAR_BODY });
  assert.notEqual(star.ma, "---");
});

test("a page with no stat table returns nothing to render", () => {
  // Empty object, not undefined fields: the caller falls back to front-matter.
  assert.deepEqual(starPlayerTableData({ body: "Just prose." }), {});
  assert.deepEqual(starPlayerTableData({}), {});
  assert.deepEqual(starPlayerTableData(undefined), {});
});

test("a header with no row after it is not treated as data", () => {
  const body = "| MA | ST | AG | PA | AR |\n| --- | --- | --- | --- | --- |";
  assert.deepEqual(starPlayerTableData({ body }), {});
});

// ---------------------------------------------------------------------------
// Inline markup
// ---------------------------------------------------------------------------

test("bold and italic survive, markup from the vault does not", () => {
  assert.equal(inlineSimpleMarkdown("**Block**"), "<strong>Block</strong>");
  assert.equal(inlineSimpleMarkdown("*maybe*"), "<em>maybe</em>");
  assert.equal(
    inlineSimpleMarkdown("<script>alert(1)</script>"),
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "escaping happens before the tags are added, so these are the only tags",
  );
});

test("an unmatched asterisk is left alone instead of eating the rest of the line", () => {
  assert.equal(inlineSimpleMarkdown("2 * 3"), "2 * 3");
});

// ---------------------------------------------------------------------------
// Tables on reference pages
// ---------------------------------------------------------------------------

const TABLE_BODY = [
  "Some prose first.",
  "",
  "| D6 | Result | Effect |",
  "| --- | --- | --- |",
  "| 1 | Badly Hurt | No long term effect |",
  "| 2-3 | Miss Next Game | Player misses the next game |",
  "",
  "| Ignored | Second table |",
  "| --- | --- |",
  "| x | y |",
].join("\n");

test("the first table is parsed, headers separate from rows", () => {
  const table = parseFirstMarkdownTable(TABLE_BODY);
  assert.deepEqual(table.headers, ["D6", "Result", "Effect"]);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[1], ["2-3", "Miss Next Game", "Player misses the next game"]);
});

test("parsing stops at the blank line, so the second table is left alone", () => {
  const table = parseFirstMarkdownTable(TABLE_BODY);
  assert.equal(table.rows.length, 2, "the second table is not appended to the first");
});

test("a page with no table returns null so the caller can skip rendering", () => {
  assert.equal(parseFirstMarkdownTable("no tables here"), null);
  assert.equal(parseFirstMarkdownTable(""), null);
  assert.equal(parseFirstMarkdownTable(null), null, "a missing body is a missing table, not a crash");
});

test("a lone pipe line is not a table", () => {
  // A table needs a separator row under it; one line is prose that happens to
  // contain a pipe.
  assert.equal(parseFirstMarkdownTable("| this is just a sentence |"), null);
});

test("splitMarkdownTableRow trims each cell", () => {
  assert.deepEqual(splitMarkdownTableRow("|  a  |  b  |"), ["a", "b"]);
});
