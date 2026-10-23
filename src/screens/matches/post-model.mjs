/**
 * What the post-match 3.0 says (`#/games/:id/post-match[/:step]`, stage 09b decisions 1–3), with no DOM: the step on
 * screen and where each step stands, the head's words, the line about the opponent and the footer's one action. It
 * draws in the preparation's frame (prep-frame.mjs): the fields the frame reads are the ones `prepModel` gives, and the
 * post-match's own — the state, the roster this side would leave with, whether the score is agreed — come beside them.
 * The rules are the domain's (`src/domain/post-match/*`); this module only reads the payload `GET …/post-match` sends.
 *
 * The step on screen is the one asked for, never past the side's current one (`side.stage`), the current one when none
 * is asked. A step the side has passed is done and leads back to itself; the current one is the first not passed; the
 * one on screen, when it is earlier than the current, is open (passed: it reads only); the ones after the current are
 * later and lead nowhere. A desk's list says each passed step in a few words (DeskPostResult.html … DeskPostReview.html).
 *
 * The roster this side would leave with is `projectPostRoster`'s. One the domain refuses — a sale at seven, a purchase
 * the treasury cannot pay — is drawn without the roster's steps, the safe and the dice (as 2.x did), and the
 * refusal is said where a write's refusal would be (`error`). The footer leads on to the next step once it is open; the
 * steps' modules (post-steps.mjs … post-review.mjs) put their own in its place.
 */
import { errorText } from "../../core/api.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl, postMatchUrl, teamUrl } from "../../core/routes.mjs";
import { TECHNICAL_REASONS } from "../../domain/league-rules.mjs";
import { otherSide } from "../../domain/match/rules.mjs";
import { projectPostRoster } from "../../domain/post-match/roster.mjs";
import { POST_STEPS, effectiveInjury, resultAgreed } from "../../domain/post-match/rules.mjs";
import { earnedSpp } from "../../domain/post-match/statistics.mjs";
import { sumMoney } from "../../domain/money.mjs";

/** The states of the line about the opponent, each its own words (`after.opponent.<state>`). */
export const POST_OPPONENT_STATES = Object.freeze(["same", "step", "agreed", "sent", "waiting", "none", "confirmed", "confirmWaiting"]);

/** «2–1»: the TD of `viewerSide`, then the opponent's (PostResult.html «Соперник подтвердил счёт 2–1» to the home side at 2–1); "" with no score. */
export function scoreWords(post, viewerSide) {
  const result = post.result;
  if (!result) return "";
  return `${result[viewerSide].touchdowns}–${result[otherSide(viewerSide)].touchdowns}`;
}

/** «2–1» as the head says it: the home side's first. */
const homeScore = (post) => scoreWords(post, "home");

/**
 * Where the opponent stands, for the line on the step on screen (decision 3): on the score — agreed, sent by them,
 * sent by us and waited for, none yet; on the summary — confirmed or waited for; on any other step — on this one, or
 * on another (named by the words).
 * @param {object} post the post-match @param {"home"|"away"} sideName @param {string} [step] the step on screen; the side's current one by default
 */
export function opponentState(post, sideName, step = POST_STEPS[Math.min(post[sideName].stage, POST_STEPS.length - 1)]) {
  const other = otherSide(sideName);
  if (step === "result") {
    if (!post.result) return "none";
    if (resultAgreed(post)) return "agreed";
    return post.result.accepted[other] ? "sent" : "waiting";
  }
  if (step === "review") return post[other].confirmed ? "confirmed" : "confirmWaiting";
  return Math.min(post[other].stage, POST_STEPS.length - 1) === POST_STEPS.indexOf(step) ? "same" : "step";
}

/**
 * The line's words and its dot: the accent once the opponent has done their part of the step on screen — the score
 * agreed or sent to us, the summary confirmed, this step reached (PostFans.html) or passed —, the warning's colour
 * while they are behind or we wait for them. A technical score the line names says why (stage 12): «The opponent sent
 * the score 0–2 · technical: the opponent could not field a team»; one sent before 12, with no reason, is the other kind.
 */
