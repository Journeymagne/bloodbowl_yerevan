import { byId, escapeHtml } from "./render.mjs";
import { roomRequest, leagueAuthorization } from "./network.mjs";
import { createMatch } from "./model.mjs";
import { automatedSkills, openingLineup } from "./squads.mjs";
import { tableText as t } from "./copy.mjs";

const setup = { teams: [], chosen: [null, null], lineups: [[], []], online: false, loaded: false, busy: false };
const selectedTeam = side => setup.teams.find(team => team.id === setup.chosen[side]);

function setupOptions(side, filter = "") {
  const query = filter.toLowerCase();
  return setup.teams.filter(team => team.id === setup.chosen[side]
    || `${team.name} ${team.race} ${team.coach}`.toLowerCase().includes(query)).map(team =>
    `<option value="${escapeHtml(team.id)}" ${team.id === setup.chosen[side] ? "selected" : ""}>${escapeHtml(team.name)} · ${escapeHtml(team.race)} · ${escapeHtml(team.coach)}</option>`).join("");
}

function chooseSquad(side, id) {
  setup.chosen[side] = id;
  setup.lineups[side] = openingLineup(selectedTeam(side)?.players || []);
}

function setupPlayerRow(player, side) {
  const checked = setup.lineups[side].includes(player.id);
  const specialists = selectedTeam(side).players.filter(p => p.specialist && setup.lineups[side].includes(p.id)).length;
  const disabled = !player.available || (!checked && (setup.lineups[side].length >= 7 || (player.specialist && specialists >= 4)));
  const stats = [player.ma, player.st, player.ag === null ? "—" : `${player.ag}+`,
    player.pa === null ? "—" : `${player.pa}+`, `${player.av}+`];
  const skills = player.skills.map(skill => `${skill}${automatedSkills.has(skill) ? "" : " *"}`).join(", ");
  return `<label class="setup-player ${!player.available ? "unavailable" : ""}">
    <input type="checkbox" data-side="${side}" value="${escapeHtml(player.id)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
    <span class="setup-number">${escapeHtml(player.number)}</span><span class="setup-player-name"><strong>${escapeHtml(player.name)}</strong>
    <small>${escapeHtml(player.role)}${player.specialist ? " · SP" : ""}${player.absence ? ` · ${escapeHtml(player.absence)}` : ""}</small><small class="setup-skills">${escapeHtml(skills || "—")}</small></span>
    <span class="setup-stats">${stats.map(stat => `<span>${stat}</span>`).join("")}</span></label>`;
}

function paintSquad(side) {
  const team = selectedTeam(side), target = byId(`setup-roster-${side}`);
  if (!team) { target.textContent = t("noTeams"); return; }
  const available = team.players.filter(player => player.available).length;
  target.innerHTML = `<div class="setup-team-meta"><span>${escapeHtml(team.coach)} · ${team.rerolls} ${t("rerollsShort")}</span>
    <b>${setup.lineups[side].length} / 7 ${t("onPitch")}</b></div>
    <div class="setup-stat-labels"><span>${available} ${t("available")}</span><span class="setup-stats">${["MA", "ST", "AG", "PA", "AV"].map(stat => `<span>${stat}</span>`).join("")}</span></div>
    <div class="setup-roster-list">${team.players.map(player => setupPlayerRow(player, side)).join("") || `<p>${t("emptyRoster")}</p>`}</div>`;
  byId("start-league-match").disabled = setup.busy || setup.lineups.some(lineup => !lineup.length);
}

function paintTeamChoices() {
  for (const side of [0, 1]) {
    const select = byId(`setup-team-${side}`);
    select.innerHTML = setupOptions(side, byId("setup-search").value);
    select.disabled = !setup.teams.length;
    paintSquad(side);
  }
  byId("setup-count").textContent = `${setup.teams.length} ${t("teamsInLeague")}`;
}

async function loadTeams() {
  const response = await fetch("/api/play/teams", { headers: leagueAuthorization(), signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (response.status === 401) {
    byId("setup-login").hidden = false;
    throw new Error("Sign in on the league site, then return here and refresh the teams.");
  }
  if (!response.ok) throw new Error("Database teams are available on the league site at /play. Practice teams are available here.");
  const data = await response.json();
  if (!Array.isArray(data.teams)) throw new Error("The league team list is unavailable.");
  setup.teams = data.teams; setup.loaded = true;
  byId("setup-login").hidden = true;
  const playable = setup.teams.filter(team => team.players.some(player => player.available));
  const requested = new URL(location.href).searchParams.get("team");
  for (const side of [0, 1]) {
    const previous = setup.chosen[side];
    const id = previous || (side === 0 && setup.teams.some(team => team.id === requested) ? requested : playable[side]?.id || playable[0]?.id);
    chooseSquad(side, setup.teams.some(team => team.id === id) ? id : playable[side]?.id);
  }
}

/** The same chooser creates a local exhibition or an authoritative online room. */
export function initMatchSetup(ui, startLocal, hostRoom, notify) {
  const feedback = byId("setup-feedback");
  async function refreshTeams() {
    feedback.textContent = "Loading teams from the league…";
    byId("start-league-match").disabled = true;
    byId("refresh-teams").disabled = true;
    try { await loadTeams(); feedback.textContent = "Choose a preferred lineup. All players join the match; each drive allows up to seven, including three Linemen when available and at most four specialists (SP)."; }
    catch (error) { setup.teams = []; setup.loaded = false; feedback.textContent = error.message; }
    finally { byId("refresh-teams").disabled = false; paintTeamChoices(); }
  }
  async function openSetup(online = false) {
    if (ui.room) { notify("Leave your current room before choosing a new match."); return; }
    setup.online = online;
    byId("start-league-match").textContent = online ? "Create room with these teams →" : "Start exhibition →";
    byId("practice-match").textContent = online ? "Create practice room" : "Use practice teams";
    byId("setup-dialog").showModal();
    await refreshTeams();
  }
  byId("setup-search").oninput = paintTeamChoices;
  byId("refresh-teams").onclick = refreshTeams;
  for (const side of [0, 1]) {
    byId(`setup-team-${side}`).onchange = event => { chooseSquad(side, event.target.value); paintSquad(side); };
    byId(`setup-roster-${side}`).onchange = event => {
      if (!event.target.matches("input[type=checkbox]")) return;
      const id = event.target.value;
      setup.lineups[side] = event.target.checked ? [...setup.lineups[side], id] : setup.lineups[side].filter(item => item !== id);
      paintSquad(side);
    };
  }
  byId("start-league-match").onclick = async () => {
    if (setup.busy || !setup.loaded || setup.lineups.some(lineup => !lineup.length)) return;
    setup.busy = true; paintTeamChoices();
    const body = { teams: setup.chosen.map((id, side) => ({ id, lineup: setup.lineups[side] })) };
    try {
      if (setup.online) await hostRoom(body);
      else startLocal((await roomRequest("/api/play/matches", body)).state);
      byId("setup-dialog").close();
    } catch (error) { feedback.textContent = error.message; }
    finally { setup.busy = false; paintTeamChoices(); }
  };
  byId("practice-match").onclick = async () => {
    if (setup.busy) return;
    setup.busy = true;
    try {
      if (setup.online) await hostRoom({});
      else startLocal(createMatch());
      byId("setup-dialog").close();
    } catch (error) { feedback.textContent = error.message; }
    finally { setup.busy = false; }
  };
  return openSetup;
}
