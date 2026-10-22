/**
 * A team's friendlies on their address (`#/t/:teamId/challenges[/:userId]`, stage 09c): read, drawn, and written press
 * by press. It replaces 2.x's «My games» there.
 *
 * What the page and its two sheets say is challenges-model.mjs's; the page is drawn by challenges-view.mjs, the sheets
 * by challenges-sheets.mjs. This module reads the challenges (`readChallenges`) and the games (`loadGames`), draws the
 * page in the form of the width — again when the width crosses 900px, the sheet open staying open with what was typed
 * and chosen (decision 1) —, opens the sheets and turns each press into one write.
 *
 * The reads (decision 7): the challenges and the games on the way in, whenever the tab is seen again and on «Refresh»;
 * the challenges after each write of the coach's, the games after an accept or after any write whose list names a
 * match they lack (an opponent accepted meanwhile: its challenge would be in no section). No timer polls (2.x read
 * every six seconds): an opponent's answer is seen on the next visit or the next look at the tab. A read waits for the
 * one on its way, so the later answer is always the newer list.
 *
 * The writes — one on its way at a time; a press while one is (and while the list is read after it) sends nothing and
 * opens no sheet: what the page offers is what the write's answer and the list read after it say:
 * - «Challenge <login>» (`POST /api/challenges {opponentId, teamId}`): sent — the list read, the sheet closed, the
 *   coach told «Challenge sent: …», the focus on «Challenge». Refused — the server's words in the sheet, the list read,
 *   the sheet open (`CHALLENGE_ALREADY_SENT` from another device makes the coach busy). Lost (no answer came) — the list
 *   read: the challenge waiting there is sent, otherwise the sheet says no answer came. Never sent again by itself.
 * - «Accept and go to the preparation» (`POST …/:id/accept {teamId}`): the games read again and the address is the new
 *   match's preparation. A challenge no longer waiting (`CHALLENGE_CLOSED`, or `CHALLENGE_NOT_FOUND`: its pair was
 *   deleted) — the server's words on the page, the list read, the sheet closed; another refusal — the words in the
 *   sheet, the list read. Lost — the list read: accepted, it leads to the match it names; otherwise the sheet says no
 *   answer came.
 * - «Decline» and «Cancel the challenge» (`POST …/:id/decline|cancel {}`), with no step to confirm (decision 15, as the
 *   prototypes and 2.x): the list read, the card gone and the focus on the title, the coach told. Refused or lost and
 *   not done — said on the page.
 * A refusal the page says is an alert over its sections (pre-flight L4: a screen reader's announcement alone is not
 * seen), until the coach's next action.
 *
 * A coach the address names (decision 13) is chosen in the challenge sheet, opened once the challenges are read and the
 * coach scrolled into view; one busy with the page's team is not chosen (his chip says why), one who cannot be
 * challenged is said. Every way the sheet closes — by the coach, or by a challenge sent — puts the address back
 * (`history.replaceState`: no draw, no step in the history; pre-flight L3).
 *
 * The accept sheet reads the challenger's team (`readCoachTeam`: its value, his Telegram) when it opens, once for a
 * challenge; a read that failed is tried again when the sheet opens again. A challenge that stops waiting while its
 * sheet is open (any read — the tab seen again, «Refresh», the one after a write — after it was cancelled) closes the
 * sheet, the page saying why: no draw leaves the sheet open with nothing drawn.
 *
 * A closed sheet gives the focus back to the button that opened it, or to the title once that is gone. Leaving closes
 * the sheet and stops listening; an answer that comes after draws nothing and leads nowhere.
 */
