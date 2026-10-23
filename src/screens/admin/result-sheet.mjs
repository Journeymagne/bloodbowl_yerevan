/**
 * A pair's sheet in the admin's season (stage 12, decision 19): «Result…» of a round's row or of a score awaiting.
 * The prototypes have none; it is built of the kit's parts (the sheet, the segments, the counters, the option cards).
 *
 * Three kinds, by the pair:
 * - `pair`: a pair of a draft round, or one with no team yet: its home and away chosen among the season's entries
 *   («— no team —» for none; an entry drawn elsewhere in the round is not offered), «Save the pair», «Delete the pair».
 * - `post`: a pair its post-match keeps (`postMatchStatus` other than `not_started`): the result is the post-match's, and
 *   the sheet leads there; no manual result (the server would refuse it, `POST_RESULT_LOCKED`). A confirmed technical
 *   one's reason is changed alone (`PATCH …/technical-reason`): the reason and the points, nothing else.
 * - `result`: a score sent is confirmed or rejected; under it, the manual result: «Played» — the four counters (a bye's
 *   two, its one team's), or «Technical» — the winner, the reason (`TECHNICAL_REASONS`) and what the winner gets
 *   (`technicalPoints`: 4 when the opponent could not field a team, 2 for another reason; the loser 0). A friendly
 *   gives no points, so its technical result asks no reason: it is sent as «another reason». A pair of the round under
 *   way that has no result yet (nothing sent, no post-match) can be deleted from it too: a pair by hand set wrong.
 *
 * The sheet draws what it is given: the pair, the draft the screen keeps between presses, the write on its way and the
 * refusal of the last one (`role="alert"`, the server's words).
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { postMatchUrl } from "../../core/routes.mjs";
import { TECHNICAL_REASONS, seasonPoints, technicalPoints } from "../../domain/league-rules.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { renderOptionList } from "../../ui/option-card.mjs";
import { renderResourceCounter } from "../../ui/resource-counter.mjs";
import { renderSegmentedControl } from "../../ui/segmented-control.mjs";
import { renderSheet } from "../../ui/sheet.mjs";
import { actionMarkup } from "./season-rounds.mjs";

/** The sheet's id: what the screen opens it by. */
export const RESULT_SHEET = "admin-result";
/** A counter's top: what the server takes is any count, the sheet's steps stop here. */
export const MOST = 99;

const SIDES = ["home", "away"];
const COUNTERS = ["touchdowns", "casualties"];

/**
 * The draft a pair's sheet opens on: its technical result if it has one, else played; the score it holds, else the one
 * sent, else nothing (as 2.x's form did); the home side as the winner until another is chosen; no reason until one is;
 * the teams it is drawn with.
 */
export function adminResultDraft(line) {
  return {
    mode: line.technical ? "technical" : "played",
    winner: line.technical?.winner ?? "home",
    reason: line.technical?.reason ?? "",
    home: { ...line.values.home },
    away: { ...line.values.away },
    homeEntryId: line.home?.entryId ?? "",
    awayEntryId: line.away?.entryId ?? "",
  };
}

/**
 * What «Save the result» sends to `PATCH /api/games/:id`: a technical result its winner and reason (the server writes
 * 2–0 and the points; a friendly's reason is «another», none being asked); a played one its four numbers. A bye has one
 * team: its side's numbers, and none for the side with no team (2.x's form took four, the empty side's typed as
 * nothing), so the server can score it.
 */
export function adminResultBody(line, draft) {
  if (!line.bye && draft.mode === "technical") return { mode: "technical", winner: draft.winner, technicalReason: line.friendly ? "other" : draft.reason };
  const side = (name) => (line.bye && !line[name] ? { touchdowns: 0, casualties: 0 } : draft[name]);
  const home = side("home"), away = side("away");
  return { mode: "played", homeTouchdowns: home.touchdowns, awayTouchdowns: away.touchdowns, homeCasualties: home.casualties, awayCasualties: away.casualties };
}

/** The entries a side of the pair may take: those no other pair of the round holds, and the one it holds now (a withdrawn one too). */
function choicesOf(entries, taken, selected) {
  return entries.filter((entry) => entry.id === selected || (!entry.withdrawnAt && !taken.has(entry.id)));
}

/**
 * @param {object} line a line of `seasonRoundsModel` (or of its scores awaiting)
 * @param {object} [options]
 * @param {object[]} [options.entries] the season's entries, withdrawn ones too
 * @param {string} [options.phase] the round's status: a draft round's pairs are set, not scored
 * @param {Set<string>} [options.taken] the entries the round's other pairs hold
 * @param {object} [options.draft] what the screen keeps between presses (`adminResultDraft`)
 * @param {string} [options.busy] the write of the sheet on its way: "" for none
 * @param {string} [options.refusal] what the last write was told
 * @returns {object} `{kind: "pair"|"post"|"result", line, draft, busy, refusal, …}`: a pair's choices, a post-match's link, a result's modes
 */
