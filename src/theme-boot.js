/**
 * Put the reader's theme on the page before anything paints.
 *
 * A classic, blocking script in <head>, deliberately: it has to run before the
 * stylesheet does its first paint, or a coach who chose a light theme gets a
 * flash of dark on every navigation. That is also why it cannot be a module —
 * modules are deferred.
 *
 * It used to be inline in index.html, which is why the site's
 * Content-Security-Policy had to allow `script-src 'unsafe-inline'` — a policy
 * that permits any injected <script> to run, which is most of what a CSP is
 * for. Moving it here (step 17.5) is what let the policy become enforcing.
 *
 * The theme list is duplicated from src/core/theme.mjs on purpose: importing
 * it would make this a module, and a module cannot run early enough. The two
 * must agree, and src/core/theme.mjs says so where THEME_IDS is declared.
 */
(() => {
  try {
    const themes = ["dark-gata", "dark-dugout", "dark-warpstone", "light-parchment", "light-sideline", "light-altdorf"];
    const theme = localStorage.getItem("gata-league-theme");
    if (themes.includes(theme)) {
      document.documentElement.dataset.theme = theme;
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      // No choice stored: follow the system, before the stylesheet paints
      // dark. src/core/theme.mjs makes the same decision.
      document.documentElement.dataset.theme = "light-parchment";
    }
  } catch (_error) {}
})();
