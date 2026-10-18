// A stand-in for the part of Chrome that scripts/screenshots/cdp.mjs talks to:
// /json/version and the browser's DevTools WebSocket, which answers every
// command with an empty result (three of them with the id the client needs).
// Node has a WebSocket client but no server, so the handshake and the two frame
// shapes it needs are written out here.

import crypto from "node:crypto";
import http from "node:http";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const ANSWERS = {
  "Target.createBrowserContext": { browserContextId: "context" },
  "Target.createTarget": { targetId: "target" },
  "Target.attachToTarget": { sessionId: "session" },
};

/** The whole frames at the start of `buffer`, unmasked, and the bytes after them. */
function readFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const masked = (buffer[offset + 1] & 0x80) !== 0;
    let length = buffer[offset + 1] & 0x7f;
    let start = offset + 2;
    if (length === 126 && buffer.length - offset >= 4) {
      length = buffer.readUInt16BE(offset + 2);
      start = offset + 4;
    } else if (length >= 126) {
      break;
    }
    const end = start + (masked ? 4 : 0) + length;
    if (buffer.length < end) break;
    const payload = Buffer.from(buffer.subarray(start + (masked ? 4 : 0), end));
    if (masked) for (let index = 0; index < payload.length; index += 1) payload[index] ^= buffer[start + (index % 4)];
    frames.push({ opcode: buffer[offset] & 0x0f, payload });
    offset = end;
  }
  return { frames, rest: buffer.subarray(offset) };
}

function textFrame(text) {
  const payload = Buffer.from(text);
  const header = payload.length < 126
    ? Buffer.from([0x81, payload.length])
    : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
  return Buffer.concat([header, payload]);
}

/**
 * @param {{onCommand?: (command: object, send: (message: object) => void) => boolean}} [options]
 *   return true from `onCommand` to take over a command, so that it is not answered
 *   here; `send` writes a message of its own to the socket, an answer or an event
 * @returns {Promise<{port: number, dropConnections: () => void, close: () => Promise<void>}>}
 */
export async function startFakeDevTools({ onCommand } = {}) {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    const address = `ws://127.0.0.1:${server.address().port}/devtools/browser/fake`;
    response.end(JSON.stringify({ Browser: "FakeChrome", webSocketDebuggerUrl: address }));
  });
  server.on("upgrade", (request, socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    const accept = crypto.createHash("sha1").update(request.headers["sec-websocket-key"] + WEBSOCKET_GUID).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let unread = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      const { frames, rest } = readFrames(Buffer.concat([unread, chunk]));
      unread = rest;
      for (const { opcode, payload } of frames) {
        if (opcode !== 1) continue;
        const command = JSON.parse(payload.toString());
        if (onCommand?.(command, (message) => socket.write(textFrame(JSON.stringify(message))))) continue;
        socket.write(textFrame(JSON.stringify({ id: command.id, result: ANSWERS[command.method] ?? {} })));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const dropConnections = () => {
    for (const socket of sockets) socket.destroy();
  };
  return {
    port: server.address().port,
    dropConnections,
    async close() {
      dropConnections();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
