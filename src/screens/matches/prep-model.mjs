/**
 * What the preparation 3.0 says (`#/games/:id/pre-match[/:step]`, stage 09a decisions 17–22), with no DOM: the step on
 * screen and where each step stands, the head's words, whether the preparation can still be written, the line about the
 * opponent and the one action the footer offers. The rules are the domain's, unchanged (`preparationStep`,
 * `calculateMatchCtv`, `matchBudget`, `weatherResult`): this module only reads the payload `GET …/preparation` sends.
 *
 * The step on screen is the one asked for, never past the current one (as 2.x's `step()`). A step both sides have passed
 * is done; the current one is the first not passed yet; the step on screen, when it is earlier than the current one, is
 * open; the ones after the current are later and lead nowhere.
 *
 * The footer (decision 21, «How each write goes»): the dice steps lead on to the next once both sides have passed them,
 * closed with why until then; the roster's confirms the roster, then leads on with a quiet way to change it; the start's
 * confirms the preparation, then starts the match — closed until the preparation is ready. A match begun or a round
 * closed reads only: no footer.
 */
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl, preMatchUrl, teamUrl } from "../../core/routes.mjs";
import { basketTotals, matchBudget } from "../../domain/match/budget.mjs";
import { preparationStep } from "../../domain/match/preparation.mjs";
import { calculateMatchCtv } from "../../domain/match/roster.mjs";
import { MATCH_STEPS, otherSide } from "../../domain/match/rules.mjs";
import { weatherResult } from "../../domain/match/weather.mjs";

/** The states of the line about the opponent, each its own words (`prep.opponent.<state>`, pre-flight L16). */
export const PREP_OPPONENT_STATES = Object.freeze(["rolled", "waitingRoll", "weatherSet", "weatherWaiting", "locked", "lockWaiting", "confirmed", "confirmWaiting"]);

/** The states that say the opponent has done his part: the line's dot is the accent's, else the warning's. */
const DONE_STATES = new Set(["rolled", "weatherSet", "locked", "confirmed"]);

/**
 * One side as the steps read it: its names, its fans, its lineup and value, where it stands.
 * @param {object} prep the preparation @param {"home"|"away"} name
 */
function sideOf(prep, name) {
  const side = prep[name];
  const ctv = calculateMatchCtv(side);
  const dedicatedFans = Number(side.roster.dedicatedFans) || 0;
  return {
    side: name, name: side.team.name, teamId: side.team.id, userId: side.user?.id ?? "",
    dedicatedFans, fansRoll: side.fansRoll ?? null, fanFactor: side.fansRoll ? dedicatedFans + side.fansRoll : null,
    lineup: ctv.players, total: side.players.length + side.journeymen.length, journeymen: side.journeymen.length, ctv: ctv.total,
    rosterLocked: Boolean(side.rosterLocked), basketLocked: Boolean(side.basketLocked), confirmed: Boolean(side.confirmed),
  };
}

/** What a side has chosen to buy, as a figure; "—" while the reference cannot say. */
function chosenOf(side, data) {
  try {
    return formatMoney(basketTotals(side, data).cost);
  } catch {
    return "—";
  }
}

/** A done step's summary for a desk's list of steps (DeskPreReview.html): «Fan Factor 5 : 5», the weather, «11 and 9 in the lineup», «15k and 0k». */
function summaryOf(key, { prep, own, other, data }) {
  if (key === "fans") return t("prep.summary.fans", { own: own.fanFactor ?? "—", other: other.fanFactor ?? "—" });
  if (key === "weather") return (data && weatherResult(data, prep.weather)?.name) || "—";
  if (key === "roster") return t("prep.summary.roster", { own: own.lineup, other: other.lineup });
  if (key === "inducements") return data ? t("prep.summary.inducements", { own: chosenOf(prep[own.side], data), other: chosenOf(prep[other.side], data) }) : "—";
  return "";
}

/** The steps as the preparation stands: done, the one on screen when earlier than the current, the current, later. */
function stepsOf({ gameId, current, shown, ...read }) {
  return MATCH_STEPS.map((key, index) => {
    const state = index === current ? "current" : index > current ? "later" : index === shown ? "open" : "done";
    const summary = state === "current" ? t("prep.now") : state === "later" ? "" : summaryOf(key, read);
    return { key, label: t(`pre.step.${key}`), state, summary, onScreen: index === shown, href: state === "later" ? null : preMatchUrl(gameId, key) };
  });
}

