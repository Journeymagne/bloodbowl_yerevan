/** Keep each team's TD/CAS together in both result entry flows. */
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

export function renderGameResultForm(game, admin = false) {
  const values = {};
  for (const key of ["homeTouchdowns", "awayTouchdowns", "homeCasualties", "awayCasualties"]) {
    const proposed = game["proposed" + key[0].toUpperCase() + key.slice(1)];
    values[key] = admin ? game[key] ?? proposed : proposed ?? game[key];
  }
  return `<form class="game-result-form" ${admin ? "data-admin-game-result" : "data-game-proposal"}>
    ${admin ? `<h3>${t("games.adminEditHeading")}</h3>` : ""}
    ${renderResultFields(game, values)}
    <button class="primary-button" type="submit">${t(admin ? "games.adminSaveResultAction" : "games.requestConfirmationAction")}</button>
  </form>`;
}
