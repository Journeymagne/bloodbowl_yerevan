import { t } from '../../core/i18n.mjs';
import { state } from '../../core/state.mjs';
import { playerCard } from '../pre-match/shared.mjs';
import { playerProfile } from '../../domain/match/roster.mjs';
import { earnedSpp } from '../../domain/post-match/statistics.mjs';
import { POST_STATS, INJURIES, mvpCount, effectiveInjury } from '../../domain/post-match/rules.mjs';
import { playerAvailableSpp, canTakeAdvancement, advancementGrantOptions } from '../../domain/roster/progression.mjs';
import { favouredSkillsForChoice } from '../../domain/roster/team-rules.mjs';
import { safe, postButton } from './shared.mjs';

function statisticCard(payload, name, original, preview, readonly) {
  const post = payload.postMatch, side = post[name], player = preview.players.find(item => item.id === original.id);
  const profile = player ? playerProfile({ ...player, row: side.reference.team.roster[player.rowIndex] }) : original;
  const earned = earnedSpp(post, name, original.id), injury = side.injuries[original.id] || { code: 'none' };
  const canAdvance = player && original.kind !== 'star' && effectiveInjury(side, original.id).code !== 'dead'
    && ['random', 'primary', 'secondary', 'stat'].some(type => canTakeAdvancement(side.reference, player, type).allowed);
  return `<div class="post-player" data-post-player="${safe(original.id)}">${playerCard(profile)}
    <fieldset class="post-statistics" ${readonly ? 'disabled' : ''}><div class="post-counter-grid">${POST_STATS.map(key => `<label class="filter-field"><span>${t('post.stat.' + key)}</span><input type="number" min="0" max="99" step="1" data-post-counter="${key}" value="${side.statistics[original.id]?.[key] || 0}" inputmode="numeric" required></label>`).join('')}</div>
    ${original.kind !== 'star' ? `<div class="post-injury-fields"><label class="filter-field"><span>${t('post.injury')}</span><select data-post-injury>${INJURIES.map(code => `<option value="${code}" ${injury.code === code ? 'selected' : ''}>${t('post.injury.' + code)}</option>`).join('')}</select></label>
    <label class="filter-field"><span>${t('post.injuredStat')}</span><select data-post-injury-stat>${['ma', 'st', 'ag', 'pa', 'ar'].map(stat => `<option value="${stat}" ${injury.stat === stat ? 'selected' : ''}>${t('stats.' + stat)}</option>`).join('')}</select></label><label class="post-check"><input type="checkbox" data-post-retire ${injury.retire ? 'checked' : ''}>${t('post.retire')}</label></div>` : ''}</fieldset>
    <div class="post-player-actions"><strong>${t('post.earnedSpp')}: ${earned}</strong>${player ? `<span>${playerAvailableSpp(side.reference, player)} ${t('roster.sppAvailable')}</span>` : ''}
    ${!readonly ? `<button class="filter-button" type="button" data-post-advance="${safe(original.id)}" ${!canAdvance ? 'disabled' : ''}>${t('post.advance')}</button>` : ''}
    ${!readonly && side.advancements[original.id]?.length ? `<button class="filter-button" type="button" data-post-undo-advance="${safe(original.id)}">${t('post.undoAdvancement')}</button>` : ''}</div></div>`;
}

