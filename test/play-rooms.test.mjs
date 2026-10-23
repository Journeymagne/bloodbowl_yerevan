import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createPlayServer } from "../scripts/serve-play.mjs";
import { createMatch } from "./helpers/play-state.mjs";
import { createMatch as pregameMatch } from "../src/play/model.mjs";

const server = createPlayServer({ start: async (_request, body) => body.pregame ? pregameMatch() : createMatch() });
let base;
before(async () => {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
async function post(url, body = {}, token, headers = {}) {
  const response = await fetch(base + url, { method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test("two seats share one authoritative state, reject third seat, outsider and out-of-turn commands", async () => {
  const host = (await post("/api/play/rooms")).body;
  const path = `/api/play/rooms/${host.code}`;
  const guest = (await post(`${path}/join`)).body;
  assert.equal(host.side, 0); assert.equal(guest.side, 1);
  assert.equal((await post(`${path}/join`)).status, 409);
  assert.equal((await post(`${path}/command`, { version: 0, command: { type: "endTurn" } }, "invalid")).status, 403);
  assert.equal((await post(`${path}/command`, { version: 0, command: { type: "endTurn" } }, guest.token)).status, 409);
  const moved = await post(`${path}/command`, { version: 0, command: { type: "move", id: "0-5", action: "move", x: 8, y: 8 } }, host.token);
  assert.equal(moved.status, 200);
  assert.equal(moved.body.state.ball.x, 8);
  assert.equal(moved.body.state.version, 1);
  assert.equal((await post(`${path}/command`, { version: 0, command: { type: "endTurn" } }, host.token)).status, 409);
  const turn = await post(`${path}/command`, { version: 1, command: { type: "endTurn" } }, host.token);
  assert.equal(turn.body.state.active, 1);
  const guestTurn = await post(`${path}/command`, { version: 2, command: { type: "endTurn" } }, guest.token);
  assert.equal(guestTurn.status, 200);
  assert.equal(guestTurn.body.state.active, 0);
  assert.equal((await post(`${path}/command`, { version: 3, command: { type: "reset" } }, host.token)).status, 409);
});

test("SSE reconnect snapshot contains current state and no seat secrets", async () => {
  const host = (await post("/api/play/rooms")).body;
  await post(`/api/play/rooms/${host.code}/command`, { version: 0, command: { type: "endTurn" } }, host.token);
  const abort = new AbortController();
  const response = await fetch(`${base}/api/play/rooms/${host.code}/events?token=${host.token}`, { signal: abort.signal });
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const reader = response.body.getReader();
  let text = "";
  while (!text.includes("data: ")) text += new TextDecoder().decode((await reader.read()).value);
  const data = JSON.parse(text.split("data: ")[1].split("\n\n")[0]);
  assert.equal(data.state.active, 1);
  assert.equal(data.state.version, 1);
  assert.equal(text.includes(host.token), false);
  abort.abort();
  await reader.cancel().catch(() => {});
});

test("chat is shared even out of turn; snapshots never accept client dice or state", async () => {
  const host = (await post("/api/play/rooms")).body;
  const guest = (await post(`/api/play/rooms/${host.code}/join`)).body;
  const chat = await post(`/api/play/rooms/${host.code}/command`, {
    version: 0, state: { score: [99, 99] }, command: { type: "chat", text: "<script>hello</script>" },
  }, guest.token);
  assert.equal(chat.status, 200);
  assert.deepEqual(chat.body.state.score, [0, 0]);
  assert.ok(chat.body.state.log.at(-1).text.includes("<script>hello</script>"));
});

test("static serving blocks secrets and cross-origin room writes", async () => {
  for (const path of ["/.env", "/.git/config", "/server/server.mjs", "/package.json", "/assets/%2e%2e/.env"]) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal((await fetch(base + "/src/play/app.mjs")).status, 200);
  assert.equal((await post("/api/play/rooms", {}, null, { Origin: "https://example.com" })).status, 403);
});

test("online dice wait for the correct coach, use server rolls, and reject stale double confirmations", async () => {
  const host = (await post("/api/play/rooms")).body;
  const path = `/api/play/rooms/${host.code}`;
  const guest = (await post(`${path}/join`)).body;
  const send = (version, command, credential = host.token) =>
    post(`${path}/command`, { version, command }, credential);
  let reply = await send(0, { type: "block", id: "0-0", target: "1-0" });
  assert.equal(reply.status, 200);
  let s = reply.body.state;
  assert.equal(s.pending.stage, "ready");
  assert.equal(s.rollCount, 0);
  assert.deepEqual(s.pending.entry.values, []);
  assert.equal((await send(s.version, { type: "confirmRoll" }, guest.token)).status, 409);
  assert.equal((await send(s.version, { type: "endTurn" })).status, 409);
  const before = s.version;
  reply = await send(before, { type: "confirmRoll", values: [99, 99, 99] });
  assert.equal(reply.status, 200);
  s = reply.body.state;
  assert.equal(s.pending.stage, "result");
  assert.ok(s.pending.entry.values.every(value => value >= 1 && value <= 6));
  assert.equal((await send(before, { type: "confirmRoll" })).status, 409);
  assert.equal((await send(s.version, { type: "confirmRoll" })).status, 409);
  assert.equal((await send(s.version, { type: "acceptRoll" }, guest.token)).status, 409);
  const chat = await send(s.version, { type: "chat", text: "Your reroll decision" }, guest.token);
  s = chat.body.state;
  reply = await send(s.version, { type: "selectReroll", source: "Team" });
  s = reply.body.state;
  assert.equal(s.pending.stage, "reroll-ready");
  assert.equal(s.rerolls[0], 2);
  reply = await send(s.version, { type: "confirmRoll" });
  s = reply.body.state;
  assert.equal(s.rerolls[0], 1);
  assert.equal((await send(s.version, { type: "selectReroll", source: "Team" })).status, 409);
  reply = await send(s.version, { type: "acceptRoll" });
  s = reply.body.state;
  assert.equal(s.pending.type, "block");
  assert.equal(s.log.filter(entry => entry.text.endsWith("Your reroll decision")).length, 1);
  assert.equal(s.rerolls[0], 1);
});

test("online pre-game passes control between coaches and locks each drive lineup independently", async () => {
  const host = (await post("/api/play/rooms", { pregame: true })).body;
  const path = `/api/play/rooms/${host.code}`;
  const guest = (await post(`${path}/join`)).body;
  const seats = [host, guest];
  let s = host.state;
  const send = async command => {
    const side = s.pending?.chooser ?? s.active;
    const rejected = await post(`${path}/command`, { version: s.version, command }, seats[1 - side].token);
    assert.equal(rejected.status, 409);
    const accepted = await post(`${path}/command`, { version: s.version, command }, seats[side].token);
    assert.equal(accepted.status, 200, accepted.body.error);
    s = accepted.body.state;
  };
  const resolve = async () => {
    while (s.pending?.type === "roll") {
      await send({ type: s.pending.stage === "ready" ? "confirmRoll" : "acceptRoll" });
    }
  };
  await send({ type: "pregameWeather" }); await resolve();
  for (let attempt = 0; attempt < 20 && s.pending.type === "coin-toss"; attempt++) {
    await send({ type: "coinToss" }); await resolve();
  }
  assert.equal(s.pending.type, "receive-choice");
  await send({ type: "chooseReceive", receive: true });
  const kicker = s.drive.kicker;
  assert.equal(s.pending.chooser, kicker);
  const outgoing = s.players.find(p => p.team === kicker && p.status === "standing");
  const replacement = s.players.find(p => p.team === kicker && p.status === "reserve");
  await send({ type: "setupToggle", id: outgoing.id });
  const invalid = await post(`${path}/command`, { version: s.version, command: { type: "setupConfirm" } }, seats[kicker].token);
  assert.equal(invalid.status, 409);
  await send({ type: "setupPlace", id: replacement.id, x: outgoing.x, y: outgoing.y });
  await send({ type: "setupConfirm" });
  assert.equal(s.pending.chooser, 1 - kicker);
  await send({ type: "setupConfirm" });
  assert.equal(s.pending.type, "kicker"); assert.equal(s.pending.chooser, kicker);
  assert.equal(s.players.filter(p => p.status === "standing").length, 14);
});
