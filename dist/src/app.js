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
    activeTab: "registration",
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
    playerEdits: {},
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
const assetVersion = "gata-85";
const logoUploadMaxBytes = 2 * 1024 * 1024;
const logoOptimizeMaxDimension = 512;
const logoOptimizeQuality = 0.82;
const logoOptimizeSkipLength = 160_000;
const logoOptimizationCache = new Map();
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
const staticRoutes = new Set(["builder", "legal", "my-teams", "season", "administration"]);

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
    fetch(`src/i18n/en.json?v=${assetVersion}`).then((response) => response.json()),
    fetch(`src/i18n/ru.json?v=${assetVersion}`).then((response) => response.json()),
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
    const response = await fetch(`public/data.${locale}.json?v=${assetVersion}`);
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
  apothecary: 50,
  mortuaryAssistant: 100,
  plagueDoctor: 100,
};

const builderStaffMaximums = {
  teamRerolls: 8,
  startingRerolls: 8,
  bribes: 3,
  dedicatedFans: 6,
  assistantCoaches: 6,
  cheerleaders: 6,
  apothecary: 1,
  mortuaryAssistant: 1,
  plagueDoctor: 1,
};

const medicalStaffDefinitions = [
  { key: "apothecary", title: "Apothecary", access: "apothecary" },
  { key: "mortuaryAssistant", title: "Mortuary Assistant", access: "mortuary" },
  { key: "plagueDoctor", title: "Plague Doctor", access: "plague" },
];

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

const overviewCards = [
  {
    slug: "code-of-conduct",
    title: "Code Of Conduct",
    summary: "Fair play, rollbacks, tilt control, reporting, and how to keep the match pleasant.",
    sections: [
      {
        title: "How to Be a Great Player",
        items: [
          "Play fair and with respect for your opponent.",
          "Rollbacks are allowed for any actions, but only before the dice are thrown.",
          "Control your frustration (tilt) over the dice rolls.",
          "Report match results to the organizer on time.",
          "Ask the organizer immediately if you have any questions about rules that you cannot find the answer to.",
          "Notify in advance if you cannot play your match on time.",
          "Enjoy the football!",
        ],
      },
    ],
  },
  {
    slug: "general-rules",
    title: "General Rules",
    summary: "League formats, match procedures, model standards, and basic registration rules.",
    sections: [
      {
        title: "League Formats",
        items: [
          "Season: A major event lasting about 3-4 months, with a defined start, end, and fixed roster of participants. Match schedules and times are strictly designated.",
          "Tournaments: Events played over 1-2 days, typically serving as season finales or fun cup events.",
          "Off-season: Friendly matches that can be played at any time, provided the team is not currently participating in another event. This is a great way to develop your team before the season. You may register up to 6 games per month in this format.",
          "Match results must be reported within 1-3 days of completion. Failure to comply may result in penalties, up to and including the annulment of match results.",
          "A single coach may register up to 4 teams in the league.",
          "If either player wishes, the game can be played with a clock. The standard format is 45 minutes per person. The timer stops for both players during pre-game preparations, kick-offs, and similar downtime.",
        ],
      },
      {
        title: "Match Procedures",
        items: [
          "Scheduling: For matches on designated game days, coaches must arrange the details with their opponents independently, using any convenient method.",
          "Reporting: Match results should be reported to the commissioner using any convenient method.",
          "Photos: It would be even better if you took some photos.",
        ],
      },
      {
        title: "Model Requirements",
        items: [
          "Free Starting Roster: As a personal incentive for participating, the Commissioner will provide you with 9 players - enough for a valid roster - from any 3D-printed team, completely free of charge.",
          "Model Standards: A model must clearly represent a team player, have a base, and be of an appropriate size.",
          "Identification: The player's number must be clearly marked on either the model or its base, matching the number listed on your team roster.",
          "Thematic Accuracy: Models must depict Blood Bowl players; weapons like swords, generic armor, etc., are not permitted.",
          "Conversions: Conversions are allowed.",
          "Clarification: If you are unsure whether your model is suitable for play, please consult the Commissioner.",
        ],
      },
      {
        title: "Registration",
        items: [
          "Whenever registration is open, go to Season and register a valid league team.",
        ],
      },
    ],
  },
  {
    slug: "general-rules-changes",
    title: "General Rules Changes",
    summary: "League-specific gameplay, SPP, setup, inducement, Team Value, and scoring adjustments.",
    sections: [
      {
        title: "Special Rules and Gameplay Changes",
        items: [
          "Prohibited Inducements: Special Hired Wizards, Biased Referees, and Famous Coaching Staff are not used in the league.",
          "Rules Adjustments: Some rules from the original Sevens and Blood Bowl have been modified for more enjoyable and deliberate gameplay. Most player costs have been recalculated; these changes can be viewed in the team table.",
        ],
      },
      {
        title: "General Gameplay Rules",
        items: [
          "MVP Selection: Choose 3 players and roll a d3 to decide which one receives 5 SPP.",
          "Kick-off: When the ball scatters on kick-off, roll 1d6 and halve the result (rounding down); the result can be zero.",
          "Team Rerolls: The cost of Team Rerolls is not doubled during team drafting, but it is doubled if purchased during the season.",
          "SPP for Knock Outs: A player who knocks out an opponent receives 1 SPP.",
          "Inducement Tiering: When determining inducement budgets, the team's tier is considered. Tier 2 teams receive 200k when playing against Tier 1; Tier 3 teams receive 300k against Premier League teams or 100k against Tier 2 teams.",
          "Injury Table: Use the injury table from the \"big format\" (standard) Blood Bowl.",
          "Setup: The team setup is moved 3 squares forward. Sevens now has a Line of Scrimmage. You must place at least 3 players on the Line of Scrimmage in the central segment. No more than 1 player is allowed in each side segment.",
          "Touchdown Restrictions: A touchdown cannot be scored on the first turn of any drive. If your player is in the opponent's end zone at the end of your first turn, you do not score, but if they are still there at the start of your second turn, the drive ends immediately and you score a touchdown. Exception: A touchdown can be scored on the first turn of a drive if the player was thrown via Throw Teammate.",
          "Leaping: Jumping over prone players is prohibited unless the player has the Leap skill.",
          "Mega-Stars: Star Players with the Mega-Star tag occupy both available Star Player slots.",
          "Bribes: Bribes trigger automatically.",
          "Secure the Ball!: The \"no ball pickup\" restriction radius is reduced to 1 square.",
          "Bribery and Corruption: Allows purchasing up to 3 bribes per team for 50k each, which increase Team Value (TV).",
          "TV Exceptions: Cheerleaders and assistant coaches do not count toward Team Value.",
          "Painting Bonus: A fully painted team receives an additional 30k after a match.",
          "Throw-Ins: Throw-ins are resolved using 1d6.",
        ],
      },
      {
        title: "Experience (SPP)",
        items: [
          "Block-like Actions: Actions similar to Block or their consequences grant SPP according to current rules (1 for KO, 2 for Injury). For example, Stab, Chainsaw, Bombardier, and pushing a player off the pitch can now grant experience.",
          "Fouls: A Foul action grants experience just like a Block.",
          "Throw Teammate: A Throw Teammate action grants the thrower experience for inflicting Injuries and KOs, just like a Block.",
        ],
      },
    ],
  },
  {
    slug: "skill-changes",
    title: "Skill Changes",
    summary: "League changes to skills, traits, mutations, SPP awards, and Favoured Of bonuses.",
    sections: [
      {
        title: "Skill Changes",
        items: [
          "Claws, Mighty Blow, and Piledriver: These skills now fully stack. With Claws and Mighty Blow, you break any armor on a 7+.",
          "Piledriver: Completely changed. After an armor roll from a Block action, the player using the skill can become Placed Prone to roll again. This does not work with skills that replace Block and has been moved to the Strength category.",
          "Hypnotic Gaze: Partially changed; can now only be used once per turn.",
          "Brawler: Completely changed; allows a one-time reroll of a single die during a Block. Cannot be used in negative dice blocks.",
          "Plague Ridden / Masters of Undeath: Completely changed; when a player with this rule kills an opponent, their coach gains a Lineman of their own team. Shambling Undead can choose between a Skeleton or a Zombie.",
          "Throw Teammate: Now a passive skill.",
          "Blood Lust: Roll a d6 after declaring any action. On a 2+, the turn continues normally. On a 1, the action is lost and the player must feed. The player may choose an adjacent teammate without the Vampire or Undead tags and perform an injury roll against them, treating all results as Badly Hurt. This causes a turnover only if the bitten player was holding the ball. Movement may be declared before the bite; after the bite, the player's activation ends. If no bite is performed, a turnover occurs.",
          "Accurate and Cannoneer: Merged into one skill, Accurate, which provides +1 to all passes.",
          "Dodge: Completely changed; now only allows a reroll for dodge tests.",
          "Evasive (New): The player can treat a result of 5 as 3–4 when being blocked, and Stumble results as Push Back.",
          "Tackle: Completely changed; it now ignores the Evasive skill.",
          "Arm Bar: Completely changed; prevents rerolls on dodge tests for players in the owner's tackle zone. Grants SPP like Block if the opponent is injured or knocked out while dodging away.",
          "Block: Partially changed; only works during the player's own activation.",
          "Thick Skull: Moved to the General category.",
          "Sneaky Git: You are no longer removed on doubles when fouling during an armor break.",
          "Stab: No longer ends movement during a Blitz.",
          "Shiv (New): Works like Stab but can only be used once per turn among all players with the skill.",
          "Decay: Completely changed; when receiving an injury, roll two dice and choose the highest.",
          "Safe Pass: Protects against any Fumble, not just on a natural 1.",
          "Fumblerooski: Moved to the Agility category.",
          "Pogo: Can only be used once per activation.",
          "Secret Weapon: Only works if the player was fielded for the drive.",
          "Shadowing: Now a General skill.",
          "Frenzy: Now optional; must be declared immediately before the first Block action of the activation.",
          "Monstrous Mouth: Limits holding to 1 player, or up to 2 when used with Multiple Block.",
          "Big Hand: Additionally allows picking up the ball from an adjacent square, but not while in an opponent's control zone.",
          "Disturbing Presence: Works on ball pickup, but still does not affect Secure the Ball. It does not work if the player is prone.",
          "Foul Appearance: Now triggers on a 1–2 roll and does not end the player's activation.",
          "Iron Hard Skin: Now grants +1 AV in addition to its basic properties; ignoring modifiers only works during a Block.",
          "Tentacles: Now works on a raw 4+ roll, regardless of the models' Strength.",
          "Bone Hook (New Mutation): Before a Foul action, you may move the target player 1 square to an adjacent cell before calculating assists.",
          "Leap: Now always works on an unmodifiable 4+ roll and is improved by the Very Long Legs mutation.",
          "Elvenball (New General Skill): Grants the ability to move after a Secure the Ball action.",
          "Guard: Now only works during the opponent's turn.",
          "Offensive (New General Skill): Grants an unblockable assist for a Block during your turn.",
          "Defensive: Now cancels the Offensive skill.",
          "Breathe Fire: Does not cause Knocked Down on a roll of 1.",
          "Diving Catch / On the Ball: Work when Punt is declared.",
          "Jump Up: Allows replacing Block with special actions such as Stab and declaring active skills while Prone.",
          "Multiple Block: Works on special actions that replace Block.",
          "Juggernaut: Also cancels Foul Appearance.",
          "Kick: Instead of a d3 roll, halve the d6 value during kick-off, rounding down; the result can be 0.",
          "Leader: Triggers at the start of a drive.",
        ],
      },
      {
        title: "Changes to Favoured Of…",
        items: [
          "Real Bonuses: The Favoured Of rule now provides actual bonuses.",
          "Deity Selection: If a team has a choice for this rule, select one option during team registration: Undivided, Khorne, Nurgle, Tzeentch, Slaanesh, or Hashut.",
          "Skill Acquisition: Every time a player receives an advancement, roll a d8.",
          "Triggers: Undivided triggers on 1; Slaanesh on 6; Nurgle on 7; Khorne on 8; Tzeentch on 9 (or 6); Hashut on 4.",
          "Additional Skill: A player may receive one skill corresponding to your choice in addition to the regular advancement. This skill increases the player's value, but does not increase the player's rank.",
          "Random Selection: If a player has Mutation access only as a secondary skill or has no Mutation access, choose the skill randomly.",
        ],
      },
      {
        title: "Favoured Of Skill Lists",
        items: [
          "Undivided: Prehensile Tail, Extra Arm, Disturbing Presence.",
          "Tzeentch: Two Heads, Extra Arm, Very Long Legs.",
          "Khorne: Horns, Iron Hard Skin, Prehensile Tail.",
          "Slaanesh: Tentacles, Foul Appearance, Extra Arm.",
          "Nurgle: Tentacles, Monstrous Mouth, Bone Hook.",
          "Hashut: Iron Hard Skin, Horns, Bone Hook.",
        ],
      },
    ],
  },
  {
    slug: "create-your-team",
    title: "Create Your Team",
    summary: "Starting budget, roster limits, specialists, registration, and model expectations.",
    sections: [
      {
        title: "New Team Creation",
        items: [
          "Starting Budget: Teams are drafted with 600,000 gold pieces in accordance with the base rules.",
          "Roster Size: The team size is limited to 14 players.",
          "Specialists: In Sevens, a team can field no more than 4 specialists per drive, so be sure to purchase at least 3 players with the Lineman tag.",
          "Registration: Create a new team on this website, then enter its name and logo.",
        ],
      },
      {
        title: "Model Requirements",
        items: [
          "Model Standards: A model must clearly represent a team player, have a base, and be of an appropriate size.",
          "Identification: The player's number must be clearly marked on either the model or its base, matching the number listed on your team roster.",
          "Thematic Accuracy: Models must depict Blood Bowl players; weapons like swords, generic armor, etc., are not permitted.",
          "Conversions: Conversions are allowed.",
          "Clarification: If you are unsure whether your model is suitable for play, please consult the Commissioner.",
          "Painting: It is highly encouraged to play with a painted team. A miniature is considered painted if all details are highlighted, base shadows and highlights have been applied, and the base is finished.",
        ],
      },
    ],
  },
  {
    slug: "team-management",
    title: "Team Management",
    summary: "Team transfers, player sales, contracts, renewals, recovery, and roster retention.",
    sections: [
      {
        title: "Team Management",
        items: [
          "Team Transfer: You may transfer a team from the previous season without any restrictions.",
          "Players: Players can be sold after a match for half their price.",
          "Roster Constraints: You cannot sell or remove a player if doing so would leave the team with fewer than 7 players.",
        ],
      },
      {
        title: "Contracts",
        items: [
          "Contract Terms: Upon team formation, the coach signs a contract with the team. The contract renewal time is announced by the Commissioner and typically occurs at the end of the season.",
          "Team Buyout: To purchase the team from the league treasury, 600,000 gold will be allocated, plus the funds in the team's treasury at the time of renewal, up to a total maximum of 900,000 gold.",
          "Agent Fees: A player who has completed a contract will incur an additional 20,000 gold in agent fees for each contract completed after the first. For example, after 3 successful contracts, a player will cost 40,000 more to buy out. This increase is not counted toward the total team value.",
          "Player Departure: Players who do not sign a contract leave the team.",
          "Retention: After signing a new contract, a player retains all experience, acquired skills, and injuries.",
          "Dissolution: You may dissolve your team and choose not to renew the contract if you wish.",
        ],
      },
      {
        title: "Contract Renewal — Health Recovery",
        items: [
          "Healing Niggling Injuries: Roll a d6 for each Niggling Injury; add a +1 modifier if you have an Apothecary. On a 4+, the vacation and rest work wonders, and the injury is successfully healed. If you fail, the injury remains with the player.",
          "Healing Serious Injuries: Roll a d6 for each stat reduction on the player; add a +1 modifier if you have an Apothecary. On a 4+, the treatment is successful, the characteristic is restored to its previous value, and the player receives a Niggling Injury. If you fail, the injury remains with the player.",
          "Removing Hatred: Roll a d6 for each acquired Hatred skill on the player. On a 4+, the player forgets their old grudges, and the skill is removed from the player's profile.",
        ],
      },
      {
        title: "Contract Renewal — Staff & Personnel",
        items: [
          "Assistant coaches, cheerleaders, and apothecaries go on unpaid leave.",
          "Rerolls are lost.",
          "Select the players you wish to keep on the team and pay their cost, plus any applicable agent fees.",
          "Remove the remaining players. Count the number of upgrades the departing players had and roll that many d6s; for every 1–2 rolled, you lose one Fan Factor.",
          "Purchase new players, staff, and rerolls as needed.",
        ],
      },
    ],
  },
  {
    slug: "season-structure-and-scoring",
    title: "Season Structure and Scoring",
    summary: "Round deadlines, league points, rookie protection, prizes, and tournament structure.",
    sections: [
      {
        title: "Match Conduct",
        items: [
          "Rounds: One round lasts two weeks, starting on a Monday and ending on a Sunday.",
          "Deadlines: Each match must be played within its designated round.",
          "Locations: Games can be played at the Litch Club, at Ded Max's Painting Evenings, or at someone's home by prior arrangement.",
          "Virtual Play: If it is impossible to play in real life, the match can be played using the Tabletop Simulator (TTS) mod.",
          "Scheduling: Time proposals for matches must be submitted by the end of Friday. If a coach only provides scheduling proposals over the weekend and the match is ultimately not played, the Commissioner will favor the coach who provided their availability in advance.",
          "Incomplete Matches: If a match is not played within the round, the result will be determined by the Commissioner.",
          "Season Start: At the beginning of the season, all missed game penalties are removed from all players.",
        ],
      },
      {
        title: "League Points",
        items: [
          "3 points for a win.",
          "1 point for a draw.",
          "2 points for a technical win.",
          "0 points for a loss.",
          "+1 point if the game ends with a margin of 3+ touchdowns.",
          "+1 point if you conceded 0 touchdowns (you must score at least one yourself).",
          "+1 point if you caused 4 or more casualties.",
        ],
      },
      {
        title: "End-of-Season Prizes",
        items: [
          "At the end of the season, all teams not in the top rankings receive winnings.",
          "10k for each match played.",
          "20k for each victory.",
          "10k for each draw.",
        ],
      },
      {
        title: "Rookie Protection",
        items: [
          "For the first 3 games after a team's creation, all injuries inflicted on its players are counted as Badly Hurt.",
        ],
      },
      {
        title: "Technical Win & Tournament Structure",
        items: [
          "Technical Win: The winning team is awarded 2 MVP rolls and (D3+2) * 10k gold.",
          "Tournament Bracket: Matches are assigned using the Swiss system.",
          "Tie-breakers: The Buchholz coefficient and head-to-head results are used for tie-breakers, followed by the total number of touchdowns and injuries.",
          "Playoff Qualification: Depending on the number of participants, the players at the top of the standings will receive an automatic bye into the tournament's playoff winner's bracket.",
        ],
      },
    ],
  },
];

