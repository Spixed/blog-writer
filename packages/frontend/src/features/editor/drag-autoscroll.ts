/**
 * Auto-scroll a container while an HTML5 drag hovers near its top/bottom
 * edges. Browsers only auto-scroll their own scrollable roots, so dragging a
 * block towards the viewport edge inside a custom scroller went nowhere and
 * far-away drop targets were unreachable.
 *
 * The rAF loop keeps running until `stop()`: scroll events fire without
 * pointer movement, so `onScroll` re-derives the drop indicator from the last
 * known pointer position each frame the scroller actually moves.
 */
export function createDragScroller(getScroller: () => HTMLElement | null, onScroll: () => void) {
  const EDGE = 56; // px band inside each edge where scrolling kicks in
  let raf = 0;
  let lastX = 0;
  let lastY = 0;
  let active = false;

  const step = () => {
    if (!active) return;
    const el = getScroller();
    if (el) {
      const r = el.getBoundingClientRect();
      // pointer in the top band -> scroll up (negative), bottom band -> down
      const speed = lastY < r.top + EDGE ? -Math.ceil((r.top + EDGE - lastY) / 4)
        : lastY > r.bottom - EDGE ? Math.ceil((lastY - (r.bottom - EDGE)) / 4)
          : 0;
      if (speed) { el.scrollTop += speed; onScroll(); }
    }
    raf = requestAnimationFrame(step);
  };

  return {
    /** Feed every dragover event; starts the loop on the first one. */
    dragover(e: DragEvent) {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!active) { active = true; step(); }
    },
    get x() { return lastX; },
    get y() { return lastY; },
    stop() {
      active = false;
      cancelAnimationFrame(raf);
    },
  };
}
