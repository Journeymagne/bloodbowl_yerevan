/**
 * A player's own page on a phone (spec UI §12; Player.html): a screen of its own, drilled into from the roster — no
 * header of the shell and no tabs, his dark head with «‹ Roster» back where the roster was left (owner, 2026-10-19) —
 * his characteristics, his SPP and the way to his next advancement, his skills with where each came from, the
 * categories he may take them from, his career by match (career.mjs) and his injuries. It is the roster's player mode
 * (`renderTeamRoster(teamId, { playerId })`): the same visit, reads, locks and save queue, so whatever it writes is a
 * step of that queue. On a desk the address is the roster with him in the panel; the page is drawn up to 900px.
 *
 * Every state of the address stands under the head: the wait and a read that failed under «‹ Roster» alone, a fallen
 * player under his grey number (PlayerDead.html) with the roster's undo (stage 07b), an id the roster holds nowhere
 * with the way back. The pencil and «Advancement» are buttons that name him: the pencil opens his edit, a sheet over
 * the page (player-sheets.mjs, Task 8), which leads to his fix by hand and its undo of his last advancement (fix.mjs;
 * owner, 2026-10-20: Player.html has no undo); «Advancement» his advancement (Task 9). Closed, each says why, as the
 * roster's closed controls do.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { teamUrl } from "../../../core/routes.mjs";
import { raceTitleOf } from "../../../data/teams.mjs";
import { advancementRanks } from "../../../domain/league-rules.mjs";
import { icon } from "../../../ui/icons.mjs";
import { dataAttributes } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderProgressDots } from "../../../ui/progress-dots.mjs";
import { careerMarkup } from "./career.mjs";
import { fallenName, fallenProfileMarkup, fallenWho, undoMarkup } from "./fallen-view.mjs";
import { undoable } from "./model.mjs";
import { injuriesMarkup, markClosed, skillChipsMarkup, skillSourceOf, statsMarkup } from "./panel.mjs";
import { advanceClosed, advanceHintOf, closedAdvanceMarkup, closedMarkup, editClosed } from "./player-access.mjs";
import { failedMarkup, goneMarkup, prepMarkup, saveNoticeMarkup, sheetMarkup, statusMarkup } from "./view.mjs";

/**
 * The player's dark head (Player.html's block, owner's answer 1): «‹ Roster» on top, where the prototype has the team
 * switcher, then his number, his name — the page's `h1` — the line under it and the pencil. With no name yet (the wait,
 * a read that failed, an id the roster does not hold) only the way back, and the page's `h1` for a screen reader: a
 * page has one `h1` in every state. The fallen player's page wears it too (screens/team/player).
 *
 * @param {{teamId: string, badgeHtml?: string, name?: string, who?: string, editHtml?: string}} props
 *   `badgeHtml` and `editHtml` are markup of `renderPlayerBadge()` and of the pencil's own render
 * @returns {string}
 */
export function playerHeadMarkup({ teamId, badgeHtml = "", name = "", who = "", editHtml = "" }) {
  const back = `<div class="g-profile__backrow"><a class="g-profile__back" href="${escapeHtml(teamUrl(teamId, "roster"))}" `
    + `aria-label="${escapeHtml(t("teamPlayer.backLabel"))}">${icon("back", 16)}<span>${escapeHtml(t("teamPlayer.back"))}</span></a></div>`;
  if (!name) return `<header class="g-profile__head">${back}<h1 class="g-sr-only" tabindex="-1">${escapeHtml(t("teamPlayer.title"))}</h1></header>`;
  const badge = badgeHtml ? `<div class="g-profile__badge">${badgeHtml}</div>` : "";
  const line = who ? `<p class="g-profile__who">${escapeHtml(who)}</p>` : "";
  return `<header class="g-profile__head">${back}<div class="g-profile__row">${badge}<div class="g-profile__titles">`
    + `<h1 class="g-profile__name" tabindex="-1">${escapeHtml(name)}</h1>${line}</div>${editHtml}</div></header>`;
}

/**
 * What stands over his profile, as over the roster and in its banners' look (`g-roster__notices`): a preparation that is
 * on, what its saves reset; another device's save with «Load the new one», or no network; then the save's state in a
 * few words at the right, in its live region.
 * @param {import("./view.mjs").RosterScreen} screen
 */
