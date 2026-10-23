import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { PALETTE_KEYS } from "../public/maintenance/palettes.mjs";
import { assertContrast, colourOf, contrast } from "./helpers/contrast.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const tokensCss = read("src/styles/tokens.css");
const ALL_KEYS = [...PALETTE_KEYS.light, ...PALETTE_KEYS.dark];

/** selector → {"--name": value}; innermost blocks only, so a rule inside @media keeps its own selector. */
function rules(css) {
  const out = new Map();
  for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
    for (const selector of selectors.split(",").map((part) => part.trim())) out.set(selector, { ...out.get(selector), ...declarations });
  }
  return out;
}

function stylesheets() {
  return ["src/styles", "src/ui"].flatMap((dir) => {
    try {
      return readdirSync(new URL(`../${dir}/`, import.meta.url)).filter((name) => name.endsWith(".css")).map((name) => `${dir}/${name}`);
    } catch {
      return [];
    }
  });
}

// docs/redesign/handoff-0.9.1/prototypes/mobile/Settings.html, object PALETTES (the package is in git's
// history since its removal: git log --diff-filter=D -- docs/redesign/handoff-0.9.1).
const PALETTES = {
  grass: { header: "#17392C", page: "#FFFFFF", desk: "#F3F6F4", card: "#FFFFFF", s2: "#F3F6F4", track: "#EEF2F0", segOn: "#FFFFFF", ink: "#14201A", muted: "#5F6B65", faint: "#8A948F", line: "#E6EBE8", ring: "#DCE3DF", field: "#FFFFFF", off: "#C9D3CE", acc: "#2F7A52", accText: "#2F7A52", tint: "#E4F0E9", tintInk: "#163A28" },
  parchment: { header: "#3B2A1A", page: "#FBF6EC", desk: "#F3EBDB", card: "#FFFBF3", s2: "#F3EBDB", track: "#EDE3CF", segOn: "#FFFBF3", ink: "#2A1E12", muted: "#6E5D49", faint: "#9A8A74", line: "#E6DCC8", ring: "#DCCFB6", field: "#FFFBF3", off: "#CFC2A9", acc: "#9A4A1C", accText: "#9A4A1C", tint: "#F6E3D2", tintInk: "#5E2A0C" },
  ice: { header: "#1E3A5F", page: "#FFFFFF", desk: "#F1F5F9", card: "#FFFFFF", s2: "#EEF3F8", track: "#E7EDF4", segOn: "#FFFFFF", ink: "#0F1B2A", muted: "#566579", faint: "#8592A3", line: "#E2E8EF", ring: "#D5DEE8", field: "#FFFFFF", off: "#C6D1DD", acc: "#1D5FA8", accText: "#1D5FA8", tint: "#E1ECF8", tintInk: "#12396A" },
  imperial: { header: "#5A1220", page: "#FFFDF8", desk: "#F7F2EA", card: "#FFFFFF", s2: "#F6F0E6", track: "#F0E8DA", segOn: "#FFFFFF", ink: "#1F1414", muted: "#6A5A55", faint: "#998985", line: "#EDE4D8", ring: "#E2D6C6", field: "#FFFFFF", off: "#D6C9BA", acc: "#8E1B2E", accText: "#8E1B2E", tint: "#F6E2E2", tintInk: "#5A1220" },
  night: { header: "#17392C", page: "#0F1A15", desk: "#0F1A15", card: "#15231C", s2: "#1B2B23", track: "#1B2B23", segOn: "#2C4036", ink: "#E8EFEB", muted: "#9AA9A1", faint: "#6F8078", line: "#24352C", ring: "#2C4036", field: "#0F1A15", off: "#3A4D43", acc: "#2F7A52", accText: "#7FD3A2", tint: "#1C3A2B", tintInk: "#7FD3A2" },
  dungeon: { header: "#241A33", page: "#121018", desk: "#121018", card: "#1A1722", s2: "#221E2C", track: "#221E2C", segOn: "#332C42", ink: "#ECE8F3", muted: "#A69EB5", faint: "#7A728A", line: "#2A2534", ring: "#362F44", field: "#121018", off: "#4A4159", acc: "#7A4BB0", accText: "#C3A4E8", tint: "#2E2342", tintInk: "#C3A4E8" },
  // acc: #C2571A in the prototype; a shade darker so white on it reads 4.5:1, like --neutral-result.
  embers: { header: "#2A1A12", page: "#121110", desk: "#121110", card: "#1B1917", s2: "#24211E", track: "#24211E", segOn: "#36302B", ink: "#F1ECE6", muted: "#ADA398", faint: "#7E756C", line: "#2B2724", ring: "#3A342F", field: "#121110", off: "#4E463F", acc: "#C1561A", accText: "#F2A06A", tint: "#3A2416", tintInk: "#F2A06A" },
  abyss: { header: "#0F2A3A", page: "#0B141B", desk: "#0B141B", card: "#111D26", s2: "#172631", track: "#172631", segOn: "#223645", ink: "#E6EEF3", muted: "#93A6B3", faint: "#667A88", line: "#1E2E3A", ring: "#29404F", field: "#0B141B", off: "#3A5262", acc: "#1F7A8C", accText: "#7FD0DE", tint: "#143340", tintInk: "#7FD0DE" },
};

