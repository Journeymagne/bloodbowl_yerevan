/** Hold a player row to reorder it within its table. Scroll gestures and ordinary clicks keep their meaning. */
const ROW = "tbody[data-reorder-index]";
const GRIP = ".g-rtable__row, .g-rtable__skillrow";
const CONTROL = "a, button, input, select, textarea, label";
const identity = (row) => ({ key: row.getAttribute("data-key"), index: Number(row.getAttribute("data-reorder-index")) });
const rowsOf = (table) => [...table.querySelectorAll(ROW)];

function gripOf(root, target) {
  const row = target.closest?.(GRIP)?.closest(ROW);
  const control = target.closest?.(CONTROL);
  return row && root.contains(row) && (!control || control.matches(".g-rtable__toggle")) ? row : null;
}

function previewOf(row) {
  const table = row.closest("table"), rect = row.getBoundingClientRect();
  const preview = table.cloneNode(false);
  preview.classList.add("g-rtable-drag");
  preview.setAttribute("aria-hidden", "true");
  preview.setAttribute("inert", "");
  preview.removeAttribute("aria-label");
  const columns = table.querySelector("colgroup")?.cloneNode(true);
  if (columns) {
    const cells = row.querySelector("tr").children;
    [...columns.children].forEach((col, at) => { col.style.width = `${cells[at].getBoundingClientRect().width}px`; });
    preview.appendChild(columns);
  }
  const copy = row.cloneNode(true);
  copy.querySelector(".g-rtable__panelrow")?.remove();
  copy.removeAttribute("data-reorder-index");
  for (const node of [copy, ...copy.querySelectorAll("[id]")]) node.removeAttribute("id");
  preview.appendChild(copy);
  Object.assign(preview.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
  row.ownerDocument.body.appendChild(preview);
  return preview;
}

/** Keep the destination in the source section; moving over another section never changes player availability. */
function destination(drag, x, y) {
  const rect = drag.table.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top - 24 || y > rect.bottom + 24) return null;
  const others = drag.rows.filter((row) => row !== drag.row);
  const at = others.findIndex((row) => {
    const box = row.querySelector(".g-rtable__row").getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
  const index = at < 0 ? others.length : at;
  const ordered = [...others];
  ordered.splice(index, 0, drag.row);
  return { ordered, marker: others[index] ?? others.at(-1), edge: index < others.length ? "before" : "after" };
}

function unchanged(drag) {
  const now = rowsOf(drag.table);
  return drag.row.isConnected && now.length === drag.rows.length && now.every((row, at) =>
    row === drag.rows[at] && identity(row).key === drag.original[at].key && identity(row).index === drag.original[at].index);
}

/** @returns {() => void} cancel the gesture and remove every listener on screen leave */
export function wireRosterReorder(root, { onReorder, canStart = () => true, holdMs = 350 }) {
  const doc = root.ownerDocument, win = doc.defaultView ?? globalThis;
  const state = { drag: null, timer: null, frame: null, suppressUntil: 0 };
  const stop = (save = false) => finish(state, { win, onReorder, canStart }, save);
  const move = (point, event) => moveDrag(state, { win, canStart, stop }, point, event);
  const start = (row, point, kind, id) => {
    if (state.drag || !row || !canStart()) return;
    const table = row.closest("table"), rows = rowsOf(table);
    if (rows.length < 2) return;
    state.drag = { row, table, rows, original: rows.map(identity), kind, id, startX: point.clientX, startY: point.clientY,
      x: point.clientX, y: point.clientY, active: false, preview: null, target: null };
    state.timer = win.setTimeout(() => {
      const drag = state.drag;
      if (!drag || !canStart() || !unchanged(drag)) return stop();
      drag.active = true;
      drag.preview = previewOf(row);
      row.setAttribute("data-roster-dragging", "true");
      doc.getSelection?.()?.removeAllRanges();
      move({ clientX: drag.x, clientY: drag.y });
      autoScroll(state, { win, move });
    }, holdMs);
  };
  const handlers = eventHandlers(root, state, { start, move, stop, onReorder, canStart });
  const offs = handlers.map(([target, type, listener, options]) => {
    target.addEventListener?.(type, listener, options);
    return () => target.removeEventListener?.(type, listener, options);
  });
  return () => { stop(); offs.forEach((off) => off()); };
}

function finish(state, { win, onReorder, canStart }, save) {
  win.clearTimeout(state.timer);
  if (state.frame !== null) win.cancelAnimationFrame(state.frame);
  const drag = state.drag;
  state.drag = null;
  state.frame = null;
  if (!drag) return;
  const target = save && drag.active && canStart() && unchanged(drag) ? drag.target : null;
  drag.preview?.remove();
  drag.row.removeAttribute("data-roster-dragging");
  drag.target?.marker?.removeAttribute("data-roster-drop");
  if (drag.active) state.suppressUntil = Date.now() + 700;
  if (target && target.ordered.some((row, at) => row !== drag.rows[at])) onReorder(target.ordered.map(identity));
}

function moveDrag(state, { canStart, stop }, point, event) {
  const drag = state.drag;
  if (!drag) return;
  drag.x = point.clientX;
  drag.y = point.clientY;
  if (!drag.active) {
    if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 8) stop();
    return;
  }
  event?.preventDefault();
  if (!canStart() || !unchanged(drag)) return stop();
  drag.preview.style.transform = `translateY(${drag.y - drag.startY}px)`;
  drag.target?.marker?.removeAttribute("data-roster-drop");
  drag.target = destination(drag, drag.x, drag.y);
  if (drag.target && drag.target.ordered.some((row, at) => row !== drag.rows[at])) {
    drag.target.marker.setAttribute("data-roster-drop", drag.target.edge);
  }
}

function autoScroll(state, { win, move }) {
  if (!state.drag?.active || !win.requestAnimationFrame) return;
  state.frame = win.requestAnimationFrame(() => {
    const drag = state.drag;
    if (!drag) return;
    const edge = 64, height = win.innerHeight;
    const dy = drag.y < edge ? -10 : drag.y > height - edge ? 10 : 0;
    if (dy) win.scrollBy(0, dy);
    move({ clientX: drag.x, clientY: drag.y });
    autoScroll(state, { win, move });
  });
}

function keyboardOrder(root, event, { onReorder, canStart }) {
  if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key) || !canStart()) return;
  const row = gripOf(root, event.target);
  if (!row) return;
  event.preventDefault();
  const rows = rowsOf(row.closest("table")), at = rows.indexOf(row);
  const next = at + (event.key === "ArrowUp" ? -1 : 1);
  if (next < 0 || next >= rows.length) return;
  [rows[at], rows[next]] = [rows[next], rows[at]];
  onReorder(rows.map(identity));
  row.querySelector(".g-rtable__toggle")?.focus({ preventScroll: true });
}

