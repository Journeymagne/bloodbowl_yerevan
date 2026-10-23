const paths = {
  move: '<path d="M5 19 19 5M7 5h12v12"/>',
  block: '<path d="m5 15 4-4 4 4-4 4zm4-4 5-5 4 4-5 5M14 6l1-3 6 6-3 1"/>',
  blitz: '<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
  pass: '<path d="M4 18c0-8 6-13 15-12m-5-4 6 4-5 5"/>',
  handoff: '<path d="M3 8h16m-4-4 4 4-4 4M21 16H5m4-4-4 4 4 4"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  save: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  undo: '<path d="m9 4-6 6 6 6M3 10h10a7 7 0 0 1 7 7v3"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/>',
  zones: '<path d="M4 4h16v16H4zM4 9l5-5M4 15 15 4M7 20 20 7m-7 13 7-7"/>',
  theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16" fill="none"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
};

export function tableIcon(name) {
  return `<svg class="table-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}

export function initTableIcons() {
  document.querySelectorAll("[data-table-icon]").forEach(element => {
    element.innerHTML = tableIcon(element.dataset.tableIcon);
  });
}
