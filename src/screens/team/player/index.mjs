/**
 * The player's own address (`#/t/:id/roster/:playerId`). A player of the roster still gets the 2.x editor until stage
 * 07d moves his profile here; a fallen player of the team gets his profile (spec UI §9, PlayerDead): how and when he
 * fell, the cause, and for a death a coach marked, «Undo the mark», asked first. An id that is neither is the 2.x
 * editor's, as it was.
 *
 * Whose the id is, the coach's list says first (the route opens only on one of his teams, and the list holds its
 * roster): a player of the roster goes to the editor at once, and the fallen are not read. Else the team's fallen are
 * read, the games beside them. The page stands under the team's head (the player's own head is stage 07d's), and its
 * one visible `h1` is his name.
 *
 * The undo is the roster's own (marks.mjs, Task 9), lent this page instead of the roster: the same sheet, one DELETE
 * per press, never in a match, never while a write of the fallen is on its way, its answer the list's — and the
 * queue's, when it holds the team — whatever became of the sheet (K8), and only for the coach who sent it; a lost one
 * is never sent again, but the fallen and the coach's list are read back and the coach told what they say. Only the
 * roster's screen sends or settles the steps of its queue, so while one waits the undo here would wait for ever: the
 * page says so and leads there (K14). Once he is back the page says so, with the way back to the roster.
 */
import { delegate, drawScreen, escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { teamUrl } from "../../../core/routes.mjs";
import { onScreenLeave } from "../../../core/screen-lifecycle.mjs";
import { state } from "../../../core/state.mjs";
import { view } from "../../../core/view.mjs";
import { patchWithModal } from "../../../components/dialog.mjs";
import { announce } from "../../../components/live-region.mjs";
import { toast } from "../../../components/toast.mjs";
import { loadGames, onGamesChange } from "../../../data/games.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { loadMyTeams, raceTeamOf, raceTitleOf } from "../../../data/teams.mjs";
import { storedPlayerId } from "../../../domain/roster/players.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderCallout } from "../../../ui/callout.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderPageHead } from "../../../ui/page-head.mjs";
import { wireSheets } from "../../../ui/sheet.mjs";
import { wireSkillChips } from "../../../ui/skill-chip.mjs";
import { renderSavedRoster } from "../../saved-roster.mjs";
import { fallenWriting, readFallen } from "../roster/fallen.mjs";
import { fallenProfileMarkup, undoMarkup, undoSheetMarkup } from "../roster/fallen-view.mjs";
import { closeSheet, sheetOf } from "../roster/injury.mjs";
import { markHandlers, markSheetOf } from "../roster/marks.mjs";
import { fallenLines, rosterLines, rosterMode, undoable } from "../roster/model.mjs";
import { markClosed } from "../roster/panel.mjs";
import { onSaveState, saveState, takeAnswerTeam } from "../roster/save.mjs";
import { sheetIdOf, skillSheetMarkup } from "../roster/sheets.mjs";

/**
 * One visit of the page: a new object for every visit, so an answer that comes after the coach left finds its own
 * visit closed.
 * @typedef {object} Visit
 * @property {boolean} here
 * @property {boolean} drawn the page is on the view: later draws patch it
 * @property {boolean} titled his profile has been drawn, and his name has taken the focus
 * @property {boolean} loading the page's read is awaited (the first, or one after a failure)
 * @property {string} error the failure that read brought
 * @property {object[]} fallen the team's fallen as last read (GET …/fallen's records)
 * @property {string} name his name as his profile last drew it: the page keeps it once his record is gone
 * @property {boolean} back the server said he is back on the roster
 * @property {object|null} sheet the sheet that is open: a skill's `{kind, key, name}`, the undo's `{kind, key, busy, refusal}` (marks.mjs)
 * @property {Element|null} opener what opened it
 * @property {number} reads the number of the last read sent
 * @property {number} answered the number of the last read answered: less than `reads` while one is in the air
 */

/**
 * The page's side of the undo, which marks.mjs takes as the roster's `Saving`.
 * @typedef {{teamId: string, playerId: string, visit: Visit, draw: () => void}} Page
 */

/** The team as the coach's list holds it, or null. */
const teamOf = (teamId) => state.myTeams.items.find((item) => item.id === teamId) ?? null;

/** A player of the team's roster, as the coach's list holds it, carries this stored id. */
function onRoster(team, playerId) {
  const players = Array.isArray(team?.roster?.players) ? team.roster.players : [];
  return players.some((player) => storedPlayerId(player) === playerId);
}

/** What the roster is for just now, by the games as last read (`rosterMode`): a match on closes the undo (R8). */
const modeOf = (teamId) => rosterMode(state.games.loaded ? state.games.items ?? [] : [], teamId);

