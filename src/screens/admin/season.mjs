/**
 * The administration's «Season» (stage 12, decisions 17–21; DeskAdminSeason.html, DeskAdminEntries.html): the head
 * with the season's name, the switch between the sections, the season's own two tabs — «Rounds and pairs» and
 * «Entries» —, and under them the tab's content: the rounds (`season-rounds.mjs`, a pair's sheet `result-sheet.mjs`),
 * or the playoff places and the entries (`season-entries.mjs`, with «+ Entry»'s sheet). A phone draws the desk's cards
 * in one column, its targets 44px (no prototype has one).
 *
 * The visit reads the season (`loadSeason(true)`) and, for the rounds, the scores awaiting a confirmation
 * (`readAwaiting`). A coach who is no admin is told the section is the admin's, and nothing is read. Every write of
 * the season is one at a time on the screen (`busy`) and on the page (`seasonWrite`): the season it answers with is
 * put in place, or read again, and the screen is patched from it, the focus where it was (or on the card's title,
 * when what had it went). A refusal is the server's words: in the sheet that sent it, which stays open, or over the
 * cards; the season and the scores awaiting are read again with it, since it may mean the screen was out of date. An
 * answer that did not come back is not sent again: the season is read again, the sheet closes, and the screen says to
 * check what the server holds. The width crossing 900px draws the other form, the focus kept or on
 * the title; leaving stops listening.
 */
