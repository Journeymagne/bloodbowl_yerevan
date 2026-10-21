/**
 * The preparation 3.0 on its address (`#/games/:id/pre-match[/:step]`, stage 09a decisions 17–23): read, drawn in a
 * frame of its own (the shell stays out, shell/navigation.mjs), written press by press, read again while it is open.
 *
 * What the page says is prep-model.mjs's; its frame is prep-frame.mjs's, its steps prep-steps.mjs's and
 * prep-inducements.mjs's. This module reads the preparation (`GET /api/games/:id/preparation`), draws it in the form of
 * the width — again when the width crosses 900px — and turns each press into one write («How each write goes»): a die,
 * the time of year, a journeyman, the footer's or the column's button, a counter's step, a star, the effects' form. A
 * write is `PATCH …/preparation {revision, side, action}` on the revision last read, and its answer is what is drawn.
 * One write is on its way at a time. A press while one is goes nowhere and nothing is sent later on its behalf — except
 * a value the coach sets, a die or the time of year, whose latest value wins (the Task 11 review): it waits in one
 * slot, and once the write on its way has landed it is sent from that answer, unless the answer already holds it. A
 * refusal is said in the server's words, as an alert; after a 409 (another device was quicker, a roster changed, the
 * match began …) or an answer that never came, the preparation is read again — and neither the press nor a value
 * waiting is sent again by itself. The start (`POST …/start {revision, side}`) goes the same way, once; a match begun
 * — by the answer, or by the read after a start whose answer was lost — leads to the team's matches (an administrator
 * who is not the side's coach goes to the game, pre-flight L20). A press on what is closed says why.
 *
 * The footer's button keeps its place (`data-key="prep-cta"`): «Confirm the preparation» turns into «Start the match»
 * on the same node once both sides have confirmed, and on an address with no step the page follows the step on, so
 * «Confirm the roster» can turn into «Go on without purchases»; a step link («Next: start») opens a page whose button
 * stands where the link stood. So the footer's action is armed only `FOOTER_ARM_MS` after it appears — on the first
 * draw too, and whenever the page moves the focus onto it —: the second click of a double click does nothing, and an
 * Enter held down (its auto-repeat) presses nothing more. A draw that replaces the footer's button or takes it away (a
 * confirmation that leads on, «Change…», a match begun) gives the focus to the button, or to the title when there is
 * none, never to the page's body.
 *
 * The weather is one per match (the owner's M2 answer): a die or the time of year sends the weather as the last read
 * has it with that one change (pre-flight L21), never what the page alone holds — so the opponent's die is not wiped.
 *
 * A poll reads the preparation every six seconds (as 2.x) while the tab is seen, no write is on its way, the effects'
 * form holds nothing unsaved and no dialog is open; another revision is drawn. A read that fails waits longer each time
 * (up to a minute), one refused (403, 404) stops the poll, and so does a match begun: it changes no more here. A match
 * begun elsewhere draws the page read only (prep-model.mjs). Leaving stops the poll and every listener; an answer that
 * comes after draws nothing. A preparation that cannot be read is said with a way to read it again.
 */
import { toast } from "../../components/toast.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { API_ERROR, errorText } from "../../core/api.mjs";
import { delegate, drawKeepingFocus, escapeHtml, focusLost, listenerGroup, patch } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl, preMatchUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { invalidateGames } from "../../data/games.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { wireRadioGroups } from "../../ui/choice.mjs";
import { icon } from "../../ui/icons.mjs";
import { wireResourceCounters } from "../../ui/resource-counter.mjs";
import { wireSegmentedControls } from "../../ui/segmented-control.mjs";
import { renderLogin } from "../auth/login.mjs";
import { isPhone, onPhoneChange } from "../team/roster/screen.mjs";
import { effectsFromForm } from "./prep-effects.mjs";
import { prepFrameMarkup } from "./prep-frame.mjs";
import { prepModel } from "./prep-model.mjs";
import { prepStepMarkup } from "./prep-steps.mjs";

/** How often the open preparation is read again, as 2.x did. */
const POLL_MS = 6000;

/** The most ticks a poll waits out after reads that failed: a minute between reads at most. */
const POLL_WAIT_MOST = 9;

/** A poll refused for good: the preparation is not there, or not the coach's. */
const POLL_STOPS = new Set([403, 404]);

/**
 * How long the footer's button waits after it turns into another action (the Task 11 review, I-1): a double click on
 * «Confirm the preparation» starts nothing, one on «Confirm the roster» buys nothing.
 */
