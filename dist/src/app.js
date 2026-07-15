const state = {
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
  builder: {
    editingTeamId: "",
    teamSlug: "",
    teamName: "",
    selectedLeague: "",
    logoData: "",
    players: [],
    roster: {},
    playerEdits: {},
    teamRerolls: 0,
    startingRerolls: 0,
    bribes: 0,
    dedicatedFans: 0,
    assistantCoaches: 0,
    cheerleaders: 0,
    purchasedStaff: {},
    treasury: 0,
    coachesSafe: 0,
  },
};

const view = document.querySelector("#app-view");
const searchInput = document.querySelector("#global-search");
const generatedAt = document.querySelector("#generated-at");
const langToggle = document.querySelector("#lang-toggle");
const themeSelect = document.querySelector("#theme-select");
const navToggle = document.querySelector("#nav-toggle");
const navOverlay = document.querySelector("#nav-overlay");
const navList = document.querySelector(".nav-list");
const authButton = document.querySelector("#auth-button");
const authModal = document.querySelector("#auth-modal");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authSubmit = document.querySelector("#auth-submit");
const authSwitch = document.querySelector("#auth-switch");
const authError = document.querySelector("#auth-error");
const authAccount = document.querySelector("#auth-account");
const authAccountText = document.querySelector("#auth-account-text");
const authProfileForm = document.querySelector("#auth-profile-form");
const authLogout = document.querySelector("#auth-logout");
const authTelegramField = document.querySelector("[data-auth-telegram]");

const authTokenKey = "gata-league-auth-token";
const themeStorageKey = "gata-league-theme";
const localeStorageKey = "gata-league-locale";
const supportedLocales = new Set(["en", "ru"]);
const dataCache = new Map();
let translations = { en: {}, ru: {} };
let activeDict = translations.en;
const themeIds = new Set([
  "dark-gata",
  "dark-dugout",
  "dark-warpstone",
  "light-parchment",
  "light-sideline",
  "light-altdorf",
]);
const savedRosterAutosaves = new Map();
const autosaveDelayMs = 450;

const sectionRoutes = new Map([
  ["teams", "teams"],
  ["skills", "skills"],
  ["traits", "traits"],
  ["rules", "rules"],
  ["cheatsheets", "cheatsheets"],
  ["inducements", "inducements"],
  ["star-players", "star-players"],
  ["pages", "pages"],
]);
const staticRoutes = new Set(["builder", "legal", "my-teams"]);

function normalizeTheme(theme) {
  return themeIds.has(theme) ? theme : "dark-gata";
}

function storedTheme() {
  try {
    return normalizeTheme(localStorage.getItem(themeStorageKey));
  } catch (_error) {
    return "dark-gata";
  }
}

function applyTheme(theme, persist = true) {
  const normalized = normalizeTheme(theme);
  document.documentElement.dataset.theme = normalized;
  if (themeSelect) themeSelect.value = normalized;
  if (!persist) return;
  try {
    localStorage.setItem(themeStorageKey, normalized);
  } catch (_error) {
    // Theme persistence is optional; the visual switch still works for this session.
  }
}

function detectDefaultLocale() {
  const languages = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || "en"];
  return languages.some((lang) => lang.toLowerCase().startsWith("ru")) ? "ru" : "en";
}

function storedLocale() {
  try {
    const saved = localStorage.getItem(localeStorageKey);
    return supportedLocales.has(saved) ? saved : detectDefaultLocale();
  } catch (_error) {
    return detectDefaultLocale();
  }
}

async function loadTranslations() {
  const [en, ru] = await Promise.all([
    fetch("src/i18n/en.json", { cache: "no-store" }).then((response) => response.json()),
    fetch("src/i18n/ru.json", { cache: "no-store" }).then((response) => response.json()),
  ]);
  translations = { en, ru };
}

function t(key) {
  return activeDict[key] ?? translations.en[key] ?? key;
}

function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.setAttribute("title", t(element.dataset.i18nTitle));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
}

async function loadLocaleData(locale) {
  if (dataCache.has(locale)) return dataCache.get(locale);
  let data;
  if (window.__REFERENCE_DATA__ && window.__REFERENCE_DATA__[locale]) {
    data = window.__REFERENCE_DATA__[locale];
  } else {
    const response = await fetch(`public/data.${locale}.json`, { cache: "no-store" });
    data = await response.json();
  }
  dataCache.set(locale, data);
  return data;
}

function applyLocaleChrome() {
  document.documentElement.lang = state.locale;
  activeDict = translations[state.locale];
  applyStaticI18n();
  updateAuthButton();
  setAuthMode(state.auth.mode);
  if (langToggle) {
    langToggle.textContent = state.locale === "en" ? "RU" : "EN";
    langToggle.title = t("lang.toggleTitle");
  }
  if (generatedAt && state.data) {
    const dateLocale = state.locale === "ru" ? "ru-RU" : "en-GB";
    generatedAt.textContent = `${t("footer.updated")} ${new Date(state.data.generatedAt).toLocaleDateString(dateLocale)}`;
  }
}

async function switchLocale(nextLocale) {
  if (!supportedLocales.has(nextLocale) || nextLocale === state.locale) return;
  const previousLocale = state.locale;
  state.locale = nextLocale;
  try {
    localStorage.setItem(localeStorageKey, nextLocale);
  } catch (_error) {
    // Locale persistence is optional; the switch still works for this session.
  }
  try {
    state.data = await loadLocaleData(nextLocale);
  } catch (error) {
    console.error(error);
    state.locale = previousLocale;
    try {
      localStorage.setItem(localeStorageKey, previousLocale);
    } catch (_error) {
      // Locale persistence is optional; the switch still works for this session.
    }
    applyLocaleChrome();
    return;
  }
  applyLocaleChrome();
  renderRoute();
}

const builderStaffCosts = {
  teamRerolls: 120,
  startingRerolls: 60,
  bribes: 50,
  dedicatedFans: 10,
  assistantCoaches: 10,
  cheerleaders: 10,
};

const builderStaffMaximums = {
  teamRerolls: 8,
  startingRerolls: 8,
  bribes: 3,
  dedicatedFans: 6,
  assistantCoaches: 6,
  cheerleaders: 6,
};

const rosterSlotCount = 14;

const advancementRanks = [
  { rank: "Experienced", costs: { random: 3, primary: 6, secondary: 10, stat: 14 } },
  { rank: "Veteran", costs: { random: 4, primary: 8, secondary: 12, stat: 16 } },
  { rank: "Emerging Star", costs: { random: 6, primary: 12, secondary: 16, stat: 20 } },
  { rank: "Star", costs: { random: 8, primary: 16, secondary: 20, stat: 24 } },
  { rank: "Superstar", costs: { random: 10, primary: 20, secondary: 24, stat: 28 } },
  { rank: "Legend", costs: { random: 15, primary: 30, secondary: 34, stat: 38 } },
];

const advancementTypeLabels = {
  random: "Random",
  primary: "Primary",
  secondary: "Secondary",
  stat: "Stat",
};

const advancementStatCosts = {
  ar: 10,
  pa: 20,
  ma: 30,
  ag: 40,
  st: 50,
};

const eliteSkillCombos = [
  ["Claws", "Mighty Blow"],
  ["Guard", "Defensive"],
  ["Wrestle", "Evasive"],
];

const quickPreviews = new Map([
  ["1. League Basics", "League format, event tone, dice/model expectations and core conduct for Gata league games."],
  ["2. Team Creation", "Starting roster rules, team budget, model requirements and how new teams enter the league."],
  ["3. Team Management", "Team transfers, treasury, player contracts, injuries and post-game roster management."],
  ["4. Match Procedures", "Season structure, weekly games, match organization and league-point handling."],
  ["5. Patch Notes", "Current Gata League 2 changes to teams, skills, traits and special rulings."],
  ["All Gata Changes", "Full list of Gata gameplay, team, skill, Favoured Of, and Coach's Safe changes."],
  ["Skill Table", "Skill categories, row numbers, and the random skill roller."],
  ["Kick-off Table", "2D6 kick-off events used in Gata league games."],
  ["Player Advancement", "SPP costs, value increases, elite combinations, and characteristic rolls."],
  ["Special Rules", "Team special rules that change gameplay, advancement, TV, or inducement access."],
  ["Prayers to Nuffle", "D16 prayer table with temporary match effects."],
  ["Weather", "Spring and Summer weather tables with 2D6 and D6 results."],
  ["Casualties", "D16 casualty table with injury outcomes."],
  ["Leagues", "League access cards with eligible teams and available star players."],
  ["Reference Sources", "External references for base Blood Bowl 2025 wording and the site's legal/source notes."],
]);

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortText(value = "", length = 180) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}...` : clean;
}

function normalize(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function setAuthError(message = "") {
  if (!authError) return;
  authError.hidden = !message;
  authError.textContent = message;
}

function authToken() {
  return localStorage.getItem(authTokenKey) || "";
}

function setAuthToken(token = "") {
  if (token) {
    localStorage.setItem(authTokenKey, token);
  } else {
    localStorage.removeItem(authTokenKey);
  }
}

async function authRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = authToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Authorization request failed.");
  }
  return payload;
}

async function apiRequest(path, options = {}) {
  return authRequest(path, options);
}

async function loadAuthSession() {
  if (!authToken()) {
    state.auth.currentUser = null;
    updateAuthButton();
    return;
  }

  try {
    const payload = await authRequest("/api/auth/me");
    state.auth.currentUser = payload.user;
  } catch {
    setAuthToken("");
    state.auth.currentUser = null;
  }
  updateAuthButton();
}

function updateAuthButton() {
  if (!authButton) return;
  if (state.auth.currentUser) {
    authButton.textContent = state.auth.currentUser.login;
    authButton.title = `${t("auth.signedInAs")} ${state.auth.currentUser.login}`;
  } else {
    authButton.textContent = t("auth.login");
    authButton.title = t("auth.loginOrCreate");
  }
}

function setAuthMode(mode) {
  state.auth.mode = mode;
  setAuthError("");
  const isAccount = mode === "account" && state.auth.currentUser;
  const isRegister = mode === "register";

  if (authTitle) {
    authTitle.textContent = isAccount ? t("auth.account") : isRegister ? t("auth.register") : t("auth.login");
  }
  if (authForm) {
    authForm.hidden = isAccount;
    authForm.reset();
  }
  if (authAccount) {
    authAccount.hidden = !isAccount;
  }
  if (authAccountText && state.auth.currentUser) {
    authAccountText.textContent = `${state.auth.currentUser.login} · ${state.auth.currentUser.telegram}`;
  }
  if (authProfileForm && state.auth.currentUser) {
    authProfileForm.elements.login.value = state.auth.currentUser.login;
    authProfileForm.elements.telegram.value = state.auth.currentUser.telegram;
    authProfileForm.elements.password.value = "";
  }
  if (authTelegramField) {
    const telegramInput = authTelegramField.querySelector("input");
    authTelegramField.hidden = !isRegister;
    telegramInput?.toggleAttribute("required", isRegister);
    telegramInput?.toggleAttribute("disabled", !isRegister);
    if (!isRegister && telegramInput) {
      telegramInput.value = "";
    }
  }
  if (authSubmit) {
    authSubmit.textContent = isRegister ? t("auth.register") : t("auth.login");
  }
  if (authSwitch) {
    authSwitch.textContent = isRegister ? t("auth.haveAccount") : t("auth.createAccount");
  }
}

function openAuthModal(mode = "login") {
  if (!authModal) return;
  authModal.hidden = false;
  document.body.classList.add("auth-open");
  setAuthMode(state.auth.currentUser && mode !== "register" ? "account" : mode);
  const form = state.auth.mode === "account" ? authProfileForm : authForm;
  form?.querySelector("input")?.focus();
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.hidden = true;
  document.body.classList.remove("auth-open");
  setAuthError("");
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const data = new FormData(authForm);
  const login = String(data.get("login") ?? "").trim();
  const password = String(data.get("password") ?? "");
  const telegram = String(data.get("telegram") ?? "").trim();

  if (login.length < 3) {
    setAuthError("Login must be at least 3 characters.");
    return;
  }
  if (password.length < 4) {
    setAuthError("Password must be at least 4 characters.");
    return;
  }

  try {
    const payload = state.auth.mode === "register"
      ? await authRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ login, password, telegram }),
      })
      : await authRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ login, password }),
      });

    setAuthToken(payload.token);
    state.auth.currentUser = payload.user;
    updateAuthButton();
    closeAuthModal();
  } catch (error) {
    setAuthError(error.message);
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  const data = new FormData(authProfileForm);
  const login = String(data.get("login") ?? "").trim();
  const telegram = String(data.get("telegram") ?? "").trim();
  const password = String(data.get("password") ?? "");

  if (login.length < 3) {
    setAuthError("Login must be at least 3 characters.");
    return;
  }
  if (!telegram) {
    setAuthError("Telegram contact is required.");
    return;
  }
  if (password && password.length < 4) {
    setAuthError("Password must be at least 4 characters.");
    return;
  }

  try {
    const payload = await authRequest("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ login, telegram, password }),
    });
    state.auth.currentUser = payload.user;
    updateAuthButton();
    setAuthMode("account");
    setAuthError("");
  } catch (error) {
    setAuthError(error.message);
  }
}

async function logoutAuth() {
  try {
    await authRequest("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Local logout should still happen if the API is unavailable.
  }
  setAuthToken("");
  state.auth.currentUser = null;
  updateAuthButton();
  closeAuthModal();
}

function pageUrl(page) {
  return `#/${page.slug}`;
}

function isSkillTablePage(page) {
  return page.title === "Skill Table";
}

function isMobileCardTablePage(page) {
  return ["Kick-off Table", "Prayers to Nuffle"].includes(page.title);
}

function isLeaguesPage(page) {
  return page.title === "Leagues";
}

function pageForSkillTableEntry(title) {
  return state.data.skills.find((page) => page.title === title)
    ?? state.data.traits.find((page) => page.title === title)
    ?? state.data.pages.find((page) => page.title === title)
    ?? null;
}

function listUrlForRoute(route) {
  return route === "home" ? "#/" : `#/${route}`;
}

function setActiveNav(route) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === route);
  });
}

function setViewSection(section) {
  view.dataset.section = section;
}

