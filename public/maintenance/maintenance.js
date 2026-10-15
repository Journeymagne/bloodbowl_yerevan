/**
 * The maintenance page's behaviour: wear the reader's palette, speak their
 * language, and keep asking /api/health until the site is back, then reload
 * into whatever they were trying to open.
 */
import { PALETTE_STORAGE_KEY, paletteFor } from "./palettes.mjs";
import { STRINGS, describeMaintenance, fill, formatClock, pickLocale } from "./state.mjs";

const POLL_MS = 30_000;
const RELOAD_DELAY_MS = 5_000;

function stored(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

const root = document.documentElement;
const locale = pickLocale(stored("gata-league-locale"), navigator.language);
const strings = STRINGS[locale];
const prefersDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
const palette = paletteFor({ palette: stored(PALETTE_STORAGE_KEY), legacyTheme: stored("gata-league-theme"), prefersDark });

root.lang = locale;
root.dataset.mode = palette.mode;
root.dataset.palette = palette.key;
document.title = strings.documentTitle;
for (const element of document.querySelectorAll("[data-text]")) element.textContent = strings[element.dataset.text];

const slot = (name) => document.querySelector(`[data-slot="${name}"]`);
let reloadTimer = null;

function render(view) {
  slot("status").dataset.state = view.state;
  slot("chip").textContent = view.chip;
  slot("title").textContent = view.title;
  slot("lead").textContent = view.lead;
  slot("window").hidden = !view.window;
  if (view.window) {
    slot("startsAt").textContent = view.window.startsAt;
    slot("endsAt").textContent = view.window.endsAt;
  }
  slot("progressRow").hidden = view.progress === null;
  if (view.progress !== null) slot("progress").value = view.progress;
  slot("meta").textContent = view.meta;
  slot("open").hidden = view.state !== "done";
  slot("check").hidden = view.state === "done";
  slot("tips").hidden = view.state === "done";
  slot("auto").hidden = view.state === "done";
}

/** undefined: the server did not answer, so keep showing what we showed. */
async function readFlag() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) return undefined;
    return (await response.json()).maintenance ?? null;
  } catch {
    return undefined;
  }
}

async function check() {
  const button = slot("check");
  button.disabled = true;
  button.textContent = strings.checking;
  const flag = await readFlag();
  button.disabled = false;
  button.textContent = strings.check;
  const now = Date.now();
  if (flag !== undefined) render(describeMaintenance(flag, now, locale));
  slot("lastCheck").textContent = flag === null ? "" : fill(strings.notYet, { time: formatClock(now, locale) });
  if (flag === null && !reloadTimer) reloadTimer = setTimeout(() => location.reload(), RELOAD_DELAY_MS);
}

slot("check").addEventListener("click", check);
setInterval(check, POLL_MS);
check();
