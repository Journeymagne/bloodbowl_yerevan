import { renderResultFields } from "../games/result-fields.mjs";
import { t } from '../../core/i18n.mjs';
import { playerCard } from '../pre-match/shared.mjs';
import { playerProfile } from '../../domain/match/roster.mjs';
import { resultAgreed, postOutcome, effectiveInjury } from '../../domain/post-match/rules.mjs';
import { PAINTING_BONUS } from '../../domain/post-match/finance.mjs';
import { postStaffOptions } from '../../domain/post-match/roster.mjs';
import { teamHasSpecialRule } from '../../domain/roster/team-rules.mjs';
import { builderStaffCosts, builderStaffMaximums } from '../../domain/league-rules.mjs';
import { safe, money, numberField, postButton, postValues, previewPost } from './shared.mjs';
import { renderReviewDetails } from './review.mjs';
import { renderPostAccounting } from './finance.mjs';

export function renderPostResult(payload, name, readonly) {
  const post = payload.postMatch, result = post.result, agreed = resultAgreed(post);
  return `<h2>${t('post.result')}</h2><p>${t('post.resultIntro')}</p><form data-post-form="result"><fieldset ${readonly || result?.official ? 'disabled' : ''}>
    <label class="filter-field"><span>${t('post.resultMode')}</span><select name="mode">${['played', 'technical', 'conceded', 'conceded-safe'].map(mode => `<option value="${mode}" ${result?.mode === mode ? 'selected' : ''}>${t('post.mode.' + mode)}</option>`).join('')}</select></label>
    <label class="filter-field"><span>${t('post.specialWinner')}</span><select name="winner"><option value="">${t('post.notApplicable')}</option>${['home', 'away'].map(key => `<option value="${key}" ${result?.winner === key ? 'selected' : ''}>${safe(post[key].team.name)}</option>`).join('')}</select></label>
    ${renderResultFields(post, Object.fromEntries(["home", "away"].flatMap(key => [[key + "Touchdowns", result?.[key].touchdowns], [key + "Casualties", result?.[key].casualties]])), { maximum: 99, status: key => t(result?.accepted[key] ? "pre.confirmed" : "pre.notConfirmed") })}
    ${!readonly && !result?.official ? `<button type="submit" class="primary-button">${t(result ? 'post.replaceResult' : 'post.proposeResult')}</button>` : ''}</fieldset></form>
    ${result && !agreed && !result.accepted[name] && !readonly ? postButton('post.agreeResult', 'agree-result') : ''}
    ${result && !agreed ? `<p class="notice-box">${t('post.waitResult')}</p>` : ''}`;
}

export function renderPostFans(payload, name, preview, readonly) {
  const post = payload.postMatch, side = post[name], outcome = postOutcome(post, name);
  const fansMax = post.result?.mode === 'conceded' && outcome === 'loss' ? 3 : 6;
  return `<h2>${t('post.fans')}</h2><p>${t('post.fansIntro')}</p><form class="pre-team-panel" data-post-form="fans"><fieldset ${readonly ? 'disabled' : ''}>
    <p>${t('pre.dedicated')}: <strong>${side.baseRoster.dedicatedFans}</strong></p>
    ${outcome !== 'draw' ? numberField('roll', t('post.fansRoll', { maximum: fansMax }), side.fansRoll, fansMax, 1) : `<p>${t('post.drawFans')}</p>`}
    ${post.result?.mode === 'technical' && outcome === 'win' ? numberField('technicalRoll', t('post.technicalRoll'), side.technicalRoll, 3, 1) : ''}
    <label class="post-check"><input type="checkbox" name="painted" ${side.painted ? 'checked' : ''}>${t('post.painted', { bonus: PAINTING_BONUS })}</label><label class="post-check"><input type="checkbox" name="stalling" ${side.stalling ? 'checked' : ''}>${t('post.stalling')}</label>
    <div class="post-two-fields"><div class="pre-result"><span>${t('post.fans')}</span><strong>${preview.roster.dedicatedFans}</strong></div><div class="pre-result"><span>${t('post.winnings')}</span><strong>${money(preview.winnings)}</strong></div></div>
    <p class="pre-intro">${t('post.incomeExplanation', { bonus: PAINTING_BONUS })}</p>${!readonly ? `<button class="primary-button" type="submit">${t('post.saveFans')}</button>` : ''}</fieldset></form>`;
}

