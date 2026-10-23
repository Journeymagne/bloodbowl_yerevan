/**
 * «Season · Rounds and pairs» (stage 12, decisions 17–18; DeskAdminSeason.html): the season's rounds as the admin
 * runs them, as a model and its markup.
 *
 * - The scores awaiting a confirmation, of any round of the season and the friendlies (`GET /api/admin/awaiting`): a
 *   score sent before 3.0 in a round long closed is here too, which 2.x's list of open games hid.
 * - The round under way (the last one `started`): its pairs in the prototype's six columns, «+ Pair by hand», and the
 *   next round's generation, closed with its reason while a pair of the round has no result (the server's own test,
 *   `assertCurrentRoundComplete`: a pair of two teams without the points of both), a draft round stands, or a team
 *   entered is still in its build (`admin.savedTeams[].stage`): a round would pair it, and its coach would go on buying
 *   Start Re-rolls at the build's price between its league matches. The server does not refuse that itself (a known
 *   limit of stage 12): the screen does not offer it.
 * - A draft round (the generation's, or an empty one): its pairs, «Start the round» (closed while a pair of it holds a
 *   team in its build, for the same reason), «Delete the round».
 * - With neither: the next round to generate, and «Empty round», a draft whose pairs are set by hand.
 * - The rounds before, folded: «Rounds 1–6 · over · matches: 24», and «Show» opens the same tables.
 *
 * A pair's status is one of `PAIRING_STATUSES`; its score «2–1 · CAS 3:1», a technical one «2–0 · tech.», a bye's
 * «tech. +2» as the prototype writes it (pre-flight L21) — only the points the server holds for it, «—» until a result
 * is saved: a bye keeps 2.x's scoring, the admin's score against the empty side (the owner, 2026-10-22: «как в коде
 * пока что»), so no figure of the house rules is promised before it. Long names wrap; nothing is cut.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { TECHNICAL_REASONS } from "../../domain/league-rules.mjs";
import { classNames, dataAttributes } from "../../ui/markup.mjs";

/** What a pair of a round can be at: decided, a score sent, nothing yet, no opponent, kept by its post-match. */
export const PAIRING_STATUSES = Object.freeze(["confirmed", "awaiting", "pending", "bye", "post"]);

/** The table's columns, in DeskAdminSeason.html's order; the sixth holds «Result…». */
const COLUMNS = ["table", "home", "away", "score", "status", "action"];

const number = (value) => (value === null || value === undefined ? null : Number(value));

/** Every entry of the season, a withdrawn one too: a pair keeps the team it was drawn with. */
const entriesOf = (seasonData) => [...(seasonData?.entries ?? []), ...(seasonData?.historicalEntries ?? [])];

/** Whose login a user id is: the coaches of the season's entries, and the admin's list of users. */
function loginsOf(seasonData) {
  const logins = new Map((seasonData?.admin?.users ?? []).map((user) => [user.id, user.login]));
  for (const entry of entriesOf(seasonData)) if (entry.user?.id) logins.set(entry.user.id, entry.user.login);
  return logins;
}

/** One side of a pair: the entry, its team's name and id, and its coach's login; null for no team there. */
function sideOf(entries, entryId) {
  if (!entryId) return null;
  const entry = entries.find((item) => item.id === entryId);
  return { entryId, teamId: entry?.team?.id ?? "", team: entry?.team?.name ?? "—", coach: entry?.user?.login ?? "", userId: entry?.user?.id ?? "" };
}

/** The ids of the teams still in their build (`draft`), as the admin's block of `/api/season` has them. */
const buildsOf = (seasonData) => new Set((seasonData?.admin?.savedTeams ?? []).filter((team) => team.stage === "draft").map((team) => team.id));

/** Why a round may not pair these teams yet: those still in their build, by name; "" for none. */
function buildsRefusal(names) {
  return names.length ? t("adminSeason.buildsFirst", { teams: names.join(", ") }) : "";
}

/** The score a side holds, else the one sent, else none: the manual result starts from it (2.x's form did). */
function valuesOf(pairing) {
  const pick = (key) => number(pairing[key]) ?? number(pairing[`proposed${key[0].toUpperCase()}${key.slice(1)}`]) ?? 0;
  return {
    home: { touchdowns: pick("homeTouchdowns"), casualties: pick("homeCasualties") },
    away: { touchdowns: pick("awayTouchdowns"), casualties: pick("awayCasualties") },
  };
}

