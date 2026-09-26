import { useCallback, useEffect, useRef } from 'react';

interface Anchor {
  top: number;
}
/** Interpolate between corresponding headings, including the deepest level. */
export function mapScroll(
  top: number,
  from: Anchor[],
  to: Anchor[],
  fromMax: number,
  toMax: number,
): number {
  const count = Math.min(from.length, to.length);
  const points = [{ from: 0, to: 0 }];
  for (let i = 0; i < count; i++) {
    const a = from[i]!.top;
    const b = to[i]!.top;
    if (a > points.at(-1)!.from && a < fromMax && b < toMax) points.push({ from: a, to: b });
  }
  points.push({ from: fromMax, to: toMax });
  for (let i = 1; i < points.length; i++) {
    const next = points[i]!;
    const prev = points[i - 1]!;
    if (top <= next.from || i === points.length - 1) {
      const ratio = Math.max(
        0,
        Math.min(1, (top - prev.from) / Math.max(1, next.from - prev.from)),
      );
      return prev.to + ratio * (next.to - prev.to);
    }
  }
  return 0;
}

function readAnchors(el: HTMLElement): Anchor[] {
  // The syntax layer shares the textarea's font, wrapping and padding; unlike
  // newline counts, these positions account for wrapped CJK prose and lists.
  const source =
    el.classList.contains('markdown-source-input') || el instanceof HTMLTextAreaElement;
  const root = el.classList.contains('cm-scroller')
    ? el
    : source && el.previousElementSibling instanceof HTMLElement
      ? el.previousElementSibling
      : el;
  if (!root) return [];
  const rect = root.getBoundingClientRect();
  const all = [
    ...root.querySelectorAll<HTMLElement>(
      source ? '[data-source-heading],.cm-line' : 'h1,h2,h3,h4,h5,h6',
    ),
  ].filter((node) =>
    !source || node.classList.contains('cm-line')
      ? /^\s*#{1,6}\s/.test(node.textContent ?? '') || node.hasAttribute('data-source-heading')
      : true,
  );
  const levelOf = (node: HTMLElement) =>
    Number(
      node.dataset.level ??
        /^\s*(#{1,6})\s/.exec(node.textContent ?? '')?.[1].length ??
        node.tagName.slice(1),
    );
  const levels = all.map(levelOf).filter(Number.isFinite);
  const deepest = levels.length ? Math.max(...levels) : 0;
  return all
    .filter((node) => levelOf(node) === deepest)
    .map((node) => ({ top: node.getBoundingClientRect().top - rect.top + root.scrollTop }));
}

export function useSyncScroll(
  enabled: boolean,
  _signal: unknown,
): {
  register: (id: string) => (el: HTMLElement | null) => void;
} {
  const elements = useRef(new Map<string, HTMLElement>());
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const cleanups = useRef(new Map<string, () => void>());
  const expected = useRef(new WeakMap<HTMLElement, number>());
  const cache = useRef(new WeakMap<HTMLElement, { stamp: string; anchors: Anchor[] }>());
  const leader = useRef<HTMLElement | null>(null);
  const active = useRef(enabled);
  active.current = enabled;
  const frame = useRef(0);

  const anchors = (el: HTMLElement) => {
    const stamp = `${el.clientWidth}:${el.scrollHeight}:${el instanceof HTMLTextAreaElement ? el.value : ''}`;
    let entry = cache.current.get(el);
    if (!entry || entry.stamp !== stamp) {
      entry = { stamp, anchors: readAnchors(el) };
      cache.current.set(el, entry);
    }
    return entry.anchors;
  };
  const align = useCallback(
    (from: HTMLElement) => {
      if (!active.current) return;
      const fromMax = Math.max(0, from.scrollHeight - from.clientHeight);
      const sourceAnchors = anchors(from);
      for (const other of elements.current.values()) {
        if (other === from) continue;
        const toMax = Math.max(0, other.scrollHeight - other.clientHeight);
        const target = Math.max(
          0,
          Math.min(toMax, mapScroll(from.scrollTop, sourceAnchors, anchors(other), fromMax, toMax)),
        );
        if (Math.abs(other.scrollTop - target) < 1) continue;
        // A target-specific acknowledgment survives delayed browser scroll events.
        // A one-frame global lock cannot distinguish those from real input.
        other.scrollTop = target;
        expected.current.set(other, other.scrollTop);
      }
    },
    [anchors],
  );
  const schedule = useCallback(
    (el: HTMLElement) => {
      leader.current = el;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => align(el));
    },
    [align],
  );

  const register = useCallback(
    (id: string) => {
      if (!refs.current.has(id))
        refs.current.set(id, (el) => {
          if (elements.current.get(id) === el) return;
          cleanups.current.get(id)?.();
          cleanups.current.delete(id);
          const old = elements.current.get(id);
          elements.current.delete(id);
          if (leader.current === old) leader.current = null;
          if (!el) return;
          elements.current.set(id, el);
          el.dataset.synced = id;
          const scroll = () => {
            if (!active.current) return;
            const target = expected.current.get(el);
            expected.current.delete(el);
            if (target !== undefined && Math.abs(target - el.scrollTop) < 1) return;
            schedule(el);
          };
          const intent = () => {
            expected.current.delete(el);
            leader.current = el;
          };
          el.addEventListener('scroll', scroll, { passive: true });
          el.addEventListener('wheel', intent, { passive: true });
          el.addEventListener('touchstart', intent, { passive: true });
          el.addEventListener('pointerdown', intent);
          cleanups.current.set(id, () => {
            el.removeEventListener('scroll', scroll);
            el.removeEventListener('wheel', intent);
            el.removeEventListener('touchstart', intent);
            el.removeEventListener('pointerdown', intent);
          });
        });
      return refs.current.get(id)!;
    },
    [schedule],
  );

  useEffect(() => {
    cache.current = new WeakMap();
    const from = leader.current ?? elements.current.values().next().value;
    if (enabled && from) schedule(from);
  }, [enabled, schedule]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return { register };
}
