/**
 * The post-match's Treasury and Next steps (stage 09b decisions 16–17): PostFinance.html and PostNext.html; a desk draws
 * the same cards in the frame's middle.
 *
 * The treasury: before the match, the match's income, this post-match's purchases and sales, what goes into the safe and
 * what is left, as `postFinance` counts it over the page's draft (the deposit and the Expensive Mistakes' dice); the
 * Coach's Safe a counter up to what the match brought (50k at most); the Expensive Mistakes' D6 once 100k or more is
 * left in the treasury, then a D3 or two D6 as the kind needs (one die in the prototype: the rule needs the others).
 * Its button waits for the opponent's Players step, as the domain does (POST_WAIT_STATISTICS).
 *
 * Next: who comes back for the next match and who misses it and why (a Lasting Injury with its characteristic's shift),
 * the team's value with and without them, the treasury and the safe, and the captain for the next match.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { calculateMatchCtv, createMatchSide } from "../../domain/match/roster.mjs";
import { otherSide } from "../../domain/match/rules.mjs";
import { sumMoney } from "../../domain/money.mjs";
import { projectPostRoster } from "../../domain/post-match/roster.mjs";
import { nextMatchChanges } from "../../domain/post-match/score.mjs";
import { PLAYER_STATS, rowsForTeam, statValueForDisplayByStat } from "../../domain/roster/values.mjs";
import { renderResourceCounter } from "../../ui/resource-counter.mjs";
import { absenceWords } from "../team/roster/panel.mjs";
import { signedMoney } from "./post-model.mjs";
import { actionFooter, facesMarkup, labelMarkup, nextLink, noteMarkup, rowMarkup } from "./post-steps.mjs";
import { purchasesWords } from "./post-roster.mjs";

/** The most the safe takes from one match's income. */
const SAFE_MOST = 50;
/** The Expensive Mistakes that cost money. */
const LOSSES = ["minor", "major", "catastrophe"];

/** «#9 J. Corr». */
const who = (player) => t("after.who", { number: player.number, name: player.name });

// ———————————————————————————————————— the treasury ————————————————————————————————————

/** The treasury's draft as the page starts it: what the side holds. */
export function financeDraft(model) {
  const side = model.post[model.sideName], mistake = side.mistake ?? {};
  return { deposit: Number(side.deposit) || 0, roll: mistake.roll || null, first: mistake.first || null, second: mistake.second || null };
}

/** The roster the side would leave with, the draft's deposit and dice in it; the model's own when the domain refuses them. */
function projectionWith(model, draft) {
  const side = model.post[model.sideName];
  const mistake = Object.fromEntries(["roll", "first", "second"].filter((key) => draft[key]).map((key) => [key, draft[key]]));
  try {
    return projectPostRoster({ ...model.post, [model.sideName]: { ...side, deposit: draft.deposit, mistake } }, model.sideName, model.data);
  } catch {
    return model.preview;
  }
}

/**
 * The rows of the treasury (PostFinance.html): before, the income, purchases and sales, into the safe, what the Expensive
 * Mistakes took once their dice are in — the rows add up to «Treasury after», in Oswald 28.
 */
function treasuryCard(model, projection) {
  const { accounting, finance } = projection;
  const purchases = accounting.purchases > 0 ? rowMarkup(t("after.purchases"), signedMoney(-accounting.purchases), { sub: purchasesWords(model), tone: "danger" }) : "";
  const sales = accounting.sales > 0 ? rowMarkup(t("after.sales"), signedMoney(accounting.sales), { tone: "gain" }) : "";
  const loss = finance.loss > 0 ? rowMarkup(t("after.mistakeLoss"), signedMoney(-finance.loss), { tone: "danger" }) : "";
  return `<div class="g-after__card g-after__card--rows">${rowMarkup(t("after.before"), formatMoney(accounting.opening))}`
    + `${rowMarkup(t("after.matchIncome"), signedMoney(accounting.winnings), { tone: "gain" })}${purchases}${sales}`
    + `${rowMarkup(t("after.toSafe"), signedMoney(-finance.deposit))}${loss}`
    + `<div class="g-after__total"><span class="g-after__totalk">${escapeHtml(t("after.treasuryAfter"))}</span><span class="g-after__big g-after__big--ink">${escapeHtml(formatMoney(finance.after))}</span></div></div>`;
}

/** The most the safe may take now: 50k, what the match brought, what the treasury holds. */
function safeMost(projection) {
  return Math.max(0, Math.min(SAFE_MOST, projection.income.total, sumMoney(projection.finance.before, projection.finance.deposit)));
}