/**
 * The roster's queue has something of the coach's to send or settle (K14): a step that waits or is on its way, another
 * device's save, a refusal (a 422 waits for the server's roster). An undo now would move the revision under it (K6),
 * and only the roster's screen sends or settles it.
 */
const QUEUE_BUSY = [SAVE_STATUS.SAVING, SAVE_STATUS.DIRTY, SAVE_STATUS.CONFLICT, SAVE_STATUS.ERROR];
const rosterWaits = (save) => save.waiting > 0 || QUEUE_BUSY.includes(save.status);

/**
 * Why no undo can be sent just now, the roster's queue aside, "" when none: the games unread or unreadable, a read of
 * the page in the air, a write of the fallen on its way.
 */
function heldBy(teamId, visit) {
  if (!state.games.loaded || state.games.loading) return t("teamRoster.gamesLoading");
  if (state.games.error) return state.games.error;
  if (visit.answered !== visit.reads) return t("teamRoster.fallen.loading");
  return fallenWriting(teamId) ? t("teamRoster.mark.writing") : "";
}

/**
 * The page as it stands, as marks.mjs reads it at a press (`now`) and the markup draws it: the mode, the lock and the
 * queue — `waits` where the roster's edits alone close the undo (K14) — the roster's lines as the coach's list holds
 * it, the fallen it does not hold, and his line among them: the first record with his id, the newest.
 * @param {Page} page
 */
function nowOf({ teamId, playerId, visit }) {
  const team = teamOf(teamId);
  const race = team ? raceTeamOf(team.baseTeamSlug) : null;
  const lines = race ? rosterLines({ draft: normalizeDraft(team.roster ?? {}), race }) : [];
  const fallen = fallenLines({ fallen: visit.fallen, race, rosterIds: lines.map(({ id }) => id) });
  const save = saveState(teamId);
  const held = heldBy(teamId, visit);
  const waits = !held && rosterWaits(save);
  return {
    mode: modeOf(teamId), save, lock: held || (waits ? t("teamRoster.fallen.waitRoster") : ""), waits, team, lines, fallen,
    line: fallen.find((item) => item.id === playerId) ?? null,
  };
}

/** A name to head the page with: a record may hold none. */
const nameOf = (line) => String(line.name ?? "").trim() || t("teamRoster.fallen.status");

/** The way back to the roster in a banner: one line, a thumb tall, in the banner's own ink. */
const rosterLinkMarkup = (teamId) => `<a class="g-fallen-page__link" href="${escapeHtml(teamUrl(teamId, "roster"))}">${escapeHtml(t("teamRoster.fallen.toRoster"))}</a>`;

/**
 * His profile: the head — his grey number, his name, «<position> · <race> · fallen» — then, while the roster's own
 * edits close the undo, that they do and the way to them (K14), and the profile's body (fallen-view.mjs), its undo
 * closed while none can be sent, saying why.
 */
function profileMarkup(now, teamId) {
  const { line, team, mode } = now;
  const who = t("teamRoster.fallen.who", { position: line.position, race: raceTitleOf(team.baseTeamSlug) });
  const badge = renderPlayerBadge({ number: line.number, kind: line.kind, fallen: true, large: true });
  const reason = undoable(line) ? markClosed(line, now, { direct: true }) : "";
  const waits = now.waits && undoable(line) && mode.kind !== "match";
  const notice = waits ? renderCallout({ tone: "warn", title: t("teamRoster.fallen.waitRoster"), actionHtml: rosterLinkMarkup(teamId) }) : "";
  return `${renderPageHead({ title: nameOf(line), sub: who, metaHtml: badge, phone: true })}`
    + `<div class="g-fallen-page__body">${notice}${fallenProfileMarkup(line, { undoHtml: undoMarkup(line, reason) })}</div>`;
}

/**
 * His record gone from the fallen while the page was open: he is back on the roster (an undo landed, here or on another
 * device), or nowhere the page can find him. Either way the page keeps his name and leads back to the roster.
 */
function goneMarkup(now, { teamId, playerId, visit }) {
  const back = visit.back || now.lines.some((line) => line.id === playerId);
  const callout = back
    ? renderCallout({ title: t("teamRoster.fallen.back", { name: visit.name }), actionHtml: rosterLinkMarkup(teamId) })
    : renderCallout({ tone: "danger", title: t("error.FALLEN_NOT_FOUND"), actionHtml: rosterLinkMarkup(teamId) });
  return `${visit.name ? renderPageHead({ title: visit.name, phone: true }) : ""}<div class="g-fallen-page__body">${callout}</div>`;
}