/** A score sent and not yet answered: its numbers and who sent it. */
function proposalOf(pairing, logins) {
  if (pairing.resultStatus !== "awaiting_confirmation") return null;
  return {
    home: number(pairing.proposedHomeTouchdowns), away: number(pairing.proposedAwayTouchdowns),
    homeCas: number(pairing.proposedHomeCasualties), awayCas: number(pairing.proposedAwayCasualties),
    by: logins.get(pairing.proposedByUserId) ?? "",
  };
}

/** A confirmed technical result: who won it (more touchdowns: 2–0) and why; one stored before stage 12 is «another reason». */
function technicalOf(pairing, confirmed) {
  if (!confirmed || pairing.resultType !== "technical") return null;
  const reason = TECHNICAL_REASONS.includes(pairing.technicalReason) ? pairing.technicalReason : "other";
  return { winner: Number(pairing.awayTouchdowns) > Number(pairing.homeTouchdowns) ? "away" : "home", reason };
}

function statusOf(pairing, { bye, confirmed, post }) {
  if (bye) return "bye";
  if (confirmed) return "confirmed";
  if (post) return "post";
  return pairing.resultStatus === "awaiting_confirmation" ? "awaiting" : "pending";
}

/** What the score column says (DeskAdminSeason.html): the result, the score sent, a bye's points the server holds, or «—». */
function scoreOf(line, pairing) {
  if (line.bye) {
    const held = number(line.home ? pairing.homePoints : pairing.awayPoints);
    return held === null ? "—" : t("adminSeason.byeScore", { points: held });
  }
  if (line.status === "confirmed") {
    const [home, away] = [pairing.homeTouchdowns, pairing.awayTouchdowns];
    if (line.technical) return t("adminSeason.technicalScore", { home, away });
    return t("adminSeason.score", { home, away, homeCas: pairing.homeCasualties, awayCas: pairing.awayCasualties });
  }
  const sent = line.proposal;
  return sent ? t("adminSeason.score", { home: sent.home, away: sent.away, homeCas: sent.homeCas, awayCas: sent.awayCas }) : "—";
}

/**
 * One pair as the admin's season shows it.
 * @returns {{id: string, table: number, round: number, friendly: boolean, home: object|null, away: object|null, bye: boolean, empty: boolean,
 *   scored: boolean, status: string, score: string, technical: null|{winner: string, reason: string},
 *   proposal: null|{home: number, away: number, homeCas: number, awayCas: number, by: string}, post: boolean, prepared: boolean, values: object}}
 */
function lineOf(pairing, entries, logins) {
  const home = sideOf(entries, pairing.homeEntryId), away = sideOf(entries, pairing.awayEntryId);
  const bye = Boolean(home) !== Boolean(away);
  const confirmed = pairing.resultStatus === "confirmed";
  const post = (pairing.postMatchStatus ?? "not_started") !== "not_started";
  const line = {
    id: pairing.id, table: Number(pairing.tableNumber ?? 0), round: Number(pairing.roundNumber ?? 0), friendly: false, home, away, bye,
    empty: !home && !away, scored: number(pairing.homePoints) !== null && number(pairing.awayPoints) !== null, post,
    prepared: (pairing.preparationStatus ?? "not_started") !== "not_started",
    technical: technicalOf(pairing, confirmed), proposal: bye ? null : proposalOf(pairing, logins), values: valuesOf(pairing),
  };
  line.status = statusOf(pairing, { bye, confirmed, post });
  line.score = scoreOf(line, pairing);
  return line;
}

/** A score awaiting confirmation as `GET /api/admin/awaiting` sends it (a game: its sides with their coaches), as a line. */
function awaitingLine(game) {
  const side = (value) => (value ? { entryId: "", team: value.team?.name ?? "—", coach: value.user?.login ?? "", userId: value.user?.id ?? "" } : null);
  const home = side(game.home), away = side(game.away);
  const logins = new Map([home, away].filter(Boolean).map((one) => [one.userId, one.coach]));
  const line = {
    id: game.id, table: Number(game.tableNumber ?? 0), round: Number(game.roundNumber ?? 0), friendly: game.kind === "friendly", home, away,
    bye: false, empty: false, scored: false, post: (game.postMatchStatus ?? "not_started") !== "not_started", technical: null,
    proposal: proposalOf(game, logins), values: valuesOf(game), status: "awaiting",
  };
  line.score = scoreOf(line, game);
  return line;
}

