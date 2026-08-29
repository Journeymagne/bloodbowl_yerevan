/**
 * Who plays whom in the next Swiss round.
 *
 * Step 14.5. The old pass was greedy: take the top of the standings, take the
 * first opponent they had not met, and when there was none, take the first
 * opponent at all. Greedy is not just imperfect here, it is wrong — it can
 * report a rematch as unavoidable when a rematch-free pairing existed. With
 * four coaches where the top two have met, it pairs 1-2 (rematch) and 3-4,
 * where 1-3 and 2-4 would have been clean.
 *
 * So this searches instead: pair the highest unpaired coach against the
 * nearest opponent in the standings they have not met, and if the rest cannot
 * then be paired, back up and take the next candidate. Swiss wants opponents
 * of similar standing, and trying candidates nearest-first keeps that.
 *
 * The search is bounded. A round with no rematch-free pairing at all — late in
 * a small league, everybody has played everybody — would otherwise walk the
 * whole tree to prove it. When the budget runs out, or when no clean pairing
 * exists, the caller is told how many rematches it is getting rather than
 * finding out from a coach.
 */

/**
 * @param {Array<{id: string}>} queue entries in standings order, even length
 * @param {Map<string, Set<string>>} opponents who each entry has already played
 * @param {{budget?: number}} [options] how many candidate pairs to try
 * @returns {{pairs: Array<[object, object]>, rematches: number, exhaustive: boolean}}
 *   `exhaustive` is false when the budget stopped the search, so "no clean
 *   pairing" means "none found" rather than "none exists".
 */
export function pairRound(queue, opponents, { budget = 50_000 } = {}) {
  const clean = search(queue, opponents, budget);
  if (clean.pairs) return { pairs: clean.pairs, rematches: 0, exhaustive: clean.exhaustive };

  // Nobody can be paired without a repeat. Fall back to standings order, which
  // at least keeps the pairing consistent, and count what it costs.
  const pairs = [];
  let rematches = 0;
  for (let index = 0; index < queue.length; index += 2) {
    const [home, away] = [queue[index], queue[index + 1]];
    pairs.push([home, away]);
    if (opponents.get(home.id)?.has(away.id)) rematches += 1;
  }
  return { pairs, rematches, exhaustive: clean.exhaustive };
}

/** Depth-first over pairings, nearest opponent first, with a node budget. */
function search(queue, opponents, budget) {
  let spent = 0;

  const recurse = (remaining) => {
    if (remaining.length === 0) return [];
    const [home, ...rest] = remaining;
    const met = opponents.get(home.id);
    for (let index = 0; index < rest.length; index += 1) {
      const away = rest[index];
      if (met?.has(away.id)) continue;
      spent += 1;
      if (spent > budget) return null;
      const tail = recurse([...rest.slice(0, index), ...rest.slice(index + 1)]);
      if (tail) return [[home, away], ...tail];
    }
    return null;
  };

  const pairs = recurse(queue);
  return { pairs, exhaustive: spent <= budget };
}

/**
 * Which entry sits out an odd round: the lowest-placed coach who has not had a
 * bye yet, and if everybody has, the lowest-placed of all. Unchanged in
 * behaviour from where this used to live inline — only moved and named.
 *
 * @returns {{bye: object|null, rest: Array<object>}}
 */
export function takeByeEntry(queue, byes) {
  if (queue.length % 2 === 0) return { bye: null, rest: queue };
  let byeIndex = -1;
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    if (!byes.has(queue[index].id)) {
      byeIndex = index;
      break;
    }
  }
  if (byeIndex === -1) byeIndex = queue.length - 1;
  const rest = [...queue];
  const [bye] = rest.splice(byeIndex, 1);
  return { bye, rest };
}
