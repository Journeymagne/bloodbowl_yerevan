/** Matchday's layout and UI state; roster rules and persistence stay in the editors. */
import { escapeHtml, listenerGroup } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { countToNumber } from "../../domain/roster/values.mjs";
import { rosterSizeLimits } from "../../domain/league-rules.mjs";
import { rosterTotalSpp } from "../../domain/roster/progression.mjs";
import { renderHirePanel } from "./hire-panel.mjs";
import { renderMatchdayHero, renderMatchdayScoreboard } from "../matchday.mjs";
import { iconButton } from "../icons.mjs";
import { patchWithModal } from "../dialog.mjs";

const uiByDraft = new WeakMap();
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

function uiFor(draft) {
  if (!uiByDraft.has(draft)) uiByDraft.set(draft, { details: new Map(), hireOpen: false });
  return uiByDraft.get(draft);
}

export function patchMatchdayEditor(root, markup, draft) {
  patchWithModal(root, markup, uiFor(draft).hireOpen ? "[data-matchday-hire-dialog]" : "");
}

export function matchdayDetailsOpen(draft, key, defaultOpen = false) {
  return (uiFor(draft).details.get(key) ?? defaultOpen) ? "open" : "";
}

/** Close every nested panel and remember it before the next render. */
export function collapseMatchdayDetails(root, draft) {
  const ui = uiFor(draft);
  for (const details of root.querySelectorAll("details")) {
    details.open = false;
    const key = details.dataset.matchdayDetails;
    if (key) ui.details.set(key, false);
  }
}

function addPlayerButton(className = "") {
  return `<button class="primary-button matchday-add-player ${className}" type="button" data-matchday-open-hire>${PLUS}<span>${t("roster.addPlayerButton")}</span></button>`;
}

function renderHero(team, draft, costs) {
  return renderMatchdayHero({ name: draft.teamName || team.title, eyebrow: t("roster.sevensLabel"),
    description: team.title + (draft.selectedLeague ? " · " + draft.selectedLeague : ""),
    edition: costs.totalPlayersCount, logo: draft.logoData, nameAttributes: "data-matchday-team-name" });
}


function renderScoreboard(team, draft, costs, mode) {
  const money = mode.enforcesBudget ? costs.remaining : countToNumber(draft.treasury);
  const rows = [
    { label: t("savedRoster.totalPlayers"), value: `${costs.totalPlayersCount}<small> / ${rosterSizeLimits.max}</small>` },
    { label: t("roster.totalCost"), value: `${costs.total}k` },
    ...(!mode.enforcesBudget ? [{ label: "SPP", value: rosterTotalSpp(team, draft), attribute: "data-total-spp-display" }] : []),
    { label: t(mode.enforcesBudget ? "builder.remaining" : "savedRoster.treasury"), value: `${money}k`, attribute: mode.enforcesBudget ? "" : "data-treasury-display", danger: money < 0 },
  ];
  return renderMatchdayScoreboard(rows.map(row => ({ ...row, valueHtml: row.value })));
}

export function renderMatchdayEditor({ team, draft, costs, mode, identityHtml, summaryHtml, purchasesHtml, playersHtml, readOnly = false }) {
  const money = mode.enforcesBudget ? costs.remaining : countToNumber(draft.treasury);
  return `
    ${renderHero(team, draft, costs)}
    ${renderScoreboard(team, draft, costs, mode)}
    <details class="matchday-identity" data-key="matchday-identity" data-matchday-details="identity" ${matchdayDetailsOpen(draft, "identity", !draft.players.length)}>
      <summary>${t(readOnly ? "roster.teamDetails" : "roster.teamSettings")}</summary><div class="matchday-identity-body">${identityHtml}</div>
    </details>
    <div class="matchday-workspace" data-key="matchday-workspace">
      <aside class="matchday-sidebar">${summaryHtml}${purchasesHtml}</aside>
      <section class="matchday-roster builder-selected">
        <div class="matchday-roster-heading"><div><span class="matchday-eyebrow">${t("roster.sevensLabel")}</span><h2>${t("savedRoster.rosterHeading")}<span class="matchday-heading-dot">.</span></h2></div>${readOnly ? "" : addPlayerButton("matchday-desktop-hire")}</div>
        ${playersHtml}
      </section>
    </div>
    ${readOnly ? "" : `<div class="matchday-mobile-dock"><div><strong class="${money < 0 ? "danger-text" : ""}">${money}k</strong><small>${t(mode.enforcesBudget ? "builder.remaining" : "savedRoster.treasury")}</small></div>${addPlayerButton()}</div>
    <dialog class="matchday-hire-dialog" data-key="matchday-hire-dialog" data-matchday-hire-dialog aria-labelledby="matchday-hire-title">
      <header><div><span class="matchday-eyebrow">${escapeHtml(team.title)}</span><h2 id="matchday-hire-title">${t("builder.availablePlayers")}</h2><p>${t(mode.enforcesBudget ? "builder.remaining" : "savedRoster.treasury")}: <strong>${money}k</strong></p></div>${iconButton("collapse", { title: t("common.close"), attributes: "data-matchday-close-hire" })}</header>
      ${renderHirePanel(team, draft, mode, { cardsOnly: true })}
    </dialog>`}`;
}

export function closeMatchdayHire(root, draft) {
  uiFor(draft).hireOpen = false;
  const dialog = root.querySelector("[data-matchday-hire-dialog]");
  if (dialog?.open) dialog.close();
  document.body.classList.remove("matchday-modal-open");
  [...root.querySelectorAll("[data-matchday-open-hire]")].find(button => button.offsetParent)?.focus({ preventScroll: true });
}

export function wireMatchdayEditor(root, draft) {
  const events = listenerGroup(root);
  const ui = uiFor(draft);
  const dialog = root.querySelector("[data-matchday-hire-dialog]");
  events.on("click", "[data-matchday-open-hire]", () => {
    ui.hireOpen = true;
    dialog.showModal();
    document.body.classList.add("matchday-modal-open");
  });
  events.on("click", "[data-matchday-close-hire]", () => closeMatchdayHire(root, draft));
  const cancel = () => { ui.hireOpen = false; document.body.classList.remove("matchday-modal-open"); };
  dialog.addEventListener("cancel", cancel);
  events.own(() => dialog.removeEventListener("cancel", cancel));
  for (const details of root.querySelectorAll("details")) {
    const remember = () => {
      const key = details.dataset.matchdayDetails;
      if (key) ui.details.set(key, details.open);
      if (!details.open) collapseMatchdayDetails(details, draft);
    };
    details.addEventListener("toggle", remember);
    events.own(() => details.removeEventListener("toggle", remember));
  }
  if (ui.hireOpen && !dialog.open) dialog.showModal();
  document.body.classList.toggle("matchday-modal-open", ui.hireOpen);
  return () => {
    events.release();
    queueMicrotask(() => {
      if (!document.querySelector(".matchday-hire-dialog[open]")) document.body.classList.remove("matchday-modal-open");
    });
  };
}
