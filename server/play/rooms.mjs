import { randomBytes, randomInt } from "node:crypto";
import { createMatch, record, teamName } from "../../src/play/model.mjs";
import { actingSide, applyCommand } from "../../src/play/engine.mjs";

export const playJson = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};
const json = playJson;
const token = () => randomBytes(24).toString("hex");
const random = () => randomInt(0x100000000) / 0x100000000;

export async function readPlayBody(request) {
  let body = "";
  for await (const part of request) {
    body += part;
    if (Buffer.byteLength(body) > 8192) throw new Error("Request too large.");
  }
  return JSON.parse(body || "{}");
}

function snapshot(room) {
  return { code: room.code, state: room.state, connected: room.connections.map(set => set.size > 0), joined: Boolean(room.tokens[1]) };
}

function broadcast(room) {
  const data = `data: ${JSON.stringify(snapshot(room))}\n\n`;
  for (const clients of room.connections) for (const response of clients) response.write(data);
}

function stream(request, response, room, side) {
  if (room.connections[side].size >= 5) return json(response, 429, { error: "Too many tabs connected to this seat." });
  response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-store",
    Connection: "keep-alive", "X-Accel-Buffering": "no" });
  response.write(": connected\n\n");
  room.connections[side].add(response);
  broadcast(room);
  const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 20000);
  request.on("close", () => {
    clearInterval(heartbeat);
    room.connections[side].delete(response);
    room.updated = Date.now();
    broadcast(room);
  });
}

function mutate(room, side, body) {
  if (body.version !== room.state.version) throw new Error("The match state changed. Try your action again.");
  if (body.command?.type === "chat") {
    const message = String(body.command.text || "").trim().slice(0, 240);
    if (!message) throw new Error("The message is empty.");
    record(room.state, `${teamName(room.state, side)}: ${message}`, "chat");
    room.state.version++;
    return;
  }
  if (body.command?.type === "reset") throw new Error("Create a new room for a new match.");
  if (side !== actingSide(room.state)) throw new Error("The other coach must act now.");
  room.state = applyCommand(room.state, body.command, random);
}

/** In-memory exhibitions; an optional league adapter supplies canonical teams at creation. */
export function createRoomHandler({ start, requireCoach } = {}) {
  const rooms = new Map();
  return async function handleRoom(request, response, url) {
    if (!url.pathname.startsWith("/api/play/")) return false;
    try {
      const origin = request.headers.origin;
      if (origin && new URL(origin).host !== request.headers.host) return json(response, 403, { error: "Cross-origin requests are not allowed." }), true;
      for (const [code, room] of rooms) {
        if (Date.now() - room.updated > 7200000 && room.connections.every(set => !set.size)) rooms.delete(code);
      }
      if (url.pathname === "/api/play/rooms" && request.method === "POST") {
        if (rooms.size >= 100) throw new Error("The demo server is full.");
        const body = await readPlayBody(request);
        if (body.teams && !start) throw new Error("Open the league site to play with database teams.");
        const state = await start?.(request, body) || createMatch();
        let code;
        do { code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase(); } while (rooms.has(code));
        const room = { code, state, league: Boolean(body.teams), tokens: [token(), null], connections: [new Set(), new Set()], updated: Date.now() };
        rooms.set(code, room);
        json(response, 201, { ...snapshot(room), side: 0, token: room.tokens[0] });
        return true;
      }
      const match = url.pathname.match(/^\/api\/play\/rooms\/([A-F0-9]{6})\/(join|events|command)$/);
      const room = match && rooms.get(match[1]);
      if (!room) { json(response, 404, { error: "Room not found. The server may have restarted." }); return true; }
      room.updated = Date.now();
      if (match[2] === "join" && request.method === "POST") {
        if (room.league) await requireCoach(request);
        if (room.tokens[1]) throw new Error("Both seats are already taken.");
        room.tokens[1] = token();
        json(response, 200, { ...snapshot(room), side: 1, token: room.tokens[1] });
        broadcast(room);
        return true;
      }
      const credential = match[2] === "events" ? url.searchParams.get("token") : request.headers.authorization?.replace(/^Bearer /, "");
      const side = credential ? room.tokens.indexOf(credential) : -1;
      if (side < 0) { json(response, 403, { error: "This seat credential is invalid." }); return true; }
      if (match[2] === "events" && request.method === "GET") stream(request, response, room, side);
      else if (match[2] === "command" && request.method === "POST") {
        mutate(room, side, await readPlayBody(request));
        broadcast(room); json(response, 200, snapshot(room));
      } else json(response, 405, { error: "Method not allowed." });
    } catch (error) {
      const status = error.status || (error.code ? 500 : 409);
      json(response, status, { error: status >= 500 ? "Could not load league teams." : error.message || "Command failed." });
    }
    return true;
  };
}
