import { createMatch, getPlayer, playerAt, record } from "./model.mjs";
import { applyCommand } from "./engine.mjs";
import { byId, render, renderBoard, actionDefinitions, canAct } from "./render.mjs";
import { roomRequest, connectRoom, renderRoom, roomLink } from "./network.mjs";
import { initTableAppearance } from "./themes.mjs";
import { initTableIcons } from "./icons.mjs";
import { initDiceTray } from "./dice-tray.mjs";
import { initMatchSetup } from "./setup.mjs";
import { driveSquareClick } from "./drive-panel.mjs";

const ui = { state: createMatch(), selected: "0-5", mode: "move", grid: true, zones: false,
  zoom: 100, room: null, online: false, events: null, busy: false, undo: null, paths: new Map() };
let toastTimer;
let openSetup;

function startLocal(state) {
  ui.selected = state.ball.carrier || state.players.find(p => p.team === 0 && ["standing", "reserve"].includes(p.status))?.id;
  ui.mode = "move"; ui.undo = null;
  ui.lastAnimatedRoll = null; ui.lastRollPrompt = null; byId("dice").dataset.key = "";
  update(state);
}

function notify(message) {
  byId("toast").textContent = message; byId("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { byId("toast").hidden = true; }, 5000);
}

function update(next) {
  const changedTurn = ui.state.active !== next.active || ui.state.half !== next.half;
  if (next.rollCount < ui.state.rollCount) {
    ui.lastAnimatedRoll = null; ui.lastRollPrompt = null; byId("dice").dataset.key = "";
  }
  ui.state = next;
  if (changedTurn || !getPlayer(next, ui.selected)) {
    const first = next.players.find(p => p.id === next.drive?.blitzer && next.phase === "kickoff-blitz")
      || next.players.find(p => p.team === next.active && p.status === "standing" && !p.used);
    ui.selected = first?.id || ui.selected; ui.mode = "move"; ui.undo = null;
  }
  if (next.activation === ui.selected) ui.mode = next.action;
  if (next.phase === "kickoff-blitz" && next.drive.blitzer) ui.selected = next.drive.blitzer;
  render(ui);
}

async function dispatch(command) {
  if (ui.busy) return;
  try {
    if (ui.room) {
      if (!ui.online) throw new Error("Waiting for the connection to recover.");
      ui.busy = true; render(ui);
      const data = await roomRequest(`/api/play/rooms/${ui.room.code}/command`,
        { version: ui.state.version, command }, ui.room.token);
      if (data.state.version >= ui.state.version) update(data.state);
    } else {
      const before = ui.state;
      if (command.type === "chat") {
        ui.undo = null;
        const next = structuredClone(before); record(next, `Note: ${command.text}`, "chat"); next.version++;
        update(next);
      } else {
        const next = applyCommand(before, command);
        // Only local movement with no new dice or possession/turn changes is undoable.
        ui.undo = command.type === "move" && next.active === before.active && !next.pending
          && next.rollCount === before.rollCount
          && next.ball.carrier === before.ball.carrier && next.half === before.half
          && JSON.stringify(next.score) === JSON.stringify(before.score) ? before : null;
        update(next);
      }
    }
  } catch (error) { notify(error.message); }
  finally { ui.busy = false; render(ui); }
}

function selectPlayer(id) {
  ui.selected = id;
  ui.mode = ui.state.activation === id ? ui.state.action : "move";
  render(ui);
}

function cellClick(x, y) {
  const s = ui.state, target = playerAt(s, x, y), selected = getPlayer(s, ui.selected);
  if (driveSquareClick(ui, x, y, target, dispatch)) return;
  if (s.pending?.type === "push" && canAct(ui)) { dispatch({ type: "push", x, y }); return; }
  if (s.pending) { if (target) selectPlayer(target.id); return; }
  if (!canAct(ui, s.active)) { if (target) selectPlayer(target.id); return; }
  if (target && selected?.team === s.active && selected.id !== target.id) {
    if (target.team !== selected.team && ["block", "blitz"].includes(ui.mode)) {
      dispatch({ type: "block", id: selected.id, target: target.id, action: ui.mode }); return;
    }
    if (target.team === selected.team && ["pass", "handoff"].includes(ui.mode)) {
      dispatch({ type: "throw", id: selected.id, target: target.id, action: ui.mode }); return;
    }
  }
  if (target) selectPlayer(target.id);
  else dispatch({ type: "move", id: ui.selected, x, y, action: ui.mode });
}

function chooseAction(action) {
  const button = byId("actions").querySelector(`[data-action="${action}"]`);
  if (!button || button.disabled) return;
  ui.mode = action; render(ui);
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function zoom(value) {
  ui.zoom = Math.min(180, Math.max(60, value));
  const base = Math.max(560, byId("board-viewport").clientWidth - (innerWidth > 1600 ? 80 : innerWidth > 1100 ? 48 : 24));
  byId("board-stage").style.width = `${base * ui.zoom / 100}px`;
  byId("zoom-label").textContent = `${ui.zoom}%`;
}

function wireTable() {
  for (const id of ["drive-panel", "dugouts"]) byId(id).addEventListener("click", event => {
    const button = event.target.closest("[data-drive-command]");
    if (!button || button.disabled) return;
    dispatch({ type: button.dataset.driveCommand, id: button.dataset.id, receive: button.dataset.receive === "true" });
  });
  byId("cells").addEventListener("click", event => {
    const cell = event.target.closest("[data-x]");
    if (cell) cellClick(Number(cell.dataset.x), Number(cell.dataset.y));
  });
  byId("cells").addEventListener("pointerover", event => {
    const cell = event.target.closest("[data-x]");
    if (!cell) return;
    document.querySelectorAll(".cell.path").forEach(el => el.classList.remove("path"));
    const { x, y } = cell.dataset;
    const path = ui.paths.get(`${x},${y}`);
    byId("cursor-position").textContent = `${String.fromCharCode(65 + Number(x))}${Number(y) + 1}${path ? ` · ${path.length} MA` : ""}`;
    for (const q of path || []) byId("cells").querySelector(`[data-x="${q.x}"][data-y="${q.y}"]`)?.classList.add("path");
  });
  byId("cells").addEventListener("pointerleave", () => document.querySelectorAll(".cell.path").forEach(el => el.classList.remove("path")));
  byId("cells").addEventListener("keydown", event => {
    const cell = event.target.closest("[data-x]");
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!cell || !offsets[event.key]) return;
    event.preventDefault();
    const [dx, dy] = offsets[event.key];
    byId("cells").querySelector(`[data-x="${Number(cell.dataset.x) + dx}"][data-y="${Number(cell.dataset.y) + dy}"]`)?.focus();
  });
  byId("dugouts").addEventListener("click", event => { const button = event.target.closest("[data-player]"); if (button) selectPlayer(button.dataset.player); });
  byId("actions").addEventListener("click", event => { const button = event.target.closest("[data-action]"); if (button) chooseAction(button.dataset.action); });
  byId("dice-tray-panel").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (ui.diceRolling) return;
    if (button.dataset.face !== undefined) dispatch({ type: "chooseBlock", index: Number(button.dataset.face) });
    if (button.dataset.diceCommand) dispatch({ type: button.dataset.diceCommand, source: button.dataset.source });
    if (button.dataset.follow) dispatch({ type: "follow", follow: button.dataset.follow === "yes" });
    if (button.dataset.push) { const [x, y] = button.dataset.push.split(",").map(Number); dispatch({ type: "push", x, y }); }
  });
}

