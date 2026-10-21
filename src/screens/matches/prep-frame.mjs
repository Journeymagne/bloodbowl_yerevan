/**
 * The preparation's own frame (stage 09a decision 17): no shell head, tabs or SideNav on either width.
 *
 * A phone's (PreFans.html … PreReview.html): the dark head with «‹» back to the team's matches (an administrator's to
 * the game), «Before the match» and «Round 7 · A — B», the row of the steps' dots — the steps passed and the current
 * one are links, the later ones are not —, the step's body, and the footer: the line about the opponent with its dot
 * and the one button. A desk's (DeskPreReview.html, DeskPreInducements.html): the dark band «‹ Before the match ·
 * round 7» and «A — B»; the list of the steps at the left with each one's summary, the step's card in the middle, and
 * the column at the right — what the step puts there, the opponent's card, the button.
 *
 * A match begun or a round closed is said under the head (the records and the post-match to go to once begun); a
 * write refused is said there too, as an alert. An administrator picks the side the page is for (decision 22).
 *
 * The post-match draws in the same frame (stage 09b): its steps' label, its own notices, no opponent card, a chip over the button.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { postMatchUrl, teamUrl } from "../../core/routes.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { icon } from "../../ui/icons.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderSegmentedControl } from "../../ui/segmented-control.mjs";

/** «‹», back to where the coach came from: a thumb's on a phone, the prototype's 40px on a desk. */
function backMarkup(model) {
  assertLinkHref(model.back);
  return `<a class="g-prep__back" href="${escapeHtml(model.back)}" aria-label="${escapeHtml(t("prep.back"))}">${icon("back", 18)}</a>`;
}

/** A step's mark: ✓ once done, else its number. */
const markOf = (step, index) => (step.state === "done" || step.state === "open" ? "✓" : String(index + 1));

/** A phone's row of dots: a link for a step passed or current (the one on screen is `aria-current="step"`), text for a later one. */
function dotsMarkup(model) {
  const dots = model.steps.map((step, index) => {
    const inner = `<span class="g-prep__dotmark" aria-hidden="true">${markOf(step, index)}</span><span class="g-prep__dotlabel">${escapeHtml(step.label)}</span>`;
    const kind = `g-prep__dot g-prep__dot--${step.state}${step.onScreen ? " g-prep__dot--shown" : ""}`;
    if (!step.href) return `<li class="g-prep__dotitem"><span class="${kind}">${inner}</span></li>`;
    return `<li class="g-prep__dotitem"><a class="${kind}" href="${escapeHtml(step.href)}"${step.onScreen ? ' aria-current="step"' : ""}>${inner}</a></li>`;
  }).join("");
  return `<nav class="g-prep__dots" aria-label="${escapeHtml(model.stepsLabel ?? t("pre.steps"))}"><ol class="g-prep__dotlist">${dots}</ol></nav>`;
}

/** A desk's list of steps: the mark, the name and the summary; a link for a step passed or current. */
function stepsMarkup(model) {
  const rows = model.steps.map((step, index) => {
    const inner = `<span class="g-prep__stepmark" aria-hidden="true">${markOf(step, index)}</span><span class="g-prep__steptext">`
      + `<span class="g-prep__stepname">${escapeHtml(step.label)}</span>${step.summary ? `<span class="g-prep__stepsum">${escapeHtml(step.summary)}</span>` : ""}</span>`;
    const kind = `g-prep__step g-prep__step--${step.state}${step.onScreen ? " g-prep__step--shown" : ""}`;
    if (!step.href) return `<li class="g-prep__stepitem"><span class="${kind}">${inner}</span></li>`;
    return `<li class="g-prep__stepitem"><a class="${kind}" href="${escapeHtml(step.href)}"${step.onScreen ? ' aria-current="step"' : ""}>${inner}</a></li>`;
  }).join("");
  return `<aside class="g-prep__steps"><nav aria-label="${escapeHtml(model.stepsLabel ?? t("pre.steps"))}"><ol class="g-prep__steplist">${rows}</ol></nav></aside>`;
}

/** An administrator's choice of the side the page is for (decision 22): both teams, the one shown checked. */
function sideSwitch(model) {
  if (!model.isAdmin) return "";
  return `<div class="g-prep__side">${renderSegmentedControl({ label: t("prep.side"), selected: model.sideName, data: { segGroup: "prep-side" },
    items: [{ value: "home", label: model.sides.home }, { value: "away", label: model.sides.away }] })}</div>`;
}

/** What is said under the head: a match begun (with the way to its records and post-match), a round closed, a write refused; then the screen's own. */
function noticesMarkup(model, extraHtml = "") {
  const notes = [];
  if (model.readonlyWhy === "started") {
    const links = renderButton({ label: t("shell.match.records"), href: teamUrl(model.teamId, "roster") })
      + renderButton({ label: t("shell.match.postMatch"), href: postMatchUrl(model.gameId) });
    notes.push(renderCallout({ title: t("prep.started"), actionHtml: `<span class="g-prep__links">${links}</span>` }));
  }
  if (model.readonlyWhy === "closed") notes.push(renderCallout({ tone: "warn", title: t("prep.closed") }));
  if (model.error) notes.push(`<div class="g-prep__alert" role="alert">${renderCallout({ tone: "danger", title: model.error })}</div>`);
  if (extraHtml) notes.push(extraHtml);
  return notes.length ? `<div class="g-prep__notices">${notes.join("")}</div>` : "";
}

/**
 * The footer's button: a link on to the next step, a write (`data-prep-action`), or the same closed with why under it.
 * Both forms carry one key (`data-key="prep-cta"`), and the quiet button its own, so a draw that turns the one into the
 * other gives it the focus the old one had (core/dom.mjs `patch`).
 */
