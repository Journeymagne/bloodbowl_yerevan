import { t } from '../../core/i18n.mjs';
import { state } from '../../core/state.mjs';
import { view } from '../../core/view.mjs';
import { listenerGroup } from '../../core/dom.mjs';
import { apiRequest } from '../../core/api-client.mjs';
import { renderChecklistLayout } from "../../components/games/checklist-layout.mjs";
import { patchWithModal } from "../../components/dialog.mjs";
import { savePostMatch } from '../../data/post-match-client.mjs';
import { errorText } from '../../core/api.mjs';
import { onScreenLeave } from '../../core/screen-lifecycle.mjs';
import { renderHeader, setActiveNav, setViewSection } from '../../components/page-chrome.mjs';
import { gameUrl, postMatchUrl } from '../../core/routes.mjs';
import { POST_STEPS, resultAgreed } from '../../domain/post-match/rules.mjs';
import { postFinance } from '../../domain/post-match/finance.mjs';
import { canTakeAdvancement } from '../../domain/roster/progression.mjs';
import { renderPostResult, renderPostFans, renderPostRoster, renderPostFinance, renderPostNext, renderPostReview } from '../../components/post-match/steps.mjs';
import { renderPostPlayers, renderAdvancementDialog } from '../../components/post-match/players.mjs';
import { safe, money, postButton, previewPost, postSummary } from '../../components/post-match/shared.mjs';

function renderPostStep(payload, name, step, ui, preview) {
  const side = payload.postMatch[name], readonly = payload.postMatch.status === 'completed' || side.confirmed || step < side.stage;
  if (step === 0) return renderPostResult(payload, name, readonly);
  if (step === 1) return renderPostFans(payload, name, preview, readonly);
  if (step === 2) return renderPostPlayers(payload, name, preview, readonly) + renderAdvancementDialog(payload, name, preview, ui);
  if (step === 3) return renderPostRoster(payload, name, preview, readonly);
  if (step === 4) return renderPostFinance(payload, name, preview, readonly);
  if (step === 5) return renderPostNext(payload, name, preview, readonly);
  return renderPostReview(payload, name, readonly);
}

function renderPostShell(payload, name, step, ui) {
  const post = payload.postMatch, side = post[name], rival = post[name === "home" ? "away" : "home"];
  const preview = previewPost(payload, name);
  return renderChecklistLayout({ phase: "post", gameId: post.gameId, sideName: name, sides: post, isAdmin: payload.isAdmin,
    description: payload.fixture.kind === "friendly" ? t("games.friendlyMatch") : payload.fixture.seasonName || "",
    hero: { name: side.team.name, eyebrow: `${t("roster.sevensLabel")} · ${t("post.title")}`,
      description: `${t("games.vsLabel")} ${rival.team.name}`, edition: step + 1, logo: preview.roster.logoData },
    steps: POST_STEPS, step, current: side.stage, urlForStep: postMatchUrl, busy: ui.busy,
    stats: [["post.winnings", money(preview.winnings)], ["savedRoster.treasury", `<span data-post-treasury-preview>${money(preview.roster.treasury)}</span>`], ["post.fans", preview.roster.dedicatedFans]],
    notices: `${ui.error || preview.invalid ? `<p class="notice-box danger-text" role="alert">${safe(ui.error || t("error." + preview.invalid))}</p>` : ""}${post.status === "completed" ? `<p class="notice-box">${t("post.completed")}</p>` : ""}
      ${payload.rosterChanged[name] ? `<p class="notice-box">${t("post.rosterChanged")}</p>${postButton("post.resetDraft", "reset-side")}` : ""}`,
    content: renderPostStep(payload, name, step, ui, preview) + (resultAgreed(post) && post.status !== "completed"
      ? `<div class="post-reopen">${postButton("post.reopen", "reopen", ui.busy, "filter-button")}<small>${t("post.reopenNotice")}</small></div>` : ""),
    summary: postSummary(payload, name, preview),
    mobile: { value: `<span data-post-treasury-preview>${money(preview.roster.treasury)}</span>`, label: "savedRoster.treasury" } });
}


