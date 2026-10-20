/**
 * A player put right by hand (stage 07d; owner, 2026-10-19: what only the 2.x editor could do moves into 3.0): the
 * Niggling Injuries as a count, a lasting injury marked by mistake, a characteristic, the extended contracts, the
 * favoured skills and a skill no advancement gave — what was settled at the table otherwise than the site recorded. The
 * form lives on the visit, as the edit's does, and «Save» is one step of the save queue; never during a match (R8).
 *
 * No prototype: the frame is the edit's (PlayerEdit.html, DeskRosterEdit.html; player-sheets.css's `.g-player-sheet`),
 * its counters stage 08's «Ресурсы» (TeamManage.html; `renderResourceCounter` as it is), its skills chips that are
 * pressed or not (`aria-pressed`). The edit's last line opens it (player-sheets.mjs), and the focus goes back to the
 * pencil the edit was opened from. Every step of the form asks the domain first (`fixRefusal`): one it refuses is said,
 * and the form stays as it was.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { toast } from "../../../components/toast.mjs";
import { extendedContractCost } from "../../../domain/league-rules.mjs";
import { playerCurrentCost } from "../../../domain/roster/costs.mjs";
import {
  MAX_CONTRACTS, MAX_NIGGLING, applyFix, favouredBonus, fixFormOf, fixRefusal, legacySkills,
} from "../../../domain/roster/edits.mjs";
import { favouredSkillNames } from "../../../domain/roster/players.mjs";
import { PLAYER_STATS, countToNumber, rowsForTeam, statValueForDisplayByStat } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { dataAttributes } from "../../../ui/markup.mjs";
import { renderResourceCounter } from "../../../ui/resource-counter.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { closeSheet } from "./injury.mjs";
import { prepResetWords } from "./panel.mjs";
import { editClosed } from "./player-access.mjs";
import { editCheck } from "./player-sheets.mjs";
import { fixPlayer, refusalWordsOf } from "./save.mjs";
import { FIX_SHEET, footButton } from "./sheets.mjs";

/** The frame every sheet of a player's wears (player-sheets.css). */
const FRAME = "g-player-sheet";
/** What a counter of the fix is reported by (wireResourceCounters): `fix:niggling`, `fix:contracts`, `fix:stat:<stat>`. */
const STAT_KEY = "fix:stat:";

/** A refusal of the fix in the player's words (`teamPlayer.refusal.*`). */
const wordsOf = (refusal) => refusalWordsOf("teamPlayer", refusal);
/** `list` with `item` added, or taken out when it is there. */
const flipped = (list, item) => (list.includes(item) ? list.filter((each) => each !== item) : [...list, item]);
/** `record` with `key` moved by `delta`; a key left at zero goes. */
function moved(record, key, delta) {
  const next = { ...record, [key]: (record[key] ?? 0) + delta };
  if (!next[key]) delete next[key];
  return next;
}

/**
 * The fix as it stands on the draft (`applyFix` on a copy): why the roster would refuse it, whether it changes anything,
 * and the player as he is (`before`) and as it leaves him (`after`; as he is while it is refused), with his position.
 *
 * @param {{race: object, draft: object}} where the screen as drawn, or as it stands at a press
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("../../../domain/roster/edits.mjs").PlayerFix} form
 */
function fixCheck({ race, draft }, line, form) {
  const copy = structuredClone(draft);
  const answer = applyFix(race, copy, line.id, form);
  const before = draft.players[line.index];
  return {
    refusal: answer.applied ? null : answer, changed: answer.applied && answer.changed, before,
    after: answer.applied ? copy.players[line.index] : before, row: rowsForTeam(race)[Number(before.rowIndex)],
  };
}

/** A block of the fix: its title over what it holds; one whose single row names it has none ("": the same words twice). */
function blockMarkup(title, html) {
  const head = title ? `<h3 class="g-player-fix__title">${escapeHtml(title)}</h3>` : "";
  return `<section class="g-player-fix__block">${head}${html}</section>`;
}

/** A chip that is pressed or not: an injury's point to take off, a favoured skill to add or take off, a skill to take off. */
function toggleMarkup({ label, pressed, data, describedBy = "" }) {
  const described = describedBy ? ` aria-describedby="${escapeHtml(describedBy)}"` : "";
  return `<button type="button" class="g-player-fix__toggle" aria-pressed="${pressed}"${described}${dataAttributes(data)}>${escapeHtml(label)}</button>`;
}

