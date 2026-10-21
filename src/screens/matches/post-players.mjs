/**
 * The post-match's Players step (stage 09b decisions 9–14): the match's events, the MVP, the injuries, the veterans'
 * dice after a concession, and who can advance. A phone's (PostPlayers.html): the rows of those who did something —
 * each a button that opens the player's sheet of counters and injury —, the others behind «Other players · N», the MVP
 * with those who stood out first, a card for each injury, the advancement cards. A desk's (DeskPostPlayers.html): one
 * real table of every player — the name opens the same sheet, the MVP a star —, the advancement cards under it, the
 * injuries in the right column.
 *
 * Everything is drawn from the step's draft (`playersDraft`: what the `statistics` action writes, kept by the screen and
 * written press by press), the SPP as the domain counts them over it. A row's SPP is the match's own, the MVP's left
 * out (the phone's rows); the desk's column has it (L26). The sheet's steppers name their player by `data-sheet-player`
 * and the rows by `data-after-player`, so a press in the sheet never opens it again (pre-flight L6). Radio groups name
 * their player on the group and the choice on the item (`data-after-injury="<id>"` and `data-code`, L21).
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { sideFollowsEvents } from "../../domain/post-match/events.mjs";
import { postAdvancer } from "../../domain/post-match/roster.mjs";
import { INJURIES, POST_STATS, postOutcome } from "../../domain/post-match/rules.mjs";
import { mvpChoices, sideRecords } from "../../domain/post-match/score.mjs";
import { earnedSpp } from "../../domain/post-match/statistics.mjs";
import { canTakeAdvancement, playerAvailableSpp, sppCounterWeights } from "../../domain/roster/progression.mjs";
import { PLAYER_STATS } from "../../domain/roster/values.mjs";
import { renderActionStepper } from "../../ui/action-stepper.mjs";
import { renderSheet } from "../../ui/sheet.mjs";
import { renderToggle } from "../../ui/toggle.mjs";
import { gaveWords } from "../team/roster/player-access.mjs";
import { postAdvanceKey } from "./post-model.mjs";
import { actionFooter, labelMarkup, mismatchMarkup, nextLink, noteMarkup, postInjuryWords } from "./post-steps.mjs";

/** The id of the player's sheet of counters and injury. */
export const PLAYERS_SHEET = "after-player";

/** The advancement types a card offers: one open is enough to say the player can advance. */
const TYPES = ["random", "primary", "secondary", "stat"];
/** The counters that are part of CAS, worth nothing of their own. */
const PART_OF_CAS = ["crowdCasualties", "foulCasualties"];
/** The injuries with a quiet line under their name. */
const SUBS = ["miss", "niggling", "lasting"];

/**
 * The step's draft as the page starts it: a copy of what the `statistics` action writes, in the shape the domain saves
 * it (`saveStatistics`): every counter of every player of the match, an injury as `{code, stat?, retire}`, the MVPs,
 * the veterans' dice.
 * @returns {{statistics: Record<string, object>, injuries: Record<string, {code: string, stat?: string, retire: boolean}>, mvps: string[], departures: Record<string, number>}}
 */
export function playersDraft(side) {
  const injuries = Object.fromEntries(Object.entries(side.injuries).map(([id, injury]) => [id, { code: injury.code, ...(injury.stat ? { stat: injury.stat } : {}), retire: Boolean(injury.retire) }]));
  return { statistics: structuredClone(side.statistics), injuries, mvps: [...side.mvps], departures: { ...side.departures } };
}

/** The post-match with the draft in this side, for the domain to count over; `mvps` in place of the draft's. */
function withDraft(model, draft, mvps = draft.mvps) {
  const side = model.post[model.sideName];
  return { ...model.post, [model.sideName]: { ...side, statistics: draft.statistics, injuries: draft.injuries, mvps, departures: draft.departures } };
}

/** «#3 L. Ashby». */
const who = (player) => t("after.who", { number: player.number, name: player.name });

/** A player's position, as the reference names his row (none for a star). */
const positionOf = (player) => player.row?.position ?? "";

