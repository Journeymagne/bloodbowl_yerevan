/**
 * Brief messages that do not stop the page.
 *
 * Step 7.10. Almost every one of these was an `alert()` — usually
 * `alert(error.message)` — which blocks the whole tab until dismissed, cannot
 * be styled or translated as part of the page, and in the middle of editing a
 * roster interrupts what the coach was doing to say something they can only
 * acknowledge.
 *
 * Toasts live outside `#app-view` on purpose. That element is
 * `aria-live="polite"` and every screen re-render rewrites it wholesale, so a
 * message placed inside would be re-announced on the next keystroke; this
 * region announces once, when the message arrives.
 */
import { errorText } from "../core/api.mjs";

const AUTO_DISMISS_MS = 6000;

let region = null;
const dismissTimers = new WeakMap();

function toastRegion() {
  if (region?.isConnected) return region;
  region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  document.body.append(region);
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
  node.className = `toast toast-${tone}`;
  node.textContent = text;
  region.append(node);
  keepFor(node, dismissAfter);
  node.addEventListener("click", () => {
    clearTimeout(dismissTimers.get(node));
    node.remove();
  });
}

/** (Re)start one toast's countdown, so a repeat refreshes rather than piles up. */
function keepFor(node, dismissAfter) {
  clearTimeout(dismissTimers.get(node));
  dismissTimers.set(node, setTimeout(() => node.remove(), dismissAfter));
}

/** What went wrong, said without blocking the page, in the reader's language. */
export function toastError(error) {
  toast(errorText(error), { tone: "error" });
}

