import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PLAYER_STATS } from "../src/domain/roster/values.mjs";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function dictionaries() {
  const [en, ru] = await Promise.all(["en", "ru"].map(async (locale) => JSON.parse(
    await fs.readFile(path.join(rootDir, "src", "i18n", `${locale}.json`), "utf8"),
  )));
  return { en, ru };
}

/**
 * The keys the screens build by hand — `stats.${stat}` — cannot be found by
 * reading the source, which is the whole reason step 13.4 asked for the list to
 * be written down. This is what checking them looks like. (The game statuses'
 * `games.status.${status}` went with their last reader, 2.x «My games», in
 * stage 09c.)
 */
test("every characteristic has a column heading in both languages", async () => {
  const { en, ru } = await dictionaries();
  for (const stat of PLAYER_STATS) {
    assert.ok(en[`stats.${stat}`], `missing English heading for ${stat}`);
    assert.ok(ru[`stats.${stat}`], `missing Russian heading for ${stat}`);
  }
});

test("the characteristics are the five a roster table prints, in order", () => {
  assert.deepEqual([...PLAYER_STATS], ["ma", "st", "ag", "pa", "ar"]);
});
