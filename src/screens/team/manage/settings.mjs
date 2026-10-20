/**
 * The team's settings on the team page (stage 07d; owner, 2026-10-19: what only the 2.x editor could do moves into
 * 3.0): its name, league, god and logo, its Dedicated Fans put right, its players in number order, and what the roster
 * breaks of the rules — the rows of the builder's team card, with the race shown among them and never changed (owner,
 * 2026-10-20). Each is one save of the team, the team page's own (`saveTeamRoster`), never sent again by itself; none
 * while a match is on, while a save of the team is on its way, or while the roster's queue holds a step of its own,
 * which a save made here would leave on a revision the server no longer has.
 *
 * `settingsModel` says what the section shows and what holds it (`held`, in that order); `settingsMarkup` draws the
 * rows (decision 26), a held section saying why over them, with the way to the roster when the roster's queue is what
 * holds it; `wireSettings` is the whole of its wiring. A row's button opens its sheet (settings-sheet.mjs) in a host of
 * its own; the logo, its removal and the order go at the press, with no sheet. A held button stays in the tab order
 * and says why when pressed, and nothing goes: what holds the settings is asked again at every press, never read off
 * the buttons.
 */
import { toastError } from "../../../components/toast.mjs";
import { delegate, escapeHtml, listenerGroup } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { fileToOptimizedLogoDataUrl, logoUploadMaxBytes } from "../../../core/logo-upload.mjs";
import { teamUrl } from "../../../core/routes.mjs";
import { state } from "../../../core/state.mjs";
import { onGamesChange } from "../../../data/games.mjs";
import { loadMyTeams, onMyTeamsChange, raceTeamOf, refusalWithRules } from "../../../data/teams.mjs";
import { isWriting, readLedger, saveTeamRoster } from "../../../data/treasury.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { byNumber, rosterViolations, withFans, withFavoured, withLeague } from "../../../domain/roster/team-edits.mjs";
import { ruleLookupKey, teamFavouredOptions, teamLeagueOptions } from "../../../domain/roster/team-rules.mjs";
import { countToNumber } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderCallout } from "../../../ui/callout.mjs";
import { icon } from "../../../ui/icons.mjs";
import { wireOptionLists } from "../../../ui/option-card.mjs";
import { wireResourceCounters } from "../../../ui/resource-counter.mjs";
import { wireSheets } from "../../../ui/sheet.mjs";
import { LOGO_DATA_URL } from "../../teams/new.mjs";
import { prepResetWords } from "../roster/panel.mjs";
import { onSaveState, saveState } from "../roster/save.mjs";
import { matchLock } from "./model.mjs";
import { FANS_MAX, NAME_FIELD_ID, SETTINGS_KINDS, SETTINGS_SHEET_ID, draftOf, settingsCheck, settingsSheetMarkup } from "./settings-sheet.mjs";
import { mountSheetHost, sheetController, teamToast, unmountSheetHost } from "./sheet-host.mjs";

const LOGO_ID = "team-settings-logo";
/** Where the roster's queue stands when it holds nothing of the team: at rest. */
const REST = Object.freeze({ status: "idle", waiting: 0 });
/** The queue's states that hold a step of the coach's, or a refusal the roster is to settle (`saveState`). */
const QUEUE_HOLDS = new Set(["saving", "dirty", "conflict", "error"]);
/** What takes the focus when a sheet starts over and its button is disabled under it. */
const REFOCUS = {
  name: `#${NAME_FIELD_ID}`,
  league: '.g-options [tabindex="0"]',
  favoured: '.g-options [tabindex="0"]',
  fans: '[data-resource-step="1"]',
};

/**
 * The league or the god of a team as the rules read it: the option of the race's list the roster names (by its rule
 * key, written as the list writes it), or the list's first where it names none — as the 2.x editor read it
 * (`ensureDraftLeagueChoice`); "" for a race without one.
 */
function choiceOf(options, stored) {
  const key = ruleLookupKey(String(stored ?? ""));
  return options.find((option) => ruleLookupKey(option) === key) ?? options[0] ?? "";
}