export function renderPostRoster(payload, name, preview, readonly) {
  const side = payload.postMatch[name], roster = preview.roster, rows = side.reference.team.roster;
  const kept = side.operations.filter(item => item.type === 'keep').map(item => item.playerId);
  const journeymen = preview.players.filter(player => player.kind && !kept.includes(player.id) && effectiveInjury(side, player.id).code !== 'dead');
  return `<h2>${t('post.roster')}</h2><p>${t('post.rosterIntro')}</p><div class="post-roster-actions">
    ${!readonly ? `<form data-post-form="hire" class="pre-team-panel"><label class="filter-field"><span>${t('post.hirePosition')}</span><select name="rowIndex">${rows.map((row, index) => `<option value="${index}">${safe(row.position)} · ${safe(row.price || row.cost)} · ${safe(row.qty)}</option>`).join('')}</select></label><button class="primary-button" type="submit">${t('post.hire')}</button>
    ${teamHasSpecialRule(side.reference, 'Masters of Undeath') ? postButton('post.raise', 'raise', false, 'filter-button') : ''}</form>` : ''}
    <div class="post-staff-panel pre-team-panel"><h3>${t('post.staff')}</h3>${postStaffOptions(side.reference).map(key => `<div class="post-staff-line"><span>${t('savedRoster.' + key)}<small>${money(builderStaffCosts[key])}</small></span><strong>${roster[key]} / ${builderStaffMaximums[key]}</strong>${!readonly ? `<button class="filter-button" type="button" data-post-staff="${key}" data-delta="1">+</button>${key !== 'teamRerolls' ? `<button class="filter-button" type="button" data-post-staff="${key}" data-delta="-1" ${!roster[key] ? 'disabled' : ''}>−</button>` : ''}` : ''}</div>`).join('')}</div></div>
    <h3>${t('post.keptPlayers')}</h3><div class="pre-player-grid">${roster.players.map(player => `<div>${playerCard(playerProfile({ ...player, row: rows[player.rowIndex] }))}<p class="pre-intro">${t(player.temporarilyRetired ? 'post.retired' : player.skipNextGame ? 'pre.mng' : 'post.available')}</p>${!readonly ? `<button class="filter-button danger-action" type="button" data-post-sell="${safe(player.id)}" ${roster.players.length <= 7 ? 'disabled' : ''}>${t('post.sell')}</button>` : ''}</div>`).join('')}</div>
    ${journeymen.length ? `<h3>${t('post.journeymen')}</h3><p>${t('post.journeymenIntro')}</p><div class="pre-player-grid">${journeymen.map(player => `<div>${playerCard(playerProfile({ ...player, row: rows[player.rowIndex] }))}${!readonly ? `<button class="primary-button" type="button" data-post-keep="${safe(player.id)}">${t('post.keepJourneyman')}</button>` : ''}</div>`).join('')}</div>` : ''}
    <p class="pre-intro">${t('post.sellLimit')}</p><p>${t('post.rosterChanges', { count: side.operations.length })}</p>
    ${!readonly ? `<div class="pre-inline-actions">${postButton('post.undoRoster', 'undo-roster', !side.operations.length, 'filter-button')}${postButton('post.saveRoster', 'lock-roster')}</div>` : ''}`;
}