/** «Coach's Safe»: a counter of the deposit, «Up to 50k of the match income · now 20k → 40k». */
function safeCard(model, projection, draft, lockedReason) {
  const side = model.post[model.sideName], most = safeMost(projection);
  const now = Number(side.baseRoster.coachesSafe) || 0;
  const counter = renderResourceCounter({ key: "deposit", name: t("after.safe"), note: t("after.safeSub", { now: formatMoney(now), next: formatMoney(sumMoney(now, draft.deposit)) }),
    value: draft.deposit, decDisabled: draft.deposit <= 0, incBlockedReason: draft.deposit >= most ? t("after.safeFull", { most: formatMoney(most) }) : "", lockedReason });
  return `<div class="g-after__card g-after__card--safe">${counter}</div>`;
}

/** The kind of Expensive Mistakes the draft's dice give, «under» for a treasury under 100k. */
const mistakeOf = (finance) => (finance.before >= 100 ? finance.kind : "under");

/** «Expensive Mistakes»: the D6 from 100k on, then a D3 (Minor) or two D6 (Catastrophe), and what they do. */
function mistakesCard(model, projection, draft, closed) {
  const { finance } = projection, kind = mistakeOf(finance);
  let dice = "";
  if (kind !== "under") {
    const name = t("after.mistakes");
    dice = `${noteMarkup(t("after.mistakesRoll"))}${facesMarkup({ name, faces: [1, 2, 3, 4, 5, 6], value: draft.roll, closed, data: "data-after-mistake" })}`;
    if (kind === "minor") dice += `${labelMarkup(t("after.extraD3"))}${facesMarkup({ name: t("after.extraD3"), faces: [1, 2, 3], value: draft.first, closed, data: 'data-after-extra="first"' })}`;
    if (kind === "catastrophe") {
      const pair = t("after.extraD6");
      dice += `${labelMarkup(pair)}${facesMarkup({ name: `${pair} · 1`, faces: [1, 2, 3, 4, 5, 6], value: draft.first, closed, data: 'data-after-extra="first"' })}`
        + facesMarkup({ name: `${pair} · 2`, faces: [1, 2, 3, 4, 5, 6], value: draft.second, closed, data: 'data-after-extra="second"' });
    }
  }
  const tone = LOSSES.includes(kind) ? " g-after__mistake--loss" : kind === "pending" ? " g-after__mistake--pending" : "";
  return `<div class="g-after__card">${labelMarkup(t("after.mistakes"))}${dice}<b class="g-after__mistake${tone}">${escapeHtml(t(`after.mistake.${kind}`))}</b>${noteMarkup(t("after.mistakesNote"))}</div>`;
}

/**
 * The treasury (PostFinance.html). «Next: the next match» sends the deposit and the dice (`finance`), closed while the
 * opponent has not saved the Players step, and while a die the kind needs is not marked.
 * @param {ReturnType<typeof import("./post-model.mjs").postModel>} model @param {ReturnType<typeof financeDraft>} draft
 */
export function financeStep(model, draft) {
  const projection = projectionWith(model, draft);
  const closed = model.readonly;
  const contentHtml = `${treasuryCard(model, projection)}${safeCard(model, projection, draft, closed ? t("after.financeLocked") : "")}${mistakesCard(model, projection, draft, closed)}`;
  if (closed) return { contentHtml, asideHtml: "", footer: nextLink(model, "next") };
  const waiting = model.post[otherSide(model.sideName)].stage < 3;
  const hint = waiting ? t("after.waitStats") : projection.finance.pending ? t("after.mistakeNeed") : "";
  return { contentHtml, asideHtml: "", footer: actionFooter("finance", t("after.next.next"), hint) };
}

// ———————————————————————————————————— next ————————————————————————————————————

/** Who may be the captain of the next match: the roster after the post-match, not retired for now, by number. */
function captains(model) {
  return model.preview.roster.players.filter((player) => !player.temporarilyRetired).sort((one, other) => (Number(one.number) || 0) - (Number(other.number) || 0));
}

/**
 * The next step's draft as the page starts it (pre-flight L18): the captain this side named, else the team's captain if
 * still on the roster and not retired, else the first who may be, else none.
 */
export function nextDraft(model) {
  const side = model.post[model.sideName], fit = captains(model);
  const named = fit.find((player) => player.id === side.captain) ?? fit.find((player) => side.baseRoster.players.some((base) => base.id === player.id && base.isCaptain));
  return { captain: (named ?? fit[0])?.id ?? "" };
}

