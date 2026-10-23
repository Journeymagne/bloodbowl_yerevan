import test from "node:test";
import assert from "node:assert/strict";
import { mount, assertCspSafe } from "./helpers/ui.mjs";
import { renderTeamLogo, teamLogoProps, teamLogoSource, wireTeamLogos } from "../src/ui/team-logo.mjs";
import { publicSavedTeamSummary, publicSavedTeamSlim, publicSeasonEntry } from "../server/api/serializers.mjs";
import { shellModel } from "../src/shell/navigation.mjs";
import { renderSideNav } from "../src/shell/side-nav.mjs";
import { renderAppHeader } from "../src/shell/app-header.mjs";
import { switcherRows, renderTeamFace } from "../src/shell/team-switcher.mjs";
import { coachModel } from "../src/screens/coaches/profile.mjs";
import { seasonTable } from "../src/data/season-table.mjs";
import { leagueTableMarkup, miniTableMarkup } from "../src/screens/season/table.mjs";
import { roundsMarkup } from "../src/screens/season/league.mjs";
import { renderMatchCard } from "../src/ui/match-card.mjs";
import { renderMatchBoard } from "../src/ui/match-board.mjs";
import { gamePageModel } from "../src/screens/matches/game-model.mjs";
import { ownSideOf, opponentOf } from "../src/screens/matches/band.mjs";

const png = "data:image/png;base64,dGVzdA==";
const logoUrl = "/api/team-logos/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa?v=2026-10-23T10%3A00%3A00.000Z";
const team = { id: "t1", name: "Spartak Arabkir", baseTeamSlug: "teams/khorne", logoUrl };
const user = { id: "u1", login: "coach" };
const hasLogo = (html, expected = logoUrl) => {
  const fragment = mount(html);
  assert.equal(fragment.querySelector("img[data-team-logo]")?.getAttribute("src"), expected);
  assert.equal(fragment.querySelector("img[data-team-logo]").getAttribute("alt"), "");
  assertCspSafe(fragment);
};

test("logo sources accept raster data and local image references; absent and unsafe sources keep the exact fallback", () => {
  hasLogo(renderTeamLogo(team));
  hasLogo(renderTeamLogo(teamLogoProps({ logoData: png })), png);
  for (const value of ["", null, "javascript:alert(1)", "https://example.com/a.png", "/api/team-logos/x\" onerror=bad", "data:image/svg+xml;base64,PHN2Zz4="]) {
    for (const key of ["logoData", "logoUrl"]) {
      assert.equal(teamLogoSource({ [key]: value }), "");
      assert.equal(renderTeamLogo({ [key]: value }, { fallbackHtml: "<b>SA</b>" }), "<b>SA</b>");
    }
  }
  assert.deepEqual(teamLogoProps({}), {});
});

test("a failed image reveals the original fallback and a replacement image can load", () => {
  const listeners = [];
  const root = { addEventListener: (...args) => listeners.push(args) };
  wireTeamLogos(root); wireTeamLogos(root);
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0][0], "error"); assert.equal(listeners[0][2], true);
  for (const fallbackHtml of ["<b>SA</b>", ""]) {
    const failedTeam = { logoUrl: `/api/team-logos/failed-${fallbackHtml ? "with" : "without"}` };
    const fragment = mount(renderTeamLogo(failedTeam, { fallbackHtml }));
    const image = fragment.querySelector("img");
    listeners[0][1]({ target: image });
    assert.equal(image.hidden, true);
    if (fallbackHtml) assert.equal(fragment.querySelector("[data-team-logo-fallback]").hidden, false);
    else assert.equal(image.parentNode.hidden, true);
    assert.equal(renderTeamLogo(failedTeam, { fallbackHtml }), fallbackHtml);
    assert.match(renderTeamLogo({ logoUrl: failedTeam.logoUrl + "?v=2" }), /<img/);
  }
});

test("lightweight API teams retain versioned logo URLs without inline image data", () => {
  const updated = new Date("2026-10-23T10:00:00.000Z");
  const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  for (const serialize of [publicSavedTeamSummary, publicSavedTeamSlim]) {
    const output = serialize({ id, logo_data: png, updated_at: updated, roster: {} });
    assert.equal(output.logoUrl, logoUrl); assert.equal(output.logoData, null);
    assert.equal(serialize({ id, has_logo: false }).logoUrl, undefined);
    assert.notEqual(serialize({ id, has_logo: true, updated_at: "later" }).logoUrl, output.logoUrl);
  }
  const entry = publicSeasonEntry({ saved_team_id: id, team_has_logo: true, team_updated_at: updated });
  assert.equal(entry.team.logoUrl, logoUrl); assert.equal(entry.team.logoData, null);
});

test("sidebar, mobile header, switcher and coach team lists carry their team's logo and keep existing placeholders", () => {
  const model = shellModel({ route: { name: "team" }, user, team });
  hasLogo(renderSideNav(model, { locale: "en" }));
  hasLogo(renderAppHeader(model));
  const [row] = switcherRows({ teams: [team], activeTeamId: team.id, raceTitleOf: () => "Khorne", seasonData: null, games: [] });
  hasLogo(renderTeamFace(row));
  const profile = coachModel({ user, teams: [team], viewerId: user.id, games: [], seasonData: null });
  hasLogo(renderTeamFace(profile.teams[0]));
  const plain = { ...team, logoUrl: null };
  assert.match(renderSideNav(shellModel({ route: { name: "team" }, user, team: plain }), { locale: "en" }), /g-crest/);
  assert.match(renderTeamFace({ name: "Spartak", initials: "SA" }), /g-teamface__tile/);
});

test("both tables and calendar pairings preserve logo references from season entries", () => {
  const rows = seasonTable({ rounds: [], standings: [{ rank: 1, entryId: "e1", user, team, games: 0, points: 0 }] });
  for (const phone of [true, false]) hasLogo(leagueTableMarkup({ rows, phone, labelledBy: "standings" }));
  hasLogo(miniTableMarkup({ rows, viewerId: user.id, href: "#/season" }));
  hasLogo(roundsMarkup([{ number: 1, pairings: [{ id: "p1", home: { user, team }, away: { user, team: { name: "Other" } }, waiting: "none" }] }], {}));
});

test("match page and overview models display either side's logo alongside the unchanged team names", () => {
  const side = { user, team };
  const game = { id: "g1", home: side, away: { user: { id: "u2" }, team: { id: "t2", name: "Other", logoData: png } }, resultStatus: "none" };
  const model = gamePageModel({ game, viewer: user });
  const html = renderMatchCard({ title: "Match", home: model.home, away: model.away });
  const fragment = mount(html);
  assert.equal(fragment.querySelectorAll("img[data-team-logo]").length, 2);
  assert.equal(fragment.querySelector(".g-match__name").textContent, team.name);
  for (const phone of [true, false]) {
    hasLogo(renderMatchBoard({ own: ownSideOf(team, null, null, phone), opponent: opponentOf(side, null, phone), status: "none" }));
  }
});
