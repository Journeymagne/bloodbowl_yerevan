/**
 * Every press of the post-match 3.0 (stage 09b, pre-flight L12: the screen's lifecycle is post.mjs's, its presses this
 * module's), heard on the view, which outlives each draw. A press changes a step's draft or writes; what it writes and
 * when is post.mjs's (`screen.send`, `screen.players`), what the page keeps is the visit's (`visit.ui`).
 *
 * - The frame's buttons (`data-prep-action`): the step's own write, its draft in the body — the score as the domain
 *   takes it (`resultAction`), the income's dice and switches, the deposit and the dice of the treasury, the captain —;
 *   «Change the score…», «Change from «Income»…» and «Start over with the current roster» ask first (`confirmAction`);
 *   «Finish the match» is the finish. The footer's button takes no press until it is armed (`visit.footerAfter`) and no
 *   key's auto-repeat: a double click on «Confirm the summary» is not «Finish the match».
 * - Kept on the page: the score's steppers, how the match ended, who won and why a technical result (stage 12); the
 *   income's faces and switches; the safe's counter and the Expensive Mistakes' faces; the captain.
 * - The Players step, press by press (`changePlayers`): the MVP (a radio of one group, or a button pressed), the injury,
 *   the characteristic, «Out for the rest of the season», a veteran's die, a counter of the player's sheet. A row of the
 *   events (or a desk's name) opens the player's sheet, which gives the focus back to it when it closes; a stepper in it
 *   names its player apart (`data-sheet-player`, pre-flight L6), so a press never opens it again.
 * - The Roster step, each press a write: a staff counter, a position of the hiring sheet, a player of the selling sheet,
 *   «Keep», Raise Dead, «Undo the last».
 * - The advancement (Task 10): «Advance» opens the roster's sheet, heard as the roster hears it (`wireAdvance`,
 *   `wireReasons`), its presses post-advance.mjs's; «Undo» on a card takes the player's last advancement off.
 * - An administrator's side (`prep-side`): the page is the other side's, its drafts dropped. A press on what is closed
 *   (`aria-disabled`) says why. The width crossing 900px draws the other form, the focus kept or on the title.
 */
import { toast } from "../../components/toast.mjs";
import { drawKeepingFocus, listenerGroup } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { view } from "../../core/view.mjs";
import { wireActionSteppers } from "../../ui/action-stepper.mjs";
import { wireRadioGroups } from "../../ui/choice.mjs";
import { wireResourceCounters } from "../../ui/resource-counter.mjs";
import { wireSegmentedControls } from "../../ui/segmented-control.mjs";
import { confirmAction, wireSheets } from "../../ui/sheet.mjs";
import { wireStepButtons } from "../../ui/stepper.mjs";
import { wireToggles } from "../../ui/toggle.mjs";
import { onPhoneChange } from "../team/roster/screen.mjs";
import { ADVANCE_SHEET } from "../team/roster/sheets.mjs";
import { wireAdvance, wireReasons } from "../team/roster/wire.mjs";
import { postAdvanceHandlers, postAdvancePlayer } from "./post-advance.mjs";
import { playersSendable } from "./post-players.mjs";
import { resultAction } from "./post-steps.mjs";

/** The most a stepper of the score counts to (`postCount`), and the most the safe takes from one match. */
const MOST = 99;
const SAFE_MOST = 50;

/** The score's counters a stepper may change: ours or theirs, TD or CAS. */
const SCORE_KEYS = Object.freeze({ own: ["touchdowns", "casualties"], other: ["touchdowns", "casualties"] });

/** Whether a control is closed with a reason (`aria-disabled`), which a press says rather than acts on. */
const closed = (element) => element.getAttribute("aria-disabled") === "true";

/** A number kept within `most` and nothing. */
const within = (value, most) => Math.min(most, Math.max(0, value));

/** The radio groups under the view: `group` a group's selector, `item` its items' attribute, `onChange(value, group)`. */
const radios = (group, item, onChange) => wireRadioGroups(view, { group, item: `[${item}]`, attribute: item, onChange });