/** A line of words with its chip at the right, as a counter's row: the chip names it by its id (`aria-describedby`). */
function rowMarkup({ id, name, ...toggle }) {
  return `<div class="g-player-fix__row"><span class="g-player-fix__name" id="${escapeHtml(id)}">${escapeHtml(name)}</span>`
    + `${toggleMarkup({ ...toggle, describedBy: id })}</div>`;
}

/**
 * «Injuries»: the Niggling Injuries as a count, up to `MAX_NIGGLING`; each lasting injury with «Take one off», a point
 * a press — and, under them, that only what was marked by mistake is taken off.
 */
function injuriesMarkup(line, form) {
  const niggling = renderResourceCounter({
    key: "fix:niggling", name: t("teamPlayer.fix.niggling"), value: form.niggling,
    incBlockedReason: form.niggling >= MAX_NIGGLING ? wordsOf({ code: "NIGGLING_RANGE", params: { max: MAX_NIGGLING } }) : "",
  });
  const lasting = line.injuries.lasting.map(({ stat, count }) => rowMarkup({
    id: `player-fix-lasting-${stat}`, name: t("teamPlayer.lasting", { stat: t(`stats.${stat}`), count }),
    label: t("teamPlayer.fix.heal"), pressed: Boolean(form.lasting[stat]), data: { fixLasting: stat },
  }));
  const note = lasting.length ? `<p class="g-player-fix__note">${escapeHtml(t("teamPlayer.fix.healNote"))}</p>` : "";
  return blockMarkup(t("teamPlayer.fix.injuries"), `${niggling}${lasting.join("")}${note}`);
}

/**
 * «Characteristics»: each as it is after the fix, the form's correction beside it; a step the domain refuses closed —
 * «−» plainly, «+» saying why (the rule's limit) — and one the position has none of closed, saying so.
 */
function statsMarkup(line, fix, form, probe) {
  const counters = PLAYER_STATS.map((stat) => {
    const name = t(`stats.${stat}`), step = form.stats[stat] ?? 0;
    const tried = (delta) => probe({ stats: moved(form.stats, stat, delta) });
    if (!Number.isFinite(parseInt(fix.row[stat], 10))) {
      return renderResourceCounter({ key: `${STAT_KEY}${stat}`, name, value: line.stats[stat].text, lockedReason: wordsOf({ code: "STAT_NONE", params: { stat } }) });
    }
    const refused = tried(1);
    return renderResourceCounter({
      key: `${STAT_KEY}${stat}`, name, value: statValueForDisplayByStat(stat, fix.row[stat], countToNumber(fix.after.statMods?.[stat])),
      note: step > 0 ? `+${step}` : step < 0 ? `−${-step}` : "", decDisabled: Boolean(tried(-1)), incBlockedReason: refused ? wordsOf(refused) : "",
    });
  });
  return blockMarkup(t("teamPlayer.fix.stats"), counters.join(""));
}

/** «Extended contracts»: a count up to `MAX_CONTRACTS`, each +20k to his value — its row is its title. */
function contractsMarkup(form) {
  return blockMarkup("", renderResourceCounter({
    key: "fix:contracts", name: t("teamPlayer.fix.contracts"), note: t("teamPlayer.fix.contractNote", { cost: extendedContractCost }), value: form.contracts,
    incBlockedReason: form.contracts >= MAX_CONTRACTS ? wordsOf({ code: "CONTRACTS_RANGE", params: { max: MAX_CONTRACTS } }) : "",
  }));
}

/**
 * «Favoured of …», only for a roster whose race knows the god it chose (`favouredBonus`): his own favoured skills, each
 * with «Take off»; under them the god's skills he lacks, each a chip «Add …».
 */
function favouredMarkup(where, fix, form) {
  const bonus = favouredBonus(where.race, where.draft, fix.row, fix.before);
  if (!bonus) return "";
  const own = [...favouredSkillNames(fix.row, fix.before)].map((skill, at) => rowMarkup({
    id: `player-fix-favoured-${at}`, name: skill, label: t("teamPlayer.fix.remove"), pressed: form.favoured.remove.includes(skill), data: { fixFavoured: skill },
  }));
  const offered = bonus.skills.filter(({ held }) => !held).map(({ name }) => toggleMarkup({
    label: t("teamPlayer.fix.add", { skill: name }), pressed: form.favoured.add.includes(name), data: { fixFavoured: name },
  }));
  const chips = offered.length ? `<div class="g-player-fix__chips">${offered.join("")}</div>` : "";
  return blockMarkup(t("teamPlayer.fix.favoured", { alignment: bonus.alignment }), `${own.join("")}${chips}`);
}