/** The line about the opponent on the step on screen (`prep.opponent.<state>`); none on the inducements, whose turn says it. */
function opponentOf(key, prep, other) {
  let state = "";
  if (key === "fans") state = other.fansRoll ? "rolled" : "waitingRoll";
  else if (key === "weather") state = prep.weather.home && prep.weather.away ? "weatherSet" : "weatherWaiting";
  else if (key === "roster") state = other.rosterLocked ? "locked" : "lockWaiting";
  else if (key === "review") state = other.confirmed ? "confirmed" : "confirmWaiting";
  return { state, done: DONE_STATES.has(state), text: state ? t(`prep.opponent.${state}`, { count: other.lineup }) : "" };
}

/** «Next: Weather»: a link to the next step once both sides have passed this one, closed with why until then. */
function nextFooter(key, index, current, gameId) {
  const next = MATCH_STEPS[index + 1];
  const open = current > index;
  return { kind: "next", label: t("prep.next", { step: t(`pre.step.${next}`) }), href: preMatchUrl(gameId, next), disabled: !open,
    hint: open ? "" : t(`prep.wait.${key}`), quiet: null };
}

/** The footer's one action on the step on screen (decision 21). */
function footerOf({ key, index, current, prep, own, gameId, readonly }) {
  if (readonly) return { kind: "none", label: "", disabled: true, hint: "", quiet: null };
  if (key === "roster" && !own.rosterLocked) return { kind: "action", label: t("prep.lockRoster"), action: "lock-roster", disabled: false, hint: "", quiet: null };
  if (key === "roster") return { ...nextFooter(key, index, current, gameId), quiet: { label: t("prep.reopenRoster"), action: "reopen" } };
  if (key === "review" && !own.confirmed) return { kind: "action", label: t("prep.confirm"), action: "confirm", disabled: false, hint: "", quiet: null };
  if (key === "review") {
    const ready = prep.status === "ready";
    return { kind: "start", label: t("prep.start"), action: "start", disabled: !ready, hint: ready ? "" : t("prep.startHint"), quiet: null };
  }
  return nextFooter(key, index, current, gameId);
}

/** «Round 7» and a desk's «round 7» (pre-flight L19), or the friendly's words. */
function matchWords(fixture) {
  if (fixture.kind === "friendly") return { phone: t("matches.before.friendly"), desk: t("prep.friendly") };
  return { phone: t("matches.before.round", { round: fixture.roundNumber }), desk: t("prep.round", { round: fixture.roundNumber }) };
}

/**
 * What the preparation says to `sideName`.
 *
 * @param {{preparation: object, snapshots: object, viewerSide: "home"|"away", isAdmin: boolean, fixture: object}} payload
 *   `GET /api/games/:id/preparation`'s answer
 * @param {"home"|"away"} sideName the side shown (the viewer's; an administrator picks one)
 * @param {string} step the step asked for, as the address names it ("" for the current one)
 * @param {{data?: object|null, userId?: string, error?: string}} [ui] the reference, who is signed in, a write's refusal
 */
export function prepModel(payload, sideName, step, ui = {}) {
  const prep = payload.preparation;
  const data = ui.data ?? null;
  const gameId = payload.fixture.id;
  const current = preparationStep(prep);
  const asked = MATCH_STEPS.indexOf(step);
  const shown = Math.min(Math.max(0, asked === -1 ? current : asked), current);
  const key = MATCH_STEPS[shown];
  const own = sideOf(prep, sideName), other = sideOf(prep, otherSide(sideName));
  const readonlyWhy = prep.status === "in_progress" ? "started" : payload.fixture.closed ? "closed" : "";
  const isAdmin = Boolean(payload.isAdmin);
  const words = matchWords(payload.fixture);
  const versus = { home: prep.home.team.name, away: prep.away.team.name };
  let budget = null;
  try {
    budget = data ? matchBudget(prep, sideName, data) : null;
  } catch {
    budget = null;
  }
  return {
    gameId, teamId: own.teamId, isAdmin, sideName, step: key, stepIndex: shown, current,
    steps: stepsOf({ gameId, current, shown, prep, own, other, data }),
    title: t("prep.title"), deskTitle: t("prep.titleDesk", { match: words.desk }),
    sub: t("prep.sub", { match: words.phone, ...versus }), deskSub: t("prep.versus", versus),
    back: isAdmin && ui.userId !== own.userId ? gameUrl(gameId) : teamUrl(own.teamId, "matches"),
    readonly: Boolean(readonlyWhy), readonlyWhy, own, other, sides: { home: versus.home, away: versus.away },
    opponent: readonlyWhy ? { state: "", done: false, text: "" } : opponentOf(key, prep, other),
    footer: footerOf({ key, index: shown, current, prep, own, gameId, readonly: Boolean(readonlyWhy) }),
    ctv: { own: own.ctv, other: other.ctv }, budget, error: ui.error ?? "", preparation: prep, snapshots: payload.snapshots ?? {},
  };
}
