/**
 * The post-match 3.0 on its address (`#/games/:id/post-match[/:step]`, stage 09b decisions 1–20): read, drawn in the
 * preparation's frame (its own: the shell stays out, shell/navigation.mjs), written step by step, read again while it is
 * open — as the preparation 09a is (prep.mjs).
 *
 * What it reads: `GET /api/games/:id/post-match` — the post-match, the side of the coach (`viewerSide`; an administrator
 * picks one, decision 19), whether a team changed since it began, the fixture. What the page says is post-model.mjs's;
 * each step's cards are post-steps.mjs's … post-review.mjs's, drawn in the form of the width (again when the width
 * crosses 900px). Every number is the domain's.
 *
 * How it writes («How each write goes»): `PATCH …/post-match {revision, side, action}` on the revision last read
 * (`savePostMatch`: a write refused because the opponent moved the revision is sent once more when this side and the
 * score are as the coach saw them), `POST …/finish {revision, side}` once. Its answer is what is drawn, and the games
 * are read again. One write is on its way at a time; a press while one is sends nothing. The score, the income, the
 * treasury and the captain are drafts kept on the page (`ui.drafts`) and sent by the step's button; the Roster step
 * writes press by press. The Players step writes press by press too, from its draft (pre-flight L2: built and changed
 * only by `changePlayers`, in the shape the domain saves): a press while its write is on its way changes the draft,
 * and once that write has landed the latest draft goes out once more, unless the answer already holds it — never
 * again «until it matches»; a press made while another write closes the step (`lock-players`, `reopen`) goes with it.
 * A refusal is said in the server's words (one alert, the frame's); after a 409 (another device was quicker, the
 * post-match closed, the team changed), a 422 at the finish (pre-flight L9) or an answer that never came, the
 * post-match is read again and nothing is sent again by itself: the Players draft goes with the read. Whenever a
 * Players draft goes holding what was not sent, the coach is told (`after.draftLost`). A draft goes when an answer
 * brings this side or the score changed. A finished post-match reads the coach's teams again: the roster has its
 * fallen and its new players. An answer that comes after the coach left draws nothing, but the games (and the teams,
 * once finished) are read all the same; so are they after a lost answer then, which may hide a write that landed.
 *
 * The footer's button keeps its place (`data-key="prep-cta"`): «Confirm the summary» turns into «Finish the match» on
 * the same node once the opponent has confirmed. So the footer's action is armed only `FOOTER_ARM_MS` after it appears
 * (visit-common.mjs, as the preparation's) — on the first draw too, and whenever the page gives it the focus —: the
 * second click of a double click finishes nothing, an Enter held down presses it once (post-wire.mjs). A draw that
 * takes the focused control away gives the focus to the footer's button, else to the title, never to the page's body.
 *
 * What it polls (visit-common.mjs's poll, as the preparation's): the post-match every six seconds while the tab is
 * seen, no write or read is on its way and no sheet or dialog is open; another revision is drawn — over a draft kept
 * only when it leaves this side and the score as they were, so the draft still stands on it (a treasury waiting on the
 * opponent's Players opens with its dice kept). A followed side whose records a tap changed is said
 * (`after.tapsChanged`: the domain took the advancements chosen off). A read that fails waits longer each time (up to a
 * minute); a refusal for good (403, 404) and a finished post-match stop the poll. Leaving stops the poll, takes the
 * listeners off and closes the sheets. A post-match that cannot be read is said with a way to read it again; arriving
 * from another screen's frame (the preparation's), the reading is said.
 */
