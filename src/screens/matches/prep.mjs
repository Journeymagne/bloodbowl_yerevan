/**
 * The preparation 3.0 on its address (`#/games/:id/pre-match[/:step]`, stage 09a decisions 17–23): read, drawn in a
 * frame of its own (the shell stays out, shell/navigation.mjs), written press by press, read again while it is open.
 *
 * What the page says is prep-model.mjs's; its frame is prep-frame.mjs's, its steps prep-steps.mjs's and
 * prep-inducements.mjs's. This module reads the preparation (`GET /api/games/:id/preparation`), draws it in the form of
 * the width — again when the width crosses 900px — and turns each press into one write («How each write goes»): a die,
 * the time of year, a journeyman, the footer's or the column's button, a counter's step, a star, the effects' form. A
 * write is `PATCH …/preparation {revision, side, action}` on the revision last read, and its answer is what is drawn.
 * One write is on its way at a time: a press while one is goes nowhere, and nothing is sent later on its behalf. A
 * refusal is said in the server's words, as an alert; after a 409 (another device was quicker, a roster changed, the
 * match began …) or an answer that never came, the preparation is read again — and the press is not sent again by
 * itself. The start (`POST …/start {revision, side}`) goes the same way, once; a match begun — by the answer, or by
 * the read after a start whose answer was lost — leads to the team's matches (an administrator who is not the side's
 * coach goes to the game, pre-flight L20). A press on what is closed says why.
 *
 * The weather is one per match (the owner's M2 answer): a die or the time of year sends the weather as the last read
 * has it with that one change (pre-flight L21), never what the page alone holds — so the opponent's die is not wiped.
 *
 * A poll reads the preparation every six seconds (as 2.x) while the tab is seen, no write is on its way, the effects'
 * form holds nothing unsaved and no dialog is open; another revision is drawn. A match begun elsewhere draws the page
 * read only (prep-model.mjs). Leaving stops the poll and every listener; an answer that comes after draws nothing.
 */
import { toast } from "../../components/toast.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { API_ERROR, errorText } from "../../core/api.mjs";
import { drawKeepingFocus, escapeHtml, listenerGroup, patch } from "../../core/dom.mjs";
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
    busy: false, writes: 0, polling: false, dirty: false, error: "", category: "help", timer: 0, release: () => {} };
}

function modelOf(visit) {
  return prepModel(visit.payload, visit.sideName, visit.requestedStep, { data: state.data, userId: state.auth.currentUser?.id ?? "",
    error: visit.error, category: visit.category });
}

/** The page as the visit stands, in the form of the width. */
function markupOf(visit) {
  const phone = isPhone();
  const model = modelOf(visit);
  return prepFrameMarkup(model, { phone, ...prepStepMarkup(model, state.data, phone) });
}

/** Draw the page again over what is there: the focus stays where the coach put it. */
function draw(visit) {
  if (visit.here && visit.payload) patch(view, markupOf(visit));
}

/** Read the preparation again after a refusal or a lost answer; a read that fails too keeps what was there. */
async function readAgain(visit) {
  try {
    const next = await apiRequest(`${visit.path}/preparation`);
    if (visit.here) visit.payload = next;
  } catch {
    // What is drawn stays; the poll reads again.
  }
}

/**
 * One request of the visit on the revision last read: none while another is on its way. Its answer is the preparation;
 * a refusal is said, and the preparation is read again when another device or a lost answer may have moved it. Nothing
 * is sent again by itself. A preparation the server changed tells the games (the frame's card, the matches page).
 * @returns {Promise<boolean>} whether it was sent
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
  } catch (error) {
    visit.error = errorText(error);
    if (visit.here && readsAgain(error)) await readAgain(visit);
  } finally {
    visit.busy = false;
  }
  return true;
}

/** One write of the preparation (`PATCH …/preparation`), and the page drawn from what came back. */
async function send(visit, action) {
  if (await request(visit, "preparation", "PATCH", { action })) draw(visit);
}

/**
 * The start (`POST …/start`), once. A match begun — the answer's, or the read's after a start whose answer was lost —
 * leads to the team's matches, where its card says it is on (an administrator to the game); otherwise the page says why.
 */
