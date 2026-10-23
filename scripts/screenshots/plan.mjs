// What scripts/screenshots.mjs is asked to shoot, worked out without a browser:
// the command line, the states file expanded into one entry per image, the file
// names, the one file Chrome writes to say where its debugging port is, which
// server may be sent the admin login, and the environment Chrome starts with.
// All of it is plain data in and out so test/screenshots-plan.test.mjs can
// cover it.
//
// A states file that cannot be shot must fail here, before Chrome starts. A
// mistyped id or a width of zero found halfway through a hundred shots costs
// minutes and leaves a half-filled directory that looks like a finished run.
//
// The states file (a key this list does not have is refused, in the file, in a
// state and in a variant alike: a mistyped `waitMS` would otherwise be shot with
// the default, and a `variant` for `variants` with none of the variants asked for):
//   widths, heights   the default widths (390, 1440) and the height for a width
//   variants          [{name, storage?, colorScheme?}]: every state is shot once
//                     per variant. `storage` is written to localStorage before
//                     the page is loaded for the shot. `colorScheme` ("light" or
//                     "dark") is the prefers-color-scheme the page sees. A variant
//                     without it sees the machine's own appearance, so a Mac in
//                     dark mode shoots a page that follows the system in dark:
//                     set it on every variant that shows a palette.
//   states            [{id, url, ...}] and, per state:
//                       login      "admin" signs in as the administrator (loopback only)
//                       storage    entries that win over the variant's
//                       widths, extraWidths   replace / add to the file's widths
//                       click      a selector or a list of them, pressed in order
//                                  after the page has loaded; one that is not on the
//                                  page fails the shot, it is never skipped
//                       run        JavaScript (a string, or lines of one) run after
//                                  the clicks. It is plain code: it fails the shot
//                                  only if it throws. `?.` is refused so that a
//                                  missing element throws: write .click(), not
//                                  ?.click(). The check is textual: a `?.` in a
//                                  string or a comment is refused too.
//                       waitMs, runWaitMs   milliseconds, whole, 0 to 60000: after the
//                                  load, and after each click and after run
//                       fullPage   true shoots the whole scrolling page

export const DEFAULT_MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const DEFAULT_WIDTHS = [390, 1440];
// Phone, tablet, small laptop, desktop. A width the table does not know gets
// heightFor's ratio instead.
const DEFAULT_HEIGHTS = { 390: 844, 768: 1024, 1024: 768, 1440: 900 };
const DEFAULT_WAIT_MS = 800;
const DEFAULT_RUN_WAIT_MS = 600;
// A wait is for an animation to finish, not for a build; a minute is already a typo.
const MAX_WAIT_MS = 60_000;
const COLOR_SCHEMES = new Set(["light", "dark"]);
// Every key a states file, a state or a variant may have. Anything else is a typo or a field put on the wrong one.
const SPEC_KEYS = ["widths", "heights", "variants", "states"];
const STATE_KEYS = ["id", "url", "widths", "extraWidths", "login", "storage", "click", "run", "waitMs", "runWaitMs", "fullPage"];
const VARIANT_KEYS = ["name", "storage", "colorScheme"];
// `?.` and not the `?.5` of a conditional, which is not optional chaining.
const OPTIONAL_CHAINING = /\?\.(?!\d)/;
// Below this a page is looked at as a phone: Chrome gets the touch viewport
// rules, as it would on a real device.
const MOBILE_BELOW = 768;
// Ids and variant names become file names, so nothing that could leave the
// output directory or confuse a shell gets through.
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

export const SCREENSHOTS_USAGE =
  "usage: npm run screens -- <states.json> --out <dir> [--chrome <path>] [--only <id,id>]\n"
  + "states file: {widths?, heights?, variants?: [{name, storage?, colorScheme?: \"light\"|\"dark\"}],\n"
  + "  states: [{id, url, login?, storage?, widths?, extraWidths?, click?: selector|[selector],\n"
  + "  run?, waitMs?, runWaitMs?, fullPage?}]}; the format is described in scripts/screenshots/plan.mjs";

const OPTIONS = new Set(["--out", "--chrome", "--only"]);

/**
 * Split one argument into an option name and an inline value, if it has one.
 *
 * @returns {{name: string, inline: string|undefined}}
 */
