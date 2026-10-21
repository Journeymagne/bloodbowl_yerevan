/**
 * A team's name and logo in the administration (stage 12; the owner's answer, binding over plan decision 25: the admin
 * edits a team's name and its logo, never its race — what the 2.x editor did on this address). A card of the admin's
 * visit of the roster, where the coach's treasury strip stands (view.mjs; Task 15's admin block takes it into its grid).
 * No prototype draws it: it has DeskAdminTeamEdit.html's «Treasury» card's look — the title, a 48px field, the main
 * button — and the logo's line of the team's settings. The race is shown, and nothing changes it.
 *
 * Each change is one step of the roster's queue (save.mjs, `stepIdentity`): the team's name or its logo in the body, its
 * race and its roster as they are, on the visit's route — the admin's `PATCH /api/admin/teams/:id` (source.mjs). It goes
 * only when nothing holds the roster's steps (`lockOf`: the games or a read on their way, a death in the air, another
 * device's save to settle) and no step of the queue's waits or is in the air; else the press says what it waits for, and
 * nothing goes. What is typed is kept until it is sent, so a draw of the roster meanwhile does not take it back. A logo
 * is read and made smaller first (as the builder and the team's settings take one): one too large, or that is no
 * picture, is said, and nothing goes. A second press of the same name sends nothing: the team has it already.
 */