function roundOf(round, entries, logins) {
  const lines = [...(round.pairings ?? [])].sort((first, second) => Number(first.tableNumber ?? 0) - Number(second.tableNumber ?? 0))
    .map((pairing) => lineOf(pairing, entries, logins));
  return { id: round.id, number: Number(round.roundNumber ?? 0), status: round.status ?? "draft", lines };
}

/**
 * Why the next round cannot be generated yet, "" when it can: the server's own two refusals, said before the press, and
 * a team entered that is still in its build (`builds`, the names of the season's entries whose team is).
 */
function generateRefusal(current, draft, builds) {
  if (draft) return t("adminSeason.draftFirst", { round: draft.number });
  const left = current ? current.lines.filter((line) => line.home && line.away && !line.scored).length : 0;
  return left ? t("adminSeason.pairsLeft", { count: left }) : buildsRefusal(builds);
}

/**
 * The rounds of the season as the admin runs them.
 * @param {{seasonData: object|null, awaiting?: object[]}} input `/api/season` as the admin reads it; the games of `GET /api/admin/awaiting`
 * @returns {{current: Round|null, draft: Round|null, past: Round[], awaiting: Line[], canGenerate: string, canStart: string, nextNumber: number,
 *   entries: object[]}}
 *   `Round = {id, number, status, lines: Line[]}`; `canGenerate` and `canStart` (the draft round's) are "" or the reason
 *   the button is closed; `nextNumber` is the round the generation makes: a draft that stands, else the one after the last
 */
export function seasonRoundsModel({ seasonData, awaiting = [] }) {
  const entries = entriesOf(seasonData), logins = loginsOf(seasonData), builds = buildsOf(seasonData);
  const rounds = [...(seasonData?.rounds ?? [])].sort((first, second) => Number(first.roundNumber) - Number(second.roundNumber))
    .map((round) => roundOf(round, entries, logins));
  const current = rounds.filter((round) => round.status === "started").at(-1) ?? null;
  const draft = rounds.find((round) => round.status === "draft") ?? null;
  const inBuild = (seasonData?.entries ?? []).filter((entry) => !entry.withdrawnAt && builds.has(entry.team?.id)).map((entry) => entry.team?.name ?? "—");
  const drafted = (draft?.lines ?? []).flatMap((line) => [line.home, line.away]).filter((side) => side && builds.has(side.teamId)).map((side) => side.team);
  return {
    current,
    draft,
    past: rounds.filter((round) => round !== current && round !== draft),
    awaiting: awaiting.map(awaitingLine),
    canGenerate: generateRefusal(current, draft, inBuild),
    canStart: buildsRefusal(drafted),
    // While a draft round stands, it is the round a generation would make once it is gone.
    nextNumber: draft?.number ?? Math.max(0, ...rounds.map((round) => round.number)) + 1,
    entries,
  };
}

// ———————————————————————————————————— the markup ————————————————————————————————————

/**
 * A card's button (DeskAdminSeason.html: 40px, the ring, 14px 700; 44px up to 900px): `go` the accent's fill, `danger`
 * red words. A closed one is `aria-disabled` with its reason as its title, which a press says; one whose write is on
 * its way says so (`aria-busy`) and takes no press.
 */
export function actionMarkup({ label, data, kind = "", closed = "", busy = false, dialog = false }) {
  const state = closed ? ` aria-disabled="true" title="${escapeHtml(closed)}"` : busy ? ' aria-busy="true" aria-disabled="true"' : "";
  return `<button type="button" class="${classNames("g-adminseason__btn", kind && `g-adminseason__btn--${kind}`)}"${state}`
    + `${dialog ? ' aria-haspopup="dialog"' : ""}${dataAttributes(data)}>${escapeHtml(label)}</button>`;
}

/** «Result…» (or «Pair…» for a pair whose sides are still to set): it opens the pair's sheet. `from` tells two buttons of one pair apart. */
function resultButton(line, { from, pair = false }) {
  const where = from === "round" ? `<span class="g-sr-only">${escapeHtml(` · ${t("adminSeason.tableN", { table: line.table })}`)}</span>` : "";
  return `<button type="button" class="g-adminseason__result" aria-haspopup="dialog"${dataAttributes({ seasonResult: line.id, seasonFrom: from })}>`
    + `${escapeHtml(t(pair ? "adminSeason.pairEdit" : "adminSeason.result"))}${where}</button>`;
}