/** Ask the coach first; the answer is a yes or a no. */
const ask = (message) => confirmAction({ message });

/** The write a frame's button makes: the step's own, from its draft where it keeps one. */
function actionOf(screen, model, type) {
  if (type === "result") return resultAction(model, screen.draftOf("result", model));
  if (type === "fans") {
    const { roll, technicalRoll, painted, stalling } = screen.draftOf("fans", model);
    return { type, roll, technicalRoll, painted, stalling };
  }
  if (type === "finance") {
    const { deposit, roll, first, second } = screen.draftOf("finance", model);
    return { type, deposit, mistake: { roll, first, second } };
  }
  if (type === "next") return { type, captain: screen.draftOf("next", model).captain };
  return { type };
}

/**
 * A frame's button pressed («How each write goes»): the ones that undo what is done ask first — «Change the score…»
 * only opens the steppers —; «Next: roster» waits for a Lasting Injury's characteristic, which the draft has not sent.
 */
async function act(visit, screen, action) {
  const model = screen.model();
  if (action === "unlock-result") {
    if (!await ask(t("after.changeAsk"))) return;
    visit.ui.unlocked = true;
    screen.draw();
    return;
  }
  if (action === "reopen" || action === "reset-side") {
    if (await ask(t(action === "reopen" ? "after.reopenAsk" : "after.resetAsk"))) await screen.send({ type: action });
    return;
  }
  if (action === "finish") {
    await screen.send(undefined, { finish: true });
    return;
  }
  if (action === "lock-players" && !playersSendable(screen.playersOf(model))) {
    toast(t("after.statFirst"));
    return;
  }
  await screen.send(actionOf(screen, model, action));
}

/** The frame's buttons: a held key presses once, the footer's button only once armed. */
function wireFrame(visit, screen, events) {
  events.on("keydown", "[data-prep-action]", (event) => {
    if (event.repeat) event.preventDefault();
  });
  events.on("click", "[data-prep-action]", (event, button) => {
    if (button.hasAttribute("disabled") || closed(button)) return;
    // A footer's button not armed yet: the rest of a double click on what it was a moment ago.
    if (button.classList.contains("g-prep__cta") && Date.now() < visit.footerAfter) return;
    void act(visit, screen, button.getAttribute("data-prep-action"));
  });
}

/** The score's steppers, how the match ended, who won and why a technical result: the score's draft. */
function wireScore(screen, events) {
  const change = (update) => {
    const model = screen.model(), draft = screen.draftOf("result", model);
    screen.keep("result", { ...draft, ...update(draft) });
  };
  events.own(wireStepButtons(view, "score", ({ key, delta }) => {
    const [which, counter] = key.split(":");
    if (!SCORE_KEYS[which]?.includes(counter)) return;
    change((draft) => ({ [which]: { ...draft[which], [counter]: within(draft[which][counter] + delta, MOST) } }));
  }));
  events.own(radios("[data-after-mode]", "data-mode", (mode) => change(() => ({ mode }))));
  events.own(wireSegmentedControls(view, (winner) => change(() => ({ winner })), { group: "after-winner" }));
  events.own(radios("[data-after-reason]", "data-reason", (reason) => change(() => ({ reason }))));
}

/** The income's faces and switches, «Out for the rest of the season», the treasury's faces, the captain. */
function wireKept(screen, events) {
  const keep = (key, update) => screen.keep(key, { ...screen.draftOf(key, screen.model()), ...update });
  events.own(radios("[data-after-fans]", "data-die", (value) => keep("fans", { roll: Number(value) })));
  events.own(radios("[data-after-technical]", "data-die", (value) => keep("fans", { technicalRoll: Number(value) })));
  events.own(wireToggles(view, (key, on) => {
    if (key === "stalling" || key === "painted") keep("fans", { [key]: on });
    else if (key.startsWith("retire:")) screen.players({ kind: "retire", playerId: key.slice("retire:".length), on });
  }));
  // Another face of the D6 may be another kind of mistake: the dice after it start again.
  events.own(radios("[data-after-mistake]", "data-die", (value) => keep("finance", { roll: Number(value), first: null, second: null })));
  events.own(radios("[data-after-extra]", "data-die", (value, group) => keep("finance", { [group.getAttribute("data-after-extra")]: Number(value) })));
  events.own(radios("[data-after-captain]", "data-captain", (captain) => keep("next", { captain })));
}

