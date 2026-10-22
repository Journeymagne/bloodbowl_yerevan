/**
 * The admin's block on a team's roster (stage 12, decisions 24 and 28; DeskAdminTeamEdit.html): what the admin's visit
 * draws in the coach's treasury strip's place — over the roster and across its width, on both widths, as the prototype's
 * banner and band of cards stand over its page.
 *
 * - The banner (`role="status"`): whose team the admin is editing, that a change is saved at once and that a fix of the
 *   treasury goes into its history as «admin», and the way back to the coach. A team that plays a match says under it
 *   that an admin's fix makes its post-match start over: the repair path stays open (plan 09a's question 2), and the
 *   post-match then asks the coaches to start again with the roster as it is (09b, `POST_TEAM_CHANGED`).
 * - «Treasury»: the sum the team holds, in thousands, and the reason, which is required. «Save the fix» is one
 *   `POST /api/admin/teams/:id/treasury` on the revision the roster's queue stands on, which the server writes as the
 *   ledger's `admin` line with the reason. It goes only while the queue has no step waiting or in the air and no write of
 *   the fallen is on its way (a death's rule, stage 07b's K6/K7): its answer moves the revision, so the queue takes it
 *   (`hold`), and while it is on its way no step of the roster goes (screen.mjs's lock, `adminWriting`). A second press
 *   sends nothing (data/admin.mjs: one write at a time). An answer that did not come is never sent again: the team is
 *   read again and the fields show what the server holds; so they do after another device's save, which is said.
 * - «Staff»: the counters of the Team page (08) in its order — the re-rolls, the fans, the assistants, the cheerleaders,
 *   the bribes of a race with Bribery and Corruption — and the race's medics, each a step of the queue on the admin's route
 *   (`stepAdminStaff`): the count alone, without money and without the stage's lock — money is the treasury card's — so
 *   the server journals no line for it (pre-flight L18). Starting and Team re-rolls share eight.
 * - «Fallen, added afterwards»: a player taken off the roster before 3.0 with no post-match to record it, added in a
 *   sheet (admin/team-sheets.mjs) as one `POST /api/admin/teams/:id/fallen`; the fallen are read again after it.
 * - The team's name and logo, the owner's answer (admin-identity.mjs): its card is handed in, the last of the band.
 *
 * Every write here is the administration's (data/admin.mjs): another tab's token sends nothing, and one goes at a time.
 */
import { toast, toastError } from "../../../components/toast.mjs";
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { adminCoachUrl } from "../../../core/routes.mjs";
import { state } from "../../../core/state.mjs";
import { adminRequest } from "../../../data/admin.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { builderStaffMaximums, combinedRerollsMaximum, medicalStaffDefinitions } from "../../../domain/league-rules.mjs";
import { sumMoney } from "../../../domain/money.mjs";
import { availableMedicalStaffDefinitions, hasBribery } from "../../../domain/roster/team-rules.mjs";
import { countToNumber } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderResourceCounter } from "../../../ui/resource-counter.mjs";
import { renderTextField } from "../../../ui/text-field.mjs";
import { adminFallenSheetMarkup, fallenFormOf, fallenRequest } from "../../admin/team-sheets.mjs";
import { COUNTER_KEYS, MAX_NOTE, readAmount } from "../manage/model.mjs";
import { readFallen } from "./fallen.mjs";
import { closeSheet } from "./injury.mjs";
import { savedRevision, stepAdminStaff } from "./save.mjs";
import { ADMIN_FALLEN_SHEET } from "./sheets.mjs";
import { adminOf } from "./source.mjs";

/** The staff the block counts, in the Team page's order and then the medics: those of a team's race are drawn (`staffOf`). */
export const ADMIN_STAFF = Object.freeze([...COUNTER_KEYS, ...medicalStaffDefinitions.map(({ key }) => key)]);
/** What a staff counter's key starts with, so the roster's one wiring of its counters tells them from the fix's (wire.mjs). */
export const STAFF_KEY = "staff:";
/** The ids of the treasury's two fields, by the field of the form each one types. */
export const TREASURY_FIELDS = Object.freeze({ treasury: "admin-team-treasury", note: "admin-team-note" });

/** The two counters that share `combinedRerollsMaximum`. */
const REROLLS = ["startingRerolls", "teamRerolls"];

/** The teams whose fix of the treasury is on its way: no step of their roster goes until it has answered (screen.mjs). */
const writing = new Set();
/** What is typed in the treasury's fields, by team, until it is sent: a field not typed in shows the team's sum, or no reason. */
const typed = new Map();

/** Whether a fix of the team's treasury is on its way. */
export const adminWriting = (teamId) => writing.has(teamId);