/** Did the side concede the match in full (not «no penalty», L15): no SPP, the veterans' dice. */
const lostConceding = (model) => model.post.result.mode === "conceded" && postOutcome(model.post, model.sideName) === "loss";

/** «TD 1 · COMP 1»: the counters a player has in the draft, in the table's order. */
function countersWords(stats = {}) {
  return POST_STATS.filter((counter) => Number(stats[counter]) > 0).map((counter) => `${t(`after.stat.${counter}`)} ${stats[counter]}`).join(" · ");
}

/** The words of a standing injury: «Lasting Injury (AG)»; "" for none. */
const injuryOf = (injury) => (injury && injury.code !== "none" ? postInjuryWords(injury) : "");

/** The players of the match as the step reads them: what each did, the injury, the SPP without and with the MVP. */
function playersOf(model, draft) {
  const side = model.post[model.sideName], plain = withDraft(model, draft, []), full = withDraft(model, draft);
  const conceded = lostConceding(model);
  return side.snapshot.players.map((player) => {
    const stats = draft.statistics[player.id] ?? {}, injury = draft.injuries[player.id];
    const counters = countersWords(stats), hurt = injuryOf(injury);
    return { player, counters, hurt, active: Boolean(counters || hurt), star: player.kind === "star",
      spp: conceded ? 0 : earnedSpp(plain, model.sideName, player.id), sppMvp: conceded ? 0 : earnedSpp(full, model.sideName, player.id) };
  });
}

/** One row of the events (52px): number, name, «Catcher · TD 1 · COMP 1» or the injury, «+4 SPP» or «—»; a button that opens the sheet. */
function eventRow(read) {
  const { player } = read;
  const line = [positionOf(player), read.counters, read.hurt ? t("after.injuryLine", { injury: read.hurt }) : ""].filter(Boolean).join(" · ");
  const spp = read.spp > 0 ? t("after.spp", { spp: read.spp }) : "—";
  return `<button type="button" class="g-after__event" data-after-player="${escapeHtml(player.id)}" aria-haspopup="dialog">`
    + `<span class="g-after__num">${escapeHtml(player.number)}</span><span class="g-after__who"><span class="g-after__name">${escapeHtml(player.name)}</span>`
    + `${line ? `<span class="g-after__line">${escapeHtml(line)}</span>` : ""}</span><span class="g-after__spp">${escapeHtml(spp)}</span></button>`;
}

/** «Match events» (PostPlayers.html): the ones who did something, most SPP first; the others behind a button. */
function eventsCard(model, draft, players, open) {
  const side = model.post[model.sideName], records = sideRecords(side);
  const note = records ? t("after.eventsNote", { match: model.matchLabel, count: records.count }) : t("after.eventsNote2x");
  const active = players.filter((read) => read.active).sort((one, other) => other.spp - one.spp);
  const rest = players.filter((read) => !read.active);
  const toggle = rest.length ? `<button type="button" class="g-after__rest" data-after-rest aria-expanded="${open}" aria-controls="after-rest">${escapeHtml(t("after.rest", { count: rest.length }))}</button>` : "";
  const others = open && rest.length ? `<div class="g-after__restlist" id="after-rest">${rest.map(eventRow).join("")}</div>` : "";
  const conceded = lostConceding(model) ? noteMarkup(t("after.concededSpp")) : "";
  return `<div class="g-after__card g-after__card--events">${labelMarkup(t("after.events"))}${noteMarkup(note)}${conceded}${active.map(eventRow).join("")}${toggle}${others}</div>`;
}

/** One MVP chip: «#3 L. Ashby», a radio of the one group or a button pressed, closed when it cannot be pressed. */
function mvpChip(choice, { chosen, count, closed, full, entry }) {
  const on = chosen.includes(choice.id);
  const state = count === 1 ? `role="radio" aria-checked="${on}" tabindex="${choice.id === entry ? 0 : -1}"` : `aria-pressed="${on}"`;
  const shut = closed || (full && !on) ? ` aria-disabled="true"${!closed && full ? ` title="${escapeHtml(t("after.mvpFull"))}"` : ""}` : "";
  return `<button type="button" class="g-after__chip" ${state}${shut} data-after-mvp="${escapeHtml(choice.id)}">${escapeHtml(who(choice))}</button>`;
}

