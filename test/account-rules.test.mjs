import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LOGIN_MIN_LENGTH, PASSWORD_MIN_LENGTH, STRONG_PASSWORD_LENGTH,
  normalizeTelegram, passwordChangeChecks, passwordStrength, registrationProblems, telegramProblem, telegramUrl,
} from "../src/domain/account.mjs";

test("the lengths are the server's", () => {
  assert.deepEqual([LOGIN_MIN_LENGTH, PASSWORD_MIN_LENGTH, STRONG_PASSWORD_LENGTH], [3, 4, 8]);
});

test("the server reads its lengths from the same module, in every file that checks them", () => {
  const files = ["server/routes/auth.mjs", "server/routes/account.mjs", "server/routes/admin.mjs", "server/season/coach-entry.mjs"];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /from "\.\.\/\.\.\/src\/domain\/account\.mjs"/, file);
    assert.doesNotMatch(source, /length < [34]\b/, file);
  }
});

test("a Telegram contact is @ and 5 to 32 letters, digits or underscores; a bare name gets its @", () => {
  assert.equal(normalizeTelegram("  felstell "), "@felstell");
  assert.equal(normalizeTelegram("t.me/felstell"), "t.me/felstell");
  assert.equal(telegramProblem(""), "TELEGRAM_REQUIRED");
  assert.equal(telegramProblem("@abcd"), "TELEGRAM_FORMAT");
  assert.equal(telegramProblem("abcde"), null);
  assert.equal(telegramProblem(`@${"a".repeat(33)}`), "TELEGRAM_FORMAT");
  assert.equal(telegramProblem("@тренер_лиги"), "TELEGRAM_FORMAT");
  assert.equal(telegramProblem("t.me/felstell"), "TELEGRAM_FORMAT");
});

test("a contact the forms accept is a t.me address; anything else is none", () => {
  assert.equal(telegramUrl("@lilit_leaps"), "https://t.me/lilit_leaps");
  assert.equal(telegramUrl("lilit_leaps"), "https://t.me/lilit_leaps");
  assert.equal(telegramUrl("  @lilit_leaps "), "https://t.me/lilit_leaps");
  for (const contact of ["@ab", "https://t.me/x", "t.me/lilit_leaps", "", null, undefined, "@lilit leaps", "@тренер_лиги"]) {
    assert.equal(telegramUrl(contact), "", String(contact));
  }
});

test("password strength has three steps", () => {
  assert.deepEqual(["", "abc", "abcd", "abcdefg", "abcdefgh"].map(passwordStrength), [0, 1, 2, 2, 3]);
});

test("registration names each field's problem, and only those", () => {
  assert.deepEqual(registrationProblems({ login: " ab ", telegram: "@ab", password: "abc", repeat: "abd" }),
    { login: "LOGIN_TOO_SHORT", telegram: "TELEGRAM_FORMAT", password: "PASSWORD_TOO_SHORT", repeat: "PASSWORDS_DIFFER" });
  assert.deepEqual(registrationProblems({ login: "yury", telegram: "felstell", password: "abcd", repeat: "abcd" }), {});
  assert.deepEqual(registrationProblems({ login: "yury", telegram: "", password: "abcd", repeat: "" }),
    { telegram: "TELEGRAM_REQUIRED", repeat: "PASSWORDS_DIFFER" });
});

test("a password change passes three checks: long enough, new, typed twice", () => {
  const checks = (input) => Object.fromEntries(passwordChangeChecks(input).map(({ key, ok }) => [key, ok]));
  assert.deepEqual(passwordChangeChecks({ current: "", next: "", repeat: "" }).map(({ key }) => key), ["length", "different", "match"]);
  assert.deepEqual(checks({ current: "old1", next: "new1", repeat: "new1" }), { length: true, different: true, match: true });
  assert.deepEqual(checks({ current: "same", next: "same", repeat: "same" }), { length: true, different: false, match: true });
  assert.deepEqual(checks({ current: "", next: "abc", repeat: "" }), { length: false, different: true, match: false });
  assert.deepEqual(checks({ current: "x", next: "", repeat: "" }), { length: false, different: false, match: false });
});
