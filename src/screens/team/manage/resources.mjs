/**
 * «Resources» of the team page (TeamManage, TeamManagePre): what the team holds — re-rolls, fans, coaches,
 * cheerleaders, bribes, the race's medics — each with its price, and the step that buys or sells one.
 *
 * Which row is open, why not, and what a step does to the roster are the model's (`resourceRows`, `stepResource`,
 * `canStepDown`); this file puts words on them, draws them, and sends the roster a step made. A row that is closed
 * says so in place of its price, and its «+» says it again when pressed (a touch screen has no hover): a closed
 * row is never silent. A step is one save of the whole roster, as the 2.x editor makes it; the answer replaces the
 * team in `state.myTeams`, and the page draws the new numbers from there (it listens to `onMyTeamsChange`).
 */
import { toast, toastError } from "../../../components/toast.mjs";
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { raceTeamOf } from "../../../data/teams.mjs";
import { isWriting, saveTeamRoster } from "../../../data/treasury.mjs";
import { combinedRerollsMaximum, medicalStaffDefinitions } from "../../../domain/league-rules.mjs";
import { renderResourceCounter, wireResourceCounters } from "../../../ui/resource-counter.mjs";
import { renderToggle, wireToggles } from "../../../ui/toggle.mjs";
import { canStepDown, resourceRows, stepResource } from "./model.mjs";
import { teamToast } from "./sheet-host.mjs";
import { isLive, teamOf } from "./team-of.mjs";

/** The two counters that share `combinedRerollsMaximum` between them. */
const REROLLS = ["startingRerolls", "teamRerolls"];

/** Why a row is closed, by the model's `lock`. Literal keys but the stage's, which the dictionary test walks. */
const LOCK_TEXT = {
  live: () => t("treasury.lockedLive"),
  stage: (row) => t(`treasury.lock.${row.key}`),
  fans: () => t("treasury.lock.dedicatedFans"),
  unavailable: () => t("newTeam.bribesLocked"),
};

/** A counter is named as the roster editor names it, a medic by its definition (the dictionaries keep those in English). */
function nameOf(row) {
  return row.kind === "medic" ? medicalStaffDefinitions.find(({ key }) => key === row.key).title : t(`savedRoster.${row.key}`);
}

/** The maximum is reached. Two re-roll counters share one limit, so it is said for both, never as the room one has left. */
function maxText(row, name) {
  if (!REROLLS.includes(row.key)) return t("validation.STAFF_MAX", { title: name, max: row.max });
  return t("validation.STAFF_MAX", { title: REROLLS.map((key) => t(`savedRoster.${key}`)).join(" + "), max: combinedRerollsMaximum });
}

/** The treasury cannot pay the price. */
const shortText = (row) => t("treasury.short", { price: formatMoney(row.price) });

/** Why «+» would not work on a row that is open: the maximum or the treasury; empty when it works. */
function refusalText(row, name) {
  if (row.incRefusal === "max") return maxText(row, name);
  return row.incRefusal === "short" ? shortText(row) : "";
}

/** The quieter line of a row that is open: what a purchase costs, or that the treasury cannot pay it. */
function noteOf(row) {
  if (row.incRefusal === "short") return shortText(row);
  const price = formatMoney(row.price);
  return REROLLS.includes(row.key) ? t(`treasury.note.${row.key}`, { price }) : t("newTeam.price", { price });
}

/** What a medic's switch says under its name: the lock, or whether the team has one and what it costs. */
function captionOf(row, reason) {
  if (reason) return reason;
  const price = formatMoney(row.price);
  if (row.value > 0) return t("treasury.medic.on", { price });
  return row.incRefusal === "short" ? shortText(row) : t("treasury.medic.off", { price });
}

/**
 * The words of one row of `resourceRows`.
 *
 * `lockedReason` shuts the whole counter (both buttons, the lock icon, the reason in place of the note). A row the
 * stage closes but whose purchase is on record is not shut whole — «−» takes the purchase back (`canStepDown`) — so
 * the stage speaks through `incBlockedReason` alone and `lockedReason` stays empty. `incBlockedReason` is the reason
 * for «+» on any row that has one: the lock, the maximum, or the treasury.
 *
 * @param {object} row a row of `resourceRows`
 * @returns {{name: string, note: string, noteTone: "danger"|"", lockedReason: string, incBlockedReason: string, caption: string}}
 */
export function resourceWords(row) {
  const name = nameOf(row);
  const reason = row.lock ? LOCK_TEXT[row.lock](row) : "";
  const takenBack = row.lock === "stage" && canStepDown(row);
  return {
    name,
    note: noteOf(row),
    noteTone: row.incRefusal === "short" ? "danger" : "",
    lockedReason: takenBack ? "" : reason,
    incBlockedReason: reason || refusalText(row, name),
    caption: row.kind === "medic" ? captionOf(row, reason) : "",
  };
}

function rowMarkup(row) {
  const words = resourceWords(row);
  if (row.kind === "medic") {
    // A switch that cannot be pressed says why under its name; one that is on can always be turned off.
    const disabled = Boolean(row.lock) || (row.value === 0 && row.incRefusal !== null);
    return renderToggle({ key: row.key, label: words.name, caption: words.caption, checked: row.value > 0, disabled });
  }
  const { name, note, noteTone, lockedReason, incBlockedReason } = words;
  return renderResourceCounter({ key: row.key, name, note, noteTone, value: row.value, decDisabled: !canStepDown(row), incBlockedReason, lockedReason });
}