import { patchWithModal } from "../../components/dialog.mjs";
import { announce } from "../../components/live-region.mjs";
import { drawKeepingFocus, drawScreen, focusLost, listenerGroup } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { preMatchUrl, teamUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { answerChallenge, readChallenges, sendChallenge } from "../../data/challenges.mjs";
import { readCoachTeam } from "../../data/coaches.mjs";
import { invalidateGames, loadGames, onGamesChange } from "../../data/games.mjs";
import { wireRadioGroups } from "../../ui/choice.mjs";
import { wireSheets } from "../../ui/sheet.mjs";
import { isPhone, onPhoneChange } from "../team/roster/screen.mjs";
import { acceptModel, challengesModel, sendModel } from "./challenges-model.mjs";
import { ACCEPT_SHEET, SEND_SHEET, acceptSheetMarkup, sendSheetMarkup } from "./challenges-sheets.mjs";
import { challengesMarkup } from "./challenges-view.mjs";

/** An accept refused because the challenge is no longer there to accept: its sheet closes and the page says why. */
const GONE = new Set(["CHALLENGE_CLOSED", "CHALLENGE_NOT_FOUND"]);

/** What a decline and a cancel leave a challenge as. */
const ANSWERED = { decline: "declined", cancel: "cancelled" };

/**
 * One visit of the page: the team, the challenges last read (and why a read failed), whether the games are held back
 * (a failure an earlier read left, which the visit's own read has not answered yet), the sheet open with what is typed
 * and chosen in it, the challengers' teams read, what is said, the write on its way (and the challenge a decline or a
 * cancel answers), the history open, and the coach the address names.
 */
function createVisit(teamId, presetUserId) {
  return {
    teamId, here: true, payload: null, readError: "", held: Boolean(state.games.error), reading: Promise.resolve(),
    sheet: null, query: "", chosenId: "", teamChoice: teamId, acceptId: "", ownChoice: teamId, senders: new Map(),
    refusal: "", notice: "", writing: "", answering: "", historyOpen: false, preset: presetUserId, presetPending: Boolean(presetUserId),
  };
}

const viewerId = () => state.auth.currentUser?.id ?? "";

/** The games as the page may draw them: null while they are not read, or a failure from before is held back. */
const gamesOf = (visit) => (state.games.loaded && !visit.held ? state.games.items : null);

/** A challenge sent to the coach that still waits for his answer. */
const incomingOf = (visit, id) => (visit.payload?.challenges ?? [])
  .find((challenge) => challenge.id === id && challenge.status === "pending" && challenge.recipient?.id === viewerId());

/** The page: the model's, with a refused write's words beside the reads that failed (pre-flight L4). */
function pageMarkup(visit, phone) {
  const model = challengesModel({
    payload: visit.payload, readError: visit.readError, games: gamesOf(visit), gamesError: visit.held ? "" : state.games.error,
    teamId: visit.teamId, viewerId: viewerId(), teams: state.myTeams.items, now: new Date(), phone,
  });
  const page = visit.notice ? { ...model, failures: [...model.failures, visit.notice] } : model;
  return challengesMarkup(page, { historyOpen: visit.historyOpen, writing: visit.writing, answering: visit.answering });
}

/** The challenge sheet's model. A coach chosen who became busy (another team chosen, a list read) is let go for good. */
function sendModelOf(visit) {
  const model = sendModel({
    payload: visit.payload, games: gamesOf(visit), teams: state.myTeams.items, teamId: visit.teamId, viewerId: viewerId(),
    query: visit.query, chosenId: visit.chosenId, teamChoice: visit.teamChoice, presetId: visit.preset,
  });
  visit.chosenId = model.chosen?.id ?? "";
  return model;
}

/** The accept sheet's model; null once its challenge no longer waits. */
function acceptModelOf(visit) {
  const challenge = incomingOf(visit, visit.acceptId);
  return challenge && acceptModel({
    challenge, sender: visit.senders.get(challenge.id) ?? null, teams: state.myTeams.items, choiceId: visit.ownChoice, teamId: visit.teamId,
  });
}

/** The page and the sheet open, in the form of the width. */
function markupOf(visit) {
  const phone = isPhone();
  const page = pageMarkup(visit, phone);
  if (visit.sheet === SEND_SHEET) return page + sendSheetMarkup(sendModelOf(visit), { phone, refusal: visit.refusal, busy: visit.writing === "send" });
  const accept = visit.sheet === ACCEPT_SHEET && acceptModelOf(visit);
  return accept ? page + acceptSheetMarkup(accept, { refusal: visit.refusal, busy: visit.writing === "accept" }) : page;
}

/**
 * Draw the visit over what is there: the sheet open stays open (and modal), the focus where the coach put it. An accept
 * sheet whose challenge a read took away is not kept open with nothing drawn (every press would wait for it to close):
 * it closes, the page saying why.
 */
function draw(visit) {
  if (!visit.here || closeIfGone(visit)) return;
  patchWithModal(view, markupOf(visit), visit.sheet ? `#${visit.sheet}` : "");
}

/** Whether a sheet may open: none is, and no write is on its way (its answer and the list read after it come first). */
const mayOpen = (visit) => !visit.sheet && !visit.writing;

/** Where the focus goes when the width's other form has no node it was on (pre-flight L5): never under the sheet. */
function focusTarget(visit) {
  if (visit.sheet === SEND_SHEET) return "#friendly-search";
  return visit.sheet === ACCEPT_SHEET ? `#${ACCEPT_SHEET} [role="radio"][aria-checked="true"]` : "h1";
}

/** The button that opens `sheet`: «Challenge», or the challenge's «Accept…»; null once it is gone. */
function openerOf(visit, sheet) {
  if (sheet === SEND_SHEET) return view.querySelector("[data-friendly-send]");
  return [...view.querySelectorAll("[data-friendly-accept]")].find((button) => button.getAttribute("data-friendly-accept") === visit.acceptId) ?? null;
}

/** The address names no coach any more: put back without a draw or a step in the history (decision 13, pre-flight L3). */
function dropPreset(visit) {
  if (!visit.preset) return;
  visit.preset = "";
  globalThis.history?.replaceState?.(null, "", teamUrl(visit.teamId, "challenges"));
}

/** The sheet goes; the focus goes back to the button that opened it, or to the title once that is gone or closed. */
function closeSheet(visit) {
  const sheet = visit.sheet;
  if (sheet === SEND_SHEET) dropPreset(visit);
  Object.assign(visit, { sheet: null, refusal: "" });
  draw(visit);
  const back = openerOf(visit, sheet);
  (back && !back.hasAttribute("disabled") ? back : view.querySelector("h1"))?.focus();
  visit.acceptId = "";
}

/**
 * An accept sheet whose challenge no longer waits for the coach (cancelled meanwhile, answered on another device) closes,
 * the page saying why — not while the accept is on its way: its own answer says what came of it.
 * @returns {boolean} whether it closed
 */
function closeIfGone(visit) {
  if (visit.sheet !== ACCEPT_SHEET || visit.writing === "accept" || incomingOf(visit, visit.acceptId)) return false;
  visit.notice = visit.refusal || visit.notice || t("error.CHALLENGE_CLOSED");
  closeSheet(visit);
  return true;
}

/** Read the challenges after any read on its way: the list read is the visit's; a failure keeps the one before and says why. */
function readList(visit) {
  const read = async () => {
    if (!visit.here) return;
    const answer = await readChallenges();
    if (!visit.here) return;
    if (answer.error) visit.readError = answer.error;
    else Object.assign(visit, { payload: answer, readError: "" });
  };
  visit.reading = visit.reading.then(read, read);
  return visit.reading;
}

/** Whether the list read names an accepted challenge, but `own`, whose match the games read do not have. */
const unknownMatch = (visit, own) => (visit.payload?.challenges ?? []).some((challenge) => challenge.id !== own
  && challenge.status === "accepted" && challenge.gameId && !state.games.items.some(({ id }) => id === challenge.gameId));

/**
 * The list read after a write; the games too when it names a match they do not have — an opponent's accept meanwhile,
 * which without them would be in no section. `own` is the challenge the write accepted: going to its match reads them.
 */
async function readAfterWrite(visit, own = "") {
  await readList(visit);
  if (visit.here && !visit.readError && unknownMatch(visit, own)) await loadGames(true);
}

/**
 * The challenge sheet opens, nothing typed, the page's team; `chosenId` chosen when he can be, and in view either way —
 * a coach busy with the team shows his chip.
 */
function openSend(visit, chosenId = "") {
  Object.assign(visit, { sheet: SEND_SHEET, query: "", chosenId, teamChoice: visit.teamId, refusal: "", notice: "", presetPending: false });
  draw(visit);
  if (!chosenId) return;
  [...view.querySelectorAll(`#${SEND_SHEET} [data-friendly-pick]`)]
    .find((item) => item.getAttribute("data-friendly-pick") === chosenId)?.scrollIntoView?.({ block: "nearest" });
}

/** The accept sheet of challenge `id` opens with the page's team; the challenger's team is read, unless it already was. */
async function openAccept(visit, id) {
  const challenge = incomingOf(visit, id);
  if (!challenge || !mayOpen(visit)) return;
  Object.assign(visit, { sheet: ACCEPT_SHEET, acceptId: id, ownChoice: visit.teamId, refusal: "", notice: "" });
  draw(visit);
  // Read, or on its way (null): not read again. A read that failed is.
  if (visit.senders.has(id) && !visit.senders.get(id)?.error) return;
  visit.senders.set(id, null);
  const answer = await readCoachTeam(challenge.sender?.id ?? "", challenge.team?.id ?? "");
  visit.senders.set(id, answer);
  if (visit.here && visit.sheet === ACCEPT_SHEET && visit.acceptId === id) draw(visit);
}

/**
 * Read the challenges and the games (the way in, the tab seen again, «Refresh») and draw what they say; the coach the
 * address names is offered once the challenges are read.
 */
async function refresh(visit) {
  await Promise.allSettled([readList(visit), loadGames(true)]);
  if (!visit.here) return;
  visit.held = false;
  if (visit.presetPending && mayOpen(visit) && visit.payload && !visit.readError) openSend(visit, visit.preset);
  else draw(visit);
}

/** What a write's answer said, or that none came: in its sheet while that is open, otherwise on the page. */
function say(visit, sheet, words) {
  if (visit.sheet === sheet) visit.refusal = words;
  else visit.notice = words;
}

/** Whether the list read names a challenge waiting from the coach's team `teamId` to `opponentId`. */
const waitingWith = (visit, opponentId, teamId) => (visit.payload?.challenges ?? []).some((challenge) => challenge.status === "pending"
  && challenge.sender?.id === viewerId() && challenge.recipient?.id === opponentId && challenge.team?.id === teamId);

/** The challenge sheet's «Challenge <login>»: one request, the list read after it, and what came of it said. */
async function send(visit) {
  if (visit.writing || visit.sheet !== SEND_SHEET) return;
  const { chosen, teamId } = sendModelOf(visit);
  if (!chosen) return;
  Object.assign(visit, { writing: "send", refusal: "", notice: "" });
  draw(visit);
  const answer = await sendChallenge({ opponentId: chosen.id, teamId });
  if (!visit.here) return;
  await readAfterWrite(visit);
  visit.writing = "";
  if (!visit.here) return;
  if (!answer.error || (answer.lost && waitingWith(visit, chosen.id, teamId))) {
    if (visit.sheet === SEND_SHEET) closeSheet(visit);
    else draw(visit);
    announce(t("friendly.sent", { login: chosen.login }));
    return;
  }
  say(visit, SEND_SHEET, answer.lost ? t("friendly.lost") : answer.error);
  draw(visit);
}

/** The friendly an accept made: the games read again (the frame's card, «Matches»), and its preparation, for one still here. */
function toMatch(visit, gameId) {
  void invalidateGames();
  if (visit.here) location.hash = preMatchUrl(gameId);
}

/** «Accept and go to the preparation»: one request with the team chosen; the match it made, or what came of it said. */
async function accept(visit) {
  if (visit.writing || visit.sheet !== ACCEPT_SHEET) return;
  const model = acceptModelOf(visit);
  if (!model || model.cta.disabled) return;
  Object.assign(visit, { writing: "accept", refusal: "", notice: "" });
  draw(visit);
  const answer = await answerChallenge(model.id, "accept", model.chosenId);
  if (answer.gameId) return toMatch(visit, answer.gameId);
  if (!visit.here) return;
  await readAfterWrite(visit, model.id);
  visit.writing = "";
  if (!visit.here) return;
  const now = visit.payload?.challenges.find((challenge) => challenge.id === model.id);
  if (answer.lost && now?.status === "accepted" && now.gameId) return toMatch(visit, now.gameId);
  if (GONE.has(answer.code)) {
    visit.notice = answer.error;
    return visit.sheet === ACCEPT_SHEET ? closeSheet(visit) : draw(visit);
  }
  say(visit, ACCEPT_SHEET, answer.lost ? t("friendly.lost") : answer.error);
  draw(visit);
}

/** «Decline» or «Cancel the challenge»: one request, the list read after it; the card gone, or why not said. */
async function respond(visit, action, id) {
  if (visit.writing || !ANSWERED[action] || !id) return;
  Object.assign(visit, { writing: action, answering: id, notice: "" });
  draw(visit);
  const answer = await answerChallenge(id, action);
  if (!visit.here) return;
  await readAfterWrite(visit);
  Object.assign(visit, { writing: "", answering: "" });
  if (!visit.here) return;
  const now = visit.payload?.challenges.find((challenge) => challenge.id === id);
  const done = !answer.error || (answer.lost && now?.status === ANSWERED[action]);
  if (!done) visit.notice = answer.lost ? t("friendly.lost") : answer.error;
  draw(visit);
  // The card pressed is gone: the focus it held goes to the title.
  if (focusLost((view.ownerDocument ?? globalThis.document).activeElement)) view.querySelector("h1")?.focus();
  if (done) announce(action === "decline" ? t("friendly.declined") : t("friendly.cancelled"));
}

/** `listener` on `target` for `type`; what removes it again. */
function listen(target, type, listener) {
  target?.addEventListener?.(type, listener);
  return () => target?.removeEventListener?.(type, listener);
}

/** The challenge sheet's controls: the search, «Clear», the coaches (rows and a desk's chips), the team, the button. */
function wireSend(visit, events) {
  const redraw = () => draw(visit);
  const choose = (id) => {
    visit.chosenId = id;
    redraw();
  };
  events.on("input", "[data-friendly-search]", (event, field) => {
    visit.query = field.value;
    redraw();
  });
  events.on("click", "[data-friendly-clear]", () => {
    visit.query = "";
    // A draw leaves the value of a field with the focus alone, and a click on «Clear» leaves the focus in it in Safari.
    const field = view.querySelector("#friendly-search");
    if (field) field.value = "";
    redraw();
    field?.focus();
  });
  events.own(wireRadioGroups(view, { group: ".g-challenge__group", item: "[data-friendly-pick]", attribute: "data-friendly-pick", onChange: choose }));
  events.on("click", ".g-challenge__recent [data-friendly-pick]", (event, chip) => {
    if (chip.getAttribute("aria-disabled") !== "true") choose(chip.getAttribute("data-friendly-pick"));
  });
  events.own(wireRadioGroups(view, { group: ".g-challenge__teams", item: "[data-friendly-team]", attribute: "data-friendly-team", onChange: (id) => {
    visit.teamChoice = id;
    redraw();
  } }));
  events.on("click", "[data-friendly-challenge]", () => void send(visit));
}

/** Every press of the page and its sheets, heard on the view, which outlives each draw; and what the page follows. */
function wire(visit) {
  const events = listenerGroup(view);
  const redraw = () => draw(visit);
  events.own(onGamesChange(() => {
    visit.held = false;
    redraw();
  }));
  events.own(onPhoneChange(() => drawKeepingFocus(view, redraw, focusTarget(visit))));
  events.own(listen(globalThis.document, "visibilitychange", () => {
    if (globalThis.document.visibilityState === "visible") void refresh(visit);
  }));
  events.on("click", "[data-friendly-retry]", () => {
    visit.notice = "";
    void refresh(visit);
  });
  events.on("click", "[data-friendly-history]", () => {
    visit.historyOpen = !visit.historyOpen;
    redraw();
  });
  events.on("click", "[data-friendly-send]", (event, button) => {
    if (!button.hasAttribute("disabled") && mayOpen(visit)) openSend(visit);
  });
  events.on("click", "[data-friendly-accept]", (event, button) => void openAccept(visit, button.getAttribute("data-friendly-accept")));
  events.on("click", "[data-friendly-answer]", (event, button) => void respond(visit, button.getAttribute("data-friendly-answer"), button.getAttribute("data-friendly-id")));
  wireSend(visit, events);
  events.own(wireRadioGroups(view, { group: ".g-challenge__own", item: "[data-friendly-own]", attribute: "data-friendly-own", onChange: (id) => {
    visit.ownChoice = id;
    redraw();
  } }));
  events.on("click", "[data-friendly-confirm]", () => void accept(visit));
  events.own(wireSheets(view, { onClose: () => closeSheet(visit) }));
  return () => events.release();
}

/**
 * The friendlies of one of the coach's teams, and with `presetUserId` the challenge sheet open with that coach chosen.
 * Drawn at once (the challenges being read), the title taking the focus; drawn again when they and the games come.
 * @param {string} teamId
 * @param {string} [presetUserId] the coach the address names
 */
export async function renderTeamChallenges(teamId, presetUserId = "") {
  const visit = createVisit(teamId, presetUserId);
  const release = wire(visit);
  onScreenLeave("team-challenges", () => {
    visit.here = false;
    for (const dialog of view.querySelectorAll("dialog")) if (dialog.open) dialog.close();
    release();
  });
  drawScreen(view, markupOf(visit));
  view.querySelector("h1")?.focus();
  await refresh(visit);
}
