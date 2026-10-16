// A minimal Chrome DevTools Protocol client: start a headless Chrome, talk to it
// over its WebSocket, and hand out one clean page at a time. Node 22 built-ins
// only (global WebSocket and fetch); the repository has no browser-automation
// dependency and this is not worth adding one for.
//
// A page is opened in a browser context of its own and closed with it. That is
// what keeps one shot from leaking into the next: localStorage, a half-written
// builder draft, a login all live inside the context and go with it.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseDevToolsActivePort } from "./plan.mjs";
import { describeProblem } from "./report.mjs";

const START_TIMEOUT_MS = 20_000;
const COMMAND_TIMEOUT_MS = 30_000;
const SHOT_TIMEOUT_MS = 60_000;
const SHUTDOWN_GRACE_MS = 3_000;
// A page that scrolls for ever would otherwise ask Chrome for an image it
// cannot allocate.
const MAX_FULL_PAGE_HEIGHT = 16_000;

const CHROME_FLAGS = [
  "--headless=new",
  "--remote-debugging-port=0",
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The `killNow` of every Chrome that has been spawned and not yet cleaned up.
// A Chrome is in here from the moment it is spawned, not from the moment it is
// ready, so an exit hook can reach one that is still starting.
const liveChromes = new Set();

/** Kill every Chrome this process started and remove its profile. Synchronous, safe to repeat. */
export function killAllChromes() {
  for (const killNow of [...liveChromes]) killNow();
}

function readPort(profile) {
  try {
    return parseDevToolsActivePort(fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8"));
  } catch {
    return null;
  }
}

/** Poll for the port file; give up when Chrome dies or the time runs out. */
async function waitForPort(profile, isRunning, stderrTail) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const found = readPort(profile);
    if (found) return found;
    if (!isRunning()) throw new Error(`Chrome exited before it opened a debugging port\n${stderrTail()}`);
    await sleep(50);
  }
  throw new Error(`Chrome did not open a debugging port in ${START_TIMEOUT_MS / 1000} s\n${stderrTail()}`);
}

/**
 * Start Chrome headless on a fresh profile.
 *
 * `close()` is the orderly way out; `killNow()` is for a signal handler or an
 * exit hook, where nothing asynchronous will run, and is safe to call twice.
 * Either one leaves no process and no profile directory behind. A Chrome that
 * is still starting is covered too: see `killAllChromes()`.
 *
 * @param {string} chromePath
 * @returns {Promise<{wsUrl: string, close: () => Promise<void>, killNow: () => void}>}
 */
export async function launchChrome(chromePath) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gata-screens-"));
  let spawnError = null;
  let stderr = "";
  // Its own process group, so one signal reaches the renderers and the GPU
  // process too: a browser that has exited can leave them running for a moment.
  const child = spawn(chromePath, [...CHROME_FLAGS, `--user-data-dir=${profile}`], {
    stdio: ["ignore", "ignore", "pipe"],
    detached: true,
  });
  child.on("error", (error) => { spawnError = error; });
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  const isRunning = () => !spawnError && child.exitCode === null && child.signalCode === null;
  const exited = new Promise((resolve) => child.once("exit", resolve));

  const signalChrome = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      if (isRunning()) child.kill(signal);
    }
  };
  const killNow = () => {
    liveChromes.delete(killNow);
    signalChrome("SIGKILL");
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  // Nothing async runs between the spawn above and this line, so no signal can
  // slip in before the exit hook knows about this Chrome.
  liveChromes.add(killNow);
  const close = async () => {
    if (isRunning()) {
      signalChrome("SIGTERM");
      await Promise.race([exited, sleep(SHUTDOWN_GRACE_MS)]);
    }
    killNow();
  };

  try {
    const stderrTail = () => (spawnError ? spawnError.message : stderr.trim());
    const { port } = await waitForPort(profile, isRunning, stderrTail);
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    return { wsUrl: version.webSocketDebuggerUrl, close, killNow };
  } catch (error) {
    await close();
    throw error;
  }
}

/**
 * Open the browser-level DevTools socket.
 *
 * `send` carries an optional session id: with `flatten: true` every page's
 * commands and events travel over this one socket, told apart by it.
 *
 * @param {string} wsUrl
 */