/** A side's name; a bye's missing side «— BYE —», an empty one «—». */
function sideWords(line, name) {
  if (line[name]) return line[name].team;
  return line.bye ? t("adminSeason.bye") : "—";
}

function rowMarkup(line, pair) {
  const cell = (name, html) => `<span class="g-adminseason__cell g-adminseason__${name}" role="cell">${html}</span>`;
  return '<div class="g-adminseason__row" role="row">'
    + cell("no", escapeHtml(line.table))
    + cell("home", escapeHtml(sideWords(line, "home")))
    + cell("away", escapeHtml(sideWords(line, "away")))
    + cell("score", escapeHtml(line.score))
    + cell(`status g-adminseason__status--${line.status}`, escapeHtml(t(`adminSeason.status.${line.status}`)))
    + cell("act", resultButton(line, { from: "round", pair: pair || line.empty }))
    + "</div>";
}

/** A round's pairs: DeskAdminSeason.html's grid, its head in capitals; a pair of a draft round opens as «Pair…». */
function tableMarkup(round, label) {
  if (!round.lines.length) return `<p class="g-admin__note">${escapeHtml(t("adminSeason.noPairs"))}</p>`;
  const heads = COLUMNS.map((column) => (column === "action"
    ? `<span class="g-adminseason__cell" role="columnheader"><span class="g-sr-only">${escapeHtml(t("adminSeason.col.action"))}</span></span>`
    : `<span class="g-adminseason__cell" role="columnheader">${escapeHtml(t(`adminSeason.col.${column}`))}</span>`)).join("");
  return `<div class="g-adminseason__table" role="table" aria-label="${escapeHtml(label)}">`
    + `<div class="g-adminseason__row g-adminseason__row--head" role="row">${heads}</div>`
    + `${round.lines.map((line) => rowMarkup(line, round.status === "draft")).join("")}</div>`;
}

/** A card's head: its title (the focus's place when a write took away what had it) and its buttons. */
function headMarkup(title, actions = "") {
  return `<div class="g-adminseason__head"><h2 class="g-adminseason__title" tabindex="-1" data-season-card>${escapeHtml(title)}</h2>`
    + `${actions ? `<span class="g-adminseason__actions">${actions}</span>` : ""}</div>`;
}

/** «Awaiting confirmation · 2»: «Round 3 · A — B · sent 2–1», each with «Result…». */
function awaitingMarkup(lines, failure) {
  if (failure) return `<p class="g-admin__note g-adminseason__failure" role="status">${escapeHtml(t("administration.readFailed", { reason: failure }))}</p>`;
  if (!lines.length) return "";
  const rows = lines.map((line) => {
    const where = line.friendly ? t("adminSeason.friendly") : t("adminSeason.roundN", { round: line.round });
    const score = line.proposal ? `${line.proposal.home}–${line.proposal.away}` : "—";
    const words = t("adminSeason.awaitingLine", { where, home: line.home?.team ?? "—", away: line.away?.team ?? "—", score });
    return `<li class="g-adminseason__wait"><span class="g-adminseason__waittext">${escapeHtml(words)}</span>${resultButton(line, { from: "awaiting" })}</li>`;
  }).join("");
  return `<section class="g-admin__card g-adminseason__awaiting">${headMarkup(t("adminSeason.awaiting", { count: lines.length }))}`
    + `<ul class="g-adminseason__waits">${rows}</ul></section>`;
}

/** The next round's generation: open, or closed with why (the round's pairs left, a draft round to start or delete first). */
function generateButton(model, busy) {
  return actionMarkup({ label: t("adminSeason.generate", { round: model.nextNumber }), kind: "go", closed: model.canGenerate,
    busy: busy === "generate", data: { seasonGenerate: "" } });
}

/** The round under way (DeskAdminSeason.html): «Round 7 · on», «+ Pair by hand», the generation and its rule, the pairs. */
function currentMarkup(model, busy) {
  const round = model.current;
  const actions = actionMarkup({ label: t("adminSeason.addPair"), busy: busy === `pair:${round.id}`, data: { seasonAddPair: round.id } })
    + generateButton(model, busy);
  const left = round.lines.filter((line) => line.home && line.away && !line.scored).length;
  const note = [t("adminSeason.generateNote", { round: round.number }), left ? t("adminSeason.leftNote", { count: left }) : "", t("adminSeason.swissNote")]
    .filter(Boolean).join(" ");
  return `<section class="g-admin__card g-adminseason__round">${headMarkup(t("adminSeason.roundOn", { round: round.number }), actions)}`
    + `<p class="g-admin__note">${escapeHtml(note)}</p>${tableMarkup(round, t("adminSeason.roundN", { round: round.number }))}</section>`;
}

