/**
 * Who the team is: its race, its name and its logo. Shared by both editors.
 *
 * There used to be two copies — the identity block inside the builder's info
 * panel and renderSavedRosterIdentity — the same three fields and the same logo
 * preview, differing only in the data attributes the controls carried and two
 * class names. The rules that follow from the race are rendered by each editor
 * where its layout wants them.
 *
 * Only the contents are shared. Each editor keeps its own wrapper element,
 * because that is layout: the builder's block sits inside its info panel, the
 * league editor's is a side panel of its own, and the stylesheet targets both
 * by name.
 */
import { escapeHtml, renderOption } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { iconButton } from "../icons.mjs";

/**
 * @param {object} options
 * @param {object} options.team the race currently chosen
 * @param {object} options.draft the roster being edited
 * @param {object[]} options.teams every race, for the picker
 * @param {object} options.mode CREATE_MODE or LEAGUE_MODE
 */
export function renderIdentityFields({ team, draft, teams, mode }) {
  const attribute = mode.identityAttribute;
  return `
    <div class="builder-form ${mode.identityFormClass}">
      <label class="filter-field">
        <span>${t("sidebar.teamHeading")}</span>
        <select data-${attribute}-team>
          ${teams.map((item) => renderOption(item.slug, item.title, team.slug)).join("")}
        </select>
      </label>
      <label class="filter-field">
        <span>${t("savedRoster.teamName")}</span>
        <input type="text" value="${escapeHtml(draft.teamName || team.title)}" data-${attribute}-name>
      </label>
      <label class="filter-field">
        <span>${t("savedRoster.logoField")}</span>
        <input type="file" accept="image/*" data-${attribute}-logo>
      </label>
    </div>
    ${draft.logoData ? `
      <div class="builder-logo-inline roster-logo-inline">
        <img class="builder-logo-preview" src="${escapeHtml(draft.logoData)}" alt="">
        ${iconButton("trash", { title: t("savedRoster.removeLogo"), attributes: `data-${attribute}-remove-logo` })}
      </div>
    ` : ""}
  `;
}
