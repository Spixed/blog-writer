/**
 * Notion-style slash command panel: type `/` on an empty line to open it,
 * filter with the query, move with ↑/↓ and insert with Enter (or click).
 *
 * It positions itself from the live selection (no TipTap floating-menu
 * quirks), and keyboard handling rides on an extension in the editor that
 * calls into this component through `apiRef`.
 */

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import type { LucideIcon } from 'lucide-react';
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image,
  Languages,
  List,
  ListOrdered,
  Minus,
  MoreHorizontal,
  Pilcrow,
  Quote,
  Sigma,
  Smile,
  SquareCode,
  Table2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n.js';

export interface SlashApi {
  move: (delta: number) => boolean;
  enter: () => boolean;
  escape: () => boolean;
}

interface SlashItem {
  id: string;
  label: string;
  icon: LucideIcon;
  group: 'basic' | 'insert' | 'shortcode';
  qmoji?: boolean;
  run: (editor: Editor) => void;
}

export interface SlashMenuProps {
  editor: Editor;
  apiRef: React.MutableRefObject<SlashApi>;
  onOpenQmoji: (pos: { top: number; left: number }) => void;
  onOpenImage?: () => void;
  onOpenInlineMath?: () => void;
}

/** The `/`-query in the current empty paragraph, or null when the menu is closed. */
function useSlashQuery(editor: Editor): string | null {
  return useEditorState({
    editor,
    selector: (snap) => {
      if (!snap.editor) return null;
      const { selection } = snap.editor.state;
      if (!selection.empty) return null;
      const $from = selection.$from;
      const node = $from.parent;
      if (node.type.name !== 'paragraph') return null;
      // Treat the last slash on the current line as the command trigger. This
      // also makes the visible toolbar `/` button useful when the caret is in
      // an existing paragraph (Notion opens the palette at the caret).
      const text = node.textBetween(0, $from.parentOffset, '\n', '\ufffc');
      const line = text.slice(text.lastIndexOf('\n') + 1);
      const slash = line.lastIndexOf('/');
      if (slash < 0 || (slash > 0 && !/\s/.test(line[slash - 1]!))) return null;
      return line.slice(slash + 1);
    },
  });
}