/** «Skills without an advancement», only when he holds one (`legacySkills`): each with «Take off». */
function legacyMarkup(fix, form) {
  const skills = legacySkills(fix.row, fix.before);
  if (!skills.length) return "";
  return blockMarkup(t("teamPlayer.fix.legacy"), skills.map((skill, at) => rowMarkup({
    id: `player-fix-legacy-${at}`, name: skill, label: t("teamPlayer.fix.remove"), pressed: form.dropSkills.includes(skill), data: { fixDrop: skill },
  })).join(""));
}

/** «Player's value: 95k → 125k», the value after the fix bold: said as it changes (`role="status"`). */
function valueMarkup(before, after) {
  const mark = "\u0000";
  const words = escapeHtml(t("teamPlayer.fix.value", { before: formatMoney(before), after: mark }));
  return `<p class="g-player-fix__value" role="status">${words.replace(mark, `<b class="g-player-fix__after">${escapeHtml(formatMoney(after))}</b>`)}</p>`;
}

/**
 * His fix by hand, in the edit's frame (no prototype; a sheet from the bottom on a phone, a 480px window on a desk): its
 * blocks — injuries, characteristics, contracts, his favour, the skills no advancement gave — and his value before and
 * after; during a preparation what a save resets (R12), and the last refusal of «Save» — or, should a read have made the
 * form one the roster refuses, why. «Cancel» and «Save», which waits for a whole, changed form; closed (`reason`), it
 * says why.
 *
 * @param {object} props
 * @param {import("./model.mjs").PlayerLine} props.line the player, on the roster
 * @param {import("./view.mjs").RosterScreen} props.screen
 * @param {{form: import("../../../domain/roster/edits.mjs").PlayerFix, refusal?: string, reason?: string}} props.sheet
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#player-fix")` opens it
 */
export function fixSheetMarkup({ line, screen, sheet }) {
  const { form, refusal = "", reason = "" } = sheet;
  const fix = fixCheck(screen, line, form);
  const probe = (change) => fixRefusal(screen.race, screen.draft, line.id, { ...form, ...change });
  const blocks = [injuriesMarkup(line, form), statsMarkup(line, fix, form, probe), contractsMarkup(form), favouredMarkup(screen, fix, form), legacyMarkup(fix, form)];
  const prep = screen.mode.kind === "prep" ? `<p class="g-player-sheet__prep">${escapeHtml(prepResetWords())}</p>` : "";
  const said = refusal || (fix.refusal ? wordsOf(fix.refusal) : "");
  const alert = said ? `<p class="g-player-sheet__refusal" role="alert">${escapeHtml(said)}</p>` : "";
  return renderSheet({
    id: FIX_SHEET,
    className: FRAME,
    title: t("teamPlayer.fix.title"),
    sub: t("teamPlayer.fix.sub"),
    bodyHtml: `${blocks.join("")}${valueMarkup(line.value, playerCurrentCost(fix.row, fix.after))}${prep}${alert}`,
    footStartHtml: renderButton({ label: t("teamPlayer.edit.cancel"), data: { fixKeep: true } }),
    footHtml: footButton({ label: t("teamPlayer.edit.save"), kind: "primary", data: { fixSave: true }, disabled: !reason && (Boolean(fix.refusal) || !fix.changed), reason }),
  });
}

/**
 * The player of `key` as the screen stands at the press (`now`), never one of the fallen: his line, the stored player,
 * the screen, and why his fix cannot be saved just now (`editClosed`, "" when it can); null when he is not on the roster.
 */
function playerAt(now, key) {
  const where = now();
  const line = where.lines.find((item) => item.key === key && !item.fallen) ?? null;
  const stored = line ? where.draft.players[line.index] : null;
  return stored ? { line, stored, where, row: rowsForTeam(where.race)[Number(stored.rowIndex)], reason: editClosed(line, where) } : null;
}

/**
 * «Save»: only from the fix that is open — a press that finds none is a second press, and sends nothing. Why it is
 * closed is asked again, then the form as the draft stands: one the roster would refuse, or that changes nothing, sends
 * nothing («Save» is shut). Then one step of the queue (`fixPlayer`) and, in the same turn, the sheet closes, the focus
 * back on the pencil, the player drawn at once from the draft. A refusal (another tab's coach, the rules a 422 left the
 * queue on) is said in the sheet, which stays; one of the queue's 422 asks for the server's roster again (`refused`).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => object, refused: () => void}} lent
 */
