import test from "node:test";
import assert from "node:assert/strict";

import { detectDefaultLocale, isSupportedLocale, setDictionaries, t } from "../src/core/i18n.mjs";
import { clearReferenceCache, loadReferenceData } from "../src/data/reference.mjs";

// The module keeps one global locale, so these tests set the dictionaries they
// need and rely on the default locale being "en" until a DOM is involved.
setDictionaries({
  en: {
    "nav.builder": "Team Builder",
    "validation.POSITION_MAX": "{position}: maximum is {max}.",
    "only.english": "English only",
  },
  ru: {
    "nav.builder": "Билдер",
    "validation.POSITION_MAX": "{position}: максимум {max}.",
  },
});

test("a known key comes back translated", () => {
  assert.equal(t("nav.builder"), "Team Builder");
});

test("an unknown key comes back as itself rather than blank", () => {
  // A missing string should look wrong in review, not disappear from the screen.
  assert.equal(t("nav.doesNotExist"), "nav.doesNotExist");
});

test("parameters fill the placeholders the domain sends", () => {
  assert.equal(
    t("validation.POSITION_MAX", { position: "Blitzer", max: 2 }),
    "Blitzer: maximum is 2.",
  );
});

test("a placeholder with no value is left visible instead of printing undefined", () => {
  assert.equal(t("validation.POSITION_MAX", { position: "Blitzer" }), "Blitzer: maximum is {max}.");
});

test("the browser's languages decide the default locale", () => {
  assert.equal(detectDefaultLocale({ languages: ["ru-RU", "en-US"] }), "ru");
  assert.equal(detectDefaultLocale({ languages: ["en-GB"] }), "en");
  assert.equal(detectDefaultLocale({ languages: [], language: "ru" }), "ru");
  assert.equal(detectDefaultLocale({}), "en");
  assert.equal(detectDefaultLocale(undefined), "en");
});

test("only the locales the build produces are accepted", () => {
  assert.equal(isSupportedLocale("en"), true);
  assert.equal(isSupportedLocale("ru"), true);
  assert.equal(isSupportedLocale("de"), false);
  assert.equal(isSupportedLocale(""), false);
});

// ---------------------------------------------------------------------------
// Reference content
// ---------------------------------------------------------------------------

test("reference data is fetched once per locale", async () => {
  clearReferenceCache();
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({ teams: [] }) };
  };

  await loadReferenceData("en", { version: "v1", fetchFn });
  await loadReferenceData("en", { version: "v1", fetchFn });
  assert.equal(calls, 1, "the second call is served from cache");

  await loadReferenceData("ru", { version: "v1", fetchFn });
  assert.equal(calls, 2, "a different locale is fetched");
});

test("inlined data skips the fetch entirely", async () => {
  clearReferenceCache();
  const fetchFn = async () => { throw new Error("should not be called"); };
  const data = await loadReferenceData("en", {
    version: "v1",
    fetchFn,
    inlineData: { en: { teams: [{ slug: "teams/amazon" }] } },
  });
  assert.equal(data.teams[0].slug, "teams/amazon");
});

test("a missing data file says so instead of failing to parse HTML", async () => {
  clearReferenceCache();
  const fetchFn = async () => ({
    ok: false,
    status: 404,
    json: async () => { throw new SyntaxError("Unexpected token <"); },
  });
  await assert.rejects(
    () => loadReferenceData("ru", { version: "v1", fetchFn }),
    /Reference data for "ru" is missing \(404\)/,
  );
});