/** «AG 3+ → 4+»: a characteristic as it was and as a Lasting Injury leaves it. */
function shiftWords(model, player, stat) {
  const side = model.post[model.sideName], row = rowsForTeam(side.reference)[player.rowIndex];
  const before = side.baseRoster.players.find((base) => base.id === player.id);
  const value = (who) => statValueForDisplayByStat(stat, row?.[stat] ?? "", Number(who?.statMods?.[stat]) || 0);
  return `${t(`stats.${stat}`)} ${value(before)} → ${value(player)}`;
}

/** Why a player misses the next match: this post-match's injury (a Lasting one with its shift), else the earlier reason (07b's words). */
function missingWords(model, missing) {
  const player = model.preview.roster.players.find((item) => item.id === missing.id);
  if (missing.injury?.code === "lasting" && PLAYER_STATS.includes(missing.injury.stat)) {
    return t("after.lastingShift", { injury: t("after.injury.lasting"), shift: shiftWords(model, player, missing.injury.stat) });
  }
  return absenceWords({ retired: missing.retired, absence: player?.absence });
}

/** The team's value before and after the post-match: TV with every player, CTV without those who miss the next match. */
function valuesOf(model) {
  const side = model.post[model.sideName];
  const read = (roster) => {
    const match = createMatchSide({ user: side.user, team: { ...side.team, roster } }, model.data);
    return { worth: calculateMatchCtv({ ...match, players: match.players.map((player) => ({ ...player, skipNextGame: false })) }).total, ctv: calculateMatchCtv(match).total };
  };
  try {
    return { before: read(side.baseRoster), after: read(model.preview.roster) };
  } catch {
    return null;
  }
}

/**
 * Next (PostNext.html): who comes back, who misses the next match and why, TV and CTV before and after, the treasury and
 * the safe, the captain. «Next: summary» sends the captain (`next`), closed while there is one to name and none is.
 * @param {ReturnType<typeof import("./post-model.mjs").postModel>} model @param {ReturnType<typeof nextDraft>} draft
 */
export function nextStep(model, draft) {
  const changes = nextMatchChanges(model.post, model.sideName, model.preview.roster);
  const back = changes.returning.length
    ? `<div class="g-after__card g-after__card--rows">${labelMarkup(t("after.returning"))}${changes.returning.map((player) => rowMarkup(who(player), t("after.inLineup"), { tone: "gain" })).join("")}</div>` : "";
  const out = changes.missing.length
    ? `<div class="g-after__card g-after__card--rows">${labelMarkup(t("after.missing"))}${changes.missing.map((player) => rowMarkup(who(player), missingWords(model, player), { tone: "danger" })).join("")}</div>` : "";
  const values = valuesOf(model), span = (key) => (values ? `${formatMoney(values.before[key])} → ${formatMoney(values.after[key])}` : "—");
  const money = `<div class="g-after__card g-after__card--rows">${rowMarkup(t("after.tv"), span("worth"))}${rowMarkup(t("after.ctv"), span("ctv"), { sub: t("after.ctvSub") })}`
    + `${rowMarkup(t("after.treasury"), formatMoney(model.preview.roster.treasury))}${rowMarkup(t("after.safe"), formatMoney(model.preview.roster.coachesSafe))}</div>`;
  const fit = captains(model), closed = model.readonly;
  const entry = fit.some((player) => player.id === draft.captain) ? draft.captain : fit[0]?.id;
  const items = fit.map((player) => `<button type="button" class="g-after__option" role="radio" aria-checked="${player.id === draft.captain}" tabindex="${player.id === entry ? 0 : -1}"`
    + `${closed ? ' aria-disabled="true"' : ""} data-captain="${escapeHtml(player.id)}"><span>${escapeHtml(who(player))}</span></button>`).join("");
  const captain = fit.length ? `<div class="g-after__card">${labelMarkup(t("after.captain"))}<div class="g-after__options g-after__options--captain" role="radiogroup" aria-label="${escapeHtml(t("after.captain"))}" data-after-captain>${items}</div></div>` : "";
  const contentHtml = `${back}${out}${money}${captain}`;
  if (closed) return { contentHtml, asideHtml: "", footer: nextLink(model, "review") };
  return { contentHtml, asideHtml: "", footer: actionFooter("next", t("after.next.review"), fit.length && !draft.captain ? t("after.captainShut") : "") };
}