/**
 * The MVP (PostPlayers.html): those who stood out first, two to a row, then the others, three to a row. One MVP is one
 * radio group through both (the arrows go across them); two (the winner of a technical result or a full concession) are
 * buttons pressed, two different players at most (the owner's answer 2); none for its loser.
 */
function mvpCard(model, draft) {
  const choices = mvpChoices(withDraft(model, draft), model.sideName);
  const title = labelMarkup(t("after.mvpTitle"));
  if (!choices.count) {
    const why = t(`after.mvpWhy.${model.post.result.mode === "technical" ? "technical" : "conceded"}`);
    return `<div class="g-after__card">${title}${noteMarkup(t("after.mvpNone", { why }))}</div>`;
  }
  const chosen = draft.mvps.filter((id) => [...choices.top, ...choices.rest].some((choice) => choice.id === id));
  const all = [...choices.top, ...choices.rest];
  const options = { chosen, count: choices.count, closed: model.readonly, full: choices.count > 1 && chosen.length >= choices.count, entry: chosen[0] ?? all[0]?.id };
  const grid = (list, columns) => (list.length ? `<div class="g-after__chips g-after__chips--${columns}">${list.map((choice) => mvpChip(choice, options)).join("")}</div>` : "");
  const inner = `${choices.top.length ? labelMarkup(t("after.mvpTop")) : ""}${grid(choices.top, 2)}${choices.rest.length ? labelMarkup(t("after.mvpRest")) : ""}${grid(choices.rest, 3)}`;
  const group = choices.count === 1 ? `<div class="g-after__mvp" role="radiogroup" aria-label="${escapeHtml(t("after.mvpTitle"))}">${inner}</div>`
    : `<div class="g-after__mvp" role="group" aria-label="${escapeHtml(t("after.mvpTitle"))}">${inner}</div>`;
  return `<div class="g-after__card">${title}${noteMarkup(t("after.mvpNote"))}${group}</div>`;
}

/** A radio group of options `[value, label, sub?]` (the injury's six, the characteristic's five, a veteran's D6). */
function optionsMarkup({ name, values, chosen, closed, data, item, kind }) {
  const entry = values.some(([value]) => value === chosen) ? chosen : values[0][0];
  const items = values.map(([value, label, sub]) => `<button type="button" class="g-after__option g-after__option--${kind}" role="radio" aria-checked="${value === chosen}"`
    + ` tabindex="${value === entry ? 0 : -1}"${closed ? ' aria-disabled="true"' : ""} data-${item}="${escapeHtml(value)}"><span>${escapeHtml(label)}</span>`
    + `${sub ? `<span class="g-after__optsub">${escapeHtml(sub)}</span>` : ""}</button>`).join("");
  return `<div class="g-after__options g-after__options--${kind}" role="radiogroup" aria-label="${escapeHtml(name)}" ${data}>${items}</div>`;
}

/** The injury's radios, the characteristic and «Out for the rest of the season» at Lasting, and the rookies' rule: the card's and the sheet's. */
function injuryControls(model, draft, id, closed) {
  const injury = draft.injuries[id] ?? { code: "none", retire: false };
  const values = INJURIES.map((code) => [code, t(`after.injury.${code}`), SUBS.includes(code) ? t(`after.injurySub.${code}`) : ""]);
  let html = optionsMarkup({ name: t("after.injuryLabel"), values, chosen: injury.code, closed, data: `data-after-injury="${escapeHtml(id)}"`, item: "code", kind: "injury" });
  if (injury.code === "lasting") {
    const stats = PLAYER_STATS.map((stat) => [stat, t(`stats.${stat}`)]);
    html += `${labelMarkup(t("after.whichStat"))}${optionsMarkup({ name: t("after.whichStat"), values: stats, chosen: injury.stat ?? "", closed, data: `data-after-stat="${escapeHtml(id)}"`, item: "stat", kind: "stat" })}`;
    html += renderToggle({ key: `retire:${id}`, label: t("after.retire"), checked: injury.retire, disabled: closed });
  }
  if (model.post[model.sideName].gamesPlayed < 3 && !["none", "badly-hurt"].includes(injury.code)) html += `<p class="g-after__rookie">${escapeHtml(t("after.rookie"))}</p>`;
  return html;
}

