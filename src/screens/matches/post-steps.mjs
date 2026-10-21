/**
 * The post-match's first two steps, each as cards (stage 09b decisions 4–8): the score (PostResult.html,
 * PostResultMismatch.html; DeskPostResult.html has the same cards in the frame's middle) and the income (PostFans.html; a
 * desk draws its cards in the same frame).
 *
 * The score: what the match records add up to for both sides (a side's statistics are its records, decision 4), the
 * steppers «ours | TD/CAS | theirs» — ours at the left — that start at the score sent, else at each side's records, what
 * the score gives this side in the table, where the score and the records part (said as `lock-players` would refuse
 * it), how the match ended and, when not played, who won. Everything is kept on the page (`draft`, the screen's) and
 * sent by the footer's button: «Send the score», «Confirm the score 2–1», or, once agreed, on to the income with a quiet
 * way to change it (decision «How each write goes»).
 *
 * The income: the Dedicated Fans die (a D3 for the side that conceded, none at a draw), the technical win's D3, the
 * income line by line as the domain counts it over the draft, and the two switches. The step's button sends it all.
 *
 * A technical result says why (stage 12, decisions 1, 3): under the winner, as the winner stands under the modes, «Why
 * technical» — the opponent could not field a team (2 more to the winner, content: "+2 points if the opponent could not
 * field a team") or another reason. Until one is picked the button is closed and says so; the reason goes with the score
 * (`resultAction`), the points for you are the post-match's own (`postPoints`), and another mode sends none.
 *
 * Dice, the modes and the reasons are radio groups (the master plan's 05–13 rule): one `role="radiogroup"` with its
 * name, a `role="radio"` per face, the chosen one checked and the only one in the tab order (none chosen: the first).
 * What cannot be written is drawn closed (`aria-disabled`, a stepper `disabled`).
 */
import { escapeHtml } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { postMatchUrl } from "../../core/routes.mjs";
import { TECHNICAL_REASONS, seasonPoints } from "../../domain/league-rules.mjs";
import { otherSide } from "../../domain/match/rules.mjs";
import { PAINTING_BONUS, nextDedicatedFans, postIncome } from "../../domain/post-match/finance.mjs";
import { RESULT_MODES, postOutcome } from "../../domain/post-match/rules.mjs";
import { postPoints, scoreMismatches, sideRecords } from "../../domain/post-match/score.mjs";
import { fanFactorBonus } from "../../domain/post-match/statistics.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { renderSegmentedControl } from "../../ui/segmented-control.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { renderStepButton } from "../../ui/stepper.mjs";
import { renderToggle } from "../../ui/toggle.mjs";
import { scoreWords } from "./post-model.mjs";

/** The most a stepper of the score counts to (`postCount`). */
const MOST = 99;

/** An upper-case label over a card (Из записей матча, Как закончился матч). */
export const labelMarkup = (text) => `<span class="g-after__label">${escapeHtml(text)}</span>`;

/** A quiet paragraph of the step's words. */
export const noteMarkup = (text) => `<p class="g-after__note">${escapeHtml(text)}</p>`;

/** A row «label — value» (44px, a line under it), the label with a quiet line under it when there is one. */
export function rowMarkup(label, value, { sub = "", tone = "" } = {}) {
  const line = sub ? `<span class="g-after__rowsub">${escapeHtml(sub)}</span>` : "";
  return `<div class="g-after__row"><span class="g-after__rowk">${escapeHtml(label)}${line}</span>`
    + `<span class="g-after__rowv${tone ? ` g-after__rowv--${tone}` : ""}">${escapeHtml(value)}</span></div>`;
}

/**
 * A die's faces as one radio group (the preparation's faces, PreFans.html: 46px, Oswald 20): `value` checked, the rest
 * in order; closed with `aria-disabled` when it cannot be written. `data` names the group the screen wires
 * (`data-after-fans`); each face carries its number in `data-die`.
 */