function noticesMarkup(screen) {
  const prep = screen.mode.kind === "prep" ? prepMarkup(screen) : "";
  return `<div class="g-roster__notices g-profile__notices">${prep}${saveNoticeMarkup(screen)}<p class="g-profile__status">${statusMarkup(screen.save)}</p></div>`;
}

/**
 * His SPP (Player.html's card): what he may spend, large, what he earned and spent at the right, his advancements, then
 * «Advancement» — closed, saying why, when none can be taken (decision 21) — and the cheapest one, or why it is closed.
 * Offers not known yet (no Skill Table, K28) leave it open with no line under it. The card ends there, as
 * Player.html's: the undo of his last advancement is his fix by hand's (decision 40).
 */
function sppMarkup(line, screen) {
  const reason = advanceClosed(line, screen);
  const label = t("teamPlayer.advance");
  const data = { playerAdvance: line.key };
  const advance = reason
    ? closedAdvanceMarkup({ reason, label, data })
    : `<button type="button" class="g-btn g-btn--primary g-btn--block" aria-haspopup="dialog"${dataAttributes(data)}>${icon("up", 20)}${escapeHtml(label)}</button>`;
  const hint = advanceHintOf(line, screen, { profile: true });
  return `<section class="g-profile__spp"><div class="g-profile__spptop">`
    + `<p class="g-profile__avail"><span class="g-profile__availn">${escapeHtml(line.available)}</span> <span class="g-profile__availl">${escapeHtml(t("teamRoster.available"))}</span></p>`
    + `<p class="g-profile__ledger"><span class="g-profile__ledgerline">${escapeHtml(t("teamRoster.earned", { spp: line.earned }))}</span>`
    + `<span class="g-profile__ledgerline">${escapeHtml(t("teamRoster.spent", { spp: line.spent }))}</span></p></div>`
    + renderProgressDots({ total: advancementRanks.length, done: line.level, label: t("teamRoster.advancements") })
    + `${advance}${hint ? `<p class="g-profile__hint">${escapeHtml(hint)}</p>` : ""}</section>`;
}

/** «Skills»: his skills as cards, each saying where it came from, and the categories he may take them from, in bold. */
function skillsMarkup(line) {
  const access = (label, names) => `<div class="g-profile__accessrow"><dt class="g-profile__accesskey">${escapeHtml(label)}</dt>`
    + `<dd class="g-profile__accessvalue">${escapeHtml(names.length ? names.join(" · ") : "–")}</dd></div>`;
  return `<section class="g-profile__skills"><h2 class="g-profile__title">${escapeHtml(t("teamRoster.skills"))}</h2>`
    + skillChipsMarkup(line, { card: true, sourceOf: (skill) => skillSourceOf(line, skill) })
    + `<dl class="g-profile__access">${access(t("teamPlayer.primary"), line.primary)}${access(t("teamPlayer.secondary"), line.secondary)}</dl></section>`;
}

/**
 * The pencil, which opens the edit of his number, name and captaincy (PlayerEdit.html; player.mjs): closed in a match,
 * by the screen's lock and for a player no write can name, saying why — keeping his key, so the focus finds it again.
 */
function pencilMarkup(line, screen) {
  const label = t("teamPlayer.edit.open");
  const reason = editClosed(line, screen);
  const data = { playerEdit: line.key };
  if (reason) return closedMarkup({ className: "g-icon-btn g-profile__edit", label, glyph: "pencil", reason, data });
  return `<button type="button" class="g-icon-btn g-profile__edit" aria-haspopup="dialog" aria-label="${escapeHtml(label)}"${dataAttributes(data)}>${icon("pencil", 18)}</button>`;
}

/**
 * His profile (decision 3, Player.html): the head — his number, his name, «position · race · value», the pencil — then
 * what stands over it, his characteristics, his SPP, his skills, his career and his injuries. «Career» stands right
 * after the skills (owner, 2026-10-20; PlayerCareer.html): the phone's block (career.mjs), a heading as «Skills»'s; the
 * desk's panel draws its own form (stage 07e, DeskRosterCareer.html; view.mjs), and a fallen player's profile the
 * phone's after the card of his death (`fallenMarkup`). The body names his line (`data-panel-player`), so a skill's card
 * opens its rule for him (wire.mjs).
 * @returns {[string, string]} the head and the body
 */
