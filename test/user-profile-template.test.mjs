import assert from "node:assert/strict";
import test from "node:test";

globalThis.document = {
  querySelector: () => null,
};

const [{ renderUserProfilePage }, { state }] = await Promise.all([
  import("../src/screens/administration/user.mjs"),
  import("../src/core/state.mjs"),
]);

const target = {
  id: "user-2",
  login: "Coach",
  telegram: "@coach",
  isAdmin: false,
  savedTeamCount: 0,
};

function renderAs(currentUser) {
  state.auth.currentUser = currentUser;
  state.data = { teams: [] };
  return renderUserProfilePage({ user: target, teams: [] }, {
    subtitle: "Profile",
    backFallback: "#/season",
  });
}

test("an admin sees password reset on another user's shared profile", () => {
  const html = renderAs({ id: "admin-1", login: "Admin", isAdmin: true });

  assert.match(html, /data-admin-user-management/);
  assert.match(html, /data-admin-reset-password/);
});

test("a user never sees admin controls on the shared profile", () => {
  const html = renderAs({ id: "user-2", login: "Coach", isAdmin: false });

  assert.doesNotMatch(html, /data-admin-user-management/);
  assert.doesNotMatch(html, /data-admin-reset-password/);
});

test("an admin does not see password reset on their own profile", () => {
  const html = renderAs({ id: "user-2", login: "Coach", isAdmin: true });

  assert.match(html, /data-admin-user-management/);
  assert.doesNotMatch(html, /data-admin-reset-password/);
});