function setNavOpen(isOpen) {
  document.body.classList.toggle("nav-open", isOpen);
  navToggle?.setAttribute("aria-expanded", String(isOpen));
  navToggle?.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

function navRouteForPage(page) {
  if (page.kind === "team") return "teams";
  if (page.kind === "skill") return "skills";
  if (page.kind === "trait") return "traits";
  if (page.kind === "rules") return "rules";
  if (page.kind === "cheatsheet") return "cheatsheets";
  if (page.kind === "inducement") return "inducements";
  if (page.kind === "starPlayer") return "star-players";
  return "pages";
}

function routeSection(route) {
  if (!route || route === "home") return "home";
  if (sectionRoutes.has(route)) return route;
  if (staticRoutes.has(route)) return route;
  const page = findPageBySlug(route);
  return page ? navRouteForPage(page) : "home";
}

function findPageBySlug(slug) {
  return state.data.pages.find((page) => page.slug === slug)
    ?? state.data.pages.find((page) => page.slug.endsWith(`/${slug}`))
    ?? null;
}

function matchesQuery(page) {
  if (!state.query) return true;
  const haystack = normalize([
    page.title,
    page.sectionLabel,
    page.text,
    ...(page.tags ?? []),
  ].join(" "));
  return haystack.includes(normalize(state.query));
}

function splitList(value = "") {
  return String(value)
    .split(/,|;|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function costToNumber(value = "") {
  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function countToNumber(value = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function rowCost(row) {
  return row.cost ?? row.price ?? "";
}

const skillAccessMap = {
  A: "Agility",
  D: "Devious",
  G: "General",
  M: "Mutation",
  P: "Passing",
  S: "Strength",
};

function optionLabel(value) {
  return value === "-" ? "None" : value;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
}

const leagueAccessNames = [
  "Badlands Brawl",
  "Chaos Clash",
  "Elven Kingdoms League",
  "Halfling Thimble Cup",
  "Lustrian Superleague",
  "Old World Classic",
  "Sylvanian Spotlight",
  "Underworld Challenge",
  "Woodland League",
  "Worlds Edge Superleague",
];

const specialRuleNames = [
  "Brawlin' Brutes",
  "Bribery and Corruption",
  "Favoured of...",
  "Low Cost Linemen",
  "Masters of Undeath",
  "Passing Virtuosos",
  "Swarming",
  "Team Captain",
];

const sppCounterDefinitions = [
  ["touchdowns", "TD"],
  ["casualties", "CAS"],
  ["knockouts", "KO"],
  ["completions", "COMP"],
  ["catches", "CATCH"],
  ["interceptions", "INT"],
  ["mvps", "MVP"],
];

function rowsForTeam(team) {
  return team.team?.roster ?? [];
}

function emptyBuilderState(team = null) {
  return {
    editingTeamId: "",
    teamSlug: team?.slug ?? "",
    teamName: team?.title ?? "",
    logoData: "",
    players: [],
    roster: {},
    playerEdits: {},
    teamRerolls: 0,
    startingRerolls: 0,
    bribes: 0,
    dedicatedFans: 0,
    assistantCoaches: 0,
    cheerleaders: 0,
    purchasedStaff: {},
    treasury: 0,
    coachesSafe: 0,
  };
}

function resetBuilderForTeam(team) {
  state.builder = emptyBuilderState(team);
}

function builderPayload(team) {
  return {
    editingTeamId: state.builder.editingTeamId,
    teamSlug: team.slug,
    teamName: state.builder.teamName || team.title,
    selectedLeague: state.builder.selectedLeague || "",
    logoData: state.builder.logoData || "",
    players: state.builder.players,
    roster: state.builder.roster,
    playerEdits: state.builder.playerEdits,
    teamRerolls: state.builder.teamRerolls,
    startingRerolls: state.builder.startingRerolls,
    bribes: state.builder.bribes,
    dedicatedFans: state.builder.dedicatedFans,
    assistantCoaches: state.builder.assistantCoaches,
    cheerleaders: state.builder.cheerleaders,
    purchasedStaff: state.builder.purchasedStaff ?? {},
    treasury: state.builder.treasury,
    coachesSafe: state.builder.coachesSafe,
  };
}

function normalizeSavedRoster(savedTeam) {
  const roster = savedTeam.roster ?? {};
  const draft = {
    ...emptyBuilderState(),
    editingTeamId: savedTeam.id,
    teamSlug: savedTeam.baseTeamSlug || roster.teamSlug || "",
    teamName: savedTeam.name || roster.teamName || "",
    selectedLeague: String(roster.selectedLeague ?? ""),
    logoData: savedTeam.logoData || roster.logoData || "",
    players: Array.isArray(roster.players) ? roster.players : [],
    slots: Array.isArray(roster.slots) ? roster.slots : undefined,
    roster: roster.roster ?? {},
    playerEdits: roster.playerEdits ?? {},
    teamRerolls: countToNumber(roster.teamRerolls ?? 0),
    startingRerolls: countToNumber(roster.startingRerolls ?? roster.rerolls ?? 0),
    bribes: countToNumber(roster.bribes ?? 0),
    dedicatedFans: countToNumber(roster.dedicatedFans ?? 0),
    assistantCoaches: countToNumber(roster.assistantCoaches ?? 0),
    cheerleaders: countToNumber(roster.cheerleaders ?? 0),
    purchasedStaff: normalizePurchasedStaff(roster),
    treasury: countToNumber(roster.treasury ?? 0),
    coachesSafe: countToNumber(roster.coachesSafe ?? 0),
  };
  savedTeam.roster = draft;
  savedTeam.name = draft.teamName;
  savedTeam.logoData = draft.logoData;
  savedTeam.baseTeamSlug = draft.teamSlug;
  return draft;
}

function updateSavedRosterFields(savedTeam, draft) {
  savedTeam.name = draft.teamName;
  savedTeam.logoData = draft.logoData;
  savedTeam.baseTeamSlug = draft.teamSlug;
  savedTeam.roster = draft;
}

function makeRosterPlayerId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseAccessCodes(values = []) {
  const source = Array.isArray(values) ? values : [values];
  return [...new Set(source
    .flatMap((value) => String(value).split(/\s+/))
    .flatMap((code) => /^[ADGMPS]+$/.test(code) ? code.split("") : [code])
    .filter((code) => code && code !== "-"))];
}

function categoriesForAccess(values = []) {
  return parseAccessCodes(values).map((code) => skillAccessMap[code]).filter(Boolean);
}

function normalizePurchasedStaff(roster = {}) {
  const purchased = roster.purchasedStaff ?? {};
  return {
    teamRerolls: countToNumber(purchased.teamRerolls ?? roster.teamRerolls ?? 0),
    startingRerolls: countToNumber(purchased.startingRerolls ?? 0),
    bribes: countToNumber(purchased.bribes ?? 0),
    assistantCoaches: countToNumber(purchased.assistantCoaches ?? 0),
    cheerleaders: countToNumber(purchased.cheerleaders ?? 0),
  };
}

function makeRosterPlayer(row, rowIndex, copyIndex = 0, options = {}) {
  return {
    id: makeRosterPlayerId(),
    rowIndex,
    name: `${row.position} ${copyIndex + 1}`,
    statMods: {},
    extraSkills: [],
    skipNextGame: false,
    niglingInjury: false,
    spp: {},
    advancements: [],
    purchased: Boolean(options.purchased),
  };
}

function normalizeExtraSkill(skill) {
  if (!skill) return null;
  if (typeof skill === "string") return { name: skill, access: "primary" };
  if (typeof skill === "object" && skill.name) {
    return {
      name: String(skill.name),
      access: skill.access === "secondary" ? "secondary" : "primary",
    };
  }
  return null;
}

function normalizePlayerExtraSkills(row, skills = []) {
  const seen = new Set(row.skills ?? []);
  return skills
    .map(normalizeExtraSkill)
    .filter(Boolean)
    .map((skill) => ({ ...skill, name: String(skill.name).trim() }))
    .filter((skill) => {
      if (!skill.name || seen.has(skill.name)) return false;
      seen.add(skill.name);
      return true;
    });
}

function normalizeRosterPlayer(player, rows, fallbackIndex = 0) {
  if (!player || typeof player !== "object") return null;
  const rowIndex = Number(player.rowIndex);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) return null;
  const row = rows[rowIndex];
  return {
    id: String(player.id || makeRosterPlayerId()),
    rowIndex,
    name: String(player.name || `${row.position} ${fallbackIndex + 1}`),
    statMods: { ...(player.statMods ?? {}) },
    extraSkills: normalizePlayerExtraSkills(row, player.extraSkills ?? []),
    skipNextGame: Boolean(player.skipNextGame),
    niglingInjury: Boolean(player.niglingInjury),
    spp: normalizeSppCounters(player.spp),
    advancements: normalizePlayerAdvancements(player.advancements),
    purchased: Boolean(player.purchased),
  };
}

function normalizeSppCounters(spp = {}) {
  return Object.fromEntries(sppCounterDefinitions.map(([key]) => [key, Math.max(0, countToNumber(spp?.[key]))]));
}

function normalizePlayerAdvancements(advancements = []) {
  const source = Array.isArray(advancements) ? advancements : [];
  return source
    .map((advancement) => {
      const type = typeof advancement === "string" ? advancement : advancement?.type;
      return Object.hasOwn(advancementTypeLabels, type) ? { type } : null;
    })
    .filter(Boolean)
    .slice(0, advancementRanks.length);
}

function playersFromLegacyRoster(team, draft) {
  const rows = rowsForTeam(team);
  if (Array.isArray(draft.players) && draft.players.length) {
    return draft.players.map((player, index) => normalizeRosterPlayer(player, rows, index)).filter(Boolean);
  }

  if (Array.isArray(draft.slots) && draft.slots.length) {
    return draft.slots.map((slot, index) => normalizeRosterPlayer(slot, rows, index)).filter(Boolean);
  }

  const players = [];
  rows.forEach((row, rowIndex) => {
    const count = Math.max(0, Number(draft.roster?.[rowIndex] ?? 0));
    for (let copyIndex = 0; copyIndex < count; copyIndex += 1) {
      const edit = draft.playerEdits?.[playerKey(rowIndex, copyIndex)] ?? {};
      players.push(normalizeRosterPlayer({
        id: makeRosterPlayerId(),
        rowIndex,
        name: edit.name || `${row.position} ${copyIndex + 1}`,
        statMods: edit.statMods ?? {},
        extraSkills: edit.extraSkills ?? [],
        skipNextGame: Boolean(edit.skipNextGame),
        niglingInjury: Boolean(edit.niglingInjury),
        spp: normalizeSppCounters(edit.spp),
        advancements: normalizePlayerAdvancements(edit.advancements),
      }, rows, copyIndex));
    }
  });
  return players.filter(Boolean);
}

function ensureDraftPlayers(team, draft) {
  draft.players = playersFromLegacyRoster(team, draft);
  delete draft.slots;
  syncRosterCountsFromPlayers(draft);
  return draft.players;
}

function syncRosterCountsFromPlayers(draft) {
  const counts = {};
  (draft.players ?? []).forEach((player) => {
    counts[player.rowIndex] = (counts[player.rowIndex] ?? 0) + 1;
  });
  draft.roster = counts;
}

function rowCountInPlayers(draft, rowIndex) {
  return (draft.players ?? []).filter((player) => player.rowIndex === rowIndex).length;
}

function canAddRowToDraft(row, rowIndex, draft, enforceMaximum = true) {
  if (!enforceMaximum) return true;
  return rowCountInPlayers(draft, rowIndex) < rosterMax(row.qty);
}

function rosterPlayerView(team, player, index = 0) {
  const row = rowsForTeam(team)[player.rowIndex];
  if (!row) return null;
  return {
    ...player,
    key: player.id,
    index,
    row,
    rowIndex: player.rowIndex,
    copyIndex: index,
    name: player.name || `${row.position} ${index + 1}`,
    statMods: player.statMods ?? {},
    extraSkills: normalizePlayerExtraSkills(row, player.extraSkills ?? []),
    skipNextGame: Boolean(player.skipNextGame),
    niglingInjury: Boolean(player.niglingInjury),
    spp: normalizeSppCounters(player.spp),
    advancements: normalizePlayerAdvancements(player.advancements),
  };
}

function baseSkillsForPlayer(row) {
  return (row.skills ?? []).map((name) => ({ name, access: "base" }));
}

function skillNamesForPlayer(row, player) {
  return [...baseSkillsForPlayer(row), ...normalizePlayerExtraSkills(row, player.extraSkills ?? [])].map((skill) => skill.name);
}

function availableSkillOptionsForPlayer(row, player) {
  const base = new Set(skillNamesForPlayer(row, player));
  const primaryCategories = categoriesForAccess(row.primary ?? []);
  const secondaryCategories = categoriesForAccess(row.secondary ?? []);
  const options = [];

  (state.data.skillGroups ?? []).forEach((group) => {
    const access = primaryCategories.includes(group.category)
      ? "primary"
      : secondaryCategories.includes(group.category)
        ? "secondary"
        : "";
    if (!access) return;
    (group.skills ?? []).forEach((name) => {
      if (!base.has(name)) options.push({ name, access, category: group.category });
    });
  });

  return options.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

function statModCost(stat, mod = 0) {
  return (advancementStatCosts[stat] ?? 0) * Math.max(0, mod);
}

function skillModCost(skill) {
  return skill?.access === "secondary" ? 40 : 20;
}

function eliteComboCost(row, player) {
  const baseSkills = new Set(row.skills ?? []);
  const advancedSkills = new Set(normalizePlayerExtraSkills(row, player.extraSkills ?? []).map((skill) => skill.name));
  const allSkills = new Set([...baseSkills, ...advancedSkills]);

  return eliteSkillCombos.reduce((sum, combo) => {
    const hasCombo = combo.every((skill) => allSkills.has(skill));
    const comboAdvanced = combo.some((skill) => advancedSkills.has(skill));
    return hasCombo && comboAdvanced ? sum + 15 : sum;
  }, 0);
}

function playerAdjustmentCost(player) {
  const skillCost = normalizePlayerExtraSkills(player.row, player.extraSkills ?? []).reduce((sum, skill) => sum + skillModCost(skill), 0);
  const statCost = Object.entries(player.statMods ?? {}).reduce((sum, [stat, mod]) => sum + statModCost(stat, Number(mod) || 0), 0);
  return skillCost + statCost + eliteComboCost(player.row, player);
}

function playerCurrentCost(row, player, includeAdjustments = true) {
  return costToNumber(rowCost(row)) + (includeAdjustments ? playerAdjustmentCost(player) : 0);
}

function statValueForDisplayByStat(stat, base, mod = 0) {
  if (base === "-" || base === "") return base || "-";
  const match = String(base).match(/^(\d+)(\+)?$/);
  if (!match) return base;
  const raw = Number(match[1]);
  const next = ["ag", "pa"].includes(stat) ? raw - mod : raw + mod;
  return `${Math.max(1, next)}${match[2] ?? ""}`;
}

function emptyRosterSlots() {
  return Array.from({ length: rosterSlotCount }, () => null);
}

function normalizeSlot(slot, rows) {
  if (!slot || typeof slot !== "object") return null;
  const rowIndex = Number(slot.rowIndex);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) return null;
  const row = rows[rowIndex];
  return {
    rowIndex,
    name: String(slot.name || row.position),
    statMods: { ...(slot.statMods ?? {}) },
    extraSkills: Array.isArray(slot.extraSkills) ? [...slot.extraSkills] : [],
    skipNextGame: Boolean(slot.skipNextGame),
  };
}

function ensureRosterSlots(team, draft) {
  const rows = rowsForTeam(team);
  if (Array.isArray(draft.slots)) {
    draft.slots = emptyRosterSlots().map((_empty, index) => normalizeSlot(draft.slots[index], rows));
    return draft.slots;
  }

  const slots = [];
  rows.forEach((row, rowIndex) => {
    const count = Math.max(0, Number(draft.roster?.[rowIndex] ?? 0));
    for (let copyIndex = 0; copyIndex < count && slots.length < rosterSlotCount; copyIndex += 1) {
      const edit = draft.playerEdits?.[playerKey(rowIndex, copyIndex)] ?? {};
      slots.push({
        rowIndex,
        name: String(edit.name || `${row.position} ${copyIndex + 1}`),
        statMods: { ...(edit.statMods ?? {}) },
        extraSkills: Array.isArray(edit.extraSkills) ? [...edit.extraSkills] : [],
        skipNextGame: Boolean(edit.skipNextGame),
      });
    }
  });

  draft.slots = emptyRosterSlots().map((_empty, index) => normalizeSlot(slots[index], rows));
  return draft.slots;
}

function syncRosterCountsFromSlots(draft) {
  const counts = {};
  (draft.slots ?? []).forEach((slot) => {
    if (!slot) return;
    counts[slot.rowIndex] = (counts[slot.rowIndex] ?? 0) + 1;
  });
  draft.roster = counts;
}

function allRosterRows() {
  return state.data.teams.flatMap(rowsForTeam);
}

function allRowSkills() {
  return uniqueSorted(allRosterRows().flatMap((row) => row.skills ?? []));
}

function allRowTags() {
  return uniqueSorted(allRosterRows().flatMap((row) => row.tags ?? []));
}

function allRowCosts() {
  return uniqueSorted(allRosterRows().map(rowCost).filter(Boolean));
}

function isTeamVisible(team) {
  if (!matchesQuery(team)) return false;
  const { type, league, skill, tag, price } = state.teamFilters;
  const roster = rowsForTeam(team);
  if (type === "core" && team.team?.experimental) return false;
  if (type === "experimental" && !team.team?.experimental) return false;
  if (league !== "all" && team.team?.meta?.league !== league) return false;
  if (skill !== "all" && !roster.some((row) => (row.skills ?? []).includes(skill))) return false;
  if (tag !== "all" && !roster.some((row) => (row.tags ?? []).includes(tag))) return false;
  if (price !== "all" && !roster.some((row) => rowCost(row) === price)) return false;
  return true;
}

function isStarVisible(page) {
  if (!matchesQuery(page)) return false;
  return state.starFilters.tag === "all" || (page.tags ?? []).includes(state.starFilters.tag);
}

function isInducementVisible(page) {
  if (!matchesQuery(page)) return false;
  return state.inducementFilters.tag === "all" || (page.tags ?? []).includes(state.inducementFilters.tag);
}

function skillGroupMatches(page, category) {
  if ((page.tags ?? []).includes(category)) return true;
  return (state.data.skillGroups ?? [])
    .some((group) => group.category === category && (group.skills ?? []).includes(page.title));
}

function isSkillVisible(page) {
  if (!matchesQuery(page)) return false;
  const tags = page.tags ?? [];
  const { category, application } = state.skillFilters;
  if (category !== "all" && !skillGroupMatches(page, category)) return false;
  if (application !== "all" && !tags.includes(application)) return false;
  return true;
}

function badgeList(items, limit = 4) {
  const visible = (items ?? []).slice(0, limit);
  const extra = (items ?? []).length - visible.length;
  return [
    ...visible.map((item) => `<span class="badge">${escapeHtml(item)}</span>`),
    extra > 0 ? `<span class="badge">+${extra}</span>` : "",
  ].join("");
}

function renderHeader(title, description, actions = "") {
  return `
    <header class="page-head">
      <div>
        <h1>${escapeHtml(title)}</h1>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>
      ${actions ? `<div class="toolbar">${actions}</div>` : ""}
    </header>
  `;
}

function renderHome() {
  setActiveNav("home");
  setViewSection("home");
  const quickPages = [
    ...["1. League Basics", "2. Team Creation", "3. Team Management", "4. Match Procedures", "5. Patch Notes"]
      .map((title) => state.data.rules.find((page) => page.title === title))
      .filter(Boolean),
    state.data.otherPages?.find((page) => page.title === "Reference Sources"),
  ].filter(Boolean);

  view.innerHTML = `
    <section class="league-hero">
      <div class="league-hero-copy">
        <h1>${t("home.heroTitle")}</h1>
        <p>${t("home.heroSubtitle")}</p>
      </div>
      <div class="league-hero-media" aria-hidden="true">
        <img src="assets/brand/gata-league-logo.png" alt="">
      </div>
    </section>

    <section>
      <div class="page-head">
        <div>
          <h1>${t("home.quickStartTitle")}</h1>
          <p>${t("home.quickStartSubtitle")}</p>
        </div>
      </div>
      <div class="card-grid quick-grid">
        <a class="card compact" href="#/teams">
          <h3>${t("common.teams")}</h3>
          <p>${state.data.counts.teams} ${t("home.cardTeamsDescription")}</p>
        </a>
        <a class="card compact" href="#/builder">
          <h3>${t("nav.builder")}</h3>
          <p>${t("home.cardBuilderDescription")}</p>
        </a>
        <a class="card compact" href="#/star-players">
          <h3>${t("nav.starPlayers")}</h3>
          <p>${state.data.counts.starPlayers} ${t("home.cardStarPlayersDescription")}</p>
        </a>
        ${quickPages.map(renderSimpleCard).join("")}
      </div>
    </section>
  `;
}

function renderSimpleCard(page) {
  const preview = quickPreviews.get(page.title) ?? shortText(page.text, 135);
  return `
    <a class="card compact" href="${pageUrl(page)}">
      <h3>${escapeHtml(page.title)}</h3>
      <p>${escapeHtml(preview)}</p>
    </a>
  `;
}

function collectionForRoute(route) {
  if (route === "teams") return state.data.teams;
  if (route === "skills") return state.data.skills;
  if (route === "traits") return state.data.traits;
  if (route === "rules") return state.data.rules;
  if (route === "cheatsheets") return state.data.cheatsheets;
  if (route === "inducements") return state.data.inducements;
  if (route === "star-players") return state.data.starPlayers;
  if (route === "pages") {
    const order = ["Weather", "Kick-off Table", "Prayers to Nuffle", "Casualties", "Player Advancement", "Leagues", "Skill Table", "Special Rules", "All Gata Changes"];
    return state.data.pages
      .filter((page) => page.kind === "page" && order.includes(page.title))
      .sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title));
  }
  return [];
}

function visibleCollection(route) {
  const items = collectionForRoute(route);
  if (route === "teams") return items.filter(isTeamVisible);
  if (route === "skills") return items.filter(isSkillVisible);
  if (route === "star-players") return items.filter(isStarVisible);
  if (route === "inducements") return items.filter(isInducementVisible);
  return items.filter(matchesQuery);
}

function renderSection(route) {
  setActiveNav(route);
  setViewSection(route);
  normalizeSkillFilters(route);
  const items = visibleCollection(route);
  const allItems = collectionForRoute(route);
  const sectionTitleKeys = {
    teams: "nav.teamsRules",
    skills: "nav.skills",
    traits: "nav.traits",
    rules: "section.rulesTitle",
    cheatsheets: "section.cheatsheetsTitle",
    inducements: "nav.inducements",
    "star-players": "nav.starPlayers",
    pages: "nav.references",
  };
  const sectionDescriptionKeys = {
    teams: "section.teamsDescription",
    skills: "section.skillsDescription",
    traits: "section.traitsDescription",
    rules: "section.rulesDescription",
    cheatsheets: "section.cheatsheetsDescription",
    inducements: "section.inducementsDescription",
    "star-players": "section.starPlayersDescription",
  };
  const actions = route === "teams" ? `<a class="primary-button" href="#/builder">${t("section.createTeamButton")}</a>` : "";
  const description = route === "pages" ? "" : `${items.length} ${t("section.countOf")} ${allItems.length}. ${t(sectionDescriptionKeys[route])}`;

  view.innerHTML = `
    ${renderHeader(t(sectionTitleKeys[route]), description, actions)}
    ${renderFilters(route)}
    <div class="card-grid">
      ${items.length ? items.map((page) => renderListCard(page, route)).join("") : `<div class="empty-state">${t("section.emptyState")}</div>`}
    </div>
  `;
  wireFilters(route);
}

function renderFilters(route) {
  if (route === "teams") return renderTeamFilters();
  if (route === "skills") return renderSkillFilters(route);
  if (route === "star-players") return renderStarFilters();
  if (route === "inducements") return renderInducementFilters();
  return "";
}

function renderOption(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function renderTeamFilters() {
  const leagues = uniqueSorted(state.data.teams.map((team) => team.team?.meta?.league));
  const skills = allRowSkills();
  const tags = allRowTags();
  const prices = allRowCosts();
  const f = state.teamFilters;
  return `
    <div class="filter-panel" data-filter-panel="teams">
      <label class="filter-field"><span>${t("filters.type")}</span><select data-filter="type">
        ${renderOption("all", t("filters.allTeams"), f.type)}
        ${renderOption("core", t("filters.core"), f.type)}
        ${renderOption("experimental", t("filters.experimental"), f.type)}
      </select></label>
      <label class="filter-field"><span>${t("filters.league")}</span><select data-filter="league">
        ${renderOption("all", t("filters.anyLeague"), f.league)}
        ${leagues.map((league) => renderOption(league, league, f.league)).join("")}
      </select></label>
      <label class="filter-field"><span>${t("filters.skillOrTrait")}</span><select data-filter="skill">
        ${renderOption("all", t("filters.anySkill"), f.skill)}
        ${skills.map((skill) => renderOption(skill, skill, f.skill)).join("")}
      </select></label>
      <label class="filter-field"><span>${t("filters.playerTag")}</span><select data-filter="tag">
        ${renderOption("all", t("filters.anyTag"), f.tag)}
        ${tags.map((tag) => renderOption(tag, tag, f.tag)).join("")}
      </select></label>
      <label class="filter-field"><span>${t("filters.playerCost")}</span><select data-filter="price">
        ${renderOption("all", t("filters.anyCost"), f.price)}
        ${prices.map((price) => renderOption(price, price, f.price)).join("")}
      </select></label>
      <button class="filter-button" type="button" data-reset-filters>${t("filters.reset")}</button>
    </div>
  `;
}

function skillFilterCategories(route) {
  const source = route === "traits" ? state.data.traits : state.data.skills;
  const tags = uniqueSorted(source.flatMap((page) => page.tags ?? []));
  const groupCategories = (state.data.skillGroups ?? []).map((group) => group.category);
  return uniqueSorted([
    ...(route === "skills" ? groupCategories : []),
    ...tags.filter((tag) => !["Active", "Passive"].includes(tag)),
  ]);
}

function normalizeSkillFilters(route) {
  if (route !== "skills" && route !== "traits") return;
  const categories = skillFilterCategories(route);
  if (state.skillFilters.category !== "all" && !categories.includes(state.skillFilters.category)) {
    state.skillFilters.category = "all";
  }
}

function renderSkillFilters(route) {
  const categories = skillFilterCategories(route);
  const f = state.skillFilters;
  return `
    <div class="filter-panel compact-panel" data-filter-panel="skills">
      <label class="filter-field"><span>${t("filters.group")}</span><select data-filter="category">
        ${renderOption("all", t("filters.anyGroup"), f.category)}
        ${categories.map((tag) => renderOption(tag, tag, f.category)).join("")}
      </select></label>
      <button class="filter-button" type="button" data-reset-filters>${t("filters.reset")}</button>
    </div>
  `;
}

function renderStarFilters() {
  const tags = uniqueSorted(state.data.starPlayers.flatMap((page) => page.tags ?? []));
  const f = state.starFilters;
  return `
    <div class="filter-panel compact-panel" data-filter-panel="star-players">
      <label class="filter-field"><span>${t("filters.playerTag")}</span><select data-filter="tag">
        ${renderOption("all", t("filters.anyTag"), f.tag)}
        ${tags.map((tag) => renderOption(tag, tag, f.tag)).join("")}
      </select></label>
      <button class="filter-button" type="button" data-reset-filters>${t("filters.reset")}</button>
    </div>
  `;
}

function renderInducementFilters() {
  const tags = uniqueSorted(state.data.inducements.flatMap((page) => page.tags ?? []));
  const f = state.inducementFilters;
  return `
    <div class="filter-panel compact-panel" data-filter-panel="inducements">
      <label class="filter-field"><span>${t("filters.inducementTag")}</span><select data-filter="tag">
        ${renderOption("all", t("filters.anyTag"), f.tag)}
        ${tags.map((tag) => renderOption(tag, tag, f.tag)).join("")}
      </select></label>
      <button class="filter-button" type="button" data-reset-filters>${t("filters.reset")}</button>
    </div>
  `;
}

function wireFilters(route) {
  view.querySelectorAll("[data-filter]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.filter;
      const value = event.currentTarget.value;
      if (route === "teams") state.teamFilters[key] = value;
      if (route === "skills" || route === "traits") state.skillFilters[key] = value;
      if (route === "star-players") state.starFilters[key] = value;
      if (route === "inducements") state.inducementFilters[key] = value;
      renderSection(route);
    });
  });
  view.querySelector("[data-reset-filters]")?.addEventListener("click", () => {
    if (route === "teams") {
      state.teamFilters = { type: "all", league: "all", skill: "all", tag: "all", price: "all" };
    }
    if (route === "skills" || route === "traits") {
      state.skillFilters = { category: "all", application: "all" };
    }
    if (route === "star-players") state.starFilters = { tag: "all" };
    if (route === "inducements") state.inducementFilters = { tag: "all" };
    renderSection(route);
  });
}