/** Why no save of the settings may go now, the first that applies: a match on, the roster's queue, a save on its way. */
function holdOf({ lock, queue, busy }) {
  if (lock?.kind === "live") return { held: t("teamSettings.live"), waitsRoster: false };
  if (queue.waiting > 0 || QUEUE_HOLDS.has(queue.status)) return { held: t("teamSettings.waitRoster"), waitsRoster: true };
  return { held: busy ? t("teamSettings.writing") : "", waitsRoster: false };
}

/**
 * What the section shows of a team, and what holds it.
 *
 * @param {object} input
 * @param {object} input.team the team as `state.myTeams` holds it
 * @param {object|null} input.race the reference's entry for its race; null while the data has not come
 * @param {{kind: "live"|"preparing"}|null} [input.lock] `matchLock`
 * @param {boolean} [input.busy] a save of the team is on its way (`isWriting`)
 * @param {{status: string, waiting: number}} [input.queue] where the roster's queue stands (`saveState`)
 * @returns {{name: string, logoData: string, raceTitle: string, tier: string, league: string, leagues: string[],
 *   favoured: string, alignments: string[], fans: number, violations: {code: string, params: object}[], held: string,
 *   waitsRoster: boolean, preparing: boolean}}
 *   `league` and `favoured` as the rules read them (`choiceOf`); `logoData` only a picture (`LOGO_DATA_URL`);
 *   `preparing` a match of the team's being prepared, which any save of the settings starts over for both teams
 *   (decision 20, final review I1)
 */
export function settingsModel({ team, race, lock = null, busy = false, queue = REST }) {
  const draft = normalizeDraft(team.roster ?? {});
  const hold = holdOf({ lock, queue, busy });
  const logo = String(team.logoData ?? "");
  const [leagues, alignments] = race ? [teamLeagueOptions(race), teamFavouredOptions(race)] : [[], []];
  return {
    name: String(team.name ?? ""),
    logoData: LOGO_DATA_URL.test(logo) ? logo : "",
    raceTitle: race?.title ?? "",
    tier: race?.team?.meta?.league ?? "",
    league: choiceOf(leagues, draft.selectedLeague),
    leagues,
    favoured: choiceOf(alignments, draft.favouredChoice),
    alignments,
    fans: countToNumber(draft.dedicatedFans),
    violations: race ? rosterViolations(race, draft) : [],
    ...hold,
    preparing: lock?.kind === "preparing",
  };
}

/** A shut button keeps its place in the tab order and says why, in its tooltip and, pressed, in a toast. */
const shut = (reason) => (reason ? ` aria-disabled="true" title="${escapeHtml(reason)}"` : "");

/** A button of a row (Builder's «Загрузить»), its own attributes given as markup. */
function rowButton(attributes, label, reason) {
  return `<button type="button" class="g-btn g-team-settings__btn" ${attributes}${shut(reason)}>${escapeHtml(label)}</button>`;
}

/** The button that opens a row's sheet, described by the row's label. */
function opener(kind, label, reason) {
  return rowButton(`data-settings-open="${kind}" aria-haspopup="dialog" aria-describedby="team-settings-${kind}-label"`, label, reason);
}

/** A line of the card (Builder): its label, with a note under it when it has one; its value and its button at the right. */
function row(kind, { label, note = "", value = "", action = "" }) {
  const name = `<span class="g-team-settings__label" id="team-settings-${kind}-label">${escapeHtml(label)}</span>`;
  const text = note ? `<span class="g-team-settings__text">${name}<span class="g-team-settings__note">${escapeHtml(note)}</span></span>` : name;
  const shown = value === "" ? "" : `<b>${escapeHtml(value)}</b>`;
  return `<div class="g-team-settings__row" data-settings-row="${kind}" data-key="team-settings-${kind}">${text}<span class="g-team-settings__value">${shown}${action}</span></div>`;
}

/** The race and its tier, read only on every width and in every state: a coach does not change a team's race (owner, 2026-10-20). */
function raceRow(settings) {
  const value = settings.tier ? `${settings.raceTitle} · ${settings.tier}` : settings.raceTitle;
  return row("race", { label: t("teamSettings.race"), value });
}

