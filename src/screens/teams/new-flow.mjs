/**
 * What a new team's build remembers: the coach's name, race and draft, and the way a session that ends, or another
 * coach on this browser, takes them away. The build lives here and nowhere else: the sheet of its name and race
 * (new-sheet.mjs) begins it and the builder (new.mjs) changes it; going to another screen and coming back finds it as
 * it was.
 */
import { state } from "../../core/state.mjs";
import { onSessionChange } from "../../data/session.mjs";
import { raceTeamOf } from "../../data/teams.mjs";
import { BUILD_STAFF_KEYS, newBuild } from "../../domain/roster/build.mjs";
import { countToNumber } from "../../domain/roster/values.mjs";

/**
 * The build of the coach on this browser, or null for none. `draft` is the build's own (domain/roster/build.mjs),
 * kept from «Change the race or the name» to the next «Create» when the race stays. `startedAt` is when the
 * draft was begun, not when it was opened again: `createTeam` looks for a team made since then when an answer is lost.
 * @typedef {object} Build
 * @property {string|undefined} userId whose build it is
 * @property {string} name as typed in the sheet
 * @property {string} raceSlug
 * @property {object|null} draft
 * @property {number} startedAt
 * @property {boolean} rosterOpen the phone's list of numbers and names is open
 * @property {"league"|"favoured"|null} choice the sheet that is open
 * @property {boolean} pending the request that saves the team is on its way
 * @property {string} refusal why the save was refused, as a sentence
 */

/** @type {Build|null} */
let flow = null;

/** @returns {Build} */
const freshFlow = (userId) => ({ userId, name: "", raceSlug: "", draft: null, startedAt: 0, rosterOpen: false, choice: null, pending: false, refusal: "" });

/** A player or a purchase is something a reload would lose. */
export const holdsPicks = (draft) => Boolean(draft) && (draft.players.length > 0 || BUILD_STAFF_KEYS.some((key) => countToNumber(draft[key]) > 0));

/**
 * The page's `beforeunload` while `build` is shown: a reload or a closed tab asks first when it holds a squad. The
 * builder asks it, and so does the sheet of the name and the race while it is open over any screen: it keeps the
 * squad of the same race (it says so), and a reload would lose it. A build with nobody and nothing bought, or none
 * (gone with the session), has nothing to lose.
 * @param {Event} event @param {Build|null} build
 */
export function askBeforeLeaving(event, build) {
  if (!holdsPicks(build?.draft)) return;
  event.preventDefault();
  // Browsers that ask only for a returnValue are asked too; an event that has no setter for it is not an error.
  Reflect.set(event, "returnValue", "");
}

let watchingSession = false;

/**
 * A session that ends takes the build with it, and so does another coach's: the build is the coach's, and the next
 * one to sign in on this browser, the same coach included, starts from nothing. Heard from the first visit on, and
 * for as long as the page lives: the build outlasts the screen, and a session ends on any other one.
 */
function watchSession() {
  if (watchingSession) return;
  watchingSession = true;
  onSessionChange(() => {
    if (flow && flow.userId !== state.auth.currentUser?.id) flow = null;
  });
}

/**
 * The build of the coach who is signed in: the one in memory, or, when it is another coach's or there is none, a new
 * empty one. The first call starts listening to the session.
 * @returns {Build}
 */
export function buildOf() {
  watchSession();
  const userId = state.auth.currentUser?.id;
  if (flow?.userId !== userId) flow = freshFlow(userId);
  return flow;
}

/**
 * Whether the coach has begun a build: the builder's address draws it, and without one is «My teams» with the sheet.
 * It only reads, and puts no new build in place of the one in memory, as `buildOf` would while a session is read
 * again: then nobody is signed in, and the build held is still the coach's (see below). A caller that goes on to
 * `buildOf` asks it only with a coach signed in (`renderNewTeam`).
 */
export function hasBuild() {
  const coachId = state.auth.currentUser?.id;
  return Boolean(flow?.draft) && (coachId === undefined || flow.userId === coachId);
}

/**
 * Whether `build` is still the coach's: a session that ended, another coach, or a team that was made takes it away,
 * and what was begun on it (a request that was on its way) has nothing to change.
 * @param {Build|null|undefined} build
 * @returns {boolean}
 */
export function isCurrentBuild(build) {
  return Boolean(build) && flow === build;
}

/*
 * `pickOf`, `setPick` and `startBuild` work on the build in memory and never make one: only `buildOf` does, and what
 * opens the sheet calls it first. While a session is read again nobody is signed in until the answer is announced
 * (data/session.mjs, `readSession`), yet the coach's build is still theirs, and a keystroke in the sheet must reach
 * it, not an empty one that `buildOf` would put in its place. With no build in memory they change and begin nothing.
 */

/**
 * What the sheet shows: the name as typed, the race, and whether going on from here to another race would lose
 * a squad that was begun.
 * @returns {{name: string, raceSlug: string, resets: boolean}}
 */
export function pickOf() {
  if (!flow) return { name: "", raceSlug: "", resets: false };
  const { name, raceSlug, draft } = flow;
  return { name, raceSlug, resets: holdsPicks(draft) };
}

/** Change what the sheet holds: the fields given, and no others. */
export function setPick({ name, raceSlug }) {
  if (!flow) return;
  if (name !== undefined) flow.name = name;
  if (raceSlug !== undefined) flow.raceSlug = raceSlug;
}

const startListeners = new Set();

/**
 * Heard when a build has been begun or taken up again (`startBuild`), after the build is ready to be shown.
 * @param {() => void} listener
 * @returns {() => void} what removes it again
 */
export function onBuildStarted(listener) {
  startListeners.add(listener);
  return () => startListeners.delete(listener);
}

/**
 * «Create»: the build of this race, with this name. The same race keeps what was picked and only renames it; another
 * starts again, and the moment it starts is the one `createTeam` will look from. With no build in memory, no name or
 * no race it begins nothing and returns `false`.
 * @returns {boolean} whether a build was begun
 */
export function startBuild() {
  const build = flow;
  if (!build) return false;
  const name = build.name.trim();
  const race = raceTeamOf(build.raceSlug);
  if (!name || !race) return false;
  if (build.draft?.teamSlug === race.slug) {
    build.draft.teamName = name;
  } else {
    build.draft = newBuild(race, { name });
    build.startedAt = Date.now();
    build.rosterOpen = false;
    build.choice = null;
  }
  build.refusal = "";
  for (const listener of [...startListeners]) listener();
  return true;
}

/** The team is made: the build is done, and is forgotten if it is still the coach's. */
export function endBuild(build) {
  if (flow === build) flow = null;
}
