/**
 * What the roster's table shows of a player, for any screen that draws it (ui/roster-table.mjs): the columns — the
 * player, the five characteristics, and on a desk the career and the SPP — their over-heads, and a line's cells. The
 * coach's own Roster draws them (view.mjs), and so does another coach's team page, with rows to read only.
 */
import { t } from "../../../core/i18n.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { MAIN_COUNTERS } from "./model.mjs";

/** The table's columns: the player, the five characteristics, and on a desk the career and the SPP. */
export function rosterColumns() {
  return [
    { key: "player", label: t("teamRoster.column.player") },
    ...PLAYER_STATS.map((stat) => ({ key: stat, label: t(`stats.${stat}`), group: "stats" })),
    ...MAIN_COUNTERS.map((counter) => ({ key: counter, label: t(`teamRoster.counter.${counter}`), name: t(`teamRoster.counterName.${counter}`), group: "career", desk: true })),
    { key: "earned", label: t("teamRoster.column.earned"), group: "spp", desk: true },
    { key: "available", label: t("teamRoster.column.available"), name: t("teamRoster.available"), group: "spp", desk: true },
  ];
}

/** The over-heads from 901px: «Characteristics», «Career», «SPP». */
export function rosterGroups() {
  return [
    { label: t("teamRoster.group.stats"), span: PLAYER_STATS.length },
    { label: t("teamRoster.group.career"), span: MAIN_COUNTERS.length },
    { label: t("teamRoster.group.spp"), span: 2 },
  ];
}

/** A characteristic: as the model writes it, a change tinted and said in words. */
function statCell({ text, change }) {
  const note = change === "up" ? t("ui.stat.improved") : change === "down" ? t("ui.stat.lowered") : "";
  return { text, tone: change, note };
}

/** A count: quiet at zero. */
const countCell = (count) => ({ text: String(count), tone: count === 0 ? "zero" : "" });

/**
 * A line's cells; in a match each count of the career says what the match has added to it («+1»). What he may
 * spend is green when it buys an advancement — he plays, and has the cheapest one's SPP — and quiet when it does not
 * (DeskRoster.html).
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{mode: {kind: string}}} screen
 */
export function rosterCells(line, { mode }) {
  const added = (counter) => (mode.kind === "match" ? line.match[counter] : 0);
  const buys = line.ready && !line.skip && !line.fallen;
  return [
    ...PLAYER_STATS.map((stat) => statCell(line.stats[stat])),
    ...MAIN_COUNTERS.map((counter) => ({ ...countCell(line.career[counter] ?? 0), delta: added(counter) })),
    { text: String(line.earned) },
    { text: String(line.available), tone: buys ? "strong" : "quiet" },
  ];
}
