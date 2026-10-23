/** Connect row gestures to the existing revision-aware save queue. */
import { toast } from "../../../components/toast.mjs";
import { t } from "../../../core/i18n.mjs";
import { wireRosterReorder } from "../../../ui/roster-reorder.mjs";
import { isPhone, linesOf, lockOf, modeOf } from "./screen.mjs";
import { reorderPlayers, saveState } from "./save.mjs";

/** Remap even legacy duplicate display keys without changing player IDs or session SPP. */
function keepSelection(memory, before, after, indices, baseline, selected) {
  const slots = [...indices].sort((a, b) => a - b);
  const moved = new Map(indices.map((old, at) => [old, slots[at]]));
  for (const line of before) {
    const key = after.find((item) => item.index === (moved.get(line.index) ?? line.index))?.key;
    if (!key) continue;
    if (line.key === selected) memory.selected = key;
    for (const suffix of ["", " outside"]) {
      if (baseline.has(line.key + suffix)) memory.baseline.set(key + suffix, baseline.get(line.key + suffix));
    }
  }
}

export function wireRosterOrder(root, { teamId, visit, memory, draw }) {
  const closed = () => {
    const mode = modeOf(teamId);
    return !visit.here || visit.sheet ? "closed" : mode.kind === "match" ? t("teamPlayer.edit.closed") : lockOf(teamId, saveState(teamId), visit, mode);
  };
  return wireRosterReorder(root, {
    canStart: () => !closed(),
    onReorder: (rows) => {
      const before = linesOf(visit, modeOf(teamId)).lines;
      // A read or another action during the gesture must never reorder different players.
      if (rows.some(({ key, index }) => !before.some((line) => line.key === key && line.index === index))) return;
      const indices = rows.map(({ index }) => index);
      if (indices.every((index, at) => at === 0 || index > indices[at - 1]) && !closed()) {
        memory.sort = null;
        draw();
        return;
      }
      const baseline = new Map(memory.baseline);
      const selected = memory.selected ?? (isPhone() ? null : root.querySelector("[data-panel-player]")?.getAttribute("data-panel-player"));
      const result = reorderPlayers(teamId, indices, { closed });
      if (result.refusal) toast(result.refusal, { tone: "error" });
      if (!result.ok) return;
      memory.sort = null;
      keepSelection(memory, before, linesOf(visit, modeOf(teamId)).lines, indices, baseline, selected);
      draw();
    },
  });
}
