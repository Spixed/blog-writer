/**
 * Visual qmoji picker (opened from the slash menu): a searchable grid of the
 * site's emoji, shown exactly as the blog would show them. Picking one inserts
 * an inline `{{< qq-emoji "name" >}}` atom.
 */

import { qmojiUrl } from '@blog-writer/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConfig } from '../../hooks/queries.js';
import { useI18n } from '../../i18n/useI18n.js';
import { loadLottie } from '../../render/external-scripts.js';

export interface QmojiPickerProps {
  open: boolean;
  position: { top: number; left: number } | null;
  onClose: () => void;
  onPick: (name: string, mode?: 'inline' | 'block') => void;
}

export function QmojiPicker({ open, position, onClose, onPick }: QmojiPickerProps) {
  const { t } = useI18n();
  const config = useConfig();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'inline' | 'block'>('inline');
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = config.data?.qmojiMapping ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) => e.describe.toLowerCase().includes(needle));
  }, [entries, q]);

  useEffect(() => {
    if (open) {
      setQ('');
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = document.getElementById('qmoji-picker');
      if (el && !el.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open, onClose]);

  // Lottie emoji (emojiType 2) preview as real animations, lazily: the mapping
  // carries ~90 of them, so only slots scrolled into view fetch their
  // lottie.json and start playing — same loader the editor's atoms use.
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const grid = gridRef.current;
    if (!grid) return;
    let disposed = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const slot = entry.target as HTMLElement;
        observer.unobserve(slot);
        loadLottie().then((lottie) => {
          if (!lottie || disposed) return;
          if (slot.dataset.lottieInitialized === 'true' || !slot.isConnected) return;
          slot.dataset.lottieInitialized = 'true';
          lottie.loadAnimation({
            container: slot,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: slot.dataset.lottiePath ?? '',
          } as never);
        });
      }
    });
    grid
      .querySelectorAll<HTMLElement>('[data-lottie-path]')
      .forEach((slot) => observer.observe(slot));
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [open]);

  if (!open || !position) return null;

  return (
    <div
      id="qmoji-picker"
      className="qmoji-picker"
      style={{
        top: Math.max(8, Math.min(position.top, window.innerHeight - 360)),
        left: Math.max(8, Math.min(position.left, window.innerWidth - 340)),
      }}
      role="dialog"
      aria-label={t('slashQmoji')}
    >
      <input
        ref={inputRef}
        className="qmoji-search"
        placeholder={t('qmojiSearchPlaceholder')}
        value={q}
        spellCheck={false}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="qmoji-mode">
        <button
          type="button"
          className={mode === 'inline' ? 'active' : ''}
          onClick={() => setMode('inline')}
        >
          行内
        </button>
        <button
          type="button"
          className={mode === 'block' ? 'active' : ''}
          onClick={() => setMode('block')}
        >
          独立成行
        </button>
      </div>
      <div className="qmoji-grid" ref={gridRef}>
        {filtered.length === 0 && <div className="qmoji-empty">{t('slashEmpty')}</div>}
        {filtered.map((e) => (
          <button
            key={e.emojiId}
            type="button"
            className="qmoji-cell"
            title={e.describe}
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => {
              onPick(e.describe.replace(/^\//, ''), mode);
              onClose();
            }}
          >
            {e.emojiType === 2 ? (
              <span
                className="qmoji-lottie-slot"
                data-lottie-path={qmojiUrl(e)}
                aria-label={t('qmojiLottie')}
              />
            ) : (
              <img src={qmojiUrl(e)} alt={e.describe} loading="lazy" draggable={false} />
            )}
            <span className="qmoji-cell-name">{e.describe.replace(/^\//, '')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