function profileMarkup(line, screen) {
  const who = t("teamPlayer.who", { position: line.position, race: raceTitleOf(screen.team.baseTeamSlug), value: formatMoney(line.value) });
  const badgeHtml = renderPlayerBadge({ number: line.number, kind: line.kind, captain: line.captain, large: true });
  const career = careerMarkup({ line, race: screen.race, career: screen.careers.get(line.id) ?? null, open: screen.careerOpen });
  const body = `${noticesMarkup(screen)}${statsMarkup(line)}${sppMarkup(line, screen)}${skillsMarkup(line)}${career}${injuriesMarkup(line)}`;
  return [
    playerHeadMarkup({ teamId: screen.teamId, badgeHtml, name: line.name, who, editHtml: pencilMarkup(line, screen) }),
    `<div class="g-profile__body"${dataAttributes({ panelPlayer: line.key })}>${body}</div>`,
  ];
}

/**
 * A fallen player read as fallen — a list that still held him led here (PlayerDead.html): his grey number, his name,
 * «position · race · fallen» and no pencil; under it the body of his profile with the roster's own undo (stage 07b),
 * closed while none can be sent, saying why, and his career by match where PlayerDead puts its «Career» (stage 07e):
 * the phone's block, an `h3` as «Skills» there, read once his profile is drawn (index.mjs) — for a record with an id.
 * @returns {[string, string]} the head and the body
 */
function fallenMarkup(line, screen) {
  const badgeHtml = renderPlayerBadge({ number: line.number, kind: line.kind, fallen: true, large: true });
  const reason = undoable(line) ? markClosed(line, screen, { direct: true }) : "";
  const careerHtml = line.id ? careerMarkup({ line, race: screen.race, career: screen.careers.get(line.id) ?? null, open: screen.careerOpen, heading: "h3" }) : "";
  const body = `${noticesMarkup(screen)}${fallenProfileMarkup(line, { undoHtml: undoMarkup(line, reason), careerHtml })}`;
  return [
    playerHeadMarkup({ teamId: screen.teamId, badgeHtml, name: fallenName(line), who: fallenWho(line, screen.team.baseTeamSlug) }),
    `<div class="g-profile__body g-profile__fallen"${dataAttributes({ panelPlayer: line.key })}>${body}</div>`,
  ];
}

/**
 * What stands under the head with no profile to draw: the wait, a read that failed with «Try again», a race the
 * reference does not know, or an id the roster holds nowhere — he is not on the roster, and the way back to it.
 * @param {import("./view.mjs").RosterScreen} screen
 */
function stateMarkup(screen) {
  if (screen.loading) return `<p class="g-roster__loading" role="status">${escapeHtml(t("teamRoster.loading"))}</p>`;
  if (screen.error) return failedMarkup(screen.error, { retry: true });
  if (!screen.race) return failedMarkup(t("teamRoster.noRace", { slug: screen.team.baseTeamSlug }));
  return goneMarkup(screen.teamId);
}

/**
 * The player's address on a phone, every state of it under his head: the wait, a read that failed, a race the
 * reference does not know, his profile, a fallen player's, or that he is not on the roster; the sheet that is open
 * over it. His line is the first with the address's id among those who play, then among the fallen.
 *
 * @param {import("./view.mjs").RosterScreen} screen
 * @returns {string}
 */
export function playerPageMarkup(screen) {
  const own = (lines) => lines.find((line) => line.id === screen.player);
  const line = !screen.loading && !screen.error && screen.race ? own(screen.lines) ?? own(screen.fallen) : null;
  const [head, body] = line
    ? (line.fallen ? fallenMarkup : profileMarkup)(line, screen)
    : [playerHeadMarkup({ teamId: screen.teamId }), `<div class="g-profile__body">${stateMarkup(screen)}</div>`];
  return `<div class="g-profile" data-screen="team-player">${head}${body}${sheetMarkup(screen)}</div>`;
}
