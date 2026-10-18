/**
 * The application's one piece of mutable state.
 *
 * Screens read and write this directly (no store, no subscriptions yet — see
 * task 6.3 of the refactor plan). Moving it here, unchanged, is what lets
 * src/screens/*.mjs and src/components/*.mjs import the same object app.js
 * uses instead of each screen closing over an app.js-local variable, which
 * would make every screen module and app.js import each other.
 */

export const state = {
  data: null,
  locale: "en",
  auth: {
    currentUser: null,
  },
  myTeams: {
    items: [],
    loaded: false,
    loading: false,
    error: "",
  },
  // The id of one of `myTeams.items`, chosen by data/active-team.mjs; null for a guest or a coach with no team.
  activeTeamId: null,
  games: { items: [], currentItems: [], loaded: false, loading: false, error: "" },
  savedRosterUi: {
    expandedPlayers: new Set(),
  },
  admin: {
    users: [],
    loaded: false,
    loading: false,
    error: "",
    editingTeams: new Map(),
  },
  season: {
    data: null,
    loaded: false,
    loading: false,
    error: "",
  },
};
