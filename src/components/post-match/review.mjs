import { t } from '../../core/i18n.mjs';
import { effectiveInjury } from '../../domain/post-match/rules.mjs';
import { earnedSpp } from '../../domain/post-match/statistics.mjs';
import { playerAvailableSpp } from '../../domain/roster/progression.mjs';
import { safe, money } from './shared.mjs';
import { renderPostAccounting } from './finance.mjs';

function playerChanges(post, name, preview) {
  const side = post[name];
  const changed = side.snapshot.players.filter(player => earnedSpp(post, name, player.id)
    || effectiveInjury(side, player.id).code !== 'none' || side.advancements[player.id]?.length || side.departures[player.id]);
  return changed.map(original => {
    const player = preview.players.find(item => item.id === original.id), injury = effectiveInjury(side, original.id);
    const advances = (side.advancements[original.id] || []).map(item => item.grant.stat ? t('stats.' + item.grant.stat) : item.grant.skill);
    return `<li><strong>${safe(original.name)}</strong><span>${t('post.earnedSpp')}: ${earnedSpp(post, name, original.id)}${player ? ' · ' + playerAvailableSpp(side.reference, player) + ' ' + t('roster.sppAvailable') : ''}</span>
      ${injury.code !== 'none' ? `<span>${t('post.injury.' + injury.code)}${injury.code === 'lasting' ? ' · ' + t('stats.' + injury.stat) : ''}${injury.retire ? ' · ' + t('post.retired') : ''}</span>` : ''}
      ${advances.length ? `<span>${t('post.advance')}: ${advances.map(safe).join(', ')}</span>` : ''}
      ${side.departures[original.id] ? `<span>${t('post.departureRoll', { roll: side.departures[original.id], outcome: t(side.departures[original.id] < 4 ? 'post.departed' : 'post.stayed') })}</span>` : ''}</li>`;
  }).join('') || `<li>${t('post.noPlayerChanges')}</li>`;
}

function rosterChanges(side) {
  return side.operations.map(operation => {
    const player = side.baseRoster.players.find(item => item.id === operation.playerId)
      || side.snapshot.players.find(item => item.id === operation.playerId);
    const label = operation.type === 'staff' ? t('savedRoster.' + operation.key) + ' ' + (operation.delta > 0 ? '+1' : '−1')
      : t('post.' + (operation.type === 'keep' ? 'keepJourneyman' : operation.type)) + ' · '
        + (player?.name || side.reference.team.roster[operation.rowIndex]?.position || '');
    return `<li>${safe(label)}</li>`;
  }).join('') || `<li>${t('post.noRosterChanges')}</li>`;
}

export function renderReviewDetails(post, name, preview) {
  const side = post[name];
  const mvps = side.mvps.map(id => side.snapshot.players.find(player => player.id === id)?.name || '').map(safe);
  return `<div class="post-review-details"><h4>${t('post.mvp')}</h4><p>${mvps.length ? mvps.join(', ') : t('post.noMvp')}</p>
    <h4>${t('post.players')}</h4><ul class="post-review-list">${playerChanges(post, name, preview)}</ul>
    <h4>${t('post.roster')}</h4><ul class="post-review-list">${rosterChanges(side)}</ul>
    ${renderPostAccounting(preview)}<h4>${t('post.mistakes')}</h4><p>${t('post.mistake.' + preview.finance.kind)} · ${t('post.moneyLost')}: ${money(preview.finance.loss)}</p></div>`;
}
