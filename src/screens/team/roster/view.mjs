/**
 * The roster's markup: the band with its counts, the table, and beside it on a desk the chosen player's panel;
 * the skill's sheet over it when one is open. What a line says is model.mjs's, the row's panel and the side
 * panel panel.mjs's, the sheet sheets.mjs's.
 *
 * The player's button does what the width it is drawn at does with it (R11): up to 900px it opens his row
 * (`aria-expanded`, and the row's panel it controls), from 901px it chooses him for the panel beside the table
 * (`aria-controls` names the panel, `aria-current` marks the one in it). The screen draws again when the width
 * crosses 900px.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderCallout } from "../../../ui/callout.mjs";
import { dataAttributes } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderPageHead } from "../../../ui/page-head.mjs";
import { renderRosterTable } from "../../../ui/roster-table.mjs";
import { MAIN_COUNTERS, rosterCounts } from "./model.mjs";
import { rowPanelMarkup, sidePanelMarkup, skillChipsMarkup } from "./panel.mjs";
import { skillSheetMarkup } from "./sheets.mjs";

/** The id of the panel beside the table, which a desk's player buttons control. */
export const ASIDE_ID = "roster-aside";

/**
 * @typedef {object} RosterScreen
 * @property {object|null} team the team as last read: id, name, baseTeamSlug; null before the first answer
 * @property {object|null} race its page in the reference
 * @property {object} data the reference (state.data): the skills' pages
 * @property {import("./model.mjs").PlayerLine[]} lines in the order of `memory.sort`
 * @property {{kind: "plain"|"prep"|"match", game?: object, round?: number|null}} mode
 * @property {{sort: object|null, selected: string|null, outside: boolean}} memory
 * @property {{kind: "skill", key: string, name: string}|null} sheet the sheet that is open
 * @property {string} error a read that failed, "" when none
 * @property {boolean} loading the roster has not been read yet (or is read again after a failure)
 * @property {boolean} phone the width the screen is drawn at is a phone's (`(max-width: 900px)`)
 */

/** The table's columns: the player, the five characteristics, and on a desk the career and the SPP. */
function columnsOf() {
  return [
    { key: "player", label: t("teamRoster.column.player") },
    ...PLAYER_STATS.map((stat) => ({ key: stat, label: t(`stats.${stat}`), group: "stats" })),
    ...MAIN_COUNTERS.map((counter) => ({ key: counter, label: t(`teamRoster.counter.${counter}`), name: t(`teamRoster.counterName.${counter}`), group: "career", desk: true })),
    { key: "earned", label: t("teamRoster.column.earned"), group: "spp", desk: true },
    { key: "available", label: t("teamRoster.column.available"), name: t("teamRoster.available"), group: "spp", desk: true },
  ];
}

/** The over-heads from 901px: «Characteristics», «Career», «SPP». */
function groupsOf() {
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

function cellsOf(line) {
  return [
    ...PLAYER_STATS.map((stat) => statCell(line.stats[stat])),
    ...MAIN_COUNTERS.map((counter) => countCell(line.career[counter] ?? 0)),
    { text: String(line.earned) },
    { text: String(line.available), tone: "strong" },
  ];
}

/**
 * Whose row is open (a phone) and who stands in the panel (a desk): the player the coach chose while he is
 * still on the roster; on a desk the table's first when there is none.
 */
function choiceOf({ lines, memory }) {
  const open = lines.some((line) => line.key === memory.selected) ? memory.selected : null;
  return { open, chosen: open ?? lines[0]?.key ?? null };
}

/** A player's row: the open row's panel on a phone, the mark of the panel's player on a desk. */
function rowOf(line, screen, choice) {
  const row = {
    key: line.key,
    badgeHtml: renderPlayerBadge({ number: line.number, kind: line.kind, captain: line.captain }),
    name: line.name,
    sub: line.skip ? t("teamRoster.skip") : line.position,
    alert: line.skip,
    cells: cellsOf(line),
    skillsHtml: skillChipsMarkup(line),
  };
  if (!screen.phone) return { ...row, selected: choice.chosen === line.key, controls: ASIDE_ID };
  const expanded = choice.open === line.key;
  return { ...row, expanded, panelHtml: expanded ? rowPanelMarkup(line, screen) : "" };
}

/** The table and the panel beside it; a roster with nobody on it says so instead. */
function layoutMarkup(screen) {
  const { lines, team } = screen;
  const choice = choiceOf(screen);
  const heading = `<div class="g-roster__bar"><h2 class="g-roster__heading" id="roster-heading">${escapeHtml(t("teamRoster.heading"))} `
    + `<span class="g-roster__count">${escapeHtml(lines.length)}</span></h2></div>`;
  const table = lines.length
    ? renderRosterTable({ label: t("teamRoster.tableLabel", { team: team.name }), columns: columnsOf(), groups: groupsOf(), rows: lines.map((line) => rowOf(line, screen, choice)), sort: screen.memory.sort })
    : `<p class="g-roster__empty">${escapeHtml(t("teamRoster.empty"))}</p>`;
  const chosen = lines.find((line) => line.key === choice.chosen);
  const aside = chosen
    ? `<aside class="g-roster__aside" id="${ASIDE_ID}" aria-label="${escapeHtml(t("teamRoster.panelLabel"))}"${dataAttributes({ panelPlayer: chosen.key })}>${sidePanelMarkup(chosen, screen)}</aside>`
    : "";
  return `<div class="g-roster__layout"><section class="g-roster__main" aria-labelledby="roster-heading">${heading}${table}</section>${aside}</div>`;
}

/** A fault in place of the table, in a danger callout; a read that failed offers to read again. */
function failedMarkup(title, { retry = false } = {}) {
  const actionHtml = retry ? renderButton({ label: t("teamRoster.readAgain"), data: { rosterRetry: true } }) : "";
  return `<div class="g-roster__failed" role="alert">${renderCallout({ tone: "danger", title, actionHtml })}</div>`;
}

/** What stands under the band: the wait, the failure, a race the reference does not know, or the roster. */
function bodyMarkup(screen) {
  if (screen.loading) return `<p class="g-roster__loading" role="status">${escapeHtml(t("teamRoster.loading"))}</p>`;
  if (screen.error) return failedMarkup(screen.error, { retry: true });
  if (!screen.race) return failedMarkup(t("teamRoster.noRace", { slug: screen.team.baseTeamSlug }));
  return layoutMarkup(screen);
}

/** The skill's sheet, while its player is still on the roster. */
function sheetMarkup(screen) {
  const line = screen.sheet && screen.race ? screen.lines.find((item) => item.key === screen.sheet.key) : null;
  return line ? skillSheetMarkup({ data: screen.data, line, name: screen.sheet.name }) : "";
}

/** @param {RosterScreen} screen */
export function rosterMarkup(screen) {
  const drawn = !screen.loading && !screen.error && screen.race;
  const head = renderPageHead({ title: t("shell.tab.roster"), sub: drawn ? t("teamRoster.counts", rosterCounts(screen.lines)) : "" });
  return `<div class="g-roster" data-screen="team-roster">${head}${bodyMarkup(screen)}${sheetMarkup(screen)}</div>`;
}