function wireControls() {
  byId("end-turn").onclick = () => dispatch({ type: "endTurn" });
  byId("end-activation").onclick = () => dispatch({ type: "endActivation" });
  byId("free-die").onclick = () => dispatch({ type: "roll" });
  byId("grid-toggle").onclick = () => { ui.grid = !ui.grid; renderBoard(ui); };
  byId("zones-toggle").onclick = () => { ui.zones = !ui.zones; renderBoard(ui); };
  byId("zoom-in").onclick = () => zoom(ui.zoom + 20);
  byId("zoom-out").onclick = () => zoom(ui.zoom - 20);
  byId("fit").onclick = () => zoom(100);
  byId("undo").onclick = () => { if (ui.undo && !ui.room) { const previous = ui.undo; ui.undo = null; update(previous); notify("Movement undone."); } };
  byId("save-match").onclick = () => download("gata-match.json", JSON.stringify({ format: "gata-demo-v1", state: ui.state }, null, 2), "application/json");
  byId("download-log").onclick = () => download("gata-match-log.txt", ui.state.log.map(entry => entry.text).join("\n"), "text/plain");
  byId("fullscreen").onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { notify("Fullscreen mode is unavailable in this browser."); }
  };
  byId("new-match").onclick = () => openSetup();
  for (const id of ["help-button", "coverage-link"]) byId(id).onclick = () => byId("help-dialog").showModal();
  document.querySelectorAll("[data-close]").forEach(button => { button.onclick = () => button.closest("dialog").close(); });
  document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); }));
  byId("chat-form").onsubmit = event => {
    event.preventDefault(); const text = byId("chat-input").value.trim();
    if (text) { dispatch({ type: "chat", text }); byId("chat-input").value = ""; }
  };
  document.addEventListener("keydown", event => {
    if (document.querySelector("dialog[open]") || ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
    if (/^[1-5]$/.test(event.key)) chooseAction(actionDefinitions[Number(event.key) - 1][0]);
    if (event.key === "Escape" && !byId("end-activation").disabled) dispatch({ type: "endActivation" });
  });
  window.addEventListener("resize", () => zoom(ui.zoom));
}

