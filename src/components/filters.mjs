/**
 * Filter panels for the catalogue screens (skills/traits/inducements).
 *
 * Mechanically moved out of src/app.js, with one deliberate change:
 * `wireFilters` used to call `renderSection(route)` directly, which would
 * make this module and screens/section.mjs import each other. It now takes
 * the re-render as a `rerender` callback instead — the same shape as
 * `wireRosterNotices(root, handlers)` in components/roster-notices.mjs.
 */
import { renderOption } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { uniqueSorted } from "./content-links.mjs";

export function renderFilters(route) {
  if (route === "skills") return renderSkillFilters(route);
  return "";
}

function skillFilterCategories(route) {
  const source = route === "traits" ? state.data.traits : state.data.skills;
  const tags = uniqueSorted(source.flatMap((page) => page.tags ?? []));
  const groupCategories = (state.data.skillGroups ?? []).map((group) => group.category);
  return uniqueSorted([
    ...(route === "skills" ? groupCategories : []),
    ...tags.filter((tag) => !["Active", "Passive"].includes(tag)),
  ]);
}

export function normalizeSkillFilters(route) {
  if (route !== "skills" && route !== "traits") return;
  const categories = skillFilterCategories(route);
  if (state.skillFilters.category !== "all" && !categories.includes(state.skillFilters.category)) {
    state.skillFilters.category = "all";
  }
}

function renderSkillFilters(route) {
  const categories = skillFilterCategories(route);
  const f = state.skillFilters;
  return `
    <div class="filter-panel compact-panel" data-filter-panel="skills">
      <label class="filter-field"><span>${t("filters.group")}</span><select data-filter="category">
        ${renderOption("all", t("filters.anyGroup"), f.category)}
        ${categories.map((tag) => renderOption(tag, tag, f.category)).join("")}
      </select></label>
      <button class="filter-button" type="button" data-reset-filters>${t("filters.reset")}</button>
    </div>
  `;
}

export function wireFilters(route, rerender) {
  view.querySelectorAll("[data-filter]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.filter;
      const value = event.currentTarget.value;
      if (route === "skills" || route === "traits") state.skillFilters[key] = value;
      rerender();
    });
  });
  view.querySelector("[data-reset-filters]")?.addEventListener("click", () => {
    if (route === "skills" || route === "traits") {
      state.skillFilters = { category: "all", application: "all" };
    }
    rerender();
  });
}
