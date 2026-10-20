/**
 * Team-level figures: a label over a value, alone or two to a row.
 *
 * The value arrives already formatted ("1 120k", "4 · 1 · 1", "+6 / +4"): what
 * a figure is worth, and whether it is good news for the coach (an inducement
 * budget, a playoff place, a difference above zero), is the caller's, taken
 * from src/domain. A figure may have a quieter second part on its line (the
 * «/ 10» after a place, DeskOverview.html).
 */
import { escapeHtml } from "../core/dom.mjs";
import { assertLinkHref, classNames } from "./markup.mjs";

/**
 * One figure.
 *
 * @param {object} props
 * @param {string} props.label what the figure is
 * @param {string|number} props.value the figure as it is written; a zero is one, and a figure that is not there is a dash the caller writes
 * @param {string} [props.rest] a quieter second part of the figure, on its line after a space: the «/ 10» of a place, the «· 4/1/1» of the points
 * @param {boolean} [props.accent] the figure in the accent's text colour: good news said by the figure alone (the overview's difference)
 * @param {boolean} [props.positive] good news for the coach, on the accent tint
 * @param {boolean} [props.compact] the small form that sits in a card, such as the match card's
 * @param {string} [props.href] the page the figure is managed on: the whole tile is a link to it, with the same face
 */
export function renderKpiTile({ label, value, rest = "", accent = false, positive = false, compact = false, href = "" }) {
  if (!label) throw new Error("a kpi tile needs a label: it says what the figure is");
  if (value === "" || value === null || value === undefined) throw new Error(`a kpi tile needs a value: "${label}" has none (write a dash)`);
  const className = classNames("g-kpi", positive && "g-kpi--positive", accent && "g-kpi--accent", compact && "g-kpi--compact", href && "g-kpi--link");
  const second = rest ? ` <span class="g-kpi__rest">${escapeHtml(rest)}</span>` : "";
  const face = `<span class="g-kpi__k">${escapeHtml(label)}</span><span class="g-kpi__v">${escapeHtml(value)}${second}</span>`;
  if (!href) return `<div class="${className}">${face}</div>`;
  assertLinkHref(href);
  return `<a class="${className}" href="${escapeHtml(href)}">${face}</a>`;
}

/**
 * Tiles in two columns, any number of them: an odd last tile takes the whole
 * row (kpi-tile.css), so three tiles are a pair and a wide one. No tiles draw
 * nothing, not an error: a team with no figures yet has no grid.
 *
 * @param {{label: string, value: string|number, rest?: string, accent?: boolean, positive?: boolean, href?: string}[]} tiles each as `renderKpiTile` takes it; one with an `href` is a link
 * @param {object} [options]
 * @param {boolean} [options.row] from 901px, as many 180px cards to a line as the width holds, instead of two columns (the overview's figures)
 */
export function renderKpiGrid(tiles, { row = false } = {}) {
  if (!Array.isArray(tiles)) throw new Error("a kpi grid needs an array of tiles");
  if (!tiles.length) return "";
  return `<div class="${classNames("g-kpis", row && "g-kpis--row")}">${tiles.map(renderKpiTile).join("")}</div>`;
}
