import { escapeHtml, listenerGroup } from '../../core/dom.mjs';
import { t } from '../../core/i18n.mjs';
import { playerRemoval, removeLeaguePlayer } from '../../domain/roster/transfers.mjs';
import { toast } from '../toast.mjs';

export function renderPlayerRemoval(team, draft, player) {
  const action = playerRemoval(team, draft, player);
  return `<button type="button" class="filter-button danger-action" data-remove-saved-player="${escapeHtml(player.id)}"
    data-player-removal="${action.type}" ${action.blocked ? 'aria-disabled="true"' : ''}
    title="${escapeHtml(t(action.blocked ? 'validation.PLAYER_SALE_MIN' : action.type === 'cancel-purchase' ? 'savedRoster.cancelPurchaseNotice' : 'savedRoster.saleNotice'))}">
    ${t(action.type === 'cancel-purchase' ? 'savedRoster.cancelPurchase' : 'post.sell')} · ${action.amount}k</button>`;
}

export function wirePlayerTransfers(root, { team, draft, onChange }) {
  const events = listenerGroup(root);
  events.on('click', '[data-remove-saved-player]', (event, button) => {
    const result = removeLeaguePlayer(team, draft, button.dataset.removeSavedPlayer, button.dataset.playerRemoval);
    if (!result.applied) { toast(t('validation.' + result.reason), { tone: 'error' }); return; }
    onChange();
  });
  return () => events.release();
}