import { toast } from "../../components/toast.mjs";
import { drawKeepingFocus, escapeHtml, focusLost, listenerGroup } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { adminSeasonUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { readAwaiting, seasonWrite } from "../../data/admin.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { wireOptionLists } from "../../ui/option-card.mjs";
import { wireResourceCounters } from "../../ui/resource-counter.mjs";
import { renderSegmentedControl, wireSegmentedControls } from "../../ui/segmented-control.mjs";
import { confirmAction, patchWithModal, wireSheets } from "../../ui/sheet.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { isPhone, onPhoneChange } from "../team/roster/screen.mjs";
import { adminHeadMarkup, adminRefusalMarkup, isAdminViewer } from "./frame.mjs";
import { MOST, RESULT_SHEET, adminResultBody, adminResultDraft, resultSheetMarkup, resultSheetModel } from "./result-sheet.mjs";
import { ENTRY_SHEET, entriesMarkup, entriesModel, entrySheetMarkup, placesFrom } from "./season-entries.mjs";
import { adminRoundsMarkup, seasonRoundsModel } from "./season-rounds.mjs";

const SEASON_PATH = "/api/season/admin";

/**
 * A visit of the screen: its tab, the scores awaiting as read, the rounds before open, the write on its way, the last
 * refusal, the sheet (a pair's, or «+ Entry»'s: `kind: "entry"`); the entries' playoff places as typed (null: the
 * season's) and why they were not sent, the withdrawn open.
 */
function newVisit(tab) {
  return { here: true, tab: tab === "entries" ? "entries" : "", awaiting: null, awaitingRead: 0, pastOpen: false, busy: "", refusal: "", sheet: null,
    entries: { places: null, placesError: "", goneOpen: false } };
}

/** Whether the sheet open is «+ Entry»'s, not a pair's. */
const entrySheet = (sheet) => sheet?.kind === "entry";

/** The model of the rounds from the season as the page holds it now. */
const modelOf = (visit) => seasonRoundsModel({ seasonData: state.season.data, awaiting: visit.awaiting?.games ?? [] });

/** The pair a sheet is about, with its round: a round's own, else a score awaiting of no round of the season (a friendly). */
function pairOf(model, id) {
  for (const round of [model.current, model.draft, ...model.past].filter(Boolean)) {
    const line = round.lines.find((item) => item.id === id);
    if (line) return { line, round };
  }
  const line = model.awaiting.find((item) => item.id === id);
  return line ? { line, round: null } : null;
}

/** «Rounds and pairs | Entries»: links, each tab an address of its own. */
function tabsMarkup(tab) {
  const items = [
    { value: "rounds", label: t("adminSeason.rounds"), href: adminSeasonUrl() },
    { value: "entries", label: t("adminSeason.entries"), href: adminSeasonUrl("entries") },
  ];
  return `<div class="g-adminseason__tabs">${renderSegmentedControl({ label: t("adminSeason.tabs"), items, selected: tab || "rounds" })}</div>`;
}

/** The season while it is read, or why it could not be, with «Try again». */
function readingMarkup() {
  if (!state.season.error) return `<p class="g-admin__note" role="status">${escapeHtml(t("administration.reading"))}</p>`;
  return renderCallout({ tone: "danger", title: t("administration.readFailed", { reason: state.season.error }) })
    + `<span class="g-adminseason__link">${renderButton({ label: t("administration.again"), data: { seasonAgain: "" } })}</span>`;
}

/** The sheet of the pair it is about, as the page holds that pair now; none when the pair has gone (deleted by a write); or «+ Entry»'s. */
function sheetMarkup(visit, model) {
  const sheet = visit.sheet;
  if (entrySheet(sheet)) return entrySheetMarkup(entriesModel(state.season.data), sheet);
  const found = sheet ? pairOf(model, sheet.lineId) : null;
  if (!found) return "";
  const taken = new Set((found.round?.lines ?? []).filter((line) => line.id !== sheet.lineId)
    .flatMap((line) => [line.home?.entryId, line.away?.entryId]).filter(Boolean));
  return resultSheetMarkup(resultSheetModel(found.line, { entries: model.entries, phase: found.round?.status ?? "started", taken,
    draft: sheet.draft, busy: sheet.busy, refusal: sheet.refusal }));
}

function contentOf(visit, model) {
  if (!state.season.data) return readingMarkup();
  const failure = state.season.error ? renderCallout({ tone: "danger", title: t("administration.readFailed", { reason: state.season.error }) }) : "";
  if (visit.tab === "entries") return failure + entriesMarkup(entriesModel(state.season.data), { busy: visit.busy, ...visit.entries });
  return failure + adminRoundsMarkup(model, { busy: visit.busy, pastOpen: visit.pastOpen, awaitingFailure: visit.awaiting?.error ?? "" });
}

/** The screen: the head, the tabs, the last refusal (always on the page, so a screen reader hears it), the tab, the sheet. */
function markupOf(visit) {
  if (!isAdminViewer()) return `<div class="g-adminseason" data-screen="admin-season">${adminRefusalMarkup()}</div>`;
  const model = modelOf(visit);
  const title = state.season.data?.season?.name || t("administration.season");
  const sub = t(visit.tab === "entries" ? "adminSeason.subEntries" : "adminSeason.sub");
  const alert = `<div class="g-adminseason__alert" role="alert">${visit.refusal ? renderCallout({ tone: "danger", title: visit.refusal }) : ""}</div>`;
  return `<div class="g-adminseason" data-screen="admin-season">${adminHeadMarkup({ title, sub, section: "season", phone: isPhone() })}${tabsMarkup(visit.tab)}`
    + `<div class="g-admin__main">${alert}${contentOf(visit, model)}</div>${state.season.data ? sheetMarkup(visit, model) : ""}</div>`;
}

/** The screen drawn again, a sheet that is open kept open; another screen than the one drawn starts at the top of the page. */
function draw(visit) {
  if (!visit.here) return;
  if (visit.sheet && !entrySheet(visit.sheet) && state.season.data && !pairOf(modelOf(visit), visit.sheet.lineId)) visit.sheet = null;
  const before = view.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null;
  patchWithModal(view, markupOf(visit), visit.sheet ? `#${entrySheet(visit.sheet) ? ENTRY_SHEET : RESULT_SHEET}` : "");
  if (before !== "admin-season") globalThis.scrollTo?.(0, 0);
}

/**
 * A write took away what had the focus (a round started, a pair deleted, a team moved into the season): `home` takes it
 * (the row's next button), else the card's title, else the screen's.
 */
function settleFocus(home = "") {
  if (!focusLost(document.activeElement)) return;
  // `home && …` would be "" without a home, and `??` passes "" on: the selector is asked only when there is one.
  const target = (home ? view.querySelector(home) : null) ?? view.querySelector("[data-season-card]") ?? view.querySelector("h1");
  target?.focus();
}

/**
 * The focus back to the button that opened the sheet; when a redraw took it, to one of the same pair, the card's title,
 * the screen's. A patch keeps nodes by their place: the opener's node may now be another pair's button (the row of a
 * score confirmed gone, the next one in its place), so it is the pair's only while it says so.
 */
function giveFocusBack(sheet) {
  if (entrySheet(sheet)) return (view.querySelector("[data-entries-add]") ?? view.querySelector("[data-entries-title]") ?? view.querySelector("h1"))?.focus();
  const opener = sheet.opener;
  if (opener?.isConnected && !focusLost(opener) && opener.getAttribute("data-season-result") === sheet.lineId) return opener.focus();
  const buttons = [...view.querySelectorAll("[data-season-result]")].filter((button) => button.getAttribute("data-season-result") === sheet.lineId);
  const same = buttons.find((button) => button.getAttribute("data-season-from") === sheet.from) ?? buttons[0];
  return (same ?? view.querySelector("[data-season-card]") ?? view.querySelector("h1"))?.focus();
}

/**
 * The scores awaiting, read: only the answer of the last read sent is kept, so the visit's first read landing after a
 * write's own read does not put the older list back.
 */
async function readAwaitingOnce(visit) {
  visit.awaitingRead = (visit.awaitingRead ?? 0) + 1;
  const mine = visit.awaitingRead;
  const awaiting = await readAwaiting();
  return visit.here && mine === visit.awaitingRead ? awaiting : null;
}

/** The scores awaiting, read again after a write that may have answered one. */
async function readAwaitingAgain(visit) {
  const awaiting = await readAwaitingOnce(visit);
  if (awaiting) visit.awaiting = awaiting;
}

/**
 * A refusal may mean the screen is out of date (a pair gone, a post-match opened, a round started elsewhere): the
 * season and the scores awaiting are read again, so the cards and an open sheet show what the server holds now. Not
 * for another tab's token, nor a press another write held: nothing was asked of the server.
 */
async function refusedReadAgain(visit, outcome) {
  if (outcome.unknown || outcome.ignored || outcome.code === "OTHER_TAB") return;
  await Promise.all([loadSeason(true), visit.tab === "entries" ? null : readAwaitingAgain(visit)]);
}

/**
 * A write of the cards (a round generated, started, deleted; a pair added; the playoff places; a team moved into the
 * season or withdrawn): one at a time, asked first when it destroys. Answers the write's outcome, or nothing when none went.
 * @param {object} visit @param {string} key what is on its way, for its button
 * @param {Function} write the write, answering as `seasonWrite` does
 * @param {{ask?: {message: string, confirmLabel?: string}|null, home?: string}} [options] the question before a delete; where the
 *   focus goes when the write took away what had it
 */
async function act(visit, key, write, { ask = null, home = "" } = {}) {
  if (visit.busy) return undefined;
  if (ask && !(await confirmAction({ message: ask.message, confirmLabel: ask.confirmLabel ?? t("common.delete"), destructive: true }))) return undefined;
  if (visit.busy || !visit.here) return undefined;
  Object.assign(visit, { busy: key, refusal: "" });
  draw(visit);
  const outcome = await write();
  if (!visit.here) return outcome;
  if (outcome.refusal !== undefined) await refusedReadAgain(visit, outcome);
  if (!visit.here) return outcome;
  visit.busy = "";
  if (outcome.refusal !== undefined) visit.refusal = outcome.refusal;
  draw(visit);
  settleFocus(home);
  return outcome;
}

/**
 * A write of the sheet: one at a time. Done, the sheet closes and the focus goes back to its button; refused, the
 * sheet stays open with the server's words; lost, the season was read again, the sheet closes and the cards say so.
 * `after` reads what else the write may have changed (the scores awaiting), once it is done or lost.
 */
async function sheetWrite(visit, key, write, after = async () => {}) {
  const sheet = visit.sheet;
  if (!sheet || sheet.busy || visit.busy) return;
  Object.assign(sheet, { busy: key, refusal: "" });
  Object.assign(visit, { busy: key, refusal: "" });
  draw(visit);
  const outcome = await write();
  if (outcome.answer || outcome.unknown) await after();
  else if (outcome.refusal !== undefined) await refusedReadAgain(visit, outcome);
  if (!visit.here) return;
  visit.busy = "";
  sheet.busy = "";
  const open = visit.sheet === sheet;
  // A refusal stays in its sheet, drawn from the season as read again (it closes when its pair has gone).
  if (outcome.refusal !== undefined && !outcome.unknown && open) {
    sheet.refusal = outcome.refusal;
    draw(visit);
    if (visit.sheet === sheet) return undefined;
    // Its pair is gone in the season read again: the words go over the cards.
    visit.refusal = outcome.refusal;
    draw(visit);
    return settleFocus();
  }
  if (outcome.refusal !== undefined) visit.refusal = outcome.refusal;
  // A lost answer closes whatever sheet is open: another one opened meanwhile would look ready to send again.
  if (outcome.unknown && visit.sheet && !open) visit.sheet = null;
  if (!open || outcome.ignored) return draw(visit);
  visit.sheet = null;
  draw(visit);
  return giveFocusBack(sheet);
}

/** A closed control's press says why (its title); one that is busy says nothing. Answers whether it was closed. */
function refused(button) {
  if (button.getAttribute("aria-disabled") !== "true") return false;
  toast(button.getAttribute("title") ?? "");
  return true;
}

/** The sheet's draft changed by a choice, a step or a select, and the sheet patched in place (the focus stays). */
function change(visit, changes) {
  if (!visit.sheet || visit.sheet.busy) return;
  visit.sheet.draft = { ...visit.sheet.draft, ...changes };
  visit.sheet.refusal = "";
  draw(visit);
}

function step(visit, key, delta) {
  const [side, counter] = key.split("-");
  const draft = visit.sheet?.draft;
  if (!draft?.[side] || !(counter in draft[side])) return;
  const value = Math.min(MOST, Math.max(0, draft[side][counter] + delta));
  change(visit, { [side]: { ...draft[side], [counter]: value } });
}

function openSheet(visit, button) {
  const id = button.getAttribute("data-season-result");
  const found = pairOf(modelOf(visit), id);
  // Not while a write is on its way: a sheet opened then would look ready to send while the last one's answer is out.
  if (!found || visit.sheet || visit.busy) return;
  visit.sheet = { lineId: id, from: button.getAttribute("data-season-from"), draft: adminResultDraft(found.line), busy: "", refusal: "", opener: button };
  draw(visit);
}

function closeSheet(visit) {
  const sheet = visit.sheet;
  if (!sheet) return;
  visit.sheet = null;
  draw(visit);
  giveFocusBack(sheet);
}

/** The cards' presses: the generation, an empty round, a round started or deleted, a pair added, the rounds before, «Result…». */
function wireCards(visit, events) {
  const write = (path, method = "POST", body) => () => seasonWrite(path, { method, body });
  events.on("click", "[data-season-again]", () => readAll(visit));
  events.on("click", "[data-season-generate]", (event, button) => {
    if (!refused(button)) void act(visit, "generate", write(`${SEASON_PATH}/rounds/generate`));
  });
  events.on("click", "[data-season-empty-round]", (event, button) => {
    if (!refused(button)) void act(visit, "empty", write(`${SEASON_PATH}/rounds`));
  });
  events.on("click", "[data-season-start]", (event, button) => {
    const id = button.getAttribute("data-season-start");
    if (!refused(button)) void act(visit, `start:${id}`, write(`${SEASON_PATH}/rounds/${encodeURIComponent(id)}/start`));
  });
  events.on("click", "[data-season-delete-round]", (event, button) => {
    const id = button.getAttribute("data-season-delete-round");
    const message = t("adminSeason.deleteRoundConfirm", { round: button.getAttribute("data-season-round") });
    if (!refused(button)) void act(visit, `delete:${id}`, write(`${SEASON_PATH}/rounds/${encodeURIComponent(id)}`, "DELETE"), { ask: { message } });
  });
  events.on("click", "[data-season-add-pair]", (event, button) => {
    const id = button.getAttribute("data-season-add-pair");
    if (!refused(button)) void act(visit, `pair:${id}`, write(`${SEASON_PATH}/rounds/${encodeURIComponent(id)}/pairings`, "POST", { homeEntryId: "", awayEntryId: "" }));
  });
  events.on("click", "[data-season-past]", () => {
    visit.pastOpen = !visit.pastOpen;
    draw(visit);
  });
  events.on("click", "[data-season-result]", (event, button) => openSheet(visit, button));
}

/** The sheet's presses: its choices and steps, and its writes. */
function wireSheet(visit, events) {
  const id = () => encodeURIComponent(visit.sheet?.lineId ?? "");
  const game = (path, method = "POST", body) => () => seasonWrite(`/api/games/${id()}${path}`, { method, body });
  const awaiting = () => readAwaitingAgain(visit);
  events.own(wireSheets(view, { onClose: (sheetId) => { if (sheetId === RESULT_SHEET || sheetId === ENTRY_SHEET) closeSheet(visit); } }));
  events.own(wireSegmentedControls(view, (mode) => change(visit, { mode }), { group: "result-mode" }));
  events.own(wireSegmentedControls(view, (winner) => change(visit, { winner }), { group: "result-winner" }));
  // One sheet is open at a time: its option cards are a pair's reasons, or the teams «+ Entry» offers.
  events.own(wireOptionLists(view, (value) => change(visit, entrySheet(visit.sheet) ? { teamId: value } : { reason: value })));
  events.own(wireResourceCounters(view, ({ key, delta }) => step(visit, key, delta), { onRefused: ({ reason }) => toast(reason) }));
  events.on("change", "[data-pair-side]", (event, select) => change(visit, { [`${select.getAttribute("data-pair-side")}EntryId`]: select.value ?? "" }));
  events.on("click", "[data-result-save]", (event, button) => {
    const found = visit.sheet && pairOf(modelOf(visit), visit.sheet.lineId);
    if (found && !refused(button)) void sheetWrite(visit, "save", game("", "PATCH", adminResultBody(found.line, visit.sheet.draft)), awaiting);
  });
  events.on("click", "[data-result-confirm]", (event, button) => {
    if (!refused(button)) void sheetWrite(visit, "confirm", game("/confirm"), awaiting);
  });
  events.on("click", "[data-result-reject]", (event, button) => {
    if (!refused(button)) void sheetWrite(visit, "reject", game("/reject"), awaiting);
  });
  events.on("click", "[data-result-reason-save]", (event, button) => {
    const body = { technicalReason: visit.sheet?.draft.reason };
    if (!refused(button)) void sheetWrite(visit, "reason", () => seasonWrite(`${SEASON_PATH}/pairings/${id()}/technical-reason`, { method: "PATCH", body }));
  });
  events.on("click", "[data-pair-save]", (event, button) => {
    const draft = visit.sheet?.draft;
    if (draft && !refused(button)) {
      void sheetWrite(visit, "pair", () => seasonWrite(`${SEASON_PATH}/pairings/${id()}`, { method: "PATCH", body: { homeEntryId: draft.homeEntryId, awayEntryId: draft.awayEntryId } }));
    }
  });
  events.on("click", "[data-pair-delete]", (event, button) => void deletePair(visit, button, id()));
}

async function deletePair(visit, button, id) {
  if (refused(button) || !visit.sheet || visit.busy) return;
  if (!(await confirmAction({ message: t("adminSeason.deletePairConfirm", { table: button.getAttribute("data-pair-table") }), confirmLabel: t("common.delete"), destructive: true }))) return;
  await sheetWrite(visit, "delete", () => seasonWrite(`${SEASON_PATH}/pairings/${id}`, { method: "DELETE" }));
}

/**
 * The playoff places as typed: said wrong before anything is sent (the field takes the focus back), else one PATCH. The
 * season it answers with is put in place; an answer that did not come back has it read again (`seasonWrite`). Either
 * way the field then shows the places the server holds — it is the one place on the screen that shows them, so what was
 * typed must not stand there as if saved. A refusal, or a write that never went, keeps what was typed.
 */
async function savePlaces(visit, input) {
  const entries = visit.entries;
  if (visit.busy) return;
  const typed = input?.value ?? entries.places ?? "";
  const places = placesFrom(typed);
  Object.assign(entries, { places: typed, placesError: places.error ?? "" });
  if (places.error) {
    draw(visit);
    view.querySelector("form[data-entries-places] input")?.focus();
    return;
  }
  const outcome = await act(visit, "places", async () => {
    const written = await seasonWrite(`${SEASON_PATH}/settings`, { method: "PATCH", body: { playoffPlaces: places.value } });
    if (written.answer || written.unknown) entries.places = null;
    return written;
  });
  if (!visit.here || !(outcome?.answer || outcome?.unknown)) return;
  // A patch leaves a focused field's value alone (Enter sent the form from it): the server's places are put in by hand.
  const field = view.querySelector("form[data-entries-places] input");
  const held = entriesModel(state.season.data).places;
  if (field) field.value = held === null ? "" : String(held);
}

/**
 * The entries' presses: the playoff places, a build moved into the season (the focus then on the row's next button), an
 * entry withdrawn after the question (the focus on the card's title), the withdrawn shown, «+ Entry» and its sheet.
 */
function wireEntries(visit, events) {
  const entries = visit.entries;
  events.on("input", "form[data-entries-places] input", (event, input) => {
    entries.places = input.value ?? "";
    if (!entries.placesError) return;
    entries.placesError = "";
    draw(visit);
  });
  events.on("submit", "form[data-entries-places]", (event, form) => {
    event.preventDefault?.();
    void savePlaces(visit, form.querySelector("input"));
  });
  events.on("click", "[data-entries-activate]", (event, button) => {
    const teamId = button.getAttribute("data-entries-activate");
    const home = `[data-entries-withdraw="${button.getAttribute("data-entries-entry")}"]`;
    if (!refused(button)) void act(visit, `activate:${teamId}`, () => seasonWrite(`/api/teams/${encodeURIComponent(teamId)}/activate`), { home });
  });
  events.on("click", "[data-entries-withdraw]", (event, button) => {
    const id = button.getAttribute("data-entries-withdraw");
    const line = entriesModel(state.season.data).entries.find((item) => item.id === id);
    if (!line || refused(button)) return;
    const ask = { message: t("adminSeason.withdrawConfirm", { team: line.team }), confirmLabel: t("adminSeason.withdraw") };
    void act(visit, `withdraw:${id}`, () => seasonWrite(`${SEASON_PATH}/entries/${encodeURIComponent(id)}`, { method: "DELETE" }), { ask, home: "[data-entries-title]" });
  });
  events.on("click", "[data-entries-gone]", () => {
    entries.goneOpen = !entries.goneOpen;
    draw(visit);
  });
  events.on("click", "[data-entries-add]", (event, button) => {
    if (refused(button) || visit.sheet || visit.busy) return;
    visit.sheet = { kind: "entry", draft: { teamId: "" }, busy: "", refusal: "", opener: button };
    draw(visit);
  });
  events.on("click", "[data-entry-save]", (event, button) => {
    const teamId = visit.sheet?.draft.teamId;
    if (entrySheet(visit.sheet) && !refused(button)) void sheetWrite(visit, "entry", () => seasonWrite(`${SEASON_PATH}/entries`, { body: { teamId } }));
  });
}

/** The season read again, and (for the rounds) the scores awaiting with it; the screen drawn as they land. */
async function readAll(visit) {
  draw(visit);
  const reads = [loadSeason(true), visit.tab === "entries" ? null : readAwaitingOnce(visit)];
  const [, awaiting] = await Promise.all(reads);
  if (!visit.here) return;
  if (awaiting) visit.awaiting = awaiting;
  draw(visit);
}

/**
 * The administration's season on `#/administration/season` (`tab` "") or `…/entries` ("entries"). The title takes the
 * focus, the season and the scores awaiting are read, and the screen is drawn as they land.
 * @param {string} [tab]
 */
export async function renderAdminSeason(tab = "") {
  const visit = newVisit(tab);
  if (!isAdminViewer()) {
    onScreenLeave("admin-season", () => { visit.here = false; });
    draw(visit);
    view.querySelector("h1")?.focus();
    return;
  }
  const events = listenerGroup(view);
  wireCards(visit, events);
  wireSheet(visit, events);
  wireEntries(visit, events);
  events.own(onPhoneChange(() => drawKeepingFocus(view, () => draw(visit), "h1")));
  onScreenLeave("admin-season", () => {
    visit.here = false;
    events.release();
  });
  draw(visit);
  view.querySelector("h1")?.focus();
  await readAll(visit);
  if (visit.here && focusLost(document.activeElement)) view.querySelector("h1")?.focus();
}
