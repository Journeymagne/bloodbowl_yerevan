/** Getting Even is an acquired trait, independent of SPP and advancements. */
const EXCLUDED = new Set(['Big Guy', 'Blitzer', 'Blocker', 'Catcher', 'Lineman', 'Runner', 'Special', 'Thrower']);
export const gettingEvenEligible = (injury, gamesPlayed) => Number(gamesPlayed) >= 3 && ['miss', 'niggling', 'lasting'].includes(injury?.code);

export function hatredKeywords(player) {
  const tags = player?.keywords ?? player?.row?.tags ?? [];
  return [...new Set((Array.isArray(tags) ? tags : []).filter(tag => typeof tag === 'string').map(tag => tag.trim()).filter(tag => tag && !EXCLUDED.has(tag)))];
}

export const sameCasualty = (left, right) => Boolean(left && right) && left.code === right.code && (left.stat || '') === (right.stat || '');

/** The actual event, not just its casualty value: an undo removes its associated award too. */
export function currentInjuryEvents(events = []) {
  const stacks = new Map();
  for (const event of events) {
    if (event.counter !== 'injury' || !event.injury) continue;
    const stack = stacks.get(event.playerId) ?? [];
    if (event.delta === 1) stack.push(event);
    else if (event.delta === -1) {
      const index = stack.findLastIndex(item => sameCasualty(item.injury, event.injury));
      if (index >= 0) stack.splice(index, 1);
    }
    stacks.set(event.playerId, stack);
  }
  return Object.fromEntries([...stacks].filter(([, stack]) => stack.length).map(([id, stack]) => [id, stack.at(-1)]));
}

export function gettingEvenStatus(decision) {
  if (!Number.isInteger(decision?.roll) || decision.roll < 1 || decision.roll > 6) return 'pending';
  if (decision.roll < 4) return 'failed';
  return decision.keyword && decision.attacker?.keywords?.includes(decision.keyword) && !EXCLUDED.has(decision.keyword) ? 'earned' : 'pending';
}

/** Keep provenance even when another source grants the same Hatred; display deduplicates names. */
export function normalizeAcquiredHatreds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(item => item && typeof item.id === 'string' && !seen.has(item.id) && seen.add(item.id)
    && typeof item.keyword === 'string' && item.keyword.trim() && !EXCLUDED.has(item.keyword.trim()))
    .map(item => ({ id: item.id, keyword: item.keyword.trim(), pairingId: String(item.pairingId || ''),
      injuryEventId: String(item.injuryEventId || ''), roll: Number(item.roll) || null,
      injury: item.injury?.code ? { code: item.injury.code, ...(item.injury.code === 'lasting' ? { stat: item.injury.stat } : {}) } : null,
      source: item.source === 'site' ? 'site' : 'table',
      attacker: item.attacker ? { side: item.attacker.side, playerId: String(item.attacker.playerId || ''),
        name: String(item.attacker.name || ''), teamName: String(item.attacker.teamName || '') } : null }));
}

export function applyGettingEven(player, side, pairingId) {
  const decision = side.gettingEven?.[player.id];
  if (!gettingEvenEligible(side.injuries?.[player.id], side.gamesPlayed)
    || !sameCasualty(decision?.injury, side.injuries?.[player.id]) || gettingEvenStatus(decision) !== 'earned') return;
  const acquired = normalizeAcquiredHatreds(player.acquiredHatreds);
  if (!acquired.some(item => item.id === decision.id)) acquired.push(...normalizeAcquiredHatreds([{ ...decision, pairingId }]));
  player.acquiredHatreds = acquired;
}