export function facesMarkup({ name, faces, value, closed, data }) {
  const entry = faces.includes(value) ? value : faces[0];
  const items = faces.map((face) => `<button type="button" class="g-prep__face" role="radio" aria-checked="${face === value}" tabindex="${face === entry ? 0 : -1}"`
    + `${closed ? ' aria-disabled="true"' : ""} data-die="${face}">${face}</button>`).join("");
  return `<div class="g-prep__faces g-prep__faces--${faces.length === 6 ? 6 : 3}" role="radiogroup" aria-label="${escapeHtml(name)}" ${data}>${items}</div>`;
}

/** The chip of the opponent's line a desk puts over its button (DeskPostResult.html, DeskPostPlayers.html): the accent once the opponent has done their part. */
export function opponentLeadMarkup(model) {
  if (!model.opponent.text) return "";
  return `<span class="g-after__lead">${renderStatusChip({ label: model.opponent.text, tone: model.opponent.done ? "live" : "wait" })}</span>`;
}

/** An injury as the post-match names it (PostPlayers.html, PostReview.html: the Casualty Table's names): «Lasting Injury (AG)». */
export function postInjuryWords({ code, stat }) {
  const injury = t(`after.injury.${code}`);
  return stat ? t("after.injuryStat", { injury, stat: t(`stats.${stat}`) }) : injury;
}

/** «+3 for the win, +1 for 3+ CAS»: the points of a match in the parts they add up to (`postPoints`). */
export function pointWords(points) {
  return points.parts.map((part) => t(`after.part.${part.key}`, { points: part.points })).join(", ");
}

/** The step's footer leading on to `next` (a link), with what more it carries. */
export const nextLink = (model, next, more = {}) => ({ kind: "next", label: t(`after.next.${next}`), href: postMatchUrl(model.gameId, next), disabled: false, hint: "", quiet: null, ...more });

/** The step's footer writing `action`, closed with why while `hint` says it cannot. */
export const actionFooter = (action, label, hint = "", more = {}) => ({ kind: "action", action, label, disabled: Boolean(hint), hint, quiet: null, ...more });

// ———————————————————————————————————— the score ————————————————————————————————————

/**
 * The score's draft as the page starts it: the score sent, else what each side's records add up to (zeros for a side
 * with none), the mode played; nothing changed, nothing unlocked. The reason of a technical result is the one sent —
 * none ("") for a score sent before stage 12, or not technical: the step asks for it.
 * @returns {{mode: string, winner: string, reason: string, own: {touchdowns: number, casualties: number}, other: {touchdowns: number, casualties: number}, changed: boolean, unlocked: boolean}}
 */
export function resultDraft(model) {
  const { post, sideName } = model;
  const rival = otherSide(sideName);
  if (post.result) {
    const { mode, winner } = post.result;
    return { mode, winner, reason: post.result.reason ?? "", own: { ...post.result[sideName] }, other: { ...post.result[rival] }, changed: false, unlocked: false };
  }
  const records = (name) => {
    const read = sideRecords(post[name]);
    return { touchdowns: read?.touchdowns ?? 0, casualties: read?.casualties ?? 0 };
  };
  return { mode: "played", winner: "", reason: "", own: records(sideName), other: records(rival), changed: false, unlocked: false };
}

/**
 * The score the draft stands for, as the domain writes it (`setResult`): a technical one 2–0 to its winner, CAS 0, with
 * its reason ("" until one is picked); a winner only when not played (ours until the coach picks).
 */
function draftScore(model, draft) {
  const own = model.sideName, rival = otherSide(own);
  const mode = RESULT_MODES.includes(draft.mode) ? draft.mode : "played";
  const winner = mode === "played" ? "" : [own, rival].includes(draft.winner) ? draft.winner : own;
  if (mode === "technical") {
    const side = (name) => ({ touchdowns: name === winner ? 2 : 0, casualties: 0 });
    const reason = TECHNICAL_REASONS.includes(draft.reason) ? draft.reason : "";
    return { mode, winner, reason, [own]: side(own), [rival]: side(rival) };
  }
  return { mode, winner, [own]: { touchdowns: draft.own.touchdowns, casualties: draft.own.casualties }, [rival]: { touchdowns: draft.other.touchdowns, casualties: draft.other.casualties } };
}

/** The action «Send the score» writes: the draft's score as the domain takes it — a technical one with its reason, another mode with none. */
export function resultAction(model, draft) {
  const score = draftScore(model, draft);
  const reason = score.mode === "technical" ? { reason: score.reason } : {};
  return { type: "result", mode: score.mode, winner: score.winner, ...reason, home: score.home, away: score.away };
}

