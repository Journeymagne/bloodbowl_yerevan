#!/usr/bin/env node
// Screenshots of app states, from a JSON list, with the local Google Chrome
// running headless: one PNG per state, width and variant, an errors.json with
// whatever the browser complained about while each page loaded, and an
// index.html to look through them all.
//
//   npm run screens -- docs/redesign/screens/rd-04.json --out output/screens/rd-04/before
//
// Every stage of the redesign needs its screens at 390 and 1440 px in a light
// and a dark palette, and doing that by hand in a browser is hours of clicking.
// The file format is described in scripts/screenshots/plan.mjs; the servers a
// states file points at (the real one, the mock API) must already be running.
//
// Exit code 1 means a shot could not be taken. Console errors do not: they are
// the point of errors.json, and a page that had them before the change being
// photographed is not a reason to throw the run away.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { connect, killAllChromes, launchChrome, openPage, sleep } from "./screenshots/cdp.mjs";
import { expandShots, parseScreenshotArgs, shotFileName } from "./screenshots/plan.mjs";
import {
  fromErrorsJson,
  groupProblems,
  mergeResults,
  renderIndexHtml,
  summarizeResults,
  toErrorsJson,
} from "./screenshots/report.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_KEY = "gata-league-auth-token";

// The exit hook runs for every way out of this process, including an uncaught
// error, and it must be synchronous: nothing async gets scheduled once the
// process is on its way out. launchChrome registers its Chrome as soon as it is
// spawned, so this reaches one that is still starting, not only a ready one.
process.on("exit", killAllChromes);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    process.stderr.write(`screens interrupted by ${signal}\n`);
    process.exit(130);
  });
}

function readStates(statesPath) {
  let text;
  try {
    text = fs.readFileSync(statesPath, "utf8");
  } catch (error) {
    throw new Error(`screens: cannot read ${statesPath}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`screens: ${statesPath} is not valid JSON: ${error.message}`);
  }
}

/** The admin's login and password from the environment, or a reason there are none. */
function adminCredentials() {
  const { ADMIN_LOGIN: login, ADMIN_PASSWORD: password } = process.env;
  if (!login || !password) {
    throw new Error("screens: a state asks for login \"admin\" but ADMIN_LOGIN / ADMIN_PASSWORD are not set (they live in .env)");
  }
  return { login, password };
}

// The credentials are embedded here and nowhere else: not in a log line, not in
// an error message, not in the states file. The page answers with a status and
// the token, and only the token comes back out.
function loginExpression({ login, password }) {
  return `(async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: ${JSON.stringify(login)}, password: ${JSON.stringify(password)} }),
    });
    const body = response.ok ? await response.json() : {};
    return { status: response.status, token: body.token || "" };
  })()`;
}

/** One login per server for the whole run: a session each is a hundred rows nobody wants. */
async function tokenFor(page, shot, session) {
  if (session.tokens.has(shot.origin)) return session.tokens.get(shot.origin);
  const { status, token } = await page.evaluate(loginExpression(session.credentials));
  if (!token) throw new Error(`login to ${shot.origin} failed (HTTP ${status})`);
  session.tokens.set(shot.origin, token);
  return token;
}

function storageExpression(entries) {
  return `(() => {
    localStorage.clear();
    for (const [key, value] of Object.entries(${JSON.stringify(entries)})) localStorage.setItem(key, value);
  })()`;
}

/**
 * Take one shot. The first load only gets the page's origin so its storage can
 * be set; the reload after it is the load that is measured and photographed.
 */
async function captureShot(connection, shot, session) {
  const page = await openPage(connection, shot);
  try {
    await page.navigate(shot.url);
    const entries = { ...shot.storage };
    if (shot.login) entries[TOKEN_KEY] = await tokenFor(page, shot, session);
    await page.evaluate(storageExpression(entries));

    page.takeProblems();
    await page.reload();
    await sleep(shot.waitMs);
    if (shot.run) {
      await page.evaluate(shot.run);
      await sleep(shot.runWaitMs);
    }
    // Web fonts load lazily; a shot taken before they arrive shows the fallback.
    await page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");
    const png = await page.screenshot({ fullPage: shot.fullPage });
    return { png, problems: page.takeProblems() };
  } finally {
    await page.close();
  }
}

/** What an earlier run left in the directory, for the shots a --only run does not retake. */
function earlierResults(outDir) {
  try {
    const entries = JSON.parse(fs.readFileSync(path.join(outDir, "errors.json"), "utf8"));
    return fromErrorsJson(entries).filter((result) => result.failure || fs.existsSync(path.join(outDir, result.file)));
  } catch {
    return [];
  }
}

function writeReports(outDir, results, title) {
  fs.writeFileSync(path.join(outDir, "errors.json"), `${JSON.stringify(toErrorsJson(results), null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "index.html"), renderIndexHtml(results, { title }));
}

