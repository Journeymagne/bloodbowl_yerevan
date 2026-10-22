/**
 * The call to enter the season on a team's pages — its overview and «Matches» (stage 12, decision 22).
 *
 * The 2.x season screen entered a team from a list; since stage 12 the call «Not entered in the season» does it: a
 * plain banner with one button, «Enter the season», which asks first (the confirmation names the team and the season,
 * and that an administrator moves a team into the season) and then sends one entry (data/season-entry.mjs). A coach
 * whose other team plays this season reads why there is no button. What the call says is `seasonCallFor`'s; the
 * screens draw its button busy while the entry is on its way (`seasonEnterVisit`'s `busy`), through every draw.
 */
import { delegate, drawKeepingFocus } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { toast } from "../../components/toast.mjs";
import { enterSeason, seasonCallFor } from "../../data/season-entry.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { confirmAction } from "../../ui/sheet.mjs";

/**
 * The call as a banner: «Enter the season» for `enter`, the other team named for `taken`; nothing for no call. A team in
 * its build is told an administrator moves it into the season; one already in it (made before stage 12) is not.
 * @param {{kind: "enter", draft?: boolean}|{kind: "taken", other: string}|null} call `seasonCallFor`'s
 * @param {boolean} [busy] the entry is on its way: the button says so (aria-busy)
 */
export function enterCallMarkup(call, busy = false) {
  if (!call) return "";
  const title = t("teamOverview.notInSeason");
  if (call.kind === "taken") return renderCallout({ title, sub: t("teamOverview.enterTaken", { other: call.other }) });
  const button = renderButton({ label: t("teamOverview.enter"), busy, dialog: true, data: { seasonEnter: true } });
  return renderCallout({ title, sub: call.draft ? t("teamOverview.enterNote") : "", actionHtml: button });
}

/**
 * A visit's presses of «Enter the season» on `root`: one question at a time, one entry on its way, the button busy
 * meanwhile. An entry that went in is said in a toast, and the call goes with it — the focus that was on its button
 * goes to the title; a refusal is the server's words, and the button stays.
 *
 * @param {{root: Element, teamId: string, here: () => boolean, draw: () => void}} props
 * @returns {{busy: boolean, off: () => void}} `busy` — the entry on its way; `off` stops listening
 */
export function seasonEnterVisit({ root, teamId, here, draw }) {
  const visit = { busy: false, asking: false };
  const press = async () => {
    const call = seasonCallFor(teamId, state.season.data, state.myTeams.items);
    if (visit.busy || visit.asking) return;
    // The call is no longer «enter» (the entry went in from another page meanwhile): the page is drawn as it is now.
    if (call?.kind !== "enter") return drawKeepingFocus(root, draw, "h1");
    const team = state.myTeams.items.find((item) => item.id === teamId)?.name ?? "";
    const season = state.season.data?.season?.name ?? "";
    const message = t(call.draft ? "teamOverview.enterConfirm" : "teamOverview.enterConfirmActive", { team, season });
    visit.asking = true;
    const yes = await confirmAction({ message, confirmLabel: t("teamOverview.enter") }).finally(() => {
      visit.asking = false;
    });
    if (!yes || !here()) return;
    visit.busy = true;
    draw();
    const outcome = await enterSeason(teamId);
    visit.busy = false;
    if (!here()) return;
    if (outcome.entered) toast(t("teamOverview.entered", { team }));
    else if (outcome.refusal) toast(outcome.refusal, { tone: "error" });
    drawKeepingFocus(root, draw, "h1");
  };
  const off = delegate(root, "click", "[data-season-enter]", () => {
    void press();
  });
  return { get busy() { return visit.busy; }, off };
}
