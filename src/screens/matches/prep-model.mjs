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
 * closed with why until then; the roster's confirms the roster, then leads on with a quiet way to change it; the
 * inducements' confirms the purchases (or goes on without any), then leads on with a quiet way to change them; the
 * start's confirms the preparation, then starts the match — closed until the preparation is ready. A match begun or a
 * round closed reads only: no footer.
 *
 * The inducements (decision 20, PreInducements.html): whose turn it is and the budget, as `matchBudget` gives them; the
 * help or the stars the team may buy (`catalogAccess`), each with why its «+» cannot be pressed — 2.x's
 * `purchaseReason`, moved here —; what is bought; the prayers and effects to record once they are bought.
 */
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl, preMatchUrl, teamUrl } from "../../core/routes.mjs";
import { basketTotals, matchBudget, purchaseOrder } from "../../domain/match/budget.mjs";
import { catalogAccess, matchCatalog } from "../../domain/match/catalog.mjs";
import { preparationStep } from "../../domain/match/preparation.mjs";
import { calculateMatchCtv, journeymanPositions } from "../../domain/match/roster.mjs";
import { MATCH_RULES, MATCH_STEPS, otherSide, teamKey } from "../../domain/match/rules.mjs";
import { prayerEntries, weatherEntries, weatherResult } from "../../domain/match/weather.mjs";

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

/**
 * The weather table of the match's time of year and the result its dice give. The reference's section is named by the
 * season in the reference's own language (a Russian page heads it «## Осень»), and the domain looks it up by the name it
 * is given (`weatherEntries`): the English name first, then the page's own word. The table's rows only — the domain's
 * reading also catches the table's head and the wind's table under it.
 * @param {object} data the reference @param {{season: string, home: number|null, away: number|null}} weather
 */
export function weatherTable(data, weather) {
  const rows = (name) => weatherEntries(data, name).filter((entry) => entry.name && /^\d+(?:[-–]\d+)?$/.test(entry.roll));
  const season = [weather.season, t(`pre.season.${weather.season}`)].find((name) => rows(name).length) ?? weather.season;
  return { entries: rows(season), result: weatherResult(data, { ...weather, season }) };
}

/** A done step's summary for a desk's list of steps (DeskPreReview.html): «Fan Factor 5 : 5», the weather, «11 and 9 in the lineup», «15k and 0k». */
function summaryOf(key, { prep, own, other, data }) {
  if (key === "fans") return t("prep.summary.fans", { own: own.fanFactor ?? "—", other: other.fanFactor ?? "—" });
  if (key === "weather") return (data && weatherTable(data, prep.weather).result?.name) || "—";
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

/** Whose turn it is to buy (`prep.turn.<turn>`): ours first (the higher CTV), ours second (the opponent's basket is in), the opponent's, or no order at equal CTVs. */
export const PREP_TURNS = Object.freeze(["first", "second", "wait", "even"]);

function turnOf(prep, sideName) {
  const first = purchaseOrder(prep);
  if (!first) return "even";
  if (first === sideName) return "first";
  return prep[otherSide(sideName)].basketLocked ? "second" : "wait";
}

/** The first line of an inducement's rule, as the reference writes it, without «0-1 Team Mascot (25k):» before it nor its links. */
function ruleLine(body) {
  const line = String(body ?? "").replace(/^---[\s\S]*?---/, "").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, page, label) => label ?? page)
    .split("\n").find((each) => each.trim()) ?? "";
  return line.replace(/^#+\s*/, "").replace(/^\d+\s*[-–]\s*\d+\s+[^:]*?\([^)]*\):\s*/, "").trim();
}

/** A row's quiet line: «15k · up to 3 · <the rule's first line>»; a star's price, its leagues, and «Mega Star · 2 places» for one. */
function noteOf(item) {
  if (item.category === "stars") {
    return [formatMoney(item.cost), item.mega ? t("prep.ind.mega") : String(item.star?.starPlayer?.availability ?? "")].filter(Boolean).join(" · ");
  }
  const rule = ruleLine(item.body);
  return rule ? t("prep.ind.note", { cost: formatMoney(item.cost), limit: item.limit, rule }) : t("prep.ind.noteShort", { cost: formatMoney(item.cost), limit: item.limit });
}

/**
 * Why one more of `item` cannot be bought (2.x's `purchaseReason`, in 3.0's words): not for this team, the limit, not
 * enough money, no star places left, the match roster full. "" when it can.
 */
