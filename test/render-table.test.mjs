import test from "node:test";
import assert from "node:assert/strict";

import { renderTable } from "../scripts/lib/render-table.mjs";

const plain = (cell) => cell;
const render = (header, rows, renderInline = plain) => renderTable(header, rows, renderInline).join("\n");

test("stat, dice and roll columns are narrow and centred", () => {
  const html = render(["Qty", "MA", "2d6", "D8", "Бросок", "Триггер", "Position"], [["0-4", "6", "2", "1-2", "3", "9 (6 in notes)", "Lineman"]]);
  for (const label of ["Qty", "MA", "2d6", "D8", "Бросок", "Триггер"]) {
    assert.ok(html.includes(`<th class="fit-cell center-cell">${label}</th>`), label);
  }
  assert.ok(html.includes("<th>Position</th>"));
  assert.ok(html.includes('<td class="fit-cell center-cell">6</td>'));
  assert.ok(html.includes("<td>Lineman</td>"));
});

test("the cost column is narrow and right-aligned", () => {
  const html = render(["Position", "Cost"], [["Lineman", "50,000"]]);
  assert.ok(html.includes('<th class="fit-cell number-cell">Cost</th>'));
  assert.ok(html.includes('<td class="fit-cell number-cell">50,000</td>'));
});

test("a column of whole numbers is centred but keeps its width", () => {
  const html = render(["Rank", "Random skill"], [["Experienced", "3"], ["Veteran", "4"]]);
  assert.ok(html.includes('<th class="center-cell">Random skill</th>'));
  assert.ok(html.includes('<td class="center-cell">4</td>'));
  assert.ok(html.includes("<th>Rank</th>"));
});

test("one cell that is not a whole number leaves the column alone", () => {
  const html = render(["Rank", "SPP"], [["Experienced", "3"], ["Veteran", "4+"], ["Star"]]);
  assert.ok(html.includes("<th>SPP</th>"));
  assert.ok(html.includes("<td>3</td>"));
});

test("a formatted header is matched by its text", () => {
  const html = render(["**MA**", "Name"], [["6", "Griff"]]);
  assert.ok(html.includes('<th class="fit-cell center-cell">**MA**</th>'));
});

test("a number range does not wrap, on top of the column's own class", () => {
  const html = render(["D16", "Result"], [["1-8", "Badly Hurt"]]);
  assert.ok(html.includes('<td class="nowrap-cell fit-cell center-cell">1-8</td>'));
});

test("a table of up to five columns fits the page, a wider one scrolls", () => {
  assert.ok(render(["a", "b", "c", "d", "e"], []).includes('<table class="fit-table">'));
  assert.ok(render(["a", "b", "c", "d", "e", "f"], []).includes("<table>"));
  assert.ok(render(["#", "Name"], [["1", "Block"]]).includes('<table class="numbered-table fit-table">'));
});

test("cells say how they may be linked, header cells do not", () => {
  const calls = [];
  render(["Position", "Skills", "Effect"], [["Blitzer", "Block, Dodge", "Gains Block. Until the drive ends."]], (cell, linking) => {
    calls.push([cell, linking]);
    return cell;
  });
  const linkingFor = Object.fromEntries(calls);
  assert.equal(linkingFor.Position, undefined);
  assert.deepEqual(linkingFor.Blitzer, { autoLinkKnown: false, prose: false });
  assert.deepEqual(linkingFor["Block, Dodge"], { autoLinkKnown: true, prose: false });
  assert.deepEqual(linkingFor["Gains Block. Until the drive ends."], { autoLinkKnown: true, prose: true });
});

test("a table with no rows still renders its header", () => {
  assert.deepEqual(renderTable(["Name"], [], plain), [
    '<div class="table-scroll"><table class="fit-table"><thead><tr>',
    "<th>Name</th>",
    "</tr></thead><tbody>",
    "</tbody></table></div>",
  ]);
});
