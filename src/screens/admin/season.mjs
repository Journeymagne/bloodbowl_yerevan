/**
 * The administration's «Season» (stage 12, decisions 17–21; DeskAdminSeason.html, DeskAdminEntries.html): the head
 * with the season's name, the switch between the sections, the season's own two tabs — «Rounds and pairs» and
 * «Entries» —, and under them the tab's content. A phone draws the desk's cards in one column, its targets 44px (no
 * prototype has one).
 *
 * The visit reads the season (`loadSeason(true)`) and, for the rounds, the scores awaiting a confirmation
 * (`readAwaiting`). A coach who is no admin is told the section is the admin's, and nothing is read. Every write of
 * the season is one at a time on the screen (`busy`) and on the page (`seasonWrite`): the season it answers with is
 * put in place, or read again, and the screen is patched from it, the focus where it was (or on the card's title,
 * when what had it went). A refusal is the server's words: in the sheet that sent it, which stays open, or over the
 * cards. An answer that did not come back is not sent again: the season is read again, the sheet closes, and the
 * screen says to check what the server holds. The width crossing 900px draws the other form, the focus kept or on
 * the title; leaving stops listening.
 */
import { confirmAction, patchWithModal } from "../../components/dialog.mjs";
import { toast } from "../../components/toast.mjs";
import { drawKeepingFocus, escapeHtml, focusLost, listenerGroup } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { adminSeasonUrl, seasonTabUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { readAwaiting, seasonWrite } from "../../data/admin.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { wireOptionLists } from "../../ui/option-card.mjs";
import { wireResourceCounters } from "../../ui/resource-counter.mjs";
import { renderSegmentedControl, wireSegmentedControls } from "../../ui/segmented-control.mjs";
import { wireSheets } from "../../ui/sheet.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { isPhone, onPhoneChange } from "../team/roster/screen.mjs";
import { adminHeadMarkup, adminRefusalMarkup, isAdminViewer } from "./frame.mjs";
import { MOST, RESULT_SHEET, resultBody, resultDraft, resultSheetMarkup, resultSheetModel } from "./result-sheet.mjs";
import { adminRoundsMarkup, seasonRoundsModel } from "./season-rounds.mjs";

const SEASON_PATH = "/api/season/admin";

/** A visit of the screen: its tab, the scores awaiting as read, the rounds before open, the write on its way, the last refusal, the sheet. */
function newVisit(tab) {
  return { here: true, tab: tab === "entries" ? "entries" : "", awaiting: null, pastOpen: false, busy: "", refusal: "", sheet: null };
}

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

/** «Entries» until stage 12's Task 12 draws them: the card, and the way to the league's table, where the teams of the season stand. */
function entriesMarkup() {
  return `<section class="g-admin__card"><div class="g-admin__cardhead"><h2>${escapeHtml(t("adminSeason.entries"))}</h2></div>`
    + `<p class="g-admin__note">${escapeHtml(t("adminSeason.entriesSoon"))}</p>`
    + `<span class="g-adminseason__link">${renderButton({ label: t("adminSeason.toLeague"), href: seasonTabUrl() })}</span></section>`;
}

/** The season while it is read, or why it could not be, with «Try again». */
function readingMarkup() {
  if (!state.season.error) return `<p class="g-admin__note" role="status">${escapeHtml(t("administration.reading"))}</p>`;
  return renderCallout({ tone: "danger", title: t("administration.readFailed", { reason: state.season.error }) })
    + `<span class="g-adminseason__link">${renderButton({ label: t("administration.again"), data: { seasonAgain: "" } })}</span>`;
}

/** The sheet of the pair it is about, as the page holds that pair now; none when the pair has gone (deleted by a write). */
function sheetMarkup(visit, model) {
  const sheet = visit.sheet;
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
  if (visit.tab === "entries") return `${failure}${entriesMarkup()}`;
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
  if (visit.sheet && state.season.data && !pairOf(modelOf(visit), visit.sheet.lineId)) visit.sheet = null;
  const before = view.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null;
  patchWithModal(view, markupOf(visit), visit.sheet ? `#${RESULT_SHEET}` : "");
  if (before !== "admin-season") globalThis.scrollTo?.(0, 0);
}

/** A write took away what had the focus (a round started, a pair deleted): the card's title takes it, else the screen's. */
function settleFocus() {
  if (!focusLost(document.activeElement)) return;
  (view.querySelector("[data-season-card]") ?? view.querySelector("h1"))?.focus();
}

/**
 * The focus back to the button that opened the sheet; when a redraw took it, to one of the same pair, the card's title,
 * the screen's. A patch keeps nodes by their place: the opener's node may now be another pair's button (the row of a
 * score confirmed gone, the next one in its place), so it is the pair's only while it says so.
 */
function giveFocusBack(sheet) {
  const opener = sheet.opener;
  if (opener?.isConnected && !focusLost(opener) && opener.getAttribute("data-season-result") === sheet.lineId) return opener.focus();
  const buttons = [...view.querySelectorAll("[data-season-result]")].filter((button) => button.getAttribute("data-season-result") === sheet.lineId);
  const same = buttons.find((button) => button.getAttribute("data-season-from") === sheet.from) ?? buttons[0];
  return (same ?? view.querySelector("[data-season-card]") ?? view.querySelector("h1"))?.focus();
}

/** The scores awaiting, read again after a write that may have answered one. */
async function readAwaitingAgain(visit) {
  const awaiting = await readAwaiting();
  if (visit.here) visit.awaiting = awaiting;
}

/**
 * A write of the cards (a round generated, started, deleted; a pair added): one at a time, asked first when it destroys.
 * @param {object} visit @param {string} key what is on its way, for its button
 * @param {Function} write the write, answering as `seasonWrite` does
 * @param {{message: string}|null} [ask] the question before a delete
 */
async function act(visit, key, write, ask = null) {
  if (visit.busy) return;
  if (ask && !(await confirmAction({ message: ask.message, confirmLabel: t("common.delete"), destructive: true }))) return;
  if (visit.busy || !visit.here) return;
  Object.assign(visit, { busy: key, refusal: "" });
  draw(visit);
  const outcome = await write();
  if (!visit.here) return;
  visit.busy = "";
  if (outcome.refusal !== undefined) visit.refusal = outcome.refusal;
  draw(visit);
  settleFocus();
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
  if (!visit.here) return;
  visit.busy = "";
  sheet.busy = "";
  const open = visit.sheet === sheet;
  if (outcome.refusal !== undefined && !outcome.unknown && open) {
    sheet.refusal = outcome.refusal;
    return draw(visit);
  }
  if (outcome.refusal !== undefined) visit.refusal = outcome.refusal;
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
  if (!found || visit.sheet) return;
  visit.sheet = { lineId: id, from: button.getAttribute("data-season-from"), draft: resultDraft(found.line), busy: "", refusal: "", opener: button };
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
    if (!refused(button)) void act(visit, `delete:${id}`, write(`${SEASON_PATH}/rounds/${encodeURIComponent(id)}`, "DELETE"), { message });
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
  events.own(wireSheets(view, { onClose: (sheetId) => { if (sheetId === RESULT_SHEET) closeSheet(visit); } }));
  events.own(wireSegmentedControls(view, (mode) => change(visit, { mode }), { group: "result-mode" }));
  events.own(wireSegmentedControls(view, (winner) => change(visit, { winner }), { group: "result-winner" }));
  events.own(wireOptionLists(view, (reason) => change(visit, { reason })));
  events.own(wireResourceCounters(view, ({ key, delta }) => step(visit, key, delta), { onRefused: ({ reason }) => toast(reason) }));
  events.on("change", "[data-pair-side]", (event, select) => change(visit, { [`${select.getAttribute("data-pair-side")}EntryId`]: select.value ?? "" }));
  events.on("click", "[data-result-save]", (event, button) => {
    const found = visit.sheet && pairOf(modelOf(visit), visit.sheet.lineId);
    if (found && !refused(button)) void sheetWrite(visit, "save", game("", "PATCH", resultBody(found.line, visit.sheet.draft)), awaiting);
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

/** The season read again, and (for the rounds) the scores awaiting with it; the screen drawn as they land. */
async function readAll(visit) {
  draw(visit);
  const reads = [loadSeason(true), visit.tab === "entries" ? null : readAwaiting()];
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
    return;
  }
  const events = listenerGroup(view);
  wireCards(visit, events);
  wireSheet(visit, events);
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
