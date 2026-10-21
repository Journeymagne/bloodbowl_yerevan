/** Keep each team's TD/CAS together in both result entry flows: the 2.x post-match and the administrator's manual result. */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";

export function renderResultFields(sides, values, { maximum, status } = {}) {
  return `<div class="match-result-teams">${["home", "away"].map(key => `<fieldset class="match-result-team">
    <legend><strong>${escapeHtml(sides[key]?.team?.name || t("season." + key + "Label"))}</strong>${sides[key]?.user?.login ? `<small>${escapeHtml(sides[key].user.login)}</small>` : ""}</legend>
    <div class="match-result-fields">${["Touchdowns", "Casualties"].map(stat => `<label class="filter-field"><span>${t(stat === "Touchdowns" ? "season.touchdownsLabel" : "season.casualtiesHeader")}</span>
    <input name="${key + stat}" type="number" min="0" ${maximum === undefined ? "" : `max="${maximum}"`} step="1" inputmode="numeric" required value="${escapeHtml(values[key + stat] ?? "")}"></label>`).join("")}</div>
    ${status ? `<p>${escapeHtml(status(key))}</p>` : ""}
  </fieldset>`).join("")}</div>`;
}

/** The administrator's manual result on the game page: the score when there is one, else the score sent. */
export function renderAdminResultForm(game) {
  const values = {};
  for (const key of ["homeTouchdowns", "awayTouchdowns", "homeCasualties", "awayCasualties"]) {
    values[key] = game[key] ?? game["proposed" + key[0].toUpperCase() + key.slice(1)];
  }
  return `<form class="game-result-form" data-admin-game-result>
    <h3>${t("games.adminEditHeading")}</h3>
    ${renderResultFields(game, values)}
    <button class="primary-button" type="submit">${t("games.adminSaveResultAction")}</button>
  </form>`;
}
