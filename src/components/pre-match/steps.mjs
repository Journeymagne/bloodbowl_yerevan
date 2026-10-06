import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { SIDES, otherSide } from "../../domain/match/rules.mjs";
import { calculateMatchCtv, journeymanPositions } from "../../domain/match/roster.mjs";
import { weatherResult } from "../../domain/match/weather.mjs";
import { matchCatalog } from "../../domain/match/catalog.mjs";
import { matchBudget } from "../../domain/match/budget.mjs";
import { matchPlayers } from "../../domain/match/snapshot.mjs";
import { renderEffects } from "./effects.mjs";
import { rosterMax } from "../../domain/roster/values.mjs";
import { safe, money, diceField, playerCard, actionButton } from "./shared.mjs";

export function renderFans(payload, sideName, readonly) {
  const prep = payload.preparation;
  return `<h2>${t("pre.fans")}</h2><p class="pre-intro">${t("pre.fansIntro")}</p><div class="pre-two-teams">${SIDES.map(name => {
    const side = prep[name];
    return `<section class="pre-team-panel"><span class="matchday-eyebrow">${safe(side.user.login)}</span><h3>${safe(side.team.name)}</h3><p>${t("pre.dedicated")}: <strong>${side.roster.dedicatedFans}</strong></p>
      ${name === sideName && !readonly ? `<form data-pre-fans>${diceField("roll", side.fansRoll, 3, t("pre.fairWeatherFans"))}<button class="primary-button" type="submit">${t("pre.saveRoll")}</button></form>` : `<p>D3: <strong>${side.fansRoll || "—"}</strong></p>`}
      <div class="pre-result"><span>${t("pre.fanFactor")}</span><strong>${side.fansRoll ? Number(side.roster.dedicatedFans) + side.fansRoll : "—"}</strong></div></section>`;
  }).join("")}</div>`;
}

export function renderWeather(payload, readonly) {
  const weather = payload.preparation.weather, result = weatherResult(state.data, weather);
  return `<h2>${t("pre.weather")}</h2><p class="pre-intro">${t("pre.weatherIntro")}</p><form data-pre-weather class="pre-team-panel"><fieldset ${readonly ? "disabled" : ""}>
    <label>${t("pre.weatherTable")}<select name="season">${["Spring", "Summer", "Autumn"].map(season => `<option value="${season}" ${weather.season === season ? "selected" : ""}>${t(`pre.season.${season}`)}</option>`).join("")}</select></label>
    <div class="pre-dice-row">${SIDES.map(side => diceField(side, weather[side], 6, payload.preparation[side].team.name)).join("")}</div>${!readonly ? `<button type="submit" class="primary-button">${t("pre.saveWeather")}</button>` : ""}</fieldset></form>
    ${result ? `<article class="pre-weather-result"><span class="matchday-eyebrow">2D6 · ${Number(weather.home) + Number(weather.away)}</span><h3>${safe(result.name)}</h3><p>${safe(result.description)}</p></article>` : ""}`;
}