const overviewCardsRu = [
  {
    slug: "code-of-conduct",
    title: "Кодекс поведения",
    summary: "Честная игра, откаты ходов, контроль тильта, отчётность и как сохранять приятную атмосферу матча.",
    sections: [
      {
        title: "Как быть отличным игроком",
        items: [
          "Играйте честно и с уважением к сопернику.",
          "Откат хода (rollback) разрешён для любых действий, но только до броска костей.",
          "Контролируйте своё раздражение (тильт) из-за результатов бросков.",
          "Вовремя сообщайте организатору результаты матчей.",
          "Сразу спрашивайте организатора, если у вас есть вопросы по правилам, на которые вы не можете найти ответ.",
          "Заранее предупреждайте, если не можете сыграть матч в срок.",
          "Получайте удовольствие от футбола!",
        ],
      },
    ],
  },
  {
    slug: "general-rules",
    title: "Общие правила",
    summary: "Форматы лиги, процедуры матчей, стандарты моделей и базовые правила регистрации.",
    sections: [
      {
        title: "Форматы лиги",
        items: [
          "Сезон (Season): крупное событие продолжительностью около 3-4 месяцев с чётко определённым началом, концом и фиксированным составом участников. Расписание и время матчей строго назначены.",
          "Турниры (Tournaments): события продолжительностью 1-2 дня, обычно проводятся как финал сезона или отдельные развлекательные кубки.",
          "Межсезонье (Off-season): товарищеские матчи, которые можно играть в любое время, если команда не участвует в данный момент в другом событии. Это отличный способ развить команду перед сезоном. В этом формате можно зарегистрировать до 6 игр в месяц.",
          "Результаты матча должны быть переданы в течение 1-3 дней после его завершения. Несоблюдение этого срока может повлечь штрафы, вплоть до аннулирования результата матча.",
          "Один тренер может зарегистрировать в лиге до 4 команд.",
          "По желанию любого из игроков матч может проводиться с таймером. Стандартный формат — 45 минут на человека. Таймер останавливается для обоих игроков во время предматчевой подготовки, кик-оффов и подобных пауз.",
        ],
      },
      {
        title: "Процедуры матчей",
        items: [
          "Планирование: для матчей в назначенные игровые дни тренеры самостоятельно согласовывают детали с соперником любым удобным способом.",
          "Отчётность: результаты матча следует сообщать комиссару любым удобным способом.",
          "Фото: будет ещё лучше, если вы сделаете несколько фотографий.",
        ],
      },
      {
        title: "Требования к моделям",
        items: [
          "Бесплатный стартовый состав: в качестве личного бонуса за участие комиссар бесплатно предоставит вам 9 игроков — достаточно для валидного состава — из любой команды на 3D-печати.",
          "Стандарты моделей: модель должна чётко представлять игрока команды, иметь подставку и быть подходящего размера.",
          "Идентификация: номер игрока должен быть чётко указан на модели или подставке и совпадать с номером в составе вашей команды.",
          "Тематическое соответствие: модели должны изображать игроков Blood Bowl; оружие вроде мечей, обычная броня и т.п. не допускаются.",
          "Конверсии: конверсии разрешены.",
          "Уточнение: если вы не уверены, подходит ли ваша модель для игры, обратитесь к комиссару.",
        ],
      },
      {
        title: "Регистрация",
        items: [
          "Как только регистрация открыта, перейдите в раздел «Сезон» и зарегистрируйте валидную команду лиги.",
        ],
      },
    ],
  },
  {
    slug: "general-rules-changes",
    title: "Изменения общих правил",
    summary: "Изменения игрового процесса, опыта, расстановки, дополнительных средств, стоимости команды и начисления наград в лиге.",
    sections: [
      {
        title: "Особые правила и изменения игрового процесса",
        items: [
          "Запрещённые дополнительные средства: особые наёмные волшебники, подкупленные судьи и знаменитый тренерский штаб не используются в лиге.",
          "Изменения правил: некоторые правила оригинальных Sevens и Blood Bowl изменены, чтобы сделать игровой процесс более увлекательным и осмысленным. Стоимость большинства игроков пересчитана; изменения можно посмотреть в таблице команд.",
        ],
      },
      {
        title: "Общие игровые правила",
        items: [
          "Выбор MVP: выберите 3 игроков и бросьте d3, чтобы определить, кто из них получит 5 SPP.",
          "Начальный удар: когда мяч разлетается после начального удара, бросьте 1d6 и разделите результат пополам с округлением вниз; итог может быть равен нулю.",
          "Командные перебросы: стоимость командных перебросов не удваивается при формировании команды, но удваивается при покупке в течение сезона.",
          "SPP за нокаут: игрок, отправивший соперника в нокаут, получает 1 SPP.",
          "Уровень команды и дополнительные средства: при расчёте бюджета дополнительных средств учитывается уровень команды. Команды Tier 2 получают 200k в матче против Tier 1; команды Tier 3 получают 300k против команд Premier League или 100k против Tier 2.",
          "Таблица травм: используйте таблицу травм из «большого формата» — стандартного Blood Bowl.",
          "Расстановка: зона расстановки команды сдвинута на 3 клетки вперёд. В Sevens теперь есть линия схватки. В центральном сегменте линии схватки необходимо разместить не менее 3 игроков. В каждом боковом сегменте разрешено не более 1 игрока.",
          "Ограничения тачдауна: тачдаун нельзя занести на первом ходу любого драйва. Если в конце вашего первого хода игрок находится в зачётной зоне соперника, тачдаун не засчитывается; если в начале второго хода игрок всё ещё там, драйв немедленно завершается и тачдаун засчитывается. Исключение: тачдаун разрешён на первом ходу драйва, если игрок был брошен действием Throw Teammate.",
          "Прыжки: запрещено перепрыгивать лежащих игроков, если у игрока нет навыка Leap.",
          "Мегазвёзды: звёздные игроки с тегом Mega-Star занимают оба доступных места звёздных игроков.",
          "Взятки: взятки срабатывают автоматически.",
          "Secure the Ball!: радиус ограничения, запрещающего подбирать мяч, уменьшен до 1 клетки.",
          "Bribery and Corruption: позволяет приобрести до 3 взяток на команду по 50k каждая; эти взятки увеличивают стоимость команды (TV).",
          "Исключения из TV: чирлидеры и помощники тренера не учитываются в стоимости команды.",
          "Бонус за покраску: полностью покрашенная команда получает дополнительно 30k после матча.",
          "Вбрасывания: вбрасывания разрешаются с помощью 1d6.",
        ],
      },
      {
        title: "Опыт (SPP)",
        items: [
          "Действия, подобные Block: действия, похожие на Block, и их последствия приносят SPP по текущим правилам — 1 за KO и 2 за Injury. Например, Stab, Chainsaw, Bombardier и выталкивание игрока за пределы поля теперь могут приносить опыт.",
          "Фолы: действие Foul приносит опыт так же, как Block.",
          "Throw Teammate: действие Throw Teammate приносит бросающему игроку опыт за нанесённые травмы и нокауты так же, как Block.",
        ],
      },
    ],
  },
  {
    slug: "skill-changes",
    title: "Изменения навыков",
    summary: "Изменения навыков, особенностей, мутаций, начисления SPP и бонусов Favoured Of в лиге.",
    sections: [
      {
        title: "Изменения навыков",
        items: [
          "Claws, Mighty Blow и Piledriver: теперь эти навыки полностью складываются. С Claws и Mighty Blow любая броня пробивается на 7+.",
          "Piledriver: полностью изменён. После броска брони в результате действия Block игрок с этим навыком может стать Placed Prone, чтобы повторить бросок. Это не работает с навыками, заменяющими Block. Навык перенесён в категорию Strength.",
          "Hypnotic Gaze: частично изменён; теперь его можно использовать только один раз за ход.",
          "Brawler: полностью изменён; позволяет один раз перебросить один кубик во время Block. Нельзя использовать при блоках с отрицательными кубиками.",
          "Plague Ridden / Masters of Undeath: полностью изменены; когда игрок с этим правилом убивает соперника, его тренер получает Lineman своей команды. Shambling Undead могут выбрать Skeleton или Zombie.",
          "Throw Teammate: теперь пассивный навык.",
          "Blood Lust: после объявления любого действия бросьте d6. На 2+ ход продолжается как обычно. На 1 действие теряется, и игрок должен насытиться. Он может выбрать соседнего союзника без тегов Vampire и Undead и выполнить против него бросок травмы, считая любой результат Badly Hurt. Это вызывает turnover только в том случае, если укушенный игрок держал мяч. До укуса можно объявить движение; после укуса активация игрока заканчивается. Если укус не выполнен, происходит turnover.",
          "Accurate и Cannoneer: объединены в один навык Accurate, дающий +1 ко всем пасам.",
          "Dodge: полностью изменён; теперь позволяет только перебрасывать проверки уклонения.",
          "Evasive (новый): при блоке против него игрок может считать результат 5 как 3–4, а Stumble — как Push Back.",
          "Tackle: полностью изменён; теперь игнорирует навык Evasive.",
          "Arm Bar: полностью изменён; запрещает перебрасывать проверки уклонения игрокам в зоне захвата владельца навыка. Если соперник получает травму или нокаут при выходе из этой зоны, владелец получает SPP как за Block.",
          "Block: частично изменён; работает только во время собственной активации игрока.",
          "Thick Skull: перенесён в категорию General.",
          "Sneaky Git: игрок больше не удаляется за дубль при фоле во время пробития брони.",
          "Stab: больше не завершает движение во время Blitz.",
          "Shiv (новый): работает как Stab, но может быть использован только один раз за ход среди всех игроков с этим навыком.",
          "Decay: полностью изменён; при получении травмы бросьте два кубика и выберите наибольший результат.",
          "Safe Pass: защищает от любого Fumble, а не только при натуральной 1.",
          "Fumblerooski: перенесён в категорию Agility.",
          "Pogo: можно использовать только один раз за активацию.",
          "Secret Weapon: работает только в том случае, если игрок был выставлен на поле в этом драйве.",
          "Shadowing: теперь навык категории General.",
          "Frenzy: теперь необязателен; его нужно объявить непосредственно перед первым действием Block в активации.",
          "Monstrous Mouth: ограничивает удержание одним игроком или двумя при использовании вместе с Multiple Block.",
          "Big Hand: дополнительно позволяет подбирать мяч с соседней клетки, но не находясь в зоне контроля соперника.",
          "Disturbing Presence: работает при подборе мяча, но по-прежнему не влияет на Secure the Ball. Не работает, если игрок лежит.",
          "Foul Appearance: теперь срабатывает на 1–2 и не завершает активацию игрока.",
          "Iron Hard Skin: дополнительно даёт +1 AV; игнорирование модификаторов работает только во время Block.",
          "Tentacles: теперь срабатывает на немодифицированные 4+ независимо от Strength моделей.",
          "Bone Hook (новая мутация): перед действием Foul можно переместить выбранного игрока на 1 клетку в соседнюю клетку до подсчёта поддержек.",
          "Leap: теперь всегда срабатывает на немодифицированные 4+ и улучшается мутацией Very Long Legs.",
          "Elvenball (новый навык General): позволяет двигаться после действия Secure the Ball.",
          "Guard: теперь работает только во время хода соперника.",
          "Offensive (новый навык General): даёт неотменяемую поддержку для Block во время вашего хода.",
          "Defensive: теперь отменяет навык Offensive.",
          "Breathe Fire: не вызывает Knocked Down при результате 1.",
          "Diving Catch / On the Ball: работают при объявлении Punt.",
          "Jump Up: позволяет заменять Block особыми действиями, например Stab, и объявлять активные навыки в положении Prone.",
          "Multiple Block: работает с особыми действиями, заменяющими Block.",
          "Juggernaut: также отменяет Foul Appearance.",
          "Kick: вместо броска d3 разделите значение d6 при начальном ударе пополам с округлением вниз; результат может быть равен 0.",
          "Leader: срабатывает в начале драйва.",
        ],
      },
      {
        title: "Изменения Favoured Of…",
        items: [
          "Реальные бонусы: правило Favoured Of теперь предоставляет реальные бонусы.",
          "Выбор божества: если у команды есть выбор для этого правила, при регистрации выберите один вариант: Undivided, Khorne, Nurgle, Tzeentch, Slaanesh или Hashut.",
          "Получение навыка: каждый раз, когда игрок получает улучшение, бросьте d8.",
          "Результаты: Undivided срабатывает на 1; Slaanesh — на 6; Nurgle — на 7; Khorne — на 8; Tzeentch — на 9 (или 6); Hashut — на 4.",
          "Дополнительный навык: игрок может получить один навык, соответствующий вашему выбору, в дополнение к обычному улучшению. Этот навык увеличивает стоимость игрока, но не повышает его ранг.",
          "Случайный выбор: если доступ к Mutation у игрока только вторичный либо отсутствует, навык выбирается случайно.",
        ],
      },
      {
        title: "Списки навыков Favoured Of",
        items: [
          "Undivided: Prehensile Tail, Extra Arm, Disturbing Presence.",
          "Tzeentch: Two Heads, Extra Arm, Very Long Legs.",
          "Khorne: Horns, Iron Hard Skin, Prehensile Tail.",
          "Slaanesh: Tentacles, Foul Appearance, Extra Arm.",
          "Nurgle: Tentacles, Monstrous Mouth, Bone Hook.",
          "Hashut: Iron Hard Skin, Horns, Bone Hook.",
        ],
      },
    ],
  },
  {
    slug: "create-your-team",
    title: "Создание команды",
    summary: "Стартовый бюджет, лимиты состава, специалисты, регистрация и требования к моделям.",
    sections: [
      {
        title: "Создание новой команды",
        items: [
          "Стартовый бюджет: команды формируются с бюджетом 600 000 золотых по базовым правилам.",
          "Размер состава: размер команды ограничен 14 игроками.",
          "Специалисты: в Sevens команда может выставлять на дран не более 4 специалистов, поэтому обязательно приобретите как минимум 3 игроков с тегом Lineman.",
          "Регистрация: создайте новую команду на этом сайте, затем укажите её название и логотип.",
        ],
      },
      {
        title: "Требования к моделям",
        items: [
          "Стандарты моделей: модель должна чётко представлять игрока команды, иметь подставку и быть подходящего размера.",
          "Идентификация: номер игрока должен быть чётко указан на модели или подставке и совпадать с номером в составе вашей команды.",
          "Тематическое соответствие: модели должны изображать игроков Blood Bowl; оружие вроде мечей, обычная броня и т.п. не допускаются.",
          "Конверсии: конверсии разрешены.",
          "Уточнение: если вы не уверены, подходит ли ваша модель для игры, обратитесь к комиссару.",
          "Покраска: настоятельно рекомендуется играть покрашенной командой. Миниатюра считается покрашенной, если проработаны все детали, нанесены тени и света на подставке, а сама подставка завершена.",
        ],
      },
    ],
  },
  {
    slug: "team-management",
    title: "Управление командой",
    summary: "Перенос команды, продажа игроков, контракты, их продление, восстановление и сохранение состава.",
    sections: [
      {
        title: "Управление командой",
        items: [
          "Перенос команды: вы можете перенести команду из предыдущего сезона без каких-либо ограничений.",
          "Игроки: после матча игроков можно продать за половину их стоимости.",
          "Ограничения состава: нельзя продать или удалить игрока, если после этого в команде останется меньше 7 игроков.",
        ],
      },
      {
        title: "Контракты",
        items: [
          "Условия контракта: при формировании команды тренер подписывает с ней контракт. Срок продления контракта объявляет комиссар; обычно это происходит в конце сезона.",
          "Выкуп команды: для выкупа команды из казны лиги выделяется 600 000 золотых, к которым добавляются средства из казны команды на момент продления. Общая сумма не может превышать 900 000 золотых.",
          "Агентские сборы: игрок, завершивший контракт, требует дополнительно 20 000 золотых агентских за каждый завершённый контракт после первого. Например, после 3 успешно завершённых контрактов выкуп игрока будет стоить на 40 000 больше. Эта надбавка не учитывается в общей стоимости команды.",
          "Уход игроков: игроки, не подписавшие контракт, покидают команду.",
          "Сохранение прогресса: после подписания нового контракта игрок сохраняет весь опыт, приобретённые навыки и травмы.",
          "Расформирование: при желании вы можете расформировать команду и не продлевать контракт.",
        ],
      },
      {
        title: "Продление контракта — Восстановление здоровья",
        items: [
          "Лечение хронических травм: бросьте d6 за каждую Niggling Injury; добавьте модификатор +1, если у вас есть Apothecary. На 4+ отпуск и отдых творят чудеса, и травма успешно излечивается. При неудаче травма остаётся у игрока.",
          "Лечение серьёзных травм: бросьте d6 за каждое снижение характеристики игрока; добавьте модификатор +1, если у вас есть Apothecary. На 4+ лечение проходит успешно, характеристика восстанавливается до прежнего значения, а игрок получает Niggling Injury. При неудаче травма остаётся у игрока.",
          "Удаление Ненависти: бросьте d6 за каждый приобретённый игроком навык Hatred. На 4+ игрок забывает старые обиды, и навык удаляется из его профиля.",
        ],
      },
      {
        title: "Продление контракта — Персонал",
        items: [
          "Помощники тренера, чирлидеры и аптекари уходят в неоплачиваемый отпуск.",
          "Рероллы теряются.",
          "Выберите игроков, которых хотите оставить в команде, и оплатите их стоимость с учётом применимых агентских сборов.",
          "Удалите остальных игроков. Посчитайте количество улучшений у покидающих команду игроков и бросьте столько же d6; за каждый результат 1–2 вы теряете один Fan Factor.",
          "При необходимости купите новых игроков, персонал и рероллы.",
        ],
      },
    ],
  },
  {
    slug: "season-structure-and-scoring",
    title: "Структура сезона и очки",
    summary: "Сроки раундов, очки лиги, защита новичков, призы и структура турнира.",
    sections: [
      {
        title: "Проведение матчей",
        items: [
          "Раунды: один раунд длится две недели, начинаясь в понедельник и заканчиваясь в воскресенье.",
          "Сроки: каждый матч должен быть сыгран в течение своего раунда.",
          "Места проведения: игры можно проводить в Litch Club, на Painting Evenings у Ded Max, либо у кого-то дома по предварительной договорённости.",
          "Игра онлайн: если сыграть вживую невозможно, матч можно провести с помощью мода Tabletop Simulator (TTS).",
          "Согласование времени: предложения по времени матча должны быть поданы до конца пятницы. Если тренер предоставляет варианты времени только на выходных и матч в итоге не сыгран, комиссар примет сторону тренера, предоставившего свою доступность заранее.",
          "Незавершённые матчи: если матч не сыгран в течение раунда, результат определяет комиссар.",
          "Начало сезона: в начале сезона у всех игроков снимаются штрафы за пропущенные игры.",
        ],
      },
      {
        title: "Очки лиги",
        items: [
          "3 очка за победу.",
          "1 очко за ничью.",
          "2 очка за техническую победу.",
          "0 очков за поражение.",
          "+1 очко, если матч завершился с разницей в 3+ тачдауна.",
          "+1 очко, если вы не пропустили ни одного тачдауна (при этом нужно забить хотя бы один самому).",
          "+1 очко, если вы нанесли 4 или больше травм (Casualties).",
        ],
      },
      {
        title: "Призы по итогам сезона",
        items: [
          "По итогам сезона все команды вне топа таблицы получают выплаты.",
          "10 тыс. за каждый сыгранный матч.",
          "20 тыс. за каждую победу.",
          "10 тыс. за каждую ничью.",
        ],
      },
      {
        title: "Защита новичков",
        items: [
          "В первые 3 игры после создания команды все травмы, полученные её игроками, засчитываются как Badly Hurt.",
        ],
      },
      {
        title: "Техническая победа и структура турнира",
        items: [
          "Техническая победа: команде-победителю начисляется 2 броска MVP и (D3+2) * 10 тыс. золотых.",
          "Турнирная сетка: матчи распределяются по швейцарской системе.",
          "Тай-брейки: для определения мест при равенстве очков используются коэффициент Бухгольца и результат личной встречи, затем — суммарное число тачдаунов и травм.",
          "Выход в плей-офф: в зависимости от числа участников, команды в верхней части таблицы получают автоматический проход в сетку победителей плей-офф турнира.",
        ],
      },
    ],
  },
];

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
  document.querySelectorAll("[data-admin-nav]").forEach((link) => {
    link.hidden = !state.auth.currentUser?.isAdmin;
  });
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
    state.myTeams.loaded = false;
    state.season.loaded = false;
    updateAuthButton();
    closeAuthModal();
    renderRoute();
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
  state.myTeams = { items: [], loaded: false, loading: false, error: "" };
  state.admin = { users: [], loaded: false, loading: false, error: "", editingTeams: new Map() };
  state.season = { data: null, loaded: false, loading: false, error: "", activeTab: "registration" };
  updateAuthButton();
  closeAuthModal();
  renderRoute();
}

