/**
 * Bootstrap: load translations and content, restore the session, attach the
 * listeners that belong to the page frame rather than to any one screen, and
 * start the router.
 *
 * Everything else now lives in a module — screens under src/screens/, the
 * pieces they share under src/components/, and the route table itself in
 * src/core/router.mjs.
 */
import { initTheme } from "./core/theme.mjs";
import {
  applyStaticI18n,
  getLocale,
  initLocale,
  isSupportedLocale,
  loadTranslations,
  onLocaleChange,
  setLocale,
  storedLocale,
  t,
} from "./core/i18n.mjs";
import { loadReferenceData } from "./data/reference.mjs";
import { setOnUnauthorized } from "./core/api-client.mjs";
import { renderRoute } from "./core/router.mjs";
import { state } from "./core/state.mjs";
import { view } from "./core/view.mjs";
import { updateAuthButton } from "./components/auth-button.mjs";
import {
  closeAuthModal,
  loadAuthSession,
  setAuthMode,
  wireAuthModal,
} from "./components/auth-modal.mjs";
import { rosterStore } from "./screens/saved-roster.mjs";

const searchInput = document.querySelector("#global-search");
const generatedAt = document.querySelector("#generated-at");
const langToggle = document.querySelector("#lang-toggle");
const navToggle = document.querySelector("#nav-toggle");
const navOverlay = document.querySelector("#nav-overlay");
const navList = document.querySelector(".nav-list");

// Cache-busting token: index.html loads this module as `src/app.js?v=<version>`
// and the build stamps that value, so data and i18n fetches reuse it instead of
// carrying a second copy that drifts (it used to say gata-93 while index.html
// asked for gata-97).
const assetVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const referenceDataOptions = { version: assetVersion, inlineData: globalThis.__REFERENCE_DATA__ };

/** The bits of the frame that carry locale-dependent text. */
function applyLocaleChrome() {
  applyStaticI18n();
  updateAuthButton();
  setAuthMode(state.auth.mode);
  if (langToggle) {
    langToggle.textContent = getLocale() === "en" ? "RU" : "EN";
    langToggle.title = t("lang.toggleTitle");
  }
  if (generatedAt && state.data) {
    const dateLocale = getLocale() === "ru" ? "ru-RU" : "en-GB";
    generatedAt.textContent = `${t("footer.updated")} ${new Date(state.data.generatedAt).toLocaleDateString(dateLocale)}`;
  }
}

/**
 * Switch language without reloading: fetch that locale's content, then
 * re-render the current route. If the content cannot be loaded the locale goes
 * back to what it was, so the interface never disagrees with the data.
 */
async function switchLocale(nextLocale) {
  if (!isSupportedLocale(nextLocale) || nextLocale === getLocale()) return;
  const previous = getLocale();
  try {
    state.data = await loadReferenceData(nextLocale, referenceDataOptions);
  } catch (error) {
    console.error(error);
    return;
  }
  setLocale(nextLocale);
  state.locale = nextLocale;
  if (previous !== nextLocale) renderRoute();
}

function setNavOpen(isOpen) {
  document.body.classList.toggle("nav-open", isOpen);
  navToggle?.setAttribute("aria-expanded", String(isOpen));
  navToggle?.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

function handleHistoryBack(event) {
  const trigger = event.target instanceof Element ? event.target.closest("[data-history-back]") : null;
  if (!trigger) return;
  event.preventDefault();
  const fallback = trigger.dataset.historyFallback || "#/";
  if (window.history.length > 1) {
    window.history.back();
  } else {
    location.hash = fallback;
  }
}

function wireFrame() {
  searchInput?.addEventListener("input", (event) => {
    state.query = event.currentTarget.value;
    renderRoute();
  });
  view.addEventListener("click", handleHistoryBack);
  navToggle?.addEventListener("click", () => {
    setNavOpen(!document.body.classList.contains("nav-open"));
  });
  navOverlay?.addEventListener("click", () => setNavOpen(false));
  navList?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setNavOpen(false);
    }
  });
  langToggle?.addEventListener("click", () => {
    switchLocale(state.locale === "en" ? "ru" : "en");
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setNavOpen(false);
      closeAuthModal();
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setNavOpen(false);
    }
  });
  window.addEventListener("beforeunload", (event) => {
    // Autosave debounces, so closing the tab a moment after the last keystroke
    // used to drop it without a word.
    if (!rosterStore.hasPendingChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("hashchange", renderRoute);
}

async function init() {
  setOnUnauthorized(updateAuthButton);
  // applyStaticI18n cannot reach the toggle label or the footer date: both are written imperatively.
  onLocaleChange(applyLocaleChrome);
  initTheme();
  state.locale = initLocale(storedLocale());
  await loadTranslations(assetVersion);
  state.data = await loadReferenceData(state.locale, referenceDataOptions);
  await loadAuthSession();
  applyLocaleChrome();
  wireFrame();
  wireAuthModal();
  renderRoute();
}

init().catch((error) => {
  console.error(error);
  view.innerHTML = `<div class="empty-state">${t("app.dataLoadError")}</div>`;
});
