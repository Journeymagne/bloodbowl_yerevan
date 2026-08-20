/**
 * Turning a picked logo file into a small data URL.
 *
 * Mechanically moved out of src/app.js. Used by both the builder and the
 * saved-roster editor's logo picker, so — same reasoning as core/state.mjs —
 * it has to live somewhere both screens/builder.mjs and screens/saved-roster.mjs
 * can import it from.
 */

export const logoUploadMaxBytes = 2 * 1024 * 1024;
const logoOptimizeMaxDimension = 512;
const logoOptimizeQuality = 0.82;
const logoOptimizeSkipLength = 160_000;
const logoOptimizationCache = new Map();

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", reject, { once: true });
    image.src = dataUrl;
  });
}

function canvasToDataUrl(canvas, mimeType, quality) {
  try {
    return canvas.toDataURL(mimeType, quality);
  } catch (_error) {
    return "";
  }
}

export async function optimizeLogoDataUrl(dataUrl) {
  const source = String(dataUrl || "");
  if (!source.startsWith("data:image/")) return source;
  if (source.startsWith("data:image/webp") && source.length <= logoOptimizeSkipLength) return source;
  if (logoOptimizationCache.has(source)) return logoOptimizationCache.get(source);

  let optimized = source;
  try {
    const image = await loadImageFromDataUrl(source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0) {
      const scale = Math.min(1, logoOptimizeMaxDimension / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: true });
      context?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const webp = canvasToDataUrl(canvas, "image/webp", logoOptimizeQuality);
      if (webp.startsWith("data:image/webp") && webp.length < source.length) {
        optimized = webp;
      }
    }
  } catch (_error) {
    optimized = source;
  }

  logoOptimizationCache.set(source, optimized);
  return optimized;
}

export async function fileToOptimizedLogoDataUrl(file) {
  const source = await fileToDataUrl(file);
  return optimizeLogoDataUrl(source);
}
