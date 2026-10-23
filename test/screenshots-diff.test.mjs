import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { comparePngs, decodePng } from "../scripts/screenshots/png.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(rootDir, "scripts", "screenshots-diff.mjs");
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

function paethOf(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** One row as an encoder writes it: the filter byte, then each byte less its predictor. */
function filterRow(type, row, above, bpp) {
  const out = Buffer.alloc(row.length + 1);
  out[0] = type;
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bpp ? row[index - bpp] : 0;
    const up = above[index];
    const upLeft = index >= bpp ? above[index - bpp] : 0;
    const predictor = [0, left, up, (left + up) >> 1, paethOf(left, up, upLeft)][type] ?? 0;
    out[index + 1] = (row[index] - predictor) & 0xff;
  }
  return out;
}

/**
 * A PNG made here, byte by byte, so every choice the decoder meets is a known
 * one: `pixel(x, y)` gives [r, g, b, a], `filter(y)` the filter type of row y,
 * `idatParts` how many IDAT chunks the compressed data is cut into.
 */
function makePng({ width, height, pixel, colorType = 6, bitDepth = 8, interlace = 0, filter = () => 0, idatParts = 1, extra = [] }) {
  const channels = CHANNELS[colorType];
  const bytesPerChannel = bitDepth / 8;
  const bpp = channels * bytesPerChannel;
  const stride = width * bpp;
  const rows = [];
  let above = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < width; x += 1) {
      const values = pixel(x, y).slice(0, channels);
      values.forEach((value, channel) => {
        for (let byte = 0; byte < bytesPerChannel; byte += 1) row[x * bpp + channel * bytesPerChannel + byte] = value;
      });
    }
    rows.push(filterRow(filter(y), row, above, bpp));
    above = row;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([bitDepth, colorType, 0, 0, interlace], 8);
  const deflated = zlib.deflateSync(Buffer.concat(rows));
  const part = Math.ceil(deflated.length / idatParts);
  const idats = [];
  for (let start = 0; start < deflated.length; start += part) idats.push(chunk("IDAT", deflated.subarray(start, start + part)));
  return Buffer.concat([SIGNATURE, chunk("IHDR", header), ...extra, ...idats, chunk("IEND", Buffer.alloc(0))]);
}

/** Pixels with no pattern a filter could get right by accident, the same on every call. */
function noise(x, y) {
  return [0, 1, 2, 3].map((channel) =>
    (Math.imul(x + 7, 0x9e3779b1) ^ Math.imul(y + 13, 0x85ebca6b) ^ Math.imul(channel + 3, 0xc2b2ae35)) >>> 24);
}

function expectedRgba(width, height, pixel, opaque = false) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      rgba.set([r, g, b, opaque ? 255 : a], (y * width + x) * 4);
    }
  }
  return rgba;
}

test("two equal PNGs are the same; a changed pixel is counted and boxed; a size change says so", () => {
  const picture = { width: 8, height: 6, pixel: noise };
  const first = makePng(picture);
  assert.deepEqual(comparePngs(first, makePng(picture)), { same: true, size: true, changed: 0, box: null });
  // The same pixels written another way — other filters, the data in three
  // IDAT chunks, a text chunk before it — are still the same picture.
  const rewritten = makePng({ ...picture, filter: (y) => y % 5, idatParts: 3, extra: [chunk("tEXt", Buffer.from("Software\0test"))] });
  assert.notDeepEqual(rewritten, first);
  assert.deepEqual(comparePngs(first, rewritten), { same: true, size: true, changed: 0, box: null });

  const touched = (x, y) => {
    const [r, g, b, a] = noise(x, y);
    if (x === 3 && y === 1) return [r ^ 0xff, g, b, a];
    if (x === 5 && y === 4) return [r, g, b, a ^ 1];
    return [r, g, b, a];
  };
  assert.deepEqual(comparePngs(first, makePng({ ...picture, pixel: touched })), {
    same: false, size: true, changed: 2, box: { x: 3, y: 1, width: 3, height: 4 },
  });

  const taller = makePng({ ...picture, height: 7 });
  assert.deepEqual(comparePngs(first, taller), { same: false, size: false, changed: 8 * 7, box: null });
  assert.deepEqual(comparePngs(taller, first), { same: false, size: false, changed: 8 * 7, box: null });
  // What decodePng made of a PNG compares as the PNG itself.
  assert.deepEqual(comparePngs(decodePng(first), first), { same: true, size: true, changed: 0, box: null });
});

