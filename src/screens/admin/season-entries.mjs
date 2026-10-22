/**
 * «Season · Entries» (stage 12, decisions 6 and 20; DeskAdminEntries.html): who plays the season, as a model and its
 * markup.
 *
 * - «Playoffs»: how many places the league table draws its zone around (`seasons.playoff_places`, 1–64), or none — then
 *   the table has no zone (the owner's answer). The prototypes have no such card (pre-flight L21: one of the
 *   differences the spec's §7 lists); it is drawn as the screen's other cards are.
 * - «Entries · 8»: each team in the season with its coach, and where it is in its life — in the season, or still in
 *   its build with what it has spent of the starting budget (`startingBudget` less its treasury, the admin's block of
 *   `/api/season`). A build moves into the season (`POST /api/teams/:id/activate`), which closes its Start Re-rolls
 *   and opens its Team Re-rolls; any entry is withdrawn (it stays in the table and the history, out of new rounds).
 *   «+ Entry» adds a coach's team that has no entry, from a coach who has none either: one team of a coach a season.
 * - «Withdrawn · N», folded: a withdrawn team enters again by «+ Entry».
 *
 * The screen (`season.mjs`) owns the visit: what is typed, what is open, the write on its way. Long names wrap;
 * nothing is cut.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { adminTeamEditUrl } from "../../core/routes.mjs";
import { startingBudget } from "../../domain/league-rules.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderOptionList } from "../../ui/option-card.mjs";
import { renderSheet } from "../../ui/sheet.mjs";
import { renderTextField } from "../../ui/text-field.mjs";
import { actionMarkup } from "./season-rounds.mjs";

/** The «+ Entry» sheet's id: what the screen opens it by. */
export const ENTRY_SHEET = "admin-entry";
/** The playoff places a season takes (017's CHECK; `PATCH /api/season/admin/settings`). */
export const PLAYOFF_PLACES = Object.freeze({ min: 1, max: 64 });

const PLACES_FIELD = "admin-playoff-places";

/**
 * The playoff places as typed: a whole number from 1 to 64, or nothing for no zone; anything else is said before it is
 * sent.
 * @param {string} typed
 * @returns {{value: number|null}|{error: string}}
 */
export function placesFrom(typed) {
  const value = String(typed ?? "").trim();
  if (!value) return { value: null };
  const places = /^\d+$/.test(value) ? Number(value) : NaN;
  if (places >= PLAYOFF_PLACES.min && places <= PLAYOFF_PLACES.max) return { value: places };
  return { error: t("adminSeason.playoffInvalid", PLAYOFF_PLACES) };
}

/** A count that is a number, else null (a treasury the block does not say). */
const amountOf = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

/** One entry as the screen shows it: its team and coach, its stage, what a build has spent, where its team is edited. */
function lineOf(entry, savedTeams) {
  const teamId = entry.team?.id ?? "", coachId = entry.user?.id ?? "";
  const saved = savedTeams.get(teamId);
  // A team the block does not name is one of before stage 12, when every team played: in the season.
  const stage = saved?.stage === "draft" ? "draft" : "active";
  const treasury = stage === "draft" ? amountOf(saved?.treasury) : null;
  return {
    id: entry.id, teamId, coachId, team: entry.team?.name ?? "—", coach: entry.user?.login ?? "", stage, treasury,
    spent: treasury !== null && treasury <= startingBudget ? startingBudget - treasury : null,
    href: teamId && coachId ? adminTeamEditUrl(coachId, teamId) : "",
  };
}

/**
 * The season's entries as the admin keeps them.
 * @param {object|null} seasonData `/api/season` as the admin reads it
 * @returns {{places: number|null, entries: object[], withdrawn: object[], candidates: {teamId: string, label: string, team: string, coach: string, stage: string}[],
 *   noCandidate: string}}
 *   an entry `{id, teamId, coachId, team, coach, stage: "active"|"draft", treasury, spent, href}` (`spent` and `treasury`
 *   null but for a build); a candidate is a coach's team that may enter; `noCandidate` why none may ("" while one may):
 *   every team of the coaches is entered, or the teams that are not are of coaches who play the season with another
 */
