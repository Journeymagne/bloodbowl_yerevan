import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertDictionaryCovers } from "./helpers/ui.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { expandCollections } from "../src/data/reference.mjs";

// The API is installed before anything that asks it is imported: the client picks up `fetch` as it loads.
const api = installFakeApi();
const { readChallenges, sendChallenge, answerChallenge } = await import("../src/data/challenges.mjs");
const {
  HISTORY_KINDS, acceptModel, busyRecipients, challengesModel, coachInitial, dayWord, friendliesPlayed, matchOpponents,
  recentOpponents, sendModel, teamsLine,
} = await import("../src/screens/matches/challenges-model.mjs");
const { state } = await import("../src/core/state.mjs");
const { initLocale, t } = await import("../src/core/i18n.mjs");
const { formatDay, formatMoney } = await import("../src/core/format.mjs");
const { teamValue } = await import("../src/data/team-record.mjs");
const { raceTeamOf } = await import("../src/data/teams.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
// The model names a race by the reference's words.
state.data = expandCollections(JSON.parse(text("public/data.en.json")));

// The reader's clock: noon of 21 October, local time, as the server's stamps are read.
const NOW = new Date("2026-10-21T12:00:00");
const TODAY = "2026-10-21T09:00:00", YESTERDAY = "2026-10-20T00:30:00", TWO_DAYS = "2026-10-19T10:00:00";

const ME = { id: "u1", login: "coach" };
const coach = (id, login, teams) => ({ id, login, teams: teams.map(([teamId, name, slug]) => ({ id: teamId, name, baseTeamSlug: slug })) });
const RIVAL = coach("u2", "rival", [["rt1", "Rival Team", "teams/dwarf"], ["rt2", "Rival Raiders", "teams/skaven"], ["rt3", "Rival Wardens", "teams/lizardmen"]]);
const NAREK = coach("u3", "narek", [["n1", "Ararat Lions", "teams/human"], ["n2", "Sevan Raiders", "teams/orc"]]);
const LILIT = coach("u4", "lilit", [["l1", "Silverbrook Rangers", "teams/wood-elf"], ["l2", "Mirefen Rotters", "teams/nurgle"]]);
const ORC_BOSS = coach("u5", "orc_boss", [["r1", "Grimtusk Raiders", "teams/orc"], ["r2", "Iron Teeth", "teams/black-orc"]]);
const AMAZONA = coach("u6", "amazona", [["a1", "Lustria Valkyries", "teams/amazon"]]);
const OPPONENTS = [AMAZONA, LILIT, NAREK, ORC_BOSS, RIVAL];

/** Eleven linemen and two rerolls: a value the reference prices. */
const roster = () => ({ rerolls: 2, players: Array.from({ length: 11 }, (_, at) => ({ id: `p${at}`, rowIndex: 0, number: String(at + 1), name: `P${at}` })) });
const T1 = { id: "t1", name: "Mock Team", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true, roster: roster() };
const T2 = { id: "t2", name: "Mock Humans", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: false, roster: roster() };
const TEAMS = [T1, T2];

const named = ({ id, login }) => ({ id, login });
const teamOf = ({ id, name, baseTeamSlug }) => ({ id, name, baseTeamSlug });
/** A challenge as `GET /api/challenges` sends it. */
const challenge = (id, from, to, team, createdAt, over = {}) => ({
  id, sender: named(from), recipient: named(to), team: teamOf(team), status: "pending", gameId: null, createdAt, updatedAt: createdAt, ...over,
});
const pending = (id, from, to, team, createdAt) => challenge(id, from, to, team, createdAt);

/** One of the coach's games as `/api/games` sends it; `home` and `away` are [user, team]. */
const game = (id, [homeUser, homeTeam], [awayUser, awayTeam], over = {}) => ({
  id, kind: "friendly", season: null, roundNumber: 0, roundStatus: null, resultStatus: "pending", preparationStatus: "not_started",
  postMatchStatus: "not_started", homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null,
  proposedByUserId: null, viewerIsProposer: false, createdAt: TWO_DAYS, updatedAt: TODAY,
  home: { user: named(homeUser), team: teamOf(homeTeam) }, away: { user: named(awayUser), team: teamOf(awayTeam) }, ...over,
});
const played = (touchdowns) => ({ resultStatus: "confirmed", preparationStatus: "completed", postMatchStatus: "completed",
  homeTouchdowns: touchdowns[0], awayTouchdowns: touchdowns[1], homeCasualties: 0, awayCasualties: 0 });
const [GRIMTUSK, IRON_TEETH] = ORC_BOSS.teams;

const base = { payload: { challenges: [], opponents: OPPONENTS }, games: [], teams: TEAMS, teamId: "t1", viewerId: "u1", now: NOW };

/** A coach's row in the challenge sheet, among the recent ones or the others. */
const rowOf = (model, coachId) => [...model.recent, ...model.rows].find(({ id }) => id === coachId);

test("a coach already challenged with the chosen team is busy; with another team he is not", () => {
  const payload = { challenges: [pending("c2", ME, LILIT, T1, "2026-10-19T10:00:00")], opponents: [RIVAL, NAREK, LILIT] };
  const withT1 = sendModel({ ...base, payload, teamChoice: "t1", chosenId: "u4" });
  // The challenge makes lilit a recent opponent: her row is among the recent ones.
  assert.equal(rowOf(withT1, "u4").busy, true);
  assert.equal(rowOf(withT1, "u4").checked, false);
  assert.equal(withT1.chosen, null, "a busy coach is not chosen");
  assert.equal(sendModel({ ...base, payload, teamChoice: "t2", chosenId: "u4" }).chosen.id, "u4");
  assert.equal(rowOf(sendModel({ ...base, payload, teamChoice: "t2" }), "u4").busy, false);
  assert.equal(sendModel({ ...base, payload, teamChoice: "t1", chosenId: "u4", query: "lil" }).rows[0].busy, true, "busy while searching too");
  assert.equal(withT1.cta.disabled, true, "no one chosen, no challenge");
  assert.deepEqual([...busyRecipients(payload.challenges, "u1", "t1")], ["u4"]);
  // A challenge answered, or one sent to the coach, keeps nobody busy.
  const others = [challenge("c3", ME, RIVAL, T1, TODAY, { status: "declined" }), pending("c4", NAREK, ME, NAREK.teams[0], TODAY)];
  assert.deepEqual([...busyRecipients(others, "u1", "t1")], []);
});

test("the search finds a coach by his login or any of his teams, whatever the case", () => {
  // The coaches of the mock's league and one of the prototype's (orc_boss, whose Grimtusk Raiders would be found too, is not among them).
  const coaches = [AMAZONA, LILIT, NAREK, RIVAL];
  assert.deepEqual(matchOpponents(coaches, "RAID").map(({ login }) => login), ["narek", "rival"]);
  assert.deepEqual(matchOpponents(coaches, "Amaz").map(({ login }) => login), ["amazona"]);
  assert.deepEqual(matchOpponents(OPPONENTS, "raiders").map(({ login }) => login), ["narek", "orc_boss", "rival"]);
  const cyrillic = { id: "u7", login: "Лилит", teams: [{ id: "x1", name: "Серебряный ручей", baseTeamSlug: "teams/wood-elf" }] };
  assert.deepEqual(matchOpponents([...coaches, cyrillic], "  лил ").map(({ id }) => id), ["u7"]);
  assert.deepEqual(matchOpponents([...coaches, cyrillic], "РУЧЕЙ").map(({ id }) => id), ["u7"]);
  assert.equal(matchOpponents(coaches, "   ").length, coaches.length, "a blank query is everyone");
  assert.deepEqual(matchOpponents([{ id: "u8", login: "old" }], "old").map(({ id }) => id), ["u8"], "a coach sent without teams (a 2.x answer) by his login");

  const searching = sendModel({ ...base, payload: { challenges: [], opponents: coaches }, query: "RAID" });
  assert.equal(searching.searching, true);
  assert.equal(searching.query, "RAID");
  assert.deepEqual(searching.recent, []);
  assert.deepEqual(searching.rows.map(({ login }) => login), ["narek", "rival"]);
  assert.equal(searching.listLabel, "Found · 2");
  assert.equal(searching.nobody, false);
  const nobody = sendModel({ ...base, query: "zzz" });
  assert.deepEqual([nobody.rows, nobody.nobody, nobody.listLabel], [[], true, "Found · 0"]);
  assert.equal(sendModel({ ...base, payload: { challenges: [], opponents: [] } }).nobody, true, "no coach to challenge at all");
});

test("recent opponents: three at most, the freshest first, games and challenges both, only those who can be challenged; they are not among the others", () => {
  const games = [
    game("g1", [ME, T1], [RIVAL, RIVAL.teams[0]], { kind: "league", updatedAt: YESTERDAY }),
    game("g2", [{ id: "u9", login: "gone" }, { id: "z9", name: "Gone", baseTeamSlug: "teams/orc" }], [ME, T2], { updatedAt: TODAY }),
    game("g3", [ORC_BOSS, GRIMTUSK], [ME, T1], { updatedAt: "2026-10-10T10:00:00" }),
  ];
  const challenges = [pending("c1", NAREK, ME, NAREK.teams[0], TODAY), pending("c2", ME, LILIT, T1, TWO_DAYS)];
  assert.deepEqual(recentOpponents({ games, challenges, opponents: OPPONENTS, viewerId: "u1" }), ["u3", "u2", "u4"]);
  assert.deepEqual(recentOpponents({ games, challenges, opponents: OPPONENTS, viewerId: "u1", limit: 4 }), ["u3", "u2", "u4", "u5"]);
  assert.deepEqual(recentOpponents({ games: null, challenges, opponents: OPPONENTS, viewerId: "u1" }), ["u3", "u4"], "games not read: the challenges alone");

  const model = sendModel({ ...base, games, payload: { challenges, opponents: OPPONENTS } });
  assert.deepEqual(model.recent.map(({ id }) => id), ["u3", "u2", "u4"]);
  assert.deepEqual(model.rows.map(({ id }) => id), ["u6", "u5"], "the others, in the server's order, without the recent ones");
  assert.equal(model.listLabel, "Other coaches · 2");
  assert.deepEqual(model.recent[1], { id: "u2", login: "rival", initial: "R", line: "Rival Team · Rival Raiders · Rival Wardens", busy: false, checked: false });
});

test("the page: incoming with the race on a phone and without on a desk, outgoing with the opponent's teams and the team it was sent with, accepted with its match's links, history", () => {
  const challenges = [
    pending("c1", ORC_BOSS, ME, GRIMTUSK, YESTERDAY),
    pending("c2", ME, LILIT, T2, TWO_DAYS),
    pending("c8", ME, NAREK, T1, TODAY),
    challenge("c3", ORC_BOSS, ME, IRON_TEETH, TWO_DAYS, { status: "accepted", gameId: "g7", updatedAt: TODAY }),
    challenge("c4", ME, AMAZONA, T2, TWO_DAYS, { status: "declined", updatedAt: YESTERDAY }),
    challenge("c5", RIVAL, ME, RIVAL.teams[0], TWO_DAYS, { status: "cancelled", updatedAt: TWO_DAYS }),
    challenge("c6", ME, RIVAL, T1, TWO_DAYS, { status: "accepted", gameId: "g6", updatedAt: TODAY }),
  ];
  const games = [
    game("g7", [ORC_BOSS, IRON_TEETH], [ME, T1]),
    game("g6", [ME, T1], [RIVAL, RIVAL.teams[0]], played([2, 1])),
  ];
  const page = { payload: { challenges, opponents: OPPONENTS }, readError: "", games, gamesError: "", teamId: "t1", viewerId: "u1", teams: TEAMS, now: NOW };
  const phone = challengesModel({ ...page, phone: true });
  assert.deepEqual([phone.teamId, phone.phone, phone.read, phone.empty, phone.failures], ["t1", true, true, false, []]);
  assert.deepEqual(phone.incoming, [{ id: "c1", login: "orc_boss", initial: "O", line: "Grimtusk Raiders · Orc · challenge yesterday" }]);
  assert.deepEqual(phone.outgoing, [
    { id: "c8", login: "narek", initial: "N", line: "Ararat Lions · Sevan Raiders · awaiting an answer · today" },
    { id: "c2", login: "lilit", initial: "L", line: `Silverbrook Rangers · Mirefen Rotters · with Mock Humans · awaiting an answer · ${formatDay(TWO_DAYS)}` },
  ], "newest first; one sent with another team says which");
  assert.equal(phone.accepted.length, 1);
  const [accepted] = phone.accepted;
  assert.deepEqual([accepted.id, accepted.gameId, accepted.own, accepted.other, accepted.when, accepted.sentLine],
    ["c3", "g7", "Mock Team", "Iron Teeth", "accepted today", ""]);
  assert.deepEqual(accepted.links[0], { label: "Match preparation", href: "#/games/g7/pre-match", kind: "primary" });
  assert.deepEqual(phone.history, [
    { id: "c6", line: "rival · with Mock Team · match played · today", href: "#/games/g6" },
    { id: "c4", line: "amazona · with Mock Humans · declined · yesterday", href: "" },
    { id: "c5", line: `rival · Rival Team · cancelled · ${formatDay(TWO_DAYS)}`, href: "" },
  ], "the freshest first; the played one leads to its match");

  const desk = challengesModel({ ...page, phone: false });
  assert.deepEqual(desk.incoming[0].line, "Grimtusk Raiders · yesterday");
  assert.deepEqual(desk.outgoing.map(({ line }) => line), ["Ararat Lions · Sevan Raiders · awaiting · today",
    `Silverbrook Rangers · Mirefen Rotters · with Mock Humans · awaiting · ${formatDay(TWO_DAYS)}`], "a desk's words, as DeskChallenges.html");

  const many = Array.from({ length: 10 }, (_, at) => challenge(`d${at}`, ME, AMAZONA, T1, TWO_DAYS, { status: "declined", updatedAt: `2026-10-${String(10 + at).padStart(2, "0")}T10:00:00` }));
  const long = challengesModel({ ...page, payload: { challenges: many, opponents: OPPONENTS } });
  assert.deepEqual(long.history.map(({ id }) => id), ["d9", "d8", "d7", "d6", "d5", "d4", "d3", "d2"], "the last eight");
});

test("the games not read: no accepted, no played, and an accepted challenge is in the history neither", () => {
  const challenges = [challenge("c3", ORC_BOSS, ME, IRON_TEETH, TWO_DAYS, { status: "accepted", gameId: "g7", updatedAt: TODAY }),
    challenge("c4", ME, AMAZONA, T2, TWO_DAYS, { status: "declined", updatedAt: YESTERDAY })];
  const page = { payload: { challenges, opponents: OPPONENTS }, teamId: "t1", viewerId: "u1", teams: TEAMS, now: NOW, phone: true };
  for (const unread of [{ games: null, gamesError: "" }, { games: [], gamesError: "offline" }]) {
    const model = challengesModel({ ...page, ...unread });
    assert.deepEqual([model.accepted, model.played], [[], ""]);
    assert.deepEqual(model.history.map(({ id }) => id), ["c4"], "a declined one is history all the same");
    assert.equal(model.empty, false, "the challenges are there: the games are what failed");
  }
  assert.deepEqual(challengesModel({ ...page, games: [], gamesError: "offline" }).failures, ["The matches did not load: offline"]);
});

test("the challenges not read, or not yet: nothing is drawn of them; nothing yet says so", () => {
  const page = { games: [], teamId: "t1", viewerId: "u1", teams: TEAMS, now: NOW, phone: true };
  const loading = challengesModel({ ...page, payload: null, readError: "" });
  assert.deepEqual([loading.read, loading.failures, loading.empty, loading.incoming], [false, [], false, []]);
  const failed = challengesModel({ ...page, payload: null, readError: "No connection" });
  assert.deepEqual([failed.read, failed.failures, failed.empty], [false, ["The challenges could not be read: No connection"], false]);
  const none = challengesModel({ ...page, payload: { challenges: [], opponents: OPPONENTS } });
  assert.deepEqual([none.read, none.empty, none.incoming, none.outgoing, none.accepted, none.history], [true, true, [], [], [], []]);
});

test("played counts the page's team's friendlies with a confirmed score", () => {
  const games = [
    game("g6", [ME, T1], [RIVAL, RIVAL.teams[0]], played([2, 1])),
    game("g5", [NAREK, NAREK.teams[0]], [ME, T1], played([0, 0])),
    game("g4", [ME, T2], [RIVAL, RIVAL.teams[1]], played([1, 0])),
    game("g3", [ME, T1], [RIVAL, RIVAL.teams[1]], { ...played([3, 0]), kind: "league" }),
    game("g2", [ME, T1], [LILIT, LILIT.teams[0]]),
  ];
  assert.equal(friendliesPlayed(games, "t1"), 2);
  const page = { payload: { challenges: [], opponents: [] }, teamId: "t1", viewerId: "u1", teams: TEAMS, now: NOW };
  assert.equal(challengesModel({ ...page, games }).played, "played 2");
  assert.equal(challengesModel({ ...page, games: null }).played, "");
  initLocale("ru");
  try {
    assert.equal(challengesModel({ ...page, games }).played, "сыграно 2");
  } finally {
    initLocale("en");
  }
});

test("a day is today, yesterday or its date", () => {
  assert.equal(dayWord(NOW.toISOString(), NOW), "today");
  assert.equal(dayWord("2026-10-21T00:00:01", NOW), "today");
  assert.equal(dayWord(YESTERDAY, NOW), "yesterday");
  assert.equal(dayWord("2026-10-19T23:59:00", NOW), formatDay("2026-10-19T23:59:00"));
  assert.equal(dayWord(TWO_DAYS, NOW), "19 Oct");
  assert.equal(dayWord("not a day", NOW), formatDay("not a day"));
  assert.equal(dayWord(undefined, NOW), "—");
  initLocale("ru");
  try {
    assert.deepEqual([dayWord(TODAY, NOW), dayWord(YESTERDAY, NOW)], ["сегодня", "вчера"]);
  } finally {
    initLocale("en");
  }
});

test("the challenge sheet: the default team is the page's; one team is a line; the summary and the button follow the choice", () => {
  const none = sendModel(base);
  assert.deepEqual([none.teamId, none.chosen, none.summary, none.cta], ["t1", null,
    "The opponent chooses a team on accepting the challenge.", { label: "Choose an opponent", disabled: true }]);
  assert.deepEqual([none.single, none.teams], ["", [{ id: "t1", name: "Mock Team", checked: true }, { id: "t2", name: "Mock Humans", checked: false }]]);
  const chosen = sendModel({ ...base, chosenId: "u2" });
  assert.equal(chosen.chosen.login, "rival");
  assert.equal(chosen.rows.find(({ id }) => id === "u2").checked, true);
  assert.equal(chosen.summary, "rival chooses a team on accepting the challenge. You play: Mock Team.");
  assert.deepEqual(chosen.cta, { label: "Challenge rival", disabled: false });
  const other = sendModel({ ...base, chosenId: "u2", teamChoice: "t2" });
  assert.deepEqual([other.teamId, other.summary, other.teams.map(({ checked }) => checked)],
    ["t2", "rival chooses a team on accepting the challenge. You play: Mock Humans.", [false, true]]);
  assert.equal(sendModel({ ...base, teamChoice: "zz" }).teamId, "t1", "a team not the coach's is the page's");
  const one = sendModel({ ...base, teams: [T1] });
  assert.deepEqual([one.single, one.teams, one.teamId], ["Challenging with Mock Team", [], "t1"]);
  initLocale("ru");
  try {
    const ru = sendModel({ ...base, chosenId: "u2" });
    assert.deepEqual([ru.summary, ru.cta.label], ["rival выберет свою команду, когда примет вызов. Вы играете: Mock Team.", "Вызвать rival"]);
  } finally {
    initLocale("en");
  }
});

test("a coach named by the address but not offered is said", () => {
  for (const presetId of ["u1", "zz"]) {
    const model = sendModel({ ...base, presetId, chosenId: presetId });
    assert.deepEqual([model.note, model.chosen], [t("friendly.unknownCoach"), null]);
  }
  const offered = sendModel({ ...base, presetId: "u3", chosenId: "u3" });
  assert.deepEqual([offered.note, offered.chosen.id], ["", "u3"]);
});

test("the accept sheet: the challenger with what was read of his team, the coach's teams with their race, value and season", () => {
  const offer = challenge("c1", ORC_BOSS, ME, GRIMTUSK, YESTERDAY);
  const theirs = { ...teamOf(GRIMTUSK), roster: roster() };
  const sender = { user: { id: "u5", login: "orc_boss", telegram: "@orc_boss" }, team: theirs, rolls: [] };
  const worth = teamValue(theirs, raceTeamOf("teams/orc"));
  assert.ok(worth > 0);
  const model = acceptModel({ challenge: offer, sender, teams: TEAMS, choiceId: "", teamId: "t1" });
  assert.deepEqual([model.id, model.login, model.initial, model.title], ["c1", "orc_boss", "O", "orc_boss · Grimtusk Raiders"]);
  assert.equal(model.line, `Orc · TV ${formatMoney(worth)} · Telegram @orc_boss`);
  const value = formatMoney(teamValue(T1, raceTeamOf("teams/human")));
  assert.deepEqual(model.options, [
    { id: "t1", name: "Mock Team", line: `Human · TV ${value} · in the season`, checked: true },
    { id: "t2", name: "Mock Humans", line: `Human · TV ${value}`, checked: false },
  ]);
  assert.deepEqual([model.chosenId, model.cta], ["t1", { label: "Accept and go to the preparation", disabled: false }]);
  assert.equal(acceptModel({ challenge: offer, sender: { error: "No connection", code: "" }, teams: TEAMS, teamId: "t1" }).line, "Orc", "a read that failed: the race alone");
  assert.equal(acceptModel({ challenge: offer, sender: null, teams: TEAMS, teamId: "t1" }).line, "Orc", "while it is read: the race alone");
  assert.equal(acceptModel({ challenge: offer, sender: { ...sender, user: { id: "u5", login: "orc_boss", telegram: "" } }, teams: TEAMS, teamId: "t1" }).line,
    `Orc · TV ${formatMoney(worth)}`);
  assert.equal(acceptModel({ challenge: offer, sender, teams: TEAMS, choiceId: "t2", teamId: "t1" }).chosenId, "t2");
  assert.equal(acceptModel({ challenge: offer, sender, teams: TEAMS, choiceId: "zz", teamId: "t1" }).chosenId, "t1", "a team not the coach's: the page's");
  const nothing = acceptModel({ challenge: offer, sender, teams: [], teamId: "t1" });
  assert.deepEqual([nothing.chosenId, nothing.cta.disabled], ["", true], "no team to play: nothing to accept with");
  const raceless = acceptModel({ challenge: { ...offer, team: { id: "r1", name: "Grimtusk Raiders" } }, sender: null, teams: TEAMS, teamId: "t1" });
  assert.equal(raceless.line, "", "a challenge sent without the race says none");
});

test("names are text", () => {
  const hostile = { id: "u9", login: HOSTILE, teams: [{ id: "h1", name: HOSTILE, baseTeamSlug: "teams/orc" }] };
  const challenges = [pending("c1", hostile, ME, hostile.teams[0], TODAY)];
  const page = challengesModel({ payload: { challenges, opponents: [hostile] }, games: [], teamId: "t1", viewerId: "u1", teams: TEAMS, now: NOW, phone: true });
  assert.equal(page.incoming[0].login, HOSTILE);
  assert.equal(page.incoming[0].line, `${HOSTILE} · Orc · challenge today`);
  assert.equal(teamsLine(hostile), HOSTILE);
  assert.equal(coachInitial(HOSTILE), "<");
  assert.deepEqual([coachInitial("  ёжик"), coachInitial(""), coachInitial(null)], ["Ё", "?", "?"]);
  const sheet = sendModel({ ...base, payload: { challenges: [], opponents: [hostile] }, chosenId: "u9" });
  assert.equal(sheet.cta.label, `Challenge ${HOSTILE}`);
  assert.equal(acceptModel({ challenge: challenges[0], sender: null, teams: TEAMS, teamId: "t1" }).title, `${HOSTILE} · ${HOSTILE}`);
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/matches/challenges-model.mjs", "src/data/challenges.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const kind of HISTORY_KINDS) assert.ok(words[`friendly.status.${kind}`], `${locale} friendly.status.${kind}`);
  }
});