/** Why the draft's score cannot be sent, "" when it can: a concession's score the domain refuses, a technical result with no reason picked. */
function resultRefusal(score) {
  if (concededRefused(score)) return t("after.concededScore");
  return score.mode === "technical" && !score.reason ? t("after.reasonFirst") : "";
}

/** A concession's score the domain refuses (pre-flight L14): the winner under 2 TD, or the loser with any. */
function concededRefused(score) {
  if (!score.mode.startsWith("conceded")) return false;
  return score[score.winner].touchdowns < 2 || score[otherSide(score.winner)].touchdowns !== 0;
}

/** «TD: L. Ashby, R. Pike · CAS: T. Gruk ×2, W. Brandt»: who scored and who hurt, in the records' order. */
function scorersWords(records) {
  const names = (counter) => records.scorers.filter((scorer) => scorer[counter] > 0)
    .map((scorer) => (scorer[counter] > 1 ? `${scorer.name} ×${scorer[counter]}` : scorer.name)).join(", ") || "—";
  return t("after.scorers", { td: names("touchdowns"), cas: names("casualties") });
}

/** «From the match records» (PostResult.html): ours with the scorers, the opponent's from their records, how many steps each. */
function recordsCard(model) {
  const own = sideRecords(model.post[model.sideName]), other = sideRecords(model.post[otherSide(model.sideName)]);
  const none = t("after.noRecords");
  const totals = (records) => (records ? t("after.totals", { td: records.touchdowns, cas: records.casualties }) : "—");
  const tally = t("after.recordsCount", { own: own ? own.count : "—", other: other ? other.count : "—" });
  return `<div class="g-after__card g-after__card--tight"><div class="g-after__head">${labelMarkup(t("after.records"))}<span class="g-after__tally">${escapeHtml(tally)}</span></div>`
    + rowMarkup(t("after.yours"), totals(own), { sub: own ? scorersWords(own) : none, tone: "keep" })
    + rowMarkup(t("after.theirs"), totals(other), { sub: other ? t("after.theirsSub") : none, tone: "keep" })
    + `${noteMarkup(t("after.recordsNote"))}</div>`;
}

/** One side's − count + for one counter (`data-score-key="own:touchdowns"`, pre-flight L20): closed at 0 and 99, and all of it while `locked`. */
function counterMarkup({ which, counter, value, team, locked }) {
  const named = { team, counter: t(`after.stat.${counter}`) };
  const minus = renderStepButton({ hook: "score", delta: -1, label: t("after.fewer", named), disabled: locked || value <= 0, className: "g-after__step" });
  const plus = renderStepButton({ hook: "score", delta: 1, label: t("after.more", named), disabled: locked || value >= MOST, className: "g-after__step" });
  return `<span class="g-after__counter" role="group" aria-label="${escapeHtml(`${team} · ${named.counter}`)}" data-score-key="${which}:${counter}">`
    + `${minus}<span class="g-after__value">${escapeHtml(value)}</span>${plus}</span>`;
}

/** The steppers' card: the teams, TD and CAS of both — ours at the left —, and what the score gives this side. */
function scoreCard(model, score, locked) {
  const own = model.sideName, rival = otherSide(own);
  const teams = { own: model.post[own].team.name, other: model.post[rival].team.name };
  const line = (counter) => `<div class="g-after__score">${counterMarkup({ which: "own", counter, value: score[own][counter], team: teams.own, locked })}`
    + `<span class="g-after__counterk">${escapeHtml(t(`after.stat.${counter}`))}</span>`
    + `${counterMarkup({ which: "other", counter, value: score[rival][counter], team: teams.other, locked })}</div>`;
  const friendly = model.kind === "friendly";
  const points = postPoints({ result: score }, own, model.kind);
  const outcome = t(`after.outcome.${postOutcome({ result: score }, own)}`);
  const forYou = friendly ? `<span class="g-after__for">${escapeHtml(t("after.offTable"))}</span>`
    : `<span class="g-after__for">${escapeHtml(t("after.forYou", { outcome }))}</span><b class="g-after__pts">${escapeHtml(t("after.points", { points: points.total }))}</b>`;
  return `<div class="g-after__card"><div class="g-after__teams"><span>${escapeHtml(teams.own)}</span><span class="g-after__teamr">${escapeHtml(teams.other)}</span></div>`
    + `${line("touchdowns")}${line("casualties")}<div class="g-after__forrow">${forYou}</div></div>`;
}