export function prepCtaMarkup(footer) {
  if (footer.kind === "none") return "";
  let button;
  if (footer.kind === "next" && !footer.disabled) {
    assertLinkHref(footer.href);
    button = `<a class="g-prep__cta" data-key="prep-cta" href="${escapeHtml(footer.href)}">${escapeHtml(footer.label)}</a>`;
  } else {
    const action = footer.action ? ` data-prep-action="${escapeHtml(footer.action)}"` : "";
    button = `<button type="button" class="g-prep__cta" data-key="prep-cta"${action}${footer.disabled ? " disabled" : ""}>${escapeHtml(footer.label)}</button>`;
  }
  const quiet = footer.quiet
    ? `<button type="button" class="g-prep__quiet" data-key="prep-quiet" data-prep-action="${escapeHtml(footer.quiet.action)}">${escapeHtml(footer.quiet.label)}</button>` : "";
  const hint = footer.hint ? `<span class="g-prep__hint">${escapeHtml(footer.hint)}</span>` : "";
  return `${button}${hint}${quiet}`;
}

/** The line about the opponent, its dot in the accent once he has done his part, in the warning's colour until then. */
function opponentLine(opponent) {
  if (!opponent.text) return "";
  return `<span class="g-prep__opp"><span class="g-prep__oppdot g-prep__oppdot--${opponent.done ? "done" : "wait"}" aria-hidden="true"></span><span>${escapeHtml(opponent.text)}</span></span>`;
}

/** A row of a desk's opponent card: its label at the left, its value at the right, 44px. */
const cardRow = (label, value, tone = "") => `<div class="g-prep__row"><span class="g-prep__rowk">${escapeHtml(label)}</span>`
  + `<span class="g-prep__rowv${tone ? ` g-prep__rowv--${tone}` : ""}">${escapeHtml(value)}</span></div>`;

/**
 * A desk's card of the opponent: his name, his CTV, his Fan Factor once rolled, and where he stands — or the rows the
 * step gives (the inducements': who bought first, whether his choice is in; DeskPreInducements.html).
 */
function opponentCard(model) {
  const { other, opponent } = model;
  const rows = opponent.rows
    ? opponent.rows.map(([label, value, tone]) => cardRow(label, value, tone)).join("")
    : cardRow(t("matches.ctv"), formatMoney(other.ctv))
      + (other.fanFactor ? cardRow(t("prep.fans.factor"), String(other.fanFactor)) : "")
      + (opponent.text ? cardRow(t("prep.opponentState"), opponent.text, opponent.done ? "done" : "") : "");
  return `<div class="g-prep__panel g-prep__panel--rows"><span class="g-prep__label">${escapeHtml(t("prep.opponentCard"))}</span>`
    + `<b class="g-prep__team">${escapeHtml(other.name)}</b>${rows}</div>`;
}

/**
 * The frame around a step.
 * @param {ReturnType<typeof import("./prep-model.mjs").prepModel>} model
 * @param {{phone: boolean, contentHtml: string, asideHtml?: string, cardTitle?: string, footHtml?: string, opponentHtml?: string,
 *   actionLeadHtml?: string, noticesHtml?: string}} props `contentHtml`
 *   and `asideHtml` are the step's markup (prep-steps.mjs); a desk's card is titled `cardTitle` (the step's name by
 *   default); `footHtml` stands for the footer's button where the step draws its own (a desk's budget card). The
 *   post-match's (stage 09b): `opponentHtml` stands for a desk's opponent card ("" for none), `actionLeadHtml` goes
 *   before a desk's button in its panel (a chip of the opponent's line), `noticesHtml` after what is said under the head.
 */
export function prepFrameMarkup(model, { phone, contentHtml, asideHtml = "", cardTitle = "", footHtml = null, opponentHtml = null, actionLeadHtml = "", noticesHtml = "" }) {
  const cta = footHtml ?? prepCtaMarkup(model.footer);
  if (phone) {
    const head = `<header class="g-prep__head"><div class="g-prep__bar">${backMarkup(model)}<span class="g-prep__titles">`
      + `<h1 class="g-prep__title" tabindex="-1">${escapeHtml(model.title)}</h1><span class="g-prep__sub">${escapeHtml(model.sub)}</span></span></div>${dotsMarkup(model)}</header>`;
    const foot = cta || model.opponent.text ? `<div class="g-prep__foot">${opponentLine(model.opponent)}${cta}</div>` : "";
    return `<div class="g-prep g-prep--phone">${head}${sideSwitch(model)}${noticesMarkup(model, noticesHtml)}<div class="g-prep__body">${contentHtml}</div>${foot}</div>`;
  }
  const band = `<header class="g-prep__band">${backMarkup(model)}<span class="g-prep__titles"><h1 class="g-prep__title" tabindex="-1">${escapeHtml(model.deskTitle)}</h1>`
    + `<span class="g-prep__sub">${escapeHtml(model.deskSub)}</span></span></header>`;
  const title = cardTitle || model.steps[model.stepIndex].label;
  const card = `<section class="g-prep__card" aria-labelledby="prep-card-title"><h2 class="g-prep__cardtitle" id="prep-card-title">${escapeHtml(title)}</h2>${contentHtml}</section>`;
  const action = cta || actionLeadHtml ? `<div class="g-prep__panel g-prep__panel--action">${actionLeadHtml}${cta}</div>` : "";
  const column = `<div class="g-prep__column">${asideHtml}${opponentHtml ?? opponentCard(model)}${action}</div>`;
  return `<div class="g-prep g-prep--desk">${band}${sideSwitch(model)}${noticesMarkup(model, noticesHtml)}<div class="g-prep__main">${stepsMarkup(model)}${card}${column}</div></div>`;
}