export function renderPostPlayers(payload, name, preview, readonly) {
  const post = payload.postMatch, side = post[name], eligible = side.snapshot.players.filter(player => player.kind !== 'star' && effectiveInjury(side, player.id).code !== 'dead');
  const count = mvpCount(post, name);
  return `<h2>${t('post.players')}</h2><p class="pre-intro">${t('post.playersIntro')}</p><p class="notice-box">${t('post.optionalAdvancement')}</p>
    ${side.gamesPlayed < 3 ? `<p class="notice-box">${t('post.rookieProtection', { number: side.gamesPlayed + 1 })}</p>` : ''}
    <form data-post-form="statistics"><fieldset ${readonly ? 'disabled' : ''}><div class="post-mvp-panel"><h3>${t('post.mvp')}</h3><p>${t('post.manualMvp')}</p>
    ${Array.from({ length: count }, (_, index) => `<label class="filter-field"><span>${t('post.mvpRecipient', { number: index + 1 })}</span><select data-post-mvp required><option value="">${t('post.choosePlayer')}</option>${eligible.map(player => `<option value="${safe(player.id)}" ${side.mvps[index] === player.id ? 'selected' : ''}>${safe(player.number)} · ${safe(player.name)}</option>`).join('')}</select></label>`).join('')}${!count ? `<p>${t('post.noMvp')}</p>` : ''}
    ${post.result.mode === 'conceded' && post.result.winner !== name ? `<p>${t('post.departureNotice')}</p>${side.baseRoster.players.filter(player => player.advancements.length >= 3).map(player => `<label class="filter-field"><span>${safe(player.name)} · D6</span><input type="number" min="1" max="6" required data-post-departure="${safe(player.id)}" value="${side.departures[player.id] || ''}"></label>`).join('')}` : ''}</div></fieldset>
    <div class="post-player-grid">${side.snapshot.players.map(player => statisticCard(payload, name, player, preview, readonly)).join('')}</div>
    ${!readonly ? `<div class="post-save-bar"><button type="submit" class="primary-button">${t('post.saveStatistics')}</button>${postButton('post.continueWithoutAdvancement', 'lock-players')}</div>` : ''}</form>`;
}

export function renderAdvancementDialog(payload, name, preview, ui) {
  if (!ui.advanceId) return '';
  const side = payload.postMatch[name], player = preview.players.find(item => item.id === ui.advanceId);
  if (!player) return '';
  const row = side.reference.team.roster[player.rowIndex], type = ui.advanceType || 'primary';
  const options = advancementGrantOptions(row, player, type, state.data.skillGroups);
  const extra = type === 'stat' ? ['primary', 'secondary'].flatMap(access => advancementGrantOptions(row, player, access, state.data.skillGroups).options) : [];
  const available = canTakeAdvancement(side.reference, player, type), favoured = side.baseRoster.favouredChoice;
  return `<dialog class="matchday-hire-dialog" data-post-dialog aria-labelledby="post-advance-title"><header><div><span class="matchday-eyebrow">${safe(player.name)}</span><h2 id="post-advance-title">${t('post.advance')}</h2><p>${t('post.offlineRolls')}</p></div>${postButton('common.close', 'close-dialog', false, 'filter-button')}</header>
    <form class="post-advance-form" data-post-form="advance"><input type="hidden" name="playerId" value="${safe(player.id)}"><label class="filter-field"><span>${t('post.advancementType')}</span><select name="advancementType" data-post-advance-type>${['random', 'primary', 'secondary', 'stat'].map(value => `<option value="${value}" ${value === type ? 'selected' : ''} ${!canTakeAdvancement(side.reference, player, value).allowed ? 'disabled' : ''}>${t('post.advancement.' + value)} · ${canTakeAdvancement(side.reference, player, value).cost} SPP</option>`).join('')}</select></label>
    <label class="filter-field"><span>${t('post.advancementGrant')}</span><select name="grant" required>${[...options.options, ...extra].map(option => `<option value="${safe(option.stat ? 'stat:' + option.stat : 'skill:' + option.skill)}">${safe(option.stat ? t('stats.' + option.stat) : option.skill)}</option>`).join('')}</select></label>
    ${favoured ? `<div class="notice-box"><strong>${safe(favoured)}</strong><label class="filter-field"><span>${t('post.favouredRoll')}</span><input name="favouredRoll" type="number" min="1" max="8" required inputmode="numeric"></label><label class="filter-field"><span>${t('post.favouredSkill')}</span><select name="favouredSkill"><option value="">${t('post.noBonus')}</option>${favouredSkillsForChoice(favoured).map(skill => `<option>${safe(skill)}</option>`).join('')}</select></label></div>` : ''}
    <p>${t('post.advancementCost', { cost: available.cost, available: available.available })}</p><button type="submit" class="primary-button" ${!available.allowed || !options.options.length ? 'disabled' : ''}>${t('post.takeAdvancement')}</button></form></dialog>`;
}
