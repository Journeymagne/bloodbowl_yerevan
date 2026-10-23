/**
 * `#/teams/new`: the builder of the build in hand (builder-view.mjs), where the squad and the staff are chosen and
 * the team is saved. Its first step, a name and a race, is a sheet over the screen it is opened on (owner,
 * 2026-10-20), new-sheet.mjs: «Create» there begins the build and opens this address; «Change the race or the name»
 * here opens the sheet over the builder. With no build begun (the address typed, a reload, the 2.x builder's link,
 * a guest back from signing in) the address is «My teams» with the sheet open over it.
 *
 * The build lives in the memory of new-flow.mjs and nowhere else: going to another screen and coming back finds it
 * as it was, a reload or a closed tab asks first (`beforeunload`, while there is a player or a purchase in it), and
 * a session that ends, or another coach on this browser, starts from nothing. The team is made on the server by one
 * request, at «Save team» (`createTeam`, data/teams.mjs, which also finds the team again when an answer is lost, so
 * that a press that went unanswered does not make a second one). The sheet's «Create» writes nothing.
 *
 * Which rule refuses what is the build's (domain/roster/build.mjs) and how it looks is builder-view's; this file is
 * the screen between them and the one place that talks to the server. Every change of the state ends in `draw()`,
 * which patches the screen to match, so that the focus and the caret stay where they are.
 */