const FIELD_TOKEN = {
  header: "--header", page: "--page", desk: "--desk", card: "--surface", s2: "--surface-2", track: "--surface-3",
  segOn: "--seg-on", ink: "--ink", muted: "--muted", faint: "--faint", line: "--line", ring: "--line-strong",
  field: "--field", off: "--control-border", acc: "--accent", accText: "--accent-text", tint: "--accent-tint", tintInk: "--on-accent-tint",
};

/** public/maintenance/maintenance.css name → token: the eleven colours both pages carry. */
const MAINTENANCE_TOKEN = {
  "--header": "--header", "--page": "--page", "--card": "--surface", "--s2": "--surface-2", "--ink": "--ink", "--muted": "--muted",
  "--line": "--line", "--acc": "--accent", "--acc-text": "--accent-text", "--tint": "--accent-tint", "--tint-ink": "--on-accent-tint",
};

const MODE = {
  light: { "--danger": "#A0473A", "--danger-tint": "#FBEDEA", "--on-danger-tint": "#7A2E22", "--on-danger": "#FFFFFF", "--danger-fill": "#C4352A", "--on-danger-fill": "#FFFFFF", "--warn": "#B07A1E", "--warn-tint": "#FBF1DD", "--on-warn-tint": "#6B4A0E", "--disabled": "#A9B3AE", "--scrim": "rgba(10, 22, 16, 0.5)" },
  dark: { "--danger": "#F2A99C", "--danger-tint": "#45201A", "--on-danger-tint": "#F2A99C", "--on-danger": "#45201A", "--danger-fill": "#C4352A", "--on-danger-fill": "#FFFFFF", "--warn": "#E8C26A", "--warn-tint": "#3B2E14", "--on-warn-tint": "#F2D08A", "--disabled": "#4E5F56", "--scrim": "rgba(0, 0, 0, 0.6)" },
};

const SCALES = {
  "--font-display": '"Oswald", "Arial Narrow", sans-serif', "--font-body": '"Golos Text", system-ui, sans-serif',
  "--space-4": "4px", "--space-6": "6px", "--space-8": "8px", "--space-10": "10px", "--space-12": "12px", "--space-14": "14px",
  "--space-16": "16px", "--space-20": "20px", "--space-22": "22px", "--space-24": "24px",
  "--radius-xs": "3px", "--radius-sm": "8px", "--radius-md": "10px", "--radius-lg": "12px", "--radius-xl": "14px",
  "--radius-2xl": "16px", "--radius-sheet": "22px", "--radius-full": "9999px",
  "--size-touch": "44px", "--size-badge": "36px", "--size-row": "60px", "--size-cta": "52px", "--size-sidebar": "232px",
  "--shadow-thumb": "0 1px 2px rgba(20, 32, 26, 0.12)",
};

// tokens.json's, except --neutral-result: a shade darker than its #6F7A75, so a white D reads 4.5:1.
const FIXED = {
  "--pitch-900": "#17392C", "--header-ink": "#FFFFFF", "--crest-gold": "#F2C14E", "--on-accent": "#FFFFFF",
  "--live": "#7FD3A2", "--neutral-result": "#6B7671", "--result-friendly": "#8A5A12",
  "--pos-blitzer": "var(--pitch-900)", "--pos-catcher": "#2E6E8E", "--pos-thrower": "#8A5A12", "--pos-lineman": "#55615B", "--pos-big": "#7B2E2E",
  "--cat-agility": "#2E6E8E", "--cat-devious": "#5B3F78", "--cat-general": "var(--pitch-900)", "--cat-mutation": "#6B5A1E",
  "--cat-passing": "#8A5A12", "--cat-strength": "#7B2E2E", "--cat-trait": "#55615B",
  "--hero-gets": "#1E5C3D", "--hero-pays": "#6B2B22", "--hero-even": "#3A4440",
};