function splitOption(arg) {
  const equals = arg.indexOf("=");
  if (!arg.startsWith("--") || equals === -1) return { name: arg, inline: undefined };
  return { name: arg.slice(0, equals), inline: arg.slice(equals + 1) };
}

function chromeFor(explicit, platform, env) {
  if (explicit) return explicit;
  // An environment variable is a choice somebody made; the Mac path is only a
  // guess about where the app lives.
  if (env.CHROME_PATH) return env.CHROME_PATH;
  if (platform === "darwin") return DEFAULT_MAC_CHROME;
  throw new Error(`screens: no Chrome to drive; pass --chrome <path> or set CHROME_PATH\n${SCREENSHOTS_USAGE}`);
}

/**
 * @param {string[]} argv arguments after the script name, i.e. process.argv.slice(2)
 * @param {{platform?: string, env?: Record<string, string|undefined>}} [context]
 * @returns {{statesPath: string, outDir: string, chromePath: string, only: string[]|null}}
 */
export function parseScreenshotArgs(argv, { platform = process.platform, env = process.env } = {}) {
  const values = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const { name, inline } = splitOption(argv[index]);
    if (!name.startsWith("--")) {
      positional.push(argv[index]);
      continue;
    }
    if (!OPTIONS.has(name)) throw new Error(`screens: unexpected argument ${argv[index]}\n${SCREENSHOTS_USAGE}`);
    if (name in values) throw new Error(`screens: ${name} given twice`);

    let value = inline;
    if (value === undefined) {
      value = argv[index + 1];
      index += 1;
    }
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error(`screens: ${name} needs a value`);
    }
    values[name] = value;
  }

  if (positional.length > 1) throw new Error(`screens: unexpected argument ${positional[1]}\n${SCREENSHOTS_USAGE}`);
  if (!positional.length) throw new Error(`screens: a states file is required\n${SCREENSHOTS_USAGE}`);
  if (!values["--out"]) throw new Error(`screens: --out <dir> is required\n${SCREENSHOTS_USAGE}`);

  let only = null;
  if (values["--only"] !== undefined) {
    only = values["--only"].split(",").map((id) => id.trim()).filter(Boolean);
    if (!only.length) throw new Error("screens: --only needs a value");
  }
  return {
    statesPath: positional[0],
    outDir: values["--out"],
    chromePath: chromeFor(values["--chrome"], platform, env),
    only,
  };
}

/**
 * Read Chrome's DevToolsActivePort file: the port on the first line, the
 * browser's socket path on the second.
 *
 * Chrome creates the file while it is still starting, so a read can land
 * halfway through the write and see "92" for 9222. Only a first line that has
 * its newline is believed; anything else means look again.
 *
 * @param {string|null|undefined} text
 * @returns {{port: number, browserPath: string}|null}
 */
export function parseDevToolsActivePort(text) {
  const match = /^(\d{1,5})\r?\n([^\r\n]*)/.exec(String(text ?? ""));
  if (!match) return null;
  const port = Number(match[1]);
  if (port < 1 || port > 65535) return null;
  return { port, browserPath: match[2].trim() };
}