export function entriesModel(seasonData) {
  const savedList = seasonData?.admin?.savedTeams ?? [];
  const savedTeams = new Map(savedList.map((team) => [team.id, team]));
  const active = (seasonData?.entries ?? []).filter((entry) => !entry.withdrawnAt);
  const teamsIn = new Set(active.map((entry) => entry.team?.id)), coachesIn = new Set(active.map((entry) => entry.user?.id));
  const places = Number(seasonData?.season?.playoffPlaces);
  const out = savedList.filter((team) => !teamsIn.has(team.id));
  const candidates = out.filter((team) => !coachesIn.has(team.owner?.id)).map((team) => ({
    teamId: team.id, team: team.name ?? "—", coach: team.owner?.login ?? "", stage: team.stage === "draft" ? "draft" : "active",
    label: t("adminSeason.entryOption", { team: team.name ?? "—", coach: team.owner?.login ?? "" }),
  }));
  return {
    places: Number.isInteger(places) && places >= PLAYOFF_PLACES.min ? places : null,
    entries: active.map((entry) => lineOf(entry, savedTeams)),
    withdrawn: (seasonData?.historicalEntries ?? []).filter((entry) => entry.withdrawnAt).map((entry) => lineOf(entry, savedTeams)),
    candidates,
    noCandidate: candidates.length ? "" : t(out.length ? "adminSeason.noCandidatesCoach" : "adminSeason.noCandidates"),
  };
}

// ———————————————————————————————————— the markup ————————————————————————————————————

/** A card's head: its title (where the focus goes when a write took away what had it) and its button. */
function headMarkup(title, actions = "", data = "") {
  return `<div class="g-adminseason__head"><h2 class="g-adminseason__title" tabindex="-1" data-season-card${data}>${escapeHtml(title)}</h2>`
    + `${actions ? `<span class="g-adminseason__actions">${actions}</span>` : ""}</div>`;
}

/** «Playoffs»: the places, «Save» beside them, the rule under them; what was typed stays until it is saved. */
function playoffMarkup(model, { busy, places, placesError }) {
  const value = places ?? (model.places === null ? "" : String(model.places));
  const save = `<button type="submit" class="g-adminseason__btn g-adminseason__btn--go"${busy === "places" ? ' aria-busy="true" aria-disabled="true"' : ""}`
    + ` data-entries-places-save>${escapeHtml(t("common.save"))}</button>`;
  const fieldHtml = renderTextField({
    id: PLACES_FIELD, name: "playoffPlaces", label: t("adminSeason.playoffPlaces"), value, inputmode: "numeric", autocomplete: "off",
    help: t("adminSeason.playoffNote"), error: placesError, actionHtml: save,
  });
  return `<section class="g-admin__card g-adminentries__playoff">${headMarkup(t("adminSeason.playoff"))}`
    + `<form class="g-adminentries__places" data-entries-places novalidate>${fieldHtml}</form></section>`;
}

/** What a row says of its team: in the season; in the build with what it spent, or its treasury when it holds more than it started with. */
function statusWords(line) {
  if (line.stage === "active") return t("adminSeason.entryActive");
  if (line.spent !== null) return t("adminSeason.entryBuild", { spent: formatMoney(line.spent), budget: formatMoney(startingBudget) });
  return line.treasury === null ? t("adminSeason.entryDraft") : t("adminSeason.entryBuildTreasury", { treasury: formatMoney(line.treasury) });
}

/** The team (a link to its edit) and its coach under it. */
function whoMarkup(line) {
  if (line.href) assertLinkHref(line.href);
  const team = line.href ? `<a class="g-adminentries__team" href="${escapeHtml(line.href)}">${escapeHtml(line.team)}</a>`
    : `<b class="g-adminentries__team">${escapeHtml(line.team)}</b>`;
  return `<span class="g-adminentries__who">${team}<span class="g-adminentries__coach">${escapeHtml(line.coach)}</span></span>`;
}

/**
 * An entry: who, its status, «Move into the season» for a build, «Withdraw from the season». The row and its buttons are
 * keyed by the entry: a row withdrawn, or a button gone, takes its focus with it rather than hand it to another row's.
 */
function rowMarkup(line, busy) {
  const activate = line.stage === "draft"
    ? actionMarkup({ label: t("adminSeason.activate"), kind: "go", busy: busy === `activate:${line.teamId}`, data: { key: `activate-${line.id}`, entriesActivate: line.teamId, entriesEntry: line.id } })
    : "";
  const withdraw = actionMarkup({ label: t("adminSeason.withdraw"), kind: "danger", busy: busy === `withdraw:${line.id}`, data: { key: `withdraw-${line.id}`, entriesWithdraw: line.id } });
  return `<li class="g-adminentries__row" data-key="entry-${escapeHtml(line.id)}">${whoMarkup(line)}`
    + `<span class="g-adminentries__status g-adminentries__status--${line.stage}">${escapeHtml(statusWords(line))}</span>`
    + `<span class="g-adminentries__actions">${activate}${withdraw}</span></li>`;
}