const FOOTER_ARM_MS = 600;

/** The times of year the weather may have (the domain's, `applyPreparationAction`); the page shows autumn for any other. */
const SEASONS = ["Spring", "Summer", "Autumn"];

/** A refusal after which the preparation is read again: any 409 (as 2.x), or an answer that never came. */
const readsAgain = (error) => error?.status === 409 || error?.kind === API_ERROR.OFFLINE || error?.kind === API_ERROR.TIMEOUT;

/** Whether a control is closed with a reason (`aria-disabled`), which a press says rather than acts on. */
const closed = (element) => element.getAttribute("aria-disabled") === "true";

/**
 * The page while there is no preparation to draw: «‹» back to the game, the title, and what is said under it — that it
 * is being read, or why it could not be.
 */
function placeholderMarkup(gameId, noticeHtml) {
  const phone = isPhone();
  const back = `<a class="g-prep__back" href="${escapeHtml(gameUrl(gameId))}" aria-label="${escapeHtml(t("prep.back"))}">${icon("back", 18)}</a>`;
  const title = `<span class="g-prep__titles"><h1 class="g-prep__title" tabindex="-1">${escapeHtml(t("prep.title"))}</h1></span>`;
  const head = phone ? `<header class="g-prep__head"><div class="g-prep__bar">${back}${title}</div></header>` : `<header class="g-prep__band">${back}${title}</header>`;
  return `<div class="g-prep g-prep--${phone ? "phone" : "desk"}">${head}<div class="g-prep__notices">${noticeHtml}</div></div>`;
}

/**
 * One visit of the page: the game, the step the address names, the preparation last read and the side shown (the
 * viewer's; an administrator picks one), what is on its way, the refusal said, the inducements' category shown.
 */
function createVisit(gameId, requestedStep) {
  return { gameId, requestedStep, path: `/api/games/${encodeURIComponent(gameId)}`, here: true, payload: null, sideName: "home",
    busy: false, writes: 0, polling: false, dirty: false, error: "", category: "help", timer: 0, release: () => {},
    pending: null, footerAction: "", footerAfter: 0, failures: 0, wait: 0 };
}

function modelOf(visit) {
  return prepModel(visit.payload, visit.sideName, visit.requestedStep, { data: state.data, userId: state.auth.currentUser?.id ?? "",
    error: visit.error, category: visit.category });
}

/** The page as the visit stands, in the form of the width. */
function markupOf(visit, model = modelOf(visit)) {
  const phone = isPhone();
  return prepFrameMarkup(model, { phone, ...prepStepMarkup(model, state.data, phone) });
}

/** What the footer's button does when pressed: its action, "" for none (a link on, a closed button, no footer). */
const footerAction = (footer) => (footer.disabled ? "" : footer.action ?? "");

/** A focus left on nothing, or on a control a draw has just closed (`disabled` takes no press and no key). */
const focusGone = (active) => focusLost(active) || Boolean(active?.hasAttribute?.("disabled"));

/** The poll stops for good: a match begun changes no more, a preparation refused stays refused. */
function stopPoll(visit) {
  clearInterval(visit.timer);
  visit.timer = 0;
}

/** Arm the footer's action `FOOTER_ARM_MS` from now: a press before then is the rest of an earlier gesture. */
const armFooter = (visit) => {
  visit.footerAfter = Date.now() + FOOTER_ARM_MS;
};

/** The footer's action as `model` draws it: armed when it appears (none before it, or another one). */
function takeFooter(visit, model) {
  const action = footerAction(model.footer);
  if (action && action !== visit.footerAction) armFooter(visit);
  visit.footerAction = action;
}

/**
 * Draw the page again over what is there: the focus stays where the coach put it. A footer's action that appears is
 * armed `FOOTER_ARM_MS` later (`takeFooter`). A focus the page held that the draw left on nothing (the footer's button
 * replaced or gone, or a control closed under it — a «−» at zero) goes to the footer's button, which is armed again
 * then (the re-review's F-2), else to the title — but for another form of the width, whose title takes it
 * (`drawKeepingFocus`). A match begun stops the poll.
 */
function draw(visit, { refocus = true } = {}) {
  if (!visit.here || !visit.payload) return;
  const page = view.ownerDocument ?? globalThis.document;
  const held = view.contains(page.activeElement);
  const model = modelOf(visit);
  takeFooter(visit, model);
  patch(view, markupOf(visit, model));
  if (visit.payload.preparation.status === "in_progress") stopPoll(visit);
  for (const target of [".g-prep__cta", "h1"]) {
    if (!refocus || !held || !focusGone(page.activeElement)) return;
    const next = view.querySelector(target);
    next?.focus();
    if (next && page.activeElement === next && target === ".g-prep__cta") armFooter(visit);
  }
}

