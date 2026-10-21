/**
 * Advancing in the post-match (stage 09b, Task 10; decisions 13, 21, 22): «Advance» on the Players step opens the
 * roster's own sheet (07d: Adv1Type…Adv4Done, Adv3Random, DeskRosterAdv — `advanceSheetMarkup`, `advanceHandlers`) for
 * the player as the post-match holds him — his SPP with the match's and the MVP's, the advancements chosen here, his
 * injury — and lends it what is the post-match's own:
 * - «Take» is an action of the post-match (`advance {playerId, advancementType, grant, roll?}`), priced first on a copy
 *   of him by the roster's own rule (`takeAdvancement`); a refusal is said in the sheet, which stays; an answer that never
 *   came reads the post-match again, and one that landed is taken as taken;
 * - «Roll two D16» and «Roll D8» ask the post-match's dice (`askPostRoll`), by the roster the post-match holds: only the
 *   side's coach, and only for a player of the roster — a journeyman or a rookie of the match rolls at the table, as an
 *   administrator does for a side not his own (decision 22);
 * - «Record this roll…» puts a roll on an advancement taken at the table — the roster's to do, after the post-match.
 * The god's D8 a roster «Favoured of…» rolls with every advancement goes with the take (`favouredRoll`, `favouredSkill`;
 * the owner, 2026-10-21; screens/team/roster/favoured.mjs). Only those who may advance here are its lines (`postAdvancer`,
 * pre-flight L16): in the match, no star, not dead. What closes it: the Players step read only, and a write on its way.
 */
import { toast } from "../../components/toast.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { askPostRoll } from "../../data/post-match-client.mjs";
import { SAVE_STATUS } from "../../data/roster-store.mjs";
import { sameValues } from "../../domain/post-match/events.mjs";
import { postAdvancer, postPlayers } from "../../domain/post-match/roster.mjs";
import { playerAdvancementLevel, takeAdvancement } from "../../domain/roster/progression.mjs";
import { rowsForTeam } from "../../domain/roster/values.mjs";
import { advanceHandlers, advanceSheetOf } from "../team/roster/advance.mjs";
import { advanceSheetMarkup } from "../team/roster/advance-sheet.mjs";
import { rosterLines } from "../team/roster/model.mjs";
import { rosterLineOf } from "../team/roster/player-save.mjs";
import { refusalWordsOf } from "../team/roster/save.mjs";
import { isPhone } from "../team/roster/screen.mjs";

/** The side's stage of the Players step, where an advancement is taken. */
const PLAYERS_STAGE = 2;

/** The post-match's side on screen. */
const sideOf = (visit) => visit.payload.postMatch[visit.sideName];

/** The players who may advance here, as the post-match holds them (none for a post-match the domain cannot project). */
function advancers(visit) {
  try {
    return postPlayers(visit.payload.postMatch, visit.sideName, state.data).filter(({ id }) => postAdvancer(sideOf(visit), id));
  } catch {
    return [];
  }
}

/**
 * Why no advancement is taken just now, "" when one may be: the Players step read only (finished, confirmed, passed or
 * not reached), a write on its way, or a Players draft not sent yet (a Lasting Injury waits for its characteristic).
 */
function lockOf(visit) {
  const post = visit.payload.postMatch, side = sideOf(visit), { ui } = visit;
  if (post.status === "completed" || side.confirmed || side.stage !== PLAYERS_STAGE) return t("after.playersLocked");
  if (ui.busy || ui.playersWaiting) return t("teamRoster.mark.waitSave");
  return ui.drafts.players ? t("after.statFirst") : "";
}

/**
 * The sheet's screen (07d's `Where`), as the post-match stands: the side's team, the width, the race, the roster the
 * post-match holds (`postPlayers`, those who may advance here), its lines (`rosterLines` with the Skill Table), the mode
 * («post»), why it is closed, and where its write stands (saving while one is on its way).
 * @param {{payload: object, sideName: string, ui: object}} visit post.mjs's
 */
export function postAdvanceWhere(visit) {
  const side = sideOf(visit), race = side.reference, draft = { ...side.baseRoster, players: advancers(visit) };
  return {
    teamId: side.team.id, phone: isPhone(), race, draft, lines: rosterLines({ draft, race, skillGroups: state.data?.skillGroups ?? [] }),
    mode: { kind: "post" }, lock: lockOf(visit), save: { status: visit.ui.busy ? SAVE_STATUS.SAVING : SAVE_STATUS.SAVED, waiting: 0 },
  };
}

