// What scripts/screenshots.mjs says about a run: which browser events count as
// a problem, the summary printed at the end, and the static index page that
// lets the owner look through every image without opening them one by one.
//
// Pure for the same reason plan.mjs is: the deciding is separate from the
// driving, so it can be tested without a browser.

const MAX_TEXT = 600;

const BUCKET_TITLES = {
  console: "Console errors",
  exceptions: "Uncaught exceptions",
  requests: "Failed requests",
};

function clip(text) {
  const flat = String(text ?? "");
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 3)}...` : flat;
}

/** What console.error was given, the way DevTools would print it on one line. */
function consoleText(args = []) {
  return args
    .map((arg) => (arg.value !== undefined ? String(arg.value) : arg.description ?? arg.type))
    .join(" ");
}

/**
 * Decide whether a DevTools event is a problem worth recording, and where.
 *
 * A 404 reaches us as a Log entry from the network, not as a failed load, so
 * those go with the failed requests: the owner looking for "what did not
 * load" should find both there.
 *
 * @param {string} method the event's name
 * @param {object} params the event's payload
 * @param {(requestId: string) => string} [urlFor] the URL a request was made to
 * @returns {{bucket: "console"|"exceptions"|"requests", text: string, url?: string}|null}
 */
export function describeProblem(method, params, urlFor = () => "") {
  if (method === "Runtime.consoleAPICalled" && params.type === "error") {
    return { bucket: "console", text: clip(consoleText(params.args)) };
  }
  if (method === "Runtime.exceptionThrown") {
    const details = params.exceptionDetails ?? {};
    return { bucket: "exceptions", text: clip(details.exception?.description ?? details.text) };
  }
  if (method === "Log.entryAdded" && params.entry?.level === "error") {
    const { source, text, url } = params.entry;
    return { bucket: source === "network" ? "requests" : "console", text: clip(text), ...(url ? { url } : {}) };
  }
  // A request the page gave up on itself (a reload cutting off the one before
  // it) is not a failure of the site.
  if (method === "Network.loadingFailed" && !params.canceled) {
    const url = urlFor(params.requestId);
    return { bucket: "requests", text: clip(params.errorText), ...(url ? { url } : {}) };
  }
  return null;
}

function problemCount(problems) {
  return Object.keys(BUCKET_TITLES).reduce((sum, bucket) => sum + (problems?.[bucket]?.length ?? 0), 0);
}

/**
 * @param {{file: string, failure: string|null, problems: object}[]} results
 * @returns {{written: number, failed: object[], withProblems: {file: string, count: number}[]}}
 */
export function summarizeResults(results) {
  const failed = results.filter((result) => result.failure);
  const withProblems = results
    .filter((result) => !result.failure && problemCount(result.problems) > 0)
    .map((result) => ({ file: result.file, count: problemCount(result.problems) }));
  return { written: results.length - failed.length, failed, withProblems };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderProblems(problems) {
  const groups = Object.entries(BUCKET_TITLES)
    .filter(([bucket]) => problems?.[bucket]?.length)
    .map(([bucket, title]) => {
      const items = problems[bucket].map((problem) => {
        const where = problem.url ? ` <code>${escapeHtml(problem.url)}</code>` : "";
        return `<li>${escapeHtml(problem.text)}${where}</li>`;
      });
      return `<p class="group">${title}</p><ul>${items.join("")}</ul>`;
    });
  return groups.join("");
}

function renderShot(result) {
  const plain = `${result.id}, ${result.width} px, ${result.variant}`;
  const picture = result.failure
    ? `<p class="failure">Not taken: ${escapeHtml(result.failure)}</p>`
    : `<a href="${escapeHtml(result.file)}"><img loading="lazy" src="${escapeHtml(result.file)}" alt="${escapeHtml(plain)}"></a>`;
  return `<figure><figcaption>${escapeHtml(plain)}</figcaption>${picture}${renderProblems(result.problems)}</figure>`;
}

const PAGE_STYLE = `
body { margin: 24px; font: 14px/1.4 system-ui, sans-serif; background: #f4f4f4; color: #1a1a1a; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 32px 0 4px; }
.url { color: #555; margin: 0 0 12px; word-break: break-all; }
.row { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
figure { margin: 0; max-width: 100%; }
figcaption { font-weight: 600; margin-bottom: 4px; }
img { display: block; max-width: 100%; height: auto; border: 1px solid #bbb; background: #fff; }
.failure, .group { color: #a40000; font-weight: 600; margin: 6px 0 0; }
ul { margin: 2px 0 0; padding-left: 18px; color: #a40000; max-width: 640px; }
code { color: #555; word-break: break-all; }
`;

/**
 * A static page, no script: every shot grouped under its state, with whatever
 * the browser complained about under each.
 *
 * @param {object[]} results one entry per shot, in the order they were taken
 * @param {{title?: string}} [options]
 * @returns {string}
 */
export function renderIndexHtml(results, { title = "Screenshots" } = {}) {
  const byState = new Map();
  for (const result of results) {
    if (!byState.has(result.id)) byState.set(result.id, []);
    byState.get(result.id).push(result);
  }
  const sections = [...byState.values()].map((shots) => `
<section>
<h2>${escapeHtml(shots[0].id)}</h2>
<p class="url">${escapeHtml(shots[0].url)}</p>
<div class="row">${shots.map(renderShot).join("\n")}</div>
</section>`);
  const { written, failed, withProblems } = summarizeResults(results);
  const lead = `${written} image(s), ${failed.length} not taken, ${withProblems.length} with browser errors.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${lead}</p>
${sections.join("\n")}
</body>
</html>
`;
}

/**
 * The same complaint across shots, counted once: a 404 for one font shows up in
 * every shot of the run, and a list of a hundred copies hides the one error
 * that is new.
 *
 * @param {{file: string, problems: object}[]} results
 * @returns {{bucket: string, text: string, url: string, files: string[]}[]} most widespread first
 */
export function groupProblems(results) {
  const groups = new Map();
  for (const result of results) {
    for (const bucket of Object.keys(BUCKET_TITLES)) {
      for (const problem of result.problems?.[bucket] ?? []) {
        const key = `${bucket}\n${problem.text}\n${problem.url ?? ""}`;
        if (!groups.has(key)) groups.set(key, { bucket, text: problem.text, url: problem.url ?? "", files: [] });
        const group = groups.get(key);
        if (!group.files.includes(result.file)) group.files.push(result.file);
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.files.length - a.files.length);
}

/**
 * The errors.json body: one entry per shot, keyed by the image's name without
 * its extension. It carries what the index page needs too, so a later run with
 * --only can put the shots it did not retake back on the page.
 *
 * @param {object[]} results
 * @returns {Record<string, object>}
 */
export function toErrorsJson(results) {
  const entries = {};
  for (const { id, width, variant, file, url, failure, problems } of results) {
    entries[file.replace(/\.png$/, "")] = { id, width, variant, file, url, failure, ...problems };
  }
  return entries;
}

/** The reverse of toErrorsJson; anything that is not one of its entries is skipped. */
export function fromErrorsJson(entries) {
  const results = [];
  for (const entry of Object.values(entries ?? {})) {
    if (typeof entry?.file !== "string" || typeof entry.id !== "string") continue;
    const { console: logged = [], exceptions = [], requests = [], ...rest } = entry;
    results.push({ ...rest, failure: entry.failure ?? null, problems: { console: logged, exceptions, requests } });
  }
  return results;
}

/**
 * Put freshly taken shots into the results of an earlier run: a retaken shot
 * keeps its place, a new one goes at the end, everything else stays.
 */
export function mergeResults(previous, fresh) {
  const byFile = new Map(previous.map((result) => [result.file, result]));
  for (const result of fresh) byFile.set(result.file, result);
  return [...byFile.values()];
}