export async function renderPostMatch(gameId, requestedStep = '') {
  setActiveNav('my-games'); setViewSection('my-games');
  if (!state.auth.currentUser) { view.innerHTML = `${renderHeader(t('post.title'), '')}<p class="empty-state">${t('games.loginRequired')}</p>`; return; }
  let payload, name, disposed = false, timer, cleanup = () => {};
  const ui = { error: '', busy: false, dirty: false, advanceId: '', advanceType: 'primary' };
  onScreenLeave('post-match', () => { disposed = true; clearInterval(timer); cleanup(); view.querySelector('dialog[open]')?.close(); });
  const step = () => Math.min(payload.postMatch[name].stage, Math.max(0, requestedStep ? POST_STEPS.indexOf(requestedStep) : payload.postMatch[name].stage));
  const draw = () => {
    if (disposed) return;
    patchWithModal(view, renderPostShell(payload, name, step(), ui), ui.advanceId ? "[data-post-dialog]" : "");
    updateFinanceForm(payload.postMatch, name); updateInjuryFields(); updateResultForm();
  };

  const send = async (action, finish = false) => {
    if (ui.busy || disposed) return false;
    const previousStage = payload.postMatch[name].stage, viewedStage = step();
    ui.busy = true; ui.error = '';
    try {
      payload = await savePostMatch(apiRequest, payload, name, action, finish);
      ui.dirty = false; state.games.loaded = false;
      if (finish) { state.myTeams.loaded = false; location.hash = gameUrl(gameId); return true; }
      if (payload.postMatch[name].stage > previousStage && viewedStage === previousStage) {
        location.hash = postMatchUrl(gameId, POST_STEPS[payload.postMatch[name].stage]);
      }
      return true;
    } catch (error) {
      ui.error = errorText(error);
      if (error.status === 409) payload = await apiRequest('/api/games/' + gameId + '/post-match').catch(() => payload);
      return false;
    } finally { ui.busy = false; draw(); }
  };
  try {
    payload = await apiRequest('/api/games/' + encodeURIComponent(gameId) + '/post-match');
    if (disposed) return;
    name = payload.viewerSide; draw();
    cleanup = wirePostMatch({ ui, send, draw, getPayload: () => payload, getSide: () => name,
      setSide: value => { name = value; ui.advanceId = ''; ui.dirty = false; draw(); } });
    timer = setInterval(async () => {
      if (disposed || document.hidden || ui.dirty || ui.busy || ui.advanceId) return;
      try { const next = await apiRequest('/api/games/' + gameId + '/post-match'); if (!disposed && !ui.busy && !ui.dirty && !ui.advanceId && next.postMatch.revision > payload.postMatch.revision) { payload = next; draw(); } } catch { /* Retain the saved draft while offline. */ }
    }, 6000);
  } catch (error) { if (!disposed) view.innerHTML = `${renderHeader(t('post.title'), '', '', { back: true, backFallback: gameUrl(gameId) })}<p class="notice-box">${safe(errorText(error))}</p>`; }
}

function statisticsAction() {
  const form = view.querySelector('[data-post-form="statistics"]');
  if (!form || !form.reportValidity()) return null;
  const statistics = {}, injuries = {};
  for (const card of form.querySelectorAll('[data-post-player]')) {
    const id = card.dataset.postPlayer;
    statistics[id] = Object.fromEntries([...card.querySelectorAll('[data-post-counter]')].map(input => [input.dataset.postCounter, Number(input.value)]));
    injuries[id] = { code: card.querySelector('[data-post-injury]')?.value || 'none',
      stat: card.querySelector('[data-post-injury-stat]')?.value || 'ma', retire: Boolean(card.querySelector('[data-post-retire]')?.checked) };
  }
  return { type: 'statistics', statistics, injuries, mvps: [...form.querySelectorAll('[data-post-mvp]')].map(select => select.value),
    departures: Object.fromEntries([...form.querySelectorAll('[data-post-departure]')].map(input => [input.dataset.postDeparture, Number(input.value)])) };
}

