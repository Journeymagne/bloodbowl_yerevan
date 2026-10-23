import { byId, escapeHtml, canAct } from "./render.mjs";
import { getPlayer, teamName, onPitch } from "./model.mjs";
import { fieldPlayers, isLineman, lineupProblems, lineupRequirements } from "./lineup.mjs";
import { eligibleKickers } from "./drives.mjs";
import { KICK_EVENTS } from "./kick-events.mjs";
import { tableText as t } from "./copy.mjs";

const driveButton = (type, label, disabled, extra = "") => `<button data-drive-command="${type}" ${extra} ${disabled ? "disabled" : ""}>${escapeHtml(label)}</button>`;
const playerChoices = (s, ids, type, disabled, selected = []) => ids.map(id => {
  const p = getPlayer(s, id);
  return driveButton(type, `${selected.includes(id) ? "✓ " : ""}#${p.number} ${p.name}`, disabled, `data-id="${escapeHtml(id)}"`);
}).join("");

function phaseControls(ui) {
  const s = ui.state, p = s.pending, disabled = !canAct(ui);
  if (p?.type === "roll") return [p.request.label, t("driveDice"), ""];
  if (p?.type === "pregame") return [t("pregame"), t("weatherFirst"), driveButton("pregameWeather", t("rollWeather"), disabled)];
  if (p?.type === "coin-toss") return [t("kickReceive"), t("rollOffHelp"), driveButton("coinToss", t("rollOff"), disabled)];
  if (p?.type === "receive-choice") return [t("kickReceive"), `${teamName(s, p.chooser)} ${t("chooseKickReceive")}`,
    driveButton("chooseReceive", t("receiveFirst"), disabled, 'data-receive="true"') + driveButton("chooseReceive", t("kickFirst"), disabled, 'data-receive="false"')];
  if (p?.type === "setup") {
    const players = fieldPlayers(s, p.chooser), required = lineupRequirements(s, p.chooser), problems = lineupProblems(s, p.chooser);
    return [t(p.chooser === s.drive.kicker ? "kickingSetup" : "receivingSetup"),
      `${teamName(s, p.chooser)} · ${players.length}/7 players (max 7) · ${players.filter(isLineman).length} Linemen (min ${required.linemen}). ${problems.join(" ") || t("setupLegal")}`,
      driveButton("setupAuto", t("autoSetup"), disabled) + driveButton("setupConfirm", t("lockSetup"), disabled || problems.length > 0)];
  }
  if (p?.type === "kicker") return [t("nominateKicker"), t("kickerHelp"),
    playerChoices(s, eligibleKickers(s).map(player => player.id), "chooseKicker", disabled)];
  if (p?.type === "kick-target") return [t("placeKick"), t("placeKickHelp"),
    driveButton("kick", t("kickBall"), disabled || !s.drive.target)];
  if (p?.type === "touchback") return [t("touchback"), t("touchbackHelp"),
    playerChoices(s, p.eligible, "touchback", disabled)];
  if (p?.type === "kick-event") {
    const [name, help] = KICK_EVENTS[p.event];
    let buttons = "";
    if ([5, 10, 11].includes(p.event)) buttons += playerChoices(s, p.eligible,
      p.event === 11 ? "eventNominate" : "eventPlayer", disabled || (p.event === 5 && p.moved.length > 0), p.nominated);
    buttons += driveButton("eventConfirm", t("finishEvent"), disabled
      || (p.event === 11 && p.nominated.length !== Math.min(3, p.eligible.length)));
    return [name, `${help} ${[4, 9].includes(p.event) ? `${p.moved.length}/${p.limit} moved. ${t("eventMoveHelp")}` : ""}`, buttons];
  }
  if (s.phase === "kickoff-blitz") return [t("kickoffBlitz"), t("blitzHelp"), driveButton("endTurn", t("finishEvent"), disabled || Boolean(p))];
  return [s.finished ? t("fullTime") : `${t("drive")} ${s.drive?.number || 1}`, s.weather?.name || "", ""];
}

export function renderDrivePanel(ui) {
  const [title, help, controls] = phaseControls(ui), s = ui.state;
  byId("drive-heading").textContent = title;
  byId("drive-help").textContent = help;
  byId("drive-controls").innerHTML = controls;
  byId("drive-weather").textContent = s.weather?.name || "Autumn weather";
  byId("drive-panel").classList.toggle("drive-live", s.phase === "play" || s.finished);
  byId("drive-waiting").textContent = s.pending && !canAct(ui) && ui.room
    ? `${t("waitingFor")} ${teamName(s, s.pending.chooser)}` : "";
}

const benchGroups = [
  ["pitchGroup", p => onPitch(p)], ["reserveGroup", p => p.status === "reserve"],
  ["koGroup", p => p.status === "ko"], ["outGroup", p => !onPitch(p) && !["reserve", "ko"].includes(p.status)],
];

export function renderBench(ui) {
  const s = ui.state;
  byId("dugouts").innerHTML = [0, 1].map(side => {
    const players = s.players.filter(p => p.team === side);
    const editable = s.pending?.type === "setup" && s.pending.chooser === side && canAct(ui);
    return `<section class="dugout ${side ? "away" : ""}"><div class="dugout-heading"><strong>${escapeHtml(teamName(s, side))}</strong>
      <span>${players.length} ${t("rosterPlayers")} · ${fieldPlayers(s, side).length}/7 ${t("onPitch")}</span></div>
      ${benchGroups.map(([label, filter]) => {
        const group = players.filter(filter);
        return `<div class="bench-group"><div class="bench-group-heading">${t(label)} <b>${group.length}</b></div><div class="bench-players">${group.map(p => `
          <div class="bench-player ${p.id === ui.selected ? "selected" : ""} ${p.status}">
            <button data-player="${escapeHtml(p.id)}" class="bench-select"><b>${escapeHtml(p.number)}</b><span>${escapeHtml(p.name)}<small>${escapeHtml(p.role)} · ${isLineman(p) ? t("linemanTag") : "SP"}</small></span></button>
            ${editable && ["standing", "reserve"].includes(p.status) ? `<button data-drive-command="setupToggle" data-id="${escapeHtml(p.id)}" class="bench-toggle">${t(onPitch(p) ? "benchPlayer" : "fieldPlayer")}</button>` : ""}
          </div>`).join("") || `<span class="bench-empty">—</span>`}</div></div>`;
      }).join("")}</section>`;
  }).join("");
}

export function driveSquareClick(ui, x, y, target, dispatch) {
  const p = ui.state.pending;
  if (!p || p.type === "roll" || !canAct(ui)) return false;
  if (p.type === "kick-target") { dispatch({ type: "kickTarget", x, y }); return true; }
  if (p.type === "touchback" && target) { dispatch({ type: "touchback", id: target.id }); return true; }
  if (p.type === "kicker" && target) { dispatch({ type: "chooseKicker", id: target.id }); return true; }
  if (!target && p.type === "setup") { dispatch({ type: "setupPlace", id: ui.selected, x, y }); return true; }
  if (!target && p.type === "kick-event" && [4, 9].includes(p.event)) {
    dispatch({ type: "eventMove", id: ui.selected, x, y }); return true;
  }
  return false;
}
