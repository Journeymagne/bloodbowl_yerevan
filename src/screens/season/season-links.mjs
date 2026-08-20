/**
 * Formatting a season entry/pairing for display: a coach + team label, a
 * link to the team's rules page or public profile, and the home/away
 * pairing numbers.
 *
 * Mechanically moved out of src/app.js. Shared across screens/season/
 * {registration,fixture,schedule,standings}.mjs — registration's entries
 * table, the fixture card, and the schedule's pairing rows all format the
 * same shapes.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { pageUrl } from "../../core/routes.mjs";
import { renderPlayerLink, renderPublicTeamLink } from "../../components/content-links.mjs";

export function seasonEntryLabel(entry) {
  if (!entry) return "-";
  return `${entry.user.login} · ${entry.team.name}`;
}

export function seasonTeamRulesLink(entry) {
  const team = state.data.teams.find((item) => item.slug === entry?.team?.baseTeamSlug);
  return team
    ? `<a class="inline-rule-link" href="${pageUrl(team)}">${escapeHtml(team.title)}</a>`
    : escapeHtml(entry?.team?.baseTeamSlug || "-");
}

export function seasonTeamProfileLink(entry) {
  return entry ? renderPublicTeamLink(entry.user, entry.team) : `<span class="muted-text">-</span>`;
}

export function pairingEntry(data, entryId) {
  return (data.entries ?? []).find((entry) => entry.id === entryId) ?? null;
}

export function pairingTeamCell(data, entryId) {
  const entry = pairingEntry(data, entryId);
  if (!entry) return `<span class="muted-text">${t("season.emptySlotLabel")}</span>`;
  return `
    <span class="season-pairing-team">
      <strong>${seasonTeamProfileLink(entry)}</strong>
      <span>${renderPlayerLink(entry.user)} · ${seasonTeamRulesLink(entry)}</span>
    </span>
  `;
}

export function pairingLeaguePoints(pairing) {
  const home = pairing.homePoints ?? "-";
  const away = pairing.awayPoints ?? "-";
  return `${home} / ${away}`;
}

export function pairingTouchdowns(pairing) {
  const home = pairing.homeTouchdowns ?? "-";
  const away = pairing.awayTouchdowns ?? "-";
  return `${home} / ${away}`;
}

export function pairingCasualties(pairing) {
  const home = pairing.homeCasualties ?? "-";
  const away = pairing.awayCasualties ?? "-";
  return `${home} / ${away}`;
}
