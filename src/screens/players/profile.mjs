/**
 * A coach's public profile: their account card and saved teams, visible
 * to any signed-in user.
 *
 * Mechanically moved out of src/app.js. An admin viewing this screen gets
 * the same edit panels as the administration screen, so those come from
 * screens/administration/user.mjs rather than being duplicated here.
 */
import { errorText } from "../../core/api.mjs";
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import {
  renderUserProfilePage,
  wireUserProfile,
} from "../administration/user.mjs";

export async function renderPlayerProfile(userId) {
  // "players" matches no nav item, so nothing lights up — which is what
  // routeSection() in core/routes.mjs already says these routes are. The two
  // used to disagree, and this screen highlighted "Season".
  setActiveNav("players");
  setViewSection("players");
  view.innerHTML = `
    ${renderHeader(t("admin.playerProfileHeading"), t("admin.savedTeamsAndCoachSubtitle"), "", { back: true, backFallback: "#/season" })}
    <div class="loading">${t("admin.loadingPlayer")}</div>
  `;

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("admin.playerProfileHeading"), t("admin.savedTeamsAndCoachSubtitle"))}
      <div class="empty-state">${t("admin.loginToViewProfiles")}</div>
    `;
    return;
  }

  try {
    const payload = await apiRequest(`/api/players/${encodeURIComponent(userId)}`);
    view.innerHTML = renderUserProfilePage(payload, {
      subtitle: t("admin.savedTeamsAndCoachSubtitle"),
      backFallback: "#/season",
    });
    wireUserProfile(payload.user, () => renderPlayerProfile(userId));
  } catch (error) {
    view.innerHTML = `
      ${renderHeader(t("admin.playerProfileHeading"), t("admin.savedTeamsAndCoachSubtitle"), "", { back: true, backFallback: "#/season" })}
      <div class="empty-state">${escapeHtml(errorText(error))}</div>
    `;
  }
}
