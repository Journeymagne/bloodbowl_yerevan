import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { API_ERRORS, errorPayload, httpError } from "../server/http/errors.mjs";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every API error code has a message in both languages", async () => {
  const en = JSON.parse(await fs.readFile(path.join(rootDir, "src", "i18n", "en.json"), "utf8"));
  const ru = JSON.parse(await fs.readFile(path.join(rootDir, "src", "i18n", "ru.json"), "utf8"));
  for (const code of Object.keys(API_ERRORS)) {
    assert.ok(en[`error.${code}`], `missing English message for ${code}`);
    assert.ok(ru[`error.${code}`], `missing Russian message for ${code}`);
  }
});

test("a placeholder in the English text has one in the Russian too", async () => {
  const ru = JSON.parse(await fs.readFile(path.join(rootDir, "src", "i18n", "ru.json"), "utf8"));
  const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [code, text] of Object.entries(API_ERRORS)) {
    assert.deepEqual(
      placeholders(ru[`error.${code}`]),
      placeholders(text),
      `${code} fills different values in Russian than in English`,
    );
  }
});

test("httpError refuses a code it does not know", () => {
  assert.throws(() => httpError(400, "NO_SUCH_CODE"), /Unknown API error code/);
});

test("an error travels as a code, its values, and English to fall back on", () => {
  const error = httpError(413, "BODY_TOO_LARGE", { limitKb: 3072 });
  assert.equal(error.status, 413);
  assert.equal(error.code, "BODY_TOO_LARGE");
  assert.equal(error.message, "Request body is larger than 3072 KB.");

  const payload = errorPayload(error.code, error.params);
  assert.deepEqual(payload, {
    error: {
      code: "BODY_TOO_LARGE",
      params: { limitKb: 3072 },
      message: "Request body is larger than 3072 KB.",
    },
  });
});
