/**
 * `#/teams/new`: a new team, in two steps. The first asks for a name and a race
 * (`pickMarkup`, this file's); the second is the builder (builder-view.mjs),
 * where the squad and the staff are chosen, and where the team is saved.
 *
 * The build lives in the memory of this module and nowhere else: going to
 * another screen and coming back finds it as it was, a reload or a closed tab
 * asks first (`beforeunload`, while there is a player or a purchase in it), and
 * a session that ends, or another coach on this browser, starts from nothing.
 * The team is made on the server by one request, at «Save team» (`createTeam`,
 * data/teams.mjs, which also finds the team again when an answer is lost, so
 * that a press that went unanswered does not make a second one). «Create» on the
 * first step writes nothing.
 *
 * Which rule refuses what is the build's (domain/roster/build.mjs) and how it
 * looks is builder-view's; this file is the state between them and the one place
 * that talks to the server. Every change of the state ends in `draw()`, which
 * patches the screen to match, so that the focus and the caret stay where they are.
 */
import { escapeHtml, listenerGroup } from "../../core/dom.mjs";
import { tokenMoved } from "../../core/api-client.mjs";
import { t } from "../../core/i18n.mjs";
import { fileToOptimizedLogoDataUrl, logoUploadMaxBytes } from "../../core/logo-upload.mjs";
import { refUrl, teamUrl, teamsUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { forgetRetiredKeys } from "../../core/storage.mjs";
import { view } from "../../core/view.mjs";
import { patchWithModal } from "../../components/dialog.mjs";
import { toast } from "../../components/toast.mjs";
import { onSessionChange } from "../../data/session.mjs";
import { createTeam, raceTeamOf } from "../../data/teams.mjs";
import { BUILD_STAFF_KEYS, buildRequest, buildTotals, dropPlayer, hirePlayer, newBuild, stepStaff } from "../../domain/roster/build.mjs";
import { setRosterCaptain } from "../../domain/roster/players.mjs";
import { teamFavouredOptions, teamLeagueOptions } from "../../domain/roster/team-rules.mjs";
import { countToNumber } from "../../domain/roster/values.mjs";
import { renderButton } from "../../ui/button.mjs";
import { wireRadioGroups } from "../../ui/choice.mjs";
import { icon } from "../../ui/icons.mjs";
import { renderTextField } from "../../ui/text-field.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { buildRefusalText, builderMarkup, wireBuilder } from "./builder-view.mjs";

/** What a logo may be once it is read: the pictures the file field offers, and the WebP the optimiser makes of them (the team's settings take one so too). */
export const LOGO_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,/;

/** What each choice of the team's card changes in the draft, and what it may be chosen from. */
const CHOICES = {
  league: { field: "selectedLeague", options: teamLeagueOptions },
  favoured: { field: "favouredChoice", options: teamFavouredOptions },
};

// ---------------------------------------------------------------------------
// The first step
// ---------------------------------------------------------------------------

/** The name and the race are all the first step asks; its button says which of them is still missing. */
function createLabel(name, raceChosen) {
  if (!name) return t("newTeam.needName");
  if (!raceChosen) return t("newTeam.needRace");
  return t("newTeam.create", { name });
}

/** One radio group of buttons: Tab enters at the chosen race, or at the first when none is, and the arrows move along it (the team's settings change a race on it). */
export function racesMarkup(races, raceSlug) {
  const checked = races.findIndex((race) => race.slug === raceSlug);
  const entry = Math.max(0, checked);
  const items = races.map((race, index) => `<button type="button" class="g-races__item" role="radio" aria-checked="${index === checked}" tabindex="${index === entry ? 0 : -1}"`
    + ` data-race="${escapeHtml(race.slug)}" data-key="race-${escapeHtml(race.slug)}">${escapeHtml(race.title)}</button>`);
  return `<div class="g-races" role="radiogroup" aria-label="${escapeHtml(t("newTeam.race"))}">${items.join("")}</div>`;
}

/**
 * The first step of a new team: its name and its race (TeamNew, DeskTeamNew).
 *
 * @param {object} props
 * @param {string} props.name what the coach typed, as typed (it is trimmed where it is used)
 * @param {string} props.raceSlug the race chosen, or ""
 * @param {{slug: string, title: string}[]} props.races the races to choose from
 * @param {string} props.seasonName the line under the title: the season's name, or "" for the league's
 * @param {boolean} props.resets going on from here to another race would lose a squad that was begun
 * @returns {string}
 */
export function pickMarkup({ name, raceSlug, races, seasonName, resets }) {
  const trimmed = String(name).trim();
  const raceChosen = races.some((race) => race.slug === raceSlug);
  const back = `<a class="g-icon-btn" href="${escapeHtml(teamsUrl())}" data-history-back data-history-fallback="${escapeHtml(teamsUrl())}" aria-label="${escapeHtml(t("common.back"))}">${icon("back", 18)}</a>`;
  const head = `<header class="g-new__head">${back}<div class="g-new__titles"><h1 class="g-new__title" tabindex="-1">${escapeHtml(t("newTeam.title"))}</h1>`
    + `<p class="g-new__sub">${escapeHtml(seasonName || t("shell.league"))}</p></div></header>`;
  const field = renderTextField({ id: "new-team-name", name: "name", label: t("newTeam.name"), placeholder: t("newTeam.namePlaceholder"), value: name, autocomplete: "off" });
  // The group is named by its aria-label; the visible word over it is for the eye alone, or a reader would say it twice.
  const body = `<div class="g-new__body">${field}<span class="g-new__label" aria-hidden="true">${escapeHtml(t("newTeam.race"))}</span>${racesMarkup(races, raceSlug)}`
    + `${resets ? `<p class="g-races__resets">${escapeHtml(t("newTeam.raceResets"))}</p>` : ""}`
    + `<a class="g-new__ref" href="${escapeHtml(refUrl("teams"))}">${escapeHtml(t("newTeam.raceRules"))}</a></div>`;
  // The way back to the list is the head's arrow on a phone and the foot's button on a desk; each is drawn where it belongs.
  const foot = `<footer class="g-new__foot">${renderButton({ label: t("teams.title"), href: teamsUrl(), icon: "back" })}`
    + `${renderButton({ kind: "primary", label: createLabel(trimmed, raceChosen), disabled: !trimmed || !raceChosen, data: { newTeamCreate: true } })}</footer>`;
  return `<div class="g-new" data-key="new-pick"><div class="g-new__card">${head}${body}${foot}</div></div>`;
}

// ---------------------------------------------------------------------------
// What the module remembers
// ---------------------------------------------------------------------------

/**
 * The build of the coach on this browser, or null for none. `draft` is the build's own (domain/roster/build.mjs),
 * kept from «Change the race or the name» to the next «Create» when the race stays. `startedAt` is when the
 * draft was begun, not when it was opened again: `createTeam` looks for a team made since then when an answer is lost.
 * @typedef {object} Flow
 * @property {string|undefined} userId whose build it is
 * @property {"pick"|"build"} step
 * @property {string} name as typed on the first step
 * @property {string} raceSlug
 * @property {object|null} draft
 * @property {number} startedAt
 * @property {boolean} rosterOpen the phone's list of numbers and names is open
 * @property {"league"|"favoured"|null} choice the sheet that is open
 * @property {boolean} pending the request that saves the team is on its way
 * @property {string} refusal why the save was refused, as a sentence
 */

/** @type {Flow|null} */
let flow = null;

/** Whether the coach is on the screen now: one object for every visit, so that a visit that was left stays closed. */
let visit = null;

/** @returns {Flow} */
const freshFlow = (userId) => ({ userId, step: "pick", name: "", raceSlug: "", draft: null, startedAt: 0, rosterOpen: false, choice: null, pending: false, refusal: "" });

/** A player or a purchase is something a reload would lose. */
const holdsPicks = (draft) => Boolean(draft) && (draft.players.length > 0 || BUILD_STAFF_KEYS.some((key) => countToNumber(draft[key]) > 0));

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
 * A reload or a closed tab while a squad is begun asks first, on either step: the first step keeps the squad of the
 * same race (it says so), and a reload would lose it. A build with nobody and nothing bought has nothing to lose.
 */
function askBeforeLeaving(event) {
  if (!holdsPicks(flow?.draft)) return;
  event.preventDefault();
  // Browsers that ask only for a returnValue are asked too; an event that has no setter for it is not an error.
  Reflect.set(event, "returnValue", "");
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Patch the screen to match the state: the step the coach is on, the sheet over it if one is open. */
function draw() {
  if (!visit?.open || !flow) return;
  if (flow.step === "build") {
    patchWithModal(view, builderMarkup({ race: raceTeamOf(flow.raceSlug), draft: flow.draft, rosterOpen: flow.rosterOpen, choice: flow.choice, pending: flow.pending, refusal: flow.refusal }), flow.choice ? "#new-team-choice" : "");
    // The button stays enabled while the request is on its way (a disabled one that holds the focus loses it); this says so, and the press is dropped in save().
    if (flow.pending) view.querySelector("[data-new-team-save]")?.setAttribute("aria-busy", "true");
  } else {
    const resets = holdsPicks(flow.draft);
    patchWithModal(view, pickMarkup({ name: flow.name, raceSlug: flow.raceSlug, races: state.data.teams, seasonName: state.season.data?.season?.name ?? "", resets }));
  }
}

/** The h1 is a place for the keyboard to start from: the button that was pressed is gone with its step. */
const focusTitle = () => view.querySelector("h1")?.focus();

function show(step) {
  flow.step = step;
  draw();
  focusTitle();
}

// ---------------------------------------------------------------------------
// The buttons
// ---------------------------------------------------------------------------

/**
 * A handler of one step, run on the build there is: when it is gone (the session ended, the team was made and the
 * route has not changed yet) or is on the other step, a press has nothing to change.
 */
function onStep(step, act) {
  return (...args) => {
    if (flow?.step === step) act(flow, ...args);
  };
}

/**
 * «Create»: the build of this race, with this name. The same race keeps what was picked and only renames it; another
 * starts again, and the moment it starts is the one `createTeam` will look from.
 */
function create(build) {
  const name = build.name.trim();
  const race = raceTeamOf(build.raceSlug);
  if (!name || !race) return;
  if (build.draft?.teamSlug === race.slug) {
    build.draft.teamName = name;
  } else {
    build.draft = newBuild(race, { name });
    build.startedAt = Date.now();
    build.rosterOpen = false;
    build.choice = null;
  }
  build.refusal = "";
  show("build");
}

/** A step the rule refuses is told in its words: with the staff's name, not the code's key. */
function said(refusal) {
  if (refusal) toast(buildRefusalText(refusal), { tone: "error" });
}

function hire(build, rowIndex, delta) {
  if (delta > 0) said(hirePlayer(raceTeamOf(build.raceSlug), build.draft, rowIndex));
  else dropPlayer(raceTeamOf(build.raceSlug), build.draft, rowIndex);
  draw();
}

function stepStaffBy(build, key, delta) {
  said(stepStaff(raceTeamOf(build.raceSlug), build.draft, key, delta));
  draw();
}

/** Typing changes the draft and nothing on the page: the radios are named by the field itself, and a redraw per key would only fight the caret. */
function rename(build, playerId, field, value) {
  const player = build.draft.players.find((item) => item.id === playerId);
  if (player) player[field] = String(value);
}

/**
 * A picture of up to 2 MB, read and made smaller. It goes to the draft it was picked for: one the coach has since
 * replaced (another race) or left behind keeps it, and no other build gets it. A file that cannot be read, or that
 * is not a picture the builder can show (and offer to take away), leaves the logo the draft had and says so.
 */
async function takeLogo(build, file) {
  if (file.size > logoUploadMaxBytes) {
    toast(t("savedRoster.logoTooLarge"), { tone: "error" });
    return;
  }
  const { draft } = build;
  let logo = "";
  try {
    logo = await fileToOptimizedLogoDataUrl(file);
  } catch {
    logo = "";
  }
  if (!LOGO_DATA_URL.test(logo)) {
    toast(t("newTeam.logoUnreadable"), { tone: "error" });
    return;
  }
  draft.logoData = logo;
  draw();
}

/** The button that held the focus goes with the logo it took away: the file field is the next place to be. */
function dropLogo(build) {
  build.draft.logoData = "";
  draw();
  view.querySelector('input[type="file"]')?.focus();
}

function openChoice(build, kind) {
  if (!Object.hasOwn(CHOICES, kind)) return;
  build.choice = kind;
  draw();
}

/** Every way out of the sheet gives the focus back to the button that opened it: it is still there, and the sheet is gone. */
function closeChoice(build) {
  const kind = build.choice;
  build.choice = null;
  draw();
  if (kind) view.querySelector(`[data-new-team-choice="${kind}"]`)?.focus();
}

function choose(build, kind, value) {
  if (Object.hasOwn(CHOICES, kind) && CHOICES[kind].options(raceTeamOf(build.raceSlug)).includes(value)) build.draft[CHOICES[kind].field] = value;
  closeChoice(build);
}

/**
 * «Save team»: one request, made once. A press while it is on its way is dropped (`pending`); a squad that may not be
 * saved sends nothing, whoever presses (a disabled button takes no click in a browser, but the screen does not rely
 * on it). The team made, the build is done: the toast and the team's overview. A refusal stays by the button and the
 * build stays. A coach who has left meanwhile is told in a toast and not taken anywhere; a build that is gone (the
 * session ended or changed), or whose token another tab has moved, is not told of at all.
 */
async function save(build) {
  const race = raceTeamOf(build.raceSlug);
  const { draft } = build;
  if (build.pending || !buildTotals(race, draft).ready || !String(draft.teamName).trim()) return;
  build.pending = true;
  build.refusal = "";
  draw();
  const request = buildRequest(race, draft);
  const answer = await createTeam(request, { startedAt: build.startedAt });
  if (flow !== build) return;
  build.pending = false;
  if (!answer.team) {
    if (visit?.open && build.step === "build") {
      build.refusal = answer.refusal;
      draw();
    } else {
      toast(answer.refusal, { tone: "error" });
    }
    return;
  }
  flow = null;
  // Another tab has moved the token while the request was out: the page is about to read the session again, and the
  // team is not for whoever is signed in now, so it is neither told of nor opened (the list is read again with the session).
  if (tokenMoved()) return;
  toast(t("newTeam.created", { name: request.name }));
  if (visit?.open) location.hash = teamUrl(answer.team.id);
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function renderNewTeam() {
  // The 2.x builder's draft is not offered back; it is erased, since its logo can hold much of the browser's quota.
  forgetRetiredKeys();
  watchSession();
  const userId = state.auth.currentUser?.id;
  if (flow?.userId !== userId) flow = freshFlow(userId);
  const mine = { open: true };
  const group = listenerGroup(view);
  // Registered first: the visit before this one (the same route drawn again) is released before this one is wired.
  onScreenLeave("new-team", () => {
    mine.open = false;
    globalThis.removeEventListener("beforeunload", askBeforeLeaving);
    group.release();
  });
  visit = mine;
  globalThis.addEventListener("beforeunload", askBeforeLeaving);
  group.on("input", "#new-team-name", onStep("pick", (build, event, input) => {
    build.name = input.value;
    draw();
  }));
  group.own(wireRadioGroups(view, { group: ".g-races", item: "[data-race]", attribute: "data-race", onChange: onStep("pick", (build, slug) => {
    build.raceSlug = slug;
    draw();
  }) }));
  group.on("click", "[data-new-team-create]", onStep("pick", create));
  group.own(wireBuilder(view, {
    onHire: onStep("build", hire),
    onStaff: onStep("build", stepStaffBy),
    // A medic is bought once: the switch is a step up or a step down.
    onToggleStaff: onStep("build", (build, key, on) => stepStaffBy(build, key, on ? 1 : -1)),
    onRefused: (reason) => toast(reason, { tone: "error" }),
    onRosterToggle: onStep("build", (build) => {
      build.rosterOpen = !build.rosterOpen;
      draw();
    }),
    onNumber: onStep("build", (build, playerId, value) => rename(build, playerId, "number", value)),
    onName: onStep("build", (build, playerId, value) => rename(build, playerId, "name", value)),
    // The radio group has already moved the selection on the page; the draft follows it.
    onCaptain: onStep("build", (build, playerId) => setRosterCaptain(build.draft, playerId, true)),
    onLogo: onStep("build", takeLogo),
    onLogoRemove: onStep("build", dropLogo),
    onChoiceOpen: onStep("build", openChoice),
    onChoose: onStep("build", choose),
    onChoiceClose: onStep("build", closeChoice),
    onRestart: onStep("build", () => show("pick")),
    onSave: onStep("build", save),
  }));
  draw();
  focusTitle();
  // A page opened on this address has not read the season yet: its name stands under the title once it is in.
  void loadSeason().then(draw);
}