/** The key of the sheet's line of the player (the advancement cards' `data-player-advance`), "" for one who may not advance here. */
export function postAdvanceKey(visit, playerId) {
  return postAdvanceWhere(visit).lines.find(({ id }) => id === String(playerId))?.key ?? "";
}

/** The player of the sheet's line `key` (`postAdvanceKey`'s other way), "" for none. */
export function postAdvancePlayer(visit, key) {
  return rosterLineOf(postAdvanceWhere(visit).lines, key)?.id ?? "";
}

/** The advancement's sheet while it is open and still stands (`advanceSheetOf`: not when it shows one taken off since), else "". */
export function postAdvanceMarkup(visit) {
  const { sheet } = visit.ui;
  if (sheet?.kind !== "advance") return "";
  const where = postAdvanceWhere(visit), line = rosterLineOf(where.lines, sheet.key);
  const shown = line && advanceSheetOf(sheet, line, where);
  return shown ? advanceSheetMarkup({ line, screen: where, sheet: shown }) : "";
}

/** The advancements the side has chosen here for the player. */
const chosenFor = (visit, playerId) => sideOf(visit).advancements?.[playerId] ?? [];

/**
 * «Take»: priced first on a copy of him (`takeAdvancement`: what it costs, adds and makes his rank), then the post-match's
 * `advance`. Answered — or an answer lost whose read shows it landed — it is taken; else the server's words.
 */
async function takeInPost(visit, screen, line, choice) {
  const where = postAdvanceWhere(visit), stored = where.draft.players[line.index];
  const row = stored ? rowsForTeam(where.race)[Number(stored.rowIndex)] : null;
  if (!row) return { ok: false };
  const copy = structuredClone(stored), { type, grant, roll, favouredRoll, favouredSkill } = choice;
  const priced = takeAdvancement(where.race, row, copy, { type, grant, roll }, state.data?.skillGroups ?? []);
  if (!priced.applied) return { refusal: refusalWordsOf("teamAdvance", priced) };
  const before = chosenFor(visit, line.id).length;
  const answered = await screen.send({ type: "advance", playerId: line.id, advancementType: type, grant, ...(roll ? { roll } : {}),
    ...(favouredRoll === undefined ? {} : { favouredRoll, favouredSkill }) });
  const now = chosenFor(visit, line.id), last = now.at(-1);
  const landed = now.length === before + 1 && last.type === type && sameValues(last.grant, grant);
  if (answered || landed) return { ok: true, cost: priced.cost, value: priced.value, level: playerAdvancementLevel(copy) };
  return { refusal: visit.ui.error || t("request.noAnswer") };
}

/** «Roll …»: the post-match's dice for a player of the roster, asked by the side's coach; a journeyman's and an administrator's are the table's. */
function askInPost(visit, line, ask) {
  const post = visit.payload.postMatch, side = sideOf(visit);
  if (!postAdvancer(side, line.id, { site: true })) return Promise.resolve({ refusal: t("after.rollJourneyman") });
  if (side.user?.id !== state.auth.currentUser?.id) return Promise.resolve({ refusal: t("after.rollAdmin") });
  return askPostRoll(post.gameId, visit.sideName, line.id, ask);
}

/**
 * The sheet's presses (`advanceHandlers`, with the god's D8's), the post-match lending its take, its ask and its bind;
 * the sheet lives on the page (`visit.ui`: `sheet`, `opener`, `here`). A closed way of rolling says why on a press.
 * @param {object} visit post.mjs's
 * @param {{draw: Function, send: Function, readAgain: Function}} screen post.mjs's: `send(action)` answers whether it was answered
 */
export function postAdvanceHandlers(visit, screen) {
  const saving = { get teamId() { return visit.payload ? sideOf(visit).team.id : ""; }, visit: visit.ui, draw: () => screen.draw() };
  const handlers = advanceHandlers(saving, {
    now: () => postAdvanceWhere(visit), refused: () => {}, readAgain: () => void screen.readAgain(),
    take: (line, choice) => takeInPost(visit, screen, line, choice),
    ask: (line, ask) => askInPost(visit, line, ask),
    bind: () => ({ refusal: t("after.bindLater") }),
  });
  return { ...handlers, onRefused: (reason) => { if (reason) toast(reason); } };
}