/** Read the preparation again after a refusal or a lost answer; a read that fails too keeps what was there. */
async function readAgain(visit) {
  try {
    const next = await apiRequest(`${visit.path}/preparation`);
    if (!visit.here) return;
    visit.payload = next;
    // The effects' form is drawn again from what was read: nothing in it is the coach's unsaved work any more.
    visit.dirty = false;
  } catch {
    // What is drawn stays; the poll reads again.
  }
}

/**
 * One request of the visit on the revision last read: none while another is on its way. Its answer is the preparation;
 * a refusal is said, and the preparation is read again when another device or a lost answer may have moved it. Nothing
 * is sent again by itself. A preparation the server changed tells the games (the frame's card, the matches page).
 * @returns {Promise<false|"answered"|"refused">} not sent, or how it ended
 */
async function request(visit, path, method, body) {
  if (!visit.here || visit.busy || !visit.payload) return false;
  visit.busy = true;
  visit.writes += 1;
  visit.error = "";
  try {
    visit.payload = await apiRequest(`${visit.path}/${path}`, { method, body: JSON.stringify({ revision: visit.payload.preparation.revision, side: visit.sideName, ...body }) });
    visit.dirty = false;
    void invalidateGames();
    return "answered";
  } catch (error) {
    visit.error = errorText(error);
    if (visit.here && readsAgain(error)) await readAgain(visit);
    return "refused";
  } finally {
    visit.busy = false;
  }
}

/** One write of the preparation (`PATCH …/preparation`), and the page drawn from what came back. */
async function send(visit, action) {
  if (await request(visit, "preparation", "PATCH", { action })) draw(visit);
}

/** The write of a value set (`{type: "fans", value}`, or the weather's `{type: "weather", season?, home?, away?}`). */
function valueAction(visit, { type, ...change }) {
  return type === "fans" ? { type, value: change.value } : weatherAction(visit, change);
}

/** Whether the preparation last read already holds a value set: nothing to send for it. */
function holds(visit, { type, ...change }) {
  const prep = visit.payload.preparation;
  if (type === "fans") return prep[visit.sideName].fansRoll === change.value;
  return Object.entries(change).every(([key, value]) => (prep.weather[key] ?? null) === value);
}

/**
 * A die or the time of year: the latest value wins. While a write is on its way the value waits in the one slot (a
 * newer one takes its place; the weather's changes add up, each die and the season its latest); once the write lands
 * it is sent from the answer, unless the answer already holds it — a double press of one face stays one write. A
 * refusal or a lost answer empties the slot: the page shows what was read, and nothing is sent on the coach's behalf.
 * The page is drawn once no value follows, so a die pressed twice does not flicker back in between.
 */
async function setValue(visit, change) {
  if (visit.busy) {
    visit.pending = visit.pending?.type === change.type ? { ...visit.pending, ...change } : change;
    return;
  }
  for (let next = change; next;) {
    const ended = await request(visit, "preparation", "PATCH", { action: valueAction(visit, next) });
    if (!ended) return;
    const waiting = visit.pending;
    visit.pending = null;
    next = ended === "answered" && visit.here && waiting && !holds(visit, waiting) ? waiting : null;
    if (!next) draw(visit);
  }
}

/**
 * The start (`POST …/start`), once. A match begun — the answer's, or the read's after a
 * start whose answer was lost — leads to the team's matches, where its card says it is on (an administrator to the
 * game); otherwise the page says why. The games are read again once: by the answer (`request`), or here after a read.
 */
async function start(visit) {
  const ended = await request(visit, "start", "POST", {});
  if (!ended) return;
  const begun = visit.payload.preparation.status === "in_progress";
  if (begun && ended !== "answered") void invalidateGames();
  if (!visit.here) return;
  if (begun) location.hash = modelOf(visit).back;
  else draw(visit);
}

/** The weather as the last read has it, with `change` (pre-flight L21): an empty die is null. */
function weatherAction(visit, change) {
  const { season, home, away } = visit.payload.preparation.weather;
  return { type: "weather", season: SEASONS.includes(season) ? season : "Autumn", home: home ?? null, away: away ?? null, ...change };
}

/** How many of `id` the side shown has in its basket. */
const basketOf = (visit, id) => Number(visit.payload.preparation[visit.sideName].basket?.[id] || 0);