/** The Players step: the MVP, the injuries, a veteran's die, the sheet's counters — each a write of the step's draft. */
function wirePlayers(visit, screen, events) {
  const { players } = screen;
  events.own(radios('.g-after__mvp[role="radiogroup"]', "data-after-mvp", (playerId) => players({ kind: "mvp", playerId, on: true })));
  events.on("click", "[data-after-mvp][aria-pressed]", (event, button) => {
    if (!closed(button)) players({ kind: "mvp", playerId: button.getAttribute("data-after-mvp"), on: button.getAttribute("aria-pressed") !== "true" });
  });
  events.own(radios("[data-after-injury]", "data-code", (code, group) => players({ kind: "injury", playerId: group.getAttribute("data-after-injury"), code })));
  events.own(radios("[data-after-stat]", "data-stat", (stat, group) => players({ kind: "stat", playerId: group.getAttribute("data-after-stat"), stat })));
  events.own(radios("[data-after-departure]", "data-die", (die, group) => players({ kind: "departure", playerId: group.getAttribute("data-after-departure"), die: Number(die) })));
  events.own(wireActionSteppers(view, ({ key, delta, element }) => players({ kind: "counter", playerId: element.getAttribute("data-sheet-player") ?? "", counter: key, delta }),
    { onRefused: ({ reason }) => toast(reason) }));
  events.on("click", "[data-after-player]", (event, button) => openSheet(visit, screen, { kind: "player", playerId: button.getAttribute("data-after-player") }, button));
  events.on("click", "[data-after-rest]", () => {
    visit.ui.open = !visit.ui.open;
    screen.draw();
  });
}

/** The Roster step's presses, each a write; a sheet's pick closes it first. The safe's counter is the treasury's draft. */
function wireRoster(visit, screen, events) {
  const write = (operation) => void screen.send({ type: "roster", ...operation });
  const pick = (selector, operation) => events.on("click", selector, (event, button) => {
    if (closed(button)) return;
    if (visit.ui.sheet) closeSheet(visit, screen);
    write(operation(button));
  });
  events.own(wireResourceCounters(view, ({ key, delta }) => {
    if (key !== "deposit") write({ operation: "staff", key, delta });
    else {
      const draft = screen.draftOf("finance", screen.model());
      screen.keep("finance", { ...draft, deposit: within(draft.deposit + delta, SAFE_MOST) });
    }
  }, { onRefused: ({ reason }) => toast(reason) }));
  events.on("click", "[data-after-open]", (event, button) => {
    if (!closed(button)) openSheet(visit, screen, { kind: button.getAttribute("data-after-open") }, button);
  });
  pick("[data-after-hire]", (button) => ({ operation: "hire", rowIndex: Number(button.getAttribute("data-after-hire")) }));
  pick("[data-after-raise]", (button) => ({ operation: "raise", rowIndex: Number(button.getAttribute("data-after-raise")) }));
  pick("[data-after-sell]", (button) => ({ operation: "sell", playerId: button.getAttribute("data-after-sell") }));
  pick("[data-after-keep]", (button) => ({ operation: "keep", playerId: button.getAttribute("data-after-keep") }));
}

/**
 * The advancement: «Advance» and its sheet as the roster hears them, the post-match lending its take, its dice and its
 * bind (post-advance.mjs); «Undo» on a card, a write. Its presses are given back for the sheets' «Back».
 */