/** A league or a god: no line for a race that has none, no button for one that has one only. */
function choiceRow(kind, label, value, options, held) {
  if (!options.length) return "";
  return row(kind, { label, value, action: options.length >= 2 ? opener(kind, t("teamSettings.change"), held) : "" });
}

/** The logo (Builder): the picture or the shield, the file field the label opens, and «Remove» when there is one. */
function logoRow({ logoData, held }) {
  const picture = logoData ? `<img src="${escapeHtml(logoData)}" alt="">` : icon("shield", 18);
  const text = `<span class="g-team-settings__text"><span class="g-team-settings__logo-name">${escapeHtml(t("newTeam.logo"))}</span>`
    + `<span class="g-team-settings__note">${escapeHtml(t("newTeam.logoNote"))}</span></span>`;
  // Never disabled: held, the field stays in the tab order with its reason, and a press of it or of its label (which is
  // the button) says why instead of opening the picker; a field that is disabled under the focus would drop it.
  const file = `<input class="g-sr-only g-team-settings__file" type="file" id="${LOGO_ID}" accept="image/png,image/jpeg"${shut(held)}>`
    + `<label class="g-btn g-team-settings__btn" for="${LOGO_ID}"${shut(held)}>${escapeHtml(t("newTeam.upload"))}</label>`;
  const remove = logoData ? rowButton("data-settings-logo-remove", t("teamSettings.remove"), held) : "";
  return '<div class="g-team-settings__row g-team-settings__row--logo" data-settings-row="logo" data-key="team-settings-logo">'
    + `<span class="g-team-settings__logo-line"><span class="g-team-settings__logo">${picture}</span>${text}</span>`
    + `<span class="g-team-settings__actions">${file}${remove}</span></div>`;
}

/** What the roster breaks of the rules, a line each, as the 2.x editor listed it; nothing when it breaks none. */
function checkMarkup(violations) {
  if (!violations.length) return "";
  const lines = violations.map(({ code, params }) => `<li class="g-team-settings__violation">${escapeHtml(t(`validation.${code}`, params))}</li>`);
  return `<div class="g-team-settings__check" data-key="team-settings-check"><span class="g-team-settings__label" id="team-settings-check-label">${escapeHtml(t("teamSettings.check"))}</span>`
    + `<ul class="g-team-settings__violations" aria-labelledby="team-settings-check-label">${lines.join("")}</ul></div>`;
}

/** Why the settings are held, over them; the roster's queue gives the way to the roster, where it is settled. */
function heldCallout(teamId, { held, waitsRoster }) {
  if (!held) return "";
  const actionHtml = waitsRoster ? renderButton({ label: t("teamSettings.toRoster"), href: teamUrl(teamId, "roster") }) : "";
  return renderCallout({ tone: "warn", title: held, actionHtml });
}

/**
 * During a preparation, what a save of the settings resets (R12, decision 20; final review I1), over the rows: the logo,
 * its removal and «By number» save at the press, with no sheet to say it, so it is said before them. Nothing is closed.
 */
const prepCallout = ({ preparing }) => (preparing ? renderCallout({ tone: "warn", title: prepResetWords("teamSettings.prep") }) : "");

/**
 * The section, the page's last (index.mjs): the title, what holds it, the rows, the roster's check.
 * @param {{teamId: string, settings: ReturnType<typeof settingsModel>}} model the page's model
 * @returns {string}
 */