const DERIVED = {
  "--ink-2": "color-mix(in srgb, var(--ink) 45%, var(--muted))",
  "--accent-ink": "color-mix(in srgb, var(--accent) 80%, #000000)",
  "--accent-tint-soft": "color-mix(in srgb, var(--accent-tint) 50%, var(--surface))",
  "--header-muted": "color-mix(in srgb, var(--header-ink) 80%, var(--header))",
  "--header-tab": "color-mix(in srgb, var(--header-ink) 64%, var(--header))",
  "--ring": "inset 0 0 0 1px var(--line-strong)",
  "--ring-selected": "inset 0 0 0 2px var(--accent)",
  "--focus-ring": "0 0 0 3px var(--accent)",
};

/**
 * The 2.x variable names legacy-aliases.css pointed at 3.0 tokens while the 2.x tables lived (--line, --muted, --accent
 * and --danger were 3.0's names already). The tables and the aliases went at stage 13: none may come back.
 */
const RETIRED_NAMES = [
  "--bg", "--panel", "--panel-2", "--line-bright", "--text", "--soft", "--focus", "--radius", "--body-font", "--display-font",
  "--label-font", "--md-wash", "--grid-line", "--grid-line-soft", "--stripe-line", "--input-bg-soft", "--panel-glass",
  "--surface-soft", "--surface-strong", "--table-head", "--button-bg", "--button-bg-hover", "--button-border", "--button-text",
  "--button-muted-text", "--primary-bg", "--primary-bg-hover", "--primary-border", "--primary-text", "--primary-text-shadow",
  "--active-button-bg", "--active-button-border", "--active-button-text", "--overlay-bg", "--scroll-fade", "--body-glow",
  "--body-gradient",
];

test("every palette wears the prototype's colours", () => {
  const all = rules(tokensCss);
  assert.deepEqual(Object.keys(PALETTES).sort(), [...ALL_KEYS].sort());
  for (const [key, palette] of Object.entries(PALETTES)) {
    const block = all.get(`:root[data-palette="${key}"]`);
    assert.ok(block, key);
    for (const [field, token] of Object.entries(FIELD_TOKEN)) assert.equal(block[token]?.toUpperCase(), palette[field], `${key} ${token}`);
  }
});

test("the colours the maintenance page shares are the same", () => {
  const ours = rules(tokensCss);
  const theirs = rules(read("public/maintenance/maintenance.css"));
  for (const key of ALL_KEYS) {
    const selector = `:root[data-palette="${key}"]`;
    for (const [their, our] of Object.entries(MAINTENANCE_TOKEN)) {
      assert.equal(ours.get(selector)[our]?.toUpperCase(), theirs.get(selector)[their]?.toUpperCase(), `${key} ${our}`);
    }
  }
});

test("without attributes the page is Perfect Conditions, or Under the Floodlights on a dark system", () => {
  const all = rules(tokensCss);
  const light = all.get(":root");
  const dark = all.get(":root:not([data-mode])");
  for (const [field, token] of Object.entries(FIELD_TOKEN)) {
    assert.equal(light[token]?.toUpperCase(), PALETTES.grass[field], token);
    assert.equal(dark[token]?.toUpperCase(), PALETTES.night[field], token);
  }
  for (const [token, value] of Object.entries(MODE.dark)) assert.equal(dark[token], value, token);
  assert.match(tokensCss, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-mode\]\)/);
});

test("status colours follow the mode, not the palette", () => {
  const all = rules(tokensCss);
  for (const [token, value] of Object.entries(MODE.light)) assert.equal(all.get(":root")[token], value, token);
  for (const [token, value] of Object.entries(MODE.dark)) assert.equal(all.get(':root[data-mode="dark"]')[token], value, token);
  for (const key of ALL_KEYS) {
    for (const token of Object.keys(MODE.light)) assert.equal(all.get(`:root[data-palette="${key}"]`)[token], undefined, `${key} sets ${token}`);
  }
  assert.match(tokensCss, /:root\[data-mode="dark"\]\s*\{[^}]*color-scheme:\s*dark/);
});