/** The staff of `race`'s teams, in `ADMIN_STAFF`'s order: no bribes without Bribery and Corruption, only the race's medics. */
function staffOf(race) {
  const medics = new Set(availableMedicalStaffDefinitions(race).map(({ key }) => key));
  return ADMIN_STAFF.filter((key) => (key === "bribes" ? hasBribery(race) : COUNTER_KEYS.includes(key) || medics.has(key)));
}

const staffName = (key) => t(`adminTeam.staff.${key}`);

/** How many of `key` the team may hold: its own maximum, the two re-roll counters what the other leaves of eight. */
function staffMax(key, draft) {
  const other = REROLLS.find((name) => name !== key);
  const own = builderStaffMaximums[key];
  return REROLLS.includes(key) ? Math.max(0, Math.min(own, combinedRerollsMaximum - countToNumber(draft[other]))) : own;
}

/** Why the team cannot hold `value` of `key`, "" when it can: its maximum, which the re-rolls say of the two of them. */
function staffFull(key, draft, value) {
  if (value <= staffMax(key, draft)) return "";
  if (!REROLLS.includes(key)) return t("validation.STAFF_MAX", { title: staffName(key), max: builderStaffMaximums[key] });
  return t("validation.STAFF_MAX", { title: REROLLS.map(staffName).join(" + "), max: combinedRerollsMaximum });
}

/** The sum a treasury is typed as: thousands, to the tenth the page writes money to. */
const amountText = (treasury) => String(Math.round(countToNumber(treasury) * 10) / 10);

/** The treasury's form: what is typed, else the team's sum and no reason. */
function formOf(teamId, draft) {
  const own = typed.get(teamId) ?? {};
  return { treasury: own.treasury ?? amountText(draft.treasury), note: own.note ?? "" };
}

/** The banner: whose team it is and what a change does, the way back to its coach; a match on said under it. */
function bannerMarkup({ owner, admin, inMatch }) {
  const href = adminCoachUrl(owner?.id ? owner : admin.ownerId);
  const back = `<a class="g-btn g-adminteam__btn g-adminteam__back" href="${escapeHtml(href)}">${escapeHtml(t("adminTeam.banner.back"))}</a>`;
  const match = inMatch ? `<p class="g-adminteam__match">${escapeHtml(t("adminTeam.inMatch"))}</p>` : "";
  return `<div class="g-adminteam__banner" role="status"><span class="g-adminteam__bannertext">`
    + `<span class="g-adminteam__bannertitle">${escapeHtml(t("adminTeam.banner.title", { login: String(owner?.login ?? "") }))}</span>`
    + `<span class="g-adminteam__bannersub">${escapeHtml(t("adminTeam.banner.sub"))}</span></span>${back}</div>${match}`;
}

/** A card of the band: its title, then what it holds. Keyed, so its fields and buttons are the same nodes through every draw. */
const cardMarkup = (name, title, bodyHtml) => `<section class="g-admin__card g-adminteam__${name}" aria-labelledby="admin-team-${name}-title" data-key="admin-team-${name}">`
  + `<div class="g-admin__cardhead"><h2 id="admin-team-${name}-title">${escapeHtml(title)}</h2></div>${bodyHtml}</section>`;

/** «Treasury»: the sum and its line, the reason, «Save the fix» (busy while the fix is on its way). */
function treasuryMarkup({ teamId, draft }) {
  const form = formOf(teamId, draft);
  const field = (key, label, extra) => renderTextField({ id: TREASURY_FIELDS[key], name: key, label, value: form[key], autocomplete: "off", ...extra });
  return cardMarkup("treasury", t("adminTeam.treasury.title"), field("treasury", t("adminTeam.treasury.amount"), { inputmode: "decimal", help: t("adminTeam.treasury.help") })
    + field("note", t("adminTeam.treasury.note"), {})
    + renderButton({ label: t("adminTeam.treasury.save"), kind: "primary", busy: writing.has(teamId), data: { adminTreasury: true } }));
}

/** «Staff»: a counter for each of the race's, closed with the screen's lock; «+» at the maximum says it. */
function staffMarkup({ race, draft, lock }) {
  const counters = staffOf(race).map((key) => {
    const value = countToNumber(draft[key]);
    return renderResourceCounter({ key: `${STAFF_KEY}${key}`, name: staffName(key), value, incBlockedReason: staffFull(key, draft, value + 1), lockedReason: lock });
  });
  return cardMarkup("staff", t("adminTeam.staff.title"), `<div class="g-adminteam__counters">${counters.join("")}</div><p class="g-admin__note">${escapeHtml(t("adminTeam.staff.note"))}</p>`);
}

