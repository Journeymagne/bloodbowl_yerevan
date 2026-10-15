/**
 * The maintenance page's behaviour: wear the reader's palette, speak their
 * language, and keep asking /api/health until the site is back, then reload
 * into whatever they were trying to open.
 */
import { PALETTE_STORAGE_KEY, paletteFor } from "./palettes.mjs";
import { STRINGS, describeMaintenance, flagFromHealth, lastCheckText, pickLocale } from "./state.mjs";

const POLL_MS = 30_000;
// Shorter than POLL_MS, so a check that hangs on a flaky network gives up
// before the next one is due.
const CHECK_TIMEOUT_MS = 10_000;
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
let checking = false;
// The last flag the server gave us, so the countdown and progress keep moving
// while it does not answer. Until it does, all we know is that work is on.
let lastFlag = { kind: "planned", startsAt: null, endsAt: null };

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

/** undefined: the server did not answer, or not with a health reply, so we know nothing new. */
async function readFlag() {
  try {
    const response = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (!response.ok) return undefined;
    return flagFromHealth(await response.json());
  } catch {
    return undefined;
  }
}

async function check() {
  // The button and the timer can both ask while a slow check is still out.
  if (checking) return;
  checking = true;
  const button = slot("check");
  button.disabled = true;
  button.textContent = strings.checking;
  try {
    const answer = await readFlag();
    const now = Date.now();
    if (answer !== undefined) lastFlag = answer;
    render(describeMaintenance(lastFlag, now, locale));
    slot("lastCheck").textContent = lastCheckText(answer, now, locale);
    if (answer === null && !reloadTimer) reloadTimer = setTimeout(() => location.reload(), RELOAD_DELAY_MS);
  } finally {
    checking = false;
    button.disabled = false;
    button.textContent = strings.check;
  }
}

slot("check").addEventListener("click", check);
setInterval(check, POLL_MS);
// The chip, title and lead ship in Russian and only render() translates them,
// so draw once now rather than after the first answer, which on a bad network
// may never come.
render(describeMaintenance(lastFlag, Date.now(), locale));
check();
