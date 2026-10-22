/**
 * `#/games/:id` in 3.0 (stage 13, decision 10; the owner's answer 1): the match, read once, and either a way on or a
 * short page.
 *
 * A side's coach is sent where the match is now (`gameDestination`, game-model.mjs): its preparation, its post-match,
 * the summary of a finished one — `location.replace`, so the address leaves no step in the history. Everyone else, and
 * a side's coach whose match is none of these, reads the match page: the page head («Match», the season and round or
 * «Friendly», the phase's chip) and the match's card (Matches.html's: the teams leading to their pages, the score or
 * «vs», CAS). For the side a score sent before 3.0 waits on, the card offers «Confirm the score» and «Reject» to the
 * side that did not send it, and says who confirms it to the side that did — or, once the round is closed for players,
 * only that. The ways on (the preparation of a match begun, the post-match once opened) are links for anyone.
 *
 * A press sends one request (`POST /api/games/:id/confirm|reject`), however often it is pressed: both buttons say the
 * answer is on its way (`aria-busy`, `aria-disabled`) until the match is read again and drawn. Then the coach's games
 * are read again (the frame's card follows); a rejection says so in a toast and, the match open again, leads to its
 * preparation. A refusal is said in the server's words as an alert; after a 409 the match has changed and is read again
 * (said in a toast instead when the match read sends the coach on).
 * A match that cannot be read is said with the way back to the matches — «Match not found» for one the server does not
 * know, which is what a coach of neither side gets (404). A guest is sent to sign in by the router before this (the
 * address is a signed-in one, core/routes.mjs).
 */
import { toast } from "../../components/toast.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { errorText } from "../../core/api.mjs";
import { delegate, drawKeepingFocus, drawScreen, escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { invalidateGames } from "../../data/games.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { icon } from "../../ui/icons.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderMatchCard } from "../../ui/match-card.mjs";
import { renderPageHead } from "../../ui/page-head.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { renderLogin } from "../auth/login.mjs";
import { gameDestination, gamePageModel, matchesUrl } from "./game-model.mjs";

/** The page's identity (`data-screen`): another screen before it starts the page from the top (`drawScreen`). */
const SCREEN = "game";

/** The head's wrapper: the card is labelled by it — the title, the line and the phase. */
const HEAD_ID = "game-head";

/** The page around `mainHtml`: the head, standing on a phone too (the match is a page of its own), and the column. */
const frameMarkup = ({ sub = "", metaHtml = "" }, mainHtml) => `<div class="g-game" data-screen="${SCREEN}">`
  + `<div class="g-game__head" id="${HEAD_ID}">${renderPageHead({ title: t("gamePage.title"), sub, metaHtml, phone: true })}</div>`
  + `<div class="g-game__main">${mainHtml}</div></div>`;

/** A refusal or a failed read, in the server's words. */
const alertMarkup = (words) => (words ? `<div class="g-game__alert" role="alert">${renderCallout({ tone: "danger", title: words })}</div>` : "");

/** The server's words for a refusal; a match it does not know (a coach of neither side gets that too) is «Match not found». */
const refusalWords = (error) => (error?.code === "GAME_NOT_FOUND" ? t("gamePage.notFound") : errorText(error));

/** «‹ Matches»: the active team's, or the league's page for a coach with no team active. */
function backMarkup() {
  const href = matchesUrl(state.activeTeamId ?? null);
  assertLinkHref(href);
  return `<a class="g-game__back" href="${escapeHtml(href)}">${icon("back", 14)}<span>${escapeHtml(t("gamePage.back"))}</span></a>`;
}

/** What the card says: a technical result's reason; of a score sent, that the round is closed, or who confirms it. */
function noteMarkup(model) {
  if (model.technical) return `<p class="g-game__note">${escapeHtml(model.technical)}</p>`;
  if (model.roundClosed) return `<p class="g-game__note">${escapeHtml(t("gamePage.roundClosed"))}</p>`;
  if (!model.waitingFor) return "";
  return `<p class="g-game__note g-game__note--wait">${escapeHtml(t("gamePage.waiting", { team: model.waitingFor }))}</p>`;
}