// The servers a states file points at run on this machine. A file that names
// another host still gets its shots, but never the admin password.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True for a URL on this machine's loopback (localhost, 127.0.0.1, [::1]): the only place the admin login is posted. */
export function isLoopbackUrl(url) {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

// What a headless Chrome needs from the environment: where its programs, home
// and temporary files are, the locale and time zone the pages are drawn in, and
// on Linux the display, runtime and font configuration. Nothing else: the .env
// this script loads for the admin login (ADMIN_PASSWORD, the database URLs)
// stays out of the browser and every process it starts.
const CHROME_ENV = new Set([
  "PATH", "HOME", "TMPDIR", "TMP", "TEMP", "USER", "LOGNAME", "LANG", "LANGUAGE", "TZ",
  "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME",
  "DBUS_SESSION_BUS_ADDRESS", "FONTCONFIG_PATH", "FONTCONFIG_FILE",
  "SYSTEMROOT", "WINDIR", "USERPROFILE", "LOCALAPPDATA", "APPDATA",
]);
const LOCALE_VARIABLE = /^LC_[A-Z_]+$/;

/**
 * The part of `env` Chrome is started with.
 *
 * @param {Record<string, string|undefined>} env
 * @returns {Record<string, string>}
 */
export function chromeEnvironment(env) {
  return Object.fromEntries(Object.entries(env).filter(([name, value]) => value !== undefined && (CHROME_ENV.has(name) || LOCALE_VARIABLE.test(name))));
}

/** The viewport height for a width: the file's table, ours, then a phone-ish ratio. */
export function heightFor(heights, width) {
  const own = Number(heights?.[String(width)]);
  if (Number.isFinite(own) && own > 0) return Math.round(own);
  const known = DEFAULT_HEIGHTS[width];
  return known ?? Math.round(width * 1.6);
}

export function shotFileName({ id, width, variant }) {
  return `${id}-${width}-${variant}.png`;
}

function widthList(widths, where) {
  const list = Array.isArray(widths) ? widths : null;
  if (!list?.length || !list.every((width) => Number.isInteger(width) && width > 0)) {
    throw new Error(`screens: ${where} widths must be a list of positive whole numbers`);
  }
  return list;
}

function storageOf(source, where) {
  const entries = source ?? {};
  const isMap = typeof entries === "object" && !Array.isArray(entries);
  if (!isMap || !Object.values(entries).every((value) => typeof value === "string")) {
    throw new Error(`screens: ${where} storage must map names to strings`);
  }
  return entries;
}

/** Refuse a key `allowed` does not list: it would be ignored and the shot taken without what it asked for. */
function checkKeys(item, allowed, where, kind) {
  const unknown = Object.keys(item).filter((key) => !allowed.includes(key));
  if (!unknown.length) return;
  const names = unknown.map((key) => JSON.stringify(key)).join(", ");
  throw new Error(`screens: ${where} has ${unknown.length > 1 ? "unknown keys" : "an unknown key"} ${names}; the keys of a ${kind} are ${allowed.join(", ")}`);
}

function colorSchemeOf(value, where) {
  if (value === undefined) return null;
  if (!COLOR_SCHEMES.has(value)) {
    throw new Error(`screens: ${where} colorScheme must be "light" or "dark", got ${JSON.stringify(value)}`);
  }
  return value;
}

function variantsOf(spec) {
  if (spec.variants === undefined) return [{ name: "default", storage: {}, colorScheme: null }];
  if (!Array.isArray(spec.variants) || !spec.variants.length) {
    throw new Error("screens: variants must be a list with at least one variant");
  }
  const seen = new Set();
  return spec.variants.map((variant) => {
    const name = variant?.name;
    if (typeof name !== "string" || !SAFE_NAME.test(name)) {
      throw new Error(`screens: variant name ${JSON.stringify(name)} must be letters, digits, - or _`);
    }
    if (seen.has(name)) throw new Error(`screens: variant "${name}" is listed twice`);
    seen.add(name);
    const where = `variant "${name}"`;
    checkKeys(variant, VARIANT_KEYS, where, "variant");
    return { name, storage: storageOf(variant.storage, where), colorScheme: colorSchemeOf(variant.colorScheme, where) };
  });
}

function checkWait(state, field) {
  const value = state[field];
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0 || value > MAX_WAIT_MS) {
    throw new Error(`screens: state ${state.id} ${field} must be a whole number of milliseconds from 0 to ${MAX_WAIT_MS}, got ${JSON.stringify(value)}`);
  }
}

/** The selectors a state presses, in order. A blank one, or one that is not text, is a mistake in the file. */
function clicksOf(state) {
  if (state.click === undefined) return [];
  const list = Array.isArray(state.click) ? state.click : [state.click];
  if (!list.every((selector) => typeof selector === "string" && selector.trim())) {
    throw new Error(`screens: state ${state.id} click must be a selector or a list of selectors, got ${JSON.stringify(state.click)}`);
  }
  return list;
}

/** The state's JavaScript as one text. `?.` would turn a missing element into a shot of the wrong state. */
function runOf(state) {
  if (state.run === undefined) return "";
  const lines = Array.isArray(state.run) ? state.run : [state.run];
  if (!lines.every((line) => typeof line === "string")) {
    throw new Error(`screens: state ${state.id} run must be a string or a list of strings, got ${JSON.stringify(state.run)}`);
  }
  const text = lines.join("\n");
  if (OPTIONAL_CHAINING.test(text)) {
    throw new Error(`screens: state ${state.id} run uses ?. — a run must fail when its element is missing: write .click(), not ?.click(). The check is textual: a ?. in a string or a comment counts too`);
  }
  return text;
}

