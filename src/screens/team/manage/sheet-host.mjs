/**
 * Where the team page's sheets stand, and the plumbing each of them shares.
 *
 * A sheet is opened from a button that is not its own (the treasury strip, the phone's treasury card, a row of
 * the resources), and it must outlive the redraws of the screen around it: a screen that patches its markup
 * would close a dialog standing in it. So a sheet stands in a host of its own at the end of `<body>`, which
 * whoever opens it mounts and takes away again with the screen.
 *
 * `sheetController` is what every sheet of the page does the same way: the form it holds while it is open, the
 * redraw that keeps the focus and the caret, the close that gives the focus back to the button that opened it,
 * and one press that sends one write, with what the sheet says while it waits and when it is refused.
 */
import { patchWithModal } from "../../../components/dialog.mjs";
import { toast } from "../../../components/toast.mjs";

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
 * One sheet in one host. The form is the sheet's own object (`pending` and `refusal` among its fields); the
 * controller never looks inside it but for those two, and `markup(form)` draws it from whatever the page holds
 * at that moment (the treasury, a match that has gone live), so every redraw is current.
 *
 * @param {Element} host from `mountSheetHost`
 * @param {object} options
 * @param {string} options.id the id of the dialog `markup` draws
 * @param {(form: object) => string} options.markup the sheet, closed (`patchWithModal` opens it)
 */
export function sheetController(host, { id, markup }) {
  let form = null;
  let opener = null;
  // Which opening a press was made on: a sheet closed (or opened again) while a write was on its way is another sheet.
  let opening = 0;

  /** A host that left the page cannot show a dialog (`showModal` throws on one), and has nothing to redraw. */
  function redraw() {
    if (form && host.isConnected) patchWithModal(host, markup(form), `#${id}`);
  }

  function change(changes) {
    if (!form) return;
    form = { ...form, ...changes };
    redraw();
  }

  /** The form is forgotten, the dialog goes, and the focus goes back to the button that opened it, if that is still on the page. */
  function close() {
    if (!form) return;
    form = null;
    opening += 1;
    patchWithModal(host, "");
    const back = opener;
    opener = null;
    if (back?.isConnected) back.focus();
  }

  function open(next, from = null) {
    opening += 1;
    form = next;
    opener = from;
    redraw();
  }

  /**
   * One press, one write. The sheet says it waits (`pending`: its button is not disabled, a focused button that
   * is drops the focus in Chrome, so the second press is refused here) and then, by what came back:
   *  - `{ignored}`, another write for the team is on its way: the sheet is as it was;
   *  - `{refusal}`: said in the sheet, which stays open. A `changed` or `unknown` refusal (the entry may have been
   *    written) also resets the fields in `startOver`, so that a new try is a new, deliberate entry after the coach
   *    has looked at the history, never one more press on the same button; `unknown` calls `options.unknown` as well;
   *  - anything else is the write done: the sheet closes, and `done(answer)` says so.
   * A sheet closed while the write was on its way has nothing to say it in: the toast does (an entry
   * that went through, or a refusal that would otherwise be lost).
   *
   * @param {Function} send the write, asynchronous: it answers with the write's result
   * @param {object} options
   * @param {(answer: object) => void} options.done
   * @param {object} [options.startOver] the form fields a `changed` or `unknown` refusal puts back
   * @param {() => void} [options.unknown]
   */
  async function submit(send, { done, startOver = {}, unknown = () => {} }) {
    if (!form || form.pending) return;
    const sent = opening;
    change({ pending: true, refusal: "" });
    const answer = await send();
    const shown = sent === opening && host.isConnected;
    if (answer.ignored) {
      if (shown) change({ pending: false });
      return;
    }
    if (answer.refusal !== undefined) {
      if (answer.unknown) unknown();
      if (shown) {
        change({ pending: false, refusal: answer.refusal, ...(answer.changed || answer.unknown ? startOver : {}) });
        // A sheet taller than the window scrolls its body, and the button, which is what was pressed, stays in view: the refusal must too.
        host.querySelector('[role="alert"]')?.scrollIntoView?.({ block: "nearest" });
      } else toast(answer.refusal, { tone: "error" });
      return;
    }
    if (sent === opening) close();
    done(answer);
  }

  return { get form() { return form; }, open, change, redraw, close, submit };
}
