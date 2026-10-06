/** Shared presentation for the builder, rosters and match checklists. */
import { escapeHtml } from "../core/dom.mjs";

export const MATCHDAY_CREST = '<svg viewBox="0 0 80 100" aria-hidden="true"><path d="M5 5h70v60c0 14-20 25-35 30C25 90 5 79 5 65Z"/><path d="m20 64 20-36 20 36H20Z"/><path d="m31 64 9-16 9 16H31Z"/></svg>';

export function renderMatchdayHero({ name, eyebrow, description, edition, logo = "", nameAttributes = "" }) {
  return `<section class="matchday-hero" data-key="matchday-hero">
    <div class="matchday-crest">${logo ? `<img src="${escapeHtml(logo)}" alt="">` : MATCHDAY_CREST}</div>
    <div class="matchday-hero-copy"><span class="matchday-eyebrow">${escapeHtml(eyebrow)}</span>
    <h2 ${nameAttributes}>${escapeHtml(name)}</h2><p>${escapeHtml(description)}</p></div>
    <div class="matchday-edition" aria-hidden="true">${escapeHtml(String(edition).padStart(2, "0"))}</div>
  </section>`;
}

/** Labels and valueHtml are trusted markup supplied by the screen. */
export function renderMatchdayScoreboard(rows) {
  return `<dl class="matchday-scoreboard">${rows.map(row => `<div><dt>${row.label}</dt><dd ${row.attribute || ""} class="${row.danger ? "danger-text" : ""}">${row.valueHtml}</dd></div>`).join("")}</dl>`;
}