function checkState(state, seen) {
  if (typeof state?.id !== "string" || !state.id) throw new Error("screens: every state needs an id");
  if (!SAFE_NAME.test(state.id)) throw new Error(`screens: id "${state.id}" must be letters, digits, - or _`);
  if (seen.has(state.id)) throw new Error(`screens: state ${state.id} is listed twice`);
  seen.add(state.id);
  checkKeys(state, STATE_KEYS, `state ${state.id}`, "state");
  try {
    new URL(state.url);
  } catch {
    throw new Error(`screens: state ${state.id} needs a full url, got ${JSON.stringify(state.url)}`);
  }
  if (state.login !== undefined && state.login !== "admin") {
    throw new Error(`screens: state ${state.id} login must be "admin", got ${JSON.stringify(state.login)}`);
  }
  checkWait(state, "waitMs");
  checkWait(state, "runWaitMs");
  if (state.fullPage !== undefined && typeof state.fullPage !== "boolean") {
    throw new Error(`screens: state ${state.id} fullPage must be true or false, got ${JSON.stringify(state.fullPage)}`);
  }
  clicksOf(state);
  runOf(state);
}

function widthsFor(state, defaults) {
  const base = state.widths === undefined ? defaults : widthList(state.widths, `state ${state.id}`);
  const extra = state.extraWidths === undefined ? [] : widthList(state.extraWidths, `state ${state.id} extra`);
  return [...new Set([...base, ...extra])];
}

function stateShots(state, { defaults, heights, variants }) {
  const run = runOf(state);
  const click = clicksOf(state);
  const origin = new URL(state.url).origin;
  const ownStorage = storageOf(state.storage, `state ${state.id}`);
  const shots = [];
  for (const width of widthsFor(state, defaults)) {
    for (const variant of variants) {
      shots.push({
        id: state.id,
        url: state.url,
        origin,
        width,
        height: heightFor(heights, width),
        mobile: width < MOBILE_BELOW,
        variant: variant.name,
        // The variant's entries first, so a state can override the theme it was
        // handed (a Russian-only page, say) without a variant of its own.
        storage: { ...variant.storage, ...ownStorage },
        login: state.login ?? null,
        colorScheme: variant.colorScheme,
        click,
        run,
        waitMs: state.waitMs ?? DEFAULT_WAIT_MS,
        runWaitMs: state.runWaitMs ?? DEFAULT_RUN_WAIT_MS,
        fullPage: state.fullPage === true,
      });
    }
  }
  return shots;
}

/**
 * Turn a states file into the list of images to take: one per state, width and
 * variant, in that nesting, in the order of the file.
 *
 * @param {object} spec the parsed states file
 * @param {{only?: string[]|null}} [options] state ids to keep; null keeps all
 * @returns {object[]}
 */
export function expandShots(spec, { only = null } = {}) {
  if (spec && typeof spec === "object" && !Array.isArray(spec)) checkKeys(spec, SPEC_KEYS, "the states file", "states file");
  if (!Array.isArray(spec?.states) || !spec.states.length) {
    throw new Error("screens: the states file needs at least one state");
  }
  const defaults = spec.widths === undefined ? DEFAULT_WIDTHS : widthList(spec.widths, "the file's");
  const shared = { defaults, heights: spec.heights ?? {}, variants: variantsOf(spec) };

  const seen = new Set();
  for (const state of spec.states) checkState(state, seen);
  if (only) {
    const unknown = only.filter((id) => !seen.has(id));
    if (unknown.length) throw new Error(`screens: --only names unknown state(s): ${unknown.join(", ")}`);
  }
  const wanted = spec.states.filter((state) => !only || only.includes(state.id));
  return wanted.flatMap((state) => stateShots(state, shared));
}

/**
 * The servers a run needs, each once, in the order the file first names them.
 * A page that is not on the web (file:, about:blank) needs no server to answer.
 *
 * @param {{origin: string}[]} shots
 * @returns {string[]}
 */
export function serverOrigins(shots) {
  return [...new Set(shots.map((shot) => shot.origin).filter((origin) => /^https?:\/\//.test(origin)))];
}
