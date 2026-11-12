/** The chosen item of a reference page: its card in the panel on a desk, in a sheet over the page on a phone. */
import { escapeHtml } from "../../core/dom.mjs";
import { state } from "../../core/state.mjs";
import { activeTeam } from "../../data/active-team.mjs";
import { patchWithModal, renderSheet, wireSheets } from "../../ui/sheet.mjs";
import { inducementCaption, inducementDetailMarkup, skillCaption, skillDetailMarkup } from "./skill.mjs";

export const DETAIL_SHEET = "ref-detail";

const PHONE = "(max-width: 900px)";

export const isPhone = () => Boolean(globalThis.matchMedia?.(PHONE)?.matches);

export function onPhoneChange(listener) {
  const media = globalThis.matchMedia?.(PHONE);
  if (typeof media?.addEventListener !== "function") return () => {};
  media.addEventListener("change", listener);
  return () => media.removeEventListener?.("change", listener);
}

function cardMarkup(page, head, level = 1) {
  if (page.kind === "inducement") return inducementDetailMarkup({ page, head });
  const team = activeTeam();
  const teamPage = team ? (state.data.teams ?? []).find((item) => item.slug === team.baseTeamSlug) ?? null : null;
  return skillDetailMarkup({ data: state.data, page, team, teamPage, head, level });
}

export function detailPanelMarkup(page, pick, { level = 1 } = {}) {
  return page ? cardMarkup(page, true, level) : `<p class="g-ref-pick">${escapeHtml(pick)}</p>`;
}

export function detailSheetMarkup(page) {
  if (!page) return "";
  return renderSheet({
    id: DETAIL_SHEET,
    title: page.title,
    sub: page.kind === "inducement" ? inducementCaption() : skillCaption(state.data, page),
    bodyHtml: cardMarkup(page, false),
  });
}

const screenIn = (root) => root.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null;

export function drawWithDetail(root, markup, open, openerOf) {
  const before = screenIn(root);
  const closing = open ? null : root.querySelector(`#${DETAIL_SHEET} .g-skill-detail`)?.getAttribute("data-page") ?? null;
  patchWithModal(root, markup, open ? `#${DETAIL_SHEET}` : "");
  if (screenIn(root) !== before) globalThis.scrollTo?.(0, 0);
  if (closing) root.querySelector(openerOf(closing))?.focus({ preventScroll: true });
}

export function closeDetailSheet(root) {
  const sheet = root.querySelector(`#${DETAIL_SHEET}`);
  if (sheet?.open) sheet.close();
}

// Closing is Back only when the sheet was opened from the page under it; otherwise Back would leave the site or
// reopen an earlier item, so the page's address replaces the item's.
let backCloses = false;

export function noteSheet(root, page, here) {
  const sheet = root.querySelector(`#${DETAIL_SHEET}`);
  if (!sheet?.open) backCloses = here && !root.querySelector(".g-skill-detail");
  else if (sheet.querySelector(".g-skill-detail")?.getAttribute("data-page") !== page.slug) backCloses = false;
}

export function wireDetailSheet(root, pageHref) {
  return wireSheets(root, {
    onClose: (id) => {
      if (id !== DETAIL_SHEET) return;
      if (backCloses) globalThis.history?.back();
      else globalThis.location?.replace(pageHref());
      backCloses = false;
    },
  });
}
