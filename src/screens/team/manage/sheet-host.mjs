/**
 * Where the team page's sheets stand, and the plumbing each of them shares.
 *
 * A sheet is opened from a button that is not its own (the treasury strip, the phone's treasury card, a row of
 * the resources), and it must outlive the redraws of the screen around it: a screen that patches its markup
 * would close a dialog standing in it. So a sheet stands in a host of its own at the end of `<body>`, which
 * whoever opens it mounts and takes away again with the screen.
 *
 * `sheetController` is what every sheet of the page does the same way: the form it holds while it is open, the
 * redraw that keeps the focus and the caret (and keeps it in the sheet when what the page holds shuts the control it
 * was on), the close that gives the focus back to the button that opened it, and one press that sends one write, with
 * what the sheet says while it waits and when it is refused.
 */
import { toast } from "../../../components/toast.mjs";
import { focusLost } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { view } from "../../../core/view.mjs";
import { isWriting } from "../../../data/treasury.mjs";
import { patchWithModal } from "../../../ui/sheet.mjs";
import { teamOf } from "./team-of.mjs";

/**
 * A toast about a write of `teamId`. A write can land after the coach has gone to another team's page (a sheet, a
 * resource step): what it says is then said with the team's name, so it is not taken for news of the team shown.
 * @param {string} teamId @param {string} text @param {object} [options] the toast's own
 */
export function teamToast(teamId, text, options) {
  const team = teamId === state.activeTeamId ? null : teamOf(teamId);
  toast(team ? t("treasury.otherTeam", { team: team.name, text }) : text, options);
}

/** @param {string} name what the sheet is called: `[data-sheet-host="name"]` @returns {Element} */
export function mountSheetHost(name) {
  const host = document.createElement("div");
  host.setAttribute("data-sheet-host", name);
  document.body.append(host);
  return host;
}

/** The sheet open in the host is closed, and the host goes. */
export function unmountSheetHost(host) {
  host.querySelector("dialog")?.close();
  host.parentNode?.removeChild(host);
}

/**
 * The focus back to the button that opened a sheet, if the page still shows it. A sheet that names its openers'
 * attribute (`openerKey`: the money sheet's `data-treasury-money`, the team it writes to) finds another when a redraw
 * took that button away or a width that crossed 900px hid it (the desk strip's pencil and the phone card's «+ Add» and
 * «− Take» all stay in the page, each shown on one width): the first shown button of the same team, else the page's
 * h1, never the body. A sheet with none (the settings find their own place) gives it only to the button itself.
 * @param {Element} back @param {string} openerKey
 */
function giveFocusBack(back, openerKey) {
  if (!focusLost(back)) back.focus();
  else if (openerKey) {
    const team = back.getAttribute(openerKey);
    const shown = [...view.querySelectorAll(`[${openerKey}]`)]
      .find((button) => button.getAttribute(openerKey) === team && !focusLost(button));
    (shown ?? view.querySelector("h1"))?.focus();
  }
}

/** Whether the focus is on nothing a keyboard can go on from: lost (`focusLost`), or on a control that is disabled now. */
const shut = (active) => focusLost(active) || active.hasAttribute?.("disabled") === true;

/**
 * One sheet in one host. The form is the sheet's own object (`teamId`, `pending` and `refusal` among its fields);
 * the controller never looks inside it but for those three, and `markup(form)` draws it from whatever the page holds
 * at that moment (the treasury, a match that has gone live), so every redraw is current. `opened` counts the
 * openings, which tells a press made on this sheet from one made on an earlier opening of it.
 *
 * @param {Element} host from `mountSheetHost`
 * @param {object} options
 * @param {string} options.id the id of the dialog `markup` draws
 * @param {(form: object) => string} options.markup the sheet, closed (`patchWithModal` opens it)
 * @param {string} [options.openerKey] the attribute its openers carry, to find one again (`giveFocusBack`)
 */