export function settingsMarkup({ teamId, settings }) {
  const { held } = settings;
  const order = rowButton('data-settings-order aria-describedby="team-settings-order-label"', t("teamSettings.orderAction"), held);
  const fans = opener("fans", t("teamSettings.fansFix"), held);
  const rows = [
    row("name", { label: t("teamSettings.name"), value: settings.name, action: opener("name", t("teamSettings.change"), held) }),
    raceRow(settings),
    choiceRow("league", t("teamSettings.league"), settings.league, settings.leagues, held),
    choiceRow("favoured", t("teamSettings.favoured"), settings.favoured, settings.alignments, held),
    logoRow(settings),
    row("fans", { label: t("teamSettings.fans"), note: t("teamSettings.fansNote"), value: String(settings.fans), action: fans }),
    row("order", { label: t("teamSettings.order"), note: t("teamSettings.orderNote"), action: order }),
  ];
  const title = `<h2 class="g-team-settings__title" id="team-settings-title">${escapeHtml(t("teamSettings.title"))}</h2>`;
  // Keyed, the section and its rows are the same nodes whatever callout comes or goes above them: a held field keeps the focus.
  return `<section class="g-team-settings" aria-labelledby="team-settings-title" data-key="team-settings">${title}`
    + `${heldCallout(teamId, settings)}${prepCallout(settings)}${rows.join("")}${checkMarkup(settings.violations)}</section>`;
}

const teamOf = (teamId) => state.myTeams.items.find((item) => item.id === teamId);

/** The section's model of a team as the page holds it now; null for a team no longer on the list. */
function nowOf(teamId) {
  const team = teamOf(teamId);
  if (!team) return null;
  const lock = matchLock(state.games.items, teamId);
  return settingsModel({ team, race: raceTeamOf(team.baseTeamSlug), lock, busy: isWriting(teamId), queue: saveState(teamId) });
}

/** Why nothing of the settings may be saved now, or "": `held`, or a team that is gone. */
const heldNow = (teamId) => nowOf(teamId)?.held ?? t("error.TEAM_NOT_FOUND");

/** A save's answer in the settings' words: a 409 and a lost answer send the coach to look before saving again. */
function worded(answer) {
  if (answer?.changed) return { ...answer, refusal: t("teamSettings.changed") };
  if (answer?.unknown) return { ...answer, refusal: t("teamSettings.unknown") };
  return answer;
}

/**
 * A refusal of the server's own in the settings' words: a roll on the site rerolled against a favoured skill that a god
 * changed takes off (`checkKeptRerolls`) is no advancement's to word (final review M2); any other, as every save says it.
 */
const settingsWords = (error) => (error?.code === "DICE_ROLL_MISMATCH" ? t("teamSettings.refusal.DICE_ROLL_MISMATCH") : refusalWithRules(error));

/**
 * One save of the team: the draft a step of team-edits.mjs made — or its refusal, in words — with the name or the logo
 * given. Asynchronous throughout, so that a save that threw is a rejection its caller handles, never an exception in a
 * click.
 */
async function saved(teamId, changed, identity) {
  if (changed.code) return { refusal: t(`teamSettings.refusal.${changed.code}`, changed.params) };
  return worded(await saveTeamRoster(teamId, changed.draft, identity, { words: settingsWords }));
}

/** What a sheet's press sends: the step of its kind on the team as the list holds it. */
function sendOf(form, chosen) {
  const team = teamOf(form.teamId);
  const race = raceTeamOf(team?.baseTeamSlug);
  if (form.kind === "name") return saved(form.teamId, { draft: draftOf(team) }, { name: chosen });
  if (form.kind === "league") return saved(form.teamId, withLeague(race, draftOf(team), chosen));
  if (form.kind === "favoured") return saved(form.teamId, withFavoured(race, draftOf(team), chosen));
  if (form.kind === "fans") return saved(form.teamId, withFans(draftOf(team), Number(chosen)));
  throw new TypeError(`settings: no save for a sheet of kind "${form.kind}"`);
}

/**
 * The name field shows the team's name while the coach has typed nothing (`value` null). `patch` leaves a field that
 * has the focus alone, so as not to fight a person typing, and a 409 puts the focus there: its value is set here.
 */
function followName(host, form) {
  if (form?.kind !== "name" || form.value !== null) return;
  const field = host.querySelector(`#${NAME_FIELD_ID}`);
  const name = teamOf(form.teamId)?.name ?? "";
  if (field && field.value !== name) field.value = name;
}

/**
 * The press on a sheet's button. What holds the settings is asked again here: the sheet may have been drawn before a
 * match went live or a step of the roster's came, and a button that looks pressable is not a promise. One press is one
 * save (`sheetController`); a 409 or a lost answer puts the choice back to the team as it is, and the coach chooses again.
 */
