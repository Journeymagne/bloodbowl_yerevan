/** The chosen item of a reference page: its card in the panel on a desk, in a sheet over the page on a phone. */
import { escapeHtml } from "../../core/dom.mjs";
import { state } from "../../core/state.mjs";
import { activeTeam, onActiveTeamChange } from "../../data/active-team.mjs";
import { onMyTeamsChange } from "../../data/teams.mjs";
import { patchWithModal, renderSheet, wireSheets } from "../../ui/sheet.mjs";
import { inducementCaption, inducementDetailMarkup, skillCaption, skillDetailMarkup } from "./skill.mjs";

const DETAIL_SHEET = "ref-detail";

const PHONE = "(max-width: 900px)";

const isPhone = () => Boolean(globalThis.matchMedia?.(PHONE)?.matches);

function onPhoneChange(listener) {
  const media = globalThis.matchMedia?.(PHONE);
  if (typeof media?.addEventListener !== "function") return () => {};
  media.addEventListener("change", listener);
  return () => media.removeEventListener?.("change", listener);
}

function cardMarkup(page, head, level = 1) {
  if (page.kind === "inducement") return inducementDetailMarkup({ page, head, level });
  const team = activeTeam();
  const teamPage = team ? (state.data.teams ?? []).find((item) => item.slug === team.baseTeamSlug) ?? null : null;
  return skillDetailMarkup({ data: state.data, page, team, teamPage, head, level });
}

function panelMarkup(page, pick, level) {
  return page ? cardMarkup(page, true, level) : `<p class="g-ref-pick">${escapeHtml(pick)}</p>`;
}

function sheetMarkup(page) {
  if (!page) return "";
  return renderSheet({
    id: DETAIL_SHEET,
    title: page.title,
    sub: page.kind === "inducement" ? inducementCaption() : skillCaption(state.data, page),
    bodyHtml: cardMarkup(page, false),
  });
}

const screenIn = (root) => root.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null;

// Closing is Back only when the sheet was opened from the page under it; otherwise Back would leave the site or
// reopen an earlier item, so the page's address replaces the item's.
let backCloses = false;

function noteSheet(root, screen) {
  if (root.querySelector(`#${DETAIL_SHEET}`)?.open) return;
  backCloses = screenIn(root) === screen && !root.querySelector(".g-skill-detail");
}

// The page draws some links twice, one per width (the Skill Table's lists and table): the hidden one cannot take the focus.
const shown = (node) => typeof node.getClientRects !== "function" || node.getClientRects().length > 0;

/**
 * @param {object} props
 * @param {string} props.screen the page's `data-screen`
 * @param {object|null} props.selected the item the address names
 * @param {string} props.pick what the panel says while nothing is chosen
 * @param {number} [props.level] the card's heading level beside a page that has its own h1
 * @param {(slug: string) => string} props.opener the selector of the links that open an item
 * @param {(panel: object|null, panelHtml: string) => string} props.markupOf the page, with `panel` (the item a desk shows) beside it
 */
export function drawDetailPage(root, { screen, selected, pick, level = 1, opener, markupOf }) {
  const sheet = selected && isPhone() ? selected : null;
  if (sheet) noteSheet(root, screen);
  const panel = sheet ? null : selected;
  const before = screenIn(root);
  const closing = sheet ? null : root.querySelector(`#${DETAIL_SHEET} .g-skill-detail`)?.getAttribute("data-page") ?? null;
  patchWithModal(root, markupOf(panel, panelMarkup(panel, pick, level)) + sheetMarkup(sheet), sheet ? `#${DETAIL_SHEET}` : "");
  if (screenIn(root) !== before) globalThis.scrollTo?.(0, 0);
  if (closing) [...root.querySelectorAll(opener(closing))].find(shown)?.focus({ preventScroll: true });
}

/** Redraws for what the card shows (the active team, the width) and handles the sheet's close; returns the release. */
export function wireDetailPage(root, { draw, pageHref }) {
  const stops = [
    onActiveTeamChange(draw),
    onMyTeamsChange(draw),
    onPhoneChange(draw),
    wireSheets(root, {
      onClose: (id) => {
        if (id !== DETAIL_SHEET) return;
        if (backCloses) globalThis.history?.back();
        else globalThis.location?.replace(pageHref());
        backCloses = false;
      },
    }),
    () => {
      const sheet = root.querySelector(`#${DETAIL_SHEET}`);
      if (sheet?.open) sheet.close();
    },
  ];
  return () => stops.forEach((stop) => stop());
}
