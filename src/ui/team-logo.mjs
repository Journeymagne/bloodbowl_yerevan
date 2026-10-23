import { escapeHtml } from "../core/dom.mjs";

const LOGO_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;

const LOGO_URL = /^\/api\/team-logos\/[a-z0-9-]+(?:\?v=[a-z0-9%._~-]+)?$/i;
const SIZES = { sm: 24, md: 42 };
const failed = new Set();
const wired = new WeakSet();

/** Only saved raster images or the site's own logo endpoint may become image sources. */
export function teamLogoSource(team) {
  if (LOGO_DATA_URL.test(String(team?.logoData ?? ""))) return team.logoData;
  const url = String(team?.logoUrl ?? "");
  return LOGO_URL.test(url) || LOGO_DATA_URL.test(url) ? url : "";
}

/** Carry an image reference through view models, leaving logo-less models unchanged. */
export function teamLogoProps(team) {
  const logoUrl = teamLogoSource(team);
  return logoUrl ? { logoUrl } : {};
}

/** The adjacent team name labels the picture. Keep each caller's existing fallback. */
export function renderTeamLogo(team, { size = "md", fallbackHtml = "" } = {}) {
  const source = teamLogoSource(team);
  if (!source || failed.has(source)) return fallbackHtml;
  if (!SIZES[size]) throw new Error(`Unknown team logo size: ${size}`);
  return `<span class="g-team-logo g-team-logo--${size}" aria-hidden="true">`
    + `<span data-team-logo-fallback hidden>${fallbackHtml}</span>`
    + `<img data-team-logo src="${escapeHtml(source)}" alt="" width="${SIZES[size]}" height="${SIZES[size]}" decoding="async"></span>`;
}

/** Image errors do not bubble; one capture listener also covers future screen patches. */
export function wireTeamLogos(root) {
  if (!root?.addEventListener || wired.has(root)) return;
  wired.add(root);
  root.addEventListener("error", (event) => {
    const image = event.target;
    if (!image?.matches?.("img[data-team-logo]")) return;
    failed.add(image.getAttribute("src"));
    const fallback = image.parentNode.querySelector("[data-team-logo-fallback]");
    image.hidden = true;
    if (fallback?.childNodes.length) fallback.hidden = false;
    else image.parentNode.hidden = true;
  }, true);
}