async function start(visit) {
  if (!(await request(visit, "start", "POST", {}))) return;
  const begun = visit.payload.preparation.status === "in_progress";
  if (begun) void invalidateGames();
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
function wireChoices(visit, events, write) {
  const dice = (group, onChange) => wireRadioGroups(view, { group, item: "[data-prep-die]", attribute: "data-prep-die", onChange });
  events.own(dice("[data-prep-fans]", (value) => write({ type: "fans", value: Number(value) })));
  events.own(dice("[data-prep-weather]", (value, group) => write(weatherAction(visit, { [group.getAttribute("data-prep-weather")]: Number(value) }))));
  events.own(wireSegmentedControls(view, (season) => write(weatherAction(visit, { season })), { group: "prep-season" }));
  events.own(wireSegmentedControls(view, (category) => {
    visit.category = category;
    draw(visit);
  }, { group: "prep-category" }));
  events.own(wireSegmentedControls(view, (side) => {
    visit.sideName = side;
    visit.error = "";
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
  wireChoices(visit, events, write);
  wireEffects(visit, events, write);
  events.own(wireResourceCounters(view, ({ key, delta }) => write({ type: "basket", id: key, quantity: basketOf(visit, key) + delta }),
    { onRefused: ({ reason }) => toast(reason) }));
  events.on("click", "[data-prep-hire]", (event, button) => write({ type: "add-journeyman", rowIndex: Number(button.getAttribute("data-prep-hire")) }));
  events.on("click", "[data-prep-remove]", (event, button) => write({ type: "remove-journeyman", id: button.getAttribute("data-prep-remove") }));
  events.on("click", "[data-prep-star]", (event, button) => {
    const id = button.getAttribute("data-prep-star");
    if (!closed(button)) write({ type: "basket", id, quantity: basketOf(visit, id) > 0 ? 0 : 1 });
  });
  events.on("click", "[data-prep-action]", (event, button) => {
    if (button.hasAttribute("disabled") || closed(button)) return;
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
  events.own(onPhoneChange(() => drawKeepingFocus(view, () => draw(visit), "h1")));
  return () => events.release();
}

/** Whether the poll may read now: the page is seen, nothing is on its way or unsaved, no dialog is open. */
function mayPoll(visit) {
  const page = globalThis.document;
  return visit.here && !visit.busy && !visit.polling && !visit.dirty && !page?.hidden && !page?.querySelector?.("dialog[open]");
}

/** The preparation read again by the timer: another revision is drawn, unless a write went out since it was asked for. */
async function poll(visit) {
  if (!mayPoll(visit)) return;
  visit.polling = true;
  const writes = visit.writes;
  try {
    const next = await apiRequest(`${visit.path}/preparation`);
    if (visit.here && !visit.busy && !visit.dirty && visit.writes === writes && next.preparation.revision !== visit.payload.preparation.revision) {
      visit.payload = next;
      draw(visit);
    }
  } catch {
    // A read that finds no answer keeps what is drawn; the next one tries again.
  } finally {
    visit.polling = false;
  }
}

/** Read the preparation and draw it, the title taking the focus; then listen and poll. A coach gone by then is drawn nothing. */
async function openVisit(visit) {
  if (!view.querySelector(".g-prep")) view.innerHTML = placeholderMarkup(visit.gameId, `<p class="g-prep__note" role="status">${escapeHtml(t("prep.loading"))}</p>`);
  let payload;
  try {
    payload = await apiRequest(`${visit.path}/preparation`);
  } catch (error) {
    if (!visit.here) return;
    view.innerHTML = placeholderMarkup(visit.gameId, `<div class="g-prep__alert" role="alert">${renderCallout({ tone: "danger", title: errorText(error) })}</div>`);
    view.querySelector("h1")?.focus();
    return;
  }
  if (!visit.here) return;
  visit.payload = payload;
  visit.sideName = payload.viewerSide === "away" ? "away" : "home";
  view.innerHTML = markupOf(visit);
  view.querySelector("h1")?.focus();
  visit.release = wire(visit);
  visit.timer = setInterval(() => void poll(visit), POLL_MS);
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