/** «Fallen, added afterwards»: what it is for, and the button that opens its sheet. */
function fallenMarkup() {
  const add = `<button type="button" class="g-btn g-adminteam__btn" aria-haspopup="dialog" data-admin-fallen="${ADMIN_FALLEN_SHEET}">${escapeHtml(t("adminTeam.fallen.add"))}</button>`;
  return cardMarkup("fallen", t("adminTeam.fallen.title"), `<p class="g-admin__note">${escapeHtml(t("adminTeam.fallen.note"))}</p>${add}`);
}

/**
 * The block, over the roster of an admin's visit whose team is read.
 * @param {import("./view.mjs").RosterScreen} screen
 * @param {string} identityHtml markup of `identityMarkup(screen)`: the name and logo's card, the last of the band
 * @returns {string}
 */
export function adminBlockMarkup(screen, identityHtml) {
  return `<div class="g-adminteam">${bannerMarkup(screen)}<div class="g-admin__grid">${treasuryMarkup(screen)}${staffMarkup(screen)}${fallenMarkup()}${identityHtml}</div></div>`;
}

/** The sheet of a fallen player added afterwards while it is open on an admin's visit (screen.mjs's keeper of it). */
export function adminSheetOf(visit, lines, where) {
  return visit.sheet?.kind === "adminFallen" && where.admin && where.race ? visit.sheet : null;
}

/** The sheet as view.mjs draws it. @param {import("./view.mjs").RosterScreen} screen */
export function adminSheetMarkup({ race, matches, team, sheet }) {
  return adminFallenSheetMarkup({ race, matches, team: team.name, sheet });
}

/** Why the fix of the treasury cannot go, "" when it can: the form, then the screen's lock, then the queue. */
function treasuryRefusal(where, { amount, note }) {
  if (amount === null) return t("adminTeam.treasury.needAmount");
  if (!note) return t("adminTeam.treasury.needNote");
  if (note.length > MAX_NOTE) return t("adminTeam.treasury.noteLong", { max: MAX_NOTE });
  if (sumMoney(amount, -Math.round(countToNumber(where.draft.treasury) * 10) / 10) === 0) return t("adminTeam.treasury.same");
  if (where.lock) return where.lock;
  const { status, waiting } = where.save;
  return waiting > 0 || status === SAVE_STATUS.SAVING || status === SAVE_STATUS.DIRTY ? t("adminTeam.waitQueue") : "";
}

/**
 * «Save the fix» (see the head of the file): checked at the press; one POST; its answer the queue's, else said, and a team
 * the server may hold otherwise read again — the form showing what it holds.
 * @param {import("./index.mjs").Saving} saving @param {object} marks index.mjs's lent `now`, `hold`, `readAgain`
 */
async function saveTreasury({ teamId, visit, draw }, marks) {
  const where = marks.now();
  const form = formOf(teamId, where.draft);
  const fix = { amount: readAmount(form.treasury), note: form.note.trim() };
  const reason = treasuryRefusal(where, fix);
  if (reason) {
    toast(reason, { tone: "error" });
    return;
  }
  const coach = state.auth.currentUser?.id;
  writing.add(teamId);
  draw();
  let outcome;
  try {
    const body = { treasury: fix.amount, note: fix.note, revision: savedRevision(teamId) };
    outcome = await adminRequest(`/api/admin/teams/${encodeURIComponent(teamId)}/treasury`, { method: "POST", body });
  } finally {
    writing.delete(teamId);
  }
  if (outcome.ignored || state.auth.currentUser?.id !== coach) {
    // Another write of the administration was on its way (data/admin.mjs: one at a time): nothing was sent.
    if (outcome.ignored && visit.here) toast(t("treasury.writing"));
    if (visit.here) draw();
    return;
  }
  const team = outcome.answer?.team;
  if (team && Number.isInteger(team.revision)) {
    typed.delete(teamId);
    marks.hold({ team });
    toast(t("adminTeam.treasurySaved", { amount: formatMoney(countToNumber(team.roster?.treasury)) }));
    return;
  }
  // A 2xx without the team is no answer either: the fix may have landed.
  const conflict = outcome.code === "TEAM_SAVED_ELSEWHERE", unknown = Boolean(outcome.answer) || outcome.unknown;
  toast(conflict ? t("treasury.changedElsewhere") : unknown ? t("administration.mayHaveWritten") : outcome.refusal, { tone: "error" });
  if (!conflict && !unknown) {
    if (visit.here) draw();
    return;
  }
  typed.delete(teamId);
  // Drawn once the read is sent, so that the button is free and every step waits for the read.
  const read = marks.readAgain();
  draw();
  await read;
}

