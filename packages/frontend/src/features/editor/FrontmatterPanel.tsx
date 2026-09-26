/**
 * Floating front-matter panel. Available in every editor mode; each language
 * pane owns one so bilingual editing can show both. Draggable by its header,
 * clamped to the viewport, with the language badge and the validation count in
 * the title bar.
 *
 * The panel keeps its position for the whole session (stored per language in
 * the UI store), so switching modes never shoves it back to the default spot.
 * The default is the bottom-right corner, clear of the toolbar; in bilingual
 * mode the two panels default to side-by-side rather than stacked.
 *
 * Positions are stored as anchors, not absolute points: which viewport edge
 * the panel sits near plus the offset from that edge. Resizing the window
 * then slides the panel along with the anchored edge (a panel parked at the
 * bottom-right stays at the bottom-right of a smaller window instead of
 * falling off-screen), and a render-time clamp keeps it inside the viewport
 * even when the window shrinks past the stored offset.
 */

import type { Lang } from '@blog-writer/shared';
import { validateFrontmatter } from '@blog-writer/shared';
import { X } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n.js';
import type { FmPos } from '../../store/ui.js';
import { useUI } from '../../store/ui.js';
import { FrontmatterForm } from './FrontmatterForm.js';

const LANG_LABEL: Record<Lang, string> = { zh: '中文', en: 'English' };
const PANEL_W = 372;
const PANEL_GAP = 12;
/** Smallest gap kept between the panel and any viewport edge. */
const EDGE = 8;

function defaultPos(lang: Lang, bilingual: boolean): FmPos {
  // Bottom-right, clear of the top bar; the English panel sits to the left of
  // the Chinese one in bilingual mode so the two never overlap.
  const slot = bilingual && lang === 'en' ? 2 : 1;
  return {
    ax: 'right',
    ay: 'bottom',
    dx: PANEL_GAP + (PANEL_W + PANEL_GAP) * (slot - 1),
    dy: PANEL_GAP,
  };
}

export interface FrontmatterPanelProps {
  lang: Lang;
  frontmatter: Parameters<typeof FrontmatterForm>[0]['frontmatter'];
  onChange: (next: FrontmatterPanelProps['frontmatter']) => void;
  onClose: () => void;
  /** Both panels are up at once; the defaults spread them sideways. */
  bilingual?: boolean;
}

export function FrontmatterPanel({
  lang,
  frontmatter,
  onChange,
  onClose,
  bilingual = false,
}: FrontmatterPanelProps) {
  const { t } = useI18n();
  const fmPos = useUI((s) => s.fmPos[lang]);
  const setFmPos = useUI((s) => s.setFmPos);
  const [pos, setPos] = useState<FmPos>(() => fmPos ?? defaultPos(lang, bilingual));
  const posRef = useRef(pos);
  posRef.current = pos;
  const panelRef = useRef<HTMLDivElement>(null);
  // The anchored edges need the live panel size to clamp the offsets; the
  // observer keeps it fresh when the form grows (validation errors, etc.).
  const [size, setSize] = useState({ w: PANEL_W, h: 480 });
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const drag = useRef<{ offLeft: number; offTop: number; w: number; h: number } | null>(null);
  const errors = validateFrontmatter(frontmatter);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    // Anchor positions are relative to the viewport — re-render on resize.
    window.addEventListener('resize', bump);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', bump);
    };
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      // Desired top-left corner, then clamp so the panel stays fully inside
      // the viewport, then re-derive the anchor from that pixel position
      // (anchored edges later "follow" that edge on window resizes).
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.min(Math.max(e.clientX - d.offLeft, EDGE), Math.max(EDGE, vw - d.w - EDGE));
      const top = Math.min(Math.max(e.clientY - d.offTop, EDGE), Math.max(EDGE, vh - d.h - EDGE));
      const fromLeft = left;
      const fromRight = vw - left - d.w;
      const fromTop = top;
      const fromBottom = vh - top - d.h;
      setPos({
        ax: fromLeft <= fromRight ? 'left' : 'right',
        ay: fromTop <= fromBottom ? 'top' : 'bottom',
        dx: fromLeft <= fromRight ? fromLeft : fromRight,
        dy: fromTop <= fromBottom ? fromTop : fromBottom,
      });
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      // Keep the layout for the rest of the session.
      setFmPos(lang, posRef.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [lang, setFmPos]);

  // Anchor the panel by its near edges: an ax/ay panel gets CSS right/bottom
  // (or left/top) at the clamped offset. Growing content then extends toward
  // the viewport interior, and shrinking the window past the stored offset
  // pulls the panel back inside instead of off-screen.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxDx = Math.max(EDGE, vw - size.w - EDGE);
  const maxDy = Math.max(EDGE, vh - size.h - EDGE);
  const style: React.CSSProperties =
    pos.ax === 'left' ? { left: Math.min(pos.dx, maxDx) } : { right: Math.min(pos.dx, maxDx) };
  if (pos.ay === 'top') style.top = Math.min(pos.dy, maxDy);
  else style.bottom = Math.min(pos.dy, maxDy);

  return (
    <div
      className="fm-floater"
      style={style}
      role="dialog"
      aria-label={t('fmPanel')}
      ref={panelRef}
    >
      <div
        className="fm-floater-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const el = e.currentTarget.parentElement!.getBoundingClientRect();
          drag.current = {
            offLeft: e.clientX - el.left,
            offTop: e.clientY - el.top,
            w: el.width,
            h: el.height,
          };
        }}
      >
        <span className="badge">{LANG_LABEL[lang]}</span>
        <span className="fm-floater-title">{t('fmPanel')}</span>
        {errors.length > 0 && (
          <span className="badge draft">{t('fmValidation', { n: errors.length })}</span>
        )}
        <div style={{ flex: 1 }} />
        <button
          className="icon-btn"
          title={t('close')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="fm-floater-scroll">
        <FrontmatterForm frontmatter={frontmatter} onChange={onChange} />
      </div>
    </div>
  );
}
