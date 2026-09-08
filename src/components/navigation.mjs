/** Responsive drawer: visible links, focus containment, escape and return focus. */
import { t } from "../core/i18n.mjs";

export function wireNavigation() {
  const sidebar = document.querySelector("#site-sidebar");
  const toggle = document.querySelector("#nav-toggle");
  const overlay = document.querySelector("#nav-overlay");
  const closeButton = document.querySelector("[data-nav-close]");
  const main = document.querySelector(".main");
  const wide = window.matchMedia("(min-width: 1101px)");
  let opened = false;
  const focusable = () => [...sidebar.querySelectorAll("a, button, select")].filter(el => el.getClientRects().length && !el.disabled);
  function setOpen(open, restore = false) {
    opened = open && !wide.matches;
    document.body.classList.toggle("nav-open", opened);
    toggle.setAttribute("aria-expanded", String(opened));
    toggle.setAttribute("aria-label", t(opened ? "nav.closeMenu" : "nav.openMenu"));
    sidebar.inert = !wide.matches && !opened;
    main.inert = opened;
    if (opened) closeButton.focus();
    else if (restore) toggle.focus();
  }
  toggle.addEventListener("click", () => setOpen(!opened, opened));
  overlay.addEventListener("click", () => setOpen(false, true));
  closeButton.addEventListener("click", () => setOpen(false, true));
  sidebar.addEventListener("click", event => {
    if (event.target.closest("a")) setOpen(false, opened);
  });
  window.addEventListener("keydown", event => {
    if (!opened) return;
    if (event.key === "Escape") setOpen(false, true);
    if (event.key !== "Tab") return;
    const items = focusable();
    if (!sidebar.contains(document.activeElement)) {
      event.preventDefault(); (event.shiftKey ? items.at(-1) : items[0])?.focus();
    } else if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault(); items.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
      event.preventDefault(); items[0]?.focus();
    }
  });
  wide.addEventListener("change", () => setOpen(false));
  setOpen(false);
}