/** A card for a player with an injury in the draft: «Injury · #2 O. Krell», «from a match record» while the side follows the records. */
function injuryCard(model, draft, player) {
  const side = model.post[model.sideName], injury = draft.injuries[player.id];
  const recorded = sideFollowsEvents(side) && injury.code !== "none";
  const chip = recorded ? `<span class="g-after__fromrec">${escapeHtml(t("after.fromRecord"))}</span>` : "";
  const head = `<div class="g-after__head"><span class="g-after__label">${escapeHtml(t("after.injury", { number: player.number, name: player.name }))}</span>${chip}</div>`;
  const note = recorded ? noteMarkup(t("after.injuryNote", { injury: injuryOf(injury) })) : "";
  return `<div class="g-after__card">${head}${note}${injuryControls(model, draft, player.id, model.readonly)}${noteMarkup(t("after.injuryCodes"))}</div>`;
}

/** Every injury card, in the match's order (the stars get none). */
function injuryCards(model, draft) {
  return model.post[model.sideName].snapshot.players.filter((player) => player.kind !== "star" && draft.injuries[player.id]).map((player) => injuryCard(model, draft, player)).join("");
}

/** «Veterans after conceding · D6»: a die for each player with 3+ advancements, who leaves on 1–3. None unless the side conceded in full. */
function departuresCard(model, draft) {
  if (!lostConceding(model)) return "";
  const veterans = model.post[model.sideName].baseRoster.players.filter((player) => (player.advancements ?? []).length >= 3);
  if (!veterans.length) return "";
  const rows = veterans.map((player) => {
    const name = who(player), values = [1, 2, 3, 4, 5, 6].map((face) => [face, String(face)]);
    return `<div class="g-after__veteran"><span class="g-after__name">${escapeHtml(name)}</span>`
      + `${optionsMarkup({ name: `${name} · D6`, values, chosen: draft.departures[player.id] ?? null, closed: model.readonly, data: `data-after-departure="${escapeHtml(player.id)}"`, item: "die", kind: "die" })}</div>`;
  }).join("");
  return `<div class="g-after__card">${labelMarkup(t("after.departures"))}${rows}${noteMarkup(t("after.departuresNote"))}</div>`;
}

/** A player of the projection who may advance now: in the match, no star, not dead, with a type open. */
function canAdvance(model, id) {
  const side = model.post[model.sideName], player = model.preview.players.find((item) => item.id === id);
  if (!player || !postAdvancer(side, id)) return null;
  return TYPES.some((type) => canTakeAdvancement(side.reference, player, type).allowed) ? player : null;
}

/** The advancement cards (the accent's soft tint): «L. Ashby can advance · 27 SPP available with MVP · optional» and «Advance»; one taken here with «Undo». */
function advanceCards(model) {
  const side = model.post[model.sideName];
  const cards = side.snapshot.players.map((player) => {
    const open = model.readonly ? null : canAdvance(model, player.id), taken = side.advancements[player.id] ?? [];
    if (!open && !taken.length) return "";
    const words = taken.length ? t("after.taken", { gave: taken.map((choice) => gaveWords({ type: choice.type, grants: choice.grant })).join(", ") }) : "";
    const title = open ? t("after.canAdvance", { name: player.name }) : words;
    const sub = open ? t("after.canAdvanceSub", { spp: playerAvailableSpp(side.reference, open) }) : "";
    const gave = open && words ? `<span class="g-after__line">${escapeHtml(words)}</span>` : "";
    const undo = taken.length && !model.readonly ? `<button type="button" class="g-after__untake" data-after-untake="${escapeHtml(player.id)}">${escapeHtml(t("after.untake"))}</button>` : "";
    const advance = open ? `<button type="button" class="g-after__advance" data-player-advance="${escapeHtml(postAdvanceKey(player.id))}" aria-haspopup="dialog">${escapeHtml(t("after.advance"))}</button>` : "";
    return `<div class="g-after__card g-after__card--adv"><div class="g-after__advrow"><span class="g-after__who"><b class="g-after__name">${escapeHtml(title)}</b>`
      + `${sub ? `<span class="g-after__line">${escapeHtml(sub)}</span>` : ""}${gave}</span><span class="g-after__advbtns">${undo}${advance}</span></div></div>`;
  }).join("");
  return cards ? `${noteMarkup(t("after.resetsAdvancements"))}${cards}` : "";
}

