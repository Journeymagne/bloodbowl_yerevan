/**
 * The static legal/terms page.
 *
 * Mechanically moved out of src/app.js.
 */
import { t } from "../core/i18n.mjs";
import { view } from "../core/view.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";

export function renderLegal() {
  setActiveNav("legal");
  setViewSection("pages");
  view.innerHTML = `
    ${renderHeader(t("legal.title"), t("legal.subtitle"))}
    <article class="content-panel content-body">
      <p>${t("legal.paragraph1")}</p>
      <p>${t("legal.paragraph2")}</p>
      <p>${t("legal.paragraph3")}</p>
    </article>
  `;
}