/** A draft round: its pairs set by hand until it starts; «Start the round» (closed with why while it pairs a build), «Delete the round». */
function draftMarkup(model, busy) {
  const round = model.draft;
  const actions = actionMarkup({ label: t("adminSeason.addPair"), busy: busy === `pair:${round.id}`, data: { seasonAddPair: round.id } })
    + actionMarkup({ label: t("adminSeason.start"), kind: "go", closed: model.canStart, busy: busy === `start:${round.id}`, data: { seasonStart: round.id } })
    + actionMarkup({ label: t("adminSeason.deleteRound"), kind: "danger", busy: busy === `delete:${round.id}`, data: { seasonDeleteRound: round.id, seasonRound: round.number } });
  return `<section class="g-admin__card g-adminseason__draft">${headMarkup(t("adminSeason.roundDraft", { round: round.number }), actions)}`
    + `<p class="g-admin__note">${escapeHtml(t("adminSeason.draftNote"))}</p>${tableMarkup(round, t("adminSeason.roundN", { round: round.number }))}</section>`;
}

/** No round on and none drafted: the next one to generate, or an empty one to fill by hand. */
function nextMarkup(model, busy) {
  const title = model.nextNumber === 1 ? t("adminSeason.noRounds") : t("adminSeason.roundN", { round: model.nextNumber });
  const actions = generateButton(model, busy)
    + actionMarkup({ label: t("adminSeason.emptyRound"), busy: busy === "empty", data: { seasonEmptyRound: "" } });
  return `<section class="g-admin__card g-adminseason__next">${headMarkup(title, actions)}`
    + `<p class="g-admin__note">${escapeHtml(t("adminSeason.firstNote"))}</p></section>`;
}

/** The rounds before, folded: «Rounds 1–6 · over · matches: 24» and «Show»; open, the same tables, oldest first. */
function pastMarkup(rounds, open) {
  if (!rounds.length) return "";
  const first = rounds[0].number, last = rounds.at(-1).number;
  const name = rounds.length > 1 ? t("adminSeason.pastMany", { first, last }) : t("adminSeason.roundN", { round: first });
  const matches = rounds.reduce((sum, round) => sum + round.lines.filter((line) => line.home && line.away).length, 0);
  const line = t(rounds.length > 1 ? "adminSeason.pastLine" : "adminSeason.pastLineOne", { count: matches });
  const toggle = `<button type="button" class="g-adminseason__btn" aria-expanded="${open}" aria-controls="season-past" data-season-past>`
    + `${escapeHtml(t(open ? "adminSeason.hide" : "adminSeason.show"))}</button>`;
  const tables = open ? rounds.map((round) => {
    const title = t(round.status === "started" ? "adminSeason.roundOn" : "adminSeason.roundOver", { round: round.number });
    return `<h3 class="g-adminseason__pasttitle">${escapeHtml(title)}</h3>${tableMarkup(round, title)}`;
  }).join("") : "";
  return `<section class="g-admin__card g-adminseason__pastcard"><div class="g-adminseason__pasthead"><span class="g-adminseason__pastwords">`
    + `<b class="g-adminseason__pastname">${escapeHtml(name)}</b><span class="g-adminseason__pastline">${escapeHtml(line)}</span></span>${toggle}</div>`
    + `<div class="g-adminseason__past" id="season-past"${open ? "" : " hidden"}>${tables}</div></section>`;
}

/**
 * «Rounds and pairs»: the scores awaiting, the round under way, a draft round (or the next to generate), the rounds before.
 * @param {ReturnType<typeof seasonRoundsModel>} model
 * @param {{busy?: string, pastOpen?: boolean, awaitingFailure?: string}} [view] the write on its way (its key), the rounds before open, why the scores awaiting were not read
 */
export function adminRoundsMarkup(model, { busy = "", pastOpen = false, awaitingFailure = "" } = {}) {
  const now = model.current ? currentMarkup(model, busy) : "";
  const next = model.draft ? draftMarkup(model, busy) : model.current ? "" : nextMarkup(model, busy);
  return `${awaitingMarkup(model.awaiting, awaitingFailure)}${now}${next}${pastMarkup(model.past, pastOpen)}`;
}
