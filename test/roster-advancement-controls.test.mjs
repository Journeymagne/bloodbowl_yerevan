import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expandCollections } from "../src/data/reference.mjs";
import { createDraft, createPlayer, normalizeDraft } from "../src/domain/roster/schema.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";
import { playerAvailableSpp } from "../src/domain/roster/progression.mjs";
import { rosterForStorage } from "../src/data/roster-draft.mjs";
import { setDictionaries } from "../src/core/i18n.mjs";
import { playerAdvancementChoices, renderPlayerAdvancements, renderPlayerLevel, wirePlayerAdvancements } from "../src/components/roster-editor/advancement-controls.mjs";

const data = expandCollections(JSON.parse(await readFile(new URL("../public/data.en.json", import.meta.url), "utf8")));
const team = data.teams.find(team => team.slug === "teams/human"), row = rowsForTeam(team)[0];
setDictionaries({ en: JSON.parse(await readFile(new URL("../src/i18n/en.json", import.meta.url), "utf8")) });

function editor() {
  const draft = createDraft(team), player = createPlayer(row, 0, 0), handlers = new Map(), renders = [];
  draft.players = [player]; player.spp = { mvps: 20 }; player.advancements = [{ type: "random" }];
  const fields = { grant: "", type: "" };
  const card = { querySelector: selector => ({ value: selector.includes("-grant") ? fields.grant : fields.type }) };
  wirePlayerAdvancements((event, selector, handler) => handlers.set(`${event}:${selector}`, handler), {
    team, draft, skillGroups: data.skillGroups, rerender: options => renders.push(options),
  });
  const event = (name, selector, target = {}) => handlers.get(`${name}:${selector}`)({ target, card, player });
  const select = (grant, type) => {
    fields.grant = grant; fields.type = type;
    event("change", "[data-saved-player-advancement-grant]", { value: grant });
    event("change", "[data-saved-player-advancement-type]", { value: type });
  };
  const confirm = () => event("click", "[data-saved-player-add-advancement]");
  const html = () => renderPlayerAdvancements(team, draft, { ...player, row }, data.skillGroups);
  return { draft, player, fields, renders, event, select, confirm, html };
}

test("selection does not spend SPP; confirmation persists the skill with the current rank's payment", () => {
  for (const [type, cost] of [["random", 4], ["primary", 8], ["secondary", 12]]) {
    const ui = editor(), before = playerAvailableSpp(team, ui.player);
    const choice = playerAdvancementChoices(row, ui.player, data.skillGroups).find(choice => choice.types.includes(type));
    ui.select(choice.value, type);
    assert.equal(playerAvailableSpp(team, ui.player), before);
    assert.equal(ui.player.extraSkills.length, 0);
    assert.deepEqual(ui.renders, [{ save: false }, { save: false }]);
    ui.confirm();
    assert.equal(playerAvailableSpp(team, ui.player), before - cost);
    assert.deepEqual(ui.player.advancements[1], { type, grants: choice.grant });
    assert.ok(ui.player.extraSkills.some(skill => skill.name === choice.grant.skill));
    const stored = normalizeDraft(rosterForStorage(ui.draft)).players[0];
    assert.deepEqual(stored.advancements[1], { type, grants: choice.grant });
    assert.ok(stored.extraSkills.some(skill => skill.name === choice.grant.skill));
    assert.doesNotMatch(ui.html(), /data-saved-player-add-skill/);
  }
});

test("changing a skill resets the acquisition method and never grants a skill with the wrong access", () => {
  const ui = editor(), before = structuredClone(ui.player);
  const secondary = playerAdvancementChoices(row, ui.player, data.skillGroups).find(choice => choice.types.includes("secondary"));
  ui.select(secondary.value, "primary"); ui.confirm();
  assert.deepEqual(ui.player, before);
  assert.match(ui.html(), /data-saved-player-add-advancement disabled/);
  ui.select(secondary.value, "secondary");
  const primary = playerAdvancementChoices(row, ui.player, data.skillGroups).find(choice => choice.types.includes("primary"));
  ui.event("change", "[data-saved-player-advancement-grant]", { value: primary.value });
  assert.match(ui.html(), /<option value="" selected>Choose how it was obtained/);
  assert.match(ui.html(), /data-saved-player-add-advancement disabled/);
  ui.fields.grant = "skill:Not a skill";
  ui.confirm();
  assert.deepEqual(ui.player, before);
});

test("removing the skill or its advancement refunds its payment and takes back the granted skill", () => {
  for (const throughSkill of [true, false]) {
    const ui = editor(), before = playerAvailableSpp(team, ui.player);
    const choice = playerAdvancementChoices(row, ui.player, data.skillGroups).find(choice => choice.types.includes("primary"));
    ui.select(choice.value, "primary"); ui.confirm();
    ui.event("click", throughSkill ? "[data-saved-player-remove-skill]" : "[data-saved-player-remove-advancement]", {
      dataset: { savedPlayerRemoveSkill: choice.grant.skill, savedPlayerRemoveAdvancement: "1" },
    });
    assert.equal(playerAvailableSpp(team, ui.player), before);
    assert.equal(ui.player.advancements.length, 1);
    assert.ok(!ui.player.extraSkills.some(skill => skill.name === choice.grant.skill));
  }
});

test("characteristic confirmation and cancellation update the stat and its SPP payment together", () => {
  const ui = editor(), before = playerAvailableSpp(team, ui.player);
  ui.select("stat:ma", "stat"); ui.confirm();
  assert.equal(ui.player.statMods.ma, 1);
  assert.equal(playerAvailableSpp(team, ui.player), before - 16);
  ui.event("click", "[data-saved-player-remove-advancement]", { dataset: { savedPlayerRemoveAdvancement: "1" } });
  assert.equal(ui.player.statMods.ma ?? 0, 0);
  assert.equal(playerAvailableSpp(team, ui.player), before);
});

test("an unaffordable selection stays disabled and SPP are shown in separate labelled balance rows", () => {
  const ui = editor(); ui.player.spp = { mvps: 1 }; ui.player.advancements = [];
  const choice = playerAdvancementChoices(row, ui.player, data.skillGroups).find(choice => choice.types.includes("primary"));
  ui.select(choice.value, "primary");
  assert.match(ui.html(), /data-saved-player-add-advancement disabled/);
  assert.match(ui.html(), /5 available/);
  const balance = renderPlayerLevel(team, ui.player);
  assert.match(balance, /<h4>SPP<\/h4>/);
  assert.match(balance, /<dt>Available<\/dt><dd data-player-available-spp>5<\/dd>/);
  assert.match(balance, /<dt>Earned<\/dt>/);
  assert.match(balance, /<dt>Spent<\/dt>/);
  assert.doesNotMatch(balance, /SPP (earned|spent|available)/);
});