/**
 * «The score does not match the records» (PostResultMismatch.html): ours counter by counter, the opponent's in a word
 * (`ownOnly`: not theirs — the Players step sets ours right), then where to fix it. `post` is the post-match with the
 * page's draft in it: the score's, or the Players step's statistics.
 */
export function mismatchMarkup(model, post, { ownOnly = false } = {}) {
  const mismatches = scoreMismatches(post).filter((item) => !ownOnly || item.side === model.sideName);
  if (!mismatches.length) return "";
  const parts = mismatches.filter((item) => item.side === model.sideName)
    .map((item) => t("after.mismatchOwn", { counter: t(`after.stat.${item.counter}`), score: item.score, records: item.records }));
  if (mismatches.some((item) => item.side !== model.sideName)) parts.push(t("after.mismatchOther"));
  return `<div class="g-after__alert" role="alert"><b class="g-after__alerttitle">${escapeHtml(t("after.mismatch"))}</b>`
    + `<span class="g-after__alerttext">${escapeHtml(`${parts.join("; ")}. ${t("after.mismatchTail")}`)}</span></div>`;
}

/**
 * «Why technical» (stage 12): a radio group of `TECHNICAL_REASONS` (`data-after-reason`), the one picked checked, the
 * first in the tab order while none is; «The opponent could not field a team» says the league's 2 more under it.
 */
function reasonsMarkup(score, locked) {
  const name = t("after.reasonLabel");
  const entry = TECHNICAL_REASONS.includes(score.reason) ? score.reason : TECHNICAL_REASONS[0];
  const items = TECHNICAL_REASONS.map((reason) => {
    const on = reason === score.reason;
    const sub = reason === "no_team" ? `<span class="g-after__reasonsub">${escapeHtml(t("after.reasonBonus", { points: seasonPoints.noTeamBonus }))}</span>` : "";
    return `<button type="button" class="g-after__reason" role="radio" aria-checked="${on}" tabindex="${reason === entry ? 0 : -1}"${locked ? ' aria-disabled="true"' : ""} data-reason="${reason}">`
      + `<span class="g-after__reasonl">${escapeHtml(t(`after.reason.${reason}`))}</span>${sub}</button>`;
  }).join("");
  return `${labelMarkup(name)}<div class="g-after__reasons" role="radiogroup" aria-label="${escapeHtml(name)}" data-after-reason>${items}</div>`;
}

/** «How the match ended» (a 2×2 radio group, `data-after-mode`), who won when it was not played, why when technical, and what the modes mean. */
function modeCard(model, score, locked) {
  const items = RESULT_MODES.map((mode) => {
    const on = mode === score.mode;
    return `<button type="button" class="g-after__mode" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}"${locked ? ' aria-disabled="true"' : ""} data-mode="${mode}">`
      + `${escapeHtml(t(`after.mode.${mode}`))}</button>`;
  }).join("");
  const group = `<div class="g-after__modes" role="radiogroup" aria-label="${escapeHtml(t("after.howEnded"))}" data-after-mode>${items}</div>`;
  const winner = score.mode === "played" ? ""
    : renderSegmentedControl({ label: t("after.winner"), selected: score.winner, data: { segGroup: "after-winner" },
      items: ["home", "away"].map((value) => ({ value, label: model.post[value].team.name, disabled: locked })) });
  const technical = score.mode === "technical" ? `${reasonsMarkup(score, locked)}${noteMarkup(t("after.technicalNote"))}` : "";
  return `<div class="g-after__card">${labelMarkup(t("after.howEnded"))}${group}${winner ? `${labelMarkup(t("after.winner"))}${winner}` : ""}`
    + `${technical}${noteMarkup(t("after.modeNote"))}</div>`;
}

