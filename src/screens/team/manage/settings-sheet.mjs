/**
 * The sheets of the team's settings: the name (TeamNew's field), a league or a god (the builder's choice), the fans,
 * and the race — the race's red button the one irreversible press of the page.
 *
 * One sheet at a time, named as its row is (K18), drawn from a form whose `value` is what the coach has chosen, or
 * null for what the team holds now: a sheet that a 409 or a lost answer starts over shows the team as it then is, by
 * one assignment. What a sheet says before its button — the favoured skills a god takes off, the players and the staff
 * a race lets go (K17) — is the domain's own answer (domain/roster/team-edits.mjs) on the team as it stands, asked at
 * each draw. When the button may send is `settingsCheck`, which the sheet draws from and the press asks again
 * (settings.mjs); what it sends is settings.mjs's.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { builderStaffMaximums, medicalStaffDefinitions } from "../../../domain/league-rules.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { teamNameRefusal, withFavoured, withRace } from "../../../domain/roster/team-edits.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderCallout } from "../../../ui/callout.mjs";
import { renderOptionList } from "../../../ui/option-card.mjs";
import { renderResourceCounter } from "../../../ui/resource-counter.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { renderTextField } from "../../../ui/text-field.mjs";
import { racesMarkup } from "../../teams/new.mjs";
import { prepResetWords } from "../roster/panel.mjs";

export const SETTINGS_SHEET_ID = "team-settings-sheet";
/** The name's field (TeamNew's), where the focus goes when a save of it starts over. */
export const NAME_FIELD_ID = "team-settings-name";
/** The fans a team may hold: the builder's maximum, where «+» stops and says why. */
export const FANS_MAX = builderStaffMaximums.dedicatedFans;

/** What each sheet is called — its row's label (K18) — and what of it the team holds now. Literal keys, for the dictionary test. */
const KINDS = {
  name: { title: () => t("teamSettings.name"), own: (now) => now.name },
  league: { title: () => t("teamSettings.league"), own: (now) => now.league },
  favoured: { title: () => t("teamSettings.favoured"), own: (now) => now.favoured },
  fans: { title: () => t("teamSettings.fans"), own: (now) => now.fans },
  race: { title: () => t("teamSettings.race"), own: (now) => now.raceSlug },
};
export const SETTINGS_KINDS = Object.freeze(Object.keys(KINDS));

/** A team's roster as a draft to change: `normalizeDraft` of a copy, so the list's own object is never touched. */
export const draftOf = (team) => normalizeDraft(structuredClone(team?.roster ?? {}));

/**
 * What a sheet's one button waits for, the same for the sheet that draws it and the press that sends: `chosen` is
 * what it would save; `closed` why nothing may be saved now (the section's `held`; for the race also a match being
 * prepared, or the season, K17); `refusal` a name that is none (`teamNameRefusal`); `ready` whether a press sends —
 * not while closed or refused, nor for what the team holds already (a name compared without its blanks).
 *
 * @param {{kind: string, value: string|number|null, now: object}} form `now` is the section's model (`settingsModel`)
 * @returns {{chosen: string|number, closed: string, refusal: {code: string, params: object}|null, ready: boolean}}
 */
export function settingsCheck({ kind, value, now }) {
  const own = KINDS[kind].own(now);
  const chosen = value ?? own;
  const closed = kind === "race" ? now.raceHeld || (now.inSeason ? t("roster.raceLockedInSeason") : "") : now.held;
  const refusal = kind === "name" ? teamNameRefusal(chosen) : null;
  const same = kind === "name" ? String(chosen).trim() === String(own).trim() : chosen === own;
  return { chosen, closed, refusal, ready: !closed && !refusal && !same };
}

/** A box of warnings, a line each, in the look of TeamNew's line under the races (`.g-races__resets`: what another race would cost). */
function dropsBox(lines) {
  const shown = lines.map((line) => `<span class="g-team-settings__drop">${escapeHtml(line)}</span>`).join("");
  return `<div class="g-races__resets g-team-settings__drops">${shown}</div>`;
}

function nameBody(form, check) {
  const error = check.refusal ? t(`teamSettings.refusal.${check.refusal.code}`, check.refusal.params) : "";
  // Read-only while the save is on its way (not disabled: a focused field that is disabled drops the focus).
  return renderTextField({ id: NAME_FIELD_ID, name: "name", label: t("teamSettings.name"), value: check.chosen, autocomplete: "off", readonly: form.pending, error });
}

/** «Rotter: Prehensile Tail, Extra Arms; #4: Horns»: the skills a god takes off, each player's together, by name or by number. */
function droppedList(draft, dropped) {
  const players = new Map();
  for (const { playerId, name, skill } of dropped) {
    if (!players.has(playerId)) {
      const number = String(draft.players.find((player) => String(player?.id ?? "") === playerId)?.number ?? "").trim();
      players.set(playerId, { who: name.trim() || `#${number}`, skills: [] });
    }
    players.get(playerId).skills.push(skill);
  }
  return [...players.values()].map(({ who, skills }) => `${who}: ${skills.join(", ")}`).join("; ");
}

/** The favoured skills the god chosen takes off (`withFavoured`), named before «Save»; nothing when it takes none. */
function favouredDrops(form, check) {
  if (!form.race || check.chosen === form.now.favoured) return "";
  const draft = draftOf(form.team);
  const changed = withFavoured(form.race, draft, check.chosen);
  if (changed.code || !changed.dropped.length) return "";
  return dropsBox([t("teamSettings.favouredDrops", { list: droppedList(draft, changed.dropped) })]);
}

