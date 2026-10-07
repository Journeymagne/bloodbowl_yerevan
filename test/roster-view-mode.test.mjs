import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { state } from "../src/core/state.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { createDraft, createPlayer } from "../src/domain/roster/schema.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";
import { calculateRosterCosts } from "../src/domain/roster/costs.mjs";
import { teamFavouredOptions, teamLeagueOptions } from "../src/domain/roster/team-rules.mjs";
import { renderSppControls } from "../src/components/roster-editor/spp-controls.mjs";
import { renderStaffControl } from "../src/components/roster-editor/staff-control.mjs";
import { renderTeamRuleAccess } from "../src/components/roster-editor-shared.mjs";
import { LEAGUE_MODE } from "../src/components/roster-editor/modes.mjs";

// The layout's hire wiring imports the screen container; these tests render only.
globalThis.document = { querySelector: () => null };
const { renderMatchdayEditor } = await import("../src/components/roster-editor/matchday-layout.mjs");
delete globalThis.document;

state.data = expandCollections(JSON.parse(await readFile(new URL("../public/data.json", import.meta.url), "utf8")));
const team = state.data.teams.find(item => item.slug === "teams/dwarf");
const draft = createDraft(team);
const player = createPlayer(rowsForTeam(team)[0], 0, 0);
player.spp = { touchdowns: 3, casualties: 1, knockouts: 0, completions: 0, catches: 0, interceptions: 0, mvps: 1 };
player.advancements = [{ type: "primary" }];
draft.players = [player];

function assertInactiveButtons(html, count) {
  const buttons = html.match(/<button\b[^>]*>/g) ?? [];
  assert.equal(buttons.length, count);
  for (const button of buttons) assert.match(button, /\bdisabled\b/);
}

test("public SPP counters show values without editable inputs or action attributes", () => {
  const html = renderSppControls(team, player, { readOnly: true });
  assertInactiveButtons(html, 20);
  assert.doesNotMatch(html, /<input\b|data-saved-player-spp/);
  assert.match(html, /<output[^>]*aria-label="TD">3<\/output>/);
  assert.match(html, /<strong data-player-available-spp>8<\/strong>/);
  assert.match(html, /<small data-player-spp-total>[^<]*: 14<\/small>/);
  const editable = renderSppControls(team, player);
  assert.equal((editable.match(/<input\b/g) ?? []).length, 10);
  assert.match(editable, /data-saved-player-spp-action="touchdowns"/);
  assert.match(editable, /<strong data-player-available-spp>8<\/strong>/);
});

test("public staff counters cannot trigger purchases even with a nonzero value", () => {
  const options = { key: "teamRerolls", title: "Rerolls", value: 2, mode: LEAGUE_MODE };
  const html = renderStaffControl({ ...options, readOnly: true });
  assertInactiveButtons(html, 2);
  assert.doesNotMatch(html, /data-roster-staff/);
  assert.match(html, /<strong>2<\/strong>/);
  assert.match(renderStaffControl(options), /data-roster-staff="teamRerolls"/);
});

test("public team details never offer league or favoured selectors", () => {
  const choicesTeams = [
    state.data.teams.find(item => teamLeagueOptions(item).length > 1),
    state.data.teams.find(item => teamFavouredOptions(item).length > 1),
  ];
  for (const choicesTeam of choicesTeams) {
    assert.ok(choicesTeam, "the real reference has races with choices");
    const choicesDraft = createDraft(choicesTeam);
    assert.match(renderTeamRuleAccess(choicesTeam, choicesDraft, "roster"), /<select\b/);
    const html = renderTeamRuleAccess(choicesTeam, choicesDraft, "", { readOnly: true });
    assert.doesNotMatch(html, /<select\b|<input\b|data-roster-/);
    assert.ok(html.includes(choicesDraft.selectedLeague));
    assert.ok(html.includes(choicesDraft.favouredChoice));
  }
});

test("public Matchday omits hire actions and dialogs instead of hiding active controls", () => {
  const options = { team, draft, costs: calculateRosterCosts(team, draft), mode: LEAGUE_MODE,
    identityHtml: "", summaryHtml: "", purchasesHtml: "", playersHtml: "" };
  const html = renderMatchdayEditor({ ...options, readOnly: true });
  assert.doesNotMatch(html, /data-matchday-open-hire|data-add-saved-row|<dialog\b|matchday-mobile-dock/);
  assert.match(html, /matchday-hero/);
  assert.match(html, /data-total-spp-display/);
  assert.match(renderMatchdayEditor(options), /data-matchday-open-hire/);
});
