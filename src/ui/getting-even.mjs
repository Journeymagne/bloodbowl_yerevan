import { apiRequest } from '../core/api-client.mjs';
import { errorText } from '../core/api.mjs';
import { delegate, escapeHtml } from '../core/dom.mjs';
import { t } from '../core/i18n.mjs';
import { gameUrl } from '../core/routes.mjs';
import { gettingEvenEligible, gettingEvenStatus, sameCasualty } from '../domain/getting-even.mjs';
import { renderButton } from './button.mjs';

const words = (key, params) => escapeHtml(t(`gettingEven.${key}`, params));
const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
const targetKey = player => player ? `${player.side}:${player.playerId}` : '';
const casualty = injury => injury?.code && injury.code !== 'none' ? { code: injury.code, ...(injury.code === 'lasting' ? { stat: injury.stat } : {}) } : null;

export function gettingEvenDetails(decision) {
  if (!decision?.roll) return '';
  const source = decision.attacker;
  return `<div class="g-even__details"><p>${words('rollResult', { roll: decision.roll })} · ${words(decision.source === 'site' ? 'site' : 'table')}</p>`
    + (decision.injury?.code ? `<p>${escapeHtml(t(`after.injury.${decision.injury.code}`))}${decision.injury.stat ? ` · ${escapeHtml(decision.injury.stat.toUpperCase())}` : ''}</p>` : '')
    + (decision.pairingId ? `<p><a href="${escapeHtml(gameUrl(decision.pairingId))}">${words('match')}</a></p>` : '')
    + (source ? `<p>${words('causedBy', { player: source.name, team: source.teamName })}</p>` : '')
    + (gettingEvenStatus(decision) === 'earned' ? `<p>${words('effect', { keyword: decision.keyword })}</p>` : '') + '</div>';
}

/** One editor is owned by the open sheet. Every network response updates only that editor. */
export function createGettingEvenEditor({ teamId, pairingId, playerId, injury, eventId = null, onChange = () => {} }) {
  const url = `/api/teams/${encodeURIComponent(teamId)}/getting-even`;
  const editor = { context: null, decision: null, injury: casualty(injury), eventId, busy: false, loading: true, error: '', attacker: '', keyword: '', manual: false };
  let generation = 0;
  const notify = () => onChange(editor);
  editor.refresh = notify;
  const eligible = () => gettingEvenEligible(editor.injury, editor.context?.gamesPlayed);
  function adopt(decision) {
    editor.decision = decision;
    editor.attacker = targetKey(decision?.attacker);
    editor.keyword = decision?.keyword || '';
  }
  editor.load = async () => {
    const current = ++generation;
    editor.loading = true; editor.error = ''; notify();
    try {
      const ctx = await apiRequest(`${url}?pairing=${encodeURIComponent(pairingId)}`);
      if (current !== generation) return;
      editor.context = ctx;
      const active = ctx.injuries[playerId];
      editor.eventId = active && sameCasualty(editor.injury, active.injury) ? active.id : null;
      const decision = ctx.decisions.find(item => item.playerId === playerId && (editor.eventId ? item.injuryEventId === editor.eventId : !item.injuryEventId));
      adopt(decision ?? null);
    } catch (error) { if (current === generation) editor.error = errorText(error); }
    finally { if (current === generation) { editor.loading = false; notify(); } }
  };
  editor.setInjury = value => {
    editor.injury = casualty(value);
    const active = editor.context?.injuries[playerId];
    const event = active && sameCasualty(value, active.injury) ? active.id : null;
    if (editor.eventId !== event) {
      editor.eventId = event;
      adopt(editor.context?.decisions.find(item => item.playerId === playerId && (event ? item.injuryEventId === event : !item.injuryEventId)) ?? null);
    }
  };
  editor.send = async (action, roll) => {
    if (editor.busy || editor.loading || !eligible()) return null;
    editor.busy = true; editor.error = ''; notify();
    const attacker = editor.context.players.find(player => targetKey(player) === editor.attacker);
    try {
      const { decision } = await apiRequest(url, { method: 'POST', body: JSON.stringify({ pairingId, playerId, eventId: editor.eventId,
        injury: editor.injury, action, ...(roll ? { roll } : {}),
        attacker: attacker ? { side: attacker.side, playerId: attacker.playerId } : null, keyword: editor.keyword || null }) });
      adopt(decision);
      editor.context.decisions = [...editor.context.decisions.filter(item => item.id !== decision.id), decision];
      return decision;
    } catch (error) {
      editor.error = errorText(error);
      // Repeating the request is safe: the server reuses the same decision and D6.
      return null;
    } finally { editor.busy = false; notify(); }
  };
  editor.save = async () => {
    if (editor.loading || editor.busy || !editor.context) return { ok: false };
    if (!eligible()) return { ok: true, id: null };
    const decision = await editor.send('save');
    return { ok: Boolean(decision), id: decision?.id ?? null };
  };
  editor.markup = () => editorMarkup(editor, playerId);
  return editor;
}

