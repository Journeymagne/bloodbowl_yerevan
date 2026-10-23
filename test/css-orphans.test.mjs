import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { blankCommentsAndStrings, collectSourceFiles, relative, STYLESHEET_EXTENSIONS } from "../scripts/lib/js-modules.mjs";

/*
 * A class a stylesheet defines and nothing draws is a rule for markup that is gone. Stage 13 took 2.x's out with its
 * sheets; this keeps every stylesheet under src that way.
 *
 * A class is defined when a selector names it (a comment, a value, a string or an at-rule's own line names none).
 * It is drawn when
 *   1. a module writes it whole: a word of a string or of a template's text in a module under src (.mjs, .js) or in
 *      the content's build (scripts/build-data.mjs, scripts/lib/*.mjs). A comment draws nothing;
 *   2. a template builds it — `g-btn--${kind}`, `g-sheet--at-${at}`, `${block}--short`: the template's text around the
 *      `${…}` matches, and each `${…}` gives a branch of `cond ? "x" : "y"`, a string the code writes whole, a number
 *      (a step, a size, a count is computed) or nothing. A run of `${…}` with fewer than two letters of text around it
 *      (`${name}-${counter}`) builds no class;
 *   3. a class attribute of index.html or of the built pages (public/data.{en,ru}.json) names it.
 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(rootDir, file), "utf8");

/** The classes a stylesheet's selectors name. */
function definedClasses(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
  const names = new Set();
  for (const [, before] of bare.matchAll(/([^{};]*)\{/g)) {
    const selector = before.trim();
    if (selector.startsWith("@")) continue;
    for (const [, name] of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(name);
  }
  return [...names];
}

/**
 * A module's literals, comments skipped: each string as one text part, each template as its text parts and the code
 * of its `${…}`s ({ hole }), nested templates as literals of their own. blankCommentsAndStrings keeps a literal's
 * quotes, backticks, `${` and `}` where they were and blanks what is between, so the code finds the literals and
 * the source gives their text.
 */
function literalsOf(source) {
  const code = blankCommentsAndStrings(source, { templateCode: true });
  const literals = [];
  const holes = [];
  const templateText = (from, template) => {
    let end = from;
    while (end < code.length && code[end] !== "`" && code.slice(end, end + 2) !== "${") end += 1;
    template.push({ text: source.slice(from, end) });
    if (code[end] !== "$") {
      literals.push(template);
      return end + 1;
    }
    holes.push({ template, depth: 0, start: end + 2 });
    return end + 2;
  };
  let index = 0;
  while (index < code.length) {
    const character = code[index];
    if (character === '"' || character === "'") {
      const end = code.indexOf(character, index + 1);
      if (end === -1) break;
      literals.push([{ text: source.slice(index + 1, end) }]);
      index = end + 1;
      continue;
    }
    if (character === "`") {
      index = templateText(index + 1, []);
      continue;
    }
    if (holes.length && character === "{") holes.at(-1).depth += 1;
    if (holes.length && character === "}") {
      const hole = holes.at(-1);
      if (hole.depth === 0) {
        holes.pop();
        hole.template.push({ hole: source.slice(hole.start, index) });
        index = templateText(index + 1, hole.template);
        continue;
      }
      hole.depth -= 1;
    }
    index += 1;
  }
  return literals;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The values a `${…}` gives when it is a chain of `? "x" : "y"` with every branch a string; otherwise null. */
function branchValues(expression) {
  const asked = expression.match(/(?<!\?)\?(?![?.])/g)?.length ?? 0;
  const branches = [...expression.matchAll(/(?:(?<!\?)\?(?![?.])|:)\s*(["'])([\w-]*)\1/g)].map((match) => match[2]);
  return asked && branches.length === asked + 1 ? branches : null;
}

/**
 * What one module writes: the class-like words of its literals, the strings it writes whole, and the patterns of its
 * templates' runs of class characters that hold a `${…}` (each `${…}` a group, unless its branches are the values).
 */
function writtenIn(source) {
  const words = [];
  const strings = [];
  const patterns = [];
  for (const parts of literalsOf(source)) {
    if (parts.length === 1) strings.push(parts[0].text);
    let run = [];
    const close = () => {
      const text = run.map((part) => part.text ?? "").join("");
      if (run.length === 1 && run[0].text) words.push(run[0].text);
      else if (run.some((part) => part.hole !== undefined) && /[A-Za-z]{2}/.test(text)) {
        const pattern = run.map((part) => {
          if (part.hole === undefined) return escapeRegExp(part.text);
          const values = branchValues(part.hole);
          return values ? `(?:${values.map(escapeRegExp).join("|")})` : "([\\w-]*)";
        });
        patterns.push(new RegExp(`^${pattern.join("")}$`));
      }
      run = [];
    };
    for (const part of parts) {
      if (part.hole !== undefined) {
        run.push(part);
        continue;
      }
      part.text.split(/([^\w-]+)/).forEach((piece, at) => {
        if (at % 2) close();
        else if (piece) run.push({ text: piece });
      });
    }
    close();
  }
  return { words, strings, patterns };
}

/** The classes of `classes` nothing draws, by the three rules above. */
function undrawnClasses(classes, { modules, html = [], built = [] }) {
  const words = new Set(built);
  const strings = new Set();
  const patterns = [];
  for (const source of modules) {
    const written = writtenIn(source);
    for (const word of written.words) words.add(word);
    for (const text of written.strings) strings.add(text);
    patterns.push(...written.patterns);
  }
  for (const page of html) {
    for (const [, value] of page.matchAll(/\bclass="([^"]*)"/g)) for (const word of value.split(/\s+/)) words.add(word);
  }
  const given = (value) => value === "" || strings.has(value) || /^\d+$/.test(value);
  const builtBy = (name) => patterns.some((pattern) => pattern.exec(name)?.slice(1).every(given));
  return classes.filter((name) => !words.has(name) && !builtBy(name));
}

/** The words of every class attribute in the strings of a built data file. */
function classesOfPages(value, found = []) {
  if (typeof value === "string") {
    for (const [, names] of value.matchAll(/\bclass="([^"]*)"/g)) found.push(...names.split(/\s+/).filter(Boolean));
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) classesOfPages(item, found);
  }
  return found;
}

test("a stylesheet defines the classes its selectors name — not those of a comment, a value, a string or an at-rule", () => {
  const css = [
    "/* .g-comment { color: red } */",
    '@import url("./ui/x.css?v=1.2");',
    '.g-a, .g-b:not(.g-c) > .g-d::after { content: ".g-string"; width: 0.5em; margin: 0 auto }',
    '@media (max-width: 900px) { .g-e[data-x=".g-attr"] { margin: 1.5px } .g-a .g-f { gap: .5rem } }',
    "@keyframes g-in { from { opacity: 0 } 12.5% { opacity: .5 } to { opacity: 1 } }",
  ].join("\n");
  assert.deepEqual(definedClasses(css).sort(), ["g-a", "g-b", "g-c", "g-d", "g-e", "g-f"]);
});

test("a class is drawn when a module writes it, a template builds it from values the code gives, or a page's class names it", () => {
  const modules = [
    [
      'const KINDS = ["primary", "danger"], PARTS = ["g", "none"], PREVIEWS = ["g-money"];',
      '// <p class="g-comment"> — a comment draws nothing',
      "/* <p class='g-block'> */",
      'export const button = (kind, wide) => `<button class="g-btn g-btn--${kind}${wide ? " g-btn--wide" : ""}">`;',
      'export const bar = (step) => `<div class="g-bar g-bar--${step}"></div>`;',
      'export const pager = (left) => `<a class="g-pager__${left ? "prev" : "next"}">`;',
      'export const preview = (block) => `<p class="${block} ${block}--short">`;',
      "export const pair = (name, counter) => `${name}-${counter}`;",
      'export const tone = (danger) => `<b class="${["g-rowv", danger && "g-rowv--danger"].filter(Boolean).join(" ")}">`;',
    ].join("\n"),
  ];
  const drawn = [
    "g-btn", "g-btn--primary", "g-btn--danger", "g-btn--wide", "g-bar", "g-bar--70", "g-pager__prev", "g-pager__next",
    "g-money--short", "g-rowv", "g-rowv--danger", "g-head", "numbered-table",
  ];
  const undrawn = ["g-comment", "g-block", "g-btn--ghost", "g-pager__up", "g-fix--short", "g-none", "g-tail"];
  assert.deepEqual(
    undrawnClasses([...drawn, ...undrawn], {
      modules,
      html: ['<main id="app-view" class="g-head" data-note="g-tail"></main>'],
      built: ["numbered-table"],
    }),
    undrawn,
  );
  assert.deepEqual(branchValues('left ? "prev" : "next"'), ["prev", "next"]);
  assert.equal(branchValues('wide ? " g-btn--wide" : ""'), null);
});

test("every class a stylesheet defines is drawn by a module or by the content's build", async () => {
  const sheets = await collectSourceFiles(rootDir, ["src"], STYLESHEET_EXTENSIONS);
  const definedBy = new Map();
  for (const file of sheets) {
    for (const name of definedClasses(readFileSync(file, "utf8"))) {
      definedBy.set(name, [...(definedBy.get(name) ?? []), relative(rootDir, file)]);
    }
  }
  const files = [...(await collectSourceFiles(rootDir, ["src", "scripts/lib"])), path.join(rootDir, "scripts/build-data.mjs")];
  const modules = files.map((file) => readFileSync(file, "utf8"));
  const built = ["en", "ru"].flatMap((locale) => classesOfPages(JSON.parse(read(`public/data.${locale}.json`))));
  const undrawn = undrawnClasses([...definedBy.keys()], { modules, html: [read("index.html"), read("public/play.html")], built });
  assert.deepEqual(undrawn.map((name) => `${name} (${definedBy.get(name).join(", ")})`), []);
  // Not a pass by reading nothing: the walk saw the sheets, the modules and their class templates, the built pages.
  assert.ok(sheets.length > 75 && definedBy.size > 1500 && modules.length > 200);
  assert.ok(modules.flatMap((source) => writtenIn(source).patterns).length > 100);
  assert.ok(["numbered-table", "table-scroll", "fit-cell"].every((name) => built.includes(name)));
  // The four the plan took for orphans are drawn by a family (`g-article__${side}`, `${block}--short`) and stay.
  for (const name of ["g-article__next", "g-article__prev", "g-fix__preview--short", "g-money__preview--short"]) {
    assert.ok(definedBy.has(name), name);
  }
});
