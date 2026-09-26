/**
 * Right-click management for posts (rename / delete), plus the dialogs those
 * actions open. Deleting is undoable: the file's exact bytes are kept and
 * restored verbatim, so an undo never drifts the file.
 */
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@blog-writer/shared';
import { useDeletePost, usePost, useRenamePost, useRestorePost } from '../../hooks/queries.js';
import { useI18n } from '../../i18n/useI18n.js';
import { useUndo } from '../../store/undo.js';
import { Dialog, DialogActions, useToasts } from '../../components/ui.js';

const OTHER_LANG: Record<Lang, Lang> = { zh: 'en', en: 'zh' };

export interface MenuState {
  x: number;
  y: number;
  lang: Lang;
  slug: string;
}

export function PostContextMenu({
  menu,
  onClose,
  onRename,
  onDelete,
}: {
  menu: MenuState;
  onClose: () => void;
  onRename: (m: MenuState) => void;
  onDelete: (m: MenuState) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const item = (label: string, action: () => void) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        action();
      }}
    >
      {label}
    </button>
  );

  // Keep the menu inside the viewport.
  const x = Math.min(menu.x, window.innerWidth - 170);
  const y = Math.min(menu.y, window.innerHeight - 110);

  return (
    <div className="ctx-menu" style={{ left: x, top: y }} ref={ref}>
      {item(t('rename'), () => onRename(menu))}
      {item(t('delete'), () => onDelete(menu))}
    </div>
  );
}

export function RenameDialog({
  lang,
  slug,
  onClose,
  onRenamed,
}: {
  lang: Lang;
  slug: string;
  onClose: () => void;
  onRenamed: (newSlug: string) => void;
}) {
  const { t } = useI18n();
  const rename = useRenamePost();
  const pushUndo = useUndo((s) => s.push);
  const toast = useToasts((s) => s.push);
  const [value, setValue] = useState(slug);
  const [pair, setPair] = useState(false);

  return (
    <Dialog title={t('renameTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          <span>{t('slug')}</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={pair} onChange={(e) => setPair(e.target.checked)} />
          {t('renamePair')}
        </label>
      </div>
      <DialogActions>
        <button className="icon-btn" onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          className="icon-btn primary"
          disabled={value === slug || rename.isPending}
          onClick={() =>
            rename.mutate(
              { lang, slug, newSlug: value, pair },
              {
                onSuccess: () => {
                  pushUndo({
                    label: t('renamed'),
                    undo: () => rename.mutateAsync({ lang, slug: value, newSlug: slug, pair }),
                    redo: () => rename.mutateAsync({ lang, slug, newSlug: value, pair }),
                  });
                  onClose();
                  toast(t('renamed'));
                  onRenamed(value);
                },
                onError: (e) =>
                  toast(`${t('renameFailed')}: ${e instanceof Error ? e.message : e}`),
              },
            )
          }
        >
          {t('rename')}
        </button>
      </DialogActions>
    </Dialog>
  );
}

export function DeleteDialog({
  lang,
  slug,
  onClose,
  onDeleted,
}: {
  lang: Lang;
  slug: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const del = useDeletePost();
  const restore = useRestorePost();
  const pushUndo = useUndo((s) => s.push);
  const toast = useToasts((s) => s.push);
  const zh = usePost('zh', slug);
  const en = usePost('en', slug);
  const [pair, setPair] = useState(false);

  return (
    <Dialog title={t('deleteTitle')} onClose={onClose}>
      <p style={{ margin: 0 }}>
        {t('willDelete')}{' '}
        <code style={{ fontFamily: 'var(--app-mono)' }}>
          {lang}/post/{slug}.md
        </code>
      </p>
      <label className="toggle" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={pair} onChange={(e) => setPair(e.target.checked)} />
        {t('deletePair')}
      </label>
      <DialogActions>
        <button className="icon-btn" onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          className="icon-btn danger"
          disabled={del.isPending}
          onClick={() => {
            // Capture the exact bytes first: undo must restore them verbatim.
            const raws: { lang: Lang; slug: string; raw: string }[] = [];
            for (const l of pair ? ['zh', 'en'] : [lang]) {
              const data = l === 'zh' ? zh.data : en.data;
              if (data?.raw) raws.push({ lang: l as Lang, slug, raw: data.raw });
            }
            del.mutate(
              { lang, slug, pair },
              {
                onSuccess: () => {
                  pushUndo({
                    label: t('deleted'),
                    undo: async () => {
                      for (const r of raws) await restore.mutateAsync(r);
                    },
                    redo: async () => {
                      await del.mutateAsync({ lang, slug, pair });
                    },
                  });
                  onClose();
                  toast(t('deleted'));
                  toast(t('undoHint'));
                  onDeleted();
                },
                onError: (e) =>
                  toast(`${t('deleteFailed')}: ${e instanceof Error ? e.message : e}`),
              },
            );
          }}
        >
          {t('delete')}
        </button>
      </DialogActions>
    </Dialog>
  );
}