/** The sheet that is open, while his line is on the page: a skill's rule, or the undo (`screenOf` closes one that no longer stands). */
function sheetMarkup({ sheet, line, mode }) {
  if (!sheet || !line) return "";
  if (sheet.kind === "undo") return undoSheetMarkup({ line, mode, busy: sheet.busy, refusal: sheet.refusal, reason: sheet.reason });
  return skillSheetMarkup({ data: state.data, line, name: sheet.name });
}

/**
 * The page as it stands, its sheet among it: the undo's while his death is one the page undoes (marks.mjs's
 * `markSheetOf`, open in a match too, saying why), a skill's while his line is there. His name is kept for the page
 * that stays once his record is gone.
 * @param {Page} page
 */
function screenOf(page) {
  const { visit } = page;
  const now = nowOf(page);
  const lines = now.line ? [now.line] : [];
  const sheet = (visit.sheet?.kind === "undo" ? markSheetOf : sheetOf)(visit, lines, now);
  if (!sheet) Object.assign(visit, { sheet: null, opener: null });
  if (now.line) visit.name = nameOf(now.line);
  return { ...now, sheet };
}

/**
 * The page: the wait, a read that failed with «Try again», his profile, or what stands once his record is gone; the
 * sheet over it.
 * @param {Page} page
 */
function playerMarkup(page) {
  const { visit } = page;
  const now = screenOf(page);
  let body;
  if (visit.loading) body = `<p class="g-roster__loading" role="status">${escapeHtml(t("teamRoster.fallen.loading"))}</p>`;
  else if (visit.error) {
    const actionHtml = renderButton({ label: t("teamRoster.readAgain"), data: { playerRetry: true } });
    body = `<div class="g-roster__failed" role="alert">${renderCallout({ tone: "danger", title: visit.error, actionHtml })}</div>`;
  } else body = now.line ? profileMarkup(now, page.teamId) : goneMarkup(now, page);
  return `<div class="g-fallen-page" data-screen="team-player">${body}${sheetMarkup(now)}</div>`;
}

/**
 * The page drawn: the first time whole, later as a patch, a sheet that is open kept open. His name takes the focus the
 * first time his profile is drawn; a redraw that took the focus from the page gives it to the way back to the roster,
 * where there is one, else to the name — never to the page's body.
 * @param {Page} page
 */
function drawPage(page) {
  const { visit } = page;
  if (!visit.here) return;
  const before = document.activeElement;
  const inside = Boolean(before && before !== document.body && view.contains(before));
  const markup = playerMarkup(page);
  if (visit.drawn) patchWithModal(view, markup, visit.sheet ? `#${sheetIdOf(visit.sheet.kind)}` : "");
  else {
    visit.drawn = true;
    drawScreen(view, markup);
  }
  const title = view.querySelector("h1");
  if (visit.name && !visit.titled) {
    visit.titled = true;
    title?.focus();
    return;
  }
  const active = document.activeElement;
  if (inside && (!active || active === document.body || !active.isConnected)) (view.querySelector(".g-fallen-page__link") ?? title)?.focus();
}

/**
 * The page's read: the team's fallen, the games beside them (until they answer, the undo waits for them). Taken only
 * while the visit is here and it is its last read.
 * @param {Page} page
 * @returns {Promise<{games: Promise<void>}|null>} the games' read, still in the air maybe; null when there is nothing to take
 */
async function readPlayer({ teamId, visit }) {
  const ticket = ++visit.reads;
  const games = loadGames(true);
  const dead = await readFallen(teamId);
  if (!visit.here || ticket !== visit.reads) return null;
  Object.assign(visit, { answered: ticket, loading: false, error: dead.error ?? "", fallen: dead.fallen ?? visit.fallen });
  return { games };
}

/**
 * The page after its read: his profile, or the failure with «Try again». An id the fallen do not hold either, before
 * his profile was ever drawn, is the 2.x editor's, as it was — the page's listeners taken off first (`leave`).
 * Settles once the games have answered too.
 * @param {Page} page @param {() => void} leave
 */
async function showPlayer(page, leave) {
  const read = await readPlayer(page);
  if (!read) return undefined;
  if (!page.visit.error && !page.visit.name && !nowOf(page).line) {
    leave();
    return renderSavedRoster(page.teamId);
  }
  page.draw();
  return read.games;
}

/**
 * The fallen and the coach's list read again, after an undo whose answer did not settle it (marks.mjs's `readBack`,
 * a 404): the list holds the roster the page reads him on. Taken only both together, while the visit is here and it
 * is its last read; the undo waits meanwhile. A read that fails says why.
 * @param {Page} page
 * @returns {Promise<boolean>} whether the read was taken
 */