/** The effects as the form says them, on top of what is recorded (2.x's object, `effectsFromForm`). */
function effectsAction(visit, form) {
  const side = visit.payload.preparation[visit.sideName];
  return { type: "effects", effects: effectsFromForm(form, side.effects ?? {}, basketOf(visit, "nuffles-prayers")) };
}

/** Why a closed control is closed: its title, its own line or its row's, else that the preparation reads only. */
function refusalOf(visit, element) {
  const why = element.getAttribute("title") || element.querySelector(".g-prep__why")?.textContent
    || element.closest(".g-prep-ind__star")?.querySelector(".g-prep-ind__why")?.textContent || "";
  if (why) return why;
  const { readonlyWhy } = modelOf(visit);
  return readonlyWhy === "closed" ? t("prep.closed") : readonlyWhy ? t("prep.started") : "";
}

/** The dice, the time of year, the inducements' category and an administrator's side: radio groups. */
function wireChoices(visit, events) {
  const set = (change) => void setValue(visit, change);
  const dice = (group, onChange) => wireRadioGroups(view, { group, item: "[data-prep-die]", attribute: "data-prep-die", onChange });
  events.own(dice("[data-prep-fans]", (value) => set({ type: "fans", value: Number(value) })));
  events.own(dice("[data-prep-weather]", (value, group) => set({ type: "weather", [group.getAttribute("data-prep-weather")]: Number(value) })));
  events.own(wireSegmentedControls(view, (season) => set({ type: "weather", season }), { group: "prep-season" }));
  events.own(wireSegmentedControls(view, (category) => {
    visit.category = category;
    draw(visit);
  }, { group: "prep-category" }));
  events.own(wireSegmentedControls(view, (side) => {
    visit.sideName = side;
    visit.error = "";
    visit.dirty = false;
    draw(visit);
  }, { group: "prep-side" }));
}

/** The effects' form: a prayer's result or target is written as soon as it is picked (as 2.x), the rest by «Save». */
function wireEffects(visit, events, write) {
  events.on("submit", "form[data-prep-effects]", (event, form) => {
    event.preventDefault();
    write(effectsAction(visit, form));
  });
  events.on("change", "form[data-prep-effects] select", (event, select) => {
    if (select.matches("[data-prep-prayer], [data-prep-prayer-target]")) write(effectsAction(visit, select.closest("form")));
    else visit.dirty = true;
  });
  events.on("input", "form[data-prep-effects]", () => {
    visit.dirty = true;
  });
}

/** Every press of the page, heard on the view, which outlives each draw. */
function wire(visit) {
  const events = listenerGroup(view);
  const write = (action) => void send(visit, action);
  wireChoices(visit, events);
  wireEffects(visit, events, write);
  events.own(wireResourceCounters(view, ({ key, delta }) => write({ type: "basket", id: key, quantity: basketOf(visit, key) + delta }),
    { onRefused: ({ reason }) => toast(reason) }));
  events.on("click", "[data-prep-hire]", (event, button) => write({ type: "add-journeyman", rowIndex: Number(button.getAttribute("data-prep-hire")) }));
  events.on("click", "[data-prep-remove]", (event, button) => write({ type: "remove-journeyman", id: button.getAttribute("data-prep-remove") }));
  events.on("click", "[data-prep-star]", (event, button) => {
    const id = button.getAttribute("data-prep-star");
    if (!closed(button)) write({ type: "basket", id, quantity: basketOf(visit, id) > 0 ? 0 : 1 });
  });
  // An Enter held down repeats its click: the footer's action takes the first press only (the re-review's F-3).
  events.on("keydown", "[data-prep-action]", (event) => {
    if (event.repeat) event.preventDefault();
  });
  events.on("click", "[data-prep-action]", (event, button) => {
    if (button.hasAttribute("disabled") || closed(button)) return;
    // A footer's button not armed yet: the rest of a double click on what it was a moment ago.
    if (button.classList.contains("g-prep__cta") && Date.now() < visit.footerAfter) return;
    const action = button.getAttribute("data-prep-action");
    if (action === "start") void start(visit);
    else write({ type: action });
  });
  // A counter's step says it through `onRefused`; every other closed control here.
  events.on("click", '[aria-disabled="true"]', (event, element) => {
    if (element.hasAttribute("data-resource-step")) return;
    event.preventDefault();
    toast(refusalOf(visit, element));
  });
  events.own(onPhoneChange(() => drawKeepingFocus(view, () => draw(visit, { refocus: false }), "h1")));
  return () => events.release();
}

