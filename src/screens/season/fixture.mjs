/**
 * The season's fixture tab: the signed-in coach's current-round match.
 *
 * Mechanically moved out of src/app.js.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl } from "../../core/routes.mjs";
import { renderPlayerLink } from "../../components/content-links.mjs";
import {
  pairingCasualties,
  pairingEntry,
  pairingLeaguePoints,
  pairingTouchdowns,
  seasonTeamProfileLink,
  seasonTeamRulesLink,
} from "./season-links.mjs";

function currentFixtureForData(data) {
  if (!data.myEntry) return null;
  if (data.currentFixture) return data.currentFixture;
  return [...(data.rounds ?? [])]
    .filter((round) => round.status === "started")
    .sort((a, b) => b.roundNumber - a.roundNumber)
    .flatMap((round) => round.pairings)
    .find((pairing) => pairing.homeEntryId === data.myEntry.id || pairing.awayEntryId === data.myEntry.id) ?? null;
}

export function renderLeagueFixture(data) {
  const myEntry = data.myEntry;
  if (!myEntry) {
    return `
      <section class="content-panel season-card">
        <h2>${t("season.leagueFixtureHeading")}</h2>
        <p>${t("season.commitFirstNote")}</p>
      </section>
    `;
  }

  const fixture = currentFixtureForData(data);
  if (!fixture) {
    return `
      <section class="content-panel season-card">
        <h2>${t("season.leagueFixtureHeading")}</h2>
        <p>${t("season.noActivePairingNote")}</p>
      </section>
    `;
  }

  const home = pairingEntry(data, fixture.homeEntryId);
  const away = pairingEntry(data, fixture.awayEntryId);
  const isHome = fixture.homeEntryId === myEntry.id;
  const opponent = isHome ? away : home;
  return `
    <section class="content-panel season-card">
      <h2>${t("season.leagueFixtureHeading")}</h2>
      <div class="fixture-headline">
        <div>
          <span class="muted-text">${t("season.roundLabel")} ${fixture.roundNumber} · ${t("season.tableLabel")} ${fixture.tableNumber}</span>
          <strong>${seasonTeamProfileLink(myEntry)}</strong>
        </div>
        <div>
          <span class="muted-text">${t("season.opponentLabel")}</span>
          ${opponent ? `
            <strong>${seasonTeamProfileLink(opponent)}</strong>
            <p>${renderPlayerLink(opponent.user)} · ${seasonTeamRulesLink(opponent)}</p>
          ` : `<strong>${t("season.byeLabel")}</strong>`}
        </div>
      </div>

      <div class="season-score-summary">
        <span>${t("season.touchdownsLabel")}: <strong>${escapeHtml(pairingTouchdowns(fixture))}</strong></span>
        <span>${t("season.casualtiesLabel")}: <strong>${escapeHtml(pairingCasualties(fixture))}</strong></span>
        <span>${t("season.leaguePointsLabel")}: <strong>${escapeHtml(pairingLeaguePoints(fixture))}</strong></span>
      </div>

      ${opponent ? `<a class="primary-button" href="${gameUrl(fixture)}">${t("games.openGameAction")}</a>` : `<p>${t("season.oneTeamFixtureNote")}</p>`}
    </section>
  `;
}