test("the challenges are read: the list and the coaches; an answer without them is no answer", async () => {
  api.reset();
  const list = { challenges: [pending("c1", RIVAL, ME, RIVAL.teams[0], TODAY)], teams: [], opponents: OPPONENTS };
  api.reply("GET /api/challenges", 200, list);
  assert.deepEqual(await readChallenges(), { challenges: list.challenges, opponents: OPPONENTS });
  api.reply("GET /api/challenges", 200, { challenges: [] });
  assert.deepEqual(await readChallenges(), { error: t("request.noAnswer"), code: "" });
  api.fail("GET /api/challenges");
  assert.deepEqual(await readChallenges(), { error: t("request.offline"), code: "" });
});

test("a challenge is sent once with the coach and the team; a refusal says whether an answer came", async () => {
  api.reset();
  api.reply("POST /api/challenges", 201, { id: "c9" });
  assert.deepEqual(await sendChallenge({ opponentId: "u2", teamId: "t1" }), { id: "c9" });
  assert.deepEqual(api.calls.at(-1).body, { opponentId: "u2", teamId: "t1" });
  api.reply("POST /api/challenges", 409, { error: { code: "CHALLENGE_ALREADY_SENT", message: "Already sent" } });
  assert.deepEqual(await sendChallenge({ opponentId: "u2", teamId: "t1" }),
    { error: t("error.CHALLENGE_ALREADY_SENT"), code: "CHALLENGE_ALREADY_SENT", lost: false });
  api.fail("POST /api/challenges");
  assert.deepEqual(await sendChallenge({ opponentId: "u2", teamId: "t1" }), { error: t("request.offline"), code: "", lost: true });
  api.reply("POST /api/challenges", 502, {});
  assert.deepEqual(await sendChallenge({ opponentId: "u2", teamId: "t1" }), { error: t("request.noAnswer"), code: "", lost: true });
  api.reply("POST /api/challenges", 201, {});
  assert.deepEqual(await sendChallenge({ opponentId: "u2", teamId: "t1" }), { error: t("request.noAnswer"), code: "", lost: true },
    "an answer without the challenge's id stands behind nothing");
  api.assertAnswered();
});