/** The card's buttons: the answer to a score sent (both on hold while one is on its way), then the ways on. */
function actionsMarkup(model, busy) {
  const answer = model.confirm
    ? renderButton({ label: t("gamePage.confirm"), kind: "primary", busy, data: { gameAction: "confirm" } })
      + renderButton({ label: t("gamePage.reject"), kind: "danger-quiet", block: true, busy, data: { gameAction: "reject" } })
    : "";
  const links = model.links.length
    ? `<div class="g-game__links">${model.links.map(({ label, href }) => renderButton({ label, href, block: true })).join("")}</div>`
    : "";
  return answer + links;
}

/** The match page as the visit stands. */
function pageMarkup(visit) {
  const model = gamePageModel({ game: visit.game, viewer: state.auth.currentUser });
  const chip = renderStatusChip({ label: t(`gamePage.status.${model.phase}`), tone: model.chipTone });
  const card = renderMatchCard({
    labelledBy: HEAD_ID, meta: { left: model.cas ? t("gamePage.cas", { cas: model.cas }) : "" }, home: model.home, away: model.away,
    score: model.score, bodyHtml: noteMarkup(model), actionsHtml: actionsMarkup(model, Boolean(visit.busy)),
  });
  return frameMarkup({ sub: model.line, metaHtml: chip }, `${alertMarkup(visit.error)}${card}`);
}

/** Draw the page again; a focus the draw took away (a button gone) goes to the title. */
const draw = (visit) => drawKeepingFocus(view, () => drawScreen(view, pageMarkup(visit)), "h1");

/**
 * Read the match, then send a side's coach on or draw the page; the first draw gives the title the focus. A match that
 * cannot be read is said with the way back. A coach gone by then is drawn nothing.
 */
async function openGame(visit, { first = false } = {}) {
  let game;
  try {
    ({ game } = await apiRequest(visit.path));
  } catch (error) {
    if (!visit.here) return;
    visit.busy = "";
    drawScreen(view, frameMarkup({}, `${alertMarkup(refusalWords(error))}${backMarkup()}`));
    view.querySelector("h1")?.focus();
    return;
  }
  if (!visit.here) return;
  const href = gameDestination(game, state.auth.currentUser?.id ?? "");
  if (href) {
    // A refusal whose re-read sends the coach on is said before he goes: the page that would say it is not drawn.
    if (visit.error) toast(visit.error, { tone: "error" });
    location.replace(href);
    return;
  }
  visit.game = game;
  visit.busy = "";
  if (!first) {
    draw(visit);
    return;
  }
  drawScreen(view, pageMarkup(visit));
  view.querySelector("h1")?.focus();
}

/**
 * One answer to the score sent, however often pressed: sent, then the match read again (after a 409 too). The coach's
 * games — the frame's, not the visit's — are read again once the server has answered so (a success or a 409: the match
 * has changed either way), whether or not the page is still on screen.
 */
async function respond(visit, action) {
  if (visit.busy || !visit.game || !["confirm", "reject"].includes(action)) return;
  visit.busy = action;
  visit.error = "";
  draw(visit);
  try {
    await apiRequest(`${visit.path}/${action}`, { method: "POST", body: "{}" });
  } catch (error) {
    if (error?.status === 409) void invalidateGames();
    if (!visit.here) return;
    visit.error = refusalWords(error);
    if (error?.status === 409) {
      await openGame(visit);
      return;
    }
    visit.busy = "";
    draw(visit);
    return;
  }
  void invalidateGames();
  if (!visit.here) return;
  if (action === "reject") toast(t("gamePage.rejected"));
  await openGame(visit);
}

/**
 * The match `gameId`: a side's coach sent where it is, anyone else its page.
 * @param {string} gameId
 */
export async function renderGame(gameId) {
  if (!state.auth.currentUser) {
    renderLogin("login");
    return;
  }
  const visit = { gameId, path: `/api/games/${encodeURIComponent(gameId)}`, here: true, game: null, busy: "", error: "", release: () => {} };
  onScreenLeave("game", () => {
    visit.here = false;
    visit.release();
  });
  drawScreen(view, frameMarkup({}, `<p class="g-game__loading" role="status">${escapeHtml(t("gamePage.loading"))}</p>`));
  visit.release = delegate(view, "click", "[data-game-action]", (event, target) => {
    void respond(visit, target.getAttribute("data-game-action"));
  });
  await openGame(visit, { first: true });
}