export function resultSheetModel(line, { entries = [], phase = "started", taken = new Set(), draft = adminResultDraft(line), busy = "", refusal = "" } = {}) {
  const base = { line, draft, busy, refusal, title: titleOf(line), sub: subOf(line) };
  if (phase === "draft" || line.empty) {
    return { ...base, kind: "pair", home: choicesOf(entries, taken, draft.homeEntryId), away: choicesOf(entries, taken, draft.awayEntryId),
      same: Boolean(draft.homeEntryId) && draft.homeEntryId === draft.awayEntryId };
  }
  if (line.post) return { ...base, kind: "post", href: postMatchUrl(line.id), technical: line.technical };
  const sides = line.bye ? SIDES.filter((name) => line[name]) : SIDES;
  const points = !line.friendly && draft.reason ? technicalPoints({ won: true, reason: draft.reason }) : null;
  // Nothing on it yet — no result, no score sent, no post-match — a pair of the round under way may go (one by hand set wrong).
  const deletable = !line.friendly && phase === "started" && !line.scored && !line.proposal && (line.status === "pending" || line.status === "bye");
  return { ...base, kind: "result", sides, modes: !line.bye, proposal: line.proposal, points, friendly: line.friendly, deletable };
}

function titleOf(line) {
  return line.friendly ? t("adminSeason.friendlyTitle") : t("adminSeason.sheetTitle", { round: line.round, table: line.table });
}

function subOf(line) {
  const name = (side) => line[side]?.team ?? (line.bye ? t("adminSeason.bye") : t("adminSeason.noSide"));
  return t("adminSeason.vs", { home: name("home"), away: name("away") });
}

/** Why the sheet's button does not send yet, "" when it does. */
function missingOf(model) {
  if (model.kind === "pair") return model.same ? t("error.TEAM_PLAYS_ITSELF") : "";
  if (model.kind === "post") return model.draft.reason === model.technical?.reason ? t("adminSeason.reasonSame") : "";
  return model.modes && !model.friendly && model.draft.mode === "technical" && !model.draft.reason ? t("adminSeason.chooseReason") : "";
}

/** The sheet's one button: closed with what it misses, busy while its write is on its way. */
function footMarkup(model, label, data) {
  const closed = missingOf(model);
  const state = closed ? ` aria-disabled="true" title="${escapeHtml(closed)}"` : model.busy ? ' aria-busy="true" aria-disabled="true"' : "";
  return `<button type="button" class="g-btn g-btn--primary g-resultsheet__save"${state} data-${data}>${escapeHtml(label)}</button>`;
}

/** Always in the sheet, so a screen reader hears what is put in it; empty until a write is refused. */
const alertMarkup = (refusal) => `<div class="g-resultsheet__alert" role="alert">${refusal ? renderCallout({ tone: "danger", title: refusal }) : ""}</div>`;

const labelMarkup = (text) => `<p class="g-resultsheet__label">${escapeHtml(text)}</p>`;
const noteMarkup = (text) => `<p class="g-admin__note">${escapeHtml(text)}</p>`;

/** The reasons as option cards: «The opponent could not field a team» with its +2, «Another reason». */
function reasonsMarkup(selected) {
  const options = TECHNICAL_REASONS.map((reason) => ({
    value: reason, title: t(`adminSeason.reason.${reason}`), radio: true,
    sub: reason === "no_team" ? t("adminSeason.reasonBonus", { points: seasonPoints.noTeamBonus }) : "",
  }));
  return labelMarkup(t("adminSeason.reason")) + renderOptionList({ label: t("adminSeason.reason"), options, selected });
}

/** A side's two counters (TD, CAS), named with its team: 0 to 99. */
function countersMarkup(model, name) {
  const team = model.line[name]?.team ?? "—";
  return COUNTERS.map((counter) => {
    const value = model.draft[name][counter];
    return renderResourceCounter({
      key: `${name}-${counter}`, name: t("adminSeason.counter", { team, counter: t(`adminSeason.${counter === "touchdowns" ? "td" : "cas"}`) }), value,
      incBlockedReason: value >= MOST ? t("adminSeason.atMost", { most: MOST }) : "",
    });
  }).join("");
}

/** «Score sent: 2–1 · CAS 1:0 · thalion», «Confirm the score», «Reject». */
function proposalMarkup(model) {
  const sent = model.proposal;
  const score = t("adminSeason.score", { home: sent.home, away: sent.away, homeCas: sent.homeCas, awayCas: sent.awayCas });
  const words = sent.by ? t("adminSeason.proposal", { score, by: sent.by }) : t("adminSeason.proposalNoOne", { score });
  return `<div class="g-resultsheet__proposal"><p class="g-resultsheet__sent">${escapeHtml(words)}</p><span class="g-resultsheet__answers">`
    + actionMarkup({ label: t("adminSeason.confirm"), kind: "go", busy: model.busy === "confirm", data: { resultConfirm: "" } })
    + actionMarkup({ label: t("adminSeason.reject"), busy: model.busy === "reject", data: { resultReject: "" } })
    + `</span></div>${labelMarkup(t("adminSeason.manual"))}`;
}

