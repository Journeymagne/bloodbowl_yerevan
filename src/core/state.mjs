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
  query: "",
  teamFilters: {
    type: "all",
    league: "all",
    skill: "all",
    tag: "all",
    price: "all",
  },
  starFilters: {
    tag: "all",
  },
  inducementFilters: {
    tag: "all",
  },
  skillFilters: {
    category: "all",
    application: "all",
  },
  skillTableRoller: {
    group: "Agility",
    result: "",
    roll: null,
  },
  auth: {
    mode: "login",
    currentUser: null,
  },
  myTeams: {
    items: [],
    loaded: false,
    loading: false,
    error: "",
  },
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
  builder: {
    editingTeamId: "",
    teamSlug: "",
    teamName: "",
    selectedLeague: "",
    favouredChoice: "",
    logoData: "",
    players: [],
    roster: {},
    teamRerolls: 0,
    startingRerolls: 0,
    bribes: 0,
    dedicatedFans: 0,
    assistantCoaches: 0,
    cheerleaders: 0,
    apothecary: 0,
    mortuaryAssistant: 0,
    plagueDoctor: 0,
    purchasedStaff: {},
    treasury: 0,
    coachesSafe: 0,
  },
};
