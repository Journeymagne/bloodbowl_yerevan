import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../server/db/pool.mjs";
import { handleGameRoutes } from "../server/routes/games.mjs";
import { publicGame } from "../server/api/serializers.mjs";

test("logo responses stop API dispatch for missing, successful and cached images", async () => {
  const original = pool.query;
  const url = new URL("http://localhost/api/team-logos/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa");
  const response = () => ({ writes: [], ends: 0,
    writeHead(status, headers) { this.writes.push({ status, headers }); },
    end(body) { this.ends++; this.body = body; } });
  try {
    pool.query = async () => ({ rows: [] });
    const missing = response();
    assert.equal(await handleGameRoutes({ method: "GET", headers: {} }, missing, url), true);
    assert.equal(missing.writes[0].status, 404); assert.equal(missing.ends, 1);
    pool.query = async () => ({ rows: [{ logo_data: "data:image/png;base64,dGVzdA==" }] });
    const image = response();
    assert.equal(await handleGameRoutes({ method: "GET", headers: {} }, image, url), true);
    assert.equal(image.writes[0].status, 200); assert.equal(image.body.toString(), "test");
    const cached = response();
    assert.equal(await handleGameRoutes({ method: "GET", headers: { "if-none-match": image.writes[0].headers.ETag } }, cached, url), true);
    assert.equal(cached.writes[0].status, 304); assert.equal(cached.ends, 1);
  } finally { pool.query = original; }
});

test("game pages request logos only for teams that have an image", () => {
  const game = publicGame({ home_user_id: "home", home_team_id: "h", home_team_has_logo: true,
    away_user_id: "away", away_team_id: "a", away_team_has_logo: false }, "home");
  assert.equal(game.home.team.logoUrl, "/api/team-logos/h");
  assert.equal(game.away.team.logoUrl, null);
});
