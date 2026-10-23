/**
 * The administration's frame (stage 12, decisions 7–11): what every one of its screens draws around its own content.
 *
 * - The head: the title, its line, the path under it («Administration → orc_boss → Grimtusk Raiders»), all in the
 *   band of a desk (DeskAdminUser.html, DeskAdminTeamEdit.html) or as a phone's title (AdminMobile.html); then the
 *   switch between the two sections, «Coaches | Season». The prototypes draw it as AdminMobile's two buttons; the
 *   DeskAdmin* screens have none, so a desk draws it as DeskAdminSeason's segments (decision 8): without it a desk's
 *   season would be out of reach. The segments are links and draw their own <nav>; the switch around them is a
 *   <div> (pre-flight L20).
 * - The banner a coach who is no admin gets instead (decision 10): nothing of the administration is read for one.
 * - A coach's letter in its circle (decision 11), on the header's colour: the prototypes' colours per coach have no
 *   token.
 *
 * A screen's content goes under the head in a `<div class="g-admin__main">`: the shell's `main.g-main` is the page's
 * one <main>.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { adminSeasonUrl, adminUrl } from "../../core/routes.mjs";
import { state } from "../../core/state.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderPageHead } from "../../ui/page-head.mjs";
import { renderSegmentedControl } from "../../ui/segmented-control.mjs";

/** The administration's two sections; a coach's page and a team's edit are the coaches'. */
const SECTIONS = ["coaches", "season"];

/** Whether the coach signed in is the league's administrator: the one the administration's screens are for. */
export function isAdminViewer() {
  return Boolean(state.auth.currentUser?.isAdmin);
}

/**
 * The head of an administration screen and the switch under it.
 * @param {object} props
 * @param {string} props.title the screen's `h1`
 * @param {string} [props.sub] text: the one line under the title (`renderPageHead` escapes it)
 * @param {string} [props.crumbsHtml] markup from `crumbsMarkup`: the path, under the title and its line
 * @param {"coaches"|"season"} props.section the section the screen is one of: its segment is the current one
 * @param {boolean} [props.phone] a phone's head, which stands as a title (AdminMobile.html)
 */
export function adminHeadMarkup({ title, sub = "", crumbsHtml = "", section, phone = false }) {
  if (!SECTIONS.includes(section)) throw new Error(`an administration screen is in one of its sections, not ${section}`);
  const sections = renderSegmentedControl({
    label: t("administration.sections"),
    items: [
      { value: "coaches", label: t("administration.coaches"), href: adminUrl() },
      { value: "season", label: t("administration.season"), href: adminSeasonUrl() },
    ],
    selected: section,
  });
  return `<div class="g-admin__head">${renderPageHead({ title, sub, phone })}${crumbsHtml}</div><div class="g-admin__switch">${sections}</div>`;
}

/**
 * What a coach who is no admin is shown on an administration address: the section is the admin's, and the way home.
 * Its title stands as the other screens' heads do (a phone's 24px title, a desk's band): on a phone the shell's header
 * does not name it.
 */
export function adminRefusalMarkup() {
  return `<div class="g-admin__refusal"><div class="g-admin__head">${renderPageHead({ title: t("administration.title"), phone: true })}</div>`
    + `${renderCallout({ title: t("administration.only"), sub: t("administration.onlySub"), href: "#/" })}</div>`;
}


/**
 * The path to a screen, for the head: «Administration → orc_boss → Grimtusk Raiders». A part with an `href` is a link
 * there; the arrows between the parts are not read aloud. Long names wrap.
 * @param {{label: string, href?: string}[]} parts
 */
export function crumbsMarkup(parts) {
  if (!parts?.length) throw new Error("a path has a part at least");
  const crumbs = parts.map(({ label, href = "" }) => {
    if (!href) return escapeHtml(label);
    assertLinkHref(href);
    return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  });
  // The spaces are the arrow's own: between two tags alone they would be a text node of nothing but blanks.
  return `<p class="g-admin__crumbs">${crumbs.join('<span aria-hidden="true"> → </span>')}</p>`;
}
