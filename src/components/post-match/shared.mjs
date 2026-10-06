import { t } from '../../core/i18n.mjs';
import { safe, money } from '../pre-match/shared.mjs';
import { projectPostRoster } from '../../domain/post-match/roster.mjs';
import { createMatchSide, calculateMatchCtv } from '../../domain/match/roster.mjs';
import { state } from '../../core/state.mjs';
import { renderChecklistSummary } from "../games/checklist-layout.mjs";
import { earnedSpp } from '../../domain/post-match/statistics.mjs';

export { safe, money };

export function postButton(key, action, blocked = false, style = 'primary-button') {
  return `<button type="button" class="${style}" data-post-action="${action}" ${blocked ? 'disabled' : ''}>${t(key)}</button>`;
}

export function numberField(name, label, value, maximum = 99, minimum = 0) {
  return `<label class="filter-field"><span>${safe(label)}</span><input name="${name}" type="number" min="${minimum}" max="${maximum}" step="1" value="${value ?? ''}" required inputmode="numeric"></label>`;
}

export function previewPost(payload, name) {
  try { return projectPostRoster(payload.postMatch, name, state.data); }
  catch (error) {
    const copy = structuredClone(payload.postMatch);
    copy[name].operations = []; copy[name].deposit = 0; copy[name].mistake = {};
    const result = projectPostRoster(copy, name, state.data);
    result.invalid = error.code;
    return result;
  }
}

export function postValues(payload, name, roster) {
  const side = payload.postMatch[name];
  const matchSide = createMatchSide({ user: side.user, team: { ...side.team, roster } }, state.data);
  return { ctv: calculateMatchCtv(matchSide).total,
    tv: calculateMatchCtv({ ...matchSide, players: matchSide.players.map(player => ({ ...player, skipNextGame: false })) }).total };
}

export function postSummary(payload, name, preview) {
  const post = payload.postMatch, side = post[name], values = postValues(payload, name, preview.roster);
  const spp = side.snapshot.players.reduce((sum, player) => sum + earnedSpp(post, name, player.id), 0);
  return renderChecklistSummary({ title: "post.summary", teamName: side.team.name,
    values: [["post.winnings", money(preview.winnings)], ["savedRoster.treasury", `${money(side.baseRoster.treasury)} → ${money(preview.roster.treasury)}`],
      ["post.safe", money(preview.roster.coachesSafe)], ["post.fans", `${side.baseRoster.dedicatedFans} → ${preview.roster.dedicatedFans}`],
      ["post.earnedSpp", spp], ["pre.availablePlayers", `${preview.roster.players.filter(player => !player.skipNextGame).length} / ${preview.roster.players.length}`],
      ["post.tv", money(values.tv)], ["pre.ctv", money(values.ctv)]],
    noteHtml: t("post.draftNotice"), sides: [post.home, post.away] });

}
