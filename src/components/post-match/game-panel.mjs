import { t } from '../../core/i18n.mjs';
import { postMatchUrl } from '../../core/routes.mjs';

export function renderGamePostMatchPanel(game) {
  if (game.preparationStatus !== 'in_progress' || !game.home || !game.away) return '';
  const completed = game.postMatchStatus === 'completed';
  return `<section class="pre-game-panel post-game-panel"><div class="pre-section-head"><div><span class="matchday-eyebrow">${t('roster.sevensLabel')}</span><h2>${t('post.title')}</h2></div><a class="primary-button" href="${postMatchUrl(game, completed ? 'review' : '')}">${t(completed ? 'post.viewCompleted' : 'post.open')}</a></div><p>${t(completed ? 'post.completed' : 'post.entryIntro')}</p></section>`;
}