function renderListCard(page, route) {
  if (route === "teams") {
    return `
      <a class="card compact" href="${pageUrl(page)}">
        <h3>${escapeHtml(page.title)}</h3>
        <p>${escapeHtml(page.team?.meta?.league ?? t("listCard.leagueRosterFallback"))}</p>
      </a>
    `;
  }
  if (route === "star-players") {
    return `
      <a class="card" href="${pageUrl(page)}">
        <h3>${escapeHtml(page.title)}</h3>
        <p>${escapeHtml([page.starPlayer?.cost, page.starPlayer?.availability].filter(Boolean).join(" · "))}</p>
        <div class="meta-line">${badgeList(page.tags, 3)}</div>
      </a>
    `;
  }
  if (route === "skills" || route === "traits") {
    return `
      <a class="card compact" href="${pageUrl(page)}">
        <h3>${escapeHtml(page.title)}</h3>
        <div class="meta-line">${badgeList(page.tags, 4)}</div>
      </a>
    `;
  }
  const preview = quickPreviews.get(page.title) ?? shortText(page.text.replace(/Full base wording:.*/i, "").trim(), 155);
  return `
    <a class="card" href="${pageUrl(page)}">
      <h3>${escapeHtml(page.title)}</h3>
      <p>${escapeHtml(preview)}</p>
      <div class="meta-line">${badgeList(page.tags, 3)}</div>
    </a>
  `;
}

function renderDetail(page) {
  const route = navRouteForPage(page);
  setActiveNav(route);
  setViewSection(route);
  const sidebar = renderSidebar(page);
  const actions = `<a class="primary-button" href="${listUrlForRoute(route)}">${t("common.back")}</a>`;
  let content = page.html || `<p>${escapeHtml(page.text)}</p>`;
  if (isLeaguesPage(page)) {
    content = renderLeaguesReferencePage();
  } else if (page.kind === "team") {
    content = `
      ${renderTeamRosterMobile(page)}
      <div class="team-roster-desktop">
        ${page.html || `<p>${escapeHtml(page.text)}</p>`}
      </div>
    `;
  } else if (isSkillTablePage(page)) {
    content = `
      ${renderSkillTableRoller()}
      ${renderSkillTableMobile()}
      <div class="skill-table-desktop">
        ${page.html || `<p>${escapeHtml(page.text)}</p>`}
      </div>
    `;
  } else if (isMobileCardTablePage(page)) {
    content = `
      ${renderReferenceTableMobile(page)}
      <div class="reference-table-desktop">
        ${page.html || `<p>${escapeHtml(page.text)}</p>`}
      </div>
    `;
  }
  view.innerHTML = `
    ${renderHeader(page.title, page.sectionLabel, actions)}
    <div class="detail-layout">
      <article class="content-panel content-body">
        ${content}
      </article>
      ${sidebar}
    </div>
  `;
  wireSkillTableRoller(page);
}

function renderRosterLinks(items = []) {
  if (!items.length) return `<span class="muted-text">-</span>`;
  return items.map((item) => {
    const page = pageForSkillTableEntry(item);
    return page
      ? `<a class="roster-pill" href="${pageUrl(page)}">${escapeHtml(item)}</a>`
      : `<span class="roster-pill">${escapeHtml(item)}</span>`;
  }).join("");
}

function renderRosterValues(items = []) {
  if (!items.length) return `<span class="muted-text">-</span>`;
  return items.map((item) => `<span class="roster-pill roster-pill-muted">${escapeHtml(item)}</span>`).join("");
}

