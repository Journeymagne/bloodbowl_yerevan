// Set the saved palette before styles paint. The full palette data is in palettes.mjs.
(() => {
  try {
    const saved = JSON.parse(localStorage.getItem("gata-tabletop-appearance-v1") || "{}");
    const mode = ["light", "dark", "system"].includes(saved.mode) ? saved.mode : "light";
    const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    const lightId = ["grass", "parchment", "ice", "imperial"].includes(saved.light) ? saved.light : "grass";
    const darkId = ["night", "dungeon", "embers", "abyss"].includes(saved.dark) ? saved.dark : "night";
    document.documentElement.dataset.tablePalette = dark ? darkId : lightId;
    document.documentElement.dataset.tableMode = dark ? "dark" : "light";
  } catch { /* The stylesheet provides the default light palette. */ }
})();
