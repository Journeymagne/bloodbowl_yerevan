import { TABLE_PALETTES } from "./palettes.mjs";
import { tableText } from "./copy.mjs";

const preferenceKey = "gata-tabletop-appearance-v1";
const systemDark = matchMedia("(prefers-color-scheme: dark)");
let preference = { mode: "light", light: "grass", dark: "night" };
let savedOnDevice = true;

function readAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey) || "{}");
    if (["light", "dark", "system"].includes(saved.mode)) preference.mode = saved.mode;
    for (const mode of ["light", "dark"]) {
      if (TABLE_PALETTES.some(p => p.mode === mode && p.id === saved[mode])) preference[mode] = saved[mode];
    }
  } catch { savedOnDevice = false; }
}

function currentPalette() {
  const mode = preference.mode === "system" ? systemDark.matches ? "dark" : "light" : preference.mode;
  return TABLE_PALETTES.find(p => p.id === preference[mode]);
}

function paletteCard(palette) {
  const p = palette.colors;
  const selected = preference[palette.mode] === palette.id;
  const style = `--preview-header:${p.header};--preview-page:${p.page};--preview-card:${p.card};--preview-ink:${p.ink};--preview-muted:${p.muted};--preview-accent:${p.acc};--preview-tint:${p.tint};--preview-line:${p.ring}`;
  return `<button class="palette-card" type="button" data-palette="${palette.id}" aria-pressed="${selected}" style="${style}">
    <span class="palette-preview" aria-hidden="true"><span class="preview-header"><i></i><b></b></span>
    <span class="preview-content"><span class="preview-lines"><b></b><i></i><span><em></em><em></em></span></span><span class="preview-pitch"></span></span></span>
    <span class="palette-caption"><strong>${palette.name}</strong><span>${palette.description}</span></span>
    <span class="palette-check" aria-hidden="true">${selected ? "✓" : ""}</span></button>`;
}

function paintAppearance() {
  const palette = currentPalette();
  document.documentElement.dataset.tablePalette = palette.id;
  document.documentElement.dataset.tableMode = palette.mode;
  document.querySelector('meta[name="theme-color"]').content = palette.colors.header;
  document.getElementById("appearance-name").textContent = palette.name;
  document.getElementById("appearance-button").title = `${tableText("appearance")}: ${palette.name}`;
  document.querySelectorAll("[data-appearance-mode]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.appearanceMode === preference.mode));
  });
  document.getElementById("palette-groups").innerHTML = ["light", "dark"].filter(mode =>
    preference.mode === "system" || preference.mode === mode).map(mode => `<section class="palette-group">
      <h3>${tableText(mode === "light" ? "lightPalettes" : "darkPalettes")}</h3>
      <div class="palette-grid">${TABLE_PALETTES.filter(p => p.mode === mode).map(paletteCard).join("")}</div></section>`).join("");
  document.getElementById("appearance-summary").textContent = preference.mode === "system"
    ? tableText("systemAppearance", { name: palette.name })
    : tableText(savedOnDevice ? "chosenAppearance" : "sessionAppearance", { name: palette.name });
}

function saveAppearance() {
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(preference));
    savedOnDevice = true;
  } catch { savedOnDevice = false; }
  paintAppearance();
}

export function initTableAppearance() {
  readAppearance();
  paintAppearance();
  document.getElementById("appearance-button").addEventListener("click", () => {
    document.getElementById("appearance-dialog").showModal();
  });
  document.querySelectorAll("[data-appearance-mode]").forEach(button => button.addEventListener("click", () => {
    preference.mode = button.dataset.appearanceMode;
    saveAppearance();
  }));
  document.getElementById("palette-groups").addEventListener("click", event => {
    const button = event.target.closest("[data-palette]");
    const palette = button && TABLE_PALETTES.find(p => p.id === button.dataset.palette);
    if (!palette) return;
    preference[palette.mode] = palette.id;
    saveAppearance();
    document.querySelector(`[data-palette="${palette.id}"]`)?.focus({ preventScroll: true });
  });
  systemDark.addEventListener("change", () => { if (preference.mode === "system") paintAppearance(); });
}