/** A league or a god: the builder's choice (stage 06, `choiceSheet`), one radio group named as the row is (K18). */
function choiceBody(form, check) {
  const league = form.kind === "league";
  const options = league ? form.now.leagues : form.now.alignments;
  const list = renderOptionList({
    label: KINDS[form.kind].title(),
    options: options.map((value) => ({ value, title: value, radio: true })),
    selected: check.chosen,
  });
  return league ? list : `${list}${favouredDrops(form, check)}`;
}

/** The fans as the roster's counter draws them; «+» at the maximum says why (the domain's own refusal). */
function fansBody(form, check) {
  return renderResourceCounter({
    key: "settings:fans",
    name: t("teamSettings.fans"),
    note: t("teamSettings.fansNote"),
    value: check.chosen,
    incBlockedReason: check.chosen >= FANS_MAX ? t("teamSettings.refusal.FANS_RANGE", { max: FANS_MAX }) : "",
  });
}

/** The races as TeamNew lists them (stage 06), one radio group (`wireRadioGroups`). */
const raceBody = (form, check) => racesMarkup(form.races, check.chosen);

/** What a staff is called: the dictionary's word for the bribes, the rule table's title for a medic (as the resources name them). */
function staffWords({ key, count }) {
  const title = key === "bribes" ? t("savedRoster.bribes") : medicalStaffDefinitions.find((staff) => staff.key === key)?.title ?? key;
  return count > 1 ? `${title} ×${count}` : title;
}

/**
 * What a race changed lets go, said by the red button (K17): the squad, always; the staff and the bribes the chosen
 * race cannot hold (`withRace`'s `staff`), once one is chosen. The treasury, the resources and the history stay.
 */
function raceDrops(form, check) {
  const lines = [t("teamSettings.raceDrops", { count: form.now.players })];
  if (check.chosen !== form.now.raceSlug) {
    const changed = withRace(form.races, draftOf(form.team), { before: form.now.raceSlug, after: check.chosen, inSeason: false });
    if (!changed.code && changed.staff.length) lines.push(t("teamSettings.raceStaff", { list: changed.staff.map(staffWords).join(", ") }));
  }
  return dropsBox(lines);
}

const BODIES = { name: nameBody, league: choiceBody, favoured: choiceBody, fans: fansBody, race: raceBody };

/**
 * The sheet's foot: «Save», or the race's red button (`kind: "danger"`, decision 28) under the words of what it lets go.
 * Neither is disabled while its save is on its way (`busy`: a focused button that is disabled drops the focus in
 * Chrome); a second press is refused by the controller (sheet-host.mjs).
 */
function footOf(form, check) {
  const busy = form.pending;
  const disabled = !busy && !check.ready;
  if (form.kind !== "race") {
    return renderButton({ kind: "primary", label: busy ? t("treasury.money.saving") : t("teamSettings.save"), busy, disabled, data: { settingsSave: "" } });
  }
  // Until another race is chosen the button names none, as TeamNew's does («Choose a race»): naming the team's own
  // would promise a change to what it has.
  const race = form.races.find((item) => item.slug === check.chosen);
  const unchosen = check.chosen === form.now.raceSlug;
  const label = busy ? t("treasury.money.saving") : unchosen ? t("newTeam.needRace") : t("teamSettings.raceChange", { race: race?.title ?? String(check.chosen) });
  return `${raceDrops(form, check)}${renderButton({ kind: "danger", label, busy, disabled, data: { settingsRace: "" } })}`;
}

/**
 * One sheet of the settings, closed (`patchWithModal` opens it).
 *
 * @param {object} form
 * @param {"name"|"league"|"favoured"|"fans"|"race"} form.kind
 * @param {string|number|null} form.value what the coach has chosen; null for what the team holds
 * @param {boolean} form.pending its save is on its way
 * @param {string} form.refusal what the last press was told, in words; "" for none
 * @param {object} form.team the team as the coach's list holds it
 * @param {object|null} form.race the reference's entry for its race
 * @param {object[]} form.races every race (`state.data.teams`)
 * @param {object} form.now the section's model of the team (`settingsModel`)
 * @returns {string}
 */
export function settingsSheetMarkup(form) {
  const check = settingsCheck(form);
  // What holds the sheet is said over it; not while its own save is on its way, which is what holds it then.
  const closed = check.closed && !form.pending ? renderCallout({ tone: "warn", title: check.closed }) : "";
  // During a preparation a save starts its steps over (decision 20, final review I1), as every roster sheet says; the
  // race, which a preparation closes (K17), says that instead.
  const prep = form.now.preparing && form.kind !== "race" ? `<p class="g-team-settings__prep">${escapeHtml(prepResetWords("teamSettings.prep"))}</p>` : "";
  // Always on the page, so that a screen reader hears what is put in it.
  const alert = `<div class="g-team-settings__alert" role="alert">${form.refusal ? renderCallout({ tone: "danger", title: form.refusal }) : ""}</div>`;
  return renderSheet({
    id: SETTINGS_SHEET_ID,
    title: KINDS[form.kind].title(),
    bodyHtml: `<div class="g-team-settings__sheet" data-settings-kind="${escapeHtml(form.kind)}">${closed}${BODIES[form.kind](form, check)}${prep}${alert}</div>`,
    footHtml: footOf(form, check),
    wide: form.kind === "race",
    className: "g-team-settings-sheet",
  });
}