function reasonOf(item, { side, budget, totals, slots, lineup }) {
  if (!catalogAccess(item, side)) return t("prep.ind.access");
  if (Number(side.basket[item.id] || 0) >= item.limit) return t("prep.ind.limit");
  if (item.cost > budget.remaining) return t("prep.missing", { amount: formatMoney(item.cost - budget.remaining) });
  if (totals.slots + item.slots > slots) return t("prep.ind.starLimit", { maximum: slots });
  if (lineup + totals.spaces + item.spaces > MATCH_RULES.rosterMaximum) return t("prep.ind.rosterLimit", { maximum: MATCH_RULES.rosterMaximum });
  return "";
}

/** What the effects' form needs, once a prayer, a Mark of Chaos or Rowdy Rookies is bought; null otherwise. */
function effectsOf(side, data, editable) {
  const prayers = Number(side.basket["nuffles-prayers"] || 0);
  const mark = Boolean(side.basket["mark-of-chaos"]), rookies = Boolean(side.basket["rowdy-rookies"]);
  if (!prayers && !mark && !rookies) return null;
  return { prayers, mark, rookies, editable, entries: prayerEntries(data), skillGroups: data.skillGroups ?? [], current: side.effects ?? {},
    favoured: side.roster.favouredChoice ?? "", positions: journeymanPositions(side.reference).map(({ rowIndex, position }) => ({ rowIndex, position })) };
}

/** The share of the most the team may spend that it has chosen, in tenths (the bar's class: no style attribute, CSP). */
const shareOf = (budget) => (budget.maximum > 0 ? Math.min(10, Math.max(0, Math.round((budget.chosen / budget.maximum) * 10))) : budget.chosen > 0 ? 10 : 0);

/** The budget's quiet line (pre-flight L17): the treasury is not spent, Nk of it is, or more than it may give. */
function hintOf(budget) {
  if (budget.treasuryUsed > budget.treasuryLimit) return { tone: "danger", hint: t("prep.ind.hintOver", { limit: formatMoney(budget.treasuryLimit) }) };
  if (budget.treasuryUsed > 0) return { tone: "warn", hint: t("prep.ind.hintSpend", { amount: formatMoney(budget.treasuryUsed) }) };
  return { tone: "accent", hint: t("prep.ind.hintNone") };
}

/** The lock on every counter, and why: a preparation read only, a basket confirmed, the opponent's turn. "" while it can be written. */
function lockOf({ readonly, side, budget }) {
  if (readonly) return t("prep.ind.lockedReadonly");
  if (side.basketLocked) return t("prep.ind.lockedConfirmed");
  return budget.canChoose ? "" : t("prep.ind.lockedWait");
}

/**
 * The inducements' step: the budget as the preparation counts it, the turn, the rows of the category shown, the
 * stars' places, what is bought and the effects to record. Null while the reference has not come or the budget cannot
 * be read (a treasury the rules cannot read).
 */
function inducementsOf({ prep, sideName, data, category, readonly }) {
  if (!data?.teams || !data?.pages) return null;
  let budget;
  try {
    budget = matchBudget(prep, sideName, data);
  } catch {
    return null;
  }
  const side = prep[sideName], other = prep[otherSide(sideName)];
  const totals = basketTotals(side, data);
  const slots = MATCH_RULES.stuntyTeams.includes(teamKey(side.reference)) ? 4 : 2;
  const catalog = matchCatalog(side, data);
  const lockedReason = lockOf({ readonly, side, budget });
  const read = { side, budget, totals, slots, lineup: calculateMatchCtv(side).players };
  const rows = catalog.filter((item) => item.category === category && catalogAccess(item, side)).map((item) => ({
    id: item.id, title: item.title, note: noteOf(item), cost: item.cost, quantity: Number(side.basket[item.id] || 0), limit: item.limit,
    reason: reasonOf(item, read), star: item.category === "stars", slots: item.slots }));
  const bought = catalog.filter((item) => side.basket[item.id]).map((item) => ({ title: item.title, quantity: side.basket[item.id], cost: item.cost * side.basket[item.id] }));
  return { turn: turnOf(prep, sideName), spentByOther: basketTotals(other, data).cost, petty: budget.pettyCash, bonus: budget.bonus,
    treasuryUpTo: budget.treasuryLimit, chosen: budget.chosen, remaining: budget.remaining, maximum: budget.maximum, share: shareOf(budget),
    ...hintOf(budget), category, rows, stars: { used: totals.slots, of: slots }, editable: !lockedReason, locked: Boolean(lockedReason), lockedReason,
    bought, canChoose: budget.canChoose, effects: effectsOf(side, data, !lockedReason) };
}