function editorMarkup(editor, playerId) {
    if (!editor.injury) return '';
    if (editor.loading) return `<section class="g-even" aria-busy="true"><h3>${words('title')}</h3><p>${words('loading')}</p></section>`;
    if (!editor.context) return `<section class="g-even"><p role="alert">${escapeHtml(editor.error)}</p>${renderButton({ label: t('gettingEven.retry'), data: { evenAction: 'retry' } })}</section>`;
    if (!gettingEvenEligible(editor.injury, editor.context.gamesPlayed)) return `<section class="g-even g-even--quiet"><h3>${words('title')}</h3><p>${words(Number(editor.context.gamesPlayed) < 3 ? 'rookie' : 'notRequired')}</p></section>`;
    const { context: ctx, decision, busy } = editor;
    const players = [...ctx.players].sort((a, b) => Number(a.side === ctx.own) - Number(b.side === ctx.own))
      .filter(player => !(player.side === ctx.own && player.playerId === playerId));
    const attacker = players.find(player => targetKey(player) === editor.attacker);
    const choices = option('', t('gettingEven.unknown'), !editor.attacker) + players.map(player => option(targetKey(player), `${player.teamName} · #${player.number} ${player.name}`, targetKey(player) === editor.attacker)).join('');
    const keywords = attacker?.keywords ?? [];
    const keyword = keywords.length === 1 ? keywords[0] : editor.keyword;
    const display = { ...decision, attacker, keyword: decision?.roll >= 4 ? keyword : null };
    const status = gettingEvenStatus(display);
    const keywordField = keywords.length > 1 && decision?.roll >= 4
      ? `<label>${words('keyword')}<select data-even-keyword${busy ? ' disabled' : ''}>${option('', t('gettingEven.chooseKeyword'), !keyword)}${keywords.map(item => option(item, item, item === keyword)).join('')}</select></label>`
      : `<p class="g-even__note">${attacker ? keywords.length ? words('automatic', { keyword: keywords.join(', ') }) : words('noKeywords') : words('selectSource')}</p>`;
    const roll = decision?.roll ? `<p class="g-even__roll">⚄ ${words('rollResult', { roll: decision.roll })} · ${words(decision.source === 'site' ? 'site' : 'table')}</p>`
      : `<div class="g-even__actions">${renderButton({ label: t('gettingEven.roll'), busy, data: { evenAction: 'roll' } })}${renderButton({ label: t('gettingEven.enterTable'), disabled: busy, data: { evenAction: 'manual' } })}</div>`;
    const manual = editor.manual && !decision?.roll ? `<div class="g-even__dice" role="group" aria-label="${words('enterTable')}">${[1,2,3,4,5,6].map(face => renderButton({ label: String(face), disabled: busy, data: { evenFace: face } })).join('')}</div>` : '';
    return `<section class="g-even"><header><h3>${words('title')}</h3><b>D6 · 4+</b></header><p>${words('intro')}</p>`
      + `<label>${words('attacker')}<select data-even-attacker${busy ? ' disabled' : ''}>${choices}</select></label>${keywordField}${roll}${manual}`
      + `<div class="g-even__result g-even__result--${status}" role="status">${status === 'earned' ? `<strong>Hatred (${escapeHtml(keyword)})</strong><p>${words('automaticAward')}</p>` : words(status)}</div>`
      + `<p class="g-even__note">${words('later')}</p>${editor.error ? `<p role="alert">${escapeHtml(editor.error)}</p>` : ''}</section>`;
}

export function wireGettingEven(root, editorOf) {
  const releases = [
    delegate(root, 'click', '[data-even-action]', (event, button) => {
      const editor = editorOf(); if (!editor || editor.busy || editor.loading) return;
      const action = button.getAttribute('data-even-action');
      if (action === 'retry') void editor.load();
      else if (action === 'manual') { editor.manual = !editor.manual; editor.refresh(); }
      else void editor.send(action);
    }),
    delegate(root, 'click', '[data-even-face]', (event, button) => { const editor = editorOf(); if (editor) void editor.send('table', Number(button.getAttribute('data-even-face'))); }),
    delegate(root, 'change', '[data-even-attacker]', (event, input) => { const editor = editorOf(); if (editor && !editor.busy) { editor.attacker = input.value; editor.keyword = ''; editor.refresh(); } }),
    delegate(root, 'change', '[data-even-keyword]', (event, input) => { const editor = editorOf(); if (editor && !editor.busy) { editor.keyword = input.value; editor.refresh(); } }),
  ];
  return () => releases.forEach(release => release());
}

/** Players, Roster and Summary use the same readout, including unresolved checks. */
export function postGettingEvenMarkup(model) {
  const side = model.post[model.sideName];
  const items = side.snapshot.players.filter(player => player.kind !== 'star' && gettingEvenEligible(side.injuries[player.id], side.gamesPlayed));
  if (!items.length) return '';
  const rows = items.map(player => {
    const decision = side.gettingEven?.[player.id], status = gettingEvenStatus(decision);
    const label = status === 'earned' ? `Hatred (${decision.keyword})` : t(`gettingEven.${decision ? status : 'unrecorded'}`);
    const change = !model.completed ? renderButton({ label: t(status === 'earned' || status === 'failed' ? 'gettingEven.edit' : 'gettingEven.resolve'), dialog: true, data: { afterEven: player.id } }) : '';
    return `<div class="g-even__player"><div><strong>${escapeHtml(`#${player.number} ${player.name}`)}</strong><p>${escapeHtml(t(`after.injury.${side.injuries[player.id].code}`))}</p>`
      + `<span class="g-even__badge">${escapeHtml(label)}</span>${status === 'earned' ? `<small>${words('thisMatch')}</small>` : ''}`
      + `<details><summary>${words('details')}</summary>${gettingEvenDetails(decision) || `<p>${words('unrecorded')}</p>`}</details></div>${change}</div>`;
  }).join('');
  return `<section class="g-after__card g-even__roster"><h3>${words('title')}</h3>${rows}</section>`;
}