/** The score's footer (decision «How each write goes»): send; confirm the opponent's; wait for them; once agreed on, with a quiet way to change it. */
function resultFooter(model, draft, score) {
  const { post, sideName } = model;
  if (post.result?.official || model.completed || model.confirmed) return nextLink(model, "fans");
  const refused = resultRefusal(score);
  if (model.agreed && !draft.unlocked) return nextLink(model, "fans", { quiet: { action: "unlock-result", label: t("after.change") } });
  if (model.agreed) return actionFooter("result", t("after.send"), refused || (draft.changed ? "" : t("after.changeFirst")));
  if (!post.result) return actionFooter("result", t("after.send"), refused);
  const ours = post.result.accepted[sideName];
  if (draft.changed) return actionFooter("result", t(ours ? "after.send" : "after.sendOwn"), refused);
  if (!ours) return actionFooter("agree-result", t("after.agree", { score: scoreWords(post, sideName) }));
  return nextLink(model, "fans", { disabled: true, hint: t("after.waitAgree") });
}

/**
 * The score (PostResult.html): the records, the steppers, the mismatch, how the match ended, the note on agreeing.
 * @param {ReturnType<typeof import("./post-model.mjs").postModel>} model @param {ReturnType<typeof resultDraft>} draft
 */
export function resultStep(model, draft) {
  const { post } = model;
  const official = Boolean(post.result?.official);
  const locked = official || model.completed || model.confirmed || (model.agreed && !draft.unlocked);
  const score = draftScore(model, draft);
  const contentHtml = `${official ? renderCallout({ title: t("after.official") }) : ""}${recordsCard(model)}`
    + `${scoreCard(model, score, locked || score.mode === "technical")}${mismatchMarkup(model, { ...post, result: score })}`
    + `${official ? "" : modeCard(model, score, locked)}${noteMarkup(t("after.agreeNote"))}`;
  return { contentHtml, asideHtml: "", footer: resultFooter(model, draft, score) };
}

// ———————————————————————————————————— the income ————————————————————————————————————

/** The income's draft as the page starts it: what the side holds. */
export function fansDraft(model) {
  const side = model.post[model.sideName];
  return { roll: side.fansRoll || null, technicalRoll: side.technicalRoll || null, painted: Boolean(side.painted), stalling: Boolean(side.stalling) };
}

/** The post-match with the draft in the side, for the domain to count over. */
function withFans(model, draft) {
  const side = model.post[model.sideName];
  return { ...model.post, [model.sideName]: { ...side, fansRoll: draft.roll || null, technicalRoll: draft.technicalRoll || null, painted: Boolean(draft.painted), stalling: Boolean(draft.stalling) } };
}

/** What the fans' die is after this match: none at a draw, a D3 for the side that conceded (not «no penalty», L15), else a D6 after a win or a loss. */
function fansDie(post, name) {
  const outcome = postOutcome(post, name);
  if (outcome === "draw") return { outcome, faces: [] };
  if (post.result.mode === "conceded" && outcome === "loss") return { outcome, conceded: true, faces: [1, 2, 3] };
  return { outcome, faces: [1, 2, 3, 4, 5, 6] };
}

/** The Dedicated Fans card: the die, what the fans will be, and why (PostFans.html). */
function fansCard(model, draft, closed) {
  const side = model.post[model.sideName], fans = Number(side.baseRoster.dedicatedFans) || 0;
  const die = fansDie(model.post, model.sideName);
  if (!die.faces.length) return `<div class="g-after__card">${labelMarkup(t("after.fansRoll"))}${noteMarkup(t("after.fansDraw", { fans }))}</div>`;
  const name = t(die.conceded ? "after.fansRollConceded" : die.outcome === "win" ? "after.fansRoll" : "after.fansRollLoss");
  const faces = facesMarkup({ name, faces: die.faces, value: draft.roll, closed, data: "data-after-fans" });
  const next = nextDedicatedFans(withFans(model, draft), model.sideName);
  const words = next > fans ? t("after.fansUp", { from: fans, to: next }) : next < fans ? t("after.fansDown", { from: fans, to: next }) : t("after.fansSame", { fans });
  const result = draft.roll ? `<b class="g-after__fans${next > fans ? " g-after__fans--up" : ""}">${escapeHtml(words)}</b>` : "";
  const why = t(die.conceded ? "after.fansWhyConceded" : die.outcome === "win" ? "after.fansWhyWin" : "after.fansWhyLoss", { fans });
  return `<div class="g-after__card">${labelMarkup(name)}${faces}${result}${noteMarkup(why)}</div>`;
}