function wireAdvancement(visit, screen, events) {
  const handlers = postAdvanceHandlers(visit, screen);
  // «Done» and «Cancel» close it as the page's own sheets close (`closeSheet`): the focus never left to the draw's
  // fallback, the footer's «Next», when his «Advance» is gone with his last affordable advancement.
  const close = () => closeSheet(visit, screen);
  for (const off of wireAdvance(view, { ...handlers, onAdvanceDone: close, onAdvanceKeep: close })) events.own(off);
  events.own(wireReasons(view, { onInjuryChoice() {}, onMarkChoice() {}, onAdvanceType: handlers.onAdvanceType }));
  events.on("click", "[data-after-untake]", (event, button) => {
    if (!closed(button)) void screen.send({ type: "undo-advance", playerId: button.getAttribute("data-after-untake") });
  });
  return handlers;
}

/** Open a sheet (`player` with its id, `hire`, `sell`) over the step, `opener` taking the focus back when it closes. */
function openSheet(visit, screen, sheet, opener) {
  Object.assign(visit.ui, { sheet: { ...sheet, step: screen.model().step }, opener });
  screen.draw();
}

/**
 * Close the sheet: the focus back on what opened it (or on its row, or its «Advance», drawn again — or, his last
 * advancement taken, on what the sheet made: his card's «Undo»), else on the title.
 */
function closeSheet(visit, screen) {
  const { sheet, opener } = visit.ui;
  Object.assign(visit.ui, { sheet: null, opener: null });
  screen.draw({ refocus: false });
  const named = (attribute, value) => [...view.querySelectorAll(`[${attribute}]`)].find((element) => element.getAttribute(attribute) === value);
  const advanced = () => named("data-player-advance", sheet.key) ?? named("data-after-untake", postAdvancePlayer(visit, sheet.key));
  const again = sheet?.kind === "player" ? named("data-after-player", sheet.playerId)
    : sheet?.kind === "advance" ? advanced() : view.querySelector(`[data-after-open="${sheet?.kind}"]`);
  (opener?.isConnected ? opener : again ?? view.querySelector("h1"))?.focus();
}

/** Why a closed control is closed: its title, its own line, else that the post-match or the step reads only. */
function refusalOf(screen, element) {
  const why = element.getAttribute("title") || element.querySelector(".g-after__why")?.textContent || "";
  if (why) return why;
  return t(screen.model().completed ? "after.completed" : "after.passed");
}

/** An administrator's side, the closed controls, the sheets (the advancement's «Back» its own), the width. */
function wireCommon(visit, screen, events, advance) {
  events.own(wireSegmentedControls(view, (side) => {
    visit.sideName = side;
    Object.assign(visit.ui, { error: "", drafts: { result: null, fans: null, players: null, finance: null, next: null }, playersWaiting: false, unlocked: false, sheet: null, opener: null });
    screen.draw();
  }, { group: "prep-side" }));
  // A counter's step says it through `onRefused`, the advancement's buttons and ways their own presses (advance.mjs);
  // every other closed control here — the advancement's closed choices too, as the roster's `[data-roster-closed]`.
  events.on("click", '[aria-disabled="true"]', (event, element) => {
    if (element.hasAttribute("data-resource-step") || element.hasAttribute("data-action-step")) return;
    if (element.closest(`#${ADVANCE_SHEET}`) && !element.hasAttribute("data-roster-closed")) return;
    event.preventDefault();
    toast(refusalOf(screen, element));
  });
  events.own(wireSheets(view, { onClose: () => closeSheet(visit, screen), onBack: (id) => advance.onSheetBack(id) }));
  events.own(onPhoneChange(() => drawKeepingFocus(view, () => screen.draw({ refocus: false }), "h1")));
}

/**
 * Every press of the page. `screen` is post.mjs's: `model()`, `draw(options)`, `send(action, options)`, `players(change)`,
 * `keep(key, draft)`, `draftOf(key, model)`, `playersOf(model)`, `readAgain()`.
 * @returns {() => void} takes every listener off
 */
export function wirePost(visit, screen) {
  const events = listenerGroup(view);
  wireFrame(visit, screen, events);
  wireScore(screen, events);
  wireKept(screen, events);
  wirePlayers(visit, screen, events);
  wireRoster(visit, screen, events);
  wireCommon(visit, screen, events, wireAdvancement(visit, screen, events));
  return () => events.release();
}