/** A desk's table row: number, the name a button of the sheet, TD, CAS, COMP, KO, the MVP's star, the SPP with the MVP, the injury. */
function tableRow(read, counted, { mvps, eligible, count, closed, full }) {
  const { player } = read;
  const counts = ["touchdowns", "casualties", "completions", "knockouts"].map((counter) => `<td class="g-after__td g-after__td--n">${escapeHtml(counted[counter] ?? 0)}</td>`).join("");
  const on = mvps.includes(player.id), shut = closed || (full && !on);
  const star = count && eligible.has(player.id)
    ? `<button type="button" class="g-after__star" aria-pressed="${on}" aria-label="${escapeHtml(t("after.mvpStar", { name: player.name }))}"${shut ? ' aria-disabled="true"' : ""}`
      + `${!closed && full && !on ? ` title="${escapeHtml(t("after.mvpFull"))}"` : ""} data-after-mvp="${escapeHtml(player.id)}"><span aria-hidden="true">${on ? "★" : "☆"}</span></button>` : "";
  const injury = read.hurt ? `<td class="g-after__td g-after__td--hurt">${escapeHtml(read.hurt)}</td>` : '<td class="g-after__td g-after__td--none">—</td>';
  return `<tr><td class="g-after__td g-after__td--num">${escapeHtml(player.number)}</td>`
    + `<th class="g-after__td g-after__td--who" scope="row"><button type="button" class="g-after__cellbtn" data-after-player="${escapeHtml(player.id)}" aria-haspopup="dialog">`
    + `<span class="g-after__name">${escapeHtml(player.name)}</span><span class="g-after__line">${escapeHtml(positionOf(player))}</span></button></th>`
    + `${counts}<td class="g-after__td g-after__td--n">${star}</td><td class="g-after__td g-after__td--spp">${escapeHtml(read.sppMvp > 0 ? `+${read.sppMvp}` : "—")}</td>${injury}</tr>`;
}