async function readAgain(page) {
  const { teamId, visit } = page;
  const ticket = ++visit.reads;
  page.draw();
  const [dead] = await Promise.all([readFallen(teamId), loadMyTeams(true)]);
  if (!visit.here || ticket !== visit.reads) return false;
  visit.answered = ticket;
  const error = dead.error ?? state.myTeams.error;
  if (error) toast(error, { tone: "error" });
  else visit.fallen = dead.fallen;
  page.draw();
  return !error;
}

/**
 * What the page lends the roster's undo (marks.mjs's `Lent`): the page as it stands; an answer taken (K8) — the list's,
 * and the queue's when it holds the team and nothing of the coach's waits (`takeAnswerTeam`), whatever became of the
 * visit, drawn while it is here; the read again; and, once he is back, the page's own words for it. No `reload`: only
 * a death's conflict asks for one, and the page marks no death.
 * @param {Page} page
 */
function lentOf(page) {
  const { visit } = page;
  return {
    now: () => nowOf(page),
    // A press refused while the roster's queue waits retakes nothing here: its steps are the roster's to send (K14).
    refused: () => {},
    hold: ({ team, fallen }) => {
      takeAnswerTeam(team);
      if (!visit.here) return;
      visit.fallen = fallen;
      page.draw();
    },
    readAgain: () => readAgain(page),
    // The page says it and a screen reader hears it; the focus, where the redraw took it from the page (the sheet that
    // sent it, the undo it stood on), goes to the way back to the roster (`drawPage`).
    back: (line) => {
      visit.back = true;
      page.draw();
      announce(t("teamRoster.fallen.back", { name: nameOf(line) }));
    },
  };
}

/**
 * What the page hears, on the view: «Undo the mark» and its sheet's «Keep» and «Back on the roster» (marks.mjs's, as on
 * the roster), a closed undo saying why, a skill's card opening its rule, a sheet closed, «Try again»; and the games —
 * a match begun closes the undo — and the roster's queue, whose edits do (K14), each drawing the page again.
 * @param {Page} page
 * @param {function(): Promise<void>} retry «Try again»: the page read again
 * @returns {(() => void)[]} what takes each off
 */
function wirePlayer(page, retry) {
  const { teamId, visit, draw } = page;
  const marks = markHandlers(page, lentOf(page));
  return [
    wireSheets(view, {
      onClose: (id) => {
        if (visit.sheet && id === sheetIdOf(visit.sheet.kind)) closeSheet(page);
      },
    }),
    wireSkillChips(view, (name, chip) => {
      const { line } = nowOf(page);
      if (!line) return;
      Object.assign(visit, { sheet: { kind: "skill", key: line.key, name }, opener: chip });
      draw();
    }),
    delegate(view, "click", "[data-roster-undo]", (event, button) => {
      if (button.getAttribute("aria-disabled") !== "true") marks.onUndo(button.getAttribute("data-roster-undo"), button);
    }),
    delegate(view, "click", "[data-roster-closed]", (event, button) => toast(button.getAttribute("title") ?? "")),
    delegate(view, "click", "[data-undo-keep]", () => marks.onUndoKeep()),
    delegate(view, "click", "[data-undo-send]", () => marks.onUndoSend()),
    delegate(view, "click", "[data-player-retry]", () => void retry()),
    onGamesChange(draw),
    onSaveState(teamId, () => {
      // A listener of the queue that throws would leave its request in the air for good (roster-store's notify).
      try {
        draw();
      } catch (error) {
        console.error(error);
      }
    }),
  ];
}

/**
 * The player's own page (decision 19). Drawn at once with the wait, then his profile, its name taking the focus; again
 * when the games change, when the roster's queue moves, and on every press, as a patch.
 * @param {string} teamId
 * @param {string} playerId his stored id, as the address carries it
 * @returns {Promise<void>}
 */
export async function renderTeamPlayer(teamId, playerId) {
  if (onRoster(teamOf(teamId), playerId)) return renderSavedRoster(teamId);
  /** @type {Visit} */
  const visit = {
    here: true, drawn: false, titled: false, loading: true, error: "", fallen: [], name: "", back: false, sheet: null, opener: null, reads: 0, answered: 0,
  };
  /** @type {Page} */
  const page = { teamId, playerId, visit, draw: () => drawPage(page) };
  const offs = [];
  const leave = () => {
    visit.here = false;
    while (offs.length) offs.pop()();
  };
  onScreenLeave("team-player", leave);
  page.draw();
  const retry = () => {
    Object.assign(visit, { loading: true, error: "" });
    page.draw();
    return showPlayer(page, leave);
  };
  offs.push(...wirePlayer(page, retry));
  return showPlayer(page, leave);
}
