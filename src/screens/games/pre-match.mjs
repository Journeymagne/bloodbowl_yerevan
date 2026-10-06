import { listenerGroup } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { errorText } from "../../core/api.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { gameUrl, preMatchUrl } from "../../core/routes.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { renderChecklistLayout } from "../../components/games/checklist-layout.mjs";
import { patchWithModal } from "../../components/dialog.mjs";
import { toastError } from "../../components/toast.mjs";
import { MATCH_STEPS, otherSide } from "../../domain/match/rules.mjs";
import { preparationStep } from "../../domain/match/preparation.mjs";
import { calculateMatchCtv } from "../../domain/match/roster.mjs";
import { matchBudget } from "../../domain/match/budget.mjs";
import { renderSummary, safe, money, actionButton } from "../../components/pre-match/shared.mjs";
import { renderFans, renderWeather, renderRoster, renderReview } from "../../components/pre-match/steps.mjs";
import { renderInducements } from "../../components/pre-match/catalog.mjs";
import { renderEffects, effectsFromForm } from "../../components/pre-match/effects.mjs";

function stepHtml(payload, sideName, step, ui) {
  const readonly = payload.preparation.status === "in_progress" || payload.fixture.closed;
  const renders = [() => renderFans(payload, sideName, readonly), () => renderWeather(payload, readonly),
    () => renderRoster(payload, sideName, readonly, ui), () => renderInducements(payload, sideName, ui,
      renderEffects(payload.preparation, sideName, !readonly && !payload.preparation[sideName].basketLocked)),
    () => renderReview(payload, sideName, readonly)];
  return renders[step]();
}

function renderShell(payload, sideName, step, ui) {
  const prep = payload.preparation, side = prep[sideName], opponent = prep[otherSide(sideName)];
  const current = preparationStep(prep), budget = matchBudget(prep, sideName, state.data), ctv = calculateMatchCtv(side);
  const stats = step === 3 ? [["pre.maximumBudget", money(budget.maximum)], ["pre.chosen", money(budget.chosen)], ["pre.available", money(budget.remaining)]]
    : [["pre.availablePlayers", `${ctv.players} / 14`], ["pre.ctv", money(ctv.total)], ["savedRoster.treasury", money(side.roster.treasury)]];
  const friendly = payload.fixture.kind === "friendly";
  return renderChecklistLayout({ phase: "pre", gameId: payload.fixture.id, sideName, sides: prep, isAdmin: payload.isAdmin,
    description: friendly ? `${t("games.friendlyMatch")} · ${t("games.noLeaguePoints")}` : `${payload.fixture.seasonName} · ${t("season.roundLabel")} ${payload.fixture.roundNumber}`,
    hero: { name: side.team.name, eyebrow: `${t("roster.sevensLabel")} · ${friendly ? t("games.friendlyMatch") : t("pre.table", { number: payload.fixture.tableNumber })}`,
      description: `${t("games.vsLabel")} ${opponent.team.name} · ${side.reference.title}`, edition: step + 1, logo: side.roster.logoData },
    steps: MATCH_STEPS, step, current, urlForStep: preMatchUrl, stats, busy: ui.busy,
    notices: `${prep.status === "in_progress" ? `<p class="notice-box">${t("pre.started")}</p>` : ""}${payload.fixture.closed ? `<p class="notice-box">${t("pre.closed")}</p>` : ""}${ui.error ? `<p class="notice-box danger-text" role="alert">${safe(ui.error)}</p>` : ""}`,
    content: stepHtml(payload, sideName, step, ui), summary: renderSummary(payload, sideName),
    mobile: { value: step === 3 ? money(budget.remaining) : money(ctv.total), label: step === 3 ? "pre.available" : "pre.ctv", next: true } });
}


