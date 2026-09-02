import assert from "node:assert/strict";
import test from "node:test";

import { generateTemporaryPassword, hashPassword, verifyPassword } from "../server/auth/session.mjs";

test("a generated password carries 96 random bits in a shareable form", () => {
  let requestedBytes = 0;
  const password = generateTemporaryPassword((size) => {
    requestedBytes = size;
    return Buffer.from(Array.from({ length: size }, (_, index) => index));
  });

  assert.equal(requestedBytes, 12);
  assert.equal(password, "AAECAwQFBgcICQoL");
  assert.match(password, /^[A-Za-z0-9_-]{16}$/);
});

test("the generated password works only against its replacement hash", () => {
  const oldHash = hashPassword("old-password", "00112233445566778899aabbccddeeff");
  const newPassword = generateTemporaryPassword(() => Buffer.alloc(12, 255));
  const newHash = hashPassword(newPassword, "ffeeddccbbaa99887766554433221100");

  assert.equal(verifyPassword("old-password", oldHash), true);
  assert.equal(verifyPassword("old-password", newHash), false);
  assert.equal(verifyPassword(newPassword, newHash), true);
});