function formAction(form) {
  const value = Object.fromEntries(new FormData(form)), type = form.dataset.postForm;
  if (type === 'result') return { type, mode: value.mode, winner: value.winner,
    home: { touchdowns: value.homeTouchdowns, casualties: value.homeCasualties }, away: { touchdowns: value.awayTouchdowns, casualties: value.awayCasualties } };
  if (type === 'fans') return { type, roll: value.roll, technicalRoll: value.technicalRoll, painted: Boolean(value.painted), stalling: Boolean(value.stalling) };
  if (type === 'statistics') return statisticsAction();
  if (type === 'hire') return { type: 'roster', operation: 'hire', rowIndex: value.rowIndex };
  if (type === 'finance') return { type, deposit: value.deposit, mistake: { roll: value.mistakeRoll, first: value.mistakeFirst, second: value.mistakeSecond } };
  if (type === 'advance') {
    const split = value.grant.indexOf(':');
    return { type, playerId: value.playerId, advancementType: value.advancementType, favouredRoll: value.favouredRoll,
      favouredSkill: value.favouredSkill, grant: { [value.grant.slice(0, split)]: value.grant.slice(split + 1) } };
  }
  return { type, captain: value.captain };
}

function wirePostMatch({ ui, send, draw, getPayload, getSide, setSide }) {
  const events = listenerGroup(view);
  const saveStatistics = async () => { const action = statisticsAction(); return action ? send(action) : false; };
  events.on('click', '[aria-disabled="true"]', event => event.preventDefault());
  events.on('click', '[data-post-action]', async (event, button) => {
    const type = button.dataset.postAction;
    if (type === 'close-dialog') { view.querySelector('dialog')?.close(); ui.advanceId = ''; draw(); return; }
    if (type === 'finish') { await send(null, true); return; }
    if (type === 'lock-players' && !await saveStatistics()) return;
    if (type === 'raise') { await send({ type: 'roster', operation: 'raise', rowIndex: view.querySelector('[data-post-form="hire"] select').value }); return; }
    await send({ type });
  });
  events.on('submit', '[data-post-form]', async (event, form) => {
    event.preventDefault();
    const action = formAction(form);
    if (!action) return;
    if (action.type === 'advance') ui.advanceId = '';
    await send(action);
  });
  events.on('click', '[data-post-advance]', async (event, button) => {
    const id = button.dataset.postAdvance;
    if (ui.dirty && !await saveStatistics()) return;
    const payload = getPayload(), side = payload.postMatch[getSide()], player = previewPost(payload, getSide()).players.find(item => item.id === id);
    ui.advanceId = id; ui.advanceType = ['primary', 'random', 'secondary', 'stat'].find(type => canTakeAdvancement(side.reference, player, type).allowed) || 'primary'; draw();
  });
  events.on('click', '[data-post-undo-advance]', (event, button) => send({ type: 'undo-advance', playerId: button.dataset.postUndoAdvance }));
  for (const [selector, operation, key] of [['[data-post-sell]', 'sell', 'postSell'], ['[data-post-keep]', 'keep', 'postKeep']]) events.on('click', selector, (event, button) => send({ type: 'roster', operation, playerId: button.dataset[key] }));
  events.on('click', '[data-post-staff]', (event, button) => send({ type: 'roster', operation: 'staff', key: button.dataset.postStaff, delta: Number(button.dataset.delta) }));
  events.on('change', '[data-post-side]', (event, select) => setSide(select.value));
  events.on('change', '[data-post-advance-type]', (event, select) => { ui.advanceType = select.value; draw(); });
  const refreshForm = (event, form) => {
    if (form.dataset.postForm === 'advance') return;
    ui.dirty = true; updateFinanceForm(getPayload().postMatch, getSide());
    updateInjuryFields(); updateResultForm();
  };
  events.on('input', 'form', refreshForm);
  events.on('change', 'form', refreshForm);
  const cancel = () => { ui.advanceId = ''; draw(); };
  view.addEventListener('cancel', cancel, true);
  return () => { events.release(); view.removeEventListener('cancel', cancel, true); };
}