export function renderRoster(payload, sideName, readonly, ui) {
  const side = payload.preparation[sideName], ctv = calculateMatchCtv(side), editable = !readonly && !side.rosterLocked;
  const available = side.players.filter(player => !player.skipNextGame), missing = Math.max(0, 7 - ctv.players);
  const positions = journeymanPositions(side.reference);
  const pool = positions.map(row => ({ id: `position-${row.rowIndex}`, number: "+", name: row.position, row,
    stats: Object.fromEntries(["ma", "st", "ag", "pa", "ar"].map(stat => [stat, row[stat]])),
    skills: [...row.skills, "Loner (4+)"], value: ctv.lowCost ? 0 : Number(String(row.price || row.cost).match(/\d+/)?.[0] || 0),
    full: [...available, ...side.journeymen].filter(player => player.rowIndex === row.rowIndex).length >= rosterMax(row.qty) }));
  return `<div class="pre-section-head"><div><span class="matchday-eyebrow">${t("pre.oneMatch")}</span><h2>${t("pre.roster")}<span class="matchday-heading-dot">.</span></h2></div>${actionButton("pre.addJourneyman", "open-journeymen", !editable || !missing)}</div>
    <p class="${missing ? "notice-box" : "pre-intro"}">${t(missing ? "pre.missingPlayers" : "pre.rosterReady", { count: missing, available: ctv.players })}</p>
    <div class="matchday-player-list pre-player-grid">${available.map(player => playerCard(player)).join("")}${side.journeymen.map(player => playerCard(player, editable)).join("")}</div>
    ${side.players.some(player => player.skipNextGame) ? `<details class="pre-mng"><summary>${t("pre.mng")}</summary><div class="pre-player-grid">${side.players.filter(player => player.skipNextGame).map(player => playerCard(player)).join("")}</div></details>` : ""}
    <details class="pre-ctv-details"><summary>${t("pre.ctvBreakdown")} · ${money(ctv.total)}</summary><dl class="summary-stat-grid"><dt>${t("savedRoster.playersCost")}</dt><dd>${money(ctv.playersValue)}</dd><dt>${t("pre.rerollsValue")}</dt><dd>${money(ctv.rerolls)}</dd><dt>${t("pre.medicalValue")}</dt><dd>${money(ctv.medical)}</dd><dt>${t("savedRoster.bribes")}</dt><dd>${money(ctv.bribes)}</dd></dl><p>${t("pre.ctvExclusions")}</p>${ctv.lowCost ? `<p>${t("pre.lowCost")}</p>` : ""}</details>
    <div class="pre-inline-actions">${actionButton("pre.lockRoster", "lock-roster", !editable)}${side.rosterLocked && !readonly ? actionButton("pre.reopen", "reopen", false, "filter-button") : ""}</div>
    ${side.rosterLocked ? `<p class="pre-intro">${t("pre.rosterLocked")}</p>` : ""}
    <details class="pre-mng"><summary>${t("pre.opponentRoster")}</summary><div class="pre-player-grid">${payload.preparation[otherSide(sideName)].players.filter(player => !player.skipNextGame).map(player => playerCard(player)).join("")}</div></details>
    <dialog class="matchday-hire-dialog" data-pre-journeymen ${ui.dialog === "journeymen" ? "open" : ""} aria-labelledby="pre-journeymen-title"><header><div><span class="matchday-eyebrow">${safe(side.team.name)}</span><h2 id="pre-journeymen-title">${t("pre.addJourneyman")}</h2><p>${t("pre.journeymanNotice")}</p></div>${actionButton("common.close", "close-journeymen", false, "filter-button")}</header><div class="matchday-hire-list">${pool.map(player => `<div>${playerCard(player)}<button class="primary-button pre-hire-button" data-pre-hire="${player.row.rowIndex}" ${player.full ? "disabled" : ""}>${t(player.full ? "pre.positionFull" : "pre.choosePosition")}</button></div>`).join("")}${!pool.length ? `<p>${t("pre.noJourneymanPositions")}</p>` : ""}</div></dialog>`;
}

export function renderReview(payload, sideName, readonly) {
  const prep = payload.preparation;
  const summaries = SIDES.map(name => {
    const side = prep[name], budget = matchBudget(prep, name, state.data);
    const purchases = matchCatalog(side, state.data).filter(item => side.basket[item.id]);
    const players = payload.snapshots[name]?.players || matchPlayers(prep, name, state.data);
    return `<section class="pre-team-panel"><h3>${safe(side.team.name)}</h3><p>${t("pre.ctv")}: <strong>${money(calculateMatchCtv(side).total)}</strong> · ${t("pre.fanFactor")}: <strong>${Number(side.roster.dedicatedFans) + side.fansRoll}</strong></p><p>${t("pre.fromTreasury")}: ${money(budget.treasuryUsed)}</p>
      <ul class="pre-purchase-list">${purchases.map(item => `<li>${safe(item.title)} × ${side.basket[item.id]}<strong>${money(item.cost * side.basket[item.id])}</strong></li>`).join("")}</ul>${renderEffects(prep, name, false)}<details><summary>${t("pre.matchPlayers", { count: players.length })}</summary><div class="pre-player-grid">${players.map(player => playerCard(player)).join("")}</div></details></section>`;
  }).join("");
  return `<h2>${t("pre.review")}</h2><p class="pre-intro">${t("pre.reviewIntro")}</p><div class="pre-two-teams">${summaries}</div><div class="pre-inline-actions">${!readonly ? actionButton(prep[sideName].confirmed ? "pre.confirmed" : "pre.confirmPreparation", "confirm", prep[sideName].confirmed) : ""}${prep.status === "ready" && !readonly ? actionButton("pre.startMatch", "start") : ""}</div><p class="pre-game-reminder">${t("pre.setupReminder")}</p>`;
}
