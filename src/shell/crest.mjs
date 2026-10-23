/**
 * The league's crest: a gold shield, the pitch inside it, a ball and its lace.
 *
 * Decoration only, so it is hidden from a screen reader and never focused; the
 * name beside it is the text. Its colours are the palette's (crest.css), not
 * the markup's: the field is the header's colour, so the crest follows a
 * change of palette with the strip it sits on.
 */

/** sm 24×27 (a header), md 44×50, lg 64×73 (the sign-in strip); the boxes are crest.css's. */
const CREST_SIZES = ["sm", "md", "lg"];

/** @param {{size?: "sm"|"md"|"lg"}} [props] */
export function renderCrest({ size = "md" } = {}) {
  if (!CREST_SIZES.includes(size)) throw new Error(`a crest size is one of ${CREST_SIZES.join(", ")}, not ${JSON.stringify(size)}`);
  return `<svg class="g-crest g-crest--${size}" viewBox="0 0 44 50" aria-hidden="true" focusable="false">`
    + '<path class="g-crest__shield" d="M22 2 L40 8 V24 C40 36 32 44 22 48 C12 44 4 36 4 24 V8 Z"></path>'
    + '<path class="g-crest__field" d="M22 9 L34 13 V24 C34 32 29 38 22 41 C15 38 10 32 10 24 V13 Z"></path>'
    + '<ellipse class="g-crest__ball" cx="22" cy="25" rx="8" ry="5.2" transform="rotate(-30 22 25)"></ellipse>'
    + '<path class="g-crest__lace" d="M18.5 25.5 L25.5 24.5 M19.5 23.5 L20.3 26.3 M22 23 L22.8 25.8 M24.3 22.6 L25.1 25.4" transform="rotate(-30 22 25)"></path>'
    + "</svg>";
}