async function apply(host, sheet) {
  const form = sheet.form;
  if (!form || form.pending) return;
  const now = nowOf(form.teamId);
  const check = now ? settingsCheck({ ...form, now }) : null;
  if (!check?.ready) {
    // Drawn again from what holds it now: the button that was pressed turns disabled, and the focus on it would drop.
    sheet.redraw();
    sheet.focus(REFOCUS[form.kind]);
    return;
  }
  await sheet.submit(() => sendOf(form, check.chosen), {
    startOver: { value: null },
    refocus: REFOCUS[form.kind],
    // A lost answer is read again by `saveTeamRoster`; a save whose own code threw is not.
    unknown: () => {
      void readLedger(form.teamId);
      void loadMyTeams(true);
    },
    done: () => teamToast(form.teamId, t("teamSettings.saved")),
  });
  followName(host, sheet.form);
}

/** A row's button: its sheet, on the team as it is now, or why it stays shut (asked now, not read off the button). */
function open(sheet, teamId, button) {
  const kind = button.getAttribute("data-settings-open");
  const now = nowOf(teamId);
  const reason = now ? now.held : t("error.TEAM_NOT_FOUND");
  if (reason) {
    teamToast(teamId, reason, { tone: "error" });
    return;
  }
  if (SETTINGS_KINDS.includes(kind)) sheet.open({ kind, teamId, value: null, pending: false, refusal: "" }, button);
}

/** «−» and «+» of the fans' sheet: the count the coach says, from 0 to the maximum. */
function stepFans(sheet, delta) {
  const form = sheet.form;
  const now = form?.kind === "fans" && !form.pending ? nowOf(form.teamId) : null;
  if (!now) return;
  const next = (form.value ?? now.fans) + delta;
  if (next >= 0 && next <= FANS_MAX) sheet.change({ value: next });
}

/** A save the page's own buttons make, said in a toast: saved, or why not. */
async function saveNow(teamId, changed, identity) {
  const answer = await saved(teamId, changed, identity);
  if (answer.team) teamToast(teamId, t("teamSettings.saved"));
  else teamToast(teamId, answer.ignored ? t("teamSettings.writing") : answer.refusal, { tone: "error" });
}

/** «By number»: the players in the order of their numbers, one save; a roster in that order already is said, and nothing goes. */
async function putInOrder(teamId) {
  const sorted = byNumber(draftOf(teamOf(teamId)));
  if (!sorted.moved) {
    teamToast(teamId, t("teamSettings.orderSame"));
    return;
  }
  await saveNow(teamId, sorted);
}

/**
 * A logo picked: a picture of up to 2 MB, read and made smaller (as the builder takes one), saved at once. One too large,
 * or that is no picture, is said and nothing goes.
 */
async function takeLogo(teamId, file) {
  if (file.size > logoUploadMaxBytes) {
    teamToast(teamId, t("savedRoster.logoTooLarge"), { tone: "error" });
    return;
  }
  let logo = "";
  try {
    logo = await fileToOptimizedLogoDataUrl(file);
  } catch {
    logo = "";
  }
  // The read took its time: a match, a step of the roster's or a save may have come meanwhile.
  const reason = LOGO_DATA_URL.test(logo) ? heldNow(teamId) : t("newTeam.logoUnreadable");
  if (reason) {
    teamToast(teamId, reason, { tone: "error" });
    return;
  }
  await saveNow(teamId, { draft: draftOf(teamOf(teamId)) }, { logoData: logo });
}

/** «Remove»: the logo taken off; the button that held the focus goes with it, so the file field takes it. */
async function dropLogo(root, teamId) {
  await saveNow(teamId, { draft: draftOf(teamOf(teamId)) }, { logoData: "" });
  if (!root.querySelector("[data-settings-logo-remove]")) root.querySelector(`#${LOGO_ID}`)?.focus();
}

/**
 * A press of the page's own (the logo, its removal, the order): one at a time — a logo is read before it is saved —
 * and never while the settings are held; either is said, and nothing goes.
 */
