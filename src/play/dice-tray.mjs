import { BLOCK_FACES, FACE_LABELS, teamName } from "./model.mjs";
import { rerollOptions, rollPassed } from "./rolls.mjs";
import { diceFace } from "./dice-faces.mjs";
import { tableText } from "./copy.mjs";
import { canAct, escapeHtml } from "./render.mjs";

const trayById = id => document.getElementById(id);
const diceNotation = request => request.kind === "block" ? `${request.count} Block` : `${request.count}D${request.sides}`;
const diceCommand = (type, label, disabled, extra = "", primary = false) =>
  `<button type="button" data-dice-command="${type}" ${extra} ${disabled ? "disabled" : ""} class="${primary ? "primary" : ""}">${escapeHtml(label)}</button>`;

function trayDie(request, value, index, selectable, disabled, animate, ghost) {
  const face = request.kind === "block" ? BLOCK_FACES[value - 1] : value;
  const label = request.kind === "block" ? FACE_LABELS[face] : `D${request.sides}: ${value}`;
  const tag = selectable ? "button" : "div";
  return `<${tag} class="tray-die ${request.kind} ${animate ? "die-arriving" : ""} ${ghost ? "die-ghost" : ""}"
    style="--die-index:${index};--die-angle:${[-8, 7, -3][index % 3]}deg"
    ${selectable ? `data-face="${index}" ${disabled ? "disabled" : ""} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"` : 'aria-hidden="true"'}>
    ${ghost ? `<span>${request.kind === "block" ? tableText("blockDie") : `D${request.sides}`}</span>` : diceFace(request.kind, face)}</${tag}>`;
}

function paintDice(ui, request, values, ghost, selectable) {
  const key = ghost ? `ready:${ui.state.rollCount}:${request.label}` : `result:${ui.state.lastRoll?.id || 0}:${selectable}`;
  const surface = trayById("dice");
  if (surface.dataset.key === key) {
    surface.querySelectorAll("button").forEach(button => { button.disabled = !canAct(ui) || ui.diceRolling; });
    return;
  }
  clearTimeout(ui.diceTimer);
  const id = ui.state.lastRoll?.id;
  const animate = !ghost && Boolean(id) && ui.lastAnimatedRoll !== id;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  ui.lastAnimatedRoll = ghost ? ui.lastAnimatedRoll : id;
  ui.diceRolling = animate && !reduced;
  surface.dataset.key = key;
  surface.innerHTML = Array.from({ length: request.count }, (_, i) =>
    trayDie(request, values[i], i, selectable, !canAct(ui), ui.diceRolling, ghost)).join("");
  if (ui.diceRolling) ui.diceTimer = setTimeout(() => {
    ui.diceRolling = false;
    surface.querySelectorAll(".die-arriving").forEach(die => die.classList.remove("die-arriving"));
    renderDiceTray(ui);
  }, 920 + (request.count - 1) * 100);
}

function rollControls(ui, pending) {
  const disabled = !canAct(ui) || ui.diceRolling, request = pending.request;
  if (pending.stage === "ready") return diceCommand("confirmRoll", tableText("confirmDice", { dice: diceNotation(request) }), disabled, "", true);
  if (pending.stage === "reroll-ready") return `<p class="reroll-notice">${tableText("rerollConfirm", { source: pending.source })}</p>
    ${diceCommand("confirmRoll", tableText("confirmReroll"), disabled, "", true)}
    ${diceCommand("cancelReroll", tableText("backToResult"), disabled)}`;
  if (ui.diceRolling) return `<p class="tray-explanation">${tableText("diceRolling")}</p>`;
  const options = rerollOptions(ui.state);
  const caption = pending.entry.reroll ? tableText("alreadyRerolled") : options.length ? tableText("rerollsAvailable") : tableText("noRerolls");
  return `<p class="reroll-caption">${caption}</p><div class="reroll-options">${options.map(source =>
    diceCommand("selectReroll", source === "Team" ? tableText("teamDiceReroll", { count: ui.state.rerolls[ui.state.active] + (ui.state.driveRerolls?.[ui.state.active] || 0) })
      : tableText("skillDiceReroll", { skill: source }), disabled, `data-source="${escapeHtml(source)}"`)).join("")}</div>
    ${diceCommand("acceptRoll", tableText(request.kind === "block" ? "keepBlockDice" : "confirmResult"), disabled, "", true)}`;
}

function resultSummary(ui, request, values) {
  if (ui.diceRolling) return tableText("diceRolling");
  if (ui.state.pending?.type === "roll" && ui.state.pending.stage === "ready") return tableText("awaitRoll");
  if (!values.length) return tableText("trayEmpty");
  if (request.kind === "block") return values.map(value => FACE_LABELS[BLOCK_FACES[value - 1]]).join(" · ");
  const total = values.reduce((a, b) => a + b, 0);
  const passed = rollPassed(request, values);
  return `${values.length > 1 ? `${values.join(" + ")} = ` : ""}${total}${passed === null ? "" : ` · ${tableText(passed ? "rollSuccess" : "rollFailure")}`}`;
}

function paintTrayResolution(ui) {
  const p = ui.state.pending, allowed = canAct(ui);
  if (p?.type === "roll") return rollControls(ui, p);
  if (p?.type === "block") return `<p class="tray-explanation">${escapeHtml(tableText("blockChooser", { coach: teamName(ui.state, p.chooser) }))}</p>`;
  if (p?.type === "push") return `<p class="tray-explanation">${tableText("pushSquare")}</p><div class="resolution-actions">${p.squares.map(q =>
    `<button data-push="${q.x},${q.y}" ${allowed ? "" : "disabled"}>${q.x < 0 || q.x >= 20 || q.y < 0 || q.y >= 11 ? tableText("crowd") : `${String.fromCharCode(65 + q.x)}${q.y + 1}`}</button>`).join("")}</div>`;
  if (p?.type === "follow") return `<p class="tray-explanation">${tableText("followQuestion")}</p><div class="resolution-actions">
    <button data-follow="yes" ${allowed ? "" : "disabled"}>${tableText("follow")}</button><button data-follow="no" ${allowed ? "" : "disabled"}>${tableText("stay")}</button></div>`;
  if (ui.state.phase !== "play") return `<p class="tray-explanation">${tableText("useDrivePanel")}</p>`;
  return `<p class="tray-explanation">${tableText("nextRoll")}</p>`;
}

export function renderDiceTray(ui) {
  const s = ui.state, p = s.pending, roll = p?.type === "roll" ? p : null;
  const request = roll?.request || s.lastRoll || { label: tableText("readyForAction"), count: 2, sides: 6, kind: "d6" };
  const values = roll ? roll.entry.reroll?.values || roll.entry.values : s.lastRoll?.values || [];
  const ghost = roll?.stage === "ready" || !values.length;
  paintDice(ui, request, values, ghost, p?.type === "block");
  trayById("tray-title").textContent = request.label;
  trayById("tray-detail").textContent = request.detail || tableText("sharedDice");
  trayById("tray-notation").textContent = `${diceNotation(request)}${request.target ? ` · ${request.target}+` : ""}`;
  trayById("tray-result").textContent = resultSummary(ui, request, values);
  trayById("tray-result").className = `tray-result ${!ghost && !ui.diceRolling && rollPassed(request, values) === false ? "failed" : ""}`;
  trayById("tray-status").textContent = ui.diceRolling ? tableText("rolling") : roll?.stage.endsWith("ready") ? tableText("confirm") : p ? tableText("resolve") : tableText("ready");
  trayById("resolution").innerHTML = paintTrayResolution(ui);
  trayById("tray-waiting").textContent = p && ui.room && p.chooser !== ui.room.side ? tableText("waitingCoach", { coach: teamName(s, p.chooser) }) : "";
  trayById("dice-tray-panel").classList.toggle("needs-roll", Boolean(roll));
  if (ghost && roll && ui.lastRollPrompt !== `${s.rollCount}:${request.label}`) {
    ui.lastRollPrompt = `${s.rollCount}:${request.label}`;
    if (innerWidth <= 780) trayById("dice-tray-panel").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest",
    });
  }
}

export function initDiceTray() {
  trayById("block-legend").innerHTML = Object.entries(FACE_LABELS).map(([face, label]) =>
    `<div><span class="legend-die">${diceFace("block", face)}</span><span>${label}${face === "push" ? " × 2" : ""}</span></div>`).join("");
}
