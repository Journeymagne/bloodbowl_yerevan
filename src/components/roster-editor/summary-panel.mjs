/**
 * The summary both editors show beside the roster.
 *
 * Step 7.5. The two had the same skeleton — a title with a link to the race,
 * a definition list of figures, then either the rule violations or a note that
 * there are none, then the actions — written out twice. The warnings-or-ok
 * expression in particular was identical and easy to change in one copy only.
 *
 * The figures themselves are not shared and are not pretended to be: a new
 * team shows what is left of its budget, a league team shows its treasury, its
 * SPP and its rerolls. Callers pass the rows they have; this owns the shape
 * around them.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";

/**
 * @param {object} options
 * @param {"aside"|"div"} [options.tag] element to wrap in
 * @param {string} options.className
 * @param {string} options.teamTitle       the race, shown as a link
 * @param {string} options.teamHref
 * @param {string} [options.statusHtml]    markup between the title and the link
 * @param {Array<{label: string, value: string, valueAttributes?: string, valueClass?: string}>} options.rows
 * @param {string[]} options.warnings      rule violations, already translated
 * @param {string} options.actionsHtml
 */
export function renderSummaryPanel({
  tag = "div",
  className,
  teamTitle,
  teamHref,
  statusHtml = "",
  rows,
  warnings,
  actionsHtml,
}) {
  return `
    <${tag} class="${className}">
      <div class="summary-title-block">
        <h3>${t("savedRoster.summaryTitle")}</h3>
        ${statusHtml}
        <a class="builder-team-link" href="${teamHref}">${escapeHtml(teamTitle)}</a>
      </div>
      <dl class="stat-list summary-stat-grid">
        ${rows.map(renderSummaryRow).join("")}
      </dl>
      <div class="summary-state-block">
        ${renderRosterState(warnings)}
        <div class="summary-actions">
          ${actionsHtml}
        </div>
      </div>
    </${tag}>
  `;
}

function renderSummaryRow({ label, value, valueAttributes = "", valueClass = "" }) {
  const attributes = [valueClass ? `class="${valueClass}"` : "", valueAttributes].filter(Boolean).join(" ");
  return `<dt>${label}</dt><dd${attributes ? ` ${attributes}` : ""}>${value}</dd>`;
}

/** Either what the roster breaks, or a note that it breaks nothing. */
function renderRosterState(warnings) {
  if (!warnings.length) return `<div class="builder-ok">${t("savedRoster.withinLimits")}</div>`;
  return `<div class="builder-warnings">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>`;
}