function pressed(teamId, gate, run) {
  const reason = gate.busy ? t("teamSettings.writing") : heldNow(teamId);
  if (reason) {
    teamToast(teamId, reason, { tone: "error" });
    return;
  }
  gate.busy = true;
  run().catch((error) => toastError(error)).finally(() => {
    gate.busy = false;
  });
}

/** The file field, or its label, pressed: while the settings are held (or a press of the page's is on its way), it says why instead of opening the picker. */
function pickerPress(event, teamId, gate) {
  const reason = gate.busy ? t("teamSettings.writing") : heldNow(teamId);
  if (!reason) return;
  event.preventDefault();
  teamToast(teamId, reason, { tone: "error" });
}

/** The sheet as the page holds the team now; nothing for a team that is gone (`teamMoved` closes it). */
function drawn(form) {
  const team = teamOf(form.teamId);
  if (!team) return "";
  return settingsSheetMarkup({ ...form, team, race: raceTeamOf(team.baseTeamSlug), now: nowOf(form.teamId) });
}

/** The team moved (a save of the settings', of the page's, a read): the sheet is drawn again from it, or closed when it is gone. */
function teamMoved(host, sheet) {
  if (sheet.form && !teamOf(sheet.form.teamId)) {
    sheet.close();
    return;
  }
  sheet.follow();
  followName(host, sheet.form);
}

/**
 * Everything the section does: a row's button opens its sheet in a host of its own on the body (`mountSheetHost`), the
 * cross, the backdrop and Escape close it and give the focus back to that button; what is typed or chosen in it changes
 * the form and the sheet is drawn again in place; its button sends one save. The file field, «Remove» and «By number»
 * save at the press. The sheet follows the team, the games and the roster's queue. Wire once per screen mount.
 *
 * @param {Element} root the screen's element, which holds the section
 * @param {string} teamId
 * @returns {() => void} removes the listeners, closes the sheet and takes its host away
 */
export function wireSettings(root, teamId) {
  const host = mountSheetHost("team-settings");
  const sheet = sheetController(host, { id: SETTINGS_SHEET_ID, markup: drawn });
  const group = listenerGroup(host);
  const gate = { busy: false };
  const onPage = (eventName, selector, handler) => group.own(delegate(root, eventName, selector, handler));
  onPage("click", "[data-settings-open]", (event, button) => open(sheet, teamId, button));
  onPage("click", "[data-settings-order]", () => pressed(teamId, gate, () => putInOrder(teamId)));
  onPage("click", "[data-settings-logo-remove]", () => pressed(teamId, gate, () => dropLogo(root, teamId)));
  onPage("click", `label[for="${LOGO_ID}"], #${LOGO_ID}`, (event) => pickerPress(event, teamId, gate));
  onPage("change", `#${LOGO_ID}`, (event, input) => {
    const file = input.files?.[0];
    // Emptied, so that the same file can be picked again.
    input.value = "";
    if (file) pressed(teamId, gate, () => takeLogo(teamId, file));
  });
  // A choice made while the save is on its way is not taken: the answer draws the sheet again from the form (or closes it).
  const choose = (value) => {
    if (sheet.form && !sheet.form.pending) sheet.change({ value });
  };
  group.own(wireSheets(host, { onClose: (id) => { if (id === SETTINGS_SHEET_ID) sheet.close(); } }));
  group.on("input", `#${NAME_FIELD_ID}`, (event, input) => choose(input.value));
  group.own(wireOptionLists(host, choose));
  group.own(wireResourceCounters(host, ({ delta }) => stepFans(sheet, delta), { onRefused: ({ reason }) => teamToast(teamId, reason, { tone: "error" }) }));
  group.on("click", "[data-settings-save]", () => { void apply(host, sheet); });
  group.own(onMyTeamsChange(() => teamMoved(host, sheet)));
  group.own(onGamesChange(() => sheet.follow()));
  group.own(onSaveState(teamId, () => sheet.follow()));
  return () => {
    group.release();
    unmountSheetHost(host);
  };
}