export function sheetController(host, { id, markup, openerKey = "" }) {
  let form = null;
  let opener = null;
  let opened = 0;

  /** A host that left the page cannot show a dialog (`showModal` throws on one), and has nothing to redraw. */
  function redraw() {
    if (form && host.isConnected) patchWithModal(host, markup(form), `#${id}`);
  }

  function change(changes) {
    if (!form) return;
    form = { ...form, ...changes };
    redraw();
  }

  /**
   * What the page holds moved (the team, the games): the sheet is drawn again from it. The note that another save
   * of the team is on its way goes once that save is no longer on its way, or it would ask the coach to wait for nothing.
   * What moved may shut the control the focus is on — a match that went live disables the sheet's button, and Chrome
   * drops a focus on a button that turns disabled, to the body, out of the open sheet: it goes to the sheet's cross,
   * which every sheet has (08 N3; pre-flight L19: the sheet's title takes no focus). A focus the redraw leaves on an
   * open control, or one outside the sheet, stays where it is.
   */
  function follow() {
    if (form?.refusal === t("treasury.writing") && !isWriting(form.teamId)) form = { ...form, refusal: "" };
    const held = host.contains(document.activeElement);
    redraw();
    if (held && shut(document.activeElement)) host.querySelector("[data-sheet-close]")?.focus();
  }

  /** The form is forgotten, the dialog goes, and the focus goes back to the button that opened it (`giveFocusBack`). */
  function close() {
    if (!form) return;
    form = null;
    opened += 1;
    patchWithModal(host, "");
    const back = opener;
    opener = null;
    if (back) giveFocusBack(back, openerKey);
  }

  function open(next, from = null) {
    opened += 1;
    form = next;
    opener = from;
    redraw();
  }

  const sheet = {
    get form() { return form; },
    get opened() { return opened; },
    open,
    change,
    redraw,
    follow,
    close,
    /** The control a disabled button's focus goes to: a button that turns disabled under the focus drops it in Chrome. */
    focus: (selector) => host.querySelector(selector)?.focus(),
    submit: (send, options) => submit(sheet, host, send, options),
  };
  return sheet;
}

/**
 * One press, one write. The sheet says it waits (`pending`: its button is not disabled, a focused button that
 * is drops the focus in Chrome, so the second press is refused here) and then, by what came back:
 *  - `{ignored}`, another write for the team is on its way (the coach may have closed this sheet and opened it
 *    again while the first was still going): nothing was sent, and the sheet says to wait and press again;
 *  - `{refusal}`: said in the sheet, which stays open. A `changed` or `unknown` refusal (the entry may have been
 *    written) also resets the fields in `startOver`, so that a new try is a new, deliberate entry after the coach
 *    has looked at the history, never one more press on the same button; the button is disabled then, so the focus
 *    goes to `refocus`. The write has read the team and its history again on either (data/treasury.mjs);
 *  - a write that throws is a write whose fate is not known: it is `unknown`, the sheet never stays on «Saving…»,
 *    and `options.unknown` reads again what the write, which threw, did not;
 *  - anything else is the write done: the sheet closes, and `done(answer)` says so.
 * A sheet closed while the write was on its way has nothing to say it in: the toast does (an entry that went
 * through, or a refusal that would otherwise be lost), naming the team when the coach has gone to another
 * (`teamToast`). A sheet opened again since may be saying to wait for this very write: it follows (`follow`).
 *
 * @param {ReturnType<typeof sheetController>} sheet
 * @param {Element} host
 * @param {Function} send the write, asynchronous: it answers with the write's result
 * @param {object} options
 * @param {(answer: object) => void} options.done
 * @param {object} [options.startOver] the form fields a `changed` or `unknown` refusal puts back
 * @param {string} [options.refocus] selector of what takes the focus then
 * @param {() => void} [options.unknown]
 */
async function submit(sheet, host, send, { done, startOver = {}, refocus = "", unknown = () => {} }) {
  if (!sheet.form || sheet.form.pending) return;
  const sent = sheet.opened;
  const { teamId } = sheet.form;
  sheet.change({ pending: true, refusal: "" });
  let answer;
  try {
    answer = await send();
  } catch {
    answer = { refusal: t("treasury.mayHaveWritten"), unknown: true };
    unknown();
  }
  const shown = sent === sheet.opened && host.isConnected;
  if (answer.ignored || answer.refusal !== undefined) {
    const startedOver = Boolean(answer.changed || answer.unknown);
    if (!shown) {
      // An ignored press of a sheet that has gone changed nothing; a refusal would otherwise be lost.
      if (!answer.ignored) teamToast(teamId, answer.refusal, { tone: "error" });
      sheet.follow();
      return;
    }
    sheet.change({ pending: false, refusal: answer.ignored ? t("treasury.writing") : answer.refusal, ...(startedOver ? startOver : {}) });
    if (startedOver && refocus) sheet.focus(refocus);
    // A sheet taller than the window scrolls its body, and the button, which is what was pressed, stays in view: the refusal must too.
    host.querySelector('[role="alert"]')?.scrollIntoView?.({ block: "nearest" });
    return;
  }
  if (sent === sheet.opened) sheet.close();
  done(answer);
}