/** The manual result: the mode, then the counters or the winner, the reason and the points. */
function resultBodyMarkup(model) {
  const { draft, line } = model;
  const proposal = model.proposal ? proposalMarkup(model) : "";
  const modes = model.modes ? renderSegmentedControl({ label: t("adminSeason.mode"), selected: draft.mode, data: { segGroup: "result-mode" },
    items: ["played", "technical"].map((value) => ({ value, label: t(`adminSeason.mode.${value}`) })) }) : "";
  if (model.modes && draft.mode === "technical") {
    const winner = renderSegmentedControl({ label: t("adminSeason.winner"), selected: draft.winner, data: { segGroup: "result-winner" },
      items: SIDES.map((value) => ({ value, label: line[value].team })) });
    const points = model.points === null ? "" : `<p class="g-resultsheet__points">${escapeHtml(t("adminSeason.winnerPoints", { points: model.points }))}</p>`;
    // A friendly gives no points: no reason to ask, nor a bonus to promise.
    const reasons = model.friendly ? noteMarkup(t("adminSeason.friendlyTechnical")) : `${reasonsMarkup(draft.reason)}${points}${noteMarkup(t("adminSeason.technicalNote"))}`;
    return `${proposal}${modes}${labelMarkup(t("adminSeason.winner"))}${winner}${reasons}${deleteMarkup(model)}`;
  }
  const bye = line.bye ? noteMarkup(t("adminSeason.byeNote")) : "";
  return `${proposal}${modes}${bye}<div class="g-resultsheet__counters">${model.sides.map((name) => countersMarkup(model, name)).join("")}</div>${deleteMarkup(model)}`;
}

/** «Delete the pair» under a result's controls, for a pair of the round under way with nothing on it yet. */
function deleteMarkup(model) {
  if (!model.deletable) return "";
  return actionMarkup({ label: t("adminSeason.deletePair"), kind: "danger", busy: model.busy === "delete", data: { pairDelete: "", pairTable: model.line.table } });
}

/** A side's select: «— no team —» and the entries it may take, «Team · coach». */
function selectMarkup(model, name) {
  const selected = model.draft[`${name}EntryId`];
  const option = (value, label) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
  const options = option("", t("adminSeason.noSide"))
    + model[name].map((entry) => option(entry.id, t("adminSeason.entryOption", { team: entry.team?.name ?? "—", coach: entry.user?.login ?? "" }))).join("");
  return `<label class="g-resultsheet__field"><span class="g-resultsheet__label">${escapeHtml(t(`adminSeason.col.${name}`))}</span>`
    + `<select class="g-resultsheet__select" data-pair-side="${name}">${options}</select></label>`;
}

function pairBodyMarkup(model) {
  return `${selectMarkup(model, "home")}${selectMarkup(model, "away")}`
    + actionMarkup({ label: t("adminSeason.deletePair"), kind: "danger", busy: model.busy === "delete", data: { pairDelete: "", pairTable: model.line.table } });
}

function postBodyMarkup(model) {
  const link = renderButton({ label: t("adminSeason.openPost"), href: model.href, data: { resultPost: "" } });
  const reason = model.technical ? `${reasonsMarkup(model.draft.reason)}${noteMarkup(t("adminSeason.reasonNote"))}` : "";
  return `${noteMarkup(t("adminSeason.byPost"))}<span class="g-resultsheet__link">${link}</span>${reason}`;
}

const FOOTS = {
  pair: (model) => footMarkup(model, t("adminSeason.savePair"), "pair-save"),
  post: (model) => (model.technical ? footMarkup(model, t("adminSeason.saveReason"), "result-reason-save") : ""),
  result: (model) => footMarkup(model, t("adminSeason.save"), "result-save"),
};

const BODIES = { pair: pairBodyMarkup, post: postBodyMarkup, result: resultBodyMarkup };

/**
 * The pair's sheet, closed: `patchWithModal(view, markup, "#admin-result")` opens it.
 * @param {ReturnType<typeof resultSheetModel>} model
 */
export function resultSheetMarkup(model) {
  return renderSheet({
    id: RESULT_SHEET,
    title: model.title,
    sub: model.sub,
    wide: true,
    bodyHtml: `<div class="g-resultsheet"${model.busy ? ' aria-busy="true"' : ""}>${BODIES[model.kind](model)}${alertMarkup(model.refusal)}</div>`,
    footHtml: FOOTS[model.kind](model),
  });
}
