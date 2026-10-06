/** Checklist structure only; each screen owns its rules, actions and draft. */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl } from "../../core/routes.mjs";
import { renderHeader } from "../page-chrome.mjs";
import { renderMatchdayHero, renderMatchdayScoreboard } from "../matchday.mjs";

export function renderChecklistLayout({ phase, gameId, description, hero, sideName, sides, isAdmin,
  steps, step, current, urlForStep, stats, notices = "", content, summary, busy, mobile }) {
  const next = Math.min(step + 1, steps.length - 1);
  const canNext = next <= current && next !== step;
  const nextLink = canNext ? `<a class="primary-button pre-next" href="${urlForStep(gameId, steps[next])}">${t("pre.nextStep")}</a>` : "";
  return `<div class="matchday-editor pre-match ${phase === "post" ? "post-match" : ""}" data-key="${phase}-match">
    ${renderHeader(t(phase + ".title"), description, "", { back: true, backFallback: gameUrl(gameId) })}
    ${renderMatchdayHero(hero)}
    ${isAdmin ? `<label class="pre-admin-side">${t("pre.coachSide")}<select data-${phase}-side>${["home", "away"].map(key => `<option value="${key}" ${key === sideName ? "selected" : ""}>${escapeHtml(sides[key].user.login)}</option>`).join("")}</select></label>` : ""}
    <nav class="pre-step-nav ${phase === "post" ? "post-step-nav" : ""}" aria-label="${t(phase + ".steps")}">${steps.map((key, index) => `<a href="${urlForStep(gameId, key)}" ${index === step ? 'aria-current="step"' : ""} ${index > current ? 'aria-disabled="true"' : ""}><span>${index < current ? "✓" : index + 1}</span>${t(phase + ".step." + key)}</a>`).join("")}</nav>
    ${renderMatchdayScoreboard(stats.map(([key, valueHtml]) => ({ label: t(key), valueHtml })))}
    ${notices}
    <div class="matchday-workspace pre-workspace"><section class="pre-content" aria-busy="${busy}">${content}${nextLink}</section><aside class="matchday-sidebar">${summary}</aside></div>
    <div class="matchday-mobile-dock pre-mobile-dock"><div><strong>${mobile.value}</strong><small>${t(mobile.label)}</small></div>${mobile.next && canNext ? nextLink : `<span>${t(phase + ".stepLabel", { step: step + 1 })}</span>`}</div>
  </div>`;
}

export function renderChecklistSummary({ title, teamName, values, noteHtml, sides }) {
  return `<details class="pre-summary-disclosure" ${window.matchMedia("(min-width: 1200px)").matches ? "open" : ""}><summary>${t(title)}</summary>
    <div class="builder-info-summary pre-summary"><span class="matchday-eyebrow">${t(title)}</span><h3>${escapeHtml(teamName)}</h3>
    <dl class="summary-stat-grid">${values.map(([key, value]) => `<dt>${t(key)}</dt><dd data-summary-value="${escapeHtml(key)}">${escapeHtml(value)}</dd>`).join("")}</dl>
    <div class="pre-summary-note">${noteHtml}</div>
    <div class="pre-team-readiness">${sides.map(side => `<p><span class="pre-status-dot ${side.confirmed ? "done" : ""}"></span>${escapeHtml(side.user.login)}<small>${t(side.confirmed ? "pre.confirmed" : "pre.notConfirmed")}</small></p>`).join("")}</div>
    </div></details>`;
}