export function renderPostFinance(payload, name, preview, readonly) {
  const side = payload.postMatch[name], beforeDeposit = preview.finance.before + preview.finance.deposit;
  const waiting = payload.postMatch[name === 'home' ? 'away' : 'home'].stage < 3;
  return `<h2>${t('post.finance')}</h2><p>${t('post.financeIntro')}</p>${renderPostAccounting(preview)}${waiting ? `<p class="notice-box">${t('post.waitStatistics')}</p>` : ''}
    <form class="pre-team-panel" data-post-form="finance" data-before-deposit="${beforeDeposit}"><fieldset ${readonly || waiting ? 'disabled' : ''}>
    ${numberField('deposit', t('post.safeDeposit'), side.deposit, Math.min(50, preview.winnings, beforeDeposit))}<p>${t('post.safeNotice')}</p>
    <div data-post-mistakes><h3>${t('post.mistakes')}</h3>${numberField('mistakeRoll', t('post.mistakeRoll'), side.mistake.roll, 6, 1)}
    <p data-post-mistake-kind></p><div class="post-two-fields"><div data-post-extra="first">${numberField('mistakeFirst', t('post.extraRoll'), side.mistake.first, 6, 1)}</div><div data-post-extra="second">${numberField('mistakeSecond', t('post.extraRoll'), side.mistake.second, 6, 1)}</div></div></div>
    <p data-post-finance-preview></p><p data-post-finance-balances role="status" aria-live="polite"></p>${!readonly ? `<button type="submit" class="primary-button" ${waiting ? 'disabled' : ''}>${t('post.saveFinance')}</button>` : ''}</fieldset></form>`;
}

export function renderPostNext(payload, name, preview, readonly) {
  const values = postValues(payload, name, preview.roster), side = payload.postMatch[name];
  const options = preview.roster.players.filter(player => !player.temporarilyRetired);
  const selected = side.captain || options.find(player => player.isCaptain)?.id || options[0]?.id || '';
  return `<h2>${t('post.next')}</h2><p>${t('post.nextIntro')}</p><dl class="matchday-scoreboard"><div><dt>${t('post.tv')}</dt><dd>${money(values.tv)}</dd></div><div><dt>${t('pre.ctv')}</dt><dd>${money(values.ctv)}</dd></div><div><dt>${t('pre.availablePlayers')}</dt><dd>${preview.roster.players.filter(player => !player.skipNextGame).length} / ${preview.roster.players.length}</dd></div></dl>
    <form class="pre-team-panel" data-post-form="next"><fieldset ${readonly ? 'disabled' : ''}><label class="filter-field"><span>${t('roster.captain')}</span><select name="captain" ${options.length ? 'required' : ''}><option value="">${t('post.choosePlayer')}</option>${options.map(player => `<option value="${safe(player.id)}" ${selected === player.id ? 'selected' : ''}>${safe(player.number)} · ${safe(player.name)}</option>`).join('')}</select></label>
    <p>${t('post.nextReminder')}</p>${!readonly ? `<button type="submit" class="primary-button">${t('post.readyNext')}</button>` : ''}</fieldset></form>`;
}

export function renderPostReview(payload, name, readonly) {
  const post = payload.postMatch;
  return `<h2>${t('post.review')}</h2><p>${t('post.reviewIntro')}</p><p>${t('post.mode.' + post.result.mode)} · ${post.result.home.touchdowns} : ${post.result.away.touchdowns}</p><div class="pre-two-teams">${['home', 'away'].map(key => {
    const side = post[key], preview = previewPost(payload, key);
    return `<section class="pre-team-panel"><h3>${safe(side.team.name)}</h3><dl class="summary-stat-grid"><dt>${t('savedRoster.treasury')}</dt><dd>${money(side.baseRoster.treasury)} → ${money(preview.roster.treasury)}</dd><dt>${t('post.safe')}</dt><dd>${money(side.baseRoster.coachesSafe)} → ${money(preview.roster.coachesSafe)}</dd><dt>${t('post.fans')}</dt><dd>${side.baseRoster.dedicatedFans} → ${preview.roster.dedicatedFans}</dd><dt>${t('post.keptPlayers')}</dt><dd>${side.baseRoster.players.length} → ${preview.roster.players.length}</dd></dl>${renderReviewDetails(post, key, preview)}<p>${t(side.confirmed ? 'pre.confirmed' : 'pre.notConfirmed')}</p></section>`;
  }).join('')}</div><div class="pre-inline-actions">${!readonly ? postButton('post.confirm', 'confirm') : ''}${post.status === 'ready' ? postButton('post.finish', 'finish') : ''}</div>${post.status === 'completed' ? `<p class="notice-box">${t('post.completed')}</p>` : ''}`;
}