/** A staff counter's − or +: one step of the queue, unless the screen's lock or the maximum says why not (said). */
function stepStaff({ teamId }, marks, key, delta) {
  const { race } = marks.now();
  if (!race || !staffOf(race).includes(key)) return;
  const step = stepAdminStaff(teamId, key, delta, { closed: () => marks.now().lock, refusal: (draft, value) => (delta > 0 ? staffFull(key, draft, value) : "") });
  if (!step.refusal) return;
  toast(step.refusal, { tone: "error" });
  marks.refused();
}

/** The team's fallen as the server holds them now, drawn when the read comes back to the visit that asked. */
async function readFallenAgain({ teamId, visit, draw }) {
  const read = await readFallen(teamId);
  if (!visit.here || read.error) return;
  visit.fallen = read.fallen;
  draw();
}

/**
 * «Add» in the sheet: the form checked (what is wrong said in the sheet), then one POST, the sheet busy with it. Its
 * record is drawn among the fallen at once, the sheet closed and the focus back on the button that opened it, and the
 * fallen read again. The server's refusal is said in the sheet, which stays; an answer that did not come closes it, is
 * said, and the fallen are read again to show whether it landed — never sent again.
 * @param {import("./index.mjs").Saving} saving
 */
async function addFallen(saving) {
  const { teamId, visit, draw } = saving;
  const { sheet } = visit;
  if (sheet?.kind !== "adminFallen" || sheet.busy) return;
  const request = fallenRequest(sheet.form);
  Object.assign(sheet, { refusal: request.refusal ?? "", busy: !request.refusal });
  draw();
  if (request.refusal) return;
  const coach = state.auth.currentUser?.id;
  const outcome = await adminRequest(`/api/admin/teams/${encodeURIComponent(teamId)}/fallen`, { method: "POST", body: request.body });
  sheet.busy = false;
  if (!visit.here || state.auth.currentUser?.id !== coach) return;
  const record = outcome.answer?.fallen;
  const landed = record && typeof record.id === "string";
  if (outcome.ignored || !(landed || outcome.answer || outcome.unknown)) {
    const refusal = outcome.ignored ? t("treasury.writing") : outcome.refusal;
    // A sheet closed while «Add» was on its way: its words would be lost in it, so they are said in a toast.
    if (visit.sheet !== sheet) return toast(refusal, { tone: "error" });
    sheet.refusal = refusal;
    draw();
    return undefined;
  }
  if (landed) visit.fallen = [record, ...visit.fallen.filter((each) => each.id !== record.id)];
  if (visit.sheet === sheet) closeSheet(saving);
  else draw();
  if (landed) toast(t("adminTeam.fallen.added", { name: request.body.player.name }));
  else toast(t("administration.mayHaveWritten"), { tone: "error" });
  await readFallenAgain(saving);
}

/**
 * What the block's presses do (wire.mjs), on an admin's visit that is on the screen only: the treasury's fields as typed,
 * «Save the fix», a staff counter's step, «+ Add a fallen player afterwards» with its sheet's fields and «Add». A visit
 * starts with nothing typed.
 * @param {import("./index.mjs").Saving} saving the visit's side of the queue
 * @param {object} marks what index.mjs lends its marks: `now()`, the screen at the press; `hold({team})`, an answer's team to the
 *   queue; `readAgain()`, the roster read again (a promise of whether it was taken); `refused()`, a refusal's follow-up
 */
export function adminHandlers(saving, marks) {
  const { teamId, visit, draw } = saving;
  typed.delete(teamId);
  const admin = () => visit.here && adminOf(teamId) !== null;
  // Each runs at once up to its request, so a press is checked as the screen stands when it is made.
  const run = (work) => {
    if (admin()) work().catch((error) => toastError(error));
  };
  return {
    onAdminTreasuryField: (field, value) => {
      if (admin()) typed.set(teamId, { ...typed.get(teamId), [field]: value });
    },
    onAdminTreasury: () => run(() => saveTreasury(saving, marks)),
    onAdminStaff: (key, delta) => {
      if (admin()) stepStaff(saving, marks, key, delta);
    },
    onAdminFallen: (key, button) => {
      const { race } = marks.now();
      if (!admin() || !race) return;
      Object.assign(visit, { sheet: { kind: "adminFallen", key: ADMIN_FALLEN_SHEET, form: fallenFormOf(race), busy: false, refusal: "" }, opener: button });
      draw();
    },
    onAdminFallenField: (field, value) => {
      if (visit.sheet?.kind === "adminFallen" && !visit.sheet.busy) visit.sheet.form[field] = value;
    },
    onAdminFallenSend: () => run(() => addFallen(saving)),
  };
}
