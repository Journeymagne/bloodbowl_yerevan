import { byId, escapeHtml } from "./render.mjs";
import { tableText } from "./copy.mjs";
import { teamName } from "./model.mjs";
import { storage, STORAGE_KEYS } from "../core/storage.mjs";

export function leagueAuthorization() {
  const token = storage.get(STORAGE_KEYS.authToken);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function roomRequest(url, body, token) {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : leagueAuthorization()) },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(12000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("Open /play on the league site, or run npm run demo for practice rooms."); }
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

export function roomLink(code) {
  const url = new URL(location.href);
  url.search = ""; url.hash = ""; url.searchParams.set("room", code);
  return url.href;
}

export function renderRoom(ui) {
  byId("leave-room").hidden = !ui.room;
  byId("create-room").disabled = Boolean(ui.room);
  byId("join-form").hidden = Boolean(ui.room);
  byId("room-current").innerHTML = ui.room ? `<div class="room-info">${tableText("room")} <strong>${ui.room.code}</strong><br>You are playing as ${escapeHtml(teamName(ui.state, ui.room.side))}.
    <br>${ui.joined ? "Both seats are taken." : "Waiting for the second coach."}
    <input value="${escapeHtml(roomLink(ui.room.code))}" readonly aria-label="${tableText("roomLink")}">
    <button id="copy-room">${tableText("copyInvitation")}</button></div>` : "";
}

export function connectRoom(ui, data, update, notify) {
  ui.events?.close();
  ui.lastAnimatedRoll = null; ui.lastRollPrompt = null; byId("dice").dataset.key = "";
  ui.room = { code: data.code, token: data.token, side: data.side };
  ui.state = data.state; ui.undo = null; ui.joined = data.joined; ui.online = false;
  try { sessionStorage.setItem("gata-play-room", JSON.stringify(ui.room)); } catch { /* Storage may be disabled. */ }
  const events = new EventSource(`/api/play/rooms/${data.code}/events?token=${encodeURIComponent(data.token)}`);
  ui.events = events;
  events.onmessage = event => {
    const snapshot = JSON.parse(event.data);
    ui.online = true; ui.joined = snapshot.joined;
    if (snapshot.state.version >= ui.state.version) update(snapshot.state);
    renderRoom(ui);
  };
  events.onerror = () => {
    ui.online = false; update(ui.state);
    byId("room-feedback").textContent = "Connection lost. Reconnecting. If the server restarted, return to the local table.";
  };
  renderRoom(ui); update(ui.state);
  byId("room-feedback").textContent = data.side === 0 ? "Share the invitation with your opponent. On another device, replace localhost with this computer\u2019s LAN address." : `You joined as ${teamName(ui.state, 1)}. Follow the pre-game and drive prompts above the pitch.`;
  if (data.side === 1) notify(`You are playing as ${teamName(ui.state, 1)}.`);
}
