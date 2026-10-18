/**
 * The desktop SideNav: the team (or the league, for a guest), the places to
 * go, and at the bottom the match card, the language and the footer line.
 *
 * Like the header it draws the model that shell/navigation.mjs builds and
 * decides nothing. The caller puts the result in `#side-nav` (class
 * `g-sidenav`, side-nav.css). The match card is the caller's, drawn by its own
 * renderer and passed in as `matchHtml`. A `bare` page has no SideNav.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { authUrl } from "../core/routes.mjs";
import { renderButton } from "../ui/button.mjs";
import { icon as renderIcon } from "../ui/icons.mjs";
import { assertLinkHref } from "../ui/markup.mjs";
import { renderCrest } from "./crest.mjs";

/** The legal page has no builder in core/routes.mjs; this is the one link to it. */
const LEGAL_URL = "#/legal";

/** The languages the switch offers, in the order it draws them: the code the app takes and the letters on the button. */
const LANGUAGES = [["ru", "RU"], ["en", "EN"]];

/**
 * The language switch: a labelled pair of buttons, the one that is on pressed.
 * Choosing is the shell's (a click on `[data-locale-switch]`), not drawn here.
 * The visible word is hidden from a screen reader: the group already has it as its name.
 *
 * @param {string} locale the language the page is in
 */
export function renderLanguageSwitch(locale) {
  const label = escapeHtml(t("settings.language"));
  const buttons = LANGUAGES.map(([code, letters]) => `<button type="button" class="g-lang__item" data-locale-switch="${code}" aria-pressed="${code === locale}">${letters}</button>`).join("");
  return `<div class="g-lang" role="group" aria-label="${label}"><span class="g-lang__label" aria-hidden="true">${label}</span>${buttons}</div>`;
}

/** The day the data was built, the way the reader writes dates; nothing for a stamp that is not one. */
function dataDate(generatedAt, locale) {
  const date = new Date(generatedAt);
  return generatedAt && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-GB") : "";
}

/**
 * The one quiet line: when the data was built (once it is loaded), that the
 * league is a fan's reference, and the way to the legal page.
 *
 * @param {{generatedAt?: string, locale: string}} props `generatedAt` is the ISO stamp the build left in the data
 */
export function renderSiteFooter({ generatedAt = "", locale }) {
  const date = dataDate(generatedAt, locale);
  const updated = date ? `${escapeHtml(t("footer.updated"))} ${escapeHtml(date)} · ` : "";
  return `<p class="g-site-footer">${updated}${escapeHtml(t("footer.unofficialNote"))} <a href="${LEGAL_URL}">${escapeHtml(t("footer.legalLink"))}</a></p>`;
}

/**
 * The crest and the name with the line under it, as one link to where the teams are; a chevron and a
 * hidden hint when the team can be switched. The name is cut at three lines, so it carries itself whole as its title.
 */
function renderTeamBlock({ name, sideSub, href, switchTeam }) {
  assertLinkHref(href);
  const chevron = switchTeam ? renderIcon("down", 16) : "";
  const hint = switchTeam ? `<span class="g-sr-only">${escapeHtml(t("shell.switchTeam"))}</span>` : "";
  return `<a class="g-sidenav__team" href="${escapeHtml(href)}">${renderCrest({ size: "sm" })}`
    + `<span class="g-sidenav__titles"><span class="g-sidenav__name" title="${escapeHtml(name)}">${escapeHtml(name)}</span><span class="g-sidenav__sub">${escapeHtml(sideSub)}</span></span>${chevron}${hint}</a>`;
}

function renderLink({ label, href, icon, current }) {
  assertLinkHref(href);
  return `<a class="g-sidenav__link" href="${escapeHtml(href)}"${current ? ' aria-current="page"' : ""}>${renderIcon(icon, 18)}<span class="g-sidenav__label">${escapeHtml(label)}</span></a>`;
}

/**
 * The content of `#side-nav` for a model. Empty for a `bare` page.
 *
 * @param {ReturnType<typeof import("./navigation.mjs").shellModel>} model
 * @param {{matchHtml?: string, locale: string, generatedAt?: string}} props
 *   `matchHtml` is the match card, markup from its own renderer; `locale` is
 *   the page's language; `generatedAt` is the stamp for the footer's date
 */
export function renderSideNav(model, { matchHtml = "", locale, generatedAt = "" }) {
  if (model.mode === "bare") return "";
  const login = model.mode === "guest" ? `<div class="g-sidenav__login">${renderButton({ label: t("auth.toLogin"), href: authUrl(), block: true })}</div>` : "";
  return renderTeamBlock(model.brand)
    + `<nav class="g-sidenav__nav" aria-label="${escapeHtml(t("shell.sections"))}">${model.side.map(renderLink).join("")}</nav>`
    + `<div class="g-sidenav__bottom">${matchHtml}${login}<div class="g-sidenav__foot">${renderLanguageSwitch(locale)}${renderSiteFooter({ generatedAt, locale })}</div></div>`;
}
