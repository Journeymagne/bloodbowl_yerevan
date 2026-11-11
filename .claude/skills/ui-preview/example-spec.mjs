// A PR's spec script, as the part 2 preview's (cut short): screenshot entries from spec-kit, the rest of the spec as
// SKILL.md §4 has it. Copy it to the scratchpad and run it:
//   node <scratchpad>\spec.mjs <screens dir> <scratchpad>\preview-spec.json
// then stitch.ps1 with the plan it writes (when an entry merges shots), then build.mjs.
import fs from "node:fs";
import path from "node:path";
import { createShotKit } from "./spec-kit.mjs";

const [dir, specOut] = process.argv.slice(2);
const { shot, merge, writePlan } = createShotKit(dir);
const DESK = { width: 1440 };

const items = [
  shot("coach-desk", { ...DESK, height: 1300, group: "Major", title: "Another coach's team: the Roster's table (desk)",
    what: "p1: the roster as its own grid — #, Player, Skills, TD, CAS, SPP. Branch: the Roster page's table, read only.",
    look: "two boxes: the tiles in the left card, and the «Roster» card at the right." }),
  // One page, several parts: one entry, its text going through the parts top to bottom.
  merge("coach-phone.png", [
    shot("coach-phone-tiles", { width: 390, height: 700 }),
    shot("coach-phone-missing", { width: 390, height: 700 }),
  ], { group: "Major", title: "Another coach's team on a phone",
    what: "Two parts of the page, top to bottom. The tiles — p1: … ; branch: … . Who misses the match — p1: … ; branch: … .",
    look: "the tiles; the red line under the last two players." }),
];

const spec = {
  title: "UI v2 Polish Part 2",
  repo: ".", base: "<scratchpad>\\preview-base", out: "output/previews/ui-v2-p2",
  fragments: { before: "<scratchpad>\\frag-empty.json", after: "<scratchpad>\\frag-empty.json" },
  labels: { before: "p1 (base)", after: "this branch" },
  intro: ["Before and after for <code>imp/UIv2-update-p2</code>; the base is the tip of <code>imp/UIv2-update-p1</code>, which it builds on."],
  groups: ["Major", "Normal"],
  sections: [],
  shots: { dir: dir.replace(/\\/g, "/"), note: "From the mock app, each side from its own build, light mode.", items },
};
fs.writeFileSync(specOut, JSON.stringify(spec, null, 2));
const merged = writePlan(path.join(path.dirname(specOut), "stitch-plan.json"));
console.log(`${items.length} entries${merged ? `, ${merged} to stitch` : ""}`);
