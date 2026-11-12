/**
 * What a reference page opens for the item a coach chose — a skill, a trait, an inducement — and how: beside the page
 * in its panel on a desk, in a sheet over it on a phone (the owner, 2026-11-12: two screens, two ways). Either way the
 * address is the item's (`#/skills/<slug>`, or the Skill Table's `#/skill-table/<name>`), so any link to it opens it
 * and Back closes the sheet; the page under a sheet stays drawn, at its scroll.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { state } from "../../core/state.mjs";
import { activeTeam } from "../../data/active-team.mjs";
import { patchWithModal, renderSheet, wireSheets } from "../../ui/sheet.mjs";
import { inducementCaption, inducementDetailMarkup, skillCaption, skillDetailMarkup } from "./skill.mjs";

/** What the item's sheet is shown by (`#ref-detail`) and what wireSheets reports. */
export const DETAIL_SHEET = "ref-detail";

/** The width up to which an item opens in a sheet, not the panel (ref.css hides the panel there). */
const PHONE = "(max-width: 900px)";

/** Read when a page is drawn; a page with no window to ask (a test) is a desk. */
export const isPhone = () => Boolean(globalThis.matchMedia?.(PHONE)?.matches);

/**
 * `listener` each time the width crosses 900px, so that an open item moves between the panel and the sheet.
 * @returns {() => void} stops listening
 */
export function onPhoneChange(listener) {
  const media = globalThis.matchMedia?.(PHONE);
  if (typeof media?.addEventListener !== "function") return () => {};
  media.addEventListener("change", listener);
  return () => media.removeEventListener?.("change", listener);
}

/** The card of an item: a skill's and a trait's with the coach's active team, an inducement's with its text. */
function cardMarkup(page, head, level = 1) {
  if (page.kind === "inducement") return inducementDetailMarkup({ page, head });
  const team = activeTeam();
  const teamPage = team ? (state.data.teams ?? []).find((item) => item.slug === team.baseTeamSlug) ?? null : null;
  return skillDetailMarkup({ data: state.data, page, team, teamPage, head, level });
}

/**
 * A desk's panel: the chosen item's card, or what to do until one is chosen. `level` is its name's heading: 1 beside a
 * list, whose title then steps down; 2 beside an article, whose title stays the page's h1.
 */
export function detailPanelMarkup(page, pick, { level = 1 } = {}) {
  return page ? cardMarkup(page, true, level) : `<p class="g-ref-pick">${escapeHtml(pick)}</p>`;
}

/**
 * A phone's sheet of the chosen item, closed (`drawWithDetail` opens it); nothing without one. Its head is the
 * Roster's skill sheet's: the name and what it is (a phone's head has no room for the letter).
 */
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

/**
 * Draw a page that may carry an item's sheet, and open it, or keep it open, when `open`. Another screen than the one
 * there starts at the top, as `drawScreen` does; the same one (a sheet opened over it, another item, the sheet closed)
 * stays where it was read to. A sheet drawn away hands the focus to what opened it: `openerOf(slug)`, the selector of
 * the page's link to that item.
 */
export function drawWithDetail(root, markup, open, openerOf) {
  const before = screenIn(root);
  const closing = open ? null : root.querySelector(`#${DETAIL_SHEET} .g-skill-detail`)?.getAttribute("data-page") ?? null;
  patchWithModal(root, markup, open ? `#${DETAIL_SHEET}` : "");
  if (screenIn(root) !== before) globalThis.scrollTo?.(0, 0);
  if (closing) root.querySelector(openerOf(closing))?.focus({ preventScroll: true });
}

/** A screen left with the sheet open (a link in it to a team, a tab) leaves no modal behind it. */
export function closeDetailSheet(root) {
  const sheet = root.querySelector(`#${DETAIL_SHEET}`);
  if (sheet?.open) sheet.close();
}

/**
 * Whether closing the sheet can be Back: it was opened from the page under it, one step before. A sheet that came with
 * the address (a link from elsewhere, a page loaded on it) or went on to another item through a link of its own puts
 * the page's address in its place instead, so that closing never leaves the site nor reopens an item.
 */
let backCloses = false;

/**
 * Before `page`'s sheet is drawn under `root`: whether it comes from the page under it, one step before — `here` (that
 * page is the one on the screen) with no item open on it. Drawn again over the same item (a keystroke, a language
 * switch), it keeps what it knew; another item, through a link of its own, is no longer one step from the page.
 */
export function noteSheet(root, page, here) {
  const sheet = root.querySelector(`#${DETAIL_SHEET}`);
  if (!sheet?.open) backCloses = here && !root.querySelector(".g-skill-detail");
  else if (sheet.querySelector(".g-skill-detail")?.getAttribute("data-page") !== page.slug) backCloses = false;
}

/**
 * The sheet's close (its cross, the backdrop, Escape, a phone's back gesture) is going to `pageHref`, the page's own
 * address, whose draw takes the sheet away.
 * @returns {() => void} stops listening
 */
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