import { toast, toastError } from "../../../components/toast.mjs";
import { delegate, escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { fileToOptimizedLogoDataUrl, logoUploadMaxBytes } from "../../../core/logo-upload.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { teamNameRefusal } from "../../../domain/roster/team-edits.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { icon } from "../../../ui/icons.mjs";
import { renderTextField } from "../../../ui/text-field.mjs";
import { LOGO_DATA_URL } from "../../teams/new.mjs";
import { saveState, savedIdentity, stepIdentity } from "./save.mjs";
import { lockOf, modeOf } from "./screen.mjs";
import { adminOf } from "./source.mjs";

/** The name's field and the logo's file field. */
const NAME_ID = "admin-team-name";
const LOGO_ID = "admin-team-logo";
const TITLE_ID = "admin-team-identity-title";

/** What is typed in the name's field, by team, until it is sent; none typed, the field shows the team's name. A visit starts with none. */
const typed = new Map();

/** The logo as a picture, or "" for none (or for anything else the team holds). */
const pictureOf = (logoData) => {
  const logo = String(logoData ?? "");
  return LOGO_DATA_URL.test(logo) ? logo : "";
};

/** The logo's line: its frame with the picture or the glyph of one, its name and sizes, «Upload» (the file field's label) and «Remove» when there is one. */
function logoMarkup(logo) {
  const picture = logo ? `<img src="${escapeHtml(logo)}" alt="">` : icon("image", 18);
  const file = `<input class="g-sr-only" type="file" id="${LOGO_ID}" accept="image/png,image/jpeg">`
    + `<label class="g-btn g-adminteam__btn" for="${LOGO_ID}">${escapeHtml(t("newTeam.upload"))}</label>`;
  const remove = logo ? `<button type="button" class="g-btn g-adminteam__btn" data-identity-logo-remove>${escapeHtml(t("teamSettings.remove"))}</button>` : "";
  return `<div class="g-adminteam__logo" data-key="admin-team-logo"><span class="g-adminteam__picture">${picture}</span>`
    + `<span class="g-adminteam__logotext"><span class="g-adminteam__logoname">${escapeHtml(t("newTeam.logo"))}</span>`
    + `<span class="g-admin__note">${escapeHtml(t("newTeam.logoNote"))}</span></span>`
    + `<span class="g-adminteam__actions">${file}${remove}</span></div>`;
}

/**
 * The card: its title, the name's field — what is typed, or the team's name — and «Save the name», the logo's line, and
 * the race, which nothing changes. Keyed, so the field and the buttons are the same nodes through every draw.
 * @param {import("./view.mjs").RosterScreen} screen an admin's visit whose team is read
 * @returns {string}
 */
export function identityMarkup({ teamId, team, race }) {
  const field = renderTextField({ id: NAME_ID, name: "name", label: t("teamSettings.name"), value: typed.get(teamId) ?? team.name ?? "", autocomplete: "off" });
  const save = renderButton({ label: t("adminTeam.identity.save"), kind: "primary", data: { identitySave: true } });
  const raceLine = t("adminTeam.identity.race", { race: race?.title ?? team.baseTeamSlug });
  return `<section class="g-admin__card g-adminteam__identity" aria-labelledby="${TITLE_ID}" data-key="admin-team-identity">`
    + `<div class="g-admin__cardhead"><h2 id="${TITLE_ID}">${escapeHtml(t("adminTeam.identity.title"))}</h2></div>`
    + `${field}${save}${logoMarkup(pictureOf(team.logoData))}<p class="g-admin__note">${escapeHtml(raceLine)}</p></section>`;
}

/**
 * Why no change of the name or the logo may go now, "" when it may: what holds the roster's steps (`lockOf`), then a step
 * of the queue's waiting or in the air (save.mjs, `stepIdentity`).
 * @param {{teamId: string, visit: object}} saving
 */
function closedOf({ teamId, visit }) {
  const save = saveState(teamId);
  const lock = lockOf(teamId, save, visit, modeOf(teamId));
  if (lock) return lock;
  return save.waiting > 0 || save.status === SAVE_STATUS.SAVING || save.status === SAVE_STATUS.DIRTY ? t("adminTeam.waitQueue") : "";
}

/** One change as a step of the queue, asked again at the press; why it cannot go is said, and nothing goes. @returns {boolean} whether it went */
function send(saving, identity) {
  const closed = () => closedOf(saving);
  const reason = closed();
  if (reason) {
    toast(reason, { tone: "error" });
    return false;
  }
  const step = stepIdentity(saving.teamId, identity, { closed });
  if (step.refusal) toast(step.refusal, { tone: "error" });
  return step.ok === true;
}

/** «Save the name»: what is typed, without its blanks; an empty one and the team's own are said, and nothing goes. */
function saveName(saving) {
  const own = String(savedIdentity(saving.teamId)?.name ?? "").trim();
  const name = String(typed.get(saving.teamId) ?? own).trim();
  if (teamNameRefusal(name)) toast(t("teamSettings.refusal.TEAM_NAME_EMPTY"), { tone: "error" });
  else if (name === own) toast(t("adminTeam.identity.same"));
  else if (send(saving, { name })) {
    typed.delete(saving.teamId);
    saving.draw();
  }
}

/** A logo picked: a picture of up to 2 MB, read and made smaller, then one step; one too large or that is no picture is said. */
async function takeLogo(saving, file) {
  if (file.size > logoUploadMaxBytes) {
    toast(t("savedRoster.logoTooLarge"), { tone: "error" });
    return;
  }
  let logo = "";
  try {
    logo = await fileToOptimizedLogoDataUrl(file);
  } catch {
    logo = "";
  }
  if (!saving.visit.here) return;
  if (!LOGO_DATA_URL.test(logo)) toast(t("newTeam.logoUnreadable"), { tone: "error" });
  else if (send(saving, { logoData: logo })) saving.draw();
}

/** «Remove»: the logo taken off; the button that held the focus goes with it, so the file field takes it. */
function dropLogo(root, saving) {
  if (!send(saving, { logoData: "" })) return;
  saving.draw();
  if (!root.querySelector("[data-identity-logo-remove]")) root.querySelector(`#${LOGO_ID}`)?.focus();
}

/**
 * Everything the card does, on the view that outlives the roster's draws: what is typed in the name, «Save the name», the
 * file field (whose label, pressed while a change cannot go, says why instead of opening the picker) and «Remove». Only
 * on an admin's visit that is on the screen. Wire once per visit.
 * @param {Element} root the view
 * @param {{teamId: string, visit: object, draw: () => void}} saving the visit's side of the queue (index.mjs)
 * @returns {() => void} takes every listener off
 */
export function wireIdentity(root, saving) {
  typed.delete(saving.teamId);
  const admin = () => saving.visit.here && adminOf(saving.teamId) !== null;
  const offs = [
    delegate(root, "input", `#${NAME_ID}`, (event, field) => {
      if (admin()) typed.set(saving.teamId, field.value);
    }),
    delegate(root, "click", "[data-identity-save]", () => {
      if (admin()) saveName(saving);
    }),
    delegate(root, "click", "[data-identity-logo-remove]", () => {
      if (admin()) dropLogo(root, saving);
    }),
    delegate(root, "click", `label[for="${LOGO_ID}"], #${LOGO_ID}`, (event) => {
      const reason = admin() ? closedOf(saving) : "";
      if (!reason) return;
      event.preventDefault();
      toast(reason, { tone: "error" });
    }),
    delegate(root, "change", `#${LOGO_ID}`, (event, input) => {
      const file = input.files?.[0];
      // Emptied, so that the same file can be picked again.
      input.value = "";
      if (file && admin()) takeLogo(saving, file).catch((error) => toastError(error));
    }),
  ];
  return () => offs.forEach((off) => off());
}
