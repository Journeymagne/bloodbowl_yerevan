import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { blankCommentsAndStrings, collectSourceFiles } from "../scripts/lib/js-modules.mjs";
import { API_ERRORS } from "../server/http/errors.mjs";

/*
 * A dictionary key nothing reads is a sentence translators keep up for a screen that is gone. Stage 13 deleted the ones
 * 2.x left behind (its screens, its game page, its «My games»); this keeps the dictionaries that way.
 *
 * A key is read when
 *   1. the code writes it whole — "a.b", 'a.b' or `a.b` in src/**, scripts/** or server/** — or index.html names it in
 *      a data-i18n* attribute. A comment is not a reader;
 *   2. a template builds it — `a.b.${kind}`, `${space}.refusal.${code}`: the template's text matches, and each `${…}`
 *      stands for one segment the code can give: a branch of `cond ? "x" : "y"`, or a string the code writes somewhere;
 *   3. its family's list names it, for values that come from outside the code: `error.<CODE>` for each code of the
 *      server's API_ERRORS (test/api-errors.test.mjs asks both dictionaries for every one), `preview.<id>` for each
 *      league-rules page of the content (the reference lists them by `preview.${page.id}`).
 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(rootDir, file), "utf8");
const dictionary = (locale) => JSON.parse(read(`src/i18n/${locale}.json`));

const EXPRESSION = String.raw`\$\{(?:[^{}\x60]|\{[^{}\x60]*\})*\}`;
/** A template that could be a key: key characters and `${…}`, nothing else (a `${…}` may hold one level of braces). */
const KEY_TEMPLATE = new RegExp(String.raw`^\x60((?:[\w.-]|${EXPRESSION})*)\x60$`);
/** A template's span in blanked code: its text is spaces there, its `${…}` is code. */
const TEMPLATE_SPAN = new RegExp(String.raw`\x60(?: |${EXPRESSION})*\x60`, "g");
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The values a `${…}` gives when it is a chain of `? "x" : "y"` with every branch a string; otherwise null. */
function branchValues(expression) {
  const asked = expression.match(/(?<!\?)\?(?![?.])/g)?.length ?? 0;
  const branches = [...expression.matchAll(/(?:(?<!\?)\?(?![?.])|:)\s*(["'])([\w.-]*)\1/g)].map((match) => match[2]);
  return asked && branches.length === asked + 1 ? branches : null;
}

/** A key template as a pattern; each `${…}` is a group the reader checks, unless its branches are the values. */
function templatePattern(body) {
  const pieces = body.split(new RegExp(`(${EXPRESSION})`)).filter(Boolean);
  const pattern = pieces.map((piece) => {
    if (!piece.startsWith("${")) return escapeRegExp(piece);
    const values = branchValues(piece.slice(2, -1));
    return values ? `(?:${values.map(escapeRegExp).join("|")})` : "([\\w-]+)";
  });
  return new RegExp(`^${pattern.join("")}$`);
}

/**
 * What one module writes: its strings (whole), and its key templates (as patterns). Comments are skipped by reading
 * the code through blankCommentsAndStrings, which keeps the quotes and backticks of real literals where they were.
 */
function writtenIn(source) {
  const code = blankCommentsAndStrings(source, { templateCode: true });
  const strings = [...code.matchAll(/(["'])[^\S\n]*\1/g)].map((match) => source.slice(match.index + 1, match.index + match[0].length - 1));
  const templates = [];
  for (const match of code.matchAll(TEMPLATE_SPAN)) {
    const body = KEY_TEMPLATE.exec(source.slice(match.index, match.index + match[0].length))?.[1];
    if (body === undefined) continue;
    const text = body.replace(new RegExp(EXPRESSION, "g"), "");
    if (!body.includes("${")) strings.push(body);
    else if (/[A-Za-z]{2}/.test(text) && text.includes(".")) templates.push(templatePattern(body));
  }
  return { strings, templates };
}

/**
 * The keys of `keys` nothing reads, by the three rules above. `modules` are sources of JS modules, `html` pages,
 * `families` the lists of rule 3 ({ prefix, values }).
 */
function unreadKeys(keys, { modules, html = [], families = [] }) {
  const strings = new Set();
  const templates = [];
  for (const source of modules) {
    const written = writtenIn(source);
    for (const text of written.strings) strings.add(text);
    templates.push(...written.templates);
  }
  for (const page of html) for (const match of page.matchAll(/\bdata-i18n[\w-]*="([^"]+)"/g)) strings.add(match[1]);
  const built = (key) => templates.some((pattern) => pattern.exec(key)?.slice(1).every((value) => strings.has(value)));
  const listed = (key) => families.some(({ prefix, values }) => key.startsWith(prefix) && values.includes(key.slice(prefix.length)));
  return keys.filter((key) => !strings.has(key) && !built(key) && !listed(key));
}

test("the rule reads what t() is given: a key written whole, a template's family with values the code gives, a listed code", () => {
  const modules = [
    [
      'const KINDS = ["near", "far"];',
      "// t(\"mark.comment\") — a comment is no reader",
      "/* t('mark.block') */",
      'export const label = (kind, wide) => t("mark.plain") + t(`mark.kind.${kind}`) + t(`mark.${wide ? "wide" : "narrow"}`);',
      "export const note = (space, code) => t(`${space}.refusal.${code}`) + t(`mark.tick`) + t('mark.single');",
      'export const SPACES = ["teamPlayer"], CODES = ["NAME_EMPTY"];',
      "export const error = (code) => t(`error.${code}`);",
    ].join("\n"),
  ];
  const keys = [
    "mark.plain", "mark.single", "mark.tick", "mark.kind.near", "mark.kind.far", "mark.wide", "mark.narrow", "teamPlayer.refusal.NAME_EMPTY",
    "mark.comment", "mark.block", "mark.kind.middle", "mark.other", "teamPlayer.refusal.NUMBER_RANGE", "error.LISTED", "error.UNLISTED",
    "nav.aria",
  ];
  const unread = unreadKeys(keys, {
    modules,
    html: ['<aside aria-label="Navigation" data-i18n-aria-label="nav.aria"></aside>'],
    families: [{ prefix: "error.", values: ["LISTED"] }],
  });
  assert.deepEqual(unread, ["mark.comment", "mark.block", "mark.kind.middle", "mark.other", "teamPlayer.refusal.NUMBER_RANGE", "error.UNLISTED"]);
});

test("a `? \"x\" : \"y\"` in a template gives its branches; a branch that is not a string leaves the value to the code's strings", () => {
  assert.deepEqual(branchValues('counter === "touchdowns" ? "td" : "cas"'), ["td", "cas"]);
  assert.deepEqual(branchValues('a ? "x" : b ? "y" : "z"'), ["x", "y", "z"]);
  assert.equal(branchValues('SEASONS.includes(season) ? season : "Autumn"'), null);
  assert.equal(branchValues("model?.phase ?? key"), null);
  assert.ok(templatePattern("after.mvpWhy.${mode === \"technical\" ? \"technical\" : \"conceded\"}").test("after.mvpWhy.conceded"));
  assert.ok(!templatePattern("after.mvpWhy.${mode === \"technical\" ? \"technical\" : \"conceded\"}").test("after.mvpWhy.played"));
});

test("no key without a reader; a family built from a template counts as read", async () => {
  const files = await collectSourceFiles(rootDir, ["src", "scripts", "server"]);
  const modules = files.map((file) => readFileSync(file, "utf8"));
  const rules = ["en", "ru"].flatMap((locale) => JSON.parse(read(`public/data.${locale}.json`)).rules);
  const families = [{ prefix: "error.", values: Object.keys(API_ERRORS) }, { prefix: "preview.", values: rules }];
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  assert.deepEqual(Object.keys(ru).sort(), Object.keys(en).sort(), "both dictionaries hold the same keys");
  assert.deepEqual(unreadKeys(Object.keys(en), { modules, html: [read("index.html")], families }), []);
  // Not a pass by reading nothing: the walk saw the modules and their key templates, the league rules, the error codes.
  assert.ok(modules.length > 300 && rules.length === 10 && families[0].values.length > 100);
  assert.ok(modules.flatMap((source) => writtenIn(source).templates).length > 100);
});