function ruleLookupKey(value = "") {
  return String(value)
    .replace(/\bOId\b/g, "Old")
    .replace(/\bFavored\b/g, "Favoured")
    .replace(/Elven Kingdoms League/i, "Elven Kingdom League")
    .replace(/Worlds Edge/i, "World's Edge")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const leagueAccessDisplayByKey = new Map(leagueAccessNames.map((name) => [ruleLookupKey(name), name]));
const specialRuleDisplayByKey = new Map([
  [ruleLookupKey("Brawlin' Brutes"), "Brawlin' Brutes"],
  [ruleLookupKey("Brawling Brutes"), "Brawlin' Brutes"],
  [ruleLookupKey("Bribery and Corruption"), "Bribery and Corruption"],
  [ruleLookupKey("Favoured of..."), "Favoured of..."],
  [ruleLookupKey("Favoured of ..."), "Favoured of..."],
  [ruleLookupKey("Favored of..."), "Favoured of..."],
  [ruleLookupKey("Favored of ..."), "Favoured of..."],
  [ruleLookupKey("Low Cost Linemen"), "Low Cost Linemen"],
  [ruleLookupKey("Masters of Undeath"), "Masters of Undeath"],
  [ruleLookupKey("Passing Virtuosos"), "Passing Virtuosos"],
  [ruleLookupKey("Swarming"), "Swarming"],
  [ruleLookupKey("Team Captain"), "Team Captain"],
]);

function pageForRuleEntry(title) {
  if (canonicalLeagueName(title)) {
    return state.data.pages.find((page) => page.title === "Leagues") ?? null;
  }
  if (canonicalSpecialRuleName(title)) {
    return state.data.pages.find((page) => page.title === "Special Rules") ?? null;
  }
  const key = ruleLookupKey(title);
  return [...state.data.pages, ...state.data.skills, ...state.data.traits].find((page) => ruleLookupKey(page.title) === key)
    ?? null;
}

function splitRuleAccessParts(value = "") {
  return splitList(value)
    .filter((item) => item !== "-")
    .flatMap((item) => item.split(/\s+or\s+/i))
    .flatMap((item) => item.split(/\s+\+\s+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function canonicalLeagueName(value = "") {
  return leagueAccessDisplayByKey.get(ruleLookupKey(value)) ?? "";
}

function canonicalSpecialRuleName(value = "") {
  const clean = String(value).replace(/\bFavored\b/g, "Favoured").trim();
  const key = ruleLookupKey(clean);
  if (key.startsWith("favouredof")) {
    return key === ruleLookupKey("Favoured of...") ? "Favoured of..." : clean;
  }
  return specialRuleDisplayByKey.get(key) ?? "";
}

function uniqueCanonical(values, canonicalizer) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const canonical = canonicalizer(value);
    if (!canonical) continue;
    const key = ruleLookupKey(canonical);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(canonical);
  }
  return output;
}

function leagueOrder(name) {
  const key = ruleLookupKey(name);
  const index = leagueAccessNames.findIndex((league) => ruleLookupKey(league) === key);
  return index === -1 ? leagueAccessNames.length : index;
}

function specialRuleOrder(name) {
  const key = ruleLookupKey(name);
  const index = specialRuleNames.findIndex((rule) => key.startsWith("favouredof")
    ? ruleLookupKey(rule) === ruleLookupKey("Favoured of...")
    : ruleLookupKey(rule) === key);
  return index === -1 ? specialRuleNames.length : index;
}

function teamSpecialRuleTokens(team) {
  const rules = uniqueCanonical(splitRuleAccessParts(team.team?.meta?.specialRules ?? ""), canonicalSpecialRuleName);
  if (!rules.some((rule) => ruleLookupKey(rule) === ruleLookupKey("Team Captain"))) {
    rules.push("Team Captain");
  }
  return rules
    .sort((a, b) => specialRuleOrder(a) - specialRuleOrder(b) || a.localeCompare(b, "en"));
}

function specialRuleMatchKey(value = "") {
  const key = ruleLookupKey(value);
  return key === "brawlingbrutes" ? "brawlinbrutes" : key;
}

function teamHasSpecialRule(team, ruleName) {
  const expected = specialRuleMatchKey(ruleName);
  return teamSpecialRuleTokens(team).some((rule) => specialRuleMatchKey(rule) === expected);
}

function renderRuleLinks(items = []) {
  if (!items.length) return `<span class="muted-text">-</span>`;
  return items.map((item) => {
    const page = pageForRuleEntry(item);
    return page
      ? `<a class="roster-pill" href="${pageUrl(page)}">${escapeHtml(item)}</a>`
      : `<span class="roster-pill roster-pill-muted">${escapeHtml(item)}</span>`;
  }).join("");
}

function playerSppTotal(team, player) {
  const spp = normalizeSppCounters(player.spp);
  const hasBrawlinBrutes = teamHasSpecialRule(team, "Brawlin' Brutes");
  const hasPassingVirtuosos = teamHasSpecialRule(team, "Passing Virtuosos");
  const touchdownValue = hasBrawlinBrutes || hasPassingVirtuosos ? 2 : 3;
  const casualtyValue = hasBrawlinBrutes ? 3 : 2;
  return (spp.touchdowns * touchdownValue)
    + (spp.casualties * casualtyValue)
    + spp.knockouts
    + spp.completions
    + (hasPassingVirtuosos ? spp.catches : 0)
    + (spp.interceptions * 2)
    + (spp.mvps * 5);
}

function playerAdvancementLevel(player) {
  return normalizePlayerAdvancements(player.advancements).length;
}

function playerAdvancementSpent(player) {
  return normalizePlayerAdvancements(player.advancements)
    .reduce((sum, advancement, index) => sum + (advancementRanks[index]?.costs?.[advancement.type] ?? 0), 0);
}

function playerAvailableSpp(team, player) {
  return playerSppTotal(team, player) - playerAdvancementSpent(player);
}

function playerLevelRank(player) {
  const level = playerAdvancementLevel(player);
  return level > 0 ? advancementRanks[level - 1]?.rank ?? "Legend" : "Rookie";
}

function nextAdvancementCost(player, type) {
  const rank = advancementRanks[playerAdvancementLevel(player)];
  return rank?.costs?.[type] ?? 0;
}

function rosterTotalSpp(team, draft) {
  return selectedRosterPlayers(team, draft).reduce((sum, player) => sum + playerSppTotal(team, player), 0);
}

function teamLeagueOptions(team) {
  return uniqueCanonical(splitRuleAccessParts(team.team?.meta?.specialRules ?? ""), canonicalLeagueName)
    .sort((a, b) => leagueOrder(a) - leagueOrder(b) || a.localeCompare(b, "en"));
}

function ensureDraftLeagueChoice(team, draft) {
  const options = teamLeagueOptions(team);
  if (!options.length) {
    draft.selectedLeague = "";
    return "";
  }
  const current = options.find((option) => ruleLookupKey(option) === ruleLookupKey(draft.selectedLeague));
  draft.selectedLeague = current ?? options[0];
  return draft.selectedLeague;
}

function renderTeamRuleAccess(team, draft, controlName = "") {
  const leagueOptions = teamLeagueOptions(team);
  const selectedLeague = ensureDraftLeagueChoice(team, draft);
  const specialRules = teamSpecialRuleTokens(team);
  return `
    <section class="team-rules-panel">
      <div class="team-rules-row">
        <span>${t("roster.tier")}</span>
        <strong>${escapeHtml(team.team?.meta?.league ?? "-")}</strong>
      </div>
      <div class="team-rules-row">
        <span>${t("roster.leagueAccess")}</span>
        ${leagueOptions.length > 1 ? `
          <select ${controlName ? `data-${controlName}-league` : ""}>
            ${leagueOptions.map((option) => renderOption(option, option, selectedLeague)).join("")}
          </select>
        ` : `<div class="rule-link-list">${renderRuleLinks(leagueOptions)}</div>`}
      </div>
      <div class="team-rules-row team-rules-row-wide">
        <span>${t("roster.specialRules")}</span>
        <div class="rule-link-list">${renderRuleLinks(specialRules)}</div>
      </div>
    </section>
  `;
}

function teamsForLeagueAccess(leagueName) {
  const canonicalLeague = canonicalLeagueName(leagueName);
  return state.data.teams
    .filter((team) => teamLeagueOptions(team).some((option) => canonicalLeagueName(option) === canonicalLeague))
    .sort((a, b) => a.title.localeCompare(b.title, "en"));
}

function starPlayerAvailableForLeague(starPlayer, leagueName) {
  const availability = starPlayer.starPlayer?.availability ?? "";
  const tags = starPlayer.tags ?? [];
  const combined = [availability, ...tags].join(", ");
  const canonicalLeague = canonicalLeagueName(leagueName);
  if (/any\s+team/i.test(combined)) {
    const exclusions = [...combined.matchAll(/except\s+([^,;]+)/gi)]
      .flatMap((match) => splitRuleAccessParts(match[1]));
    if (exclusions.some((option) => canonicalLeagueName(option) === canonicalLeague)) {
      return false;
    }
    return true;
  }

  const options = splitRuleAccessParts(combined);
  return options.some((option) => canonicalLeagueName(option) === canonicalLeague);
}

function starPlayersForLeagueAccess(leagueName) {
  return state.data.starPlayers
    .filter((starPlayer) => starPlayerAvailableForLeague(starPlayer, leagueName))
    .sort((a, b) => a.title.localeCompare(b.title, "en"));
}

function renderPagePills(items, emptyLabel = "-") {
  if (!items.length) return `<span class="muted-text">${escapeHtml(emptyLabel)}</span>`;
  return items.map((item) => `<a class="roster-pill" href="${pageUrl(item)}">${escapeHtml(item.title)}</a>`).join("");
}

function renderLeaguesReferencePage() {
  return `
    <div class="league-reference-grid">
      ${leagueAccessNames.map((league) => {
        const teams = teamsForLeagueAccess(league);
        const starPlayers = starPlayersForLeagueAccess(league);
        return `
          <article class="league-reference-card">
            <header>
              <h2>${escapeHtml(league)}</h2>
              <span>${teams.length} ${t("leagueRef.teamsSuffix")} · ${starPlayers.length} ${t("leagueRef.starPlayersSuffix")}</span>
            </header>
            <section class="league-reference-section">
              <h3>${t("common.teams")}</h3>
              <div class="rule-link-list league-link-list">
                ${renderPagePills(teams, t("leagueRef.noTeams"))}
              </div>
            </section>
            <section class="league-reference-section">
              <h3>${t("nav.starPlayers")}</h3>
              <div class="rule-link-list league-link-list league-star-list">
                ${renderPagePills(starPlayers, t("leagueRef.noStarPlayers"))}
              </div>
            </section>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderRosterStatGrid(row) {
  return `
    <dl class="team-stat-grid">
      <div><dt>${t("stats.ma")}</dt><dd>${escapeHtml(row.ma || "-")}</dd></div>
      <div><dt>${t("stats.st")}</dt><dd>${escapeHtml(row.st || "-")}</dd></div>
      <div><dt>${t("stats.ag")}</dt><dd>${escapeHtml(row.ag || "-")}</dd></div>
      <div><dt>${t("stats.pa")}</dt><dd>${escapeHtml(row.pa || "-")}</dd></div>
      <div><dt>${t("stats.ar")}</dt><dd>${escapeHtml(row.ar || "-")}</dd></div>
    </dl>
  `;
}

function renderTeamRosterMobile(team) {
  const rows = rowsForTeam(team);
  if (!rows.length) return "";

  return `
    <section class="team-roster-mobile" aria-label="${escapeHtml(team.title)} roster">
      ${rows.map((row) => `
        <article class="team-roster-card">
          <header>
            <div>
              <h2>${escapeHtml(row.position)}</h2>
              <span>${escapeHtml(row.qty || "-")}</span>
            </div>
            <strong>${escapeHtml(rowCost(row) || "-")}</strong>
          </header>
          ${renderRosterStatGrid(row)}
          <div class="team-roster-field">
            <span>${t("roster.skillsLabel")}</span>
            <div>${renderRosterLinks(row.skills)}</div>
          </div>
          <div class="team-roster-columns">
            <div class="team-roster-field">
              <span>${t("roster.primary")}</span>
              <div>${renderRosterValues(row.primary)}</div>
            </div>
            <div class="team-roster-field">
              <span>${t("roster.secondary")}</span>
              <div>${renderRosterValues(row.secondary)}</div>
            </div>
          </div>
          <div class="team-roster-field">
            <span>${t("roster.tags")}</span>
            <div>${renderRosterValues(row.tags)}</div>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderSkillTableRoller() {
  const groups = state.data.skillGroups ?? [];
  const selectedGroup = groups.find((group) => group.category === state.skillTableRoller.group) ?? groups[0];
  if (!selectedGroup) return "";

  const skills = selectedGroup.skills ?? [];
  const result = skills.includes(state.skillTableRoller.result) ? state.skillTableRoller.result : "";
  const resultPage = result ? pageForSkillTableEntry(result) : null;
  const resultMarkup = result
    ? `<a class="skill-roll-result-link" href="${resultPage ? pageUrl(resultPage) : "#/skill-table"}">${escapeHtml(result)}</a>`
    : `<span class="skill-roll-placeholder">${t("skillRoll.readyPrefix")}${skills.length}.</span>`;

  return `
    <section class="skill-roll-panel" aria-label="Skill randomizer">
      <div class="skill-roll-controls">
        <label class="filter-field">
          <span>${t("skillRoll.groupLabel")}</span>
          <select data-skill-roll-group>
            ${groups.map((group) => renderOption(group.category, group.category, selectedGroup.category)).join("")}
          </select>
        </label>
        <button class="primary-button" type="button" data-skill-roll>${t("skillRoll.rollButton")}</button>
      </div>
      <div class="skill-roll-result">
        <span class="skill-roll-die">1d${skills.length}${state.skillTableRoller.roll ? `: ${state.skillTableRoller.roll}` : ""}</span>
        ${resultMarkup}
      </div>
    </section>
  `;
}

function inlineSimpleMarkdown(value = "") {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function splitMarkdownTableRow(line = "") {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseFirstMarkdownTable(markdown = "") {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line, index) => (
    line.trim().startsWith("|")
    && lines[index + 1]?.trim().startsWith("|")
  ));
  if (start === -1) return null;

  const headers = splitMarkdownTableRow(lines[start]);
  const rows = [];
  for (let index = start + 2; index < lines.length && lines[index].trim().startsWith("|"); index += 1) {
    rows.push(splitMarkdownTableRow(lines[index]));
  }
  return { headers, rows };
}

function renderReferenceTableMobile(page) {
  const table = parseFirstMarkdownTable(page.body);
  if (!table?.rows.length) return "";

  return `
    <section class="reference-table-mobile" aria-label="${escapeHtml(page.title)} mobile table">
      ${table.rows.map((row) => {
        const roll = row[0] ?? "";
        if (table.headers.length >= 3) {
          return `
            <article class="reference-table-card">
              <header>
                <strong>${escapeHtml(roll)}</strong>
              </header>
              <h2>${inlineSimpleMarkdown(row[1] ?? "")}</h2>
              <p>${inlineSimpleMarkdown(row[2] ?? "")}</p>
            </article>
          `;
        }

        return `
          <article class="reference-table-card">
            <header>
              <strong>${escapeHtml(roll)}</strong>
            </header>
            <p>${inlineSimpleMarkdown(row[1] ?? "")}</p>
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function renderSkillTableMobile() {
  const groups = state.data.skillGroups ?? [];
  if (!groups.length) return "";

  return `
    <section class="skill-table-mobile" aria-label="Skill table grouped by category">
      ${groups.map((group) => `
        <article class="skill-table-group">
          <h2>${escapeHtml(group.category)}</h2>
          <ol class="skill-table-list">
            ${(group.skills ?? []).map((skill, index) => {
              const skillPage = pageForSkillTableEntry(skill);
              return `
                <li>
                  <span class="skill-table-number">${index + 1}</span>
                  <a href="${skillPage ? pageUrl(skillPage) : "#/skill-table"}">${escapeHtml(skill)}</a>
                </li>
              `;
            }).join("")}
          </ol>
        </article>
      `).join("")}
    </section>
  `;
}

function wireSkillTableRoller(page) {
  if (!isSkillTablePage(page)) return;

  view.querySelector("[data-skill-roll-group]")?.addEventListener("change", (event) => {
    state.skillTableRoller.group = event.currentTarget.value;
    state.skillTableRoller.result = "";
    state.skillTableRoller.roll = null;
    renderDetail(page);
  });

  view.querySelector("[data-skill-roll]")?.addEventListener("click", () => {
    const group = (state.data.skillGroups ?? []).find((item) => item.category === state.skillTableRoller.group);
    const skills = group?.skills ?? [];
    if (!skills.length) return;
    const index = Math.floor(Math.random() * skills.length);
    state.skillTableRoller.result = skills[index];
    state.skillTableRoller.roll = index + 1;
    renderDetail(page);
  });
}

function renderSidebar(page) {
  if (page.kind === "team") {
    const roster = rowsForTeam(page);
    const costs = uniqueSorted(roster.map(rowCost).filter(Boolean));
    return `
      <aside class="side-panel">
        <h3>${t("sidebar.teamHeading")}</h3>
        <dl class="stat-list">
          <dt>${t("sidebar.positions")}</dt><dd>${roster.length}</dd>
          <dt>${t("filters.playerCost")}</dt><dd>${escapeHtml(costs.join(" - ") || "-")}</dd>
          <dt>${t("sidebar.rerolls")}</dt><dd>${escapeHtml(page.team?.meta?.rerolls ?? "-")}</dd>
          <dt>${t("sidebar.apothecary")}</dt><dd>${escapeHtml(cleanApothecary(page.team?.meta?.apothecary))}</dd>
          <dt>${t("roster.tier")}</dt><dd>${escapeHtml(page.team?.meta?.league ?? "-")}</dd>
          <dt>${t("roster.leagueAccess")}</dt><dd>${renderRuleLinks(teamLeagueOptions(page))}</dd>
          <dt>${t("roster.specialRules")}</dt><dd>${renderRuleLinks(teamSpecialRuleTokens(page))}</dd>
        </dl>
      </aside>
    `;
  }
  if (page.kind === "starPlayer") {
    return `
      <aside class="side-panel">
        <h3>${t("sidebar.starPlayerHeading")}</h3>
        <dl class="stat-list">
          <dt>${t("sidebar.cost")}</dt><dd>${escapeHtml(page.starPlayer?.cost ?? "-")}</dd>
          <dt>${t("sidebar.availability")}</dt><dd>${escapeHtml(page.starPlayer?.availability ?? "-")}</dd>
          <dt>${t("roster.tags")}</dt><dd>${badgeList(page.tags, 8)}</dd>
        </dl>
      </aside>
    `;
  }
  return `
    <aside class="side-panel">
      <h3>${t("sidebar.pageHeading")}</h3>
      <dl class="stat-list">
        <dt>${t("sidebar.category")}</dt><dd>${escapeHtml(page.sectionLabel)}</dd>
        ${page.tags?.length ? `<dt>${t("roster.tags")}</dt><dd>${badgeList(page.tags, 8)}</dd>` : ""}
      </dl>
    </aside>
  `;
}

function cleanApothecary(value = "") {
  return String(value).replace(/^Apothecary:\s*/i, "") || "-";
}

function renderLegal() {
  setActiveNav("legal");
  setViewSection("pages");
  view.innerHTML = `
    ${renderHeader(t("legal.title"), t("legal.subtitle"))}
    <article class="content-panel content-body">
      <p>${t("legal.paragraph1")}</p>
      <p>${t("legal.paragraph2")}</p>
      <p>${t("legal.paragraph3")}</p>
    </article>
  `;
}

async function loadMyTeams(force = false) {
  if (!state.auth.currentUser) {
    state.myTeams = { items: [], loaded: true, loading: false, error: "" };
    return;
  }
  if (state.myTeams.loaded && !force) return;
  state.myTeams.loading = true;
  state.myTeams.error = "";
  try {
    const payload = await apiRequest("/api/teams");
    state.myTeams.items = payload.teams ?? [];
    state.myTeams.loaded = true;
  } catch (error) {
    state.myTeams.error = error.message;
  } finally {
    state.myTeams.loading = false;
  }
}

async function renderMyTeams() {
  setActiveNav("my-teams");
  setViewSection("teams");
  view.innerHTML = `
    ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"), `<button class="primary-button" type="button" data-new-team>${t("myTeams.createTeam")}</button>`)}
    <div class="loading">${t("myTeams.loadingTeams")}</div>
  `;
  await loadMyTeams(true);
  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"))}
      <div class="empty-state">${t("myTeams.loginRequired")}</div>
    `;
    return;
  }
  if (state.myTeams.error) {
    view.innerHTML = `
      ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"))}
      <div class="empty-state">${escapeHtml(state.myTeams.error)}</div>
    `;
    return;
  }
  view.innerHTML = `
    ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"), `<button class="primary-button" type="button" data-new-team>${t("myTeams.createTeam")}</button>`)}
    ${state.myTeams.items.length ? renderSavedTeamsTable(state.myTeams.items) : `<div class="empty-state">${t("myTeams.noSavedTeams")}</div>`}
  `;
  wireMyTeams();
}

function renderSavedTeamsTable(teams) {
  return `
    <article class="content-panel compact-table-panel">
      <div class="table-scroll builder-table-scroll">
        <table class="my-teams-table compact-roster-table">
          <thead>
            <tr>
              <th>${t("sidebar.teamHeading")}</th>
              <th>${t("myTeams.table.rules")}</th>
              <th>${t("myTeams.table.players")}</th>
              <th>${t("roster.totalCost")}</th>
              <th>${t("footer.updated")}</th>
              <th>${t("myTeams.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            ${teams.map(renderSavedTeamRow).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderSavedTeamRow(team) {
  const base = state.data.teams.find((item) => item.slug === team.baseTeamSlug);
  const draft = normalizeSavedRoster(team);
  const rosterTeam = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? base;
  if (rosterTeam) {
    ensureDraftPlayers(rosterTeam, draft);
  }
  const costs = rosterTeam ? calculateRosterCosts(rosterTeam, draft) : null;
  const updated = team.updatedAt ? new Date(team.updatedAt).toLocaleDateString("en-GB") : "-";
  return `
    <tr>
      <td>
        <span class="saved-team-name-cell">
          ${team.logoData ? `<img src="${escapeHtml(team.logoData)}" alt="">` : ""}
          <strong>${escapeHtml(team.name)}</strong>
        </span>
      </td>
      <td>${rosterTeam ? `<a class="inline-rule-link" href="${pageUrl(rosterTeam)}">${escapeHtml(rosterTeam.title)}</a>` : escapeHtml(team.baseTeamSlug || "-")}</td>
      <td>${costs ? costs.totalPlayersCount : "-"}</td>
      <td>${costs ? `${costs.total}k` : "-"}</td>
      <td>${escapeHtml(updated)}</td>
      <td>
        <div class="table-actions">
          <a class="primary-button compact-action" href="#/my-teams/${encodeURIComponent(team.id)}">${t("common.edit")}</a>
          <button class="filter-button compact-action" type="button" data-delete-team="${escapeHtml(team.id)}">${t("common.delete")}</button>
        </div>
      </td>
    </tr>
  `;
}

function wireMyTeams() {
  view.querySelector("[data-new-team]")?.addEventListener("click", () => {
    resetBuilderForTeam(state.data.teams[0]);
    location.hash = "#/builder";
  });
  view.querySelectorAll("[data-delete-team]").forEach((button) => {
    button.addEventListener("click", async () => {
      await apiRequest(`/api/teams/${button.dataset.deleteTeam}`, { method: "DELETE" });
      await renderMyTeams();
    });
  });
}

async function renderSavedRoster(teamId, refresh = true) {
  setActiveNav("my-teams");
  setViewSection("teams");
  if (refresh) {
    view.innerHTML = `
      ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"))}
      <div class="loading">${t("myTeams.loadingTeam")}</div>
    `;
  }
  await loadMyTeams(refresh);
  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"))}
      <div class="empty-state">${t("myTeams.loginRequired")}</div>
    `;
    return;
  }

  const savedTeam = state.myTeams.items.find((item) => item.id === teamId);
  if (!savedTeam) {
    view.innerHTML = `
      ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"))}
      <div class="empty-state">${t("savedRoster.notFound")}</div>
    `;
    return;
  }

  const draft = normalizeSavedRoster(savedTeam);
  const teams = state.data.teams;
  if (!draft.teamSlug && teams[0]) draft.teamSlug = teams[0].slug;
  const team = teams.find((item) => item.slug === draft.teamSlug) ?? teams[0];
  ensureDraftLeagueChoice(team, draft);
  ensureDraftPlayers(team, draft);
  const costs = calculateRosterCosts(team, draft);
  const warnings = rosterWarnings(team, draft, costs);

  view.innerHTML = `
    ${renderHeader(`${t("sidebar.teamHeading")} "${draft.teamName || savedTeam.name || team.title}"`, `${team.title} ${t("savedRoster.rosterSuffix")}`, `<a class="primary-button" href="#/my-teams">${t("common.back")}</a>`)}
    <div class="saved-roster-top-grid">
      ${renderSavedRosterSummary(savedTeam, team, draft, costs, warnings)}
      ${renderSavedRosterSettings(team, draft, costs, teams)}
    </div>
    <div class="builder-layout builder-layout-main">
      <section class="builder-panel">
        <section class="builder-selected">
          <h2>${t("savedRoster.rosterHeading")}</h2>
          ${renderSavedPlayerList(team, draft)}
        </section>

        <section class="builder-pool saved-add-player-section">
          <h2>${t("savedRoster.addNewPlayers")}</h2>
          ${renderSavedNewPlayerTable(team, draft)}
        </section>
      </section>
    </div>
  `;
  wireSavedRoster(savedTeam, team, draft);
}

function renderSavedRosterSummary(savedTeam, team, draft, costs, warnings) {
  const autosave = autosaveStatusFor(savedTeam.id);
  return `
    <aside class="builder-summary saved-roster-summary-panel side-panel">
      ${draft.logoData ? `
        <div class="summary-logo-block">
          <img src="${escapeHtml(draft.logoData)}" alt="">
          <button class="filter-button compact-action" type="button" data-roster-remove-logo>${t("savedRoster.removeLogo")}</button>
        </div>
      ` : ""}
      <div class="summary-title-block">
        <h3>${t("savedRoster.summaryTitle")}</h3>
        <p class="autosave-status" data-autosave-status data-status="${escapeHtml(autosave.status)}">${escapeHtml(autosave.message)}</p>
        <a class="builder-team-link" href="${pageUrl(team)}">${escapeHtml(team.title)}</a>
      </div>
      <dl class="stat-list summary-stat-grid">
        <dt>${t("savedRoster.activePlayers")}</dt><dd>${costs.playersCount}</dd>
        <dt>${t("savedRoster.totalPlayers")}</dt><dd>${costs.totalPlayersCount}</dd>
        <dt>${t("savedRoster.startingRerolls")}</dt><dd>${draft.startingRerolls ?? 0}</dd>
        <dt>${t("savedRoster.teamRerolls")}</dt><dd>${draft.teamRerolls ?? 0}</dd>
        <dt>${t("savedRoster.dedicatedFans")}</dt><dd>${countToNumber(draft.dedicatedFans)}</dd>
        <dt>${t("savedRoster.treasury")}</dt><dd data-treasury-display>${countToNumber(draft.treasury)}k</dd>
        <dt>${t("savedRoster.totalSppLabel")}</dt><dd data-total-spp-display>${rosterTotalSpp(team, draft)} SPP</dd>
        <dt>${t("savedRoster.playersCost")}</dt><dd>${costs.playersCost}k</dd>
        <dt>${t("savedRoster.staffCost")}</dt><dd>${costs.staffCost}k</dd>
        <dt>${t("roster.totalCost")}</dt><dd>${costs.total}k</dd>
      </dl>
      <div class="summary-state-block">
        ${warnings.length ? `<div class="builder-warnings">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : `<div class="builder-ok">${t("savedRoster.withinLimits")}</div>`}
        <div class="summary-actions">
          <button class="primary-button" type="button" data-save-roster>${t("roster.saveChanges")}</button>
          <button class="primary-button" type="button" data-copy-saved-roster>${t("roster.copyRoster")}</button>
        </div>
      </div>
    </aside>
  `;
}

function renderSavedRosterSettings(team, draft, costs, teams) {
  return `
    <section class="roster-settings-panel side-panel">
      <div class="builder-form saved-roster-form">
        <label class="filter-field">
          <span>${t("sidebar.teamHeading")}</span>
          <select data-roster-team>
            ${teams.map((item) => renderOption(item.slug, item.title, team.slug)).join("")}
          </select>
        </label>
        <label class="filter-field">
          <span>${t("savedRoster.teamName")}</span>
          <input type="text" value="${escapeHtml(draft.teamName || team.title)}" data-roster-name>
        </label>
        <label class="filter-field">
          <span>${t("savedRoster.logoField")}</span>
          <input type="file" accept="image/*" data-roster-logo>
        </label>
        <label class="filter-field">
          <span>${t("roster.totalCost")}</span>
          <input type="text" value="${costs.total}k" readonly>
        </label>
        <label class="filter-field">
          <span>${t("savedRoster.treasuryField")}</span>
          <input type="number" step="10" value="${countToNumber(draft.treasury)}" data-roster-treasury>
        </label>
        <label class="filter-field">
          <span>${t("savedRoster.startingRerolls")}</span>
          <div class="inline-stepper-control">
            <button class="filter-button" type="button" data-roster-reroll="-1" ${countToNumber(draft.startingRerolls) <= 0 ? "disabled" : ""}>-</button>
            <strong>${countToNumber(draft.startingRerolls)}</strong>
            <button class="filter-button" type="button" data-roster-reroll="1">+</button>
          </div>
        </label>
        <label class="filter-field">
          <span>${t("savedRoster.teamRerollsField")}</span>
          <div class="inline-stepper-control">
            <button class="filter-button" type="button" data-roster-team-reroll="-1" ${countToNumber(draft.teamRerolls) <= 0 ? "disabled" : ""}>-</button>
            <strong>${countToNumber(draft.teamRerolls)}</strong>
            <button class="filter-button" type="button" data-roster-team-reroll="1" ${countToNumber(draft.teamRerolls) >= builderStaffMaximums.teamRerolls ? "disabled" : ""}>+</button>
          </div>
        </label>
      </div>
      <div class="builder-addons compact-addons">
        ${renderRosterStaffControl("dedicatedFans", t("savedRoster.dedicatedFans"), draft.dedicatedFans)}
        ${renderRosterStaffControl("assistantCoaches", t("savedRoster.assistantCoaches"), draft.assistantCoaches)}
        ${renderRosterStaffControl("cheerleaders", t("savedRoster.cheerleaders"), draft.cheerleaders)}
      </div>
      ${renderTeamRuleAccess(team, draft, "roster")}
    </section>
  `;
}

function renderRosterAddon(key, title, description, max, value, cost, disabled = false) {
  const current = disabled ? 0 : value;
  return `
    <div class="builder-addon ${disabled ? "disabled" : ""}">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(disabled ? t("roster.notAvailableForTeam") : description)}</span>
      </div>
      ${renderRosterStepper(`roster-addon-${key}`, current, 0, max, disabled || !cost)}
    </div>
  `;
}

function renderRosterStaffControl(key, title, value) {
  const max = builderStaffMaximums[key] ?? 6;
  const current = countToNumber(value);
  const description = key === "dedicatedFans" ? t("roster.postMatchValue") : t("roster.tenKEach");
  return `
    <div class="builder-addon compact-staff-control">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </div>
      <div class="inline-stepper-control">
        <button class="filter-button" type="button" data-roster-staff="${key}" data-roster-staff-step="-1" ${current <= 0 ? "disabled" : ""}>-</button>
        <strong>${current}</strong>
        <button class="filter-button" type="button" data-roster-staff="${key}" data-roster-staff-step="1" ${current >= max ? "disabled" : ""}>+</button>
      </div>
    </div>
  `;
}

function rowCountInSlots(draft, rowIndex) {
  return (draft.slots ?? []).filter((slot) => slot && slot.rowIndex === rowIndex).length;
}

function rowAvailableForSlot(draft, rowIndex, currentSlotIndex = -1) {
  const row = rowsForTeam(state.data.teams.find((team) => team.slug === draft.teamSlug) ?? state.data.teams[0])[rowIndex];
  const currentSlot = currentSlotIndex >= 0 ? draft.slots?.[currentSlotIndex] : null;
  const count = rowCountInSlots(draft, rowIndex) - (currentSlot?.rowIndex === rowIndex ? 1 : 0);
  return count < rosterMax(row?.qty);
}

function addableRowsForSlots(team, draft, currentSlotIndex = -1) {
  return rowsForTeam(team)
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter((item) => rowAvailableForSlot(draft, item.rowIndex, currentSlotIndex));
}

function slotPlayerFromDraft(team, slot, slotIndex) {
  if (!slot) return null;
  const row = rowsForTeam(team)[slot.rowIndex];
  if (!row) return null;
  return {
    key: `slot-${slotIndex}`,
    slotIndex,
    rowIndex: slot.rowIndex,
    copyIndex: slotIndex,
    row,
    name: slot.name || row.position,
    stats: {
      ma: Number(row.ma) + (slot.statMods?.ma ?? 0),
      st: Number(row.st) + (slot.statMods?.st ?? 0),
      ag: row.ag,
      pa: row.pa,
      ar: row.ar,
    },
    statMods: slot.statMods ?? {},
    extraSkills: slot.extraSkills ?? [],
    skipNextGame: Boolean(slot.skipNextGame),
  };
}

function renderRosterSlot(team, draft, slot, slotIndex) {
  const player = slotPlayerFromDraft(team, slot, slotIndex);
  const availableRows = addableRowsForSlots(team, draft, slotIndex);
  if (!player) {
    return `
      <article class="roster-slot empty">
        <header>
          <strong>${t("roster.slot")} ${slotIndex + 1}</strong>
          <span>${t("roster.emptySlot")}</span>
        </header>
        <div class="roster-slot-add">
          <select data-slot-add="${slotIndex}">
            <option value="">${t("roster.addPlayerOption")}</option>
            ${availableRows.map(({ row, rowIndex }) => `
              <option value="${rowIndex}">${escapeHtml(row.position)} - ${escapeHtml(rowCost(row))}</option>
            `).join("")}
          </select>
          <button class="primary-button" type="button" data-slot-add-button="${slotIndex}" ${availableRows.length ? "" : "disabled"}>${t("common.add")}</button>
        </div>
      </article>
    `;
  }

  return `
    <article class="roster-slot filled">
      <header>
        <div>
          <strong>${t("roster.slot")} ${slotIndex + 1}</strong>
          <span>${escapeHtml(player.row.position)} · ${escapeHtml(rowCost(player.row))}</span>
        </div>
        <button class="filter-button" type="button" data-slot-remove="${slotIndex}">${t("common.remove")}</button>
      </header>
      ${renderSlotPlayerEditor(player)}
    </article>
  `;
}

function renderSlotPlayerEditor(player) {
  const editableStats = ["ma", "st", "ag", "pa", "ar"];
  const options = availableSkillsForRow(player.row).filter((skill) => !player.extraSkills.includes(skill));
  return `
    <div class="player-editor slot-player-editor" data-slot-player="${player.slotIndex}">
      <div class="slot-player-topline">
        <label class="filter-field compact-field">
          <span>${t("roster.playerName")}</span>
          <input type="text" value="${escapeHtml(player.name)}" data-slot-player-name>
        </label>
        <label class="checkbox-field skip-next-field">
          <input type="checkbox" data-slot-skip-next ${player.skipNextGame ? "checked" : ""}>
          <span>${t("roster.skipNextGame")}</span>
        </label>
      </div>
      <div class="player-stat-editors slot-stat-editors">
        ${editableStats.map((stat) => {
          const mod = player.statMods[stat] ?? 0;
          const value = statValueForDisplay(player.row[stat], mod);
          const modClass = mod > 0 ? "stat-up" : mod < 0 ? "stat-down" : "";
          return `
            <div class="player-stat-editor ${modClass}">
              <span>${stat.toUpperCase()}</span>
              <strong>${escapeHtml(value)}</strong>
              <div class="mini-stepper">
                <button type="button" data-slot-stat="${stat}" data-slot-stat-delta="-1">-</button>
                <button type="button" data-slot-stat="${stat}" data-slot-stat-delta="1">+</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="builder-summary-skills slot-skill-list">
        ${renderRosterLinks([...(player.row.skills ?? []), ...player.extraSkills])}
      </div>
      <div class="player-skill-editor">
        <select data-slot-skill>
          <option value="">${t("roster.addSkillOption")}</option>
          ${options.map((skill) => renderOption(skill, skill, "")).join("")}
        </select>
        <button class="filter-button" type="button" data-slot-add-skill>${t("common.add")}</button>
      </div>
      ${player.extraSkills.length ? `
        <div class="player-extra-skills">
          ${player.extraSkills.map((skill) => `
            <button class="roster-pill" type="button" data-slot-remove-skill="${escapeHtml(skill)}">${escapeHtml(skill)} x</button>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderRosterStepper(name, value, min, max, disabled = false) {
  return `
    <div class="stepper" data-roster-stepper="${escapeHtml(name)}" data-min="${min}" data-max="${max}">
      <button type="button" data-roster-step="-1" ${disabled || value <= min ? "disabled" : ""}>-</button>
      <output>${value}</output>
      <button type="button" data-roster-step="1" ${disabled || value >= max ? "disabled" : ""}>+</button>
    </div>
  `;
}

function wireSavedRoster(savedTeam, team, draft) {
  const autosave = () => scheduleSavedRosterAutosave(savedTeam.id);
  const rerender = () => {
    syncRosterCountsFromPlayers(draft);
    updateSavedRosterFields(savedTeam, draft);
    autosave();
    renderSavedRoster(savedTeam.id, false);
  };

  view.querySelector("[data-roster-team]")?.addEventListener("change", (event) => {
    const nextTeam = state.data.teams.find((item) => item.slug === event.currentTarget.value);
    if (!nextTeam) return;
    draft.teamSlug = nextTeam.slug;
    draft.players = [];
    draft.selectedLeague = "";
    syncRosterCountsFromPlayers(draft);
    if (!draft.teamName) draft.teamName = nextTeam.title;
    rerender();
  });
  view.querySelector("[data-roster-name]")?.addEventListener("input", (event) => {
    draft.teamName = event.currentTarget.value;
    updateSavedRosterFields(savedTeam, draft);
    autosave();
  });
  view.querySelector("[data-roster-treasury]")?.addEventListener("input", (event) => {
    draft.treasury = countToNumber(event.currentTarget.value);
    updateSavedRosterFields(savedTeam, draft);
    const treasuryDisplay = view.querySelector("[data-treasury-display]");
    if (treasuryDisplay) treasuryDisplay.textContent = `${countToNumber(draft.treasury)}k`;
    autosave();
  });
  view.querySelector("[data-roster-league]")?.addEventListener("change", (event) => {
    draft.selectedLeague = event.currentTarget.value;
    updateSavedRosterFields(savedTeam, draft);
    autosave();
  });
  view.querySelector("[data-roster-logo]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert(t("savedRoster.logoTooLarge"));
      event.currentTarget.value = "";
      return;
    }
    draft.logoData = await fileToDataUrl(file);
    rerender();
  });
  view.querySelector("[data-roster-remove-logo]")?.addEventListener("click", () => {
    draft.logoData = "";
    rerender();
  });
  view.querySelectorAll("[data-roster-reroll]").forEach((button) => {
    button.addEventListener("click", () => {
      const previous = countToNumber(draft.startingRerolls);
      draft.startingRerolls = clamp(previous + Number(button.dataset.rosterReroll), 0, builderStaffMaximums.startingRerolls);
      applyPaidStaffChange(draft, "startingRerolls", previous, draft.startingRerolls);
      rerender();
    });
  });
  view.querySelectorAll("[data-roster-team-reroll]").forEach((button) => {
    button.addEventListener("click", () => {
      const delta = Number(button.dataset.rosterTeamReroll);
      const previous = countToNumber(draft.teamRerolls);
      draft.teamRerolls = clamp(previous + delta, 0, builderStaffMaximums.teamRerolls);
      applyPaidStaffChange(draft, "teamRerolls", previous, draft.teamRerolls);
      rerender();
    });
  });
  view.querySelectorAll("[data-roster-staff]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.rosterStaff;
      const max = builderStaffMaximums[key] ?? 6;
      const delta = Number(button.dataset.rosterStaffStep);
      const previous = countToNumber(draft[key]);
      draft[key] = clamp(previous + delta, 0, max);
      applyPaidStaffChange(draft, key, previous, draft[key]);
      rerender();
    });
  });
  view.querySelectorAll("[data-add-saved-row]").forEach((button) => {
    button.addEventListener("click", () => {
      const rowIndex = Number(button.dataset.addSavedRow);
      const row = rowsForTeam(team)[rowIndex];
      if (!row) return;
      draft.players.push(makeRosterPlayer(row, rowIndex, rowCountInPlayers(draft, rowIndex), { purchased: true }));
      spendTreasury(draft, costToNumber(rowCost(row)));
      syncRosterCountsFromPlayers(draft);
      rerender();
    });
  });
  wireSavedPlayerEditors(team, draft, rerender);
  view.querySelector("[data-save-roster]")?.addEventListener("click", () => saveSavedRoster(savedTeam, team, draft));
  view.querySelector("[data-copy-saved-roster]")?.addEventListener("click", () => copySavedRoster(team, draft));
}

function wireSavedPlayerEditors(team, draft, rerender) {
  const autosave = () => scheduleSavedRosterAutosave(draft.editingTeamId);
  view.querySelectorAll("[data-roster-player]").forEach((card) => {
    const player = draft.players.find((item) => item.id === card.dataset.rosterPlayer);
    if (!player) return;
    card.querySelector("[data-saved-player-name]")?.addEventListener("input", (event) => {
      player.name = event.currentTarget.value;
      autosave();
    });
    card.querySelector("[data-saved-player-skip]")?.addEventListener("change", (event) => {
      player.skipNextGame = event.currentTarget.checked;
      rerender();
    });
    card.querySelector("[data-saved-player-nigling]")?.addEventListener("change", (event) => {
      player.niglingInjury = event.currentTarget.checked;
      autosave();
    });
    card.querySelectorAll("[data-saved-player-spp]").forEach((input) => {
      input.addEventListener("input", (event) => {
        player.spp = normalizeSppCounters(player.spp);
        player.spp[event.currentTarget.dataset.savedPlayerSpp] = Math.max(0, countToNumber(event.currentTarget.value));
        const rowTotal = card.querySelector("[data-player-spp-total]");
        if (rowTotal) rowTotal.textContent = `${playerSppTotal(team, player)} ${t("roster.sppEarned")}`;
        const available = card.querySelector("[data-player-available-spp]");
        if (available) available.textContent = `${playerAvailableSpp(team, player)} ${t("roster.sppAvailable")}`;
        const nextAdvancement = card.querySelector("[data-player-next-advancement]");
        const nextRank = advancementRanks[playerAdvancementLevel(player)];
        if (nextAdvancement && nextRank) {
          nextAdvancement.textContent = `${t("roster.next")}: ${nextRank.rank}, ${playerAvailableSpp(team, player)} ${t("roster.sppAvailable")}`;
        }
        const rosterTotal = view.querySelector("[data-total-spp-display]");
        if (rosterTotal) rosterTotal.textContent = `${rosterTotalSpp(team, draft)} SPP`;
        autosave();
      });
    });
    card.querySelectorAll("[data-saved-stat]").forEach((button) => {
      button.addEventListener("click", () => {
      const stat = button.dataset.savedStat;
      const delta = Number(button.dataset.savedStatDelta);
      player.statMods ??= {};
      player.statMods[stat] = clamp(countToNumber(player.statMods[stat]) + delta, -10, 10);
      rerender();
    });
  });
    card.querySelector("[data-saved-player-add-skill]")?.addEventListener("click", () => {
      const input = card.querySelector("[data-saved-player-skill]");
      const row = rowsForTeam(team)[player.rowIndex];
      const typed = String(input?.value || "").trim();
      const option = availableSkillOptionsForPlayer(row, player)
        .find((item) => item.name.toLowerCase() === typed.toLowerCase());
      if (!option) {
        if (input) input.value = "";
        return;
      }
      player.extraSkills ??= [];
      if (player.extraSkills.some((skill) => skill.name === option.name)) return;
      player.extraSkills.push({ name: option.name, access: option.access });
      player.extraSkills = normalizePlayerExtraSkills(row, player.extraSkills);
      rerender();
    });
    card.querySelectorAll("[data-saved-player-remove-skill]").forEach((button) => {
      button.addEventListener("click", () => {
        player.extraSkills = (player.extraSkills ?? []).filter((skill) => skill.name !== button.dataset.savedPlayerRemoveSkill);
        rerender();
      });
    });
    card.querySelector("[data-saved-player-add-advancement]")?.addEventListener("click", () => {
      const type = card.querySelector("[data-saved-player-advancement-type]")?.value ?? "primary";
      const cost = nextAdvancementCost(player, type);
      if (!cost || playerAvailableSpp(team, player) < cost) return;
      player.advancements = normalizePlayerAdvancements(player.advancements);
      player.advancements.push({ type });
      rerender();
    });
    card.querySelectorAll("[data-saved-player-remove-advancement]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.savedPlayerRemoveAdvancement);
        player.advancements = normalizePlayerAdvancements(player.advancements)
          .filter((_advancement, advancementIndex) => advancementIndex !== index);
        rerender();
      });
    });
  });
  view.querySelectorAll("[data-remove-saved-player]").forEach((button) => {
    button.addEventListener("click", () => {
      const removed = draft.players.find((player) => player.id === button.dataset.removeSavedPlayer);
      if (removed?.purchased) {
        const row = rowsForTeam(team)[removed.rowIndex];
        refundTreasury(draft, costToNumber(rowCost(row)));
      }
      draft.players = draft.players.filter((player) => player.id !== button.dataset.removeSavedPlayer);
      syncRosterCountsFromPlayers(draft);
      rerender();
    });
  });
}

function wireSlotPlayerEditors(team, draft, rerender) {
  view.querySelectorAll("[data-slot-player]").forEach((card) => {
    const slotIndex = Number(card.dataset.slotPlayer);
    const slot = draft.slots?.[slotIndex];
    if (!slot) return;

    card.querySelector("[data-slot-player-name]")?.addEventListener("input", (event) => {
      slot.name = event.currentTarget.value;
    });
    card.querySelector("[data-slot-skip-next]")?.addEventListener("change", (event) => {
      slot.skipNextGame = event.currentTarget.checked;
      rerender();
    });
    card.querySelectorAll("[data-slot-stat]").forEach((button) => {
      button.addEventListener("click", () => {
        const stat = button.dataset.slotStat;
        const delta = Number(button.dataset.slotStatDelta);
        slot.statMods ??= {};
        slot.statMods[stat] = clamp((slot.statMods[stat] ?? 0) + delta, -10, 10);
        rerender();
      });
    });
    card.querySelector("[data-slot-add-skill]")?.addEventListener("click", () => {
      const select = card.querySelector("[data-slot-skill]");
      const skill = select?.value;
      slot.extraSkills ??= [];
      if (!skill || slot.extraSkills.includes(skill)) return;
      slot.extraSkills.push(skill);
      rerender();
    });
    card.querySelectorAll("[data-slot-remove-skill]").forEach((button) => {
      button.addEventListener("click", () => {
        slot.extraSkills = (slot.extraSkills ?? []).filter((skill) => skill !== button.dataset.slotRemoveSkill);
        rerender();
      });
    });
  });
}

function autosaveStatusFor(teamId) {
  return savedRosterAutosaves.get(teamId) ?? {
    revision: 0,
    timer: null,
    message: t("roster.autosaveDefaultMessage"),
    status: "idle",
  };
}

function setAutosaveStatus(teamId, message, status = "idle") {
  const current = autosaveStatusFor(teamId);
  savedRosterAutosaves.set(teamId, {
    ...current,
    message,
    status,
  });
  const node = view.querySelector("[data-autosave-status]");
  if (node) {
    node.textContent = message;
    node.dataset.status = status;
  }
}

function scheduleSavedRosterAutosave(teamId) {
  if (!teamId) return;
  const current = autosaveStatusFor(teamId);
  if (current.timer) clearTimeout(current.timer);
  const revision = current.revision + 1;
  const next = {
    ...current,
    revision,
    message: t("roster.savingStatus"),
    status: "saving",
  };
  next.timer = setTimeout(() => runSavedRosterAutosave(teamId, revision), autosaveDelayMs);
  savedRosterAutosaves.set(teamId, next);
  setAutosaveStatus(teamId, t("roster.savingStatus"), "saving");
}

async function runSavedRosterAutosave(teamId, revision) {
  const current = autosaveStatusFor(teamId);
  if (current.revision !== revision) return;
  const savedTeam = state.myTeams.items.find((item) => item.id === teamId);
  if (!savedTeam) return;
  const draft = normalizeSavedRoster(savedTeam);
  const team = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? state.data.teams[0];
  if (!team) return;
  ensureDraftPlayers(team, draft);
  await saveSavedRoster(savedTeam, team, draft, { quiet: true, revision });
}

async function saveSavedRoster(savedTeam, team, draft, options = {}) {
  syncRosterCountsFromPlayers(draft);
  updateSavedRosterFields(savedTeam, draft);
  const request = {
    name: draft.teamName || team.title,
    baseTeamSlug: draft.teamSlug || team.slug,
    logoData: draft.logoData || "",
    roster: draft,
  };
  try {
    const result = await apiRequest(`/api/teams/${savedTeam.id}`, {
      method: "PATCH",
      body: JSON.stringify(request),
    });
    const autosaveState = autosaveStatusFor(savedTeam.id);
    const canApplyResult = !options.revision || autosaveState.revision === options.revision;
    if (canApplyResult) {
      const index = state.myTeams.items.findIndex((item) => item.id === savedTeam.id);
      Object.assign(savedTeam, result.team);
      if (index >= 0) {
        Object.assign(state.myTeams.items[index], savedTeam);
      }
    }
    if (options.quiet) {
      if (canApplyResult) setAutosaveStatus(savedTeam.id, t("roster.autosavedStatus"), "saved");
    } else {
      setAutosaveStatus(savedTeam.id, t("roster.savedStatus"), "saved");
      const button = view.querySelector("[data-save-roster]");
      if (button) {
        button.textContent = t("roster.savedStatus");
        setTimeout(() => { button.textContent = t("roster.saveChanges"); }, 1200);
      }
    }
  } catch (error) {
    if (options.quiet) {
      setAutosaveStatus(savedTeam.id, t("roster.autosaveFailedStatus"), "error");
    } else {
      alert(error.message);
    }
  }
}

async function copySavedRoster(team, draft) {
  await navigator.clipboard.writeText(buildRosterTextForDraft(team, draft));
  const button = view.querySelector("[data-copy-saved-roster]");
  if (button) {
    button.textContent = t("roster.copiedStatus");
    setTimeout(() => { button.textContent = t("roster.copyRoster"); }, 1200);
  }
}

function renderBuilder() {
  setActiveNav("builder");
  setViewSection("teams");
  const teams = state.data.teams;
  if (state.builder.editingTeamId) {
    resetBuilderForTeam(teams[0]);
  }
  if (!state.builder.teamSlug && teams[0]) {
    state.builder.teamSlug = teams[0].slug;
    state.builder.teamName = teams[0].title;
  }
  const team = teams.find((item) => item.slug === state.builder.teamSlug) ?? teams[0];
  ensureDraftLeagueChoice(team, state.builder);
  ensureDraftPlayers(team, state.builder);
  const costs = calculateBuilderCosts(team);
  const warnings = builderWarnings(team, costs);

  view.innerHTML = `
    ${renderHeader(t("nav.builder"), t("builder.subtitle"))}
    ${renderBuilderSummary(team, costs, warnings)}
    <div class="builder-layout builder-layout-main">
      <section class="builder-panel">
        <div class="builder-form">
          <label class="filter-field">
            <span>${t("sidebar.teamHeading")}</span>
            <select data-builder-team>
              ${teams.map((item) => renderOption(item.slug, item.title, team.slug)).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>${t("savedRoster.teamName")}</span>
            <input type="text" value="${escapeHtml(state.builder.teamName || team.title)}" data-builder-name>
          </label>
          <label class="filter-field">
            <span>${t("savedRoster.logoField")}</span>
            <input type="file" accept="image/*" data-builder-logo>
          </label>
          <label class="filter-field">
            <span>${t("savedRoster.startingRerolls")}</span>
            <div class="inline-stepper-control">
              <button class="filter-button" type="button" data-builder-reroll="-1" ${state.builder.startingRerolls <= 0 ? "disabled" : ""}>-</button>
              <strong>${state.builder.startingRerolls}</strong>
              <button class="filter-button" type="button" data-builder-reroll="1" ${costs.total + builderStaffCosts.startingRerolls > 600 ? "disabled" : ""}>+</button>
            </div>
          </label>
        </div>
        ${state.builder.logoData ? `
          <div class="builder-logo-inline">
            <img class="builder-logo-preview" src="${escapeHtml(state.builder.logoData)}" alt="">
            <button class="filter-button compact-action" type="button" data-builder-remove-logo>${t("savedRoster.removeLogo")}</button>
          </div>
        ` : ""}

        <div class="builder-addons compact-addons">
          ${renderBuilderStaffControl("dedicatedFans", t("savedRoster.dedicatedFans"), state.builder.dedicatedFans, costs.total + builderStaffCosts.dedicatedFans > 600)}
          ${renderBuilderStaffControl("assistantCoaches", t("savedRoster.assistantCoaches"), state.builder.assistantCoaches, costs.total + builderStaffCosts.assistantCoaches > 600)}
          ${renderBuilderStaffControl("cheerleaders", t("savedRoster.cheerleaders"), state.builder.cheerleaders, costs.total + builderStaffCosts.cheerleaders > 600)}
        </div>
        ${renderTeamRuleAccess(team, state.builder, "builder")}

        <section class="builder-pool">
          <h2>${t("builder.availablePlayers")}</h2>
          ${renderAvailablePlayerTable(team, state.builder, true)}
        </section>

        <section class="builder-selected">
          <h2>${t("savedRoster.rosterHeading")}</h2>
          ${renderBuilderPlayerList(team, state.builder)}
        </section>
      </section>
    </div>
  `;
  wireBuilder(team);
}

function renderBuilderSummary(team, costs, warnings) {
  return `
    <aside class="builder-summary builder-summary-horizontal side-panel">
      <div class="summary-title-block">
        <h3>${t("savedRoster.summaryTitle")}</h3>
        <a class="builder-team-link" href="${pageUrl(team)}">${escapeHtml(team.title)}</a>
      </div>
      <dl class="stat-list summary-stat-grid">
        <dt>${t("myTeams.table.players")}</dt><dd>${costs.totalPlayersCount}</dd>
        <dt>${t("savedRoster.dedicatedFans")}</dt><dd>${countToNumber(state.builder.dedicatedFans)}</dd>
        <dt>${t("savedRoster.playersCost")}</dt><dd>${costs.playersCost}k</dd>
        <dt>${t("savedRoster.staffCost")}</dt><dd>${costs.staffCost}k</dd>
        <dt>${t("roster.totalCost")}</dt><dd>${costs.total}k</dd>
        <dt>${t("builder.remaining")}</dt><dd class="${costs.remaining < 0 ? "danger-text" : ""}">${costs.remaining}k</dd>
      </dl>
      <div class="summary-state-block">
        ${warnings.length ? `<div class="builder-warnings">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : `<div class="builder-ok">${t("savedRoster.withinLimits")}</div>`}
        <div class="summary-actions">
          <button class="primary-button" type="button" data-save-team ${costs.total > 600 || !state.builder.players.length ? "disabled" : ""}>${t("builder.saveTeam")}</button>
          <button class="primary-button" type="button" data-copy-roster>${t("roster.copyRoster")}</button>
        </div>
      </div>
    </aside>
  `;
}

function renderAvailablePlayerTable(team, draft, enforceBudget = false) {
  const costs = calculateRosterCosts(team, draft, { includeDedicatedFans: enforceBudget });
  return `
    <div class="table-scroll builder-table-scroll">
      <table class="builder-table compact-roster-table">
        <thead>
          <tr>
            <th>${t("roster.qtyHeader")}</th>
            <th>${t("roster.positionHeader")}</th>
            <th>${t("stats.ma")}</th>
            <th>${t("stats.st")}</th>
            <th>${t("stats.ag")}</th>
            <th>${t("stats.pa")}</th>
            <th>${t("stats.ar")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("roster.primary")}</th>
            <th>${t("roster.secondary")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t("builder.selectedHeader")}</th>
            <th>${t("common.add")}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsForTeam(team).map((row, rowIndex) => {
    const baseCost = costToNumber(rowCost(row));
    const positionFull = !canAddRowToDraft(row, rowIndex, draft, true);
    const budgetBlocked = enforceBudget && costs.total + baseCost > 600;
    const disabled = positionFull || budgetBlocked;
    const current = rowCountInPlayers(draft, rowIndex);
    return `
      <tr class="${disabled ? "disabled-row" : ""}">
        <td>${escapeHtml(row.qty || "-")}</td>
        <td><strong>${escapeHtml(row.position)}</strong></td>
        ${renderRosterStatCells(row)}
        <td class="skills-cell">${renderRosterLinks(row.skills)}</td>
        <td>${renderAccessCell(row.primary)}</td>
        <td>${renderAccessCell(row.secondary)}</td>
        <td>${escapeHtml(rowCost(row) || "-")}</td>
        <td>${current}/${rosterMax(row.qty)}${budgetBlocked ? `<span class="danger-text"> ${t("builder.overBudget")}</span>` : ""}</td>
        <td>
          <button class="primary-button table-plus-button" type="button" data-add-row="${rowIndex}" ${disabled ? "disabled" : ""}>+</button>
        </td>
      </tr>
    `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBuilderStaffControl(key, title, value, plusBlocked = false) {
  const max = builderStaffMaximums[key] ?? 6;
  const current = countToNumber(value);
  return `
    <div class="builder-addon compact-staff-control">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${t("roster.tenKEach")}</span>
      </div>
      <div class="inline-stepper-control">
        <button class="filter-button" type="button" data-builder-staff="${key}" data-builder-staff-step="-1" ${current <= 0 ? "disabled" : ""}>-</button>
        <strong>${current}</strong>
        <button class="filter-button" type="button" data-builder-staff="${key}" data-builder-staff-step="1" ${current >= max || plusBlocked ? "disabled" : ""}>+</button>
      </div>
    </div>
  `;
}

function renderPlainSkillPills(items = []) {
  if (!items.length) return `<span class="muted-text">-</span>`;
  return items.map((item) => `<span class="roster-pill">${escapeHtml(item)}</span>`).join("");
}

function renderAccessCell(values = []) {
  const access = parseAccessCodes(values).join(" ");
  return escapeHtml(access || "-");
}

function renderRosterStatCells(row) {
  return ["ma", "st", "ag", "pa", "ar"]
    .map((stat) => `<td class="stat-table-cell">${escapeHtml(row[stat] || "-")}</td>`)
    .join("");
}

function renderPlayerStatCells(player) {
  return ["ma", "st", "ag", "pa", "ar"]
    .map((stat) => {
      const value = statValueForDisplayByStat(stat, player.row[stat], player.statMods?.[stat] ?? 0);
      return `<td class="stat-table-cell">${escapeHtml(value)}</td>`;
    })
    .join("");
}

function renderEditablePlayerStatCells(player) {
  return ["ma", "st", "ag", "pa", "ar"]
    .map((stat) => {
      const mod = Number(player.statMods?.[stat] ?? 0);
      const modClass = mod > 0 ? "stat-up" : mod < 0 ? "stat-down" : "";
      const value = statValueForDisplayByStat(stat, player.row[stat], mod);
      return `
        <td class="stat-table-cell ${modClass}">
          <div class="table-stat-control">
            <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="-1">-</button>
            <strong>${escapeHtml(value)}</strong>
            <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="1">+</button>
          </div>
        </td>
      `;
    })
    .join("");
}

function renderBuilderPlayerList(team, draft) {
  const players = selectedRosterPlayers(team, draft);
  if (!players.length) {
    return `<div class="builder-empty-roster">${t("builder.emptyRosterHint")}</div>`;
  }
  return `
    <div class="table-scroll builder-table-scroll">
      <table class="builder-selected-table compact-roster-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${t("roster.nameHeader")}</th>
            <th>${t("roster.positionHeader")}</th>
            <th>${t("stats.ma")}</th>
            <th>${t("stats.st")}</th>
            <th>${t("stats.ag")}</th>
            <th>${t("stats.pa")}</th>
            <th>${t("stats.ar")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t("roster.actionHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player, index) => renderBuilderPlayerRow(player, index)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBuilderPlayerRow(player, index) {
  return `
    <tr>
      <td>${index + 1}</td>
      <td>
        <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-builder-player-name="${escapeHtml(player.id)}">
      </td>
      <td><strong>${escapeHtml(player.row.position)}</strong></td>
      ${renderPlayerStatCells(player)}
      <td class="skills-cell">${renderRosterLinks(player.row.skills)}</td>
      <td>${escapeHtml(rowCost(player.row) || "-")}</td>
      <td><button class="filter-button compact-action" type="button" data-remove-player="${escapeHtml(player.id)}">${t("common.remove")}</button></td>
    </tr>
  `;
}

function renderSavedPlayerList(team, draft) {
  const players = selectedRosterPlayers(team, draft);
  if (!players.length) {
    return `<div class="builder-empty-roster">${t("savedRoster.noPlayersYet")}</div>`;
  }
  return `
    <div class="table-scroll builder-table-scroll saved-roster-table-wrap">
      <table class="saved-roster-table compact-roster-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${t("roster.nameHeader")}</th>
            <th>${t("roster.positionHeader")}</th>
            <th>${t("stats.ma")}</th>
            <th>${t("stats.st")}</th>
            <th>${t("stats.ag")}</th>
            <th>${t("stats.pa")}</th>
            <th>${t("stats.ar")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("roster.addSkillHeader")}</th>
            <th>${t("roster.skipHeader")}</th>
            <th>${t("roster.niglingInjury")}</th>
            <th>SPP</th>
            <th>${t("roster.levelHeader")}</th>
            <th>${t("roster.advancementHeader")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t("roster.actionHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player, index) => renderSavedPlayerRow(team, player, index)).join("")}
        </tbody>
      </table>
    </div>
    <div class="saved-roster-mobile-list">
      ${players.map((player, index) => renderSavedPlayerCard(team, player, index)).join("")}
    </div>
  `;
}

function renderSavedNewPlayerTable(team, draft) {
  return `
    <div class="table-scroll builder-table-scroll">
      <table class="builder-table compact-roster-table add-player-table">
        <thead>
          <tr>
            <th>${t("roster.qtyHeader")}</th>
            <th>${t("roster.positionHeader")}</th>
            <th>${t("stats.ma")}</th>
            <th>${t("stats.st")}</th>
            <th>${t("stats.ag")}</th>
            <th>${t("stats.pa")}</th>
            <th>${t("stats.ar")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("roster.primary")}</th>
            <th>${t("roster.secondary")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t("savedRoster.rosterHeading")}</th>
            <th>${t("common.add")}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsForTeam(team).map((row, rowIndex) => {
    const current = rowCountInPlayers(draft, rowIndex);
    return `
      <tr>
        <td>${escapeHtml(row.qty || "-")}</td>
        <td><strong>${escapeHtml(row.position)}</strong></td>
        ${renderRosterStatCells(row)}
        <td class="skills-cell">${renderRosterLinks(row.skills)}</td>
        <td>${renderAccessCell(row.primary)}</td>
        <td>${renderAccessCell(row.secondary)}</td>
        <td>${escapeHtml(rowCost(row) || "-")}</td>
        <td>${current}/${rosterMax(row.qty)}</td>
        <td>
          <button class="primary-button table-plus-button" type="button" data-add-saved-row="${rowIndex}">+</button>
        </td>
      </tr>
    `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSavedPlayerRow(team, player, index) {
  const extraSkills = normalizePlayerExtraSkills(player.row, player.extraSkills ?? []);
  const adjustment = playerAdjustmentCost(player);
  const eliteCost = eliteComboCost(player.row, player);
  const skillInputId = `skill-options-${index}`;
  const skillOptions = availableSkillOptionsForPlayer(player.row, player);
  return `
    <tr data-roster-player="${escapeHtml(player.id)}">
      <td>${index + 1}</td>
      <td>
        <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-saved-player-name>
      </td>
      <td><strong>${escapeHtml(player.row.position)}</strong></td>
      ${renderEditablePlayerStatCells(player)}
      <td class="skills-cell">
        ${renderRosterLinks(player.row.skills)}
        ${extraSkills.length ? `
          <div class="player-extra-skills table-extra-skills">
            ${extraSkills.map((skill) => `
              <button class="roster-pill" type="button" data-saved-player-remove-skill="${escapeHtml(skill.name)}">${escapeHtml(`${skill.name} x`)}</button>
            `).join("")}
          </div>
        ` : ""}
        ${eliteCost ? `<p class="cost-note">${t("roster.eliteCombo")} +${eliteCost}k</p>` : ""}
      </td>
      <td>
        <div class="table-skill-editor">
          <input class="table-input" type="text" list="${escapeHtml(skillInputId)}" placeholder="${t("roster.skillPlaceholder")}" data-saved-player-skill>
          <datalist id="${escapeHtml(skillInputId)}">
            ${skillOptions.map((option) => `
              <option value="${escapeHtml(option.name)}" label="${escapeHtml(option.access === "secondary" ? t("roster.secondary") : t("roster.primary"))}"></option>
            `).join("")}
          </datalist>
          <button class="filter-button compact-action" type="button" data-saved-player-add-skill>${t("common.add")}</button>
        </div>
      </td>
      <td>
        <label class="table-checkbox" title="${t("roster.skipNextGame")}">
          <input type="checkbox" data-saved-player-skip ${player.skipNextGame ? "checked" : ""}>
          <span>${t("roster.skipHeader")}</span>
        </label>
      </td>
      <td>
        <label class="table-checkbox" title="${t("roster.niglingInjury")}">
          <input type="checkbox" data-saved-player-nigling ${player.niglingInjury ? "checked" : ""}>
          <span>${t("roster.niglingInjury")}</span>
        </label>
      </td>
      <td class="spp-cell">${renderPlayerSppControls(team, player)}</td>
      <td class="level-cell">${renderPlayerLevelCell(team, player)}</td>
      <td class="advancement-cell">${renderPlayerAdvancementControls(team, player)}</td>
      <td>${escapeHtml(rowCost(player.row) || "-")}${adjustment ? `<span class="cost-note inline-cost-note">${adjustment > 0 ? "+" : ""}${adjustment}k</span>` : ""}</td>
      <td><button class="filter-button compact-action" type="button" data-remove-saved-player="${escapeHtml(player.id)}">${t("common.remove")}</button></td>
    </tr>
  `;
}

function renderSavedPlayerCard(team, player, index) {
  const extraSkills = normalizePlayerExtraSkills(player.row, player.extraSkills ?? []);
  const adjustment = playerAdjustmentCost(player);
  const eliteCost = eliteComboCost(player.row, player);
  const skillInputId = `mobile-skill-options-${index}`;
  const skillOptions = availableSkillOptionsForPlayer(player.row, player);
  return `
    <article class="saved-roster-player-card mobile-roster-player-card" data-roster-player="${escapeHtml(player.id)}">
      <header>
        <div class="mobile-player-title">
          <span>#${index + 1}</span>
          <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-saved-player-name>
          <small>${escapeHtml(player.row.position)} · ${escapeHtml(rowCost(player.row) || "-")}${adjustment ? ` · ${adjustment > 0 ? "+" : ""}${adjustment}k` : ""}</small>
        </div>
        <button class="filter-button compact-action" type="button" data-remove-saved-player="${escapeHtml(player.id)}">${t("common.remove")}</button>
      </header>

      <section class="mobile-player-section">
        <h3>${t("roster.statsHeading")}</h3>
        ${renderEditableStatLine(player)}
      </section>

      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">
          ${renderRosterLinks(player.row.skills)}
          ${extraSkills.map((skill) => `
            <button class="roster-pill" type="button" data-saved-player-remove-skill="${escapeHtml(skill.name)}">${escapeHtml(`${skill.name} x`)}</button>
          `).join("")}
        </div>
        ${eliteCost ? `<p class="cost-note">${t("roster.eliteCombo")} +${eliteCost}k</p>` : ""}
        <div class="table-skill-editor mobile-skill-editor">
          <input class="table-input" type="text" list="${escapeHtml(skillInputId)}" placeholder="${t("roster.skillPlaceholder")}" data-saved-player-skill>
          <datalist id="${escapeHtml(skillInputId)}">
            ${skillOptions.map((option) => `
              <option value="${escapeHtml(option.name)}" label="${escapeHtml(option.access === "secondary" ? t("roster.secondary") : t("roster.primary"))}"></option>
            `).join("")}
          </datalist>
          <button class="filter-button compact-action" type="button" data-saved-player-add-skill>${t("common.add")}</button>
        </div>
      </section>

      <section class="mobile-player-section mobile-player-checks">
        <label class="table-checkbox" title="${t("roster.skipNextGame")}">
          <input type="checkbox" data-saved-player-skip ${player.skipNextGame ? "checked" : ""}>
          <span>${t("roster.skipNextGame")}</span>
        </label>
        <label class="table-checkbox" title="${t("roster.niglingInjury")}">
          <input type="checkbox" data-saved-player-nigling ${player.niglingInjury ? "checked" : ""}>
          <span>${t("roster.niglingInjury")}</span>
        </label>
      </section>

      <section class="mobile-player-section">
        <h3>SPP</h3>
        ${renderPlayerSppControls(team, player)}
      </section>

      <section class="mobile-player-section mobile-advancement-section">
        <div>
          <h3>${t("roster.levelHeader")}</h3>
          ${renderPlayerLevelCell(team, player)}
        </div>
        <div>
          <h3>${t("roster.advancementHeader")}</h3>
          ${renderPlayerAdvancementControls(team, player)}
        </div>
      </section>
    </article>
  `;
}

function renderPlayerSppControls(team, player) {
  const spp = normalizeSppCounters(player.spp);
  return `
    <div class="spp-counter-grid">
      ${sppCounterDefinitions.map(([key, label]) => `
        <label class="spp-counter-field">
          <span>${escapeHtml(label)}</span>
          <input type="number" min="0" step="1" value="${spp[key]}" data-saved-player-spp="${key}">
        </label>
      `).join("")}
    </div>
    <strong class="spp-total" data-player-spp-total>${playerSppTotal(team, player)} ${t("roster.sppEarned")}</strong>
  `;
}

function renderPlayerLevelCell(team, player) {
  const level = playerAdvancementLevel(player);
  return `
    <div class="player-level-stack">
      <strong>${level}</strong>
      <span>${escapeHtml(playerLevelRank(player))}</span>
      <small data-player-spent-spp>${playerAdvancementSpent(player)} ${t("roster.sppSpent")}</small>
      <small data-player-available-spp>${playerAvailableSpp(team, player)} ${t("roster.sppAvailable")}</small>
    </div>
  `;
}

function renderPlayerAdvancementControls(team, player) {
  const advancements = normalizePlayerAdvancements(player.advancements);
  const level = playerAdvancementLevel(player);
  const nextRank = advancementRanks[level];
  const available = playerAvailableSpp(team, player);
  const canAdvance = Boolean(nextRank);
  return `
    <div class="advancement-control">
      ${canAdvance ? `
        <div class="advancement-add-row">
          <select class="table-select" data-saved-player-advancement-type>
            ${Object.entries(advancementTypeLabels).map(([type, label]) => `
              <option value="${type}">${escapeHtml(`${label} (${nextRank.costs[type]} SPP)`)}</option>
            `).join("")}
          </select>
          <button class="filter-button compact-action" type="button" data-saved-player-add-advancement>${t("common.add")}</button>
        </div>
        <small class="advancement-next" data-player-next-advancement>${t("roster.next")}: ${escapeHtml(nextRank.rank)}, ${available} ${t("roster.sppAvailable")}</small>
      ` : `<span class="muted-text">${t("roster.maxLevel")}</span>`}
      <div class="advancement-list">
        ${advancements.length ? advancements.map((advancement, index) => {
    const cost = advancementRanks[index]?.costs?.[advancement.type] ?? 0;
    const label = advancementTypeLabels[advancement.type] ?? advancement.type;
    return `
            <button class="roster-pill advancement-pill" type="button" data-saved-player-remove-advancement="${index}">
              ${escapeHtml(`${index + 1}. ${label}: ${cost} SPP x`)}
            </button>
          `;
  }).join("") : `<span class="muted-text">${t("roster.noAdvancementsYet")}</span>`}
      </div>
    </div>
  `;
}

function renderEditableStatLine(player) {
  const stats = ["ma", "st", "ag", "pa", "ar"];
  return `
    <div class="player-stat-editors editable-stat-line">
      ${stats.map((stat) => {
        const mod = Number(player.statMods?.[stat] ?? 0);
        const modClass = mod > 0 ? "stat-up" : mod < 0 ? "stat-down" : "";
        return `
          <div class="player-stat-editor ${modClass}">
            <span>${stat.toUpperCase()}</span>
            <strong>${escapeHtml(statValueForDisplayByStat(stat, player.row[stat], mod))}</strong>
            <div class="mini-stepper">
              <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="-1">-</button>
              <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="1">+</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderAddon(key, title, description, max, value, cost, disabled = false) {
  const current = disabled ? 0 : value;
  return `
    <div class="builder-addon ${disabled ? "disabled" : ""}">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(disabled ? t("roster.notAvailableForTeam") : description)}</span>
      </div>
      ${renderStepper(`builder-addon-${key}`, current, 0, max, disabled || !cost)}
    </div>
  `;
}

function renderBuilderRow(row, index) {
  const value = state.builder.roster[index] ?? 0;
  const max = rosterMax(row.qty);
  return `
    <div class="builder-row">
      <div class="builder-row-body">
        <div class="builder-row-main">
          <div class="builder-row-head">
            <strong>${escapeHtml(row.position)}</strong>
            <span>${escapeHtml([row.qty, rowCost(row)].filter(Boolean).join(" · "))}</span>
          </div>
          ${renderRosterStatGrid(row)}
          <div class="builder-row-skills">
            ${renderRosterLinks(row.skills)}
          </div>
        </div>
      </div>
      ${renderStepper(`builder-row-${index}`, value, 0, max)}
    </div>
  `;
}

function selectedBuilderRows(team) {
  return selectedRosterRows(team, state.builder);
}

function selectedRosterRows(team, draft) {
  return rowsForTeam(team)
    .map((row, index) => ({ row, count: draft.roster[index] ?? 0 }))
    .filter((item) => item.count > 0);
}

function playerKey(rowIndex, copyIndex) {
  return `${rowIndex}-${copyIndex}`;
}

function selectedBuilderPlayers(team) {
  return selectedRosterPlayers(team, state.builder);
}

function selectedRosterPlayers(team, draft) {
  if (Array.isArray(draft.players)) {
    return draft.players
      .map((player, index) => rosterPlayerView(team, player, index))
      .filter(Boolean);
  }
  if (Array.isArray(draft.slots)) {
    return draft.slots
      .map((slot, slotIndex) => slotPlayerFromDraft(team, slot, slotIndex))
      .filter(Boolean);
  }
  return rowsForTeam(team).flatMap((row, rowIndex) => {
    const count = draft.roster[rowIndex] ?? 0;
    return Array.from({ length: count }, (_item, copyIndex) => {
      const key = playerKey(rowIndex, copyIndex);
      const edit = draft.playerEdits[key] ?? {};
      return {
        key,
        rowIndex,
        copyIndex,
        row,
        name: edit.name ?? `${row.position} ${copyIndex + 1}`,
        stats: {
          ma: Number(row.ma) + (edit.statMods?.ma ?? 0),
          st: Number(row.st) + (edit.statMods?.st ?? 0),
          ag: row.ag,
          pa: row.pa,
          ar: row.ar,
        },
        statMods: edit.statMods ?? {},
        extraSkills: edit.extraSkills ?? [],
        skipNextGame: Boolean(edit.skipNextGame),
      };
    });
  });
}

function ensurePlayerEdit(draft, key, row) {
  draft.playerEdits[key] ??= {
    name: "",
    statMods: {},
    extraSkills: [],
    skipNextGame: false,
  };
  if (!draft.playerEdits[key].name) {
    const copyIndex = Number(key.split("-")[1] ?? 0);
    draft.playerEdits[key].name = `${row.position} ${copyIndex + 1}`;
  }
  draft.playerEdits[key].statMods ??= {};
  draft.playerEdits[key].extraSkills ??= [];
  draft.playerEdits[key].skipNextGame = Boolean(draft.playerEdits[key].skipNextGame);
  return draft.playerEdits[key];
}

function statValueForDisplay(base, mod = 0) {
  if (base === "-" || base === "") return base || "-";
  const match = String(base).match(/^(\d+)(\+)?$/);
  if (!match) return base;
  const next = Number(match[1]) + mod;
  return `${Math.max(1, next)}${match[2] ?? ""}`;
}

function availableSkillsForRow(row) {
  const access = [...(row.primary ?? []), ...(row.secondary ?? [])].join(" ");
  const categories = [...new Set(access.split(/\s+/).map((code) => skillAccessMap[code]).filter(Boolean))];
  const baseSkills = new Set(row.skills ?? []);
  return (state.data.skillGroups ?? [])
    .filter((group) => categories.includes(group.category))
    .flatMap((group) => group.skills ?? [])
    .filter((skill) => !baseSkills.has(skill))
    .sort((a, b) => a.localeCompare(b, "en"));
}

function renderBuilderSummaryRoster(team) {
  return renderEditableRosterPlayers(team, state.builder, "builder");
}

function renderEditableRosterPlayers(team, draft, mode) {
  const selected = selectedRosterPlayers(team, draft);
  if (!selected.length) {
    return `<div class="builder-empty-roster">${t("builder.noPlayersSelected")}</div>`;
  }

  return `
    <div class="builder-summary-roster">
      ${selected.map((player) => `
        <article class="builder-summary-player">
          <header>
            <strong>${escapeHtml(player.name)}</strong>
            <span>${escapeHtml(rowCost(player.row) || "-")}</span>
          </header>
          ${renderEditablePlayer(player, mode)}
          <div class="builder-summary-skills">
            ${renderRosterLinks([...(player.row.skills ?? []), ...player.extraSkills])}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderEditablePlayer(player, mode = "builder") {
  const editableStats = ["ma", "st", "ag", "pa", "ar"];
  const options = availableSkillsForRow(player.row).filter((skill) => !player.extraSkills.includes(skill));
  return `
    <div class="player-editor" data-player="${escapeHtml(player.key)}" data-row-index="${player.rowIndex}" data-editor-mode="${escapeHtml(mode)}">
      <label class="filter-field compact-field">
        <span>${t("roster.playerName")}</span>
        <input type="text" value="${escapeHtml(player.name)}" data-player-name>
      </label>
      <label class="checkbox-field skip-next-field">
        <input type="checkbox" data-player-skip-next ${player.skipNextGame ? "checked" : ""}>
        <span>${t("roster.skipNextGame")}</span>
      </label>
      <div class="player-stat-editors">
        ${editableStats.map((stat) => {
          const mod = player.statMods[stat] ?? 0;
          const value = statValueForDisplay(player.row[stat], mod);
          return `
            <div class="player-stat-editor">
              <span>${stat.toUpperCase()}</span>
              <strong>${escapeHtml(value)}</strong>
              <div class="mini-stepper">
                <button type="button" data-player-stat="${stat}" data-player-stat-delta="-1">-</button>
                <button type="button" data-player-stat="${stat}" data-player-stat-delta="1">+</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="player-skill-editor">
        <select data-player-skill>
          <option value="">${t("roster.addSkillOption")}</option>
          ${options.map((skill) => renderOption(skill, skill, "")).join("")}
        </select>
        <button class="filter-button" type="button" data-player-add-skill>${t("common.add")}</button>
      </div>
      ${player.extraSkills.length ? `
        <div class="player-extra-skills">
          ${player.extraSkills.map((skill) => `
            <button class="roster-pill" type="button" data-player-remove-skill="${escapeHtml(skill)}">${escapeHtml(skill)} x</button>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderStepper(name, value, min, max, disabled = false) {
  return `
    <div class="stepper" data-stepper="${escapeHtml(name)}" data-min="${min}" data-max="${max}">
      <button type="button" data-step="-1" data-builder-step="-1" onclick="this.dispatchEvent(new Event('builderstep',{bubbles:true}))" ${disabled || value <= min ? "disabled" : ""}>-</button>
      <output>${value}</output>
      <button type="button" data-step="1" data-builder-step="1" onclick="this.dispatchEvent(new Event('builderstep',{bubbles:true}))" ${disabled || value >= max ? "disabled" : ""}>+</button>
    </div>
  `;
}

function rosterMax(value = "") {
  const match = String(value).match(/-(\d+)/);
  return match ? Number(match[1]) : 16;
}

function hasBribery(team) {
  return /bribery\s+and\s+corruption/i.test(team.team?.meta?.specialRules ?? "");
}

function calculateBuilderCosts(team) {
  return calculateRosterCosts(team, state.builder, { includeDedicatedFans: true });
}

function staffItemCost(draft, key) {
  return countToNumber(draft[key]) * (builderStaffCosts[key] ?? 0);
}

function spendTreasury(draft, amount) {
  const cost = countToNumber(amount);
  if (!cost) return;
  draft.treasury = countToNumber(draft.treasury) - cost;
}

function refundTreasury(draft, amount) {
  const value = countToNumber(amount);
  if (!value) return;
  draft.treasury = countToNumber(draft.treasury) + value;
}

function markStaffPurchased(draft, key, delta) {
  draft.purchasedStaff ??= {};
  draft.purchasedStaff[key] = Math.max(0, countToNumber(draft.purchasedStaff[key]) + delta);
}

function applyPaidStaffChange(draft, key, previous, next) {
  if (key === "dedicatedFans") return;
  const difference = next - previous;
  const unitCost = builderStaffCosts[key] ?? 0;
  if (!difference || !unitCost) return;

  if (difference > 0) {
    spendTreasury(draft, unitCost * difference);
    markStaffPurchased(draft, key, difference);
    return;
  }

  const refundable = Math.min(Math.abs(difference), countToNumber(draft.purchasedStaff?.[key]));
  if (refundable > 0) {
    refundTreasury(draft, unitCost * refundable);
    markStaffPurchased(draft, key, -refundable);
  }
}

function calculateRosterCosts(team, draft, options = {}) {
  const includeDedicatedFans = Boolean(options.includeDedicatedFans);
  const players = selectedRosterPlayers(team, draft);
  const playersCount = players.filter((player) => !player.skipNextGame).length;
  const playersCost = players.reduce((sum, player) => {
    if (player.skipNextGame) return sum;
    return sum + playerCurrentCost(player.row, player, true);
  }, 0);
  const staffCost = staffItemCost(draft, "startingRerolls")
    + staffItemCost(draft, "teamRerolls")
    + (includeDedicatedFans ? staffItemCost(draft, "dedicatedFans") : 0)
    + staffItemCost(draft, "assistantCoaches")
    + staffItemCost(draft, "cheerleaders");
  const total = playersCost + staffCost;
  return {
    playersCount,
    totalPlayersCount: players.length,
    playersCost,
    staffCost,
    rerollCost: staffCost,
    total,
    remaining: 600 - total,
  };
}

function builderWarnings(team, costs) {
  return rosterWarnings(team, state.builder, costs);
}

function rosterWarnings(team, draft, costs) {
  const warnings = [];
  if (costs.playersCount < 7) warnings.push("A Sevens roster usually needs at least 7 players.");
  if (costs.playersCount > 11) warnings.push("A Sevens roster should not exceed 11 players.");
  rowsForTeam(team).forEach((row, index) => {
    const count = draft.roster[index] ?? 0;
    const minMatch = String(row.qty).match(/^(\d+)-/);
    const min = minMatch ? Number(minMatch[1]) : 0;
    const max = rosterMax(row.qty);
    if (count < min) warnings.push(`${row.position}: minimum is ${min}.`);
    if (count > max) warnings.push(`${row.position}: maximum is ${max}.`);
  });
  return warnings;
}

function wireBuilder(team) {
  view.querySelector("[data-builder-team]")?.addEventListener("change", (event) => {
    state.builder.teamSlug = event.currentTarget.value;
    const nextTeam = state.data.teams.find((item) => item.slug === state.builder.teamSlug);
    resetBuilderForTeam(nextTeam);
    renderBuilder();
  });
  view.querySelector("[data-builder-league]")?.addEventListener("change", (event) => {
    state.builder.selectedLeague = event.currentTarget.value;
  });
  view.querySelector("[data-builder-name]")?.addEventListener("input", (event) => {
    state.builder.teamName = event.currentTarget.value;
  });
  view.querySelector("[data-builder-logo]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo must be 2 MB or smaller.");
      event.currentTarget.value = "";
      return;
    }
    state.builder.logoData = await fileToDataUrl(file);
    renderBuilder();
  });
  view.querySelector("[data-builder-remove-logo]")?.addEventListener("click", () => {
    state.builder.logoData = "";
    renderBuilder();
  });
  view.querySelectorAll("[data-add-row]").forEach((button) => {
    button.addEventListener("click", () => {
      const rowIndex = Number(button.dataset.addRow);
      const row = rowsForTeam(team)[rowIndex];
      if (!row) return;
      const costs = calculateRosterCosts(team, state.builder, { includeDedicatedFans: true });
      if (costs.total + costToNumber(rowCost(row)) > 600) return;
      if (!canAddRowToDraft(row, rowIndex, state.builder, true)) return;
      state.builder.players.push(makeRosterPlayer(row, rowIndex, rowCountInPlayers(state.builder, rowIndex)));
      syncRosterCountsFromPlayers(state.builder);
      renderBuilder();
    });
  });
  view.querySelectorAll("[data-remove-player]").forEach((button) => {
    button.addEventListener("click", () => {
      state.builder.players = state.builder.players.filter((player) => player.id !== button.dataset.removePlayer);
      syncRosterCountsFromPlayers(state.builder);
      renderBuilder();
    });
  });
  view.querySelectorAll("[data-builder-player-name]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const player = state.builder.players.find((item) => item.id === input.dataset.builderPlayerName);
      if (player) player.name = event.currentTarget.value;
    });
  });
  view.querySelectorAll("[data-builder-reroll]").forEach((button) => {
    button.addEventListener("click", () => {
      const delta = Number(button.dataset.builderReroll);
      const next = clamp(countToNumber(state.builder.startingRerolls) + delta, 0, builderStaffMaximums.startingRerolls);
      const previous = countToNumber(state.builder.startingRerolls);
      const projected = calculateRosterCosts(team, { ...state.builder, startingRerolls: next }, { includeDedicatedFans: true }).total;
      if (projected > 600 && next > previous) return;
      state.builder.startingRerolls = next;
      renderBuilder();
    });
  });
  view.querySelectorAll("[data-builder-staff]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.builderStaff;
      const delta = Number(button.dataset.builderStaffStep);
      const max = builderStaffMaximums[key] ?? 6;
      const next = clamp(countToNumber(state.builder[key]) + delta, 0, max);
      const previous = countToNumber(state.builder[key]);
      const projected = calculateRosterCosts(team, { ...state.builder, [key]: next }, { includeDedicatedFans: true }).total;
      if (projected > 600 && next > previous) return;
      state.builder[key] = next;
      renderBuilder();
    });
  });
  view.querySelector("[data-copy-roster]")?.addEventListener("click", () => copyRoster(team));
  view.querySelector("[data-save-team]")?.addEventListener("click", () => saveTeam(team));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function wirePlayerEditors(team, draft, rerender) {
  view.querySelectorAll("[data-player]").forEach((card) => {
    const key = card.dataset.player;
    const rowIndex = Number(card.dataset.rowIndex);
    const row = rowsForTeam(team)[rowIndex];
    if (!key || !row) return;
    const edit = ensurePlayerEdit(draft, key, row);

    card.querySelector("[data-player-name]")?.addEventListener("input", (event) => {
      edit.name = event.currentTarget.value;
    });
    card.querySelector("[data-player-skip-next]")?.addEventListener("change", (event) => {
      edit.skipNextGame = event.currentTarget.checked;
      rerender();
    });

    card.querySelectorAll("[data-player-stat]").forEach((button) => {
      button.addEventListener("click", () => {
        const stat = button.dataset.playerStat;
        const delta = Number(button.dataset.playerStatDelta);
        edit.statMods[stat] = clamp((edit.statMods[stat] ?? 0) + delta, -10, 10);
        rerender();
      });
    });

    card.querySelector("[data-player-add-skill]")?.addEventListener("click", () => {
      const select = card.querySelector("[data-player-skill]");
      const skill = select?.value;
      if (!skill || edit.extraSkills.includes(skill)) return;
      edit.extraSkills.push(skill);
      rerender();
    });

    card.querySelectorAll("[data-player-remove-skill]").forEach((button) => {
      button.addEventListener("click", () => {
        edit.extraSkills = edit.extraSkills.filter((skill) => skill !== button.dataset.playerRemoveSkill);
        rerender();
      });
    });
  });
}

function handleBuilderStepEvent(event) {
  const target = event.target instanceof Element ? event.target : event.target.parentElement;
  const button = target?.closest("button[data-builder-step]");
  if (!button) return;
  const stepper = button.closest("[data-stepper]");
  if (!stepper) return;

  const key = stepper.dataset.stepper;
  const delta = Number(button.dataset.builderStep);
  if (key.startsWith("builder-row-")) {
    const index = key.replace("builder-row-", "");
    const current = state.builder.roster[index] ?? 0;
    state.builder.roster[index] = clamp(current + delta, Number(stepper.dataset.min), Number(stepper.dataset.max));
  } else {
    const addon = key.replace("builder-addon-", "");
    state.builder[addon] = clamp((state.builder[addon] ?? 0) + delta, Number(stepper.dataset.min), Number(stepper.dataset.max));
  }
  renderBuilder();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function copyRoster(team) {
  const lines = buildRosterText(team, state.builder);
  await navigator.clipboard.writeText(lines);
  const button = view.querySelector("[data-copy-roster]");
  if (button) {
    button.textContent = t("roster.copiedStatus");
    setTimeout(() => { button.textContent = t("roster.copyRoster"); }, 1200);
  }
}

async function saveTeam(team) {
  if (!state.auth.currentUser) {
    openAuthModal("login");
    return;
  }
  syncRosterCountsFromPlayers(state.builder);
  const payload = builderPayload(team);
  const startupCosts = calculateRosterCosts(team, state.builder, { includeDedicatedFans: true });
  payload.treasury = Math.max(0, 600 - startupCosts.total);
  const request = {
    name: payload.teamName,
    baseTeamSlug: team.slug,
    logoData: payload.logoData,
    roster: payload,
  };
  try {
    const result = await apiRequest("/api/teams", {
      method: "POST",
      body: JSON.stringify(request),
    });
    state.builder.editingTeamId = result.team.id;
    state.myTeams.loaded = false;
    const button = view.querySelector("[data-save-team]");
    if (button) {
      button.textContent = t("roster.savedStatus");
      setTimeout(() => {
        location.hash = `#/my-teams/${encodeURIComponent(result.team.id)}`;
      }, 700);
    }
  } catch (error) {
    alert(error.message);
  }
}

function buildRosterText(team) {
  return buildRosterTextForDraft(team, state.builder);
}

function buildRosterTextForDraft(team, draft) {
  const selected = selectedRosterPlayers(team, draft);
  const costs = calculateRosterCosts(team, draft);
  const lines = [
    `${draft.teamName || team.title} (${team.title})`,
    draft.selectedLeague ? `League Access: ${draft.selectedLeague}` : "",
    `Total Cost: ${costs.total}k`,
    `Treasury: ${draft.treasury ?? 0}k`,
    `Coach's Safe: ${draft.coachesSafe ?? 0}k`,
    "",
    ...selected.map((player) => [
      `${player.name} (${player.row.position}) - ${rowCost(player.row)}${player.skipNextGame ? " - Skip Next Game" : ""}`,
      `  Stats: MA ${statValueForDisplayByStat("ma", player.row.ma, player.statMods.ma ?? 0)} / ST ${statValueForDisplayByStat("st", player.row.st, player.statMods.st ?? 0)} / AG ${statValueForDisplayByStat("ag", player.row.ag, player.statMods.ag ?? 0)} / PA ${statValueForDisplayByStat("pa", player.row.pa, player.statMods.pa ?? 0)} / AR ${statValueForDisplayByStat("ar", player.row.ar, player.statMods.ar ?? 0)}`,
      `  Skills: ${skillNamesForPlayer(player.row, player).join(", ") || "-"}`,
    ].join("\n")),
    draft.teamRerolls ? `Team Rerolls: ${draft.teamRerolls}` : "",
    draft.startingRerolls ? `Starting Rerolls: ${draft.startingRerolls}` : "",
    draft.bribes ? `Bribes: ${draft.bribes}` : "",
    draft.dedicatedFans ? `Dedicated Fans: ${draft.dedicatedFans}` : "",
    draft.assistantCoaches ? `Assistant Coaches: ${draft.assistantCoaches}` : "",
    draft.cheerleaders ? `Cheerleaders: ${draft.cheerleaders}` : "",
  ].filter(Boolean).join("\n");
  return lines;
}

function renderRoute() {
  const route = decodeURIComponent(location.hash.replace(/^#\/?/, "")) || "home";
  const section = routeSection(route);
  if (route === "home") return renderHome();
  if (sectionRoutes.has(route)) return renderSection(route);
  if (route === "builder") return renderBuilder();
  if (route.startsWith("my-teams/")) return renderSavedRoster(route.replace(/^my-teams\//, ""));
  if (route === "my-teams") return renderMyTeams();
  if (route === "legal") return renderLegal();
  const page = findPageBySlug(route);
  if (page) return renderDetail(page);
  setActiveNav("home");
  setViewSection("home");
  view.innerHTML = `<div class="empty-state">Page not found.</div>`;
}

async function init() {
  applyTheme(storedTheme(), false);
  state.locale = storedLocale();
  await loadTranslations();
  state.data = await loadLocaleData(state.locale);
  await loadAuthSession();
  applyLocaleChrome();
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.query = event.currentTarget.value;
      renderRoute();
    });
  }
  themeSelect?.addEventListener("change", (event) => {
    applyTheme(event.currentTarget.value);
  });
  view.addEventListener("builderstep", handleBuilderStepEvent);
  navToggle?.addEventListener("click", () => {
    setNavOpen(!document.body.classList.contains("nav-open"));
  });
  navOverlay?.addEventListener("click", () => setNavOpen(false));
  navList?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setNavOpen(false);
    }
  });
  authButton?.addEventListener("click", () => openAuthModal());
  authModal?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-auth-close]")) {
      closeAuthModal();
    }
  });
  authForm?.addEventListener("submit", handleAuthSubmit);
  authProfileForm?.addEventListener("submit", handleProfileSubmit);
  authSwitch?.addEventListener("click", () => {
    setAuthMode(state.auth.mode === "register" ? "login" : "register");
  });
  authLogout?.addEventListener("click", logoutAuth);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setNavOpen(false);
      closeAuthModal();
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setNavOpen(false);
    }
  });
  langToggle?.addEventListener("click", () => {
    switchLocale(state.locale === "en" ? "ru" : "en");
  });
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}

init().catch((error) => {
  console.error(error);
  view.innerHTML = `<div class="empty-state">${t("app.dataLoadError")}</div>`;
});
