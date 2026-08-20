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
  if (route === "inducements") return renderInducementFilters();
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

function renderInducementFilters() {
  const tags = uniqueSorted(state.data.inducements.flatMap((page) => page.tags ?? []));
  const f = state.inducementFilters;
  return `
    <div class="filter-panel compact-panel" data-filter-panel="inducements">
      <label class="filter-field"><span>${t("filters.inducementTag")}</span><select data-filter="tag">
        ${renderOption("all", t("filters.anyTag"), f.tag)}
        ${tags.map((tag) => renderOption(tag, tag, f.tag)).join("")}
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
      if (route === "inducements") state.inducementFilters[key] = value;
      rerender();
    });
  });
  view.querySelector("[data-reset-filters]")?.addEventListener("click", () => {
    if (route === "skills" || route === "traits") {
      state.skillFilters = { category: "all", application: "all" };
    }
    if (route === "inducements") state.inducementFilters = { tag: "all" };
    rerender();
  });
}
