// A PNG reader for the screenshots this repository takes, and a pixel by pixel
// comparison of two of them, for `npm run screens:diff`.
//
// Chrome's screenshots are 8-bit RGB or RGBA and not interlaced, and that is
// all this reads, on node:zlib alone: a dev tool is no reason for a dependency.
// Anything else is refused with its reason rather than read as best it can. A
// comparison that misread both pictures the same way would call them equal,
// and "equal" is the one answer it exists to give honestly.
import zlib from "node:zlib";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
// Channels per pixel of the color types read: 2 is RGB, 6 is RGBA.
const CHANNELS = new Map([[2, 3], [6, 4]]);
const LAST_FILTER = 4;

function refuse(reason) {
  return new Error(`screens:diff: unsupported PNG (${reason})`);
}

/** The chunks up to IEND, each a type and a view of its data. CRCs are not checked; zlib finds a damaged IDAT. */
function readChunks(bytes) {
  if (bytes.length < SIGNATURE.length || SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw refuse("no PNG signature");
  }
  const chunks = [];
  let offset = SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    if (offset + 12 + length > bytes.length) throw refuse(`cut short in ${type}`);
    chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) });
    if (type === "IEND") return chunks;
    offset += 12 + length;
  }
  throw refuse("cut short before IEND");
}

/** Width, height and channels from IHDR, or the reason this picture is not one read here. */
function readHeader(chunk) {
  if (chunk?.type !== "IHDR" || chunk.data.length !== 13) throw refuse("no IHDR first");
  const { data } = chunk;
  const width = data.readUInt32BE(0);
  const height = data.readUInt32BE(4);
  const [bitDepth, colorType, compression, filtering, interlace] = data.subarray(8);
  if (interlace !== 0) throw refuse("interlaced");
  if (bitDepth !== 8) throw refuse(`${bitDepth}-bit; only 8-bit is read`);
  if (!CHANNELS.has(colorType)) throw refuse(`color type ${colorType}; only 2 (RGB) and 6 (RGBA) are read`);
  if (compression !== 0 || filtering !== 0) throw refuse(`compression ${compression}, filter method ${filtering}`);
  if (!width || !height) throw refuse(`${width}×${height}`);
  return { width, height, channels: CHANNELS.get(colorType) };
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/**
 * Undo one row's filter in place: `line` gets the row's bytes, from `raw` (the
 * row as stored, after its filter byte) and `prior` (the row above, already
 * undone; zeros above the first). A Uint8Array keeps every sum modulo 256.
 */
function unfilterRow(type, raw, line, prior, bpp) {
  if (type === 0) {
    line.set(raw);
    return;
  }
  for (let index = 0; index < raw.length; index += 1) {
    const left = index >= bpp ? line[index - bpp] : 0;
    const up = prior[index];
    if (type === 1) line[index] = raw[index] + left;
    else if (type === 2) line[index] = raw[index] + up;
    else if (type === 3) line[index] = raw[index] + ((left + up) >> 1);
    else line[index] = raw[index] + paeth(left, up, index >= bpp ? prior[index - bpp] : 0);
  }
}

function unfilter(data, { width, height, channels }) {
  const stride = width * channels;
  const expected = height * (stride + 1);
  if (data.length !== expected) throw refuse(`image data is ${data.length} bytes, ${expected} expected`);
  const pixels = new Uint8Array(height * stride);
  let prior = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const type = data[start];
    if (type > LAST_FILTER) throw refuse(`row ${y} has filter type ${type}`);
    const line = pixels.subarray(y * stride, (y + 1) * stride);
    unfilterRow(type, data.subarray(start + 1, start + 1 + stride), line, prior, channels);
    prior = line;
  }
  return pixels;
}

function toRgba(pixels, channels) {
  if (channels === 4) return pixels;
  const rgba = new Uint8Array((pixels.length / 3) * 4);
  for (let from = 0, to = 0; from < pixels.length; from += 3, to += 4) {
    rgba[to] = pixels[from];
    rgba[to + 1] = pixels[from + 1];
    rgba[to + 2] = pixels[from + 2];
    rgba[to + 3] = 255;
  }
  return rgba;
}

/**
 * A PNG's pixels: `{ width, height, rgba }`, four bytes a pixel, row by row,
 * RGB read as opaque. Throws `screens:diff: unsupported PNG (…)` for any PNG
 * this does not read (not 8-bit, not RGB or RGBA, interlaced, damaged).
 */
export function decodePng(png) {
  const bytes = Buffer.isBuffer(png) ? png : Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  const chunks = readChunks(bytes);
  const header = readHeader(chunks[0]);
  const idat = chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data);
  if (!idat.length) throw refuse("no image data");
  let data;
  try {
    data = zlib.inflateSync(Buffer.concat(idat));
  } catch (error) {
    throw refuse(`image data does not inflate: ${error.message}`);
  }
  const { width, height, channels } = header;
  return { width, height, rgba: toRgba(unfilter(data, header), channels) };
}

const imageOf = (png) => (png instanceof Uint8Array ? decodePng(png) : png);

function changedPixels(first, second) {
  const { width, height } = first;
  const [one, two] = [first.rgba, second.rgba];
  let changed = 0;
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      if (one[at] === two[at] && one[at + 1] === two[at + 1] && one[at + 2] === two[at + 2] && one[at + 3] === two[at + 3]) continue;
      changed += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  const box = changed ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } : null;
  return { changed, box };
}

/**
 * Two pictures, pixel by pixel, exactly: a pixel whose any channel differs by
 * one counts. Each is PNG bytes or what decodePng made of them.
 *
 * `size` is false when the two are not the same size; then every pixel of the
 * larger counts as changed and there is no box. Otherwise `changed` pixels
 * differ, inside `box` ({ x, y, width, height }, null when none do).
 */
export function comparePngs(first, second) {
  const [one, two] = [imageOf(first), imageOf(second)];
  if (one.width !== two.width || one.height !== two.height) {
    return { same: false, size: false, changed: Math.max(one.width * one.height, two.width * two.height), box: null };
  }
  // Nearly every pair a stage compares is equal; a byte compare says so at once.
  if (Buffer.from(one.rgba.buffer, one.rgba.byteOffset, one.rgba.byteLength).equals(two.rgba)) {
    return { same: true, size: true, changed: 0, box: null };
  }
  const { changed, box } = changedPixels(one, two);
  return { same: changed === 0, size: true, changed, box };
}