/** A desk's table (DeskPostPlayers.html): every player of the match, a real table with its caption and column heads. */
function tableMarkup(model, draft, players) {
  const choices = mvpChoices(withDraft(model, draft), model.sideName);
  const eligible = new Set([...choices.top, ...choices.rest].map((choice) => choice.id));
  const options = { mvps: draft.mvps, eligible, count: choices.count, closed: model.readonly, full: choices.count > 1 && draft.mvps.length >= choices.count };
  const heads = [t("after.col.number"), t("after.col.player"), t("after.stat.touchdowns"), t("after.stat.casualties"), t("after.stat.completions"),
    t("after.stat.knockouts"), t("after.col.mvp"), t("after.col.spp"), t("after.col.injury")];
  const head = `<thead><tr>${heads.map((label) => `<th class="g-after__th" scope="col">${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
  const rows = players.map((read) => tableRow(read, draft.statistics[read.player.id] ?? {}, options)).join("");
  return `<table class="g-after__table"><caption class="g-sr-only">${escapeHtml(t("after.tableCaption"))}</caption>${head}<tbody>${rows}</tbody></table>`;
}

/**
 * The Players step (PostPlayers.html; DeskPostPlayers.html on a desk), its injuries in a desk's right column.
 * @param {ReturnType<typeof import("./post-model.mjs").postModel>} model @param {ReturnType<typeof playersDraft>} draft
 * @param {{phone: boolean, open?: boolean}} options `open`: the other players shown
 */
export function playersStep(model, draft, { phone, open = false }) {
  const players = playersOf(model, draft);
  const mismatch = mismatchMarkup(model, withDraft(model, draft), { ownOnly: true });
  const footer = playersFooter(model, draft);
  if (phone) {
    return { contentHtml: `${mismatch}${eventsCard(model, draft, players, open)}${mvpCard(model, draft)}${injuryCards(model, draft)}${departuresCard(model, draft)}${advanceCards(model)}`, asideHtml: "", footer };
  }
  const side = model.post[model.sideName], records = sideRecords(side);
  const notes = `<div class="g-after__notes">${noteMarkup(records ? t("after.deskEventsNote", { match: model.matchLabel }) : t("after.eventsNote2x"))}${noteMarkup(t("after.deskMvpNote"))}`
    + `${lostConceding(model) ? noteMarkup(t("after.concededSpp")) : ""}</div>`;
  const none = mvpChoices(withDraft(model, draft), model.sideName).count ? "" : mvpCard(model, draft);
  return { contentHtml: `${mismatch}${notes}${tableMarkup(model, draft, players)}${none}${departuresCard(model, draft)}${advanceCards(model)}`,
    asideHtml: injuryCards(model, draft), footer };
}

/** «Next: roster» locks the step (`lock-players`): closed while the score and the records part, the MVP is missing, or a veteran's die is unmarked. */
export function playersFooter(model, draft) {
  if (model.readonly) return nextLink(model, "roster");
  const post = withDraft(model, draft);
  const count = mvpChoices(post, model.sideName).count;
  const mismatched = mismatchMarkup(model, post, { ownOnly: true }) !== "";
  const veterans = lostConceding(model) ? model.post[model.sideName].baseRoster.players.filter((player) => (player.advancements ?? []).length >= 3) : [];
  const hint = mismatched ? t("after.mismatchShut") : draft.mvps.length < count ? t("after.mvpShut")
    : veterans.some((player) => !draft.departures[player.id]) ? t("after.departureShut") : "";
  return actionFooter("lock-players", t("after.next.roster"), hint);
}

/** A counter's next value: within 0…99 (`postCount`), crowd and foul casualties never more than CAS. Null for a step refused. */
function nextCounts(stats, counter, delta) {
  if (!POST_STATS.includes(counter)) return null;
  const next = { ...stats, [counter]: Math.min(99, Math.max(0, (Number(stats[counter]) || 0) + delta)) };
  const parts = PART_OF_CAS.reduce((sum, key) => sum + (Number(next[key]) || 0), 0);
  return parts > (Number(next.casualties) || 0) ? null : next;
}

/** The MVPs after a chip, a radio or a star: one MVP replaced, two at most of different players, only those the step offers. */
function nextMvps(model, draft, { playerId, on }) {
  const choices = mvpChoices(withDraft(model, draft), model.sideName);
  if (![...choices.top, ...choices.rest].some((choice) => choice.id === playerId)) return draft.mvps;
  const others = draft.mvps.filter((id) => id !== playerId);
  if (!on) return others;
  if (choices.count === 1) return [playerId];
  return others.length < choices.count ? [...others, playerId] : draft.mvps;
}

/** An injury after a choice: a Lasting one keeps its characteristic and «rest of the season», any other is `{code, retire: false}`. */
function nextInjury(before, { kind, code, stat, on }) {
  const lasting = before?.code === "lasting";
  if (kind === "injury") {
    if (!INJURIES.includes(code)) return before;
    if (code !== "lasting") return { code, retire: false };
    return { code, ...(lasting && before.stat ? { stat: before.stat } : {}), retire: lasting ? before.retire : false };
  }
  if (!lasting) return before;
  if (kind === "stat") return PLAYER_STATS.includes(stat) ? { code: "lasting", stat, retire: before.retire } : before;
  return { ...before, retire: Boolean(on) };
}

/**
 * The step's draft after one press (pre-flight L2): a new draft in the very shape `playersDraft` gives and the domain's
 * `saveStatistics` keeps — every counter of every player, an injury as `{code, stat?, retire}` («No injury» is
 * `{code: "none", retire: false}`), the MVPs the step offers, a veteran's die only for the side that conceded in full —
 * so the answer to the write it makes is equal to it. A press the domain would refuse or drop (crowd and foul past CAS,
 * a third MVP, a departure of a player who is not a veteran) leaves the draft as it was. Pure.
 * @param {ReturnType<typeof import("./post-model.mjs").postModel>} model @param {ReturnType<typeof playersDraft>} draft
 * @param {{kind: "counter"|"mvp"|"injury"|"stat"|"retire"|"departure", playerId: string, counter?: string, delta?: number,
 *   on?: boolean, code?: string, stat?: string, die?: number}} change
 * @returns {ReturnType<typeof playersDraft>}
 */
export function changePlayers(model, draft, change) {
  const id = change.playerId;
  if (!Object.hasOwn(draft.statistics, id)) return draft;
  const next = { statistics: { ...draft.statistics }, injuries: { ...draft.injuries }, mvps: [...draft.mvps], departures: { ...draft.departures } };
  if (change.kind === "counter") {
    const counts = nextCounts(draft.statistics[id], change.counter, Number(change.delta) || 0);
    if (!counts) return draft;
    next.statistics[id] = counts;
  } else if (change.kind === "mvp") next.mvps = nextMvps(model, draft, change);
  else if (["injury", "stat", "retire"].includes(change.kind)) {
    const injury = nextInjury(draft.injuries[id], change);
    if (!injury) return draft;
    next.injuries[id] = injury;
  } else if (change.kind === "departure") {
    const die = Number(change.die);
    const veteran = model.post[model.sideName].baseRoster.players.some((player) => player.id === id && (player.advancements ?? []).length >= 3);
    if (!lostConceding(model) || !veteran || !Number.isInteger(die) || die < 1 || die > 6) return draft;
    next.departures[id] = die;
  } else return draft;
  return next;
}

/** Whether the draft can be written: every Lasting Injury names its characteristic (the domain refuses one that does not). */
export const playersSendable = (draft) => Object.values(draft.injuries).every((injury) => injury.code !== "lasting" || PLAYER_STATS.includes(injury.stat));

/**
 * The player's sheet (`dialog#after-player`): a stepper for every counter of the match — crowd and foul casualties part
 * of CAS, worth nothing of their own (L19: said under them) and never more than it —, then the injury, closed when the
 * step reads only. A phone's steppers are two-row cells, a desk's tiles (DeskRosterLive.html's).
 */
export function playerSheetMarkup(model, draft, playerId, { phone }) {
  const side = model.post[model.sideName], player = side.snapshot.players.find((item) => item.id === playerId);
  if (!player) return "";
  const weights = sppCounterWeights(side.reference), stats = draft.statistics[playerId] ?? {};
  const value = (counter) => Number(stats[counter]) || 0;
  const parts = value("crowdCasualties") + value("foulCasualties");
  const lockedReason = model.readonly ? t("after.playersLocked") : "";
  const steppers = POST_STATS.map((counter) => renderActionStepper({
    key: counter, label: t(`after.stat.${counter}`), name: t(`after.statName.${counter}`), spp: PART_OF_CAS.includes(counter) ? 0 : weights[counter] ?? 0,
    value: value(counter), player: player.name, compact: phone, tile: !phone, data: { sheetPlayer: playerId }, lockedReason,
    decDisabled: counter === "casualties" ? value(counter) <= parts : value(counter) <= 0,
    incBlockedReason: PART_OF_CAS.includes(counter) && parts >= value("casualties") ? t("after.casFirst") : "",
  })).join("");
  const injury = player.kind === "star" ? "" : `${labelMarkup(t("after.injuryLabel"))}${injuryControls(model, draft, playerId, model.readonly)}`;
  const bodyHtml = `<div class="g-after__${phone ? "counters" : "tiles"}">${steppers}</div>${noteMarkup(t("after.partOfCasNote"))}${injury}`;
  return renderSheet({ id: PLAYERS_SHEET, title: who(player), sub: positionOf(player), bodyHtml, wide: !phone });
}
