import assert from "node:assert/strict";
import test from "node:test";

import { applyMedicalAccess, medicalAccessByPageId, medicalAccessFrom } from "../scripts/lib/medical-access.mjs";
import { availableMedicalStaffDefinitions, canHireMedicalStaff, teamMedicalAccess } from "../src/domain/roster/team-rules.mjs";

const teamPage = (id, apothecary, extra = {}) => ({
  id,
  kind: "team",
  title: id,
  team: { meta: { apothecary, specialRules: "", ...extra } },
});

test("the English line decides which staff a team may hire", () => {
  assert.deepEqual(medicalAccessFrom("Available"), ["apothecary"]);
  assert.deepEqual(medicalAccessFrom("Apothecary: Available"), ["apothecary"]);
  assert.deepEqual(medicalAccessFrom("Mortuary Assistant"), ["mortuary"]);
  assert.deepEqual(medicalAccessFrom("Plague Doctor"), ["plague"]);
  assert.deepEqual(medicalAccessFrom(""), []);
});

test("the Russian pages get the English answer, not their own words", () => {
  const en = { pages: [teamPage("teams/amazon", "Available"), teamPage("teams/nurgle", "Plague Doctor")] };
  const ru = { pages: [teamPage("teams/amazon", "Есть"), teamPage("teams/nurgle", "Чумной доктор")] };

  const tokens = medicalAccessByPageId(en);
  applyMedicalAccess(en, tokens);
  applyMedicalAccess(ru, tokens);

  for (const data of [en, ru]) {
    const [amazon, nurgle] = data.pages;
    assert.deepEqual(teamMedicalAccess(amazon), ["apothecary"]);
    assert.deepEqual(teamMedicalAccess(nurgle), ["plague"]);
    // This is the bug: on the Russian page the rule used to read "Есть" and
    // find no English word in it, so the coach was offered nothing at all.
    assert.equal(canHireMedicalStaff(amazon, { access: "apothecary" }), true);
    assert.equal(canHireMedicalStaff(nurgle, { access: "plague" }), true);
    assert.equal(canHireMedicalStaff(nurgle, { access: "apothecary" }), false);
    assert.ok(availableMedicalStaffDefinitions(amazon).length > 0);
  }

  // The displayed prose stays in the reader's language.
  assert.equal(ru.pages[0].team.meta.apothecary, "Есть");
});

test("a special rule still opens a door the meta line does not", () => {
  const undead = teamPage("teams/shambling-undead", "Available", { specialRules: "Masters of Undeath" });
  applyMedicalAccess({ pages: [undead] }, new Map([["teams/shambling-undead", ["apothecary"]]]));
  assert.equal(canHireMedicalStaff(undead, { access: "mortuary" }), true);
});