test("an answer to a challenge: accept with the team, decline and cancel with nothing", async () => {
  api.reset();
  api.reply("POST /api/challenges/c1/accept", 200, { gameId: "g9" });
  assert.deepEqual(await answerChallenge("c1", "accept", "t2"), { gameId: "g9" });
  assert.deepEqual(api.calls.at(-1).body, { teamId: "t2" });
  api.reply("POST /api/challenges/c1/decline", 200, { gameId: null });
  assert.deepEqual(await answerChallenge("c1", "decline"), { gameId: null });
  assert.deepEqual(api.calls.at(-1).body, {});
  api.reply("POST /api/challenges/c2/cancel", 200, { gameId: null });
  assert.deepEqual(await answerChallenge("c2", "cancel", "t1"), { gameId: null });
  assert.deepEqual(api.calls.at(-1).body, {}, "only an accept names a team");
  api.reply("POST /api/challenges/c1/accept", 409, { error: { code: "CHALLENGE_CLOSED", message: "Closed" } });
  assert.deepEqual(await answerChallenge("c1", "accept", "t2"), { error: t("error.CHALLENGE_CLOSED"), code: "CHALLENGE_CLOSED", lost: false });
  api.fail("POST /api/challenges/c1/accept");
  assert.equal((await answerChallenge("c1", "accept", "t2")).lost, true);
  api.reply("POST /api/challenges/c1/accept", 200, { gameId: null });
  assert.equal((await answerChallenge("c1", "accept", "t2")).lost, true, "an accept that names no match stands behind nothing");
  await assert.rejects(() => answerChallenge("c1", "delete"), /unknown challenge action/);
  assert.equal(api.calls.filter(({ key }) => key.endsWith("/delete")).length, 0);
  api.assertAnswered();
});