/** The technical win's D3 of income: (D3 + 2) × 10k. */
function technicalCard(model, draft, closed) {
  const name = t("after.technicalRoll");
  return `<div class="g-after__card">${labelMarkup(name)}${facesMarkup({ name, faces: [1, 2, 3], value: draft.technicalRoll, closed, data: "data-after-technical" })}</div>`;
}

/** «Income from the match» line by line, as `postIncome` counts it over the draft, and the total in Oswald 28. */
function incomeCard(model, draft) {
  const post = withFans(model, draft), name = model.sideName, result = post.result;
  const income = postIncome(post, name);
  const loser = result.mode === "conceded" && postOutcome(post, name) === "loss";
  let rows;
  if (loser) rows = noteMarkup(t("after.noIncome"));
  else if (result.mode === "technical") rows = rowMarkup(t("after.technicalIncome"), formatMoney(income.technicalIncome));
  else {
    const factor = (key) => Number(post[key].snapshot.fanFactor || 0) + fanFactorBonus(post[key]);
    const per = result.mode === "conceded" ? 10 : 5;
    rows = rowMarkup(t("after.attendance"), formatMoney(income.attendanceIncome), { sub: t("after.attendanceSub", { home: factor("home"), away: factor("away"), sum: income.attendance, per }) })
      + rowMarkup(t("after.touchdowns"), formatMoney(income.touchdownsIncome), { sub: t("after.touchdownsSub", { count: result[name].touchdowns }) })
      + rowMarkup(t("after.nonStalling"), formatMoney(income.nonStallingIncome))
      + rowMarkup(t("after.painting"), formatMoney(income.paintingIncome));
  }
  return `<div class="g-after__card g-after__card--rows">${labelMarkup(t("after.income"))}${rows}`
    + `<div class="g-after__total"><span class="g-after__totalk">${escapeHtml(t("after.total"))}</span><span class="g-after__big">+${escapeHtml(formatMoney(income.total))}</span></div></div>`;
}

/** The two switches (PostFans.html): stalling where it costs the 10k, the painting where it pays; none where nothing is earned. */
function switchesCard(model, draft, closed) {
  const { post, sideName } = model;
  const mode = post.result.mode, outcome = postOutcome(post, sideName);
  if (mode === "technical" || (mode === "conceded" && outcome === "loss")) return "";
  const stalling = mode === "conceded" ? "" : renderToggle({ key: "stalling", label: t("after.stalling"), caption: t("after.stallingSub"), checked: draft.stalling, disabled: closed });
  const painted = renderToggle({ key: "painted", label: t("after.painted"), caption: t("after.paintedSub", { bonus: PAINTING_BONUS }), checked: draft.painted, disabled: closed });
  return `<div class="g-after__card g-after__card--switches">${stalling}${painted}</div>`;
}

/**
 * The income (PostFans.html): the fans' die, the technical win's D3, the income and the switches. «Next: players» sends
 * them (`fans`), closed while a die the step needs is not marked.
 * @param {ReturnType<typeof import("./post-model.mjs").postModel>} model @param {ReturnType<typeof fansDraft>} draft
 */
export function fansStep(model, draft) {
  const { post, sideName } = model;
  const closed = model.readonly;
  const technical = post.result.mode === "technical" && postOutcome(post, sideName) === "win";
  const die = fansDie(post, sideName);
  const contentHtml = `${fansCard(model, draft, closed)}${technical ? technicalCard(model, draft, closed) : ""}${incomeCard(model, draft)}${switchesCard(model, draft, closed)}`;
  if (closed) return { contentHtml, asideHtml: "", footer: nextLink(model, "players") };
  const missing = die.faces.length && !draft.roll ? die.faces.length : technical && !draft.technicalRoll ? 3 : 0;
  const hint = missing === 6 ? t("after.fansNeedRoll") : missing ? t("after.fansNeedD3") : "";
  return { contentHtml, asideHtml: "", footer: actionFooter("fans", t("after.next.players"), hint) };
}