function opponentOf(post, sideName, step) {
  const state = opponentState(post, sideName, step);
  const other = post[otherSide(sideName)];
  const theirs = Math.min(other.stage, POST_STEPS.length - 1);
  const done = ["agreed", "sent", "confirmed", "same"].includes(state) || (state === "step" && theirs > POST_STEPS.indexOf(step));
  const line = t(`after.opponent.${state}`, { step: t(`after.step.${POST_STEPS[theirs]}`), score: scoreWords(post, sideName) });
  if (!["agreed", "sent"].includes(state) || post.result.mode !== "technical") return { state, done, text: line };
  const reason = TECHNICAL_REASONS.includes(post.result.reason) ? post.result.reason : "other";
  return { state, done, text: t(`after.reasonLine.${reason}`, { line }) };
}

/** «+80k», «−20k», «0k»: an amount of money with its sign. */
export function signedMoney(amount) {
  if (amount > 0) return `+${formatMoney(amount)}`;
  if (amount < 0) return `−${formatMoney(-amount)}`;
  return formatMoney(0);
}

/**
 * The roster `sideName` would leave with, as the domain projects it. A projection it refuses is made again without the
 * roster's steps, the safe and the dice, then without the advancements and the captain too, and carries the refusal's
 * code (`invalid`) and the refusal itself (`refusal`), as 2.x did.
 */
export function previewOf(post, sideName, data) {
  try {
    return projectPostRoster(post, sideName, data);
  } catch (refusal) {
    const copy = structuredClone(post);
    Object.assign(copy[sideName], { operations: [], deposit: 0, mistake: {} });
    let preview;
    try {
      preview = projectPostRoster(copy, sideName, data);
    } catch {
      Object.assign(copy[sideName], { advancements: {}, captain: "" });
      preview = projectPostRoster(copy, sideName, data);
    }
    return { ...preview, invalid: refusal.code ?? "POST_ACTION", refusal };
  }
}

/** The SPP the side's players earned in the match, the MVP's among them. */
export function matchSpp(post, sideName) {
  return post[sideName].snapshot.players.reduce((total, player) => total + earnedSpp(post, sideName, player.id), 0);
}

/** The side's players with an injury that stands (rookie protection applied: Badly Hurt is one). */
export function injuredIds(side) {
  return side.snapshot.players.map((player) => player.id).filter((id) => effectiveInjury(side, id).code !== "none");
}

/** A passed step in a few words for a desk's list (decision 2): «2–1 · confirmed», «+80k · fans 3 → 4», «+14 SPP · injuries: 1», «−20k», «safe +20k», «captain W. Brandt». */
function summaryOf(key, { post, sideName, preview }) {
  const side = post[sideName];
  if (key === "result") return resultAgreed(post) ? t("after.sum.result", { score: scoreWords(post, sideName) }) : t("after.sum.resultOpen");
  if (key === "fans") return t("after.sum.fans", { income: signedMoney(preview.income.total), from: side.baseRoster.dedicatedFans ?? 0, to: preview.roster.dedicatedFans });
  if (key === "players") return t("after.sum.players", { spp: `+${matchSpp(post, sideName)}`, count: injuredIds(side).length });
  if (key === "roster") return signedMoney(sumMoney(preview.accounting.sales, -preview.accounting.purchases));
  if (key === "finance") return t("after.sum.finance", { amount: formatMoney(Number(side.deposit) || 0) });
  if (key === "next") {
    const captain = preview.roster.players.find((player) => player.isCaptain);
    return captain ? t("after.sum.next", { name: captain.name }) : "";
  }
  return "";
}

/**
 * The steps as the side stands: done, the one on screen when earlier than the current, the current, later. The current
 * says «now», but «Score», which says «being entered» until both agree (DeskPostResult).
 */
function stepsOf({ gameId, current, shown, ...read }) {
  return POST_STEPS.map((key, index) => {
    const state = index === current ? "current" : index > current ? "later" : index === shown ? "open" : "done";
    const summary = state === "current" ? (key === "result" ? summaryOf(key, read) : t("after.now")) : state === "later" ? "" : summaryOf(key, read);
    return { key, label: t(`after.step.${key}`), state, summary, onScreen: index === shown, href: state === "later" ? null : postMatchUrl(gameId, key) };
  });
}

/**
 * The footer the frame draws until a step puts its own in its place: a link on to the next step once the side has
 * reached it, closed with why until then; none on the last.
 */
function defaultFooter({ index, current, gameId }) {
  const next = POST_STEPS[index + 1];
  if (!next) return { kind: "none", label: "", disabled: true, hint: "", quiet: null };
  const open = current > index;
  return { kind: "next", label: t(`after.next.${next}`), href: postMatchUrl(gameId, next), disabled: !open,
    hint: open ? "" : t(index === 0 ? "after.waitAgree" : "after.wait"), quiet: null };
}