/**
 * The inducements' line about the opponent, and a desk's rows of his card: who bought first, and whether his choice is
 * in. When he bought first his line says why he did (PreInducements.html, the fidelity pass's G9).
 */
function inducementsOpponent(inducements, other) {
  if (!inducements) return { state: "", done: false, text: "", rows: null };
  const { turn, spentByOther } = inducements;
  const text = turn === "second" ? t("prep.ind.opponentFirst") : other.basketLocked ? t("prep.ind.opponentLocked")
    : turn === "wait" ? t("prep.turn.wait") : t("prep.ind.opponentChoosing");
  const rows = [[t("matches.ctv"), formatMoney(other.ctv), ""]];
  if (turn === "second" || turn === "wait") rows.push([t("prep.opponentFirst"), formatMoney(spentByOther), ""]);
  rows.push([t("prep.opponentState"), other.basketLocked ? t("prep.opponentChosen") : t("prep.ind.opponentChoosing"), other.basketLocked ? "done" : ""]);
  return { state: "", done: other.basketLocked, text, rows };
}

/** The first letter small: a step's name inside a sentence (PreFans.html «Далее: погода»). */
const lowerFirst = (words) => words.charAt(0).toLocaleLowerCase() + words.slice(1);

/** «Next: weather»: a link to the next step once both sides have passed this one, closed with why until then. */
function nextFooter(key, index, current, gameId) {
  const next = MATCH_STEPS[index + 1];
  const open = current > index;
  return { kind: "next", label: t("prep.next", { step: lowerFirst(t(`pre.step.${next}`)) }), href: preMatchUrl(gameId, next), disabled: !open,
    hint: open ? "" : t(`prep.wait.${key}`), quiet: null };
}

/** The footer's one action on the step on screen (decision 21). */
function footerOf({ key, index, current, prep, own, gameId, readonly, inducements }) {
  if (readonly) return { kind: "none", label: "", disabled: true, hint: "", quiet: null };
  if (key === "inducements" && !own.basketLocked) {
    const over = inducements?.tone === "danger";
    const hint = !inducements?.canChoose ? t("prep.turn.wait") : over ? inducements.hint : "";
    return { kind: "action", label: inducements?.chosen ? t("prep.lockBasket") : t("prep.noBasket"), action: "lock-basket",
      disabled: !inducements?.canChoose || over, hint, quiet: null };
  }
  if (key === "inducements") return { ...nextFooter(key, index, current, gameId), quiet: { label: t("prep.reopenBasket"), action: "reopen" } };
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
 * @param {{data?: object|null, userId?: string, error?: string, category?: "help"|"stars"}} [ui] the reference, who is signed in, a
 *   write's refusal, the inducements' category shown
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
  const readonly = Boolean(readonlyWhy);
  const inducements = key === "inducements" ? inducementsOf({ prep, sideName, data, category: ui.category === "stars" ? "stars" : "help", readonly }) : null;
  const opponent = readonly ? { state: "", done: false, text: "" } : key === "inducements" ? inducementsOpponent(inducements, other) : opponentOf(key, prep, other);
  return {
    gameId, teamId: own.teamId, isAdmin, sideName, step: key, stepIndex: shown, current,
    steps: stepsOf({ gameId, current, shown, prep, own, other, data }),
    title: t("prep.title"), deskTitle: t("prep.titleDesk", { match: words.desk }),
    sub: t("prep.sub", { match: words.phone, ...versus }), deskSub: t("prep.versus", versus),
    back: isAdmin && ui.userId !== own.userId ? gameUrl(gameId) : teamUrl(own.teamId, "matches"),
    readonly, readonlyWhy, own, other, sides: { home: versus.home, away: versus.away },
    opponent,
    footer: footerOf({ key, index: shown, current, prep, own, gameId, readonly, inducements }),
    ctv: { own: own.ctv, other: other.ctv }, budget, inducements, error: ui.error ?? "", preparation: prep, snapshots: payload.snapshots ?? {},
  };
}