function eventHandlers(root, state, actions) {
  const { start, move, stop } = actions, doc = root.ownerDocument;
  const pointer = (event) => state.drag?.kind === "pointer" && state.drag.id === event.pointerId;
  const touch = (event) => [...event.changedTouches].find((point) => state.drag?.kind === "touch" && point.identifier === state.drag.id);
  return [
    [root, "pointerdown", (event) => {
      if (event.pointerType !== "touch" && event.button === 0 && event.isPrimary !== false) start(gripOf(root, event.target), event, "pointer", event.pointerId);
    }],
    [doc, "pointermove", (event) => { if (pointer(event)) move(event, event); }],
    [doc, "pointerup", (event) => { if (pointer(event)) { move(event, event); stop(true); } }],
    [doc, "pointercancel", (event) => { if (pointer(event)) stop(); }],
    [root, "touchstart", (event) => {
      if (event.touches.length !== 1) return stop();
      const point = event.changedTouches[0];
      start(gripOf(root, event.target), point, "touch", point.identifier);
    }],
    // A touch keeps its original target. Listen on the view, where touchmove is non-passive by default,
    // so scrolling can be prevented only after the hold, without disabling normal touch scrolling.
    [root, "touchmove", (event) => { const point = touch(event); if (point) move(point, event); }],
    [root, "touchend", (event) => { const point = touch(event); if (point) { move(point, event); stop(true); } }],
    [root, "touchcancel", (event) => { if (touch(event)) stop(); }],
    [root, "click", (event) => {
      if (Date.now() < state.suppressUntil && event.target.closest?.(GRIP)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true],
    [root, "contextmenu", (event) => { if (state.drag) event.preventDefault(); }],
    [root, "dragstart", (event) => { if (state.drag) event.preventDefault(); }],
    [root, "keydown", (event) => { if (event.key === "Escape" && state.drag) { event.preventDefault(); stop(); } else keyboardOrder(root, event, actions); }],
    [doc, "keydown", (event) => { if (event.key === "Escape" && state.drag) { event.preventDefault(); stop(); } }],
    [doc, "visibilitychange", () => { if (doc.hidden) stop(); }],
    [doc.defaultView ?? globalThis, "blur", () => stop()],
  ];
}
