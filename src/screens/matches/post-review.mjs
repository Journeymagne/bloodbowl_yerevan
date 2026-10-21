/**
 * The post-match's Summary step (stage 09b decision 18): PostReview.html on a phone, DeskPostReview.html on a desk —
 * both sides' cards (confirmed or waited for; the MVP, the SPP of the match, the injuries, the dead, the advancements,
 * the purchases, the money and the fans; the opponent's as the prototype has it: the MVP, the injuries, the dead, the
 * treasury), what the finish does, and on a desk the result with the points in parts at the right. The button confirms,
 * then finishes once the opponent has confirmed too; a finished post-match reads only and says so, with the way back
 * to the team's matches and to its roster, where the dead are among «The fallen».
 */
import { escapeHtml } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { teamUrl } from "../../core/routes.mjs";
import { otherSide } from "../../domain/match/rules.mjs";
import { fallenPlayers } from "../../domain/post-match/roster.mjs";
import { effectiveInjury, postOutcome } from "../../domain/post-match/rules.mjs";
import { postPoints } from "../../domain/post-match/score.mjs";
import { earnedSpp } from "../../domain/post-match/statistics.mjs";
import { sppCounterWeights } from "../../domain/roster/progression.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { gaveWords } from "../team/roster/player-access.mjs";
import { matchSpp, previewOf, scoreWords, signedMoney } from "./post-model.mjs";
import { purchasesWords } from "./post-roster.mjs";
import { actionFooter, noteMarkup, pointWords, postInjuryWords, rowMarkup } from "./post-steps.mjs";

/** A player of the side's match by id. */
const playerOf = (side, id) => side.snapshot.players.find((player) => player.id === id) ?? side.baseRoster.players.find((player) => player.id === id);

/** «L. Ashby · +5 SPP», two MVPs by a comma; the opponent's names alone (PostReview.html). */
function mvpWords(side, { own }) {
  const names = side.mvps.map((id) => playerOf(side, id)?.name ?? "").filter(Boolean).join(", ");
  if (!names) return "—";
  return own ? t("after.mvpLine", { names, spp: sppCounterWeights(side.reference).mvps }) : names;
}

/** «O. Krell · Lasting Injury (AG)»: the injuries that stand (rookie protection applied), the dead left to their own row. */
function injuriesWords(side) {
  return side.snapshot.players.map((player) => ({ player, injury: effectiveInjury(side, player.id) }))
    .filter(({ injury }) => !["none", "dead"].includes(injury.code))
    .map(({ player, injury }) => `${player.name} · ${postInjuryWords(injury)}`).join(", ") || "—";
}

/** «L. Ashby · Diving Catch»: the advancements this post-match takes, player by player. */
function advancementsWords(side) {
  return Object.entries(side.advancements).filter(([, choices]) => choices.length)
    .map(([id, choices]) => `${playerOf(side, id)?.name ?? ""} · ${choices.map((choice) => gaveWords({ type: choice.type, grants: choice.grant })).join(", ")}`).join("; ") || "—";
}

/** A side's card: the name, confirmed or waited for, and its rows. */
function sideCard(model, name, preview) {
  const own = name === model.sideName, side = model.post[name];
  const chip = side.confirmed ? renderStatusChip({ label: t("after.confirmed"), tone: "live" }) : renderStatusChip({ label: t("after.waitingChip"), tone: "wait" });
  const dead = fallenPlayers(side).map((player) => player.name).join(", ");
  const rows = [[t("after.row.mvp"), mvpWords(side, { own })]];
  if (own) {
    const scorers = side.snapshot.players.filter((player) => earnedSpp(model.post, name, player.id) > 0).length;
    rows.push([t("after.row.spp"), t("after.sppMatch", { spp: matchSpp(model.post, name), count: scorers })]);
  }
  rows.push([t("after.row.injuries"), injuriesWords(side)]);
  if (dead) rows.push([t("after.row.dead"), dead]);
  if (own) {
    const bought = purchasesWords({ ...model, preview });
    rows.push([t("after.row.advancements"), advancementsWords(side)],
      [t("after.row.purchases"), bought ? `${bought} · ${signedMoney(-preview.accounting.purchases)}` : "—"]);
    if (preview.accounting.sales > 0) rows.push([t("after.sales"), signedMoney(preview.accounting.sales)]);
  }
  rows.push([t("after.treasury"), `${formatMoney(Number(side.baseRoster.treasury) || 0)} → ${formatMoney(preview.roster.treasury)}`]);
  if (own) {
    rows.push([t("after.safe"), `${formatMoney(Number(side.baseRoster.coachesSafe) || 0)} → ${formatMoney(preview.roster.coachesSafe)}`],
      [t("after.row.fans"), `${Number(side.baseRoster.dedicatedFans) || 0} → ${preview.roster.dedicatedFans}`]);
  }
  return `<div class="g-after__card g-after__card--rows g-after__side"><div class="g-after__sidehead"><b class="g-after__team">${escapeHtml(side.team.name)}</b>${chip}</div>`
    + `${rows.map(([label, value]) => rowMarkup(label, value)).join("")}</div>`;
}

/** A desk's result at the right (DeskPostReview.html): «Result», «2–1» in Oswald 40, «Win · +3 for the win, +1 for 3+ CAS». */
function resultCard(model) {
  const { post, sideName } = model;
  const outcome = t(`after.outcome.${postOutcome(post, sideName)}`);
  const points = model.kind === "friendly" ? t("after.offTable") : pointWords(postPoints(post, sideName, model.kind));
  return `<div class="g-after__card g-after__card--tight"><span class="g-after__resultk">${escapeHtml(t("after.result"))}</span>`
    + `<span class="g-after__resultscore">${escapeHtml(scoreWords(post, sideName))}</span><span class="g-after__resultv">${escapeHtml(`${outcome} · ${points}`)}</span></div>`;
}

/** The summary's button: confirm, then finish once both have confirmed; none once finished. */
function reviewFooter(model) {
  if (model.completed) return { kind: "none", label: "", disabled: true, hint: "", quiet: null };
  if (!model.confirmed) return actionFooter("confirm", t("after.confirm"));
  return actionFooter("finish", t("after.finish"), model.post.status === "ready" ? "" : t("after.finishHint"));
}

/**
 * The summary (PostReview.html, DeskPostReview.html): both sides' cards and what the finish will do (not once it is
 * done); a desk's result in the right column. The card's title is the prototype's «Match summary».
 * @param {ReturnType<typeof import("./post-model.mjs").postModel>} model
 */
export function reviewStep(model) {
  const other = otherSide(model.sideName);
  const cards = `<div class="g-after__sides">${sideCard(model, model.sideName, model.preview)}${sideCard(model, other, previewOf(model.post, other, model.data))}</div>`;
  // What the finish will do, until it is done: then the «finished» callout over the cards says it.
  const note = model.completed ? "" : noteMarkup(t(model.kind === "friendly" ? "after.reviewNoteFriendly" : "after.reviewNote"));
  return { contentHtml: `${cards}${note}`, asideHtml: resultCard(model), footer: reviewFooter(model), cardTitle: t("after.reviewTitle") };
}

/** What a finished post-match says under the head: finished, and the way to the team's matches and to its roster. */
export function completedMarkup(model) {
  const links = renderButton({ label: t("after.toMatches"), href: teamUrl(model.teamId, "matches") }) + renderButton({ label: t("after.toRoster"), href: teamUrl(model.teamId, "roster") });
  return renderCallout({ title: t("after.completed"), actionHtml: `<span class="g-prep__links">${links}</span>` });
}