export function SlashMenu({
  editor,
  apiRef,
  onOpenQmoji,
  onOpenImage,
  onOpenInlineMath,
}: SlashMenuProps) {
  const { t } = useI18n();
  const query = useSlashQuery(editor);
  const hasQuery = query !== null;
  // Escape dismisses the menu without eating the typed text; it re-arms as
  // soon as the query changes again.
  const [dismissed, setDismissed] = useState(false);
  const open = hasQuery && !dismissed;
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<SlashItem[]>(() => {
    return [
      {
        id: 'text',
        label: t('slashText'),
        icon: Pilcrow,
        group: 'basic',
        run: (e) => e.chain().focus().setParagraph().run(),
      },
      ...([1, 2, 3] as const).map((level) => ({
        id: `h${level}`,
        label: t('slashHeading', { n: level }),
        icon: ({ 1: Heading1, 2: Heading2, 3: Heading3 } as const)[level],
        group: 'basic' as const,
        run: (e: Editor) => e.chain().focus().toggleHeading({ level }).run(),
      })),
      {
        id: 'ul',
        label: t('slashBullet'),
        icon: List,
        group: 'basic',
        run: (e) => e.chain().focus().toggleBulletList().run(),
      },
      {
        id: 'ol',
        label: t('slashOrdered'),
        icon: ListOrdered,
        group: 'basic',
        run: (e) => e.chain().focus().toggleOrderedList().run(),
      },
      {
        id: 'quote',
        label: t('slashQuote'),
        icon: Quote,
        group: 'basic',
        run: (e) => e.chain().focus().toggleBlockquote().run(),
      },
      {
        id: 'code',
        label: t('slashCode'),
        icon: SquareCode,
        group: 'basic',
        run: (e) => e.chain().focus().toggleCodeBlock().run(),
      },
      {
        id: 'hr',
        label: t('slashRule'),
        icon: Minus,
        group: 'basic',
        run: (e) => e.chain().focus().setHorizontalRule().run(),
      },
      {
        id: 'inlineCode',
        label: t('inlineCode'),
        icon: Code2,
        group: 'shortcode',
        run: (e) => e.chain().focus().toggleCode().run(),
      },
      {
        id: 'hl',
        label: t('slashHl'),
        icon: Highlighter,
        group: 'shortcode',
        run: (e) =>
          e
            .chain()
            .focus()
            .insertContent({
              type: 'text',
              text: t('shortcodeHlBody'),
              marks: [{ type: 'hl', attrs: { color: 'orange' } }],
            })
            .run(),
      },
      {
        id: 'ruby',
        label: t('slashRuby'),
        icon: Languages,
        group: 'shortcode',
        run: (e) =>
          e
            .chain()
            .focus()
            .insertRuby({ text: t('shortcodeRubyText'), rt: t('shortcodeRubyRt') })
            .run(),
      },
      {
        id: 'inlineMath',
        label: t('slashInlineMath'),
        icon: Sigma,
        group: 'shortcode',
        run: () => onOpenInlineMath?.(),
      },
      {
        id: 'qmoji',
        label: t('slashQmoji'),
        icon: Smile,
        group: 'shortcode',
        qmoji: true,
        run: () => undefined,
      },
      {
        id: 'table',
        label: t('slashTable'),
        icon: Table2,
        group: 'insert',
        run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        id: 'image',
        label: t('slashImage'),
        icon: Image,
        group: 'insert',
        run: () => onOpenImage?.(),
      },
      {
        id: 'math',
        label: t('slashMath'),
        icon: Sigma,
        group: 'insert',
        run: (e) => insertRaw(e, `$$\n${t('shortcodeMathBody')}\n$$`),
      },
      {
        id: 'more',
        label: 'More 分隔线',
        icon: MoreHorizontal,
        group: 'insert',
        run: (e) => insertRaw(e, '<!--more-->'),
      },
    ];
  }, [t, onOpenImage, onOpenInlineMath]);

  const filtered = useMemo(() => {
    if (!hasQuery) return [];
    const q = (query ?? '').toLowerCase();
    return items.filter((it) => it.label.toLowerCase().includes(q) || it.id.includes(q));
  }, [items, hasQuery, query]);

  // Reset selection and re-position whenever the query (or openness) changes.
  useEffect(() => {
    setIndex(0);
    setDismissed(false);
    if (!hasQuery) {
      setPos(null);
      return;
    }
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    setPos({ top: coords.bottom + 6, left: coords.left });
  }, [hasQuery, editor]);

  // Keep the highlighted row visible while arrowing through.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const runItem = (item: SlashItem | undefined): boolean => {
    if (!item) return false;
    if (item.qmoji) {
      const coords = editor.view.coordsAtPos(editor.state.selection.from);
      deleteSlash(editor, query);
      onOpenQmoji({ top: coords.bottom + 6, left: coords.left });
      return true;
    }
    deleteSlash(editor, query);
    item.run(editor);
    return true;
  };

  // Wire the keyboard shortcuts in the editor to this menu (after commit, so
  // a discarded render never arms stale handlers).
  useEffect(() => {
    apiRef.current = {
      move: (delta) => {
        if (!open || filtered.length === 0) return false;
        setIndex((i) => (i + delta + filtered.length) % filtered.length);
        return true;
      },
      enter: () => open && !editor.view.composing && runItem(filtered[index]),
      escape: () => {
        if (!open) return false;
        // Notion closes the menu and keeps what was typed.
        setDismissed(true);
        return true;
      },
    };
    return () => {
      apiRef.current = { move: () => false, enter: () => false, escape: () => false };
    };
  });

  if (!open || !pos) return null;

  const groups: { key: SlashItem['group']; label: string }[] = [
    { key: 'basic', label: t('slashGroupBasic') },
    { key: 'shortcode', label: t('slashGroupShortcode') },
    { key: 'insert', label: t('slashGroupInsert') },
  ];
  let flat = 0;

  return (
    <div
      ref={listRef}
      className="slash-menu"
      style={{
        top: Math.max(8, Math.min(pos.top, window.innerHeight - 320)),
        left: Math.max(8, Math.min(pos.left, window.innerWidth - 260)),
      }}
      role="listbox"
    >
      {filtered.length === 0 && <div className="slash-empty">{t('slashEmpty')}</div>}
      {groups.map((g) => {
        const groupItems = filtered.filter((it) => it.group === g.key);
        if (groupItems.length === 0) return null;
        return (
          <div key={g.key} className="slash-group">
            <div className="slash-group-title">{g.label}</div>
            {groupItems.map((it) => {
              const idx = flat++;
              return (
                <button
                  key={it.id}
                  type="button"
                  data-idx={idx}
                  className={idx === index ? 'active' : ''}
                  role="option"
                  aria-selected={idx === index}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setIndex(idx)}
                  onClick={() => runItem(it)}
                >
                  <span className="slash-icon" aria-hidden="true">
                    <it.icon size={16} strokeWidth={1.8} />
                  </span>
                  {it.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Remove the `/query` the menu is consuming. */
function deleteSlash(editor: Editor, query: string | null): void {
  const { from } = editor.state.selection;
  const parent = editor.state.selection.$from.parent;
  const before = parent.textBetween(0, editor.state.selection.$from.parentOffset, '\n', '\ufffc');
  const lineStart = before.lastIndexOf('\n') + 1;
  const slash = before.lastIndexOf('/');
  const start =
    slash >= lineStart ? from - (before.length - slash) : from - (query?.length ?? 0) - 1;
  if (start < from) editor.chain().focus().deleteRange({ from: start, to: from }).run();
}

/** Replace the slash line with a raw block carrying `source`. */
function insertRaw(editor: Editor, source: string): void {
  editor.chain().focus().insertContent({ type: 'rawBlock', attrs: { source } }).run();
}
