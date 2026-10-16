/**
 * Dots for counted progress: the advancements a player has used out of all
 * the player may have, and the step a sheet flow is on.
 *
 * Both are only drawn here. What the total is, and what counts as done, is
 * the caller's, taken from src/domain.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { classNames } from "./markup.mjs";

/** `count` spans, each classed by `className(n)` with n counting from 1. */
const dots = (count, className) => Array.from({ length: count }, (unused, index) => `<span class="${className(index + 1)}"></span>`).join("");

/**
 * A row of bars, the first `done` filled, and the numbers in words after it.
 *
 * The bars say nothing to a screen reader, so the caption does: it is always
 * drawn, and it is the only part read aloud. `done` past either end is
 * clamped, and the caption shows the clamped number the bars show.
 */
export function renderProgressDots({ total, done, label }) {
  if (!Number.isFinite(done) || !Number.isFinite(total)) {
    throw new TypeError(`progress dots count numbers: done and total, not ${String(done)} (${typeof done}) and ${String(total)} (${typeof total})`);
  }
  const shown = Math.min(Math.max(done, 0), total);
  const bars = dots(total, (n) => classNames("g-progress__dot", shown >= n && "g-progress__dot--on"));
  const caption = escapeHtml(t("ui.progress.caption", { label, done: shown, total }));
  return `<div class="g-progress"><div class="g-progress__dots" aria-hidden="true">${bars}</div><span class="g-progress__caption">${caption}</span></div>`;
}

/**
 * The step dots of a sheet: the steps before the current one done, the
 * current one long, the rest ahead. `current` counts from 1.
 */
export function renderStepDots({ current, total }) {
  const marks = dots(total, (n) => classNames("g-steps__dot", current > n && "g-steps__dot--done", current === n && "g-steps__dot--now"));
  return `<div class="g-steps" role="img" aria-label="${escapeHtml(t("ui.sheet.step", { current, total }))}">${marks}</div>`;
}
