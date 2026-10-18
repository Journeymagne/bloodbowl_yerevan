/**
 * Team-level figures: a label over a value, alone or two to a row.
 *
 * The value arrives already formatted ("1 120k", "4 · 1 · 1", "+6 / +4"): what
 * a figure is worth, and whether it is good news for the coach (an inducement
 * budget, a playoff place), is the caller's, taken from src/domain.
 */
import { escapeHtml } from "../core/dom.mjs";
import { classNames } from "./markup.mjs";

/**
 * One figure.
 *
 * @param {object} props
 * @param {string} props.label what the figure is
 * @param {string|number} props.value the figure as it is written; a zero is one, and a figure that is not there is a dash the caller writes
 * @param {boolean} [props.positive] good news for the coach, on the accent tint
 * @param {boolean} [props.compact] the small form that sits in a card, such as the match card's
 */
export function renderKpiTile({ label, value, positive = false, compact = false }) {
  if (!label) throw new Error("a kpi tile needs a label: it says what the figure is");
  if (value === "" || value === null || value === undefined) throw new Error(`a kpi tile needs a value: "${label}" has none (write a dash)`);
  const className = classNames("g-kpi", positive && "g-kpi--positive", compact && "g-kpi--compact");
  return `<div class="${className}"><span class="g-kpi__k">${escapeHtml(label)}</span><span class="g-kpi__v">${escapeHtml(value)}</span></div>`;
}

/**
 * Tiles in two columns, any number of them: an odd last tile takes the whole
 * row (kpi-tile.css), so three tiles are a pair and a wide one. No tiles draw
 * nothing, not an error: a team with no figures yet has no grid.
 *
 * @param {{label: string, value: string|number, positive?: boolean}[]} tiles
 * @param {object} [options]
 * @param {boolean} [options.row] one line of tiles from 901px, instead of two columns (the overview's figures)
 */
export function renderKpiGrid(tiles, { row = false } = {}) {
  if (!Array.isArray(tiles)) throw new Error("a kpi grid needs an array of tiles");
  if (!tiles.length) return "";
  return `<div class="${classNames("g-kpis", row && "g-kpis--row")}">${tiles.map(renderKpiTile).join("")}</div>`;
}