export async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error(`could not open ${wsUrl}`)), { once: true });
  });
  let lastId = 0;
  const pending = new Map();
  const listeners = new Set();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined) {
      for (const listener of [...listeners]) listener(message);
      return;
    }
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    clearTimeout(call.timer);
    if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
    else call.resolve(message.result ?? {});
  });
  socket.addEventListener("close", () => {
    for (const call of pending.values()) {
      clearTimeout(call.timer);
      call.reject(new Error(`${call.method}: Chrome closed the connection`));
    }
    pending.clear();
  });

  function send(method, params = {}, sessionId = undefined, timeoutMs = COMMAND_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      lastId += 1;
      const id = lastId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method}: no answer in ${timeoutMs / 1000} s`));
      }, timeoutMs);
      pending.set(id, { method, resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  function onEvent(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /** The params of the next matching event. Call it before the command that causes the event. */
  function waitFor(method, { sessionId, timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`${method}: not seen in ${timeoutMs / 1000} s`));
      }, timeoutMs);
      const off = onEvent((message) => {
        if (message.method !== method || message.sessionId !== sessionId) return;
        clearTimeout(timer);
        off();
        resolve(message.params);
      });
    });
  }

  return { send, onEvent, waitFor, close: () => socket.close() };
}

/**
 * Collect what the page complains about, by the buckets the report uses.
 * `take()` hands back what has been seen since the last call and starts over.
 */
function watchProblems(connection, sessionId) {
  const urls = new Map();
  const fresh = () => ({ console: [], exceptions: [], requests: [] });
  let problems = fresh();
  const off = connection.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Network.requestWillBeSent") {
      urls.set(message.params.requestId, message.params.request.url);
      return;
    }
    const found = describeProblem(message.method, message.params, (id) => urls.get(id) ?? "");
    if (!found) return;
    const { bucket, ...entry } = found;
    problems[bucket].push(entry);
  });
  const take = () => {
    const taken = problems;
    problems = fresh();
    return taken;
  };
  return { take, stop: off };
}

async function attachPage(connection, { width, height, mobile }) {
  const { browserContextId } = await connection.send("Target.createBrowserContext");
  const { targetId } = await connection.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await connection.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params, timeoutMs) => connection.send(method, params, sessionId, timeoutMs);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  for (const domain of ["Page", "Runtime", "Log", "Network"]) await send(`${domain}.enable`);
  return { browserContextId, targetId, sessionId, send };
}

/**
 * A blank page of the given size, in a browser context of its own.
 *
 * @param {Awaited<ReturnType<typeof connect>>} connection
 * @param {{width: number, height: number, mobile: boolean}} viewport
 */
export async function openPage(connection, viewport) {
  const { browserContextId, targetId, sessionId, send } = await attachPage(connection, viewport);
  const problems = watchProblems(connection, sessionId);

  async function load(command, params) {
    const loaded = connection.waitFor("Page.loadEventFired", { sessionId });
    loaded.catch(() => {});
    const { errorText } = await send(command, params);
    if (errorText) throw new Error(`could not open ${params.url}: ${errorText}`);
    await loaded;
  }

  return {
    navigate: (url) => load("Page.navigate", { url }),
    reload: () => load("Page.reload", {}),
    takeProblems: problems.take,

    /** Run JavaScript in the page, waiting for a promise it returns. */
    async evaluate(expression) {
      const { result, exceptionDetails } = await send("Runtime.evaluate", {
        expression, awaitPromise: true, returnByValue: true,
      });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    },

    /** The viewport as a PNG, or the whole scrolling page when asked. */
    async screenshot({ fullPage = false } = {}) {
      const params = { format: "png" };
      if (fullPage) {
        const { cssContentSize } = await send("Page.getLayoutMetrics");
        params.captureBeyondViewport = true;
        params.clip = {
          x: 0,
          y: 0,
          width: Math.ceil(cssContentSize.width),
          height: Math.min(Math.ceil(cssContentSize.height), MAX_FULL_PAGE_HEIGHT),
          scale: 1,
        };
      }
      const { data } = await send("Page.captureScreenshot", params, SHOT_TIMEOUT_MS);
      return Buffer.from(data, "base64");
    },

    /** Close the page and throw its context away, storage and all. Never fails. */
    async close() {
      problems.stop();
      await connection.send("Target.closeTarget", { targetId }).catch(() => {});
      await connection.send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
    },
  };
}
