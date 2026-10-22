#!/usr/bin/env node
// Two sets of screenshots compared pixel by pixel: the PNGs of the same name in
// two directories, how many are the same, which changed (how many pixels,
// inside which box), which changed size, and which are only in one of them.
//
//   npm run screens:diff -- output/screens/rd-13/wave1 output/screens/rd-13/w2-base --out output/13/diff-w2-base.json
//
// Stage 13 takes 2.x out on the promise that not a pixel moves, and that is a
// promise nobody keeps by looking at two hundred pairs of pictures. The sets
// come from `npm run screens` (scripts/screenshots.mjs), one file per state,
// width and variant, so a file name is a state; files that are not *.png
// (errors.json, index.html) are not compared.
//
// The lines are in name order and say nothing about the run itself, so the
// same pictures compared twice print the same thing, and one states file shot
// twice and compared with itself shows what moves on its own (a caret, a toast,
// a time from the mock).
//
// Exit code 0 means the comparison was made, whatever it found: the first line
// says what. Exit code 2 means it could not be: arguments it does not take, a
// directory that cannot be read, or a file that is not a PNG this reads.
import fs from "node:fs";
import path from "node:path";

import { comparePngs, decodePng } from "./screenshots/png.mjs";

const USAGE = "usage: screenshots-diff.mjs <before-dir> <after-dir> [--out <file.json>]";

function parseArgs(argv) {
  const dirs = [];
  let out = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      out = argv[index + 1] ?? null;
      if (!out) throw new Error(`screens:diff: --out needs a file\n${USAGE}`);
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`screens:diff: unknown option ${arg}\n${USAGE}`);
    } else {
      dirs.push(arg);
    }
  }
  if (dirs.length !== 2) throw new Error(`screens:diff: two directories, the one before and the one after\n${USAGE}`);
  return { before: dirs[0], after: dirs[1], out };
}

function pngNames(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`screens:diff: cannot read ${dir}: ${error.message}`);
  }
  return new Set(entries.filter((entry) => !entry.isDirectory() && entry.name.endsWith(".png")).map((entry) => entry.name));
}

function readShot(dir, name) {
  const file = path.join(dir, name);
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (error) {
    throw new Error(`screens:diff: cannot read ${file}: ${error.message}`);
  }
  try {
    return decodePng(bytes);
  } catch (error) {
    throw new Error(`${error.message} in ${file}`);
  }
}

/** One pair of the same name: null when the two are the same picture, else what differs. */
function comparePair(before, after, name) {
  const first = readShot(before, name);
  const second = readShot(after, name);
  const { same, size, changed, box } = comparePngs(first, second);
  if (same) return null;
  if (!size) {
    const dimensions = ({ width, height }) => ({ width, height });
    return { name, kind: "size", before: dimensions(first), after: dimensions(second) };
  }
  return { name, kind: "changed", changed, box };
}

function compareDirs({ before, after }) {
  const first = pngNames(before);
  const second = pngNames(after);
  const differences = [];
  let same = 0;
  for (const name of [...new Set([...first, ...second])].sort()) {
    if (!second.has(name)) differences.push({ name, kind: "only", dir: before });
    else if (!first.has(name)) differences.push({ name, kind: "only", dir: after });
    else {
      const difference = comparePair(before, after, name);
      if (difference) differences.push(difference);
      else same += 1;
    }
  }
  const onlyInOne = differences.filter((difference) => difference.kind === "only").length;
  return { before, after, same, changed: differences.length - onlyInOne, onlyInOne, differences };
}

function describe(difference) {
  const { name, kind } = difference;
  if (kind === "only") return `${name}: only in ${difference.dir}`;
  if (kind === "size") {
    const { before, after } = difference;
    return `${name}: size ${before.width}×${before.height} → ${after.width}×${after.height}`;
  }
  const { x, y, width, height } = difference.box;
  return `${name}: ${difference.changed} px in ${x},${y} ${width}×${height}`;
}

function writeReport(file, report) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    throw new Error(`screens:diff: cannot write ${file}: ${error.message}`);
  }
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const report = compareDirs(args);
  console.log(`screens:diff: ${report.same} same, ${report.changed} changed, ${report.onlyInOne} only in one`);
  for (const difference of report.differences) console.log(describe(difference));
  if (args.out) writeReport(args.out, report);
}

try {
  run();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(error.message.startsWith("screens:diff: ") ? 2 : 1);
}
