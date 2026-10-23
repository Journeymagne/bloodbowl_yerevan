/**
 * Brief messages that do not stop the page.
 *
 * Step 7.10. Almost every one of these was an `alert()` — usually
 * `alert(error.message)` — which blocks the whole tab until dismissed, cannot
 * be styled or translated as part of the page, and in the middle of editing a
 * roster interrupts what the coach was doing to say something they can only
 * acknowledge.
 *
 * The toasts have a region of their own, which announces each one once, when
 * it arrives. It stands in the body, or, while a sheet is open, in that sheet:
 * a modal dialog puts the rest of the page under its backdrop and makes it
 * inert, so a toast in the body would be neither seen nor heard. A toast takes
 * the region to the top open modal; when that dialog closes, the region goes
 * back to the body (or to the modal still open under it). The sheet's redraws
 * leave it alone (`data-patch-keep`, core/dom.mjs), and a redraw that takes the
 * sheet away without closing it leaves the region on the page, where the next
 * toast finds it. Its look is ui/toast.css.
 */
import { errorText } from "../core/api.mjs";

const AUTO_DISMISS_MS = 6000;

let region = null;
const dismissTimers = new WeakMap();
/** The dialogs whose `close` sends the region on: one listener each, for as long as the dialog lives. */
const watched = new WeakSet();

/** The open modal dialog on top, which makes the page under it inert, or null when none is open. */
function topModal() {
  return [...document.querySelectorAll("dialog")].reverse().find((dialog) => dialog.matches(":modal")) ?? null;
}

/** Put the region where a toast is seen and heard: in the top open modal, else in the body. */
function placeRegion() {
  const host = topModal() ?? document.body;
  if (region.parentNode !== host) host.append(region);
  if (host === document.body || watched.has(host)) return;
  watched.add(host);
  host.addEventListener("close", () => {
    // A region taken out of the page with the whole page (a test's, a screen's innerHTML) is not brought back.
    if (region && (region.isConnected || host.contains(region))) placeRegion();
  });
}

function toastRegion() {
  if (!region?.isConnected || region.ownerDocument !== document) {
    region = document.createElement("div");
    region.className = "g-toasts";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.setAttribute("data-patch-keep", "");
  }
  placeRegion();
  return region;
}

/**
 * Show a message.
 *
 * @param {string} message already translated
 * @param {{tone?: "info"|"error", timeout?: number}} [options] errors stay
 *   longer, since they tend to carry something worth reading twice
 */
export function toast(message, { tone = "info", timeout } = {}) {
  const text = String(message ?? "").trim();
  if (!text) return;

  const region = toastRegion();
  const dismissAfter = timeout ?? (tone === "error" ? AUTO_DISMISS_MS * 2 : AUTO_DISMISS_MS);

  // The same message twice running is one message. A refused button pressed
  // five times has one reason, not five, and stacking copies of it buries
  // whatever else is on screen.
  const previous = region.lastElementChild;
  if (previous?.textContent === text) {
    keepFor(previous, dismissAfter);
    return;
  }

  const node = document.createElement("output");
  node.className = `g-toast g-toast--${tone}`;
  node.textContent = text;
  region.append(node);
  keepFor(node, dismissAfter);
  node.addEventListener("click", () => {
    clearTimeout(dismissTimers.get(node));
    dismiss(node);
  });
}

/** Take one toast away, wherever its region stands now. */
const dismiss = (node) => node.parentNode?.removeChild(node);

/** (Re)start one toast's countdown, so a repeat refreshes rather than piles up. */
function keepFor(node, dismissAfter) {
  clearTimeout(dismissTimers.get(node));
  dismissTimers.set(node, setTimeout(() => dismiss(node), dismissAfter));
}

/** What went wrong, said without blocking the page, in the reader's language. */
export function toastError(error) {
  toast(errorText(error), { tone: "error" });
}
