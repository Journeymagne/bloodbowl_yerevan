import assert from "node:assert/strict";
import test from "node:test";

import { SENTENCE, autoLinkKnownTerms } from "../scripts/lib/auto-link.mjs";

const pages = [
  { title: "Block", kind: "skill", slug: "skills/block" },
  { title: "Catch", kind: "skill", slug: "skills/catch" },
  { title: "Diving Catch", kind: "skill", slug: "skills/diving-catch" },
  { title: "Dodge", kind: "skill", slug: "skills/dodge" },
  { title: "Leap", kind: "skill", slug: "skills/leap" },
  { title: "Mighty Blow", kind: "skill", slug: "skills/mighty-blow" },
  { title: "Mighty Blow (+1)", kind: "skill", slug: "skills/mighty-blow-1" },
  { title: "Throw Team-Mate", kind: "trait", slug: "traits/throw-team-mate" },
  { title: "Weather", kind: "page", slug: "weather" },
];
const pageByTitle = new Map(pages.map((page) => [page.title, page]));
const link = (slug, label) => `<a href="#/${slug}">${label}</a>`;
const prose = (html, selfPage = null) => autoLinkKnownTerms(html, pageByTitle, { prose: true, selfPage });

test("a list of names links every skill and trait, in any case", () => {
  assert.equal(
    autoLinkKnownTerms("block, DODGE", pageByTitle),
    `${link("skills/block", "block")}, ${link("skills/dodge", "DODGE")}`,
  );
});

test("only skill and trait pages become links", () => {
  assert.equal(autoLinkKnownTerms("Weather", pageByTitle), "Weather");
});

test("the longest name wins", () => {
  assert.equal(autoLinkKnownTerms("Diving Catch", pageByTitle), link("skills/diving-catch", "Diving Catch"));
  assert.equal(autoLinkKnownTerms("Mighty Blow (+1)", pageByTitle), link("skills/mighty-blow-1", "Mighty Blow (+1)"));
});

test("a name inside a longer word is not a match", () => {
  assert.equal(autoLinkKnownTerms("Blocked while Leaping", pageByTitle), "Blocked while Leaping");
});

test("text that already has a link is left alone", () => {
  const html = `see <a href="#/x">Leap</a> and Dodge`;
  assert.equal(autoLinkKnownTerms(html, pageByTitle), html);
});

test("no skills, no links", () => {
  assert.equal(autoLinkKnownTerms("Leap", new Map()), "Leap");
});

test("sentences link a name only when it starts with a capital", () => {
  assert.equal(
    prose("they leap over with Mighty Blow"),
    `they leap over with ${link("skills/mighty-blow", "Mighty Blow")}`,
  );
});

test("sentences accept a name whose later letters differ in case", () => {
  assert.equal(
    prose("uses Throw Team-mate"),
    `uses ${link("traits/throw-team-mate", "Throw Team-mate")}`,
  );
});

test("sentences leave names that are also rules words alone", () => {
  const html = "a Block action and a Dodge test";
  assert.equal(prose(html), html);
});

test("a rules word in a comma-separated list is the skill", () => {
  assert.equal(prose("Dodge, Leap."), `${link("skills/dodge", "Dodge")}, ${link("skills/leap", "Leap")}.`);
  assert.equal(prose("Leap, Block."), `${link("skills/leap", "Leap")}, ${link("skills/block", "Block")}.`);
});

test("a page never links to itself in its own sentences", () => {
  const leap = pageByTitle.get("Leap");
  assert.equal(prose("Leap again with Mighty Blow", leap), `Leap again with ${link("skills/mighty-blow", "Mighty Blow")}`);
});

test("names inside other tags are still linked, the tags are kept", () => {
  assert.equal(
    prose("<strong>Leap:</strong> gains Mighty Blow"),
    `<strong>${link("skills/leap", "Leap")}:</strong> gains ${link("skills/mighty-blow", "Mighty Blow")}`,
  );
});

test("a cell with a full stop is sentences, a bare list of names is not", () => {
  assert.equal(SENTENCE.test("Player gains Mighty Blow until the end of the drive."), true);
  assert.equal(SENTENCE.test("First sentence. Second"), true);
  assert.equal(SENTENCE.test("Block, Dodge, Mighty Blow (+1)"), false);
});
