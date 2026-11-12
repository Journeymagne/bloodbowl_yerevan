// Spec entries from the boxes shots.mjs measured: each change boxed where it stands on either side, the pair cut to
// those boxes with room around them, and several cuts of one page merged into one entry. A PR's spec script imports it
// (see example-spec.mjs); stitch.ps1 then draws the merged pictures from the plan it writes.
import fs from "node:fs";
import path from "node:path";

const PAD = 6;
const ROOM = 36;
const GAP = 28;

const union = (boxes) => {
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
};
const clamp = (box, w, h) => {
  const x = Math.max(0, box.x), y = Math.max(0, box.y);
  return { x, y, width: Math.min(w, box.x + box.width) - x, height: Math.min(h, box.y + box.height) - y };
};
const round = (box) => Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value)]));

/** @param {string} dir the screens folder holding before/ and after/, each with its rects.json */
export function createShotKit(dir) {
  const rects = Object.fromEntries(["before", "after"].map((side) => [side, JSON.parse(fs.readFileSync(path.join(dir, side, "rects.json"), "utf8"))]));
  const plan = [];

  /**
   * One shot: a box per mark (both sides' places together, since a box is drawn at the same place on both), the cut
   * those boxes with ROOM around them, at least `minWidth` wide. `width`/`height` are the state's.
   */
  function shot(id, { width, height, marks, minWidth = 560, ...text }) {
    const names = marks ?? rects.after[id].map((mark) => mark.name);
    const boxes = names.map((name) => {
      const found = ["before", "after"].map((side) => rects[side][id]?.find((mark) => mark.name === name)?.box).filter(Boolean);
      if (!found.length) throw new Error(`${id}: ${name} found on neither side`);
      const box = union(found);
      return clamp({ x: box.x - PAD, y: box.y - PAD, width: box.width + 2 * PAD, height: box.height + 2 * PAD }, width, height);
    });
    let area = union(boxes);
    area = { x: area.x - ROOM, y: area.y - ROOM, width: area.width + 2 * ROOM, height: area.height + 2 * ROOM };
    if (area.width < Math.min(minWidth, width)) {
      const grow = Math.min(minWidth, width) - area.width;
      area = { ...area, x: area.x - grow / 2, width: area.width + grow };
    }
    area = clamp({ ...area, x: Math.max(0, Math.min(area.x, width - area.width)) }, width, height);
    return { file: `${id}.png`, area: round(area), boxes: boxes.map(round), phone: width <= 900, ...text };
  }

  /** Several shots of one page as one entry: their cuts stacked, GAP apart, left-aligned, each part's boxes moved with it. */
  function merge(file, parts, text) {
    let y = 0;
    const placed = parts.map((part) => {
      const at = { src: part.file, area: part.area, y };
      y += part.area.height + GAP;
      return { at, boxes: part.boxes.map((box) => ({ ...box, x: box.x - part.area.x, y: box.y - part.area.y + at.y })) };
    });
    const width = Math.max(...parts.map((part) => part.area.width));
    const height = y - GAP;
    plan.push({ file, width, height, parts: placed.map(({ at }) => at) });
    return { file, area: { x: 0, y: 0, width, height }, boxes: placed.flatMap(({ boxes }) => boxes), phone: parts[0].phone, ...text };
  }

  /** Writes what stitch.ps1 draws; nothing to draw when no entry was merged. */
  function writePlan(file) {
    fs.writeFileSync(file, JSON.stringify({ dir: path.resolve(dir), plan }, null, 2));
    return plan.length;
  }

  return { shot, merge, writePlan };
}