test("scales, type, fixed and derived tokens are the design system's", () => {
  const base = rules(tokensCss).get(":root");
  for (const [token, value] of Object.entries({ ...SCALES, ...FIXED, ...DERIVED })) assert.equal(base[token], value, token);
});

test("src/styles holds tokens.css alone: the 2.x tables, their fonts and their variable names are gone", () => {
  assert.deepEqual(readdirSync(new URL("../src/styles/", import.meta.url)), ["tokens.css"]);
  const imports = [...read("src/styles.css").matchAll(/@import url\("([^"]+)"\);/g)].map(([, file]) => file);
  assert.equal(imports[0], "styles/tokens.css", "the tokens come first, before every sheet that reads them");
  assert.deepEqual(imports.filter((file) => file.startsWith("styles/")), ["styles/tokens.css"]);
  const css = readdirSync(new URL("../src/", import.meta.url), { recursive: true })
    .filter((name) => name.endsWith(".css"))
    .map((name) => read(`src/${name}`).replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");
  for (const name of RETIRED_NAMES) {
    assert.doesNotMatch(css, new RegExp(`var\\(\\s*${name}\\s*[,)]|(^|[{;\\s])${name}\\s*:`), `${name} is a 2.x name`);
    assert.equal(rules(tokensCss).get(":root")[name], undefined, `${name} is no 3.0 token either`);
  }
});

test("every variable a stylesheet reads is defined", () => {
  // The frame's padding (--view-top, --view-side, --view-bottom) is set on #app-view by the frame's own sheet (stage 13).
  const frameCss = read("src/shell/frame.css");
  const defined = new Set([...rules(tokensCss).values(), ...rules(frameCss).values()].flatMap(Object.keys));
  for (const file of stylesheets()) {
    const css = read(file);
    const local = new Set([...rules(css).values()].flatMap(Object.keys));
    for (const [, name] of css.matchAll(/var\(\s*(--[\w-]+)/g)) assert.ok(defined.has(name) || local.has(name), `${file} reads ${name}`);
  }
});

test("the six 2.x themes are gone", () => {
  for (const file of stylesheets()) assert.doesNotMatch(read(file).replace(/\/\*[\s\S]*?\*\//g, ""), /data-theme/, file);
});

test("every palette can be drawn inside a preview, not only on the page", () => {
  const map = rules(tokensCss);
  for (const key of ALL_KEYS) {
    const preview = map.get(`[data-palette-preview="${key}"]`);
    assert.ok(preview, key);
    for (const token of ["--header", "--page", "--surface", "--ink", "--muted", "--line", "--accent", "--accent-tint"]) {
      assert.equal(preview[token], map.get(`:root[data-palette="${key}"]`)[token], `${key} ${token}`);
    }
  }
});

test("white on the accent reads 4.5:1 in every palette", () => {
  assertContrast("--on-accent", ["--accent"], 4.5);
});

// The owner's answer after 07c: the irreversible button is filled with the prototypes' #C4352A (DeskRosterSell,
// StatsSell), while red words keep --danger. The prototypes draw no dark filled danger button, so the dark mode keeps
// the same fill, as it keeps the accent's: white on it 5.4:1, and the fill 3:1 off the sheet it stands on (WCAG 1.4.11).
test("white on the danger fill reads 5.4:1, and the fill stands off the surface, in every palette", () => {
  assert.equal(contrast(colourOf("#FFFFFF", {}), colourOf(MODE.light["--danger-fill"], {})).toFixed(1), "5.4");
  assertContrast("--on-danger-fill", ["--danger-fill"], 4.5);
  assertContrast("--danger-fill", ["--surface"], 3);
  // Red words are not the fill: --danger is #A0473A in a light palette.
  assert.notEqual(MODE.light["--danger"], MODE.light["--danger-fill"]);
});

test("white on the maintenance page's accent reads 4.5:1 in every palette", () => {
  const theirs = rules(read("public/maintenance/maintenance.css"));
  const white = theirs.get(":root")["--on-acc"];
  for (const key of ALL_KEYS) {
    const accent = theirs.get(`:root[data-palette="${key}"]`)["--acc"];
    const ratio = contrast(colourOf(white, {}), colourOf(accent, {}));
    assert.ok(ratio >= 4.5, `${key}: ${white} on ${accent} is ${ratio.toFixed(2)}:1`);
  }
});
