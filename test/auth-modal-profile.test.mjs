import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { createDocument, el } from "./helpers/fake-dom.mjs";

// The 2.x modal reads its elements when it loads, so the page it wires is built first.
const api = installFakeApi();
const document = createDocument();
const field = (name, value) => el(document, "input", { name, value });
const profileForm = el(document, "form", { id: "auth-profile-form" });
profileForm.elements = { login: field("login", "coach"), telegram: field("telegram", "@coach"), password: field("password", "") };
const authError = el(document, "p", { id: "auth-error" });
const authButton = el(document, "button", { id: "auth-button" });
for (const node of [profileForm, authError, authButton]) document.body.appendChild(node);
globalThis.document = document;
// Node's FormData cannot read a form; the modal only asks it for named values.
globalThis.FormData = class { constructor(form) { this.form = form; } get(name) { return this.form.elements[name].value; } };

const { state } = await import("../src/core/state.mjs");
const { createStorage } = await import("../src/core/storage.mjs");
const { initTheme, themeChoice } = await import("../src/core/theme.mjs");
const { syncThemeWithAccount } = await import("../src/data/preferences.mjs");
const { wireAuthModal } = await import("../src/components/auth-modal.mjs");

// The submit listener the modal attached, to be run and waited for.
const submitProfile = [];
profileForm.addEventListener = (type, listener) => { if (type === "submit") submitProfile.push(listener); };
wireAuthModal();

const ACCOUNT = { themeMode: "light", lightPalette: "parchment", darkPalette: "night", locale: "ru" };

test("saving the profile keeps the account's settings, and the next sync leaves the palette alone", async () => {
  // This browser chose another palette than the account did.
  const backend = new Map([["gata-league-palette", JSON.stringify({ mode: "dark", light: "grass", dark: "embers" })]]);
  const store = createStorage({ getItem: (key) => backend.get(key) ?? null, setItem: (key, value) => backend.set(key, String(value)), removeItem: (key) => backend.delete(key) });
  initTheme({ root: document.documentElement, select: null, store, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  state.auth.currentUser = { id: "u1", login: "coach", telegram: "@coach", preferences: ACCOUNT };
  profileForm.elements.login.value = "renamed";
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "renamed", telegram: "@coach", isAdmin: false } });

  assert.equal(submitProfile.length, 1);
  await submitProfile[0]({ preventDefault() {} });
  assert.equal(authError.textContent ?? "", "");
  assert.equal(state.auth.currentUser.login, "renamed");
  assert.deepEqual(state.auth.currentUser.preferences, ACCOUNT);
  assert.equal(authButton.textContent, "renamed", "the header follows the new login");

  await syncThemeWithAccount();
  assert.deepEqual(api.calls.map(({ key }) => key), ["PATCH /api/auth/profile"], "no PATCH /api/auth/preferences went out");
  assert.deepEqual(themeChoice(), { mode: "light", light: "parchment", dark: "night" }, "the account's palette repaints, not the other way round");
  api.assertAnswered();
});