import { toast } from "../../components/toast.mjs";
import { patchWithModal } from "../../components/dialog.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { API_ERROR, errorText } from "../../core/api.mjs";
import { delegate, escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { invalidateGames } from "../../data/games.mjs";
import { savePostMatch } from "../../data/post-match-client.mjs";
import { loadMyTeams } from "../../data/teams.mjs";
import { sameValues, sideFollowsEvents } from "../../domain/post-match/events.mjs";
import { PLAYERS_STAGE } from "../../domain/post-match/rules.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { icon } from "../../ui/icons.mjs";
import { renderLogin } from "../auth/login.mjs";
import { isPhone } from "../team/roster/screen.mjs";
import { ADVANCE_SHEET } from "../team/roster/sheets.mjs";
import { placeholderBack } from "./game-model.mjs";
import { prepFrameMarkup } from "./prep-frame.mjs";
import { financeDraft, financeStep, nextDraft, nextStep } from "./post-money.mjs";
import { postModel } from "./post-model.mjs";
import { PLAYERS_SHEET, changePlayers, playerSheetMarkup, playersDraft, playersSendable, playersStep } from "./post-players.mjs";
import { postAdvanceMarkup } from "./post-advance.mjs";
import { completedMarkup, reviewStep } from "./post-review.mjs";
import { HIRE_SHEET, SELL_SHEET, hireSheetMarkup, rosterStep, sellSheetMarkup } from "./post-roster.mjs";
import { fansDraft, fansStep, opponentLeadMarkup, resultAction, resultDraft, resultStep } from "./post-steps.mjs";
import { wirePost } from "./post-wire.mjs";
import { armFooter, focusGone, startPoll, takeFooter } from "./visit-common.mjs";

/** The drafts a step keeps on the page, by the step that sends them. */
const DRAFTS = Object.freeze({ result: resultDraft, fans: fansDraft, finance: financeDraft, next: nextDraft });

/** Whose frame it is (`data-screen`): the post-match keeps only its own while a step is read. */
const SCREEN = "post-match";

/** A sheet's dialog id by its kind. */
const SHEETS = Object.freeze({ player: PLAYERS_SHEET, hire: HIRE_SHEET, sell: SELL_SHEET });

/** What the Players step saves of a side: the draft compares with these. */
const playersValues = (side) => [side.statistics, side.injuries, side.mvps, side.departures];

/** An answer that never came: the write may have landed all the same. */
const lostAnswer = (error) => error?.kind === API_ERROR.OFFLINE || error?.kind === API_ERROR.TIMEOUT;

/**
 * A refusal after which the post-match is read again: any 409 (as 2.x), a 422 at the finish (a roll the finish refuses,
 * pre-flight L9), or an answer that never came.
 */
const readsAgain = (error, finish) => error?.status === 409 || (finish && error?.status === 422) || lostAnswer(error);

/** Whether the post-match `next` finished what `payload` had not. */
const finishes = (payload, next) => payload?.postMatch.status !== "completed" && next.postMatch.status === "completed";

/**
 * One visit of the page: the game, the step the address names, the post-match last read and the side shown; what the
 * page keeps (`ui`: a write on its way, the refusal said, the drafts, the other players shown, the sheet open and what
 * opened it, the score unlocked to change; `here` with the visit's, for the advancement's sheet, whose answers it asks
 * — pre-flight L3), the way to stop its poll (`startPoll` keeps the poll's state), the footer's arming.
 */
function createVisit(gameId, step) {
  return { gameId, step, path: `/api/games/${encodeURIComponent(gameId)}`, here: true, payload: null, sideName: "home", writes: 0, release: () => {},
    ui: { busy: false, error: "", drafts: { result: null, fans: null, players: null, finance: null, next: null }, playersWaiting: false,
      open: false, sheet: null, opener: null, unlocked: false, here: true },
    stopPoll: () => {}, footerAction: "", footerAfter: 0 };
}

/** What the post-match says to the side shown. */
function modelOf(visit) {
  return postModel(visit.payload, visit.sideName, visit.step, { data: state.data, userId: state.auth.currentUser?.id ?? "", error: visit.ui.error });
}

/** The Players step's draft as the page holds it: the one kept, else the side's own. */
const playersOf = (visit, model = modelOf(visit)) => visit.ui.drafts.players ?? playersDraft(model.post[visit.sideName]);

/** A step's draft (`result`, `fans`, `finance`, `next`) as the page holds it: the one kept, else as the post-match has it. */
const draftOf = (visit, key, model = modelOf(visit)) => visit.ui.drafts[key] ?? DRAFTS[key](model);

/**
 * A step's draft after a press, drawn: kept, or dropped when it is the post-match's own again. The score's draft is
 * what it writes (`resultAction`: a winner left from «Technical» is none once the match is «Played» again), and says
 * whether it changed the score sent (`changed`: «Send your score» rather than «Confirm»).
 */
function keepDraft(visit, key, next) {
  const model = modelOf(visit), fresh = DRAFTS[key](model);
  const same = key === "result" ? sameValues(resultAction(model, next), resultAction(model, fresh)) : sameValues(next, fresh);
  visit.ui.drafts[key] = same ? null : key === "result" ? { ...next, changed: true } : next;
  draw(visit);
}

/** The step on screen: its cards, its column, its footer (and a desk card's title). */
function stepOf(visit, model, phone) {
  const step = {
    result: () => resultStep(model, { ...draftOf(visit, "result", model), unlocked: visit.ui.unlocked }),
    fans: () => fansStep(model, draftOf(visit, "fans", model)),
    players: () => playersStep(model, playersOf(visit, model), { phone, open: visit.ui.open }),
    roster: () => rosterStep(model),
    finance: () => financeStep(model, draftOf(visit, "finance", model)),
    next: () => nextStep(model, draftOf(visit, "next", model)),
  }[model.step];
  return step ? step() : reviewStep(model);
}

/**
 * The sheet open over the step, if it still belongs there: its markup and its dialog's id. The advancement's is the
 * roster's (post-advance.mjs), over the Players step, while it stands.
 */
function sheetOf(visit, model, phone) {
  const { sheet } = visit.ui;
  if (sheet?.kind === "advance") {
    const html = model.step === "players" ? postAdvanceMarkup(visit) : "";
    return html ? { html, id: ADVANCE_SHEET } : null;
  }
  if (!sheet || sheet.step !== model.step) return null;
  const html = sheet.kind === "player" ? playerSheetMarkup(model, playersOf(visit, model), sheet.playerId, { phone })
    : sheet.kind === "hire" ? hireSheetMarkup(model) : sheet.kind === "sell" ? sellSheetMarkup(model) : "";
  return html ? { html, id: SHEETS[sheet.kind] } : null;
}

/**
 * What is said under the head (decision 2, «How each write goes»): a finished post-match with the way to the matches
 * and the roster; a team changed since it began, with «Start over with the current roster»; a passed step with «Change
 * from «Income»…». A write's refusal is the frame's own alert (`model.error`, pre-flight L31).
 */
function noticesOf(model) {
  if (model.completed) return completedMarkup(model);
  const notes = [];
  if (model.rosterChanged) {
    notes.push(renderCallout({ tone: "warn", title: t("after.rosterChanged"), actionHtml: renderButton({ label: t("after.reset"), dialog: true, data: { prepAction: "reset-side" } }) }));
  }
  if (model.passed && model.stepIndex > 0 && model.agreed) {
    notes.push(renderCallout({ title: t("after.passed"), actionHtml: renderButton({ label: t("after.reopen"), dialog: true, data: { prepAction: "reopen" } }) }));
  }
  return notes.join("");
}

/** The page as the visit stands, in the form of the width, with the sheet open over it. */
function screenOf(visit, model = modelOf(visit)) {
  const phone = isPhone();
  const step = stepOf(visit, model, phone);
  const framed = { ...model, footer: step.footer };
  const sheet = sheetOf(visit, model, phone);
  const html = prepFrameMarkup(framed, { phone, screen: SCREEN, contentHtml: step.contentHtml, asideHtml: step.asideHtml, cardTitle: step.cardTitle ?? "",
    opponentHtml: "", actionLeadHtml: phone ? "" : opponentLeadMarkup(model), noticesHtml: noticesOf(model) });
  return { markup: `${html}${sheet?.html ?? ""}`, modal: sheet ? `#${sheet.id}` : "", footer: step.footer, sheet };
}

/** What the footer's button does when pressed: its action, "" for none (a link on, a closed button, no footer). */
const footerAction = (footer) => (footer.disabled || footer.kind === "none" ? "" : footer.action ?? "");

/**
 * Draw the page again over what is there: the focus stays where the coach put it, a sheet open stays open. A footer's
 * action that appears is armed `FOOTER_ARM_MS` later. A focus the page held that the draw left on nothing goes to the
 * footer's button, armed again then, else to the title — but for another form of the width, whose title takes it
 * (`drawKeepingFocus`, `refocus: false`). With a sheet open it stays in the sheet: a stepper's «−» closed at its floor
 * gives it to the same stepper's «+», else to the sheet's close. A finished post-match stops the poll.
 */
function draw(visit, { refocus = true } = {}) {
  if (!visit.here || !visit.payload) return;
  const page = view.ownerDocument ?? globalThis.document;
  const held = view.contains(page.activeElement);
  const cell = page.activeElement?.closest?.("[data-action-key]")?.getAttribute("data-action-key") ?? "";
  const screen = screenOf(visit);
  if (!screen.sheet) Object.assign(visit.ui, { sheet: null, opener: null });
  takeFooter(visit, footerAction(screen.footer));
  patchWithModal(view, screen.markup, screen.modal);
  // A finished post-match changes no more: its poll stops for good.
  if (visit.payload.postMatch.status === "completed") visit.stopPoll();
  if (!refocus || !held || !focusGone(page.activeElement)) return;
  if (screen.sheet) {
    const sheet = view.querySelector(screen.modal);
    const plus = cell ? sheet?.querySelector(`[data-action-key="${cell}"] [data-action-step="1"]`) : null;
    (plus ?? sheet?.querySelector("[data-sheet-close]"))?.focus();
    return;
  }
  for (const target of [".g-prep__cta", "h1"]) {
    if (!focusGone(page.activeElement)) return;
    const next = view.querySelector(target);
    next?.focus();
    if (next && page.activeElement === next && target === ".g-prep__cta") armFooter(visit);
  }
}

/** The Players draft dropped (a refusal, a step closed under it): the coach is told when it held what the page now does not show. */
function dropPlayers(visit) {
  const { ui } = visit, draft = ui.drafts.players;
  ui.drafts.players = null;
  ui.playersWaiting = false;
  if (draft && visit.payload && !sameValues(draft, playersDraft(visit.payload.postMatch[visit.sideName]))) toast(t("after.draftLost"));
}

/**
 * The post-match `next` replaces the one drawn. The step's drafts go when this side or the score changed (a draft
 * stands on what it was drawn from); the Players draft when what that step saves changed under it, or the side left
 * that step (`lock-players`, `reopen`, `reset-side`: nothing the domain would take any more) — said when it held what
 * was not sent; not while its own write is out (`keepPlayers`: `sendPlayers` or the refusal weighs it). Says whether
 * the post-match has just finished, and whether a tap changed a side that follows the records.
 */
function take(visit, next, { keepPlayers = false } = {}) {
  const was = visit.payload?.postMatch, now = next.postMatch, name = visit.sideName, { ui } = visit;
  const finished = finishes(visit.payload, next);
  visit.payload = next;
  if (!was) return { finished: false, tapped: false };
  if (!sameValues(was[name], now[name]) || !sameValues(was.result, now.result)) {
    Object.assign(ui.drafts, { result: null, fans: null, finance: null, next: null });
    ui.unlocked = false;
  }
  if (!keepPlayers && (now[name].stage !== PLAYERS_STAGE || !sameValues(playersValues(was[name]), playersValues(now[name])))) dropPlayers(visit);
  return { finished,
    tapped: sideFollowsEvents(was[name]) && !sameValues([was[name].statistics, was[name].injuries], [now[name].statistics, now[name].injuries]) };
}

/**
 * After an answer or a read: the games once a write landed or the match finished, the coach's teams once it finished —
 * also for a coach gone by then (as 09a), whose page draws nothing.
 */
function settle(visit, { finished }, { answered = false } = {}) {
  if (answered || finished) void invalidateGames();
  if (finished) void loadMyTeams(true);
}

/** Read the post-match again after a refusal or a lost answer; a read that fails too keeps what was there. */
async function readAgain(visit, { keepPlayers = false } = {}) {
  try {
    const next = await apiRequest(`${visit.path}/post-match`);
    settle(visit, visit.here ? take(visit, next, { keepPlayers }) : { finished: finishes(visit.payload, next) });
  } catch {
    // What is drawn stays; the poll reads again.
  }
}

/**
 * One write of the visit on the revision last read (`savePostMatch`): none while another is on its way. Its answer is
 * the post-match; a refusal is said, and the post-match is read again when another device or a lost answer may have
 * moved it. Nothing is sent again by itself. Draws nothing: the caller does, once.
 * @returns {Promise<false|"answered"|"refused">} not sent, or how it ended
 */
async function request(visit, action, { finish = false, keepPlayers = false } = {}) {
  const { ui } = visit;
  if (!visit.here || ui.busy || !visit.payload) return false;
  ui.busy = true;
  visit.writes += 1;
  ui.error = "";
  try {
    const next = await savePostMatch(apiRequest, visit.payload, visit.sideName, action, finish);
    settle(visit, visit.here ? take(visit, next, { keepPlayers }) : { finished: finishes(visit.payload, next) }, { answered: true });
    return "answered";
  } catch (error) {
    if (!visit.here) {
      // Gone: nothing is said, but a lost answer may hide a write that landed (a finish too).
      if (lostAnswer(error)) settle(visit, { finished: finish }, { answered: true });
      return "refused";
    }
    ui.error = errorText(error);
    if (readsAgain(error, finish)) await readAgain(visit, { keepPlayers });
    if (keepPlayers) dropPlayers(visit);
    return "refused";
  } finally {
    ui.busy = false;
  }
}

/**
 * The Players step's draft, written (`statistics`, the whole side as the domain saves it). One write per press: a press
 * while a write is on its way waits, and once it has landed the latest draft goes out once more — unless the answer
 * already holds it. A draft that cannot be written yet (a Lasting Injury without its characteristic) waits for the
 * press that completes it. The page is drawn once nothing follows.
 */
async function sendPlayers(visit) {
  const { ui } = visit;
  while (visit.here && ui.playersWaiting && !ui.busy) {
    ui.playersWaiting = false;
    const draft = ui.drafts.players;
    if (!draft || !playersSendable(draft)) break;
    const ended = await request(visit, { type: "statistics", ...draft }, { keepPlayers: true });
    if (ended !== "answered") break;
    if (!ui.playersWaiting || sameValues(ui.drafts.players, playersDraft(visit.payload.postMatch[visit.sideName]))) {
      ui.drafts.players = null;
      ui.playersWaiting = false;
    }
  }
  draw(visit);
}

/** A press of the Players step (`changePlayers`): the draft changed and drawn, then written — or kept for the write after the one on its way. */
function pressPlayers(visit, change) {
  const model = modelOf(visit);
  if (model.readonly || model.step !== "players") return;
  visit.ui.drafts.players = changePlayers(model, playersOf(visit, model), change);
  visit.ui.playersWaiting = true;
  draw(visit);
  void sendPlayers(visit);
}

/**
 * One write (`PATCH …/post-match`, or the finish), and the page drawn from what came back; a Players press that waited
 * goes out after it.
 * @returns {Promise<boolean>} whether it was answered
 */
async function send(visit, action, { finish = false } = {}) {
  const ended = await request(visit, action, { finish });
  if (!ended) return false;
  draw(visit);
  if (visit.ui.playersWaiting) void sendPlayers(visit);
  return ended === "answered";
}

/** Whether a sheet or a dialog is open: what the coach is doing there is not to be drawn over. */
const dialogOpen = () => Boolean(globalThis.document?.querySelector?.("dialog[open]"));

/** Whether the poll may read now: the page is seen, nothing is on its way, no sheet or dialog is open. */
const mayPoll = (visit) => visit.here && !visit.ui.busy && !globalThis.document?.hidden && !dialogOpen();

/**
 * Whether a read may be drawn over the drafts kept: none is kept, or they still stand on it — this side and the score
 * as they were (`take` keeps them then). So a step waiting on the opponent opens while the coach's dice are kept.
 */
function standsOn(visit, next) {
  const was = visit.payload.postMatch, now = next.postMatch, name = visit.sideName;
  return Object.values(visit.ui.drafts).every((draft) => draft === null) || (sameValues(was[name], now[name]) && sameValues(was.result, now.result));
}

/**
 * The post-match read again by the poll (`startPoll`, which waits out the reads that failed and stops on a refusal for
 * good): another revision is drawn, unless a write went out, a sheet or a dialog opened since it was asked for, or it
 * would take a draft kept away. A tap that changed a side following the records is said.
 */
async function pollRead(visit) {
  const writes = visit.writes;
  const next = await apiRequest(`${visit.path}/post-match`);
  if (visit.here && !visit.ui.busy && visit.writes === writes && !dialogOpen() && next.postMatch.revision !== visit.payload.postMatch.revision && standsOn(visit, next)) {
    const taken = take(visit, next);
    if (taken.tapped) toast(t("after.tapsChanged"));
    settle(visit, taken);
    draw(visit);
  }
}

/** The page while there is no post-match to draw: «‹» back to the matches (`placeholderBack`), the title, and what is said under it. */
function placeholderMarkup(gameId, noticeHtml) {
  const phone = isPhone();
  const href = placeholderBack(gameId, { viewer: state.auth.currentUser, activeTeamId: state.activeTeamId ?? null, games: state.games.items });
  const back = `<a class="g-prep__back" href="${escapeHtml(href)}" aria-label="${escapeHtml(t("prep.back"))}">${icon("back", 18)}</a>`;
  const title = `<span class="g-prep__titles"><h1 class="g-prep__title" tabindex="-1">${escapeHtml(t("after.title"))}</h1></span>`;
  const head = phone ? `<header class="g-prep__head"><div class="g-prep__bar">${back}${title}</div></header>` : `<header class="g-prep__band">${back}${title}</header>`;
  return `<div class="g-prep g-prep--${phone ? "phone" : "desk"}" data-screen="${SCREEN}">${head}<div class="g-prep__notices">${noticeHtml}</div></div>`;
}

/** What is said while the post-match is read. */
const loadingMarkup = () => `<p class="g-prep__note" role="status">${escapeHtml(t("after.loading"))}</p>`;

/** What is said when the post-match cannot be read: the server's words, and a way to read it again. */
function unreadMarkup(error) {
  const retry = `<button type="button" class="g-prep__quiet" data-after-retry="">${escapeHtml(t("after.retry"))}</button>`;
  return `<div class="g-prep__alert" role="alert">${renderCallout({ tone: "danger", title: t("after.unread", { reason: errorText(error) }), actionHtml: retry })}</div>`;
}

/** The read failed: said, the title in the focus, «Read again» reading it once more. */
function unread(visit, error) {
  view.innerHTML = placeholderMarkup(visit.gameId, unreadMarkup(error));
  view.querySelector("h1")?.focus();
  visit.release = delegate(view, "click", "[data-after-retry]", () => {
    visit.release();
    visit.release = () => {};
    view.innerHTML = placeholderMarkup(visit.gameId, loadingMarkup());
    view.querySelector("h1")?.focus();
    void openVisit(visit);
  });
}

/**
 * Read the post-match and draw it, the title taking the focus and the footer's action armed; then listen and poll (not
 * a finished one: it changes no more). One that cannot be read says why. A coach gone by then is drawn nothing.
 */
async function openVisit(visit) {
  // A step link keeps the frame drawn while its step is read (no flash between steps); another screen's (the
  // preparation's, the same class) gives way to the loading status.
  if (!view.querySelector(`.g-prep[data-screen="${SCREEN}"]`)) view.innerHTML = placeholderMarkup(visit.gameId, loadingMarkup());
  let payload;
  try {
    payload = await apiRequest(`${visit.path}/post-match`);
  } catch (error) {
    if (visit.here) unread(visit, error);
    return;
  }
  if (!visit.here) return;
  visit.payload = payload;
  visit.sideName = payload.viewerSide === "away" ? "away" : "home";
  const screen = screenOf(visit);
  takeFooter(visit, footerAction(screen.footer));
  view.innerHTML = screen.markup;
  view.querySelector("h1")?.focus();
  visit.release = wirePost(visit, { model: () => modelOf(visit), draw: (options) => draw(visit, options), send: (action, options) => send(visit, action, options),
    players: (change) => pressPlayers(visit, change), keep: (key, draft) => keepDraft(visit, key, draft),
    playersOf: (model) => playersOf(visit, model), draftOf: (key, model) => draftOf(visit, key, model), readAgain: () => readAgain(visit) });
  if (payload.postMatch.status !== "completed") visit.stopPoll = startPoll(visit, { read: pollRead, mayPoll });
}

/**
 * The post-match of game `gameId` at the step the address names (the current one for "" or a step not reached yet). A
 * guest gets the sign-in (the router sends one there first: the address is a coach's).
 * @param {string} gameId
 * @param {string} [requestedStep]
 */
export async function renderPostMatch(gameId, requestedStep = "") {
  if (!state.auth.currentUser) {
    renderLogin("login");
    return;
  }
  const visit = createVisit(gameId, requestedStep);
  onScreenLeave("post-match", () => {
    visit.here = false;
    visit.ui.here = false;
    visit.stopPoll();
    visit.release();
    for (const dialog of view.querySelectorAll("dialog")) if (dialog.open) dialog.close();
  });
  await openVisit(visit);
}
