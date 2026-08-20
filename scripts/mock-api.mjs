#!/usr/bin/env node
/**
 * Static files plus a fake API, so the logged-in screens can be driven in a
 * browser without Postgres.
 *
 *   node scripts/mock-api.mjs          # serves on :5174
 *   node scripts/browser-check-roster.mjs
 *
 * It keeps one user and one saved team in memory, records every PATCH it
 * receives into .codex_tmp/mock-saves.json, and answers just enough of the API
 * for the saved roster, my-games, game, administration and player-profile
 * screens. Set MOCK_ADMIN=1 to sign in as an admin and reach the admin-only
 * ones. Not a substitute for `npm run smoke`, which exercises the real server.
 */
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";

import { resolveStaticPath } from "../server/http/static-path.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savesPath = path.join(rootDir, ".codex_tmp", "mock-saves.json");
const port = Number(process.env.MOCK_PORT || 5174);
const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".svg", "image/svg+xml"],
]);

const user = {
  id: "u1",
  login: "coach",
  telegram: "@coach",
  isAdmin: process.env.MOCK_ADMIN === "1",
  createdAt: new Date().toISOString(),
  savedTeamCount: 1,
  lastTeamUpdatedAt: new Date().toISOString(),
};
const rival = {
  id: "u2",
  login: "rival",
  telegram: "@rival",
  isAdmin: false,
  createdAt: new Date().toISOString(),
  savedTeamCount: 0,
  lastTeamUpdatedAt: null,
};
const team = {
  id: "t1",
  name: "Mock Team",
  baseTeamSlug: "amazon",
  logoData: null,
  roster: {
    teamSlug: "amazon",
    teamName: "Mock Team",
    players: [
      { id: "p1", rowIndex: 0, number: "1", name: "Linewoman One", statMods: {}, extraSkills: [], favouredSkills: [], spp: { touchdowns: 1 }, advancements: [] },
      { id: "p2", rowIndex: 1, number: "2", name: "Thrower Two", statMods: { ma: 1 }, extraSkills: [{ name: "Block", access: "primary" }], favouredSkills: [], spp: {}, advancements: [] },
    ],
    roster: { 0: 1, 1: 1 },
    treasury: 120,
    coachesSafe: 0,
    teamRerolls: 1,
    startingRerolls: 1,
    purchasedStaff: {},
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const game = {
  id: "g1",
  resultStatus: "awaiting_confirmation",
  roundStatus: "started",
  roundNumber: 1,
  viewerIsHome: true,
  season: { name: "Mock Season", currentRound: 1 },
  home: { user, team: { name: team.name } },
  away: { user: rival, team: { name: "Rival Team" } },
  homeTouchdowns: null,
  awayTouchdowns: null,
  homeCasualties: null,
  awayCasualties: null,
  proposedHomeTouchdowns: 2,
  proposedAwayTouchdowns: 1,
  proposedHomeCasualties: 1,
  proposedAwayCasualties: 0,
};

export const saves = [];

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://localhost:${port}`);
  const json = (status, payload) => {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
  };

  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/auth/me") return json(200, { user });
    if (url.pathname === "/api/auth/login") return json(200, { token: "mock", user });
    if (url.pathname === "/api/teams" && request.method === "GET") return json(200, { teams: [team] });
    if (url.pathname === "/api/teams/t1" && request.method === "PATCH") {
      const body = await readBody(request);
      saves.push(body);
      await fs.mkdir(path.dirname(savesPath), { recursive: true });
      await fs.writeFile(savesPath, JSON.stringify(saves, null, 1));
      Object.assign(team, { name: body.name, roster: body.roster, updatedAt: new Date().toISOString() });
      return json(200, { team });
    }
    if (url.pathname === "/api/games") return json(200, { games: [game], currentGames: [game] });
    if (url.pathname.startsWith("/api/games/")) return json(200, { game });
    if (url.pathname === "/api/admin/users") return json(200, { users: [user, rival] });
    if (url.pathname.startsWith("/api/admin/users/")) return json(200, { user, teams: [team] });
    if (/^\/api\/players\/[^/]+\/teams\/[^/]+$/.test(url.pathname)) return json(200, { user, team });
    if (url.pathname.startsWith("/api/players/")) return json(200, { user, teams: [team] });
    return json(200, {});
  }

  const fullPath = resolveStaticPath(url.pathname, rootDir);
  if (!fullPath) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const body = await fs.readFile(fullPath);
    response.writeHead(200, { "Content-Type": mime.get(path.extname(fullPath)) || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, () => console.log(`mock api on http://localhost:${port}`));