async function enterRoom(code = null) {
  const feedback = byId("room-feedback");
  try {
    if (ui.room) throw new Error("Leave your current room first.");
    feedback.textContent = "Connecting…";
    const data = await roomRequest(code ? `/api/play/rooms/${code}/join` : "/api/play/rooms");
    connectRoom(ui, data, update, notify);
    ui.selected = data.state.players.find(p => p.team === data.side && ["standing", "reserve"].includes(p.status))?.id; ui.mode = "move"; render(ui);
  } catch (error) { feedback.textContent = error.message; }
}

async function hostRoom(body) {
  const data = await roomRequest("/api/play/rooms", body);
  connectRoom(ui, data, update, notify);
  ui.selected = data.state.players.find(p => p.team === 0 && ["standing", "reserve"].includes(p.status))?.id;
  ui.mode = "move"; render(ui);
  byId("room-dialog").showModal();
}

function wireRooms() {
  byId("room-button").onclick = () => { renderRoom(ui); byId("room-dialog").showModal(); };
  byId("create-room").onclick = () => { byId("room-dialog").close(); openSetup(true); };
  byId("join-form").onsubmit = event => { event.preventDefault(); enterRoom(byId("room-code").value.trim().toUpperCase()); };
  byId("room-current").addEventListener("click", async event => {
    if (event.target.id !== "copy-room") return;
    try { await navigator.clipboard.writeText(roomLink(ui.room.code)); notify("Room invitation copied."); }
    catch { byId("room-current").querySelector("input")?.select(); notify("Select and copy the invitation link."); }
  });
  byId("leave-room").onclick = () => {
    ui.events?.close(); ui.events = null; ui.room = null; ui.online = false; ui.undo = null;
    try { sessionStorage.removeItem("gata-play-room"); } catch { /* Optional storage. */ }
    history.replaceState(null, "", location.pathname);
    ui.selected = "0-5"; ui.mode = "move"; update(createMatch()); renderRoom(ui);
    byId("room-dialog").close(); notify("A new local table is ready. Your online match remains in its room.");
  };
  const requested = new URL(location.href).searchParams.get("room")?.toUpperCase();
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem("gata-play-room") || "null"); } catch { /* Optional recovery. */ }
  if (saved && (!requested || requested === saved.code)) connectRoom(ui, { ...saved, state: ui.state }, update, notify);
  else if (requested && /^[A-F0-9]{6}$/.test(requested)) {
    byId("room-code").value = requested; byId("room-dialog").showModal();
    byId("room-feedback").textContent = `Invitation to room ${requested}. Click Join to take the away seat.`;
  }
}

byId("coordinate-top").innerHTML = Array.from({ length: 20 }, (_, i) => `<span>${String.fromCharCode(65 + i)}</span>`).join("");
byId("coordinate-side").innerHTML = Array.from({ length: 11 }, (_, i) => `<span>${i + 1}</span>`).join("");
initTableAppearance(); initTableIcons(); initDiceTray();
openSetup = initMatchSetup(ui, startLocal, hostRoom, notify);
wireTable(); wireControls(); wireRooms(); render(ui); zoom(100);
if (!ui.room && !new URL(location.href).searchParams.has("room")
  && (location.pathname.startsWith("/play") || new URL(location.href).searchParams.has("team"))) openSetup();
