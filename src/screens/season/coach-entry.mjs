/** Admin registration of a new coach and team, including during an active season. */
import { escapeHtml, renderOption } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { adminTeamEditUrl } from "../../core/routes.mjs";
import { toast, toastError } from "../../components/toast.mjs";
import { makeSeasonStarterRoster, replaceSeasonData } from "./season-data.mjs";

export function renderSeasonCoachEntryPanel() {
  if (!state.auth.currentUser?.isAdmin) return "";
  const teams = state.data.teams ?? [];
  return `
    <section class="content-panel season-card">
      <h2>${t("season.addCoachWithTeamHeading")}</h2>
      <p>${t("season.addCoachWithTeamNote")}</p>
      <form class="season-coach-entry-form" data-season-create-coach>
        <label class="filter-field">
          <span>${t("auth.loginField")}</span>
          <input name="login" type="text" minlength="3" autocomplete="off" required>
        </label>
        <label class="filter-field">
          <span>${t("auth.telegramField")}</span>
          <input name="telegram" type="text" required>
        </label>
        <label class="filter-field">
          <span>${t("auth.passwordField")}</span>
          <input name="password" type="password" minlength="4" autocomplete="new-password" required>
        </label>
        <label class="filter-field">
          <span>${t("admin.rulesTeamField")}</span>
          <select name="baseTeamSlug" required>
            ${teams.map((team) => renderOption(team.slug, team.title, "")).join("")}
          </select>
        </label>
        <label class="filter-field">
          <span>${t("savedRoster.teamName")}</span>
          <input name="name" type="text" placeholder="${t("season.newRosterNamePlaceholder")}">
        </label>
        <button class="primary-button" type="submit" ${teams.length ? "" : "disabled"}>${t("season.addCoachWithTeamAction")}</button>
      </form>
      <p class="notice-box" data-season-new-team-result hidden></p>
    </section>
  `;
}

export function wireSeasonCoachEntry(rerender) {
  if (!state.auth.currentUser?.isAdmin) return;
  view.querySelector("[data-season-create-coach]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("[type='submit']");
    if (button.disabled || !form.reportValidity()) return;
    const fields = new FormData(form);
    const baseTeam = state.data.teams.find((team) => team.slug === fields.get("baseTeamSlug"));
    if (!baseTeam) return;
    const login = String(fields.get("login") ?? "").trim();
    const name = String(fields.get("name") ?? "").trim() || baseTeam.title;
    button.disabled = true;
    try {
      const payload = await apiRequest("/api/season/admin/coaches", {
        method: "POST",
        body: JSON.stringify({
          login, password: fields.get("password"), telegram: fields.get("telegram"),
          name, baseTeamSlug: baseTeam.slug, roster: makeSeasonStarterRoster(baseTeam, name),
        }),
      });
      replaceSeasonData(payload);
      state.admin.loaded = false;
      state.myTeams.loaded = false;
      const entry = payload.entries.find((item) => item.user.login === login);
      form.reset();
      await rerender();
      showCreatedTeam(entry);
      toast(t("season.coachAddedMessage"));
    } catch (error) {
      toastError(error);
    } finally {
      button.disabled = false;
    }
  });
}

function showCreatedTeam(entry) {
  const result = view.querySelector("[data-season-new-team-result]");
  if (!result || !entry) return;
  result.hidden = false;
  result.innerHTML = `${escapeHtml(t("season.finishNewTeamNote"))} <a href="${adminTeamEditUrl(entry.user.id, entry.team.id)}">${escapeHtml(entry.team.name)}</a>`;
}