import { listenerGroup } from "../../core/dom.mjs";
import { tokenMoved } from "../../core/api-client.mjs";
import { t } from "../../core/i18n.mjs";
import { fileToOptimizedLogoDataUrl, logoUploadMaxBytes } from "../../core/logo-upload.mjs";
import { teamUrl, teamsUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { forgetRetiredKeys } from "../../core/storage.mjs";
import { view } from "../../core/view.mjs";
import { toast } from "../../components/toast.mjs";
import { createTeam, raceTeamOf } from "../../data/teams.mjs";
import { buildRequest, buildTotals, dropPlayer, hirePlayer, stepStaff } from "../../domain/roster/build.mjs";
import { setRosterCaptain } from "../../domain/roster/players.mjs";
import { teamFavouredOptions, teamLeagueOptions } from "../../domain/roster/team-rules.mjs";
import { patchWithModal } from "../../ui/sheet.mjs";
import { buildRefusalText, builderMarkup, wireBuilder } from "./builder-view.mjs";
import { askBeforeLeaving, buildOf, endBuild, hasBuild, isCurrentBuild, onBuildStarted } from "./new-flow.mjs";
import { askNewTeamSheet, openNewTeamSheet, sayCreatedInNewTeamSheet, sayInNewTeamSheet } from "./new-sheet.mjs";

/** What a logo may be once it is read: the pictures the file field offers, and the WebP the optimiser makes of them (the team's settings take one so too). */
export const LOGO_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,/;

/** What each choice of the team's card changes in the draft, and what it may be chosen from. */
const CHOICES = {
  league: { field: "selectedLeague", options: teamLeagueOptions },
  favoured: { field: "favouredChoice", options: teamFavouredOptions },
};

// ---------------------------------------------------------------------------
// The visit
// ---------------------------------------------------------------------------

/**
 * Whether the coach is on the screen now, and the build the screen was drawn for (new-flow.mjs): one object for every
 * visit, so that a visit that was left stays closed.
 * @type {{open: boolean, build: import("./new-flow.mjs").Build}|null}
 */
let visit = null;

/** The build the screen draws and its buttons change: none once it is gone (the session ended, the team was made and the route has not changed yet). */
const liveBuild = () => (isCurrentBuild(visit?.build) ? visit.build : null);

/** A reload or a closed tab while a squad is begun asks first (new-flow.mjs); the sheet over the builder asks the same. */
const guardLeaving = (event) => askBeforeLeaving(event, liveBuild());

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Patch the screen to match the state: the builder, and the builder's own sheet over it if one is open. */
function draw() {
  const build = visit?.open ? liveBuild() : null;
  if (!build?.draft) return;
  patchWithModal(view, builderMarkup({ race: raceTeamOf(build.raceSlug), draft: build.draft, rosterOpen: build.rosterOpen, choice: build.choice, pending: build.pending, refusal: build.refusal }), build.choice ? "#new-team-choice" : "");
  // The button stays enabled while the request is on its way (a disabled one that holds the focus loses it); this says so, and the press is dropped in save().
  if (build.pending) view.querySelector("[data-new-team-save]")?.setAttribute("aria-busy", "true");
}

/** The h1 is a place for the keyboard to start from: on arrival, and when the sheet's «Create» has begun the build again. */
const focusTitle = () => view.querySelector("h1")?.focus();

// ---------------------------------------------------------------------------
// The buttons
// ---------------------------------------------------------------------------

/** A handler run on the build there is: when it is gone (the session ended, the team was made and the route has not changed yet), a press has nothing to change. */
function onBuild(act) {
  return (...args) => {
    const build = liveBuild();
    if (build) act(build, ...args);
  };
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
  if (!isCurrentBuild(build)) return;
  build.pending = false;
  if (!answer.team) {
    if (visit?.open) {
      build.refusal = answer.refusal;
      draw();
    }
    // Under the sheet the page is inert: the sheet says it, where the coach is. On another screen with no sheet, a toast.
    if (!sayInNewTeamSheet(build, answer.refusal) && !visit?.open) toast(answer.refusal, { tone: "error" });
    return;
  }
  endBuild(build);
  // Another tab has moved the token while the request was out: the page is about to read the session again, and the
  // team is not for whoever is signed in now, so it is neither told of nor opened (the list is read again with the session).
  if (tokenMoved()) return;
  const created = t("newTeam.created", { name: request.name });
  // Over another screen, a sheet left open on this build says it there and takes the next build (the page under it is inert).
  if (visit?.open || !sayCreatedInNewTeamSheet(build, created)) toast(created);
  // In place of the builder's address: «Back» from the overview leads where the coach was before, not to a sheet for another team.
  if (visit?.open) location.replace(teamUrl(answer.team.id));
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function renderNewTeam() {
  // The 2.x builder's draft is not offered back; it is erased, since its logo can hold much of the browser's quota.
  forgetRetiredKeys();
  // Nobody signed in: a session read again (the router sends a guest to sign in first). `hasBuild` still counts the
  // coach's held build, but `buildOf` would put an empty one in its place: nothing is drawn, and the announce draws it.
  if (!state.auth.currentUser) return;
  if (!hasBuild()) {
    askNewTeamSheet();
    location.replace(teamsUrl());
    return;
  }
  const mine = { open: true, build: buildOf() };
  const group = listenerGroup(view);
  // Registered first: the visit before this one (the same route drawn again) is released before this one is wired.
  onScreenLeave("new-team", () => {
    mine.open = false;
    globalThis.removeEventListener("beforeunload", guardLeaving);
    group.release();
  });
  visit = mine;
  globalThis.addEventListener("beforeunload", guardLeaving);
  // The sheet's «Create» over the builder begins the build again: the builder shows it, its title taking the focus.
  group.own(onBuildStarted(() => {
    draw();
    focusTitle();
  }));
  group.own(wireBuilder(view, {
    onHire: onBuild(hire),
    onStaff: onBuild(stepStaffBy),
    // A medic is bought once: the switch is a step up or a step down.
    onToggleStaff: onBuild((build, key, on) => stepStaffBy(build, key, on ? 1 : -1)),
    onRefused: (reason) => toast(reason, { tone: "error" }),
    onRosterToggle: onBuild((build) => {
      build.rosterOpen = !build.rosterOpen;
      draw();
    }),
    onNumber: onBuild((build, playerId, value) => rename(build, playerId, "number", value)),
    onName: onBuild((build, playerId, value) => rename(build, playerId, "name", value)),
    // The radio group has already moved the selection on the page; the draft follows it.
    onCaptain: onBuild((build, playerId) => setRosterCaptain(build.draft, playerId, true)),
    onLogo: onBuild(takeLogo),
    onLogoRemove: onBuild(dropLogo),
    onChoiceOpen: onBuild(openChoice),
    onChoose: onBuild(choose),
    onChoiceClose: onBuild(closeChoice),
    onRestart: onBuild((build, button) => openNewTeamSheet(button)),
    onSave: onBuild(save),
  }));
  draw();
  focusTitle();
}