/** Whether the poll may read now: the page is seen, nothing is on its way or unsaved, no dialog is open. */
function mayPoll(visit) {
  const page = globalThis.document;
  return visit.here && !visit.busy && !visit.polling && !visit.dirty && !page?.hidden && !page?.querySelector?.("dialog[open]");
}

/**
 * The preparation read again by the timer: another revision is drawn, unless a write went out since it was asked for. A
 * read that fails waits out more ticks each time (1, 3, 7, then 9: up to a minute), a read that answers none; a refusal
 * for good (403, 404) stops the poll.
 */
async function poll(visit) {
  if (visit.wait > 0) {
    visit.wait -= 1;
    return;
  }
  if (!mayPoll(visit)) return;
  visit.polling = true;
  const writes = visit.writes;
  try {
    const next = await apiRequest(`${visit.path}/preparation`);
    visit.failures = 0;
    if (visit.here && !visit.busy && !visit.dirty && visit.writes === writes && next.preparation.revision !== visit.payload.preparation.revision) {
      visit.payload = next;
      draw(visit);
    }
  } catch (error) {
    // A read that finds no answer keeps what is drawn; a later one tries again.
    if (POLL_STOPS.has(error?.status)) stopPoll(visit);
    visit.failures += 1;
    visit.wait = Math.min(2 ** visit.failures - 1, POLL_WAIT_MOST);
  } finally {
    visit.polling = false;
  }
}

/** What is said while the preparation is read. */
const loadingMarkup = () => `<p class="g-prep__note" role="status">${escapeHtml(t("prep.loading"))}</p>`;

/** What is said when the preparation cannot be read: the server's words, and a way to read it again. */
function unreadMarkup(error) {
  const retry = `<button type="button" class="g-prep__quiet" data-prep-retry="">${escapeHtml(t("prep.retry"))}</button>`;
  return `<div class="g-prep__alert" role="alert">${renderCallout({ tone: "danger", title: errorText(error), actionHtml: retry })}</div>`;
}

/**
 * Read the preparation and draw it, the title taking the focus; then listen and poll (not a match begun: it changes no
 * more). A preparation that cannot be read says why, with «Try again», which reads it once more. A coach gone by then is
 * drawn nothing.
 */
async function openVisit(visit) {
  // The frame of a step link stays while the step is read; another screen's in the same frame (the post-match's,
  // `data-screen`) gives way to the loading status.
  const frame = view.querySelector(".g-prep");
  if (!frame || frame.hasAttribute("data-screen")) view.innerHTML = placeholderMarkup(visit.gameId, loadingMarkup());
  let payload;
  try {
    payload = await apiRequest(`${visit.path}/preparation`);
  } catch (error) {
    if (!visit.here) return;
    view.innerHTML = placeholderMarkup(visit.gameId, unreadMarkup(error));
    view.querySelector("h1")?.focus();
    visit.release = delegate(view, "click", "[data-prep-retry]", () => {
      visit.release();
      visit.release = () => {};
      view.innerHTML = placeholderMarkup(visit.gameId, loadingMarkup());
      view.querySelector("h1")?.focus();
      void openVisit(visit);
    });
    return;
  }
  if (!visit.here) return;
  visit.payload = payload;
  visit.sideName = payload.viewerSide === "away" ? "away" : "home";
  const model = modelOf(visit);
  // Armed on the first draw too (the re-review's F-1): a double click on «Next: start» lands on «Start the match».
  takeFooter(visit, model);
  view.innerHTML = markupOf(visit, model);
  view.querySelector("h1")?.focus();
  visit.release = wire(visit);
  if (payload.preparation.status !== "in_progress") visit.timer = setInterval(() => void poll(visit), POLL_MS);
}

/**
 * The preparation of game `gameId` at the step the address names (the current one for "" or a step not reached yet).
 * «Kick-off», a step of the rules before version 2, is the start, as 2.x sent it on. A guest gets the sign-in (the
 * router sends one there first: the address is a coach's).
 * @param {string} gameId
 * @param {string} [requestedStep]
 */
export async function renderPreMatch(gameId, requestedStep = "") {
  if (requestedStep === "kickoff") {
    location.replace(preMatchUrl(gameId, "review"));
    return;
  }
  if (!state.auth.currentUser) {
    renderLogin("login");
    return;
  }
  const visit = createVisit(gameId, requestedStep);
  onScreenLeave("pre-match", () => {
    visit.here = false;
    clearInterval(visit.timer);
    visit.release();
  });
  await openVisit(visit);
}
