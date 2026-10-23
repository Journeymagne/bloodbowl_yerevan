import { WIDTH, HEIGHT, teamName, teamInfo, getPlayer, playerAt, onPitch, reachable, distance, direction } from "./model.mjs";
import { automatedSkills } from "./squads.mjs";
import { actingSide } from "./engine.mjs";
import { tableText } from "./copy.mjs";
import { tableIcon } from "./icons.mjs";
import { renderDiceTray } from "./dice-tray.mjs";
import { renderDrivePanel, renderBench } from "./drive-panel.mjs";
import { inOwnHalf } from "./lineup.mjs";

export const byId = id => document.getElementById(id);
export const escapeHtml = text => String(text ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export const sprite = (s, side) => `/assets/play/${teamInfo(s, side).baseTeamSlug === "teams/orc" ? "orc" : teamInfo(s, side).baseTeamSlug === "teams/human" ? "human" : "counter"}.svg`;
const statusLabels = { standing: "Ready", prone: "Prone · stand up for 3 MA", stunned: "Stunned", ko: "Knocked out", casualty: "Injury", crowd: "Crowd injury pending", reserve: "Reserve", unavailable: "Unavailable for this match", "sent-off": "Sent off until half-time" };
export const actionDefinitions = [
  ["move", "Move", "Click an empty square. Pale dots are within MA; yellow dots need a rush."],
  ["block", "Block", "Click an adjacent opponent. Choose a block die, then a push square."],
  ["blitz", "Blitz", "Move and make one block, costing 1 MA. One blitz per team turn."],
  ["pass", "Pass", "Click a teammate within 6 squares. You may move before passing."],
  ["handoff", "Handoff", "Click an adjacent teammate. They must make a catch roll."],
];

export function canAct(ui, side = actingSide(ui.state)) {
  return !ui.busy && !ui.state.finished && (!ui.room || (ui.online && ui.room.side === side));
}

function tokenMarkup(s, p) {
  return `<span class="token ${p.team === 1 ? "orc" : ""} ${p.status} ${p.used ? "used" : ""}">
    <img src="${sprite(s, p.team)}" alt="" draggable="false"><span class="token-number">${escapeHtml(p.number)}</span>
    ${s.ball.carrier === p.id ? `<span class="ball" title="${tableText("ball")}"></span>` : ""}</span>`;
}

function cellMarkup(ui, x, y, paths) {
  const s = ui.state, p = playerAt(s, x, y), selected = getPlayer(s, ui.selected), path = paths.get(`${x},${y}`);
  const push = s.pending?.type === "push" && s.pending.squares.some(q => q.x === x && q.y === y);
  const target = selected && p && p.team !== selected.team && p.status === "standing" && distance(p, selected) === 1
    && ["block", "blitz"].includes(ui.mode);
  const zone = ui.zones && s.players.some(q => q.team !== s.active && q.status === "standing" && distance(q, { x, y }) === 1);
  const rush = path && path.length + selected.moved + (selected.status === "prone" ? 3 : 0) > selected.ma;
  const classes = ["cell", p?.id === ui.selected ? "selected" : "", path ? "reachable" : "", rush ? "rush" : "",
    zone ? "danger-zone" : "", push ? "push-choice" : "", target ? "attack-target" : "",
    s.pending?.type === "setup" && inOwnHalf(s, s.pending.chooser, x) ? "setup-square" : "",
    s.drive?.target?.x === x && s.drive.target.y === y && s.phase === "kickoff" ? "kick-choice" : ""].filter(Boolean).join(" ");
  const coordinate = `${String.fromCharCode(65 + x)}${y + 1}`;
  const label = p ? `${coordinate}: ${p.name}, ${p.role}, ${statusLabels[p.status]}${p.used ? ", activation used" : ""}` : coordinate;
  return `<button class="${classes}" data-x="${x}" data-y="${y}" role="gridcell" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" tabindex="${p?.id === ui.selected || (s.pending?.type === "kick-target" && x === 5 && y === 5) ? 0 : -1}">
    ${p ? tokenMarkup(s, p) : !s.ball.airborne && !s.ball.carrier && s.ball.x === x && s.ball.y === y ? `<span class="ball loose" title="${tableText("looseBall")}"></span>` : ""}
    ${s.phase !== "play" && s.drive?.landing?.x === x && s.drive.landing.y === y ? '<span class="kick-marker">↓</span>' : ""}</button>`;
}

export function renderBoard(ui) {
  const s = ui.state, selected = getPlayer(s, ui.selected);
  const paths = canAct(ui, s.active) && ui.mode !== "block" ? reachable(s, selected) : new Map();
  ui.paths = paths;
  byId("cells").innerHTML = Array.from({ length: HEIGHT }, (_, y) =>
    Array.from({ length: WIDTH }, (_, x) => cellMarkup(ui, x, y, paths)).join("")).join("");
  byId("pitch").classList.toggle("no-grid", !ui.grid);
  byId("grid-toggle").setAttribute("aria-pressed", String(ui.grid));
  byId("zones-toggle").setAttribute("aria-pressed", String(ui.zones));
}

function teamSummary(s, side) {
  const active = s.active === side && !s.finished && s.phase === "play";
  return `<div class="team-summary ${side === 1 ? "away" : ""}"><div class="team-badge">${escapeHtml(teamName(s, side).slice(0, 1))}</div>
    <div><h${side + 1}>${escapeHtml(teamName(s, side))}</h${side + 1}><p class="${active ? "playing" : ""}">${escapeHtml(teamInfo(s, side).race)} · ${active ? `● TURN ${s.turn[side]} / 6` : "WAITING"} ${direction(s, side) > 0 ? "→" : "←"}</p></div></div>`;
}

function skillMarkup(skill) {
  const pending = !automatedSkills.has(skill);
  const title = pending ? "Reference only: not yet implemented" : skill;
  return `<span class="skill ${pending ? "muted" : ""}" title="${escapeHtml(title)}">${escapeHtml(skill)}</span>`;
}

function renderScore(s) {
  byId("scoreboard").innerHTML = `${teamSummary(s, 0)}<div class="score-centre">
    <div class="half-label">${s.finished ? "FULL TIME" : s.phase === "play" ? `HALF ${s.half} / 2 · TURN ${s.turn[s.active]} / 6` : `HALF ${s.half} / 2 · ${s.phase.toUpperCase()}`}</div>
    <div class="score-line">${s.score[0]}<span>:</span>${s.score[1]}</div>
    <div class="turn-dots">${Array.from({ length: 6 }, (_, i) => `<i class="${i + 1 === s.turn[s.active] ? "current" : i < s.turn[s.active] ? "done" : ""}"></i>`).join("")}</div>
    </div>${teamSummary(s, 1)}`;
}

function renderPlayer(ui) {
  const p = getPlayer(ui.state, ui.selected);
  if (!p) return;
  byId("selected-coordinate").textContent = onPitch(p) ? `${String.fromCharCode(65 + p.x)}${p.y + 1}` : "OFF PITCH";
  byId("player-card").innerHTML = `<div class="player-identity"><div class="portrait"><img src="${sprite(ui.state, p.team)}" alt=""><small>${escapeHtml(String(p.number).padStart(2, "0"))}</small></div>
    <div><div class="player-team ${p.team === 1 ? "orc" : ""}">${escapeHtml(teamName(ui.state, p.team))}</div><h2 class="player-name">${escapeHtml(p.name)}</h2><div class="player-role">${escapeHtml(p.role)}</div></div></div>
    <div class="stat-strip">${[["MA", p.ma], ["ST", p.st], ["AG", p.ag === null ? "—" : p.ag + "+"], ["PA", p.pa === null ? "—" : p.pa + "+"], ["AV", p.av + "+"], ["SPP", p.spp]].map(([key, value]) => `<div><small>${key}</small><b>${value}</b></div>`).join("")}</div>
    <div class="skills">${p.skills.length ? p.skills.map(skillMarkup).join("") : `<span class="skill muted">${tableText("noSkills")}</span>`}</div>
    <div class="player-state"><span class="state-label">${p.used ? "Activation used" : statusLabels[p.status]}</span><span>${p.moved} / ${p.ma} MA</span></div>`;
}

function renderActions(ui) {
  const s = ui.state, p = getPlayer(s, ui.selected);
  const available = canAct(ui, s.active) && !s.pending && ["play", "kickoff-blitz"].includes(s.phase)
    && p && p.team === s.active && !p.used && ["standing", "prone"].includes(p.status)
    && (s.phase !== "kickoff-blitz" || p.id === s.drive.blitzer);
  byId("actions").innerHTML = actionDefinitions.map(([key, label], index) => {
    const locked = s.activation === p?.id && s.action !== key;
    const spent = key === "blitz" ? s.blitzUsed : key === "pass" ? s.passUsed : key === "handoff" ? s.handoffUsed : false;
    const disabled = !available || locked || (spent && s.activation !== p?.id) || (key === "pass" && p?.pa === null)
      || (s.phase === "kickoff-blitz" && !["move", "blitz"].includes(key));
    return `<button class="action-button ${ui.mode === key ? "active" : ""}" data-action="${key}" ${disabled ? "disabled" : ""} aria-pressed="${ui.mode === key}"><span class="action-icon">${tableIcon(key)}</span>${label}<kbd>${index + 1}</kbd></button>`;
  }).join("");
  byId("action-help").textContent = actionDefinitions.find(([key]) => key === ui.mode)?.[2];
  byId("end-activation").disabled = !s.activation || !canAct(ui, s.active) || Boolean(s.pending);
  byId("end-turn").disabled = !canAct(ui, s.active) || Boolean(s.pending) || s.phase !== "play";
  byId("free-die").disabled = !canAct(ui, s.active) || Boolean(s.pending) || s.phase !== "play";
  byId("undo").disabled = !ui.undo || Boolean(ui.room) || ui.busy;
  byId("turn-resources").innerHTML = `<div class="resource-row"><span>${tableText("teamRerolls")}</span><b>${s.rerolls[s.active]} / ${s.initialRerolls?.[s.active] ?? 2}${s.driveRerolls?.[s.active] ? ` + ${s.driveRerolls[s.active]} drive` : ""}</b></div><div class="resource-chips">
    ${[["BLITZ", s.blitzUsed], ["PASS", s.passUsed], ["HANDOFF", s.handoffUsed]].map(([name, spent]) => `<span class="${spent ? "spent" : ""}">${name} ${spent ? "−" : "✓"}</span>`).join("")}</div>
    <div class="resource-row"><span>${tableText("bribes")}</span><b>${s.bribes?.[s.active] || 0}</b></div>
    ${s.cheering?.[s.active] ? `<div class="resource-row"><span>${tableText("cheeringBonus")}</span><b>+1 ST</b></div>` : ""}`;
}

export function render(ui) {
  renderScore(ui.state); renderBoard(ui); renderPlayer(ui); renderActions(ui); renderDiceTray(ui); renderBench(ui); renderDrivePanel(ui);
  byId("hint").textContent = ui.state.notice;
  const journal = byId("journal");
  const atBottom = journal.scrollTop + journal.clientHeight >= journal.scrollHeight - 20;
  const newLog = ui.state.log.map((entry, index) => `<div class="log-line ${escapeHtml(entry.kind)}"><span class="log-number">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(entry.text)}</span></div>`).join("");
  if (journal.innerHTML !== newLog) { journal.innerHTML = newLog; if (atBottom) journal.scrollTop = journal.scrollHeight; }
  byId("connection-label").textContent = ui.room ? `${ui.room.code} · ${ui.online ? "Online" : "Reconnecting…"}` : "Local hotseat";
  byId("room-button").classList.toggle("online", Boolean(ui.room && ui.online));
  byId("footer-mode").textContent = ui.room ? `ROOM ${ui.room.code} · YOU: ${teamName(ui.state, ui.room.side)}` : "LOCAL TABLE";
  document.querySelector(".home-end").textContent = teamName(ui.state, ui.state.half === 1 ? 0 : 1);
  document.querySelector(".away-end").textContent = teamName(ui.state, ui.state.half === 1 ? 1 : 0);
  byId("map-meta").textContent = ui.state.setup ? "GATA SEVENS · LEAGUE TEAM EXHIBITION" : "GATA SEVENS · PRACTICE MATCH";
}
