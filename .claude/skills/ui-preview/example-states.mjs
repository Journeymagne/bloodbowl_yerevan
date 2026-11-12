// The states of the part 2 preview (PR «UI v2 polish (part 2 …)»), cut to the patterns worth copying. shots.mjs reads
// STATES; a mark's selectors can differ per side, since the markup did.
export const STATES = [
  // Two marks on one screen: each change boxed apart, the «Look at» naming both.
  { id: "coach-desk", hash: "#/coaches/u2/teams/rt1", width: 1440, height: 1300, marks: [
    { name: "tiles", sel: [".g-opp__card .g-kpis"] },
    { name: "roster", sel: [".g-opp__squad"] },
  ] },
  // A sheet: pressed open, the marks inside the open dialog.
  { id: "roster-sheet-desk", hash: "#/t/t1/roster", width: 1440, height: 900, click: ".g-skill--gained[data-skill=\"Dodge\"]", marks: [
    { name: "advancement", before: ["dialog[open] .g-roster__rollblock", "dialog[open] .g-roster__from"], after: ["dialog[open] .g-roster__from"] },
  ] },
  // Rows above the change grew on one side: both scrolled so the change stands at the same height.
  { id: "roster-bands", hash: "#/t/t1/roster", width: 1440, height: 700, align: { sel: "#roster-skips-heading" }, alignY: 300, marks: [
    { name: "missing band", sel: [".g-roster__section:has(#roster-skips-heading) > .g-roster__bar"] },
    { name: "above it", sel: [".g-roster__section--active tbody.g-rtable__player:last-of-type"] },
  ] },
  // Phone parts of one page, merged into one entry by example-spec.mjs.
  { id: "coach-phone-tiles", hash: "#/coaches/u2/teams/rt1", width: 390, height: 700, align: { sel: ".g-opp .g-kpis" }, alignY: 140, marks: [
    { name: "tiles", sel: [".g-opp .g-kpis"] },
  ] },
  { id: "coach-phone-missing", hash: "#/coaches/u2/teams/rt1", width: 390, height: 700,
    align: { before: ".g-opp__player:nth-last-child(2)", after: ".g-opp__squad tbody.g-rtable__player:nth-last-of-type(2)" }, alignY: 330, marks: [
    { name: "why", before: [".g-opp__player:nth-last-child(-n+2) .g-opp__pline"], after: [".g-opp__squad tbody.g-rtable__player:nth-last-of-type(-n+2) .g-rtable__sub"] },
  ] },
  // A guest's page, and Russian.
  { id: "guest-desk", hash: "#/", width: 1440, height: 1100, guest: true, marks: [{ name: "whole table", sel: [".g-guest__more"] }] },
  { id: "settings-phone-ru", hash: "#/t/t1/settings", width: 390, height: 1100, locale: "ru", marks: [
    { name: "race and league", sel: ["[data-settings-row=\"race\"]", "[data-settings-row=\"league\"]"] },
  ] },
];