function pageUrl(page) {
  return `#/${page.slug}`;
}

function playerUrl(userOrId) {
  const id = typeof userOrId === "string" ? userOrId : userOrId?.id;
  return `#/players/${encodeURIComponent(id || "")}`;
}

function playerTeamUrl(userOrId, teamOrId) {
  const userId = typeof userOrId === "string" ? userOrId : userOrId?.id;
  const teamId = typeof teamOrId === "string" ? teamOrId : teamOrId?.id;
  return `#/players/${encodeURIComponent(userId || "")}/teams/${encodeURIComponent(teamId || "")}`;
}

function adminTeamEditUrl(userOrId, teamOrId) {
  const userId = typeof userOrId === "string" ? userOrId : userOrId?.id;
  const teamId = typeof teamOrId === "string" ? teamOrId : teamOrId?.id;
  return `#/administration/users/${encodeURIComponent(userId || "")}/teams/${encodeURIComponent(teamId || "")}/edit`;
}

function renderPlayerLink(user) {
  if (!user?.id) return `<span class="muted-text">-</span>`;
  return `<a class="inline-rule-link" href="${playerUrl(user)}">${escapeHtml(user.login || t("admin.playerHeader"))}</a>`;
}

function renderPublicTeamLink(user, team) {
  if (!user?.id || !team?.id) return `<span class="muted-text">${escapeHtml(team?.name || "-")}</span>`;
  return `<a class="inline-rule-link" href="${playerTeamUrl(user, team)}">${escapeHtml(team.name || t("sidebar.teamHeading"))}</a>`;
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
  if (route.startsWith("overview/")) return "home";
  if (route.startsWith("administration/")) return "administration";
  if (route.startsWith("players/")) return "players";
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
  "Architect of Fate",
  "Brawlin' Brutes",
  "Bribery and Corruption",
  "Explosive Demise",
  "Favoured of...",
  "Low Cost Linemen",
  "Masters of Undeath",
  "Passing Virtuosos",
  "Swarming",
  "Team Captain",
];

const favouredAlignments = [
  {
    name: "Undivided",
    skills: ["Prehensile Tail", "Extra Arms", "Disturbing Presence"],
  },
  {
    name: "Hashut",
    skills: ["Iron Hard Skin", "Horns", "Bone Hook"],
  },
  {
    name: "Slaanesh",
    skills: ["Tentacles", "Foul Appearance", "Extra Arms"],
  },
  {
    name: "Nurgle",
    skills: ["Tentacles", "Monstrous Mouth", "Bone Hook"],
  },
  {
    name: "Khorne",
    skills: ["Horns", "Iron Hard Skin", "Prehensile Tail"],
  },
  {
    name: "Tzeentch",
    skills: ["Two Heads", "Extra Arms", "Very Long Legs"],
  },
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
    favouredChoice: "",
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
    apothecary: 0,
    mortuaryAssistant: 0,
    plagueDoctor: 0,
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
    favouredChoice: state.builder.favouredChoice || "",
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
    apothecary: state.builder.apothecary,
    mortuaryAssistant: state.builder.mortuaryAssistant,
    plagueDoctor: state.builder.plagueDoctor,
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
    favouredChoice: String(roster.favouredChoice ?? ""),
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
    apothecary: countToNumber(roster.apothecary ?? 0),
    mortuaryAssistant: countToNumber(roster.mortuaryAssistant ?? 0),
    plagueDoctor: countToNumber(roster.plagueDoctor ?? 0),
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
    apothecary: countToNumber(purchased.apothecary ?? 0),
    mortuaryAssistant: countToNumber(purchased.mortuaryAssistant ?? 0),
    plagueDoctor: countToNumber(purchased.plagueDoctor ?? 0),
  };
}