function updateResultForm() {
  const form = view.querySelector('[data-post-form="result"]');
  if (!form) return;
  const mode = form.elements.mode.value, winner = form.elements.winner;
  winner.required = mode !== 'played';
  winner.closest('label').hidden = mode === 'played';
  for (const name of ['home', 'away']) {
    const touchdowns = form.elements[name + 'Touchdowns'], casualties = form.elements[name + 'Casualties'];
    touchdowns.disabled = casualties.disabled = mode === 'technical';
    if (mode === 'technical') { touchdowns.value = name === winner.value ? '2' : '0'; casualties.value = '0'; }
  }
}

function updateInjuryFields() {
  for (const select of view.querySelectorAll('[data-post-injury]')) {
    const card = select.closest('[data-post-player]');
    for (const field of card.querySelectorAll('[data-post-injury-stat], [data-post-retire]')) {
      field.closest('label').hidden = select.value !== 'lasting';
      field.disabled = select.value !== 'lasting';
    }
  }
}

function updateFinanceForm(post, name) {
  const form = view.querySelector('[data-post-form="finance"]');
  if (!form) return;
  const treasury = Number(form.dataset.beforeDeposit) - Number(form.elements.deposit.value || 0);
  const rolls = form.querySelector('[data-post-mistakes]');
  rolls.hidden = treasury < 100;
  const dice = form.elements.mistakeRoll;
  dice.disabled = treasury < 100;
  const draft = structuredClone(post);
  draft[name].deposit = form.elements.deposit.value;
  draft[name].mistake = { roll: dice.disabled ? null : dice.value,
    first: form.elements.mistakeFirst.value, second: form.elements.mistakeSecond.value };
  let finance, error;
  try { finance = postFinance(draft, name, { treasury: Number(form.dataset.beforeDeposit) }); }
  catch (failure) { error = t('error.' + failure.code, failure.params); }
  const kind = finance?.kind || 'pending';
  const first = form.querySelector('[data-post-extra="first"]'), second = form.querySelector('[data-post-extra="second"]');
  first.hidden = !['minor', 'catastrophe'].includes(kind); second.hidden = kind !== 'catastrophe';
  first.querySelector('input').disabled = first.hidden; second.querySelector('input').disabled = second.hidden;
  first.querySelector('input').max = kind === 'minor' ? '3' : '6';
  form.querySelector('[data-post-mistake-kind]').textContent = t('post.mistake.' + kind);
  form.querySelector('[data-post-finance-preview]').textContent = t('post.riskTreasury', { amount: money(treasury) });
  form.querySelector('[data-post-finance-balances]').textContent = error || (finance?.pending ? t('post.financePending')
    : t('post.financeEstimate', { treasury: money(finance.after), safe: money(finance.safe), loss: money(finance.loss) }));
  if (finance) {
    for (const [key, amount] of [['post.safeDeposit', finance.deposit], ['post.moneyLost', finance.loss], ['post.closingTreasury', finance.after], ['post.safe', finance.safe]]) {
      view.querySelector(`[data-post-account-value="${key}"]`).textContent = money(amount);
    }
    view.querySelector('[data-post-account-pending]').hidden = !finance.pending;
    view.querySelectorAll('[data-post-treasury-preview]').forEach(element => { element.textContent = money(finance.after); });
    view.querySelector('[data-summary-value="savedRoster.treasury"]').textContent = `${money(post[name].baseRoster.treasury)} → ${money(finance.after)}`;
    view.querySelector('[data-summary-value="post.safe"]').textContent = money(finance.safe);
  }
}