function saveFix(saving, { now, refused }) {
  const { teamId, visit, draw } = saving;
  const { sheet } = visit;
  const player = sheet?.kind === "fix" ? playerAt(now, sheet.key) : null;
  if (!player) return;
  if (player.reason) {
    toast(player.reason);
    return;
  }
  const { refusal, changed } = fixCheck(player.where, player.line, sheet.form);
  if (refusal || !changed) return;
  const answer = fixPlayer(teamId, player.where.race, player.line.id, structuredClone(sheet.form), { closed: () => editClosed(player.line, now()) });
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  closeSheet(saving);
}

/** The form after a press of a counter's − or + (`fix:niggling`, `fix:contracts`, `fix:stat:<stat>`), or null for another key. */
function stepped(form, key, delta) {
  if (key === "fix:niggling") return { ...form, niggling: form.niggling + delta };
  if (key === "fix:contracts") return { ...form, contracts: form.contracts + delta };
  return key.startsWith(STAT_KEY) ? { ...form, stats: moved(form.stats, key.slice(STAT_KEY.length), delta) } : null;
}

/**
 * A favoured skill pressed: one of his own goes to those taken off and back, one of the god's he lacks to those added
 * and back; any other changes nothing (null).
 */
function favouredFlipped(form, { row, stored, where }, skill) {
  if (favouredSkillNames(row, stored).has(skill)) return { ...form, favoured: { ...form.favoured, remove: flipped(form.favoured.remove, skill) } };
  const offered = favouredBonus(where.race, where.draft, row, stored)?.skills.some(({ name, held }) => name === skill && !held);
  return offered ? { ...form, favoured: { ...form.favoured, add: flipped(form.favoured.add, skill) } } : null;
}

/**
 * What the fix's presses do (wire.mjs): the edit's last line opens it in the edit's place — only from the edit that is
 * open, unless something closes it just now or the edit's fields are changed (said instead); a counter's step, an
 * injury's point, a favoured skill and a skill to take off change the form when the domain takes it (`fixRefusal`),
 * else the refusal is said and the form stays; the last refusal of «Save» goes with the form it was said of. «Cancel»
 * closes it, the focus back on the pencil; «Save» saves it (`saveFix`).
 *
 * @param {import("./index.mjs").Saving} saving the visit's side of the queue
 * @param {{now: () => object, refused: () => void}} lent the screen as it stands at the press, and the read again after a refusal
 */
export function fixHandlers(saving, lent) {
  const { visit, draw } = saving;
  // The fix that is open, changed: the same sheet, so that an answer on its way still finds it.
  const change = (next) => {
    const sheet = visit.sheet?.kind === "fix" ? visit.sheet : null;
    const player = sheet ? playerAt(lent.now, sheet.key) : null;
    const form = player ? next(sheet.form, player) : null;
    if (!form) return;
    const refusal = fixRefusal(player.where.race, player.where.draft, player.line.id, form);
    if (refusal) toast(wordsOf(refusal));
    else Object.assign(sheet, { form, refusal: "" });
    draw();
  };
  return {
    onFixOpen: (key) => {
      const { sheet } = visit;
      const player = sheet?.kind === "edit" && sheet.key === key ? playerAt(lent.now, key) : null;
      if (!player) return;
      const reason = player.reason || (editCheck(player.where.draft, player.line, sheet.form).changed ? t("teamPlayer.fix.saveFirst") : "");
      if (reason) toast(reason);
      else {
        visit.sheet = { kind: "fix", key, form: fixFormOf(player.stored), refusal: "" };
        draw();
      }
    },
    onFixStep: ({ key, delta }) => change((form) => stepped(form, key, delta)),
    // One point a press, off or back: never more than the injury took (`healInjuries`), and only for an injury he has.
    onFixLasting: (stat) => change((form, { line }) => (line.injuries.lasting.some((each) => each.stat === stat)
      ? { ...form, lasting: moved(form.lasting, stat, form.lasting[stat] ? -1 : 1) } : null)),
    onFixFavoured: (skill) => change((form, player) => favouredFlipped(form, player, skill)),
    onFixDrop: (skill) => change((form) => ({ ...form, dropSkills: flipped(form.dropSkills, skill) })),
    onFixKeep: () => {
      if (visit.sheet?.kind === "fix") closeSheet(saving);
    },
    onFixSave: () => saveFix(saving, lent),
  };
}
