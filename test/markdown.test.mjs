import assert from "node:assert/strict";
import test from "node:test";

import { stripMarkdownFormatting } from "../src/core/markdown.mjs";

/*
 * What a page's prose becomes for search, and what the build makes of a table's cell, a skill's
 * metadata or a roster's position (scripts/build-data.mjs, scripts/lib/render-table.mjs): the words,
 * with the markup the vault writes taken out. Markup the vault does not write (a heading's #, a list's
 * dash, a code span's backticks, a Markdown link) is left as it is written: search matches a word inside
 * the text, so a mark beside it hides nothing.
 */
const CASES = [
  ["bold", "A **Block** roll", "A Block roll"],
  ["bold, Cyrillic", "Яд **гоблина**", "Яд гоблина"],
  ["italics", "*Sure Hands* lets", "Sure Hands lets"],
  ["bold italics", "***Loner (4+)***", "Loner (4+)"],
  ["a link to a page", "See [[Block]].", "See Block."],
  ["a link under another name", "[[Mighty Blow (+1)|Mighty Blow]]", "Mighty Blow"],
  ["a link to a heading, under another name", "[[Team Management#Elite Skills|elite skills]]", "elite skills"],
  ["a link to a heading", "[[Casualties#Lasting Injuries]]", "Casualties"],
  ["a bold link", "**[[Block]]**", "Block"],
  ["an image: its words", "![Gata crest](crest.png) League", "Gata crest League"],
  ["a Markdown link, as written", "[the rules](https://example.com/rules)", "[the rules](https://example.com/rules)"],
  ["a heading, on one line with what follows", "## Kick-off\nRoll 2D6.", "## Kick-off Roll 2D6."],
  ["a list", "- Block\n- Dodge", "- Block - Dodge"],
  ["a numbered list", "1. One\n2. Two", "1. One 2. Two"],
  ["code, as written", "`D16` roll", "`D16` roll"],
  ["a table cell's line breaks", "MA<br>6<br/>ST<BR />3", "MA 6 ST 3"],
  ["white space", "  a \n\t b  ", "a b"],
  ["nothing", "", ""],
];

test("stripMarkdownFormatting leaves the words: bold, italics, links, headings, lists, code", () => {
  for (const [what, markdown, words] of CASES) assert.equal(stripMarkdownFormatting(markdown), words, what);
  assert.equal(stripMarkdownFormatting(), "", "no value is no text");
});
