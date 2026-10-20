/**
 * The team's settings on a phone are a screen of their own (owner, 2026-10-20: «отдельный экран на мобилке… есть
 * кнопка назад»), under Builder.html's head; on a desk the card stands in the team page's right column (index.mjs
 * places it, settings.css gives it its area).
 *
 * The screen is the address `#/t/:id/settings` on a phone. The shell draws no header there (`drill`,
 * shell/navigation.mjs), so this head is the screen's only one: «‹» back to the team page, «Team settings» as its h1,
 * the team's name and race under it. Under the head stand the rows as the desk's card draws them (`settingsMarkup`
 * without its h2: the h1 carries its id, and names the section), with what holds them; the sheets are the same ones,
 * over the screen. The phone's team page leads here by a row of its own (`settingsEntryMarkup`), its last, after the
 * history.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { teamUrl } from "../../../core/routes.mjs";
import { icon } from "../../../ui/icons.mjs";
import { renderNavRow } from "../../../ui/list-row.mjs";
import { settingsMarkup } from "./settings.mjs";

/**
 * The phone's settings screen of a team.
 *
 * @param {{teamId: string, team: object, settings: object}} model the team page's model (`manageModel`)
 * @param {object} [options]
 * @param {string} [options.noticeHtml] what the team page says over itself that the settings do not say of themselves
 *   (the games not read: `renderCallout`'s markup), drawn over the rows
 * @returns {string}
 */
export function settingsScreenMarkup(model, { noticeHtml = "" } = {}) {
  const { teamId, team, settings } = model;
  const sub = [team.name, settings.raceTitle].filter(Boolean).join(" · ");
  const back = `<a class="g-team-settings-screen__back" href="${escapeHtml(teamUrl(teamId, "team"))}" aria-label="${escapeHtml(t("teamSettings.backLabel"))}">${icon("back", 18)}</a>`;
  const titles = '<div class="g-team-settings-screen__titles">'
    + `<h1 class="g-team-settings-screen__title" id="team-settings-title" tabindex="-1">${escapeHtml(t("teamSettings.title"))}</h1>`
    + `<p class="g-team-settings-screen__sub">${escapeHtml(sub)}</p></div>`;
  return `<div class="g-team-settings-screen" data-screen="team-settings"><header class="g-team-settings-screen__head">${back}${titles}</header>`
    + `<div class="g-team-settings-screen__body">${noticeHtml}${settingsMarkup(model, { titled: false })}</div></div>`;
}

/** The phone's team page's way to its settings: a row, framed as the history's card. */
export function settingsEntryMarkup(teamId) {
  const row = renderNavRow({ href: teamUrl(teamId, "settings"), title: t("teamSettings.title"), desc: t("teamSettings.entryDesc") });
  return `<div class="g-team-settings-entry">${row}</div>`;
}
