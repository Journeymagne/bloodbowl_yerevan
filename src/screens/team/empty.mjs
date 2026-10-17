/**
 * The overview of a coach who has no team yet: what will be here, and the one
 * way forward — the builder. Stage 06 makes this the empty state of the team
 * overview itself; until then the router draws it on `#/`, where a coach with
 * a team is sent on to that team.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { newTeamUrl } from "../../core/routes.mjs";
import { view } from "../../core/view.mjs";
import { setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { renderButton } from "../../ui/button.mjs";

export function noTeamMarkup() {
  return `<section class="g-team-empty">
    <h1 class="g-team-empty__title">${escapeHtml(t("team.empty.title"))}</h1>
    <p class="g-team-empty__text">${escapeHtml(t("team.empty.text"))}</p>
    ${renderButton({ label: t("team.empty.create"), kind: "primary", href: newTeamUrl() })}
  </section>`;
}

export function renderNoTeam() {
  setActiveNav("home");
  setViewSection("home");
  view.innerHTML = noTeamMarkup();
}
