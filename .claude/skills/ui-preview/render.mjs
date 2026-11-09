// Renders HTML fragments through one checkout's own markup functions, with the test helpers' fake page around them.
//   node render.mjs <checkout root> <recipes.mjs> <out.json>
// The recipes module is the same for both checkouts and exports
//   export async function fragments({ load, read, state, t, branch }) { return { key: html, … }; }
// `load(file)` imports a module of THIS checkout (so each version renders with its own code), `read(file)` reads one
// of its files, `state` is its core/state.mjs (reference data loaded, English), `t` its dictionary, `branch` says
// which side this is (PREVIEW_SIDE=after).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [rootArg, recipesArg, out] = process.argv.slice(2);
if (!rootArg || !recipesArg || !out) {
  console.error("usage: node render.mjs <checkout root> <recipes.mjs> <out.json>");
  process.exit(2);
}
const root = path.resolve(rootArg);
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

// What the tests set up before a screen renders: a fake document with the dictionaries, a fake localStorage and
// fetch, an address bar, a light system, English, and the reference data the screens read.
await load("test/helpers/ui.mjs");
const { installFakeApi } = await load("test/helpers/fake-api.mjs");
installFakeApi();
globalThis.location = { hash: "#/", replace() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { initLocale, t } = await load("src/core/i18n.mjs");
initLocale("en");
const { state } = await load("src/core/state.mjs");
const { referenceData } = await load("test/helpers/ref-screen.mjs");
state.data = referenceData("en");

const recipes = await import(pathToFileURL(path.resolve(recipesArg)).href);
const branch = process.env.PREVIEW_SIDE === "after";
const result = await recipes.fragments({ load, read, state, t, branch });

// A fragment that throws is kept as a note, so one broken recipe does not lose the others.
const fragments = {};
for (const [key, value] of Object.entries(result)) {
  try {
    fragments[key] = typeof value === "function" ? await value() : value;
  } catch (error) {
    fragments[key] = `<p class="g-preview-none">Not rendered: ${String(error.message).replace(/[<&]/g, "")}</p>`;
  }
}
fs.writeFileSync(out, JSON.stringify(fragments, null, 2));
for (const [key, html] of Object.entries(fragments)) {
  console.log(`${key}: ${html.length} chars${html.includes("Not rendered:") ? "  NOT RENDERED" : ""}`);
}
