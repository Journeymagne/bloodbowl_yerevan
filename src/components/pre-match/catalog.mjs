import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { matchCatalog, catalogAccess } from "../../domain/match/catalog.mjs";
import { matchBudget, basketTotals } from "../../domain/match/budget.mjs";
import { MATCH_RULES, teamKey, otherSide } from "../../domain/match/rules.mjs";
import { starProfiles } from "../../domain/match/snapshot.mjs";
import { safe, money, playerCard, actionButton } from "./shared.mjs";

function localItem(item) {
  const page = state.data.pages.find(page => page.slug === item.slug);
  return { ...item, body: page?.body || item.body };
}

function purchaseReason(item, prep, sideName) {
  const side = prep[sideName], budget = matchBudget(prep, sideName, state.data);
  if (!catalogAccess(item, side)) return t("pre.accessBlocked");
  if (Number(side.basket[item.id] || 0) >= item.limit) return t("pre.limitReached");
  if (item.cost > budget.remaining) return t("pre.missingMoney", { amount: money(item.cost - budget.remaining) });
  const total = basketTotals(side, state.data), maximum = MATCH_RULES.stuntyTeams.includes(teamKey(side.reference)) ? 4 : 2;
  if (total.slots + item.slots > maximum) return t("error.MATCH_STAR_LIMIT", { maximum });
  const available = side.players.filter(player => !player.skipNextGame).length + side.journeymen.length;
  if (available + total.spaces + item.spaces > MATCH_RULES.rosterMaximum) return t("error.MATCH_ROSTER_LIMIT", { maximum: MATCH_RULES.rosterMaximum });
  return "";
}

function itemCard(item, prep, sideName, editable, catalog = false) {
  const quantity = Number(prep[sideName].basket[item.id] || 0), reason = purchaseReason(item, prep, sideName);
  const content = localItem(item).body.replace(/^---[\s\S]*?---/, "").replace(/\[\[([^\]]+)\]\]/g, "$1").split(/\n/).find(line => line.trim()) || "";
  return `<article class="pre-inducement-card ${reason && catalog ? "is-unavailable" : ""}" data-key="item-${safe(item.id)}">
    <header><div><h3>${safe(item.title)}</h3><small>${item.category === "stars" ? t("pre.starSlots", { slots: item.slots, spaces: item.spaces }) : t("pre.quantityLimit", { maximum: item.limit })}</small></div><strong>${money(item.cost)}</strong></header>
    ${item.category === "stars" ? `<div class="pre-star-preview">${starProfiles(item).map(player => playerCard(player)).join("")}</div>` : `<p>${safe(content)}</p>`}
    <footer><a class="roster-pill" href="#/${safe(item.slug)}" target="_blank" rel="noopener">${t("pre.ruleLink")}</a>
    <div class="inline-stepper-control"><button type="button" data-pre-buy="${safe(item.id)}" data-delta="-1" ${!editable || !quantity ? "disabled" : ""} aria-label="${t("pre.reduce", { item: safe(item.title) })}">−</button><strong>${quantity}</strong><button type="button" data-pre-buy="${safe(item.id)}" data-delta="1" ${!editable ? "disabled" : ""} ${reason ? 'aria-disabled="true"' : ""} aria-label="${t("pre.add", { item: safe(item.title) })}">+</button></div></footer>
    ${reason && catalog ? `<small class="pre-blocked-reason">${safe(reason)}</small>` : ""}
  </article>`;
}

export function renderInducements(payload, sideName, ui, effectsHtml) {
  const prep = payload.preparation, side = prep[sideName], budget = matchBudget(prep, sideName, state.data);
  const catalog = matchCatalog(side, state.data), selected = catalog.filter(item => side.basket[item.id]);
  const editable = budget.canChoose && !side.basketLocked && prep.status !== "in_progress" && !payload.fixture.closed;
  return `<div class="pre-section-head"><div><span class="matchday-eyebrow">${t("pre.oneMatch")}</span><h2>${t("pre.inducements")}<span class="matchday-heading-dot">.</span></h2></div>${actionButton("pre.addInducement", "open-catalog", !editable)}</div>
    ${!budget.canChoose ? `<p class="notice-box">${t("pre.waitPurchase", { team: safe(prep[otherSide(sideName)].team.name) })}</p>` : ""}
    <div class="pre-basket">${selected.length ? selected.map(item => itemCard(item, prep, sideName, editable)).join("") : `<div class="pre-empty">${t("pre.noInducements")}</div>`}</div>
    ${effectsHtml}<div class="pre-inline-actions">${actionButton(selected.length ? "pre.lockPurchases" : "pre.continueWithout", "lock-basket", !editable)}${side.basketLocked && prep.status !== "in_progress" ? actionButton("pre.reopen", "reopen", payload.fixture.closed, "filter-button") : ""}</div><p class="pre-intro">${t("pre.mercenariesUnavailable")}</p>
    <dialog class="matchday-hire-dialog pre-catalog-dialog" data-pre-catalog ${ui.dialog === "catalog" ? "open" : ""} aria-labelledby="pre-catalog-title"><header><div><span class="matchday-eyebrow">${safe(side.team.name)}</span><h2 id="pre-catalog-title">${t("pre.addInducement")}</h2><p>${t("pre.available")}: <strong>${money(budget.remaining)}</strong></p></div>${actionButton("common.close", "close-catalog", false, "filter-button")}</header>
      <div class="pre-catalog-controls"><div class="pre-categories">${["help", "stars"].map(category => `<button class="filter-button ${ui.category === category ? "active" : ""}" data-pre-category="${category}">${t(`pre.category.${category}`)}</button>`).join("")}</div><input data-pre-search type="search" placeholder="${t("pre.search")}" value="${safe(ui.query)}"><label class="pre-checkbox"><input type="checkbox" data-pre-unavailable ${ui.showUnavailable ? "checked" : ""}>${t("pre.showUnavailable")}</label></div>
      <div class="matchday-hire-list">${catalog.filter(item => item.category === ui.category && (ui.showUnavailable || catalogAccess(item, side)) && item.title.toLowerCase().includes(ui.query.toLowerCase())).map(item => itemCard(item, prep, sideName, editable, true)).join("")}</div></dialog>`;
}
