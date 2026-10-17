/**
 * The mobile header: the team (or the league, for a guest) with its crest, and
 * the row of tabs under it.
 *
 * It draws the model that shell/navigation.mjs builds and decides nothing:
 * which tab is current, where each leads and what the team's line says all
 * come from it. The caller puts the result in `#app-header`, which carries the
 * `g-appbar` class and the folding (app-header.css). A page that brings its own
 * frame (sign-in) is `bare` and has no header.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { authUrl } from "../core/routes.mjs";
import { icon } from "../ui/icons.mjs";
import { assertLinkHref } from "../ui/markup.mjs";
import { renderCrest } from "./crest.mjs";

/**
 * The crest, the name with a chevron when the team can be switched, and the
 * line under it, as one link to where the teams are. The chevron says so to the
 * eye; the hidden words say so to a screen reader.
 */
function renderTeamLink({ name, sub, href, switchTeam }) {
  assertLinkHref(href);
  const chevron = switchTeam ? icon("down", 16) : "";
  const hint = switchTeam ? `<span class="g-sr-only">${escapeHtml(t("shell.switchTeam"))}</span>` : "";
  const line = sub ? `<span class="g-appbar__sub">${escapeHtml(sub)}</span>` : "";
  return `<a class="g-appbar__team" href="${escapeHtml(href)}">${renderCrest({ size: "md" })}`
    + `<span class="g-appbar__titles"><span class="g-appbar__name"><span class="g-appbar__label">${escapeHtml(name)}</span>${chevron}</span>${line}</span>${hint}</a>`;
}

function renderTab({ label, href, current }) {
  assertLinkHref(href);
  return `<a class="g-tab" href="${escapeHtml(href)}"${current ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
}

/**
 * The content of `#app-header` for a model: the team link (and, for a guest,
 * the way to sign in) over the tabs. Empty for a `bare` page.
 *
 * @param {ReturnType<typeof import("./navigation.mjs").shellModel>} model
 */
export function renderAppHeader(model) {
  if (model.mode === "bare") return "";
  const login = model.mode === "guest" ? `<a class="g-appbar__login" href="${escapeHtml(authUrl())}">${escapeHtml(t("auth.toLogin"))}</a>` : "";
  return `<div class="g-appbar__bar">${renderTeamLink(model.brand)}${login}</div>`
    + `<nav class="g-tabs" aria-label="${escapeHtml(t("shell.sections"))}">${model.tabs.map(renderTab).join("")}</nav>`;
}