/** «Round 7» and a desk's «round 7», or the friendly's words. */
function matchWords(fixture) {
  if (fixture.kind === "friendly") return { phone: t("after.friendly"), desk: t("after.friendlyDesk") };
  return { phone: t("after.round", { round: fixture.roundNumber }), desk: t("after.roundDesk", { round: fixture.roundNumber }) };
}

/** One side as the frame reads it: its names and where it stands. */
function sideOf(post, name) {
  const side = post[name];
  return { side: name, name: side.team.name, teamId: side.team.id, userId: side.user?.id ?? "", stage: side.stage, confirmed: Boolean(side.confirmed) };
}

/**
 * Where «‹» leads: the viewer's own side's matches when he plays the match — an administrator who plays it too, whichever
 * side he looks at (the match page would send him straight back in: review of stage 13) —, the match page for an
 * administrator who plays neither side (it sends nobody on), else the shown side's matches.
 */
function backOf({ gameId, isAdmin, userId, own, other }) {
  const mine = [own, other].find((side) => side.userId && side.userId === userId);
  if (mine) return teamUrl(mine.teamId, "matches");
  return isAdmin ? gameUrl(gameId) : teamUrl(own.teamId, "matches");
}

/**
 * What the post-match says to `sideName`.
 *
 * @param {{postMatch: object, viewerSide: "home"|"away", isAdmin: boolean, rosterChanged?: {home: boolean, away: boolean},
 *   fixture: {id: string, kind: string, seasonName?: string, roundNumber?: number}}} payload `GET /api/games/:id/post-match`'s answer
 * @param {"home"|"away"} sideName the side shown (the viewer's; an administrator picks one)
 * @param {string} step the step asked for, as the address names it ("" for the current one)
 * @param {{data?: object, userId?: string, error?: string}} [ui] the reference, who is signed in, a write's refusal
 */
export function postModel(payload, sideName, step, ui = {}) {
  const post = payload.postMatch;
  const data = ui.data ?? { skillGroups: [] };
  const gameId = payload.fixture.id;
  const current = Math.min(post[sideName].stage, POST_STEPS.length - 1);
  const asked = POST_STEPS.indexOf(step);
  const shown = Math.min(Math.max(0, asked === -1 ? current : asked), current);
  const key = POST_STEPS[shown];
  const own = sideOf(post, sideName), other = sideOf(post, otherSide(sideName));
  const preview = previewOf(post, sideName, data);
  const isAdmin = Boolean(payload.isAdmin);
  const completed = post.status === "completed";
  const passed = shown < current;
  const words = matchWords(payload.fixture);
  const versus = { home: post.home.team.name, away: post.away.team.name };
  const teams = post.result ? t("after.scoreLine", { ...versus, score: homeScore(post) }) : t("after.versus", versus);
  const refusal = ui.error || (preview.invalid ? errorText(preview.refusal) : "");
  return {
    gameId, teamId: own.teamId, isAdmin, sideName, sides: versus, step: key, stepIndex: shown, current,
    steps: stepsOf({ gameId, current, shown, post, sideName, preview }), stepsLabel: t("after.steps"),
    title: t("after.title"), sub: t("after.sub", { match: words.phone, teams }),
    deskTitle: t("after.titleDesk", { match: words.desk }), deskSub: teams,
    back: backOf({ gameId, isAdmin, userId: ui.userId, own, other }),
    readonly: completed || own.confirmed || passed, readonlyWhy: "", error: refusal,
    footer: defaultFooter({ index: shown, current, gameId }),
    opponent: completed ? { state: "", done: true, text: "" } : opponentOf(post, sideName, key),
    post, own, other, preview, completed, confirmed: own.confirmed, agreed: resultAgreed(post), passed,
    rosterChanged: Boolean(payload.rosterChanged?.[sideName]), kind: payload.fixture.kind, matchLabel: words.phone, data,
  };
}

/**
 * The key of a player's line on the roster's advancement sheet (07d): `<id>#<n>`, the id's blanks made `_` and n the
 * lines before it with the same id (screens/team/roster/model.mjs `keysOf`). The post-match's players have ids of their
 * own, one line each: n is 0. «Advance» on the Players step names the sheet's line by it (pre-flight L17).
 */
export function postAdvanceKey(playerId) {
  return `${String(playerId).replace(/\s+/g, "_")}#0`;
}