function makeRosterPlayer(row, rowIndex, copyIndex = 0, options = {}) {
  return {
    id: makeRosterPlayerId(),
    rowIndex,
    number: String(options.number ?? copyIndex + 1),
    name: `${row.position} ${copyIndex + 1}`,
    statMods: {},
    extraSkills: [],
    favouredSkills: [],
    skipNextGame: false,
    niglingInjury: false,
    isCaptain: false,
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

function normalizeFavouredSkill(skill) {
  if (!skill) return null;
  if (typeof skill === "string") return { name: skill, access: "favoured" };
  if (typeof skill === "object" && skill.name) {
    return {
      name: String(skill.name),
      access: "favoured",
    };
  }
  return null;
}

function normalizePlayerFavouredSkills(row, skills = []) {
  const seen = new Set(row.skills ?? []);
  return skills
    .map(normalizeFavouredSkill)
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
    number: String(player.number ?? fallbackIndex + 1),
    name: String(player.name || `${row.position} ${fallbackIndex + 1}`),
    statMods: { ...(player.statMods ?? {}) },
    extraSkills: normalizePlayerExtraSkills(row, player.extraSkills ?? []),
    favouredSkills: normalizePlayerFavouredSkills(row, player.favouredSkills ?? []),
    skipNextGame: Boolean(player.skipNextGame),
    niglingInjury: Boolean(player.niglingInjury),
    isCaptain: Boolean(player.isCaptain ?? player.captain),
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
        number: edit.number ?? players.length + 1,
        name: edit.name || `${row.position} ${copyIndex + 1}`,
        statMods: edit.statMods ?? {},
        extraSkills: edit.extraSkills ?? [],
        favouredSkills: edit.favouredSkills ?? [],
        skipNextGame: Boolean(edit.skipNextGame),
        niglingInjury: Boolean(edit.niglingInjury),
        isCaptain: Boolean(edit.isCaptain ?? edit.captain),
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
    number: String(player.number ?? index + 1),
    name: player.name || `${row.position} ${index + 1}`,
    statMods: player.statMods ?? {},
    extraSkills: normalizePlayerExtraSkills(row, player.extraSkills ?? []),
    favouredSkills: normalizePlayerFavouredSkills(row, player.favouredSkills ?? []),
    skipNextGame: Boolean(player.skipNextGame),
    niglingInjury: Boolean(player.niglingInjury),
    isCaptain: Boolean(player.isCaptain ?? player.captain),
    spp: normalizeSppCounters(player.spp),
    advancements: normalizePlayerAdvancements(player.advancements),
  };
}

function baseSkillsForPlayer(row) {
  return (row.skills ?? []).map((name) => ({ name, access: "base" }));
}

function skillNamesForPlayer(row, player) {
  const seen = new Set();
  return [
    ...baseSkillsForPlayer(row),
    ...normalizePlayerExtraSkills(row, player.extraSkills ?? []),
    ...normalizePlayerFavouredSkills(row, player.favouredSkills ?? []),
    ...(player.isCaptain ? [{ name: "Pro", access: "captain" }] : []),
  ]
    .map((skill) => skill.name)
    .filter((name) => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
}

function setRosterCaptain(draft, playerId, isCaptain = true) {
  if (!Array.isArray(draft.players)) return;
  draft.players.forEach((player) => {
    player.isCaptain = Boolean(isCaptain && player.id === playerId);
  });
}

function playerStatusText(player) {
  const statuses = [];
  if (player.isCaptain) statuses.push(t("roster.captain"));
  if (player.skipNextGame) statuses.push(t("admin.skipNextGameStatus"));
  if (player.niglingInjury) statuses.push(t("roster.niglingInjury"));
  return statuses.join(", ") || "-";
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
  if (skill?.access === "favoured") return 0;
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
  return matchesQuery(page);
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
          <h1>${t("home.overviewTitle")}</h1>
          <p>${t("home.overviewSubtitle")}</p>
        </div>
      </div>
      <div class="card-grid overview-grid">
        ${activeOverviewCards().map(renderOverviewIndexCard).join("")}
      </div>
    </section>
  `;
}

function activeOverviewCards() {
  return state.locale === "ru" ? overviewCardsRu : overviewCards;
}

function overviewCardUrl(card) {
  return `#/overview/${encodeURIComponent(card.slug)}`;
}

function findOverviewCard(slug = "") {
  return activeOverviewCards().find((card) => card.slug === slug) ?? null;
}

function renderOverviewIndexCard(card) {
  return `
    <a class="card compact overview-index-card" href="${overviewCardUrl(card)}">
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.summary ?? "")}</p>
    </a>
  `;
}

function renderOverviewDetail(slug) {
  const card = findOverviewCard(slug);
  setActiveNav("home");
  setViewSection("home");
  if (!card) {
    view.innerHTML = `
      ${renderHeader(t("home.overviewTitle"), t("overview.pagesSubtitle"), `<a class="primary-button" href="#/">${t("common.back")}</a>`)}
      <div class="empty-state">${t("overview.notFound")}</div>
    `;
    return;
  }
  view.innerHTML = `
    ${renderHeader(card.title, t("home.overviewTitle"), `<a class="primary-button" href="#/">${t("common.back")}</a>`)}
    <article class="content-panel content-body overview-detail">
      ${renderOverviewContent(card)}
    </article>
  `;
}

function renderOverviewContent(card) {
  return `
    <div class="overview-card">
      ${(card.sections ?? []).map(renderOverviewSection).join("")}
    </div>
  `;
}

function renderOverviewSection(section) {
  return `
    <section class="overview-card-section">
      <h3>${escapeHtml(section.title)}</h3>
      <ul class="overview-list">
        ${(section.items ?? []).map((item) => `<li>${renderOverviewItem(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderOverviewItem(item = "") {
  const match = String(item).match(/^([^:]{2,42}):\s+(.+)$/);
  if (!match) return escapeHtml(item);
  return `<strong>${escapeHtml(match[1])}:</strong> ${escapeHtml(match[2])}`;
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
  if (route === "teams") return items.filter(matchesQuery);
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
  if (route === "skills") return renderSkillFilters(route);
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
    return renderTeamCatalogCard(page);
  }
  if (route === "star-players") {
    return renderStarPlayerCatalogCard(page);
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

function renderCatalogField(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${value}</dd>
    </div>
  `;
}

function renderLimitedRuleLinks(items = [], limit = 3) {
  const visible = items.slice(0, limit);
  const extra = items.length - visible.length;
  if (!visible.length) return `<span class="muted-text">-</span>`;
  return `${renderRuleLinks(visible)}${extra > 0 ? `<span class="roster-pill roster-pill-muted">+${extra}</span>` : ""}`;
}

function renderLimitedRosterLinks(items = [], limit = 5) {
  const visible = items.slice(0, limit);
  const extra = items.length - visible.length;
  if (!visible.length) return `<span class="muted-text">-</span>`;
  return `${renderRosterLinks(visible)}${extra > 0 ? `<span class="roster-pill roster-pill-muted">+${extra}</span>` : ""}`;
}

function rowCostRange(rows = []) {
  const costs = [...new Set(rows.map(rowCost).filter(Boolean))]
    .sort((a, b) => costToNumber(a) - costToNumber(b));
  if (!costs.length) return "-";
  if (costs.length === 1) return costs[0];
  return `${costs[0]}-${costs[costs.length - 1]}`;
}

function renderTeamCatalogCard(page) {
  const rows = rowsForTeam(page);
  const leagueOptions = teamLeagueOptions(page);
  const specialRules = teamSpecialRuleTokens(page);
  const positionPreview = rows.slice(0, 3).map((row) => row.position).filter(Boolean);
  const extraPositions = rows.length - positionPreview.length;
  return `
    <article class="card catalog-card team-catalog-card">
      <header class="catalog-card-head">
        <div>
          <span class="catalog-kicker">${escapeHtml(page.team?.type ?? page.tags?.[0] ?? t("sidebar.teamHeading"))}</span>
          <h3><a class="catalog-card-title" href="${pageUrl(page)}">${escapeHtml(page.title)}</a></h3>
        </div>
      </header>
      <dl class="catalog-card-stats">
        ${renderCatalogField(t("catalog.tier"), escapeHtml(page.team?.meta?.league ?? "-"))}
        ${renderCatalogField(t("catalog.positions"), escapeHtml(String(rows.length)))}
        ${renderCatalogField(t("catalog.rerolls"), escapeHtml(page.team?.meta?.rerolls ?? "-"))}
      </dl>
      <section class="catalog-card-section">
        <span>${t("catalog.players")}</span>
        <p>${escapeHtml(positionPreview.join(", ") || t("catalog.noRosterRows"))}${extraPositions > 0 ? ` +${extraPositions}` : ""}</p>
      </section>
      <section class="catalog-card-section">
        <span>${t("catalog.leagueAccess")}</span>
        <div class="catalog-pill-row">${renderLimitedRuleLinks(leagueOptions, 2)}</div>
      </section>
      <section class="catalog-card-section">
        <span>${t("catalog.specialRules")}</span>
        <div class="catalog-pill-row">${renderLimitedRuleLinks(specialRules, 3)}</div>
      </section>
      <footer class="catalog-card-actions">
        <a class="primary-button compact-action" href="${pageUrl(page)}">${t("catalog.open")}</a>
      </footer>
    </article>
  `;
}

function splitStarMarkdownTableRow(line = "") {
  const trimmed = String(line).trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let inWikiLink = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const pair = trimmed.slice(index, index + 2);
    if (pair === "[[") {
      inWikiLink = true;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "]]") {
      inWikiLink = false;
      current += pair;
      index += 1;
      continue;
    }
    const char = trimmed[index];
    if (char === "|" && !inWikiLink) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function cleanMarkdownCell(value = "") {
  return String(value)
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function starPlayerTableData(page) {
  const lines = String(page.body ?? "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /\|\s*MA\s*\|\s*ST\s*\|\s*AG\s*\|\s*PA\s*\|\s*AR/i.test(line));
  if (headerIndex === -1) return {};
  const dataLine = lines.slice(headerIndex + 1).find((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && !/^\|\s*-+/.test(trimmed);
  });
  if (!dataLine) return {};
  const cells = splitStarMarkdownTableRow(dataLine).map(cleanMarkdownCell);
  return {
    ma: cells[0] ?? "",
    st: cells[1] ?? "",
    ag: cells[2] ?? "",
    pa: cells[3] ?? "",
    ar: cells[4] ?? "",
    cost: cells[5] ?? "",
    skills: splitList(cells[6] ?? ""),
    keywords: splitList(cells[7] ?? ""),
  };
}

function renderStarCatalogStats(star) {
  return `
    <dl class="catalog-stat-strip">
      <div><dt>MA</dt><dd>${escapeHtml(star.ma || "-")}</dd></div>
      <div><dt>ST</dt><dd>${escapeHtml(star.st || "-")}</dd></div>
      <div><dt>AG</dt><dd>${escapeHtml(star.ag || "-")}</dd></div>
      <div><dt>PA</dt><dd>${escapeHtml(star.pa || "-")}</dd></div>
      <div><dt>AR</dt><dd>${escapeHtml(star.ar || "-")}</dd></div>
    </dl>
  `;
}

function renderStarPlayerCatalogCard(page) {
  const star = starPlayerTableData(page);
  const cost = page.starPlayer?.cost ?? star.cost ?? "-";
  const availability = page.starPlayer?.availability ?? "-";
  const keywords = star.keywords.length ? star.keywords : (page.tags ?? []).filter((tag) => tag !== "Star Player");
  return `
    <article class="card catalog-card star-catalog-card">
      <header class="catalog-card-head">
        <div>
          <span class="catalog-kicker">Star Player</span>
          <h3><a class="catalog-card-title" href="${pageUrl(page)}">${escapeHtml(page.title)}</a></h3>
        </div>
        <span class="catalog-price">${escapeHtml(cost)}</span>
      </header>
      ${renderStarCatalogStats(star)}
      <section class="catalog-card-section">
        <span>${t("sidebar.availability")}</span>
        <p>${escapeHtml(availability || "-")}</p>
      </section>
      <section class="catalog-card-section">
        <span>${t("roster.skillsLabel")}</span>
        <div class="catalog-pill-row">${renderLimitedRosterLinks(star.skills, 5)}</div>
      </section>
      <section class="catalog-card-section">
        <span>${t("catalog.keywords")}</span>
        <div class="catalog-pill-row">${badgeList(keywords, 4)}</div>
      </section>
      <footer class="catalog-card-actions">
        <a class="primary-button compact-action" href="${pageUrl(page)}">${t("catalog.open")}</a>
      </footer>
    </article>
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
  [ruleLookupKey("Architect of Fate"), "Architect of Fate"],
  [ruleLookupKey("Brawlin' Brutes"), "Brawlin' Brutes"],
  [ruleLookupKey("Brawling Brutes"), "Brawlin' Brutes"],
  [ruleLookupKey("Bribery and Corruption"), "Bribery and Corruption"],
  [ruleLookupKey("Explosive Demise"), "Explosive Demise"],
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

function favouredAlignmentName(value = "") {
  const clean = String(value)
    .replace(/\bFavored\b/g, "Favoured")
    .replace(/^Favoured\s+of/i, "")
    .replace(/\.+$/g, "")
    .trim();
  const key = ruleLookupKey(clean);
  return favouredAlignments.find((alignment) => ruleLookupKey(alignment.name) === key)?.name ?? "";
}

function teamFavouredOptions(team) {
  const rules = teamSpecialRuleTokens(team).filter((rule) => ruleLookupKey(rule).startsWith("favouredof"));
  if (!rules.length) return [];
  if (rules.some((rule) => ruleLookupKey(rule) === ruleLookupKey("Favoured of..."))) {
    return favouredAlignments.map((alignment) => alignment.name);
  }
  const seen = new Set();
  return rules
    .map(favouredAlignmentName)
    .filter((name) => {
      const key = ruleLookupKey(name);
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function ensureDraftFavouredChoice(team, draft) {
  const options = teamFavouredOptions(team);
  if (!options.length) {
    draft.favouredChoice = "";
    return "";
  }
  const current = options.find((option) => ruleLookupKey(option) === ruleLookupKey(draft.favouredChoice));
  draft.favouredChoice = current ?? options[0];
  return draft.favouredChoice;
}

function favouredSkillsForChoice(choice = "") {
  const alignment = favouredAlignments.find((item) => ruleLookupKey(item.name) === ruleLookupKey(choice));
  return alignment?.skills ?? [];
}

function favouredSkillOptionsForPlayer(team, draft, row, player) {
  const choice = ensureDraftFavouredChoice(team, draft);
  if (!choice) return [];
  const taken = new Set(skillNamesForPlayer(row, player));
  return favouredSkillsForChoice(choice)
    .filter((name) => !taken.has(name))
    .map((name) => ({ name, access: "favoured", alignment: choice }));
}

function sanitizeFavouredSkillsForTeam(team, draft) {
  const choice = ensureDraftFavouredChoice(team, draft);
  const allowed = new Set(favouredSkillsForChoice(choice));
  (draft.players ?? []).forEach((player) => {
    const row = rowsForTeam(team)[player.rowIndex];
    if (!row) return;
    const regularSkills = new Set([
      ...(row.skills ?? []),
      ...normalizePlayerExtraSkills(row, player.extraSkills ?? []).map((skill) => skill.name),
    ]);
    player.favouredSkills = normalizePlayerFavouredSkills(row, player.favouredSkills ?? [])
      .filter((skill) => allowed.has(skill.name) && !regularSkills.has(skill.name));
  });
}

function renderTeamRuleAccess(team, draft, controlName = "") {
  const leagueOptions = teamLeagueOptions(team);
  const selectedLeague = ensureDraftLeagueChoice(team, draft);
  const favouredOptions = teamFavouredOptions(team);
  const selectedFavoured = ensureDraftFavouredChoice(team, draft);
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
      ${favouredOptions.length ? `
        <div class="team-rules-row">
          <span>${t("roster.favouredOf")}</span>
          ${favouredOptions.length > 1 ? `
            <select ${controlName ? `data-${controlName}-favoured` : ""}>
              ${favouredOptions.map((option) => renderOption(option, option, selectedFavoured)).join("")}
            </select>
          ` : `<strong>${escapeHtml(selectedFavoured)}</strong>`}
        </div>
      ` : ""}
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
    <article class="content-panel compact-table-panel my-teams-table-panel">
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
    <div class="my-teams-card-list">
      ${teams.map(renderSavedTeamCard).join("")}
    </div>
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
          <strong>${renderPublicTeamLink(state.auth.currentUser, team)}</strong>
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

function renderSavedTeamCard(team) {
  const base = state.data.teams.find((item) => item.slug === team.baseTeamSlug);
  const draft = normalizeSavedRoster(team);
  const rosterTeam = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? base;
  if (rosterTeam) {
    ensureDraftPlayers(rosterTeam, draft);
  }
  const costs = rosterTeam ? calculateRosterCosts(rosterTeam, draft) : null;
  const updated = team.updatedAt ? new Date(team.updatedAt).toLocaleDateString("en-GB") : "-";
  return `
    <article class="card saved-team-card">
      <header class="saved-team-card-head">
        ${team.logoData ? `<img src="${escapeHtml(team.logoData)}" alt="">` : ""}
        <div>
          <h3>${renderPublicTeamLink(state.auth.currentUser, team)}</h3>
          <p>${rosterTeam ? `<a class="inline-rule-link" href="${pageUrl(rosterTeam)}">${escapeHtml(rosterTeam.title)}</a>` : escapeHtml(team.baseTeamSlug || "-")}</p>
        </div>
      </header>
      <dl class="saved-team-card-stats">
        <div><dt>${t("catalog.players")}</dt><dd>${costs ? costs.totalPlayersCount : "-"}</dd></div>
        <div><dt>${t("roster.totalCost")}</dt><dd>${costs ? `${costs.total}k` : "-"}</dd></div>
        <div><dt>${t("footer.updated")}</dt><dd>${escapeHtml(updated)}</dd></div>
      </dl>
      <div class="saved-team-actions">
        <a class="primary-button compact-action" href="#/my-teams/${encodeURIComponent(team.id)}">${t("common.edit")}</a>
        <button class="filter-button compact-action" type="button" data-delete-team="${escapeHtml(team.id)}">${t("common.delete")}</button>
      </div>
    </article>
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

async function loadAdminUsers(force = false) {
  if (!state.auth.currentUser?.isAdmin) {
    state.admin = { users: [], loaded: true, loading: false, error: "", editingTeams: new Map() };
    return;
  }
  if (state.admin.loaded && !force) return;
  state.admin.loading = true;
  state.admin.error = "";
  try {
    const payload = await apiRequest("/api/admin/users");
    state.admin.users = payload.users ?? [];
    state.admin.loaded = true;
  } catch (error) {
    state.admin.error = error.message;
  } finally {
    state.admin.loading = false;
  }
}

async function renderAdministration() {
  setActiveNav("administration");
  setViewSection("administration");
  view.innerHTML = `
    ${renderHeader(t("nav.administration"), t("admin.subtitle"), `<button class="primary-button" type="button" data-admin-refresh>${t("admin.refresh")}</button>`)}
    <div class="loading">${t("admin.loadingPlayers")}</div>
  `;

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.subtitle"))}
      <div class="empty-state">${t("admin.loginRequired")}</div>
    `;
    return;
  }

  if (!state.auth.currentUser.isAdmin) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.subtitle"))}
      <div class="empty-state">${t("admin.accessRequired")}</div>
    `;
    return;
  }

  await loadAdminUsers(true);
  if (state.admin.error) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.subtitle"), `<button class="primary-button" type="button" data-admin-refresh>${t("admin.refresh")}</button>`)}
      <div class="empty-state">${escapeHtml(state.admin.error)}</div>
    `;
    wireAdministration();
    return;
  }

  view.innerHTML = `
    ${renderHeader(t("nav.administration"), t("admin.subtitle"), `<button class="primary-button" type="button" data-admin-refresh>${t("admin.refresh")}</button>`)}
    ${renderAdminUsersTable(state.admin.users)}
  `;
  wireAdministration();
}

function renderAdminUsersTable(users) {
  if (!users.length) return `<div class="empty-state">${t("admin.noPlayersFound")}</div>`;
  return `
    <article class="content-panel compact-table-panel">
      <div class="table-scroll builder-table-scroll">
        <table class="admin-users-table compact-roster-table">
          <thead>
            <tr>
              <th>${t("admin.playerHeader")}</th>
              <th>${t("auth.telegramField")}</th>
              <th>${t("admin.roleHeader")}</th>
              <th>${t("admin.savedTeamsHeader")}</th>
              <th>${t("admin.lastTeamUpdateHeader")}</th>
              <th>${t("roster.actionHeader")}</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(renderAdminUserRow).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderAdminUserRow(user) {
  const updated = user.lastTeamUpdatedAt ? new Date(user.lastTeamUpdatedAt).toLocaleDateString("en-GB") : "-";
  return `
    <tr>
      <td><strong>${renderPlayerLink(user)}</strong></td>
      <td>${escapeHtml(user.telegram || "-")}</td>
      <td>${user.isAdmin ? t("admin.roleAdmin") : t("admin.rolePlayer")}</td>
      <td>${user.savedTeamCount ?? 0}</td>
      <td>${escapeHtml(updated)}</td>
      <td><a class="primary-button compact-action" href="#/administration/users/${encodeURIComponent(user.id)}">${t("admin.profileLink")}</a></td>
    </tr>
  `;
}

async function renderAdminUserProfile(userId) {
  setActiveNav("administration");
  setViewSection("administration");
  view.innerHTML = `
    ${renderHeader(t("nav.administration"), t("admin.playerProfileSubtitle"), `<a class="primary-button" href="#/administration">${t("common.back")}</a>`)}
    <div class="loading">${t("admin.loadingProfile")}</div>
  `;

  if (!state.auth.currentUser?.isAdmin) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.playerProfileSubtitle"), `<a class="primary-button" href="#/administration">${t("common.back")}</a>`)}
      <div class="empty-state">${t("admin.accessRequired")}</div>
    `;
    return;
  }

  try {
    const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`);
    view.innerHTML = `
      ${renderHeader(`${t("admin.playerHeader")} "${payload.user.login}"`, t("admin.savedTeamsAndProfileSubtitle"), `<a class="primary-button" href="#/administration">${t("common.back")}</a>`)}
      <div class="admin-profile-grid">
        ${renderAdminProfileCard(payload.user)}
        ${renderAdminUserManagementPanel(payload.user)}
        <section class="content-panel season-card">
          ${renderAdminCreateTeamForUserPanel(payload.user)}
        </section>
        <section class="content-panel season-card">
          <h2>${t("admin.savedTeamsHeader")}</h2>
          ${renderAdminSavedTeamsTable(payload.teams ?? [], payload.user)}
        </section>
      </div>
    `;
    wireAdminUserProfile(payload.user);
  } catch (error) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.playerProfileSubtitle"), `<a class="primary-button" href="#/administration">${t("common.back")}</a>`)}
      <div class="empty-state">${escapeHtml(error.message)}</div>
    `;
  }
}

function renderAdminProfileCard(user) {
  const created = user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB") : "-";
  const updated = user.lastTeamUpdatedAt ? new Date(user.lastTeamUpdatedAt).toLocaleDateString("en-GB") : "-";
  return `
    <aside class="side-panel admin-profile-card">
      <h2>${t("admin.profileHeading")}</h2>
      <dl class="stat-list">
        <dt>${t("auth.loginField")}</dt><dd>${renderPlayerLink(user)}</dd>
        <dt>${t("auth.telegramField")}</dt><dd>${escapeHtml(user.telegram || "-")}</dd>
        <dt>${t("admin.roleHeader")}</dt><dd>${user.isAdmin ? t("admin.roleAdmin") : t("admin.rolePlayer")}</dd>
        <dt>${t("admin.savedTeamsHeader")}</dt><dd>${user.savedTeamCount ?? 0}</dd>
        <dt>${t("admin.createdHeader")}</dt><dd>${escapeHtml(created)}</dd>
        <dt>${t("admin.lastTeamUpdateHeader")}</dt><dd>${escapeHtml(updated)}</dd>
      </dl>
    </aside>
  `;
}

function renderAdminUserManagementPanel(user) {
  const isCurrentUser = user.id === state.auth.currentUser?.id;
  return `
    <section class="content-panel season-card admin-user-management-panel">
      <h2>${t("admin.manageUserHeading")}</h2>
      <p class="muted-text">${t("admin.manageUserNote")}</p>
      <form class="admin-user-management-form" data-admin-user-management>
        <label class="filter-field">
          <span>${t("admin.nicknameField")}</span>
          <input name="login" type="text" minlength="3" required value="${escapeHtml(user.login || "")}">
        </label>
        <label class="filter-field">
          <span>${t("admin.newPasswordField")}</span>
          <input name="password" type="password" minlength="4" placeholder="${t("admin.newPasswordPlaceholder")}" autocomplete="new-password">
        </label>
        <div class="admin-user-management-actions">
          <button class="primary-button" type="submit">${t("common.save")}</button>
          <button class="filter-button danger-action" type="button" data-admin-delete-user ${isCurrentUser ? "disabled" : ""}>${t("admin.deleteUserAction")}</button>
        </div>
      </form>
      ${isCurrentUser ? `<p class="muted-text">${t("admin.cannotDeleteSelfNote")}</p>` : ""}
    </section>
  `;
}

function renderAdminCreateTeamForUserPanel(user) {
  const teams = state.data.teams ?? [];
  return `
    <h2>${t("admin.createTeamForPlayerHeading")}</h2>
    <p class="muted-text">${t("admin.createTeamForPlayerNotePrefix")} ${escapeHtml(user.login)}${t("admin.createTeamForPlayerNoteSuffix")}</p>
    <div class="season-action-row admin-create-team-row">
      <label class="filter-field">
        <span>${t("admin.rulesTeamField")}</span>
        <select data-admin-create-team-base>
          ${teams.map((team) => renderOption(team.slug, team.title, "")).join("")}
        </select>
      </label>
      <label class="filter-field">
        <span>${t("savedRoster.teamName")}</span>
        <input type="text" data-admin-create-team-name placeholder="${t("admin.newTeamNamePlaceholder")}">
      </label>
      <button class="primary-button" type="button" data-admin-create-user-team="${escapeHtml(user.id)}">${t("myTeams.createTeam")}</button>
    </div>
  `;
}

function wireAdminUserProfile(user) {
  view.querySelector("[data-admin-user-management]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const login = String(form.get("login") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ login, password }),
      });
      if (payload.user?.id === state.auth.currentUser?.id) {
        state.auth.currentUser = { ...state.auth.currentUser, ...payload.user };
        updateAuthButton();
      }
      state.admin.loaded = false;
      alert(t("admin.userUpdatedMessage"));
      renderAdminUserProfile(user.id);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-admin-delete-user]")?.addEventListener("click", async () => {
    if (!confirm(`${t("admin.deleteUserConfirm")} ${user.login}? ${t("admin.deleteUserCascadeWarning")}`)) return;
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      state.admin.loaded = false;
      location.hash = "#/administration";
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-admin-create-user-team]")?.addEventListener("click", async () => {
    const baseTeamSlug = view.querySelector("[data-admin-create-team-base]")?.value;
    const baseTeam = state.data.teams.find((team) => team.slug === baseTeamSlug);
    if (!baseTeam) return;
    const name = String(view.querySelector("[data-admin-create-team-name]")?.value ?? "").trim() || baseTeam.title;
    try {
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/teams`, {
        method: "POST",
        body: JSON.stringify({
          name,
          baseTeamSlug,
          roster: makeSeasonStarterRoster(baseTeam, name),
        }),
      });
      state.admin.loaded = false;
      location.hash = adminTeamEditUrl(user, payload.team);
    } catch (error) {
      alert(error.message);
    }
  });
}

function renderAdminSavedTeamsTable(teams, owner = null) {
  if (!teams.length) return `<p>${t("myTeams.noSavedTeams")}</p>`;
  return `
    <div class="table-scroll builder-table-scroll">
      <table class="admin-teams-table compact-roster-table">
        <thead>
          <tr>
            <th>${t("sidebar.teamHeading")}</th>
            <th>${t("myTeams.table.rules")}</th>
            <th>${t("catalog.players")}</th>
            <th>${t("roster.totalCost")}</th>
            <th>${t("footer.updated")}</th>
            <th>${t("roster.actionHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${teams.map((team) => renderAdminSavedTeamRow(team, owner)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminSavedTeamRow(team, owner = null) {
  const teamOwner = owner ?? team.owner ?? null;
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
          <strong>${teamOwner ? renderPublicTeamLink(teamOwner, team) : escapeHtml(team.name)}</strong>
        </span>
      </td>
      <td>${rosterTeam ? `<a class="inline-rule-link" href="${pageUrl(rosterTeam)}">${escapeHtml(rosterTeam.title)}</a>` : escapeHtml(team.baseTeamSlug || "-")}</td>
      <td>${costs ? costs.totalPlayersCount : "-"}</td>
      <td>${costs ? `${costs.total}k` : "-"}</td>
      <td>${escapeHtml(updated)}</td>
      <td>${state.auth.currentUser?.isAdmin && teamOwner ? `<a class="primary-button compact-action" href="${adminTeamEditUrl(teamOwner, team)}">${t("common.edit")}</a>` : `<span class="muted-text">-</span>`}</td>
    </tr>
  `;
}

async function renderPlayerProfile(userId) {
  setActiveNav("season");
  setViewSection("players");
  view.innerHTML = `
    ${renderHeader(t("admin.playerProfileHeading"), t("admin.savedTeamsAndCoachSubtitle"), `<a class="primary-button" href="#/season">${t("common.back")}</a>`)}
    <div class="loading">${t("admin.loadingPlayer")}</div>
  `;

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("admin.playerProfileHeading"), t("admin.savedTeamsAndCoachSubtitle"))}
      <div class="empty-state">${t("admin.loginToViewProfiles")}</div>
    `;
    return;
  }

  try {
    const payload = await apiRequest(`/api/players/${encodeURIComponent(userId)}`);
    view.innerHTML = `
      ${renderHeader(`${t("admin.playerHeader")} "${payload.user.login}"`, t("admin.savedTeamsAndCoachSubtitle"), `<a class="primary-button" href="#/season">${t("common.back")}</a>`)}
      <div class="admin-profile-grid">
        ${renderAdminProfileCard(payload.user)}
        ${state.auth.currentUser?.isAdmin ? `<section class="content-panel season-card">${renderAdminCreateTeamForUserPanel(payload.user)}</section>` : ""}
        <section class="content-panel season-card">
          <h2>${t("admin.savedTeamsHeader")}</h2>
          ${renderPublicProfileTeamsTable(payload.user, payload.teams ?? [])}
        </section>
      </div>
    `;
    if (state.auth.currentUser?.isAdmin) {
      wireAdminUserProfile(payload.user);
    }
  } catch (error) {
    view.innerHTML = `
      ${renderHeader(t("admin.playerProfileHeading"), t("admin.savedTeamsAndCoachSubtitle"), `<a class="primary-button" href="#/season">${t("common.back")}</a>`)}
      <div class="empty-state">${escapeHtml(error.message)}</div>
    `;
  }
}

function renderPublicProfileTeamsTable(user, teams) {
  if (!teams.length) return `<p>${t("myTeams.noSavedTeams")}</p>`;
  return `
    <div class="table-scroll builder-table-scroll">
      <table class="admin-teams-table compact-roster-table">
        <thead>
          <tr>
            <th>${t("sidebar.teamHeading")}</th>
            <th>${t("myTeams.table.rules")}</th>
            <th>${t("catalog.players")}</th>
            <th>${t("roster.totalCost")}</th>
            <th>${t("footer.updated")}</th>
            ${state.auth.currentUser?.isAdmin ? `<th>${t("roster.actionHeader")}</th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${teams.map((team) => renderPublicProfileTeamRow(user, team)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPublicProfileTeamRow(user, team) {
  const base = state.data.teams.find((item) => item.slug === team.baseTeamSlug);
  const draft = normalizeSavedRoster(team);
  const rosterTeam = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? base;
  if (rosterTeam) ensureDraftPlayers(rosterTeam, draft);
  const costs = rosterTeam ? calculateRosterCosts(rosterTeam, draft) : null;
  const updated = team.updatedAt ? new Date(team.updatedAt).toLocaleDateString("en-GB") : "-";
  return `
    <tr>
      <td>
        <span class="saved-team-name-cell">
          ${team.logoData ? `<img src="${escapeHtml(team.logoData)}" alt="">` : ""}
          <strong>${renderPublicTeamLink(user, team)}</strong>
        </span>
      </td>
      <td>${rosterTeam ? `<a class="inline-rule-link" href="${pageUrl(rosterTeam)}">${escapeHtml(rosterTeam.title)}</a>` : escapeHtml(team.baseTeamSlug || "-")}</td>
      <td>${costs ? costs.totalPlayersCount : "-"}</td>
      <td>${costs ? `${costs.total}k` : "-"}</td>
      <td>${escapeHtml(updated)}</td>
      ${state.auth.currentUser?.isAdmin ? `<td><a class="primary-button compact-action" href="${adminTeamEditUrl(user, team)}">${t("common.edit")}</a></td>` : ""}
    </tr>
  `;
}

async function renderPublicTeamProfile(userId, teamId) {
  setActiveNav("season");
  setViewSection("players");
  view.innerHTML = `
    ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"), `<a class="primary-button" href="${playerUrl(userId)}">${t("common.back")}</a>`)}
    <div class="loading">${t("myTeams.loadingTeam")}</div>
  `;

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"))}
      <div class="empty-state">${t("admin.loginToViewSavedTeams")}</div>
    `;
    return;
  }

  try {
    const payload = await apiRequest(`/api/players/${encodeURIComponent(userId)}/teams/${encodeURIComponent(teamId)}`);
    const draft = normalizeSavedRoster(payload.team);
    const team = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? state.data.teams[0];
    ensureDraftLeagueChoice(team, draft);
    ensureDraftPlayers(team, draft);
    const costs = calculateRosterCosts(team, draft);
    const actions = `
      <a class="primary-button" href="${playerUrl(payload.user)}">${t("common.back")}</a>
      ${state.auth.currentUser?.isAdmin ? `<a class="primary-button" href="${adminTeamEditUrl(payload.user, payload.team)}">${t("admin.editTeamAction")}</a>` : ""}
    `;
    view.innerHTML = `
      ${renderHeader(`${t("sidebar.teamHeading")} "${payload.team.name}"`, `${t("admin.coachHeading")}: ${payload.user.login}`, actions)}
      ${renderPublicTeamOverview(payload.user, payload.team, team, draft, costs)}
      <section class="content-panel compact-table-panel">
        <h2>${t("savedRoster.rosterHeading")}</h2>
        ${renderPublicTeamRosterTable(team, draft)}
      </section>
    `;
  } catch (error) {
    view.innerHTML = `
      ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"), `<a class="primary-button" href="${playerUrl(userId)}">${t("common.back")}</a>`)}
      <div class="empty-state">${escapeHtml(error.message)}</div>
    `;
  }
}

function renderPublicTeamOverview(user, savedTeam, team, draft, costs) {
  return `
    <section class="public-team-overview side-panel">
      ${draft.logoData ? `<div class="summary-logo-block public-team-logo-block"><img src="${escapeHtml(draft.logoData)}" alt=""></div>` : ""}
      <div class="public-team-overview-grid">
        <div class="public-team-summary-block">
          <div class="summary-title-block">
            <h3>${t("savedRoster.summaryTitle")}</h3>
            <a class="builder-team-link" href="${playerTeamUrl(user, savedTeam)}">${escapeHtml(savedTeam.name)}</a>
          </div>
          <dl class="stat-list summary-stat-grid">
            <dt>${t("savedRoster.activePlayers")}</dt><dd>${costs.playersCount}</dd>
            <dt>${t("savedRoster.totalPlayers")}</dt><dd>${costs.totalPlayersCount}</dd>
            <dt>${t("savedRoster.teamRerolls")}</dt><dd>${draft.teamRerolls ?? 0}</dd>
            ${hasBribery(team) ? `<dt>${t("savedRoster.bribes")}</dt><dd>${countToNumber(draft.bribes)}</dd>` : ""}
            <dt>${t("savedRoster.dedicatedFans")}</dt><dd>${countToNumber(draft.dedicatedFans)}</dd>
            <dt>${t("savedRoster.treasury")}</dt><dd>${countToNumber(draft.treasury)}k</dd>
            <dt>${t("roster.totalCost")}</dt><dd>${costs.total}k</dd>
          </dl>
        </div>
        <div class="public-team-coach-block">
          <h2>${t("admin.coachHeading")}</h2>
          <p>${renderPlayerLink(user)}</p>
          ${renderTeamRuleAccess(team, draft)}
        </div>
      </div>
    </section>
  `;
}

function renderPublicTeamSummary(user, savedTeam, team, draft, costs) {
  return `
    <aside class="builder-summary saved-roster-summary-panel side-panel">
      ${draft.logoData ? `<div class="summary-logo-block"><img src="${escapeHtml(draft.logoData)}" alt=""></div>` : ""}
      <div class="summary-title-block">
        <h3>${t("savedRoster.summaryTitle")}</h3>
        <a class="builder-team-link" href="${playerTeamUrl(user, savedTeam)}">${escapeHtml(savedTeam.name)}</a>
      </div>
      <dl class="stat-list summary-stat-grid">
        <dt>${t("admin.coachHeading")}</dt><dd>${renderPlayerLink(user)}</dd>
        <dt>${t("myTeams.table.rules")}</dt><dd><a class="inline-rule-link" href="${pageUrl(team)}">${escapeHtml(team.title)}</a></dd>
        <dt>${t("savedRoster.activePlayers")}</dt><dd>${costs.playersCount}</dd>
        <dt>${t("savedRoster.totalPlayers")}</dt><dd>${costs.totalPlayersCount}</dd>
        <dt>${t("savedRoster.teamRerolls")}</dt><dd>${draft.teamRerolls ?? 0}</dd>
        ${hasBribery(team) ? `<dt>${t("savedRoster.bribes")}</dt><dd>${countToNumber(draft.bribes)}</dd>` : ""}
        <dt>${t("savedRoster.dedicatedFans")}</dt><dd>${countToNumber(draft.dedicatedFans)}</dd>
        <dt>${t("savedRoster.treasury")}</dt><dd>${countToNumber(draft.treasury)}k</dd>
        <dt>${t("roster.totalCost")}</dt><dd>${costs.total}k</dd>
      </dl>
    </aside>
  `;
}

function renderPublicTeamRosterTable(team, draft) {
  const players = selectedRosterPlayers(team, draft);
  if (!players.length) return `<p>${t("savedRoster.noPlayersYet")}</p>`;
  return `
    <div class="table-scroll builder-table-scroll">
      <table class="compact-roster-table public-roster-table">
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
            <th>${t("admin.statusHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player, index) => `
            <tr>
              <td>${index + 1}</td>
              <td><strong>${escapeHtml(player.name)}</strong></td>
              <td>${escapeHtml(player.row.position)}</td>
              <td>${escapeHtml(statValueForDisplayByStat("ma", player.row.ma, player.statMods.ma ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("st", player.row.st, player.statMods.st ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("ag", player.row.ag, player.statMods.ag ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("pa", player.row.pa, player.statMods.pa ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("ar", player.row.ar, player.statMods.ar ?? 0))}</td>
              <td class="skills-cell">${renderRosterLinks(skillNamesForPlayer(player.row, player))}</td>
              <td>${playerCurrentCost(player.row, player, true)}k</td>
              <td>${escapeHtml(playerStatusText(player))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function wireAdministration() {
  view.querySelector("[data-admin-refresh]")?.addEventListener("click", () => {
    state.admin.loaded = false;
    renderAdministration();
  });
}

async function loadSeason(force = false) {
  if (!state.auth.currentUser) {
    state.season = { ...state.season, data: null, loaded: true, loading: false, error: "" };
    return;
  }
  if (state.season.loaded && !force) return;
  state.season.loading = true;
  state.season.error = "";
  try {
    state.season.data = await apiRequest("/api/season");
    state.season.loaded = true;
  } catch (error) {
    state.season.error = error.message;
  } finally {
    state.season.loading = false;
  }
}

function seasonEntryMap(data) {
  return new Map((data.entries ?? []).map((entry) => [entry.id, entry]));
}

function seasonEntryLabel(entry) {
  if (!entry) return "-";
  return `${entry.user.login} · ${entry.team.name}`;
}

function seasonTeamRulesLink(entry) {
  const team = state.data.teams.find((item) => item.slug === entry?.team?.baseTeamSlug);
  return team
    ? `<a class="inline-rule-link" href="${pageUrl(team)}">${escapeHtml(team.title)}</a>`
    : escapeHtml(entry?.team?.baseTeamSlug || "-");
}

function seasonTeamProfileLink(entry) {
  return entry ? renderPublicTeamLink(entry.user, entry.team) : `<span class="muted-text">-</span>`;
}

function makeSeasonStarterRoster(team, name) {
  const draft = emptyBuilderState(team);
  draft.teamName = name || team.title;
  draft.selectedLeague = teamLeagueOptions(team)[0] ?? "";
  return draft;
}

const seasonTabDefinitions = [
  { id: "registration", labelKey: "season.tab.registration" },
  { id: "fixture", labelKey: "season.tab.fixture" },
  { id: "standings", labelKey: "season.tab.standings" },
  { id: "schedule", labelKey: "season.tab.schedule" },
  { id: "administration", labelKey: "nav.administration", adminOnly: true },
];

function availableSeasonTabs() {
  return seasonTabDefinitions.filter((tab) => !tab.adminOnly || state.auth.currentUser?.isAdmin);
}

function normalizeSeasonTab(tabId = "") {
  const tabs = availableSeasonTabs();
  return tabs.some((tab) => tab.id === tabId) ? tabId : tabs[0]?.id ?? "registration";
}

function renderSeasonTabs(activeTab) {
  return `
    <div class="season-tabs" role="tablist" aria-label="${t("season.sectionsAriaLabel")}">
      ${availableSeasonTabs().map((tab) => `
        <button
          class="season-tab ${tab.id === activeTab ? "active" : ""}"
          type="button"
          role="tab"
          aria-selected="${tab.id === activeTab ? "true" : "false"}"
          data-season-tab="${escapeHtml(tab.id)}"
        >${t(tab.labelKey)}</button>
      `).join("")}
    </div>
  `;
}

function renderSeasonTabContent(data, activeTab) {
  if (activeTab === "fixture") return renderLeagueFixture(data);
  if (activeTab === "standings") return renderSeasonStandings(data);
  if (activeTab === "schedule") return renderSeasonRounds(data);
  if (activeTab === "administration" && state.auth.currentUser?.isAdmin) return renderSeasonAdmin(data);
  return renderSeasonRegistration(data);
}

async function renderSeason(refresh = true) {
  setActiveNav("season");
  setViewSection("season");
  view.innerHTML = `
    ${renderHeader(t("nav.season"), t("season.subtitle"), `<button class="primary-button" type="button" data-season-refresh>${t("admin.refresh")}</button>`)}
    <div class="loading">${t("season.loading")}</div>
  `;

  await loadSeason(refresh);

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("nav.season"), t("season.subtitle"))}
      <div class="empty-state">${t("season.loginToCommit")}</div>
    `;
    return;
  }

  if (state.season.error) {
    view.innerHTML = `
      ${renderHeader(t("nav.season"), t("season.subtitle"), `<button class="primary-button" type="button" data-season-refresh>${t("admin.refresh")}</button>`)}
      <div class="empty-state">${escapeHtml(state.season.error)}</div>
    `;
    wireSeason();
    return;
  }

  const data = state.season.data ?? {};
  const activeTab = normalizeSeasonTab(state.season.activeTab);
  state.season.activeTab = activeTab;
  view.innerHTML = `
    ${renderHeader(t("nav.season"), `${data.season?.name ?? t("season.defaultName")} · ${t("season.swissPairingControl")}`, `<button class="primary-button" type="button" data-season-refresh>${t("admin.refresh")}</button>`)}
    ${renderSeasonTabs(activeTab)}
    ${renderSeasonTabContent(data, activeTab)}
  `;
  wireSeason();
}

function renderSeasonRegistration(data) {
  return `
    <div class="season-overview-grid">
      ${renderSeasonCommitPanel(data)}
      ${state.auth.currentUser?.isAdmin ? renderSeasonRegistrationAdminPanel(data) : ""}
      <section class="content-panel season-card">
        <h2>${t("season.registeredTeamsHeading")}</h2>
        ${renderSeasonEntriesTable(data, Boolean(state.auth.currentUser?.isAdmin))}
      </section>
    </div>
  `;
}

function availableSeasonSavedTeams(data) {
  const admin = data.admin ?? { savedTeams: [] };
  const committedTeamIds = new Set((data.entries ?? []).map((entry) => entry.team.id));
  const committedUserIds = new Set((data.entries ?? []).map((entry) => entry.user.id));
  return admin.savedTeams.filter((team) => !committedTeamIds.has(team.id) && !committedUserIds.has(team.owner.id));
}

function renderSeasonRegistrationAdminPanel(data) {
  const availableSavedTeams = availableSeasonSavedTeams(data);
  return `
    <section class="content-panel season-card">
      <h2>${t("season.adminRegistrationHeading")}</h2>
      ${availableSavedTeams.length ? `
        <p>${t("season.addSavedTeamNote")}</p>
        <div class="season-action-row">
          <label class="filter-field">
            <span>${t("season.savedTeamField")}</span>
            <select data-season-admin-team>
              ${availableSavedTeams.map((team) => renderOption(team.id, `${team.owner.login} · ${team.name}`, "")).join("")}
            </select>
          </label>
          <button class="primary-button" type="button" data-season-admin-add-team>${t("season.addTeamAction")}</button>
        </div>
      ` : `<p>${t("season.noEligibleSavedTeams")}</p>`}
    </section>
  `;
}

function renderSeasonCommitPanel(data) {
  const myEntry = data.myEntry;
  const teams = data.myTeams ?? [];
  if (myEntry) {
    return `
      <section class="content-panel season-card">
        <h2>${t("season.yourTeamHeading")}</h2>
        <div class="season-committed-team">
          ${myEntry.team.logoData ? `<img src="${escapeHtml(myEntry.team.logoData)}" alt="">` : ""}
          <div>
            <strong>${escapeHtml(myEntry.team.name)}</strong>
            <p>${seasonTeamRulesLink(myEntry)}</p>
            <p class="muted-text">${t("season.committedAs")} ${escapeHtml(myEntry.user.login)}.</p>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="content-panel season-card">
      <h2>${t("season.commitTeamHeading")}</h2>
      ${teams.length ? `
        <p>${t("season.selectSavedTeamNote")}</p>
        <div class="season-action-row">
          <label class="filter-field">
            <span>${t("season.savedTeamField")}</span>
            <select data-season-commit-team>
              ${teams.map((team) => renderOption(team.id, team.name, "")).join("")}
            </select>
          </label>
          <button class="primary-button" type="button" data-season-commit>${t("season.commitAction")}</button>
        </div>
      ` : `
        <p>${t("myTeams.noSavedTeams")}</p>
        <a class="primary-button" href="#/builder">${t("myTeams.createTeam")}</a>
      `}
    </section>
  `;
}

function pairingEntry(data, entryId) {
  return (data.entries ?? []).find((entry) => entry.id === entryId) ?? null;
}

function pairingTeamCell(data, entryId) {
  const entry = pairingEntry(data, entryId);
  if (!entry) return `<span class="muted-text">${t("season.emptySlotLabel")}</span>`;
  return `
    <span class="season-pairing-team">
      <strong>${seasonTeamProfileLink(entry)}</strong>
      <span>${renderPlayerLink(entry.user)} · ${seasonTeamRulesLink(entry)}</span>
    </span>
  `;
}

function pairingLeaguePoints(pairing) {
  const home = pairing.homePoints ?? "-";
  const away = pairing.awayPoints ?? "-";
  return `${home} / ${away}`;
}

function pairingTouchdowns(pairing) {
  const home = pairing.homeTouchdowns ?? "-";
  const away = pairing.awayTouchdowns ?? "-";
  return `${home} / ${away}`;
}

function pairingCasualties(pairing) {
  const home = pairing.homeCasualties ?? "-";
  const away = pairing.awayCasualties ?? "-";
  return `${home} / ${away}`;
}

function currentFixtureForData(data) {
  if (!data.myEntry) return null;
  if (data.currentFixture) return data.currentFixture;
  return [...(data.rounds ?? [])]
    .filter((round) => round.status === "started")
    .sort((a, b) => b.roundNumber - a.roundNumber)
    .flatMap((round) => round.pairings)
    .find((pairing) => pairing.homeEntryId === data.myEntry.id || pairing.awayEntryId === data.myEntry.id) ?? null;
}

function renderLeagueFixture(data) {
  const myEntry = data.myEntry;
  if (!myEntry) {
    return `
      <section class="content-panel season-card">
        <h2>${t("season.leagueFixtureHeading")}</h2>
        <p>${t("season.commitFirstNote")}</p>
      </section>
    `;
  }

  const fixture = currentFixtureForData(data);
  if (!fixture) {
    return `
      <section class="content-panel season-card">
        <h2>${t("season.leagueFixtureHeading")}</h2>
        <p>${t("season.noActivePairingNote")}</p>
      </section>
    `;
  }

  const home = pairingEntry(data, fixture.homeEntryId);
  const away = pairingEntry(data, fixture.awayEntryId);
  const isHome = fixture.homeEntryId === myEntry.id;
  const opponent = isHome ? away : home;
  return `
    <section class="content-panel season-card">
      <h2>${t("season.leagueFixtureHeading")}</h2>
      <div class="fixture-headline">
        <div>
          <span class="muted-text">${t("season.roundLabel")} ${fixture.roundNumber} · ${t("season.tableLabel")} ${fixture.tableNumber}</span>
          <strong>${seasonTeamProfileLink(myEntry)}</strong>
        </div>
        <div>
          <span class="muted-text">${t("season.opponentLabel")}</span>
          ${opponent ? `
            <strong>${seasonTeamProfileLink(opponent)}</strong>
            <p>${renderPlayerLink(opponent.user)} · ${seasonTeamRulesLink(opponent)}</p>
          ` : `<strong>${t("season.byeLabel")}</strong>`}
        </div>
      </div>

      <div class="season-score-summary">
        <span>${t("season.touchdownsLabel")}: <strong>${escapeHtml(pairingTouchdowns(fixture))}</strong></span>
        <span>${t("season.casualtiesLabel")}: <strong>${escapeHtml(pairingCasualties(fixture))}</strong></span>
        <span>${t("season.leaguePointsLabel")}: <strong>${escapeHtml(pairingLeaguePoints(fixture))}</strong></span>
      </div>

      ${opponent ? renderFixtureResultForm(fixture) : `<p>${t("season.oneTeamFixtureNote")}</p>`}
    </section>
  `;
}

function renderFixtureResultForm(pairing) {
  return `
    <div class="fixture-result-form" data-fixture-row="${escapeHtml(pairing.id)}">
      <label class="filter-field">
        <span>${t("season.homeTouchdownsField")}</span>
        <input type="number" min="0" step="1" value="${escapeHtml(pairing.homeTouchdowns ?? "")}" data-fixture-home-td>
      </label>
      <label class="filter-field">
        <span>${t("season.awayTouchdownsField")}</span>
        <input type="number" min="0" step="1" value="${escapeHtml(pairing.awayTouchdowns ?? "")}" data-fixture-away-td>
      </label>
      <label class="filter-field">
        <span>${t("season.homeCasualtiesField")}</span>
        <input type="number" min="0" step="1" value="${escapeHtml(pairing.homeCasualties ?? "")}" data-fixture-home-casualties>
      </label>
      <label class="filter-field">
        <span>${t("season.awayCasualtiesField")}</span>
        <input type="number" min="0" step="1" value="${escapeHtml(pairing.awayCasualties ?? "")}" data-fixture-away-casualties>
      </label>
      <button class="primary-button" type="button" data-save-fixture="${escapeHtml(pairing.id)}">${t("season.submitResultAction")}</button>
    </div>
  `;
}

function renderSeasonEntriesTable(data, adminActions = false) {
  const entries = data.entries ?? [];
  if (!entries.length) return `<p>${t("season.noTeamsCommittedYet")}</p>`;
  return `
    <div class="table-scroll">
      <table class="compact-roster-table season-table">
        <thead>
          <tr>
            <th>${t("admin.coachHeading")}</th>
            <th>${t("sidebar.teamHeading")}</th>
            <th>${t("myTeams.table.rules")}</th>
            ${adminActions ? `<th>${t("roster.actionHeader")}</th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${entries.map((entry) => `
            <tr>
              <td>${renderPlayerLink(entry.user)}</td>
              <td><strong>${seasonTeamProfileLink(entry)}</strong></td>
              <td>${seasonTeamRulesLink(entry)}</td>
              ${adminActions ? `<td><button class="filter-button compact-action" type="button" data-season-remove-entry="${escapeHtml(entry.id)}">${t("common.remove")}</button></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSeasonStandings(data) {
  const standings = data.standings ?? [];
  return `
    <section class="content-panel season-card">
      <h2>${t("season.tab.standings")}</h2>
      <p class="muted-text">${t("season.scoringNote")}</p>
      ${standings.length ? `
        <div class="table-scroll">
          <table class="compact-roster-table season-table">
            <thead>
              <tr>
                <th>#</th>
                <th>${t("admin.coachHeading")}</th>
                <th>${t("sidebar.teamHeading")}</th>
                <th>${t("season.gamesHeader")}</th>
                <th>${t("season.leaguePointsLabel")}</th>
                <th>${t("season.byesHeader")}</th>
              </tr>
            </thead>
            <tbody>
              ${standings.map((standing) => `
                <tr>
                  <td>${standing.rank}</td>
                  <td>${renderPlayerLink(standing.user)}</td>
                  <td><strong>${renderPublicTeamLink(standing.user, standing.team)}</strong></td>
                  <td>${standing.games}</td>
                  <td>${standing.points}</td>
                  <td>${standing.byes}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<p>${t("season.noTeamsCommittedYet")}</p>`}
    </section>
  `;
}

function renderSeasonRounds(data, adminMode = false) {
  const rounds = data.rounds ?? [];
  if (!rounds.length) {
    return `
      <section class="content-panel season-card">
        <h2>${adminMode ? t("season.pairingControlsHeading") : t("season.tab.schedule")}</h2>
        <p>${t("season.noRoundsGeneratedNote")}</p>
      </section>
    `;
  }

  return `
    <section class="season-rounds">
      ${rounds.map((round) => `
        <article class="content-panel season-card">
          <header class="season-round-header">
            <div>
              <h2>${t("season.roundLabel")} ${round.roundNumber}</h2>
              <span class="season-status-pill" data-status="${escapeHtml(round.status)}">${escapeHtml(round.status)}</span>
            </div>
            ${adminMode ? renderSeasonRoundActions(round) : ""}
          </header>
          <div class="table-scroll">
            <table class="compact-roster-table season-table">
              <thead>
                ${adminMode ? `
                  <tr>
                    <th>${t("season.tableLabel")}</th>
                    <th>${t("season.homeLabel")}</th>
                    <th>${t("season.awayLabel")}</th>
                    <th>${t("season.resultHeader")}</th>
                    <th>${t("season.tdHeader")}</th>
                    <th>${t("season.casualtiesHeader")}</th>
                    <th>${t("season.leaguePointsLabel")}</th>
                    <th>${t("roster.actionHeader")}</th>
                  </tr>
                ` : `
                  <tr>
                    <th>${t("season.tableLabel")}</th>
                    <th>${t("season.homeLabel")}</th>
                    <th>${t("season.tdHeader")}</th>
                    <th>${t("season.casualtiesHeader")}</th>
                    <th>${t("season.leaguePointsLabel")}</th>
                    <th>${t("season.awayLabel")}</th>
                  </tr>
                `}
              </thead>
              <tbody>
                ${round.pairings.map((pairing) => renderSeasonPairingRow(data, round, pairing, adminMode)).join("")}
              </tbody>
            </table>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderSeasonRoundActions(round) {
  return `
    <div class="season-round-actions">
      ${round.status === "draft" ? `
        <button class="primary-button compact-action" type="button" data-season-start-round="${escapeHtml(round.id)}">${t("season.startRoundAction")}</button>
        <button class="filter-button compact-action" type="button" data-season-add-pairing="${escapeHtml(round.id)}">${t("season.addEmptyPairingAction")}</button>
      ` : ""}
      <button class="filter-button compact-action" type="button" data-season-delete-round="${escapeHtml(round.id)}">${t("season.deleteRoundAction")}</button>
    </div>
  `;
}

function renderSeasonPairingRow(data, round, pairing, adminMode = false) {
  const home = pairingEntry(data, pairing.homeEntryId);
  const away = pairingEntry(data, pairing.awayEntryId);
  const isBye = !away;
  const homeValue = pairing.homePoints ?? "";
  const awayValue = pairing.awayPoints ?? "";
  if (!adminMode) {
    return `
      <tr>
        <td>${pairing.tableNumber}</td>
        <td>${pairingTeamCell(data, pairing.homeEntryId)}</td>
        <td>${escapeHtml(pairingTouchdowns(pairing))}</td>
        <td>${escapeHtml(pairingCasualties(pairing))}</td>
        <td>${escapeHtml(pairingLeaguePoints(pairing))}</td>
        <td>${isBye ? `<strong>${t("season.byeLabel")}</strong>` : pairingTeamCell(data, pairing.awayEntryId)}</td>
      </tr>
    `;
  }

  const locked = round.status !== "draft";
  const resultLocked = round.status !== "started";
  return `
    <tr data-pairing-row="${escapeHtml(pairing.id)}">
      <td>${pairing.tableNumber}</td>
      <td>${renderSeasonEntrySelect(data, "home-entry", pairing.homeEntryId, locked)}</td>
      <td>${renderSeasonEntrySelect(data, "away-entry", pairing.awayEntryId, locked)}</td>
      <td>
        <select class="table-select" data-result-type ${resultLocked ? "disabled" : ""}>
          ${renderOption("played", t("season.resultPlayed"), pairing.resultType)}
          ${renderOption("technical_home", t("season.resultTechnicalHome"), pairing.resultType)}
          ${renderOption("technical_away", t("season.resultTechnicalAway"), pairing.resultType)}
        </select>
      </td>
      <td>
        <div class="season-td-pair">
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.homeTouchdowns ?? "")}" data-home-td ${resultLocked ? "disabled" : ""}>
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.awayTouchdowns ?? "")}" data-away-td ${resultLocked ? "disabled" : ""}>
        </div>
      </td>
      <td>
        <div class="season-td-pair">
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.homeCasualties ?? "")}" data-home-casualties ${resultLocked ? "disabled" : ""}>
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.awayCasualties ?? "")}" data-away-casualties ${resultLocked ? "disabled" : ""}>
        </div>
      </td>
      <td>${escapeHtml(pairingLeaguePoints(pairing))}</td>
      <td>
        <div class="table-actions">
          <button class="filter-button compact-action" type="button" data-save-season-pairing="${escapeHtml(pairing.id)}">${t("season.saveAction")}</button>
          <button class="filter-button compact-action" type="button" data-delete-season-pairing="${escapeHtml(pairing.id)}">${t("common.delete")}</button>
        </div>
      </td>
    </tr>
  `;
}

function renderSeasonEntrySelect(data, name, selected, disabled = false) {
  return `
    <select class="table-select" data-${name} ${disabled ? "disabled" : ""}>
      ${renderOption("", t("season.emptySlotLabel"), selected ?? "")}
      ${(data.entries ?? []).map((entry) => renderOption(entry.id, seasonEntryLabel(entry), selected ?? "")).join("")}
    </select>
  `;
}

function renderSeasonAdmin(data) {
  const admin = data.admin ?? { users: [], savedTeams: [] };
  const committedUserIds = new Set((data.entries ?? []).map((entry) => entry.user.id));
  const availableSavedTeams = availableSeasonSavedTeams(data);
  const availableUsers = admin.users.filter((user) => !committedUserIds.has(user.id));
  const teams = state.data.teams ?? [];
  return `
    <div class="season-admin-stack">
      <section class="content-panel season-card season-admin-panel">
        <h2>${t("season.adminControlsHeading")}</h2>
        <div class="season-admin-grid">
          <div class="season-admin-block">
            <h3>${t("season.tab.schedule")}</h3>
            <p>${t("season.roundsAdminNote")}</p>
            <button class="primary-button" type="button" data-season-generate-round>${t("season.generateNextRoundAction")}</button>
            <button class="filter-button" type="button" data-season-create-round>${t("season.createEmptyRoundAction")}</button>
          </div>

          <div class="season-admin-block">
            <h3>${t("season.addSavedTeamHeading")}</h3>
            ${availableSavedTeams.length ? `
              <label class="filter-field">
                <span>${t("season.savedTeamField")}</span>
                <select data-season-admin-team>
                  ${availableSavedTeams.map((team) => renderOption(team.id, `${team.owner.login} · ${team.name}`, "")).join("")}
                </select>
              </label>
              <button class="primary-button" type="button" data-season-admin-add-team>${t("season.addTeamAction")}</button>
            ` : `<p>${t("season.noEligibleSavedTeams")}</p>`}
          </div>

          <div class="season-admin-block">
            <h3>${t("season.createTeamForCoachHeading")}</h3>
            ${availableUsers.length ? `
              <label class="filter-field">
                <span>${t("admin.coachHeading")}</span>
                <select data-season-admin-user>
                  ${availableUsers.map((user) => renderOption(user.id, user.login, "")).join("")}
                </select>
              </label>
              <label class="filter-field">
                <span>${t("admin.rulesTeamField")}</span>
                <select data-season-admin-base-team>
                  ${teams.map((team) => renderOption(team.slug, team.title, "")).join("")}
                </select>
              </label>
              <label class="filter-field">
                <span>${t("savedRoster.teamName")}</span>
                <input type="text" data-season-admin-team-name placeholder="${t("season.newRosterNamePlaceholder")}">
              </label>
              <button class="primary-button" type="button" data-season-admin-create-team>${t("season.createAndCommitAction")}</button>
            ` : `<p>${t("season.everyCoachCommittedNote")}</p>`}
          </div>
        </div>
      </section>

      ${renderSeasonRounds(data, true)}

      <section class="content-panel season-card">
        <h2>${t("season.committedTeamsHeading")}</h2>
        ${renderSeasonAdminEntries(data)}
      </section>
    </div>
  `;
}

function renderSeasonAdminEntries(data) {
  return renderSeasonEntriesTable(data, true);
}

function replaceSeasonData(payload) {
  state.season.data = payload;
  state.season.loaded = true;
}

function wireSeason() {
  view.querySelector("[data-season-refresh]")?.addEventListener("click", () => {
    state.season.loaded = false;
    renderSeason(true);
  });

  view.querySelectorAll("[data-season-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.season.activeTab = normalizeSeasonTab(button.dataset.seasonTab);
      renderSeason(false);
    });
  });

  view.querySelector("[data-season-commit]")?.addEventListener("click", async () => {
    const teamId = view.querySelector("[data-season-commit-team]")?.value;
    if (!teamId) return;
    try {
      replaceSeasonData(await apiRequest("/api/season/commit", {
        method: "POST",
        body: JSON.stringify({ teamId }),
      }));
      renderSeason(false);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-season-admin-add-team]")?.addEventListener("click", async () => {
    const teamId = view.querySelector("[data-season-admin-team]")?.value;
    if (!teamId) return;
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/entries", {
        method: "POST",
        body: JSON.stringify({ teamId }),
      }));
      renderSeason(false);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-season-admin-create-team]")?.addEventListener("click", async () => {
    const userId = view.querySelector("[data-season-admin-user]")?.value;
    const baseTeamSlug = view.querySelector("[data-season-admin-base-team]")?.value;
    const baseTeam = state.data.teams.find((team) => team.slug === baseTeamSlug);
    if (!userId || !baseTeam) return;
    const name = String(view.querySelector("[data-season-admin-team-name]")?.value ?? "").trim() || baseTeam.title;
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/create-team", {
        method: "POST",
        body: JSON.stringify({
          userId,
          name,
          baseTeamSlug,
          roster: makeSeasonStarterRoster(baseTeam, name),
        }),
      }));
      state.myTeams.loaded = false;
      renderSeason(false);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-season-generate-round]")?.addEventListener("click", async () => {
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/rounds/generate", {
        method: "POST",
        body: "{}",
      }));
      renderSeason(false);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-season-create-round]")?.addEventListener("click", async () => {
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/rounds", {
        method: "POST",
        body: "{}",
      }));
      renderSeason(false);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelectorAll("[data-season-start-round]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/rounds/${button.dataset.seasonStartRound}/start`, {
          method: "POST",
          body: "{}",
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  view.querySelectorAll("[data-season-delete-round]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(t("season.confirmDeleteRound"))) return;
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/rounds/${button.dataset.seasonDeleteRound}`, {
          method: "DELETE",
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  view.querySelectorAll("[data-season-add-pairing]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/rounds/${button.dataset.seasonAddPairing}/pairings`, {
          method: "POST",
          body: JSON.stringify({ homeEntryId: "", awayEntryId: "" }),
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  view.querySelectorAll("[data-save-fixture]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-fixture-row]");
      const homeTouchdowns = row?.querySelector("[data-fixture-home-td]")?.value ?? "";
      const awayTouchdowns = row?.querySelector("[data-fixture-away-td]")?.value ?? "";
      const homeCasualties = row?.querySelector("[data-fixture-home-casualties]")?.value ?? "";
      const awayCasualties = row?.querySelector("[data-fixture-away-casualties]")?.value ?? "";
      if (homeTouchdowns === "" || awayTouchdowns === "" || homeCasualties === "" || awayCasualties === "") {
        alert(t("season.enterCompleteResultAlert"));
        return;
      }
      try {
        replaceSeasonData(await apiRequest(`/api/season/fixture/${button.dataset.saveFixture}`, {
          method: "PATCH",
          body: JSON.stringify({
            homeTouchdowns,
            awayTouchdowns,
            homeCasualties,
            awayCasualties,
          }),
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  view.querySelectorAll("[data-save-season-pairing]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-pairing-row]");
      const homeEntry = row?.querySelector("[data-home-entry]");
      const awayEntry = row?.querySelector("[data-away-entry]");
      const payload = {
        resultType: row?.querySelector("[data-result-type]")?.value ?? "played",
        homeTouchdowns: row?.querySelector("[data-home-td]")?.value ?? "",
        awayTouchdowns: row?.querySelector("[data-away-td]")?.value ?? "",
        homeCasualties: row?.querySelector("[data-home-casualties]")?.value ?? "",
        awayCasualties: row?.querySelector("[data-away-casualties]")?.value ?? "",
      };
      if (homeEntry && !homeEntry.disabled) payload.homeEntryId = homeEntry.value;
      if (awayEntry && !awayEntry.disabled) payload.awayEntryId = awayEntry.value;
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/pairings/${button.dataset.saveSeasonPairing}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  view.querySelectorAll("[data-delete-season-pairing]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(t("season.confirmDeletePairing"))) return;
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/pairings/${button.dataset.deleteSeasonPairing}`, {
          method: "DELETE",
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  view.querySelectorAll("[data-season-remove-entry]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(t("season.confirmRemoveTeam"))) return;
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/entries/${button.dataset.seasonRemoveEntry}`, {
          method: "DELETE",
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

async function renderSavedRoster(teamId, refresh = true, options = {}) {
  const isAdminEdit = Boolean(options.adminOwnerId);
  setActiveNav(isAdminEdit ? "administration" : "my-teams");
  setViewSection("teams");
  if (refresh) {
    view.innerHTML = `
      ${renderHeader(isAdminEdit ? t("nav.administration") : t("myTeams.title"), isAdminEdit ? t("savedRoster.editingTeamSubtitle") : t("myTeams.subtitle"))}
      <div class="loading">${t("myTeams.loadingTeam")}</div>
    `;
  }
  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(isAdminEdit ? t("nav.administration") : t("myTeams.title"), isAdminEdit ? t("savedRoster.editingTeamSubtitle") : t("myTeams.subtitle"))}
      <div class="empty-state">${t("myTeams.loginRequired")}</div>
    `;
    return;
  }

  let savedTeam = null;
  let owner = state.auth.currentUser;
  if (isAdminEdit) {
    if (!state.auth.currentUser.isAdmin) {
      view.innerHTML = `
        ${renderHeader(t("nav.administration"), t("savedRoster.editingTeamSubtitle"), `<a class="primary-button" href="#/administration">${t("common.back")}</a>`)}
        <div class="empty-state">${t("admin.accessRequired")}</div>
      `;
      return;
    }
    state.admin.editingTeams ??= new Map();
    savedTeam = !refresh ? state.admin.editingTeams.get(teamId) : null;
    owner = savedTeam?._owner ?? owner;
    if (!savedTeam) {
      try {
        const payload = await apiRequest(`/api/admin/teams/${encodeURIComponent(teamId)}`);
        savedTeam = payload.team;
        owner = payload.owner;
        savedTeam._saveEndpoint = `/api/admin/teams/${encodeURIComponent(teamId)}`;
        savedTeam._owner = owner;
        state.admin.editingTeams.set(teamId, savedTeam);
      } catch (error) {
        view.innerHTML = `
          ${renderHeader(t("nav.administration"), t("savedRoster.editingTeamSubtitle"), `<a class="primary-button" href="#/administration/users/${encodeURIComponent(options.adminOwnerId)}">${t("common.back")}</a>`)}
          <div class="empty-state">${escapeHtml(error.message)}</div>
        `;
        return;
      }
    }
  } else {
    await loadMyTeams(refresh);
    savedTeam = state.myTeams.items.find((item) => item.id === teamId);
  }

  if (!savedTeam) {
    view.innerHTML = `
      ${renderHeader(isAdminEdit ? t("nav.administration") : t("myTeams.title"), isAdminEdit ? t("savedRoster.editingTeamSubtitle") : t("myTeams.subtitle"))}
      <div class="empty-state">${t("savedRoster.notFound")}</div>
    `;
    return;
  }

  const draft = normalizeSavedRoster(savedTeam);
  const teams = state.data.teams;
  if (!draft.teamSlug && teams[0]) draft.teamSlug = teams[0].slug;
  const team = teams.find((item) => item.slug === draft.teamSlug) ?? teams[0];
  ensureDraftLeagueChoice(team, draft);
  syncMedicalStaffForTeam(team, draft);
  ensureDraftPlayers(team, draft);
  sanitizeFavouredSkillsForTeam(team, draft);
  const costs = calculateRosterCosts(team, draft);
  const warnings = rosterWarnings(team, draft, costs);
  const backUrl = isAdminEdit ? `#/administration/users/${encodeURIComponent(owner?.id || options.adminOwnerId)}` : "#/my-teams";
  const titlePrefix = isAdminEdit ? `${t("common.editing")} "${draft.teamName || savedTeam.name || team.title}"` : `${t("sidebar.teamHeading")} "${draft.teamName || savedTeam.name || team.title}"`;

  view.innerHTML = `
    ${renderHeader(titlePrefix, `${team.title} ${t("savedRoster.rosterSuffix")}${isAdminEdit && owner ? ` · ${owner.login}` : ""}`, `<a class="primary-button" href="${backUrl}">${t("common.back")}</a>`)}
    <div class="saved-roster-top-grid">
      ${renderSavedRosterIdentity(team, draft, teams)}
      ${renderSavedRosterSummary(savedTeam, team, draft, costs, warnings)}
    </div>
    ${renderSavedRosterPurchases(team, draft)}
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
  wireSavedRoster(savedTeam, team, draft, {
    rerender: () => renderSavedRoster(teamId, false, options),
  });
}

function renderSavedRosterSummary(savedTeam, team, draft, costs, warnings) {
  const autosave = autosaveStatusFor(savedTeam.id);
  return `
    <aside class="builder-summary saved-roster-summary-panel side-panel">
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
        ${hasBribery(team) ? `<dt>${t("savedRoster.bribes")}</dt><dd>${countToNumber(draft.bribes)}</dd>` : ""}
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

function renderSavedRosterIdentity(team, draft, teams) {
  return `
    <section class="builder-setup-panel roster-identity-panel side-panel">
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
      </div>
      ${draft.logoData ? `
        <div class="builder-logo-inline roster-logo-inline">
          <img class="builder-logo-preview" src="${escapeHtml(draft.logoData)}" alt="">
          <button class="filter-button compact-action" type="button" data-roster-remove-logo>${t("savedRoster.removeLogo")}</button>
        </div>
      ` : ""}
      ${renderTeamRuleAccess(team, draft, "roster")}
    </section>
  `;
}

function renderSavedRosterPurchases(team, draft) {
  const briberyControl = hasBribery(team) ? renderRosterStaffControl("bribes", t("savedRoster.bribes"), draft.bribes) : "";
  return `
    <div class="roster-purchases-layout">
      <section class="roster-controls-panel roster-resources-panel side-panel">
        <h2>${t("roster.teamResourcesHeading")}</h2>
        <div class="builder-tracker-list roster-resource-list" aria-label="${t("roster.teamResourceTrackersAriaLabel")}">
          ${renderRosterStaffControl("dedicatedFans", t("savedRoster.dedicatedFans"), draft.dedicatedFans)}
          ${renderRosterMoneyControl(t("roster.treasuryTitle"), t("roster.treasuryDescription"), draft.treasury, "data-roster-treasury")}
          ${renderRosterMoneyControl("Coach's Safe", t("roster.coachesSafeDescription"), draft.coachesSafe, "data-roster-coaches-safe")}
        </div>
      </section>
      <section class="roster-controls-panel roster-purchases-panel side-panel">
        <h2>${t("roster.purchasesHeading")}</h2>
        <div class="builder-tracker-list roster-tracker-list roster-purchase-grid" aria-label="${t("roster.purchaseTrackersAriaLabel")}">
        ${renderRosterCounterControl(
          t("savedRoster.startingRerolls"),
          `60k ${t("roster.each")}`,
          countToNumber(draft.startingRerolls),
          `<button class="filter-button" type="button" data-roster-reroll="-1" ${countToNumber(draft.startingRerolls) <= 0 ? "disabled" : ""}>-</button>`,
          `<button class="filter-button" type="button" data-roster-reroll="1">+</button>`,
        )}
        ${renderRosterCounterControl(
          t("savedRoster.teamRerolls"),
          `120k ${t("roster.each")}`,
          countToNumber(draft.teamRerolls),
          `<button class="filter-button" type="button" data-roster-team-reroll="-1" ${countToNumber(draft.teamRerolls) <= 0 ? "disabled" : ""}>-</button>`,
          `<button class="filter-button" type="button" data-roster-team-reroll="1" ${countToNumber(draft.teamRerolls) >= builderStaffMaximums.teamRerolls ? "disabled" : ""}>+</button>`,
        )}
        ${briberyControl}
        ${renderRosterStaffControl("assistantCoaches", t("savedRoster.assistantCoaches"), draft.assistantCoaches)}
        ${renderRosterStaffControl("cheerleaders", t("savedRoster.cheerleaders"), draft.cheerleaders)}
        ${availableMedicalStaffDefinitions(team).map((staff) => renderRosterStaffControl(staff.key, staff.title, draft[staff.key])).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderRosterMoneyControl(title, description, value, dataAttribute) {
  return `
    <label class="builder-addon compact-staff-control roster-purchase-card roster-money-card">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </div>
      <input class="table-input roster-purchase-input" type="number" step="10" value="${countToNumber(value)}" ${dataAttribute}>
    </label>
  `;
}

function renderRosterCounterControl(title, description, value, minusButton, plusButton) {
  return `
    <div class="builder-addon compact-staff-control roster-purchase-card">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </div>
      <div class="inline-stepper-control">
        ${minusButton}
        <strong>${value}</strong>
        ${plusButton}
      </div>
    </div>
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
  const cost = builderStaffCosts[key] ?? 0;
  const description = key === "dedicatedFans" ? t("roster.postMatchValue") : `${cost}k${max > 1 ? ` ${t("roster.each")}` : ""}`;
  return renderRosterCounterControl(
    title,
    description,
    current,
    `<button class="filter-button" type="button" data-roster-staff="${key}" data-roster-staff-step="-1" ${current <= 0 ? "disabled" : ""}>-</button>`,
    `<button class="filter-button" type="button" data-roster-staff="${key}" data-roster-staff-step="1" ${current >= max ? "disabled" : ""}>+</button>`,
  );
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

function wireSavedRoster(savedTeam, team, draft, options = {}) {
  const autosave = () => scheduleSavedRosterAutosave(savedTeam.id);
  const rerender = () => {
    syncRosterCountsFromPlayers(draft);
    updateSavedRosterFields(savedTeam, draft);
    autosave();
    if (options.rerender) {
      options.rerender();
    } else {
      renderSavedRoster(savedTeam.id, false);
    }
  };

  view.querySelector("[data-roster-team]")?.addEventListener("change", (event) => {
    const nextTeam = state.data.teams.find((item) => item.slug === event.currentTarget.value);
    if (!nextTeam) return;
    draft.teamSlug = nextTeam.slug;
    draft.players = [];
    draft.selectedLeague = "";
    draft.favouredChoice = "";
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
  view.querySelector("[data-roster-coaches-safe]")?.addEventListener("input", (event) => {
    draft.coachesSafe = countToNumber(event.currentTarget.value);
    updateSavedRosterFields(savedTeam, draft);
    autosave();
  });
  view.querySelector("[data-roster-league]")?.addEventListener("change", (event) => {
    draft.selectedLeague = event.currentTarget.value;
    updateSavedRosterFields(savedTeam, draft);
    autosave();
  });
  view.querySelector("[data-roster-favoured]")?.addEventListener("change", (event) => {
    draft.favouredChoice = event.currentTarget.value;
    sanitizeFavouredSkillsForTeam(team, draft);
    rerender();
  });
  view.querySelector("[data-roster-logo]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > logoUploadMaxBytes) {
      alert(t("savedRoster.logoTooLarge"));
      event.currentTarget.value = "";
      return;
    }
    draft.logoData = await fileToOptimizedLogoDataUrl(file);
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

function moveRosterPlayer(draft, draggedId, targetId, position = "before") {
  if (!draggedId || !targetId || draggedId === targetId || !Array.isArray(draft.players)) return false;
  const fromIndex = draft.players.findIndex((player) => player.id === draggedId);
  if (fromIndex === -1) return false;
  const [dragged] = draft.players.splice(fromIndex, 1);
  const targetIndex = draft.players.findIndex((player) => player.id === targetId);
  if (targetIndex === -1) {
    draft.players.splice(fromIndex, 0, dragged);
    return false;
  }
  const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
  draft.players.splice(insertIndex, 0, dragged);
  return true;
}

function wireSavedRosterDragAndDrop(draft, rerender) {
  let draggedId = "";
  view.querySelectorAll(".saved-roster-table tbody tr[data-roster-player]").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("[data-player-drag-handle]")) {
        event.preventDefault();
        return;
      }
      draggedId = row.dataset.rosterPlayer || "";
      row.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedId);
      }
    });

    row.addEventListener("dragover", (event) => {
      if (!draggedId || draggedId === row.dataset.rosterPlayer) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      row.dataset.dropPosition = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
      row.classList.toggle("drop-after", row.dataset.dropPosition === "after");
      row.classList.toggle("drop-before", row.dataset.dropPosition !== "after");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drop-before", "drop-after");
      delete row.dataset.dropPosition;
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetId = row.dataset.rosterPlayer || "";
      const moved = moveRosterPlayer(draft, draggedId, targetId, row.dataset.dropPosition);
      draggedId = "";
      if (moved) rerender();
    });

    row.addEventListener("dragend", () => {
      draggedId = "";
      view.querySelectorAll(".saved-roster-table tbody tr").forEach((item) => {
        item.classList.remove("is-dragging", "drop-before", "drop-after");
        delete item.dataset.dropPosition;
      });
    });
  });
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
    card.querySelector("[data-saved-player-number]")?.addEventListener("input", (event) => {
      player.number = event.currentTarget.value;
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
    card.querySelector("[data-saved-player-captain]")?.addEventListener("change", (event) => {
      setRosterCaptain(draft, player.id, event.currentTarget.checked);
      rerender();
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
      sanitizeFavouredSkillsForTeam(team, draft);
      rerender();
    });
    card.querySelectorAll("[data-saved-player-remove-skill]").forEach((button) => {
      button.addEventListener("click", () => {
        player.extraSkills = (player.extraSkills ?? []).filter((skill) => skill.name !== button.dataset.savedPlayerRemoveSkill);
        rerender();
      });
    });
    card.querySelector("[data-saved-player-add-favoured]")?.addEventListener("click", () => {
      const input = card.querySelector("[data-saved-player-favoured-skill]");
      const row = rowsForTeam(team)[player.rowIndex];
      if (!row) return;
      const typed = String(input?.value || "").trim();
      const option = favouredSkillOptionsForPlayer(team, draft, row, player)
        .find((item) => item.name.toLowerCase() === typed.toLowerCase());
      if (!option) {
        if (input) input.value = "";
        return;
      }
      player.favouredSkills ??= [];
      if (player.favouredSkills.some((skill) => skill.name === option.name)) return;
      player.favouredSkills.push({ name: option.name, access: "favoured" });
      sanitizeFavouredSkillsForTeam(team, draft);
      rerender();
    });
    card.querySelectorAll("[data-saved-player-remove-favoured]").forEach((button) => {
      button.addEventListener("click", () => {
        player.favouredSkills = (player.favouredSkills ?? [])
          .filter((skill) => (typeof skill === "string" ? skill : skill.name) !== button.dataset.savedPlayerRemoveFavoured);
        rerender();
      });
    });
    card.querySelector("[data-saved-player-add-advancement]")?.addEventListener("click", () => {
      const type = card.querySelector("[data-saved-player-advancement-type]")?.value ?? "primary";
      const cost = nextAdvancementCost(player, type);
      if (!cost) return;
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
  wireSavedRosterDragAndDrop(draft, rerender);
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
  const savedTeam = state.myTeams.items.find((item) => item.id === teamId)
    ?? state.admin.editingTeams?.get(teamId);
  if (!savedTeam) return;
  const draft = normalizeSavedRoster(savedTeam);
  const team = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? state.data.teams[0];
  if (!team) return;
  ensureDraftPlayers(team, draft);
  sanitizeFavouredSkillsForTeam(team, draft);
  await saveSavedRoster(savedTeam, team, draft, { quiet: true, revision });
}

async function saveSavedRoster(savedTeam, team, draft, options = {}) {
  syncRosterCountsFromPlayers(draft);
  draft.logoData = await optimizeLogoDataUrl(draft.logoData);
  updateSavedRosterFields(savedTeam, draft);
  const request = {
    name: draft.teamName || team.title,
    baseTeamSlug: draft.teamSlug || team.slug,
    logoData: draft.logoData || "",
    roster: draft,
  };
  try {
    const result = await apiRequest(savedTeam._saveEndpoint || `/api/teams/${savedTeam.id}`, {
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
      if (state.admin.editingTeams?.has(savedTeam.id)) {
        state.admin.editingTeams.set(savedTeam.id, savedTeam);
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
  syncMedicalStaffForTeam(team, state.builder);
  ensureDraftPlayers(team, state.builder);
  sanitizeFavouredSkillsForTeam(team, state.builder);
  const costs = calculateBuilderCosts(team);
  const warnings = builderWarnings(team, costs);

  view.innerHTML = `
    ${renderHeader(t("nav.builder"), t("builder.subtitle"))}
    ${renderBuilderInfoPanel(team, teams, costs, warnings)}
    <div class="builder-layout builder-layout-main">
      <section class="builder-panel">
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

function renderBuilderInfoPanel(team, teams, costs, warnings) {
  return `
    <section class="builder-info-panel side-panel">
      <div class="builder-info-section builder-info-identity">
        <div class="builder-form builder-identity-form">
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
        </div>
        ${state.builder.logoData ? `
          <div class="builder-logo-inline roster-logo-inline">
            <img class="builder-logo-preview" src="${escapeHtml(state.builder.logoData)}" alt="">
            <button class="filter-button compact-action" type="button" data-builder-remove-logo>${t("savedRoster.removeLogo")}</button>
          </div>
        ` : ""}
        ${renderTeamRuleAccess(team, state.builder, "builder")}
      </div>
      <div class="builder-info-grid">
        <div class="builder-info-section builder-info-summary">
          <div class="summary-title-block">
            <h3>${t("savedRoster.summaryTitle")}</h3>
            <a class="builder-team-link" href="${pageUrl(team)}">${escapeHtml(team.title)}</a>
          </div>
          <dl class="stat-list summary-stat-grid">
            <dt>${t("myTeams.table.players")}</dt><dd>${costs.totalPlayersCount}</dd>
            <dt>${t("savedRoster.dedicatedFans")}</dt><dd>${countToNumber(state.builder.dedicatedFans)}</dd>
            ${hasBribery(team) ? `<dt>${t("savedRoster.bribes")}</dt><dd>${countToNumber(state.builder.bribes)}</dd>` : ""}
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
        </div>
        <div class="builder-info-section builder-info-purchases">
          <h2>${t("roster.purchasesHeading")}</h2>
          <div class="builder-tracker-list roster-tracker-list" aria-label="${t("roster.startingRosterTrackersAriaLabel")}">
            <div class="builder-addon compact-staff-control builder-tracker-control">
              <div>
                <strong>${t("savedRoster.startingRerolls")}</strong>
                <span>60k ${t("roster.each")}</span>
              </div>
              <div class="inline-stepper-control">
                <button class="filter-button" type="button" data-builder-reroll="-1" ${state.builder.startingRerolls <= 0 ? "disabled" : ""}>-</button>
                <strong>${state.builder.startingRerolls}</strong>
                <button class="filter-button" type="button" data-builder-reroll="1" ${costs.total + builderStaffCosts.startingRerolls > 600 ? "disabled" : ""}>+</button>
              </div>
            </div>
            ${renderBuilderStaffControl("dedicatedFans", t("savedRoster.dedicatedFans"), state.builder.dedicatedFans, costs.total + builderStaffCosts.dedicatedFans > 600)}
            ${hasBribery(team) ? renderBuilderStaffControl("bribes", t("savedRoster.bribes"), state.builder.bribes, costs.total + builderStaffCosts.bribes > 600) : ""}
            ${renderBuilderStaffControl("assistantCoaches", t("savedRoster.assistantCoaches"), state.builder.assistantCoaches, costs.total + builderStaffCosts.assistantCoaches > 600)}
            ${renderBuilderStaffControl("cheerleaders", t("savedRoster.cheerleaders"), state.builder.cheerleaders, costs.total + builderStaffCosts.cheerleaders > 600)}
            ${availableMedicalStaffDefinitions(team).map((staff) => {
              const blocked = costs.total + (builderStaffCosts[staff.key] ?? 0) > 600;
              return renderBuilderStaffControl(staff.key, staff.title, state.builder[staff.key], blocked);
            }).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderBuilderIdentity(team, teams) {
  return `
    <section class="builder-setup-panel roster-identity-panel side-panel">
      <div class="builder-form builder-identity-form">
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
      </div>
      ${state.builder.logoData ? `
        <div class="builder-logo-inline roster-logo-inline">
          <img class="builder-logo-preview" src="${escapeHtml(state.builder.logoData)}" alt="">
          <button class="filter-button compact-action" type="button" data-builder-remove-logo>${t("savedRoster.removeLogo")}</button>
        </div>
      ` : ""}
      ${renderTeamRuleAccess(team, state.builder, "builder")}
    </section>
  `;
}

function renderBuilderPurchases(team, costs) {
  return `
    <section class="roster-controls-panel side-panel">
      <h2>${t("roster.purchasesHeading")}</h2>
      <div class="builder-tracker-list roster-tracker-list" aria-label="${t("roster.startingRosterTrackersAriaLabel")}">
        <div class="builder-addon compact-staff-control builder-tracker-control">
          <div>
            <strong>${t("savedRoster.startingRerolls")}</strong>
            <span>60k ${t("roster.each")}</span>
          </div>
          <div class="inline-stepper-control">
            <button class="filter-button" type="button" data-builder-reroll="-1" ${state.builder.startingRerolls <= 0 ? "disabled" : ""}>-</button>
            <strong>${state.builder.startingRerolls}</strong>
            <button class="filter-button" type="button" data-builder-reroll="1" ${costs.total + builderStaffCosts.startingRerolls > 600 ? "disabled" : ""}>+</button>
          </div>
        </div>
        ${renderBuilderStaffControl("dedicatedFans", t("savedRoster.dedicatedFans"), state.builder.dedicatedFans, costs.total + builderStaffCosts.dedicatedFans > 600)}
        ${hasBribery(team) ? renderBuilderStaffControl("bribes", t("savedRoster.bribes"), state.builder.bribes, costs.total + builderStaffCosts.bribes > 600) : ""}
        ${renderBuilderStaffControl("assistantCoaches", t("savedRoster.assistantCoaches"), state.builder.assistantCoaches, costs.total + builderStaffCosts.assistantCoaches > 600)}
        ${renderBuilderStaffControl("cheerleaders", t("savedRoster.cheerleaders"), state.builder.cheerleaders, costs.total + builderStaffCosts.cheerleaders > 600)}
        ${availableMedicalStaffDefinitions(team).map((staff) => {
          const blocked = costs.total + (builderStaffCosts[staff.key] ?? 0) > 600;
          return renderBuilderStaffControl(staff.key, staff.title, state.builder[staff.key], blocked);
        }).join("")}
      </div>
    </section>
  `;
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
        ${hasBribery(team) ? `<dt>${t("savedRoster.bribes")}</dt><dd>${countToNumber(state.builder.bribes)}</dd>` : ""}
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
  const rows = rowsForTeam(team);
  return `
    <div class="table-scroll builder-table-scroll builder-available-table-wrap">
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
          ${rows.map((row, rowIndex) => {
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
    <div class="builder-mobile-card-list available-player-mobile-list">
      ${rows.map((row, rowIndex) => renderAvailablePlayerCard(row, rowIndex, draft, costs, enforceBudget)).join("")}
    </div>
  `;
}

function renderAvailablePlayerCard(row, rowIndex, draft, costs, enforceBudget = false) {
  const baseCost = costToNumber(rowCost(row));
  const positionFull = !canAddRowToDraft(row, rowIndex, draft, true);
  const budgetBlocked = enforceBudget && costs.total + baseCost > 600;
  const disabled = positionFull || budgetBlocked;
  const current = rowCountInPlayers(draft, rowIndex);
  return `
    <article class="available-player-card ${disabled ? "disabled" : ""}">
      <header class="available-player-head">
        <div>
          <strong>${escapeHtml(row.position)}</strong>
          <em>${escapeHtml(row.qty || "-")} · ${escapeHtml(rowCost(row) || "-")}</em>
        </div>
        <button class="primary-button add-player-button" type="button" data-add-row="${rowIndex}" ${disabled ? "disabled" : ""}>+</button>
      </header>
      ${renderRosterStatGrid(row)}
      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">${renderRosterLinks(row.skills)}</div>
      </section>
      <footer class="available-player-foot">
        ${t("roster.primary")} ${renderAccessCell(row.primary)} · ${t("roster.secondary")} ${renderAccessCell(row.secondary)} · ${t("roster.selectedLabel")} ${current}/${rosterMax(row.qty)}${budgetBlocked ? ` · ${t("roster.overBudgetLabel")}` : ""}
      </footer>
    </article>
  `;
}

function renderBuilderStaffControl(key, title, value, plusBlocked = false) {
  const max = builderStaffMaximums[key] ?? 6;
  const current = countToNumber(value);
  const cost = builderStaffCosts[key] ?? 0;
  return `
    <div class="builder-addon compact-staff-control builder-tracker-control">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${cost}k${max > 1 ? ` ${t("roster.each")}` : ""}</span>
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
    <div class="table-scroll builder-table-scroll builder-selected-table-wrap">
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
            <th>${t("roster.captain")}</th>
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
    <div class="builder-mobile-card-list builder-selected-mobile-list">
      ${players.map((player, index) => renderBuilderPlayerCard(player, index)).join("")}
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
      <td>
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-builder-player-captain="${escapeHtml(player.id)}" ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
        </label>
      </td>
      <td class="skills-cell">${renderRosterLinks(skillNamesForPlayer(player.row, player))}</td>
      <td>${escapeHtml(rowCost(player.row) || "-")}</td>
      <td><button class="filter-button compact-action" type="button" data-remove-player="${escapeHtml(player.id)}">${t("common.remove")}</button></td>
    </tr>
  `;
}

function renderBuilderPlayerStatGrid(player) {
  const value = (stat) => statValueForDisplayByStat(stat, player.row[stat], player.statMods?.[stat] ?? 0);
  return `
    <dl class="team-stat-grid">
      <div><dt>MA</dt><dd>${escapeHtml(value("ma"))}</dd></div>
      <div><dt>ST</dt><dd>${escapeHtml(value("st"))}</dd></div>
      <div><dt>AG</dt><dd>${escapeHtml(value("ag"))}</dd></div>
      <div><dt>PA</dt><dd>${escapeHtml(value("pa"))}</dd></div>
      <div><dt>AR</dt><dd>${escapeHtml(value("ar"))}</dd></div>
    </dl>
  `;
}

function renderBuilderPlayerCard(player, index) {
  return `
    <article class="saved-roster-player-card mobile-roster-player-card builder-selected-player-card">
      <header>
        <div class="mobile-player-title">
          <span>#${index + 1}</span>
          <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-builder-player-name="${escapeHtml(player.id)}">
          <small>${escapeHtml(player.row.position)} · ${escapeHtml(rowCost(player.row) || "-")}</small>
        </div>
        <button class="filter-button compact-action" type="button" data-remove-player="${escapeHtml(player.id)}">${t("common.remove")}</button>
      </header>
      <section class="mobile-player-section">
        <h3>${t("roster.statsLabel")}</h3>
        ${renderBuilderPlayerStatGrid(player)}
      </section>
      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">${renderRosterLinks(skillNamesForPlayer(player.row, player))}</div>
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-builder-player-captain="${escapeHtml(player.id)}" ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
        </label>
      </section>
    </article>
  `;
}

function renderSavedPlayerList(team, draft) {
  const players = selectedRosterPlayers(team, draft);
  const hasFavouredAccess = teamFavouredOptions(team).length > 0;
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
            <th>${t("roster.captain")}</th>
            <th>SPP</th>
            <th>${t("roster.levelHeader")}</th>
            <th>${t("roster.advancementHeader")}</th>
            ${hasFavouredAccess ? `<th>${t("roster.favouredOf")}</th>` : ""}
            <th>${t("sidebar.cost")}</th>
            <th>${t("roster.actionHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player, index) => renderSavedPlayerRow(team, draft, player, index, hasFavouredAccess)).join("")}
        </tbody>
      </table>
    </div>
    <div class="saved-roster-mobile-list">
      ${players.map((player, index) => renderSavedPlayerCard(team, draft, player, index, hasFavouredAccess)).join("")}
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

function renderSavedPlayerFavouredEditor(team, draft, player, inputId) {
  const choice = ensureDraftFavouredChoice(team, draft);
  if (!choice) return `<span class="muted-text">-</span>`;
  const options = favouredSkillOptionsForPlayer(team, draft, player.row, player);
  return `
    <div class="favoured-skill-editor">
      <small>${escapeHtml(choice)}</small>
      <div class="table-skill-editor">
        <input class="table-input" type="text" list="${escapeHtml(inputId)}" placeholder="${t("roster.favouredSkillPlaceholder")}" data-saved-player-favoured-skill ${!options.length ? "disabled" : ""}>
        <datalist id="${escapeHtml(inputId)}">
          ${options.map((option) => `<option value="${escapeHtml(option.name)}" label="${escapeHtml(option.alignment)}"></option>`).join("")}
        </datalist>
        <button class="filter-button compact-action" type="button" data-saved-player-add-favoured ${!options.length ? "disabled" : ""}>${t("common.add")}</button>
      </div>
    </div>
  `;
}

function renderFavouredSkillButtons(player) {
  const favouredSkills = normalizePlayerFavouredSkills(player.row, player.favouredSkills ?? []);
  if (!favouredSkills.length) return "";
  return `
    <div class="player-extra-skills table-extra-skills favoured-extra-skills">
      ${favouredSkills.map((skill) => `
        <button class="roster-pill favoured-skill-pill" type="button" data-saved-player-remove-favoured="${escapeHtml(skill.name)}">${escapeHtml(`${skill.name} x`)}</button>
      `).join("")}
    </div>
  `;
}

function renderCaptainSkillBadge(player) {
  if (!player.isCaptain) return "";
  const nonCaptainSkills = new Set([
    ...(player.row.skills ?? []),
    ...normalizePlayerExtraSkills(player.row, player.extraSkills ?? []).map((skill) => skill.name),
    ...normalizePlayerFavouredSkills(player.row, player.favouredSkills ?? []).map((skill) => skill.name),
  ]);
  return `
    <div class="player-extra-skills table-extra-skills captain-extra-skills">
      ${nonCaptainSkills.has("Pro") ? "" : renderRosterLinks(["Pro"])}
      <span class="roster-pill roster-pill-muted">${t("roster.captain")}</span>
    </div>
  `;
}

function renderSavedPlayerRow(team, draft, player, index, hasFavouredAccess = false) {
  const extraSkills = normalizePlayerExtraSkills(player.row, player.extraSkills ?? []);
  const adjustment = playerAdjustmentCost(player);
  const eliteCost = eliteComboCost(player.row, player);
  const skillInputId = `skill-options-${index}`;
  const favouredInputId = `favoured-skill-options-${index}`;
  const skillOptions = availableSkillOptionsForPlayer(player.row, player);
  return `
    <tr data-roster-player="${escapeHtml(player.id)}" draggable="true">
      <td class="saved-number-cell">
        <div class="saved-number-control">
          <button class="filter-button compact-action drag-handle table-drag-handle" type="button" draggable="true" data-player-drag-handle title="${t("roster.dragToReorder")}" aria-label="${t("roster.dragToReorder")}">↕</button>
          <input class="table-input table-number-input" type="text" value="${escapeHtml(player.number ?? index + 1)}" data-saved-player-number>
        </div>
      </td>
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
        ${renderFavouredSkillButtons(player)}
        ${renderCaptainSkillBadge(player)}
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
      <td>
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-saved-player-captain ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
        </label>
      </td>
      <td class="spp-cell">${renderPlayerSppControls(team, player)}</td>
      <td class="level-cell">${renderPlayerLevelCell(team, player)}</td>
      <td class="advancement-cell">${renderPlayerAdvancementControls(team, player)}</td>
      ${hasFavouredAccess ? `<td class="favoured-skill-cell">${renderSavedPlayerFavouredEditor(team, draft, player, favouredInputId)}</td>` : ""}
      <td>${escapeHtml(rowCost(player.row) || "-")}${adjustment ? `<span class="cost-note inline-cost-note">${adjustment > 0 ? "+" : ""}${adjustment}k</span>` : ""}</td>
      <td><button class="filter-button compact-action" type="button" data-remove-saved-player="${escapeHtml(player.id)}">${t("common.remove")}</button></td>
    </tr>
  `;
}

function renderSavedPlayerCard(team, draft, player, index, hasFavouredAccess = false) {
  const extraSkills = normalizePlayerExtraSkills(player.row, player.extraSkills ?? []);
  const adjustment = playerAdjustmentCost(player);
  const eliteCost = eliteComboCost(player.row, player);
  const skillInputId = `mobile-skill-options-${index}`;
  const favouredInputId = `mobile-favoured-skill-options-${index}`;
  const skillOptions = availableSkillOptionsForPlayer(player.row, player);
  return `
    <article class="saved-roster-player-card mobile-roster-player-card" data-roster-player="${escapeHtml(player.id)}">
      <header>
        <div class="mobile-player-title">
          <label class="mobile-player-number">
            <span>${t("roster.numberAbbr")}</span>
            <input class="table-input table-number-input" type="text" value="${escapeHtml(player.number ?? index + 1)}" data-saved-player-number>
          </label>
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
          ${renderFavouredSkillButtons(player)}
          ${renderCaptainSkillBadge(player)}
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
        ${hasFavouredAccess ? renderSavedPlayerFavouredEditor(team, draft, player, favouredInputId) : ""}
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
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-saved-player-captain ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
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
        isCaptain: Boolean(edit.isCaptain ?? edit.captain),
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
    isCaptain: false,
  };
  if (!draft.playerEdits[key].name) {
    const copyIndex = Number(key.split("-")[1] ?? 0);
    draft.playerEdits[key].name = `${row.position} ${copyIndex + 1}`;
  }
  draft.playerEdits[key].statMods ??= {};
  draft.playerEdits[key].extraSkills ??= [];
  draft.playerEdits[key].skipNextGame = Boolean(draft.playerEdits[key].skipNextGame);
  draft.playerEdits[key].isCaptain = Boolean(draft.playerEdits[key].isCaptain);
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

function teamApothecaryAccess(team) {
  return cleanApothecary(team.team?.meta?.apothecary ?? "");
}

function teamHasFavouredOf(team, alignment) {
  const expected = ruleLookupKey(`Favoured of ${alignment}`);
  return teamSpecialRuleTokens(team).some((rule) => ruleLookupKey(rule) === expected);
}

function canHireMedicalStaff(team, staff) {
  const apothecaryAccess = teamApothecaryAccess(team);
  if (staff.access === "apothecary") return /\bavailable\b/i.test(apothecaryAccess);
  if (staff.access === "mortuary") {
    return /mortuary\s+assistant/i.test(apothecaryAccess) || teamHasSpecialRule(team, "Masters of Undeath");
  }
  if (staff.access === "plague") {
    return /plague\s+doctor/i.test(apothecaryAccess) || teamHasFavouredOf(team, "Nurgle");
  }
  return false;
}

function availableMedicalStaffDefinitions(team) {
  return medicalStaffDefinitions.filter((staff) => canHireMedicalStaff(team, staff));
}

function syncMedicalStaffForTeam(team, draft) {
  if (!hasBribery(team)) {
    draft.bribes = 0;
    if (draft.purchasedStaff) draft.purchasedStaff.bribes = 0;
  } else {
    draft.bribes = clamp(countToNumber(draft.bribes), 0, builderStaffMaximums.bribes);
  }

  const availableKeys = new Set(availableMedicalStaffDefinitions(team).map((staff) => staff.key));
  medicalStaffDefinitions.forEach((staff) => {
    if (!availableKeys.has(staff.key)) {
      draft[staff.key] = 0;
      if (draft.purchasedStaff) draft.purchasedStaff[staff.key] = 0;
      return;
    }
    draft[staff.key] = clamp(countToNumber(draft[staff.key]), 0, builderStaffMaximums[staff.key] ?? 1);
  });
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
    + (hasBribery(team) ? staffItemCost(draft, "bribes") : 0)
    + (includeDedicatedFans ? staffItemCost(draft, "dedicatedFans") : 0)
    + staffItemCost(draft, "assistantCoaches")
    + staffItemCost(draft, "cheerleaders")
    + medicalStaffDefinitions.reduce((sum, staff) => sum + staffItemCost(draft, staff.key), 0);
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
  view.querySelector("[data-builder-favoured]")?.addEventListener("change", (event) => {
    state.builder.favouredChoice = event.currentTarget.value;
  });
  view.querySelector("[data-builder-name]")?.addEventListener("input", (event) => {
    state.builder.teamName = event.currentTarget.value;
  });
  view.querySelector("[data-builder-logo]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > logoUploadMaxBytes) {
      alert(t("savedRoster.logoTooLarge"));
      event.currentTarget.value = "";
      return;
    }
    state.builder.logoData = await fileToOptimizedLogoDataUrl(file);
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
  view.querySelectorAll("[data-builder-player-captain]").forEach((input) => {
    input.addEventListener("change", (event) => {
      setRosterCaptain(state.builder, input.dataset.builderPlayerCaptain, event.currentTarget.checked);
      renderBuilder();
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

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", reject, { once: true });
    image.src = dataUrl;
  });
}

function canvasToDataUrl(canvas, mimeType, quality) {
  try {
    return canvas.toDataURL(mimeType, quality);
  } catch (_error) {
    return "";
  }
}

async function optimizeLogoDataUrl(dataUrl) {
  const source = String(dataUrl || "");
  if (!source.startsWith("data:image/")) return source;
  if (source.startsWith("data:image/webp") && source.length <= logoOptimizeSkipLength) return source;
  if (logoOptimizationCache.has(source)) return logoOptimizationCache.get(source);

  let optimized = source;
  try {
    const image = await loadImageFromDataUrl(source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0) {
      const scale = Math.min(1, logoOptimizeMaxDimension / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: true });
      context?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const webp = canvasToDataUrl(canvas, "image/webp", logoOptimizeQuality);
      if (webp.startsWith("data:image/webp") && webp.length < source.length) {
        optimized = webp;
      }
    }
  } catch (_error) {
    optimized = source;
  }

  logoOptimizationCache.set(source, optimized);
  return optimized;
}

async function fileToOptimizedLogoDataUrl(file) {
  const source = await fileToDataUrl(file);
  return optimizeLogoDataUrl(source);
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
  payload.logoData = await optimizeLogoDataUrl(payload.logoData);
  state.builder.logoData = payload.logoData;
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
    draft.favouredChoice ? `Favoured Of: ${draft.favouredChoice}` : "",
    `Total Cost: ${costs.total}k`,
    `Treasury: ${draft.treasury ?? 0}k`,
    `Coach's Safe: ${draft.coachesSafe ?? 0}k`,
    "",
    ...selected.map((player) => [
      `#${player.number ?? player.index + 1} ${player.name} (${player.row.position}) - ${rowCost(player.row)}${playerStatusText(player) !== "-" ? ` - ${playerStatusText(player)}` : ""}`,
      `  Stats: MA ${statValueForDisplayByStat("ma", player.row.ma, player.statMods.ma ?? 0)} / ST ${statValueForDisplayByStat("st", player.row.st, player.statMods.st ?? 0)} / AG ${statValueForDisplayByStat("ag", player.row.ag, player.statMods.ag ?? 0)} / PA ${statValueForDisplayByStat("pa", player.row.pa, player.statMods.pa ?? 0)} / AR ${statValueForDisplayByStat("ar", player.row.ar, player.statMods.ar ?? 0)}`,
      `  Skills: ${skillNamesForPlayer(player.row, player).join(", ") || "-"}`,
    ].join("\n")),
    draft.teamRerolls ? `Team Rerolls: ${draft.teamRerolls}` : "",
    draft.startingRerolls ? `Starting Rerolls: ${draft.startingRerolls}` : "",
    draft.bribes ? `Bribes: ${draft.bribes}` : "",
    draft.dedicatedFans ? `Dedicated Fans: ${draft.dedicatedFans}` : "",
    draft.assistantCoaches ? `Assistant Coaches: ${draft.assistantCoaches}` : "",
    draft.cheerleaders ? `Cheerleaders: ${draft.cheerleaders}` : "",
    ...medicalStaffDefinitions.map((staff) => draft[staff.key] ? `${staff.title}: ${draft[staff.key]}` : ""),
  ].filter(Boolean).join("\n");
  return lines;
}

function renderRoute() {
  const route = decodeURIComponent(location.hash.replace(/^#\/?/, "")) || "home";
  const section = routeSection(route);
  if (route === "home") return renderHome();
  if (route.startsWith("overview/")) return renderOverviewDetail(route.replace(/^overview\//, ""));
  if (sectionRoutes.has(route)) return renderSection(route);
  if (route === "builder") return renderBuilder();
  if (route.startsWith("my-teams/")) return renderSavedRoster(route.replace(/^my-teams\//, ""));
  if (route === "my-teams") return renderMyTeams();
  if (route === "season") return renderSeason();
  const adminEditMatch = route.match(/^administration\/users\/([^/]+)\/teams\/([^/]+)\/edit$/);
  if (adminEditMatch) return renderSavedRoster(adminEditMatch[2], true, { adminOwnerId: adminEditMatch[1] });
  if (route.startsWith("administration/users/")) return renderAdminUserProfile(route.replace(/^administration\/users\//, ""));
  if (route === "administration") return renderAdministration();
  const publicTeamMatch = route.match(/^players\/([^/]+)\/teams\/([^/]+)$/);
  if (publicTeamMatch) return renderPublicTeamProfile(publicTeamMatch[1], publicTeamMatch[2]);
  if (route.startsWith("players/")) return renderPlayerProfile(route.replace(/^players\//, ""));
  if (route === "legal") return renderLegal();
  const page = findPageBySlug(route);
  if (page) return renderDetail(page);
  setActiveNav("home");
  setViewSection("home");
  view.innerHTML = `<div class="empty-state">${t("app.pageNotFound")}</div>`;
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