export async function renderPreMatch(gameId, requestedStep = "") {
  if (requestedStep === "kickoff") { location.replace(preMatchUrl(gameId, "review")); return; }
  setActiveNav("my-games"); setViewSection("my-games");
  if (!state.auth.currentUser) { view.innerHTML = `${renderHeader(t("pre.title"), "")}<p class="empty-state">${t("games.loginRequired")}</p>`; return; }
  let payload, disposed = false, sideName, timer, cleanup = () => {};
  onScreenLeave("pre-match", () => { disposed = true; clearInterval(timer); cleanup(); view.querySelectorAll("dialog[open]").forEach(dialog => dialog.close()); });
  const ui = { category: "help", query: "", showUnavailable: false, dialog: "", busy: false, dirty: false, error: "" };
  const step = () => { const requested = MATCH_STEPS.indexOf(requestedStep), current = preparationStep(payload.preparation); return Math.min(Math.max(0, requested === -1 ? current : requested), current); };
  const draw = () => {
    if (!disposed) patchWithModal(view, renderShell(payload, sideName, step(), ui), ui.dialog ? `[data-pre-${ui.dialog}]` : "");
  };

  const send = async (action, start = false) => {
    if (ui.busy || disposed) return;
    ui.busy = true; ui.error = "";
    try {
      payload = await apiRequest(`/api/games/${gameId}/${start ? "start" : "preparation"}`, { method: start ? "POST" : "PATCH", body: JSON.stringify({ revision: payload.preparation.revision, side: sideName, action }) });
      ui.dirty = false; state.games.loaded = false;
      if (start) { location.hash = gameUrl(gameId); return; }
    } catch (error) {
      ui.error = errorText(error);
      if (error.status === 409) payload = await apiRequest(`/api/games/${gameId}/preparation`).catch(() => payload);
    } finally { ui.busy = false; draw(); }
  };
  try {
    payload = await apiRequest(`/api/games/${encodeURIComponent(gameId)}/preparation`);
    if (disposed) return;
    sideName = payload.viewerSide; draw();
    cleanup = wirePreMatch(view, { ui, getPayload: () => payload, getSide: () => sideName, send, draw,
      setSide: value => { sideName = value; ui.dialog = ""; draw(); } });
    timer = setInterval(async () => {
      if (ui.busy || ui.dirty || ui.dialog || document.hidden || disposed) return;
      try { const next = await apiRequest(`/api/games/${gameId}/preparation`); if (!disposed && next.preparation.revision !== payload.preparation.revision) { payload = next; draw(); } } catch { /* Keep current state on a transient offline poll. */ }
    }, 6000);
  } catch (error) { if (!disposed) view.innerHTML = `${renderHeader(t("pre.title"), "", "", { back: true, backFallback: gameUrl(gameId) })}<p class="notice-box">${safe(errorText(error))}</p>`; }
}

function wirePreMatch(root, { ui, getPayload, getSide, send, draw, setSide }) {
  const events = listenerGroup(root);
  events.on("click", '[aria-disabled="true"]', event => { event.preventDefault(); toastError(new Error(t("pre.choiceUnavailable"))); });
  events.on("click", "[data-pre-action]", (event, button) => {
    const action = button.dataset.preAction;
    if (action.startsWith("open-")) { ui.dialog = action.slice(5); draw(); return; }
    if (action.startsWith("close-")) { root.querySelector("dialog[open]")?.close(); ui.dialog = ""; root.querySelector(`[data-pre-action="open-${action.slice(6)}"]`)?.focus(); return; }
    if (action === "start") { send(null, true); return; }
    send({ type: action });
  });
  events.on("click", "[data-pre-buy]", (event, button) => { if (button.getAttribute("aria-disabled") === "true") return; const id = button.dataset.preBuy; send({ type: "basket", id, quantity: Number(getPayload().preparation[getSide()].basket[id] || 0) + Number(button.dataset.delta) }); });
  events.on("click", "[data-pre-hire]", (event, button) => { ui.dialog = ""; send({ type: "add-journeyman", rowIndex: Number(button.dataset.preHire) }); });
  events.on("click", "[data-pre-remove]", (event, button) => send({ type: "remove-journeyman", id: button.dataset.preRemove }));
  events.on("click", "[data-pre-category]", (event, button) => { ui.category = button.dataset.preCategory; draw(); });
  events.on("change", "[data-pre-side]", (event, select) => setSide(select.value));
  events.on("input", "[data-pre-search]", (event, input) => { ui.query = input.value; draw(); });
  events.on("search", "[data-pre-search]", (event, input) => { ui.query = input.value; draw(); });
  events.on("change", "[data-pre-unavailable]", (event, input) => { ui.showUnavailable = input.checked; draw(); });
  events.on("input", "form", () => { ui.dirty = true; });
  events.on("submit", "form", (event, form) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form)), type = form.hasAttribute("data-pre-fans") ? "fans" : form.hasAttribute("data-pre-weather") ? "weather" : "effects";
    send(type === "effects" ? { type, effects: effectsFromForm(form, getPayload().preparation[getSide()].effects, getPayload().preparation[getSide()].basket["nuffles-prayers"] || 0) } : type === "weather" ? { type, ...data } : { type, value: data.roll });
  });
  events.on("change", "[data-pre-prayer], [data-pre-prayer-target]", (event, select) => { const form = select.closest("form"); send({ type: "effects", effects: effectsFromForm(form, getPayload().preparation[getSide()].effects, getPayload().preparation[getSide()].basket["nuffles-prayers"] || 0) }); });
  const cancel = () => { ui.dialog = ""; };
  root.addEventListener("cancel", cancel, true);
  return () => { events.release(); root.removeEventListener("cancel", cancel, true); };
}