/**
 * The section: the counters in the model's order, then the race's medics as switches.
 *
 * @param {object} input
 * @param {object[]} input.rows `resourceRows` of the team as it stands
 * @param {boolean} [input.busy] a save is on its way: a screen reader is told the section is changing
 * @returns {string}
 */
export function resourcesMarkup({ rows, busy = false }) {
  const head = `<div class="g-manage__resources-head"><h2 class="g-manage__resources-title" id="manage-resources-title">${escapeHtml(t("treasury.resources"))}</h2>`
    + `<span class="g-manage__resources-sub">${escapeHtml(t("treasury.resources.sub"))}</span></div>`;
  return `<section class="g-manage__resources" aria-labelledby="manage-resources-title"${busy ? ' aria-busy="true"' : ""}>${head}`
    + `${rows.map(rowMarkup).join("")}<p class="g-manage__note">${escapeHtml(t("treasury.resources.note"))}</p></section>`;
}

const rowsOf = (team) => resourceRows({ race: raceTeamOf(team.baseTeamSlug), roster: team.roster ?? {}, stage: team.stage });

/** The words for a step the model refused: «+» has its reason, a «−» that is not allowed has none to give. */
function refusedWords(row, delta) {
  const words = resourceWords(row);
  return words.lockedReason || (delta > 0 ? words.incBlockedReason : "");
}

/** Say why a step was not taken, and answer false, as `step` does. */
function notTaken(words, tone = "error") {
  toast(words, { tone });
  return false;
}

/** Another save of the team is on its way: said, and answered `"busy"`, which is not a refusal: nothing was judged. */
function saveOnItsWay() {
  toast(t("treasury.writing"), { tone: "info" });
  return "busy";
}

/**
 * One step of one resource: judged on the team as the list holds it now, and sent as the whole roster. Said
 * where it does not go through, with the team's name when the answer finds the coach on another team's page. A lost
 * answer is said in its own words: the roster may have been written, so `saveTeamRoster` reads the list again (the
 * counters, which the page draws from it, then show what the server holds) and the coach is sent to look at them
 * before pressing again.
 *
 * A press made while a save of the team is on its way is not judged at all: the list is still the one from before
 * that save, and a refusal read off it would be wrong.
 *
 * @returns {Promise<boolean|"busy">} whether the roster was saved; `"busy"` when another save was on its way
 */
async function step(teamId, key, delta) {
  const team = teamOf(teamId);
  if (!team) return notTaken(t("error.TEAM_NOT_FOUND"));
  if (isWriting(teamId)) return saveOnItsWay();
  const taken = stepResource({ race: raceTeamOf(team.baseTeamSlug), roster: team.roster ?? {}, stage: team.stage, key, delta, locked: isLive(teamId) });
  if (taken.refused) return notTaken(refusedWords(taken.refused, delta));
  const answer = await saveTeamRoster(teamId, taken.roster);
  if (answer.team) return true;
  // `saveTeamRoster` is sent only after the check above, which reads the same flag: this is a guard, so that a press is never met with silence.
  if (answer.ignored) return saveOnItsWay();
  teamToast(teamId, answer.unknown ? t("treasury.resources.mayHaveSaved") : answer.refusal, { tone: "error" });
  return false;
}

/** A step whose failure is said, never lost as an unhandled rejection; answers as `step` does. */
function press(teamId, key, delta) {
  return step(teamId, key, delta).catch((error) => {
    toastError(error);
    return false;
  });
}

/** Whether `key` is a medic's row of the team, which is what a switch the page drew is. A team that is gone has no rows: `step` says so. */
function isDrawnMedic(teamId, key) {
  const team = teamOf(teamId);
  return !team || rowsOf(team).some((row) => row.kind === "medic" && row.key === key);
}

/** A switch the press did not change goes back to what the team holds (a team changed elsewhere shows the new one). */
function restoreSwitch(button, teamId, key) {
  const team = teamOf(teamId);
  const row = team && rowsOf(team).find((item) => item.key === key);
  button.setAttribute("aria-checked", String(row ? row.value > 0 : button.getAttribute("aria-checked") !== "true"));
}

/**
 * Every press in the section: a counter's «−» and «+» (a closed one tells its reason in a toast), and a medic's
 * switch, which moves at once and goes back when the step is not taken (to what the team holds, or, when the
 * press found another save on its way, to what it was before the press).
 *
 * @param {Element} root the section's container, which outlives the page's redraws. It holds this section's
 *   switches and no others: `wireToggles` flips every switch under it before it reports, and a switch whose key
 *   is not one of the team's medics is left alone here.
 * @param {string} teamId
 * @returns {() => void} removes the listeners
 */
export function wireResources(root, teamId) {
  const offCounters = wireResourceCounters(root, ({ key, delta }) => { void press(teamId, key, delta); }, { onRefused: ({ reason }) => toast(reason, { tone: "error" }) });
  const offToggles = wireToggles(root, (key, on, button) => {
    if (!isDrawnMedic(teamId, key)) return;
    void press(teamId, key, on ? 1 : -1).then((result) => {
      if (result === "busy") button.setAttribute("aria-checked", String(!on));
      else if (!result) restoreSwitch(button, teamId, key);
    });
  });
  return () => {
    offCounters();
    offToggles();
  };
}
