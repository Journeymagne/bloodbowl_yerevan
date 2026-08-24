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

const AUTO_DISMISS_MS = 6000;

let region = null;

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

  const node = document.createElement("output");
  node.className = `toast toast-${tone}`;
  node.textContent = text;
  toastRegion().append(node);

  const dismissAfter = timeout ?? (tone === "error" ? AUTO_DISMISS_MS * 2 : AUTO_DISMISS_MS);
  const timer = setTimeout(() => node.remove(), dismissAfter);
  node.addEventListener("click", () => {
    clearTimeout(timer);
    node.remove();
  });
}

/** What went wrong, said without blocking the page. */
export function toastError(error) {
  toast(error?.message ?? String(error), { tone: "error" });
}