test("every filter type decodes to the same pixels", () => {
  for (const colorType of [6, 2]) {
    const picture = { width: 9, height: 7, pixel: noise, colorType };
    const plain = decodePng(makePng(picture));
    assert.equal(plain.width, 9);
    assert.equal(plain.height, 7);
    assert.ok(plain.rgba instanceof Uint8Array);
    assert.deepEqual(plain.rgba, expectedRgba(9, 7, noise, colorType === 2));
    for (const type of [1, 2, 3, 4]) {
      assert.deepEqual(decodePng(makePng({ ...picture, filter: () => type })), plain, `filter ${type}, color type ${colorType}`);
    }
    assert.deepEqual(decodePng(makePng({ ...picture, filter: (y) => (y * 3) % 5 })), plain, `mixed filters, color type ${colorType}`);
  }
  // Paeth's ties that change its answer, in the last pixel: up against the upper
  // left (red), the left against the upper left (blue). A tie of the left with
  // up only happens when the two are equal, so either answer is the same.
  const corner = [[10, 10, 10, 10], [6, 40, 12, 50], [12, 70, 6, 90], [200, 150, 100, 255]];
  const ties = (x, y) => corner[y * 2 + x];
  assert.deepEqual(decodePng(makePng({ width: 2, height: 2, pixel: ties, filter: () => 4 })).rgba, expectedRgba(2, 2, ties));
});

test("RGB is read as opaque RGBA", () => {
  const colors = [[10, 20, 30, 0], [40, 50, 60, 7], [70, 80, 90, 128], [100, 110, 120, 255]];
  const pixel = (x, y) => colors[y * 2 + x];
  const rgb = decodePng(makePng({ width: 2, height: 2, pixel, colorType: 2 }));
  assert.deepEqual([...rgb.rgba], [10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);

  const opaque = (x, y) => [...colors[y * 2 + x].slice(0, 3), 255];
  const rgbPng = makePng({ width: 2, height: 2, pixel, colorType: 2 });
  assert.equal(comparePngs(rgbPng, makePng({ width: 2, height: 2, pixel: opaque })).same, true);
  const seeThrough = (x, y) => (x === 1 && y === 1 ? [100, 110, 120, 254] : opaque(x, y));
  assert.deepEqual(comparePngs(rgbPng, makePng({ width: 2, height: 2, pixel: seeThrough })), {
    same: false, size: true, changed: 1, box: { x: 1, y: 1, width: 1, height: 1 },
  });
});

test("an interlaced or 16-bit PNG is refused with its reason", () => {
  const picture = { width: 3, height: 3, pixel: noise };
  const refused = (png, reason) => assert.throws(() => decodePng(png), (error) => {
    assert.match(error.message, /^screens:diff: unsupported PNG \(/);
    assert.match(error.message, reason);
    return true;
  });
  refused(makePng({ ...picture, interlace: 1 }), /interlaced/);
  refused(makePng({ ...picture, bitDepth: 16 }), /16-bit/);
  refused(makePng({ ...picture, bitDepth: 16, colorType: 2 }), /16-bit/);
  refused(makePng({ ...picture, colorType: 3 }), /color type 3/);
  refused(makePng({ ...picture, colorType: 0 }), /color type 0/);
  refused(Buffer.from("GIF89a, not a PNG at all"), /no PNG signature/);
  const whole = makePng(picture);
  refused(whole.subarray(0, whole.length - 20), /cut short/);
  refused(makePng({ ...picture, filter: (y) => (y === 2 ? 5 : 0) }), /row 2 has filter type 5/);
});

function runDiff(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { cwd: rootDir }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

function scratchDirs(t) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "screens-diff-"));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const before = path.join(scratch, "before");
  const after = path.join(scratch, "after");
  fs.mkdirSync(before);
  fs.mkdirSync(after);
  return { scratch, before, after };
}

