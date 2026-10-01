import test from "node:test";
import assert from "node:assert/strict";
import { renderHomeSeason } from "../src/components/home-season.mjs";
import { setDictionaries } from "../src/core/i18n.mjs";

setDictionaries({ en: { "home.seasonUnavailable": "Unavailable", "home.noSeason": "No season" } });

test("an unavailable response does not present stale standings as current", () => {
  const html = renderHomeSeason({ error: "offline", data: { season: { name: "Stale" }, standings: [] } });
  assert.match(html, /Unavailable/);
  assert.match(html, /data-home-retry/);
  assert.doesNotMatch(html, /Stale/);
});

test("a missing season stays an honest empty state", () => {
  assert.match(renderHomeSeason({ data: null }), /No season/);
  assert.doesNotMatch(renderHomeSeason({ data: {} }), /<table/);
});

test("snapshot uses actual rows, escapes names and links to complete standings", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ rank: i + 1, points: i, team: { name: `<Team ${i}>` } }));
  const html = renderHomeSeason({ data: { season: { name: '<Season>' }, standings: rows } });
  assert.match(html, /&lt;Season&gt;/);
  assert.match(html, /&lt;Team 4&gt;/);
  assert.doesNotMatch(html, /Team 5|<Team/);
  assert.match(html, /#\/season\/standings/);
});
