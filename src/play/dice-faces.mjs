// Original vector drawings of the five standard block results. Push occupies
// two faces of a six-sided block die; the engine's BLOCK_FACES owns that mapping.
const burst = "M24 3l5 11 12-7-5 13 10 4-12 5 7 12-13-5-4 11-5-12-12 7 5-13L2 24l12-5-7-12 13 5z";
const skull = '<path d="M14 29c-6-3-7-9-5-15C12 4 35 4 39 15c2 6 0 11-5 14v8H14z" fill="currentColor"/><path d="M18 32v7m6-7v7m6-7v7" stroke="var(--die-paper)" stroke-width="3"/><ellipse cx="17" cy="20" rx="5" ry="5" fill="var(--die-paper)"/><ellipse cx="31" cy="20" rx="5" ry="5" fill="var(--die-paper)"/><path d="m24 25-3 5h6z" fill="var(--die-paper)"/>';
const blockShapes = {
  skull,
  both: `<path d="${burst}" fill="currentColor"/><path d="M13 15h22v22H13z" fill="var(--die-paper)"/><g transform="translate(7 8) scale(.7)">${skull}</g>`,
  push: '<path d="M5 17h19V7l20 17-20 17V31H5z" fill="currentColor"/>',
  stumble: `<path d="${burst}" fill="none" stroke="currentColor" stroke-width="2.7"/><path d="M21 13h6l-1 15h-4z" fill="currentColor"/><circle cx="24" cy="34" r="3" fill="currentColor"/>`,
  pow: `<path d="${burst}" fill="currentColor"/>`,
};
const pips = {
  1: [[24, 24]], 2: [[13, 13], [35, 35]], 3: [[13, 13], [24, 24], [35, 35]],
  4: [[13, 13], [35, 13], [13, 35], [35, 35]],
  5: [[13, 13], [35, 13], [24, 24], [13, 35], [35, 35]],
  6: [[13, 12], [35, 12], [13, 24], [35, 24], [13, 36], [35, 36]],
};

export function diceFace(kind, value) {
  let shape = blockShapes[value];
  if (kind === "d6") shape = (pips[value] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="currentColor"/>`).join("");
  if (kind === "d8") shape = `<path d="m24 2 21 22-21 22L3 24zM3 24h42M24 2l-9 22 9 22 9-22z" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"/><rect x="16" y="14" width="16" height="20" rx="5" fill="var(--die-paper)"/><text x="24" y="30" text-anchor="middle" fill="currentColor" font-size="20" font-family="Barlow" font-weight="700">${value}</text>`;
  if (kind === "number") shape = `<text x="24" y="33" text-anchor="middle" fill="currentColor" font-size="28" font-family="Barlow" font-weight="700">${value}</text>`;
  return `<svg class="die-face" viewBox="0 0 48 48" aria-hidden="true">${shape || ""}</svg>`;
}
