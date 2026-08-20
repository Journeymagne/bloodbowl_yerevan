/**
 * The one DOM node every screen renders into.
 *
 * Screens write `view.innerHTML` directly (no patch/mount/destroy contract
 * yet — that's task 8). Exporting the node from its own module, instead of
 * each screen module reading `document.querySelector("#app-view")` again or
 * importing it from app.js, is what keeps app.js and the screen modules from
 * having to import each other.
 */
export const view = document.querySelector("#app-view");