const clipLine = (text, length) => (text.length > length ? `${text.slice(0, length - 3)}...` : text);

function printSummary(results, outDir) {
  const { written, failed, withProblems } = summarizeResults(results);
  console.log(`\nscreens: ${written} PNG(s) written to ${outDir}, ${failed.length} not taken`);
  for (const result of failed) console.log(`  not taken: ${result.file}: ${result.failure}`);
  if (withProblems.length) console.log(`screens: browser errors in ${withProblems.length} shot(s):`);
  for (const group of groupProblems(results)) {
    const where = group.url ? ` (${clipLine(group.url, 90)})` : "";
    const files = group.files.slice(0, 3).map((file) => file.replace(/\.png$/, "")).join(", ");
    const more = group.files.length > 3 ? `, +${group.files.length - 3} more` : "";
    console.log(`  [${group.bucket}] ${clipLine(group.text.split("\n")[0], 120)}${where} in ${group.files.length} shot(s): ${files}${more}`);
  }
  console.log(`screens: details in ${path.join(outDir, "errors.json")}, pictures in ${path.join(outDir, "index.html")}`);
  return failed.length;
}

async function takeShots(connection, shots, outDir, session) {
  const results = [];
  for (const [index, shot] of shots.entries()) {
    const file = shotFileName(shot);
    const { id, width, variant, url } = shot;
    const result = { id, width, variant, url, file, failure: null, problems: { console: [], exceptions: [], requests: [] } };
    try {
      const { png, problems } = await captureShot(connection, shot, session);
      fs.writeFileSync(path.join(outDir, file), png);
      result.problems = problems;
    } catch (error) {
      result.failure = error.message;
    }
    const count = Object.values(result.problems).reduce((sum, list) => sum + list.length, 0);
    const note = result.failure ? `NOT TAKEN: ${result.failure}` : count ? `${count} browser error(s)` : "";
    console.log(`[${index + 1}/${shots.length}] ${file} ${note}`.trimEnd());
    results.push(result);
  }
  return results;
}

async function run() {
  const args = parseScreenshotArgs(process.argv.slice(2));
  const spec = readStates(args.statesPath);
  const shots = expandShots(spec, { only: args.only });
  const session = { tokens: new Map(), credentials: null };
  if (shots.some((shot) => shot.login)) {
    await loadEnvFile(rootDir);
    session.credentials = adminCredentials();
  }
  fs.mkdirSync(args.outDir, { recursive: true });

  const chrome = await launchChrome(args.chromePath);
  const connection = await connect(chrome.wsUrl);
  let results;
  try {
    results = await takeShots(connection, shots, args.outDir, session);
  } finally {
    connection.close();
    await chrome.close();
  }
  // A full run describes the whole states file. A --only run retakes a few
  // shots, and must not turn the page into a list of only those.
  const everything = args.only ? mergeResults(earlierResults(args.outDir), results) : results;
  writeReports(args.outDir, everything, `Screenshots: ${path.basename(args.statesPath, ".json")}`);
  return printSummary(results, args.outDir) ? 1 : 0;
}

try {
  process.exit(await run());
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(error.message.startsWith("screens: ") ? 2 : 1);
}