/** «Entries · 8», «+ Entry» (closed with why when no team may enter), the rule, the rows. */
function listMarkup(model, busy) {
  const add = actionMarkup({ label: t("adminSeason.addEntry"), dialog: true, closed: model.noCandidate, data: { entriesAdd: "" } });
  const rows = model.entries.length
    ? `<ul class="g-adminentries__list">${model.entries.map((line) => rowMarkup(line, busy)).join("")}</ul>`
    : `<p class="g-admin__note">${escapeHtml(t("adminSeason.noEntries"))}</p>`;
  return `<section class="g-admin__card g-adminentries">${headMarkup(t("adminSeason.entriesCount", { count: model.entries.length }), add, " data-entries-title")}`
    + `<p class="g-admin__note">${escapeHtml(t("adminSeason.entriesNote"))}</p>${rows}</section>`;
}

/** «Withdrawn · 1» and «Show»; open, the teams and their coaches. None withdrawn: no card. */
function goneMarkup(model, open) {
  if (!model.withdrawn.length) return "";
  const toggle = `<button type="button" class="g-adminseason__btn" aria-expanded="${open}" aria-controls="season-withdrawn" data-entries-gone>`
    + `${escapeHtml(t(open ? "adminSeason.hide" : "adminSeason.show"))}</button>`;
  const rows = open ? model.withdrawn.map((line) => `<li class="g-adminentries__row" data-key="gone-${escapeHtml(line.id)}">${whoMarkup(line)}</li>`).join("") : "";
  return `<section class="g-admin__card g-adminentries__gone"><div class="g-adminseason__pasthead"><span class="g-adminseason__pastwords">`
    + `<b class="g-adminseason__pastname">${escapeHtml(t("adminSeason.withdrawn", { count: model.withdrawn.length }))}</b></span>${toggle}</div>`
    + `<ul class="g-adminentries__list" id="season-withdrawn"${open ? "" : " hidden"}>${rows}</ul></section>`;
}

/**
 * «Entries»: the playoff places, the entries, the withdrawn.
 * @param {ReturnType<typeof entriesModel>} model
 * @param {{busy?: string, places?: string|null, placesError?: string, goneOpen?: boolean}} [view] the write on its way (its key), the places as typed
 *   (null: the season's), why they were not sent, the withdrawn open
 */
export function entriesMarkup(model, { busy = "", places = null, placesError = "", goneOpen = false } = {}) {
  return playoffMarkup(model, { busy, places, placesError }) + listMarkup(model, busy) + goneMarkup(model, goneOpen);
}

/**
 * «+ Entry»'s sheet, closed: `patchWithModal(view, markup, "#admin-entry")` opens it. The coaches' teams that may enter
 * as option cards; «Enter into the season» closed until one is chosen; the last refusal in it.
 * @param {ReturnType<typeof entriesModel>} model
 * @param {{draft: {teamId: string}, busy?: string, refusal?: string}} sheet
 */
export function entrySheetMarkup(model, { draft, busy = "", refusal = "" }) {
  const selected = model.candidates.some((candidate) => candidate.teamId === draft.teamId) ? draft.teamId : "";
  const options = model.candidates.map((candidate) => ({
    value: candidate.teamId, title: candidate.team, radio: true,
    sub: candidate.stage === "draft" ? t("adminSeason.candidateDraft", { coach: candidate.coach }) : candidate.coach,
  }));
  const list = options.length ? renderOptionList({ label: t("adminSeason.candidates"), options, selected })
    : `<p class="g-admin__note">${escapeHtml(model.noCandidate)}</p>`;
  const closed = selected ? "" : t("adminSeason.chooseTeam");
  const state = closed ? ` aria-disabled="true" title="${escapeHtml(closed)}"` : busy ? ' aria-busy="true" aria-disabled="true"' : "";
  const alert = `<div class="g-resultsheet__alert" role="alert">${refusal ? renderCallout({ tone: "danger", title: refusal }) : ""}</div>`;
  return renderSheet({
    id: ENTRY_SHEET,
    title: t("adminSeason.entrySheetTitle"),
    sub: t("adminSeason.entrySheetSub"),
    wide: true,
    bodyHtml: `<div class="g-resultsheet"${busy ? ' aria-busy="true"' : ""}>${list}${alert}</div>`,
    footHtml: `<button type="button" class="g-btn g-btn--primary g-resultsheet__save"${state} data-entry-save>${escapeHtml(t("adminSeason.enter"))}</button>`,
  });
}