const flat = () => [200, 100, 50, 255];

test("the command pairs files by name and says what is only on one side", async (t) => {
  const { scratch, before, after } = scratchDirs(t);
  const square = makePng({ width: 4, height: 4, pixel: flat });
  for (const dir of [before, after]) {
    fs.writeFileSync(path.join(dir, "same.png"), square);
    fs.writeFileSync(path.join(dir, "errors.json"), dir === before ? "[]" : "[1]");
    fs.writeFileSync(path.join(dir, "index.html"), dir);
  }
  fs.writeFileSync(path.join(before, "pixel.png"), square);
  fs.writeFileSync(path.join(after, "pixel.png"), makePng({ width: 4, height: 4, pixel: (x, y) => (x === 2 && y === 3 ? [0, 0, 0, 255] : flat()) }));
  fs.writeFileSync(path.join(before, "size.png"), square);
  fs.writeFileSync(path.join(after, "size.png"), makePng({ width: 4, height: 5, pixel: flat }));
  fs.writeFileSync(path.join(before, "gone.png"), square);
  fs.writeFileSync(path.join(after, "new.png"), square);
  fs.writeFileSync(path.join(after, "notes.txt"), "not a shot");
  fs.mkdirSync(path.join(after, "folder.png"));

  const out = path.join(scratch, "reports", "diff.json");
  const result = await runDiff([before, after, "--out", out]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, [
    "screens:diff: 1 same, 2 changed, 2 only in one",
    `gone.png: only in ${before}`,
    `new.png: only in ${after}`,
    "pixel.png: 1 px in 2,3 1×1",
    "size.png: size 4×4 → 4×5",
    "",
  ].join("\n"));
  assert.deepEqual(JSON.parse(fs.readFileSync(out, "utf8")), {
    before,
    after,
    same: 1,
    changed: 2,
    onlyInOne: 2,
    differences: [
      { name: "gone.png", kind: "only", dir: before },
      { name: "new.png", kind: "only", dir: after },
      { name: "pixel.png", kind: "changed", changed: 1, box: { x: 2, y: 3, width: 1, height: 1 } },
      { name: "size.png", kind: "size", before: { width: 4, height: 4 }, after: { width: 4, height: 5 } },
    ],
  });

  // Nothing of the run itself is printed, so the same pictures compared twice
  // read the same — what a set shot twice is checked for noise with.
  const again = await runDiff([before, after, "--out", out]);
  assert.equal(again.stdout, result.stdout);
  const twice = await runDiff([after, after]);
  assert.equal(twice.code, 0);
  assert.equal(twice.stdout, "screens:diff: 4 same, 0 changed, 0 only in one\n");
});

test("a directory that cannot be read, a file that is no PNG it reads, or wrong arguments stop it with code 2", async (t) => {
  const { scratch, before, after } = scratchDirs(t);
  const missing = path.join(scratch, "missing");
  const unreadable = await runDiff([before, missing]);
  assert.equal(unreadable.code, 2);
  assert.equal(unreadable.stdout, "");
  assert.match(unreadable.stderr, new RegExp(`^screens:diff: cannot read ${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  for (const args of [[], [before], [before, after, missing], [before, after, "--out"], [before, after, "--fast"]]) {
    const wrong = await runDiff(args);
    assert.equal(wrong.code, 2, `arguments: ${args.join(" ")}`);
    assert.match(wrong.stderr, /usage: screenshots-diff\.mjs <before-dir> <after-dir> \[--out <file\.json>\]/);
  }

  fs.writeFileSync(path.join(before, "deep.png"), makePng({ width: 2, height: 2, pixel: flat }));
  fs.writeFileSync(path.join(after, "deep.png"), makePng({ width: 2, height: 2, pixel: flat, bitDepth: 16 }));
  const deep = await runDiff([before, after]);
  assert.equal(deep.code, 2);
  assert.match(deep.stderr, /^screens:diff: unsupported PNG \(16-bit[^)]*\) in .*deep\.png/);
});
