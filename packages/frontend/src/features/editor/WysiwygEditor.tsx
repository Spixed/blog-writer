/**
 * Notion-style WYSIWYG surface (TipTap v3).
 *
 * The editor element itself carries `.theme-root .content`, so every block it
 * renders is styled by the extracted theme CSS and looks exactly like the blog.
 * Complex blocks live in `rawBlock` atoms (see RawBlock.tsx), which are
 * rendered by the same worker pipeline.
 *
 * The document is the source of truth while the editor is mounted: typing
 * serialises the whole body back to Markdown (canonical for prose blocks,
 * verbatim for raw blocks). External `value` changes are only applied when the
 * editor is not focused, so typing never fights the prop.
 */

import { Extension } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { ChevronDown, Code2, Link2, List, Quote } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResolvedTheme } from '../../hooks/useResolvedTheme.js';
import { useI18n } from '../../i18n/useI18n.js';
import { formatCombo } from '../../platform.js';
import { markdownToProse, type ProseDoc, proseToMarkdown } from '../../render/prose.js';
import { useUI } from '../../store/ui.js';
import { BlockHandle } from './BlockHandle.js';
import { EditorCodeBlock } from './extensions/code-block.js';
import { DropCap } from './extensions/drop-cap.js';
import { HL_COLORS, Hl } from './extensions/hl.js';
import { Image } from './extensions/image.js';
import { LoneImage } from './extensions/lone-image.js';
import { MathInline } from './extensions/math-inline.js';
import { Qmoji } from './extensions/qmoji.js';
import { Ruby } from './extensions/ruby.js';
import { FormattingToolbar } from './FormattingToolbar.js';
import { ImageDialog } from './ImageDialog.js';
import { QmojiPicker } from './QmojiPicker.js';
import { RawBlock } from './RawBlock.js';
import { type SlashApi, SlashMenu } from './SlashMenu.js';
import { TableDrag } from './TableDrag.js';
import { TocPanel } from './TocPanel.js';

export interface WysiwygEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  /** Attach the scroll container (bilingual scroll sync). */
  scrollRef?: (el: HTMLDivElement | null) => void;
  scrollKey?: string;
}

const scrollCache = new Map<string, number>();
/** Last caret per post, so switching posts and back returns to the edit site. */
const selectionCache = new Map<string, { from: number; to: number }>();
export function WysiwygEditor({ value, onChange, scrollRef, scrollKey }: WysiwygEditorProps) {
  const { t } = useI18n();
  const theme = useResolvedTheme();
  const tocOpen = useUI((s) => s.tocOpen);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState('');
  const [rubyOpen, setRubyOpen] = useState(false);
  const [rubyText, setRubyText] = useState('');
  const [rubyRt, setRubyRt] = useState('');
  const rubyRange = useRef<{ from: number; to: number } | null>(null);
  const [qmojiPos, setQmojiPos] = useState<{ top: number; left: number } | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [mathOpen, setMathOpen] = useState<{ top: number; left: number } | null>(null);
  const [mathText, setMathText] = useState('');
  const mathRange = useRef<{ from: number; to: number } | null>(null);
  // Tiptap emits a transaction when external content is applied. Keep the
  // last serialised value so a parent echo of that transaction does not call
  // setContent again. Replacing the document repeatedly destroys async node
  // views (images/raw blocks), which is the source of the visible flicker and
  // scroll-height oscillation on media-heavy posts.
  const lastValueRef = useRef(value);
  const serialiseTimer = useRef<number | null>(null);
  const lastPropRef = useRef(value);
  /** Guards the selection cache while an external document replacement runs. */
  const applyingExternal = useRef(false);
  /** Post-switch restore; re-run after every external document replacement
   *  (idempotent — it always seeks to the position snapshot taken on mount). */
  const restoreRef = useRef<(() => void) | null>(null);
  const [initialContent] = useState(() => markdownToProse(value));
  // Keyboard shortcuts in the editor drive the slash menu through this ref.
  const slashApi = useRef<SlashApi>({ move: () => false, enter: () => false, escape: () => false });
  // Owns the scrolling surface so the block handle can be positioned inside it.
  const scrollEl = useRef<HTMLDivElement | null>(null);
  const restoringScroll = useRef(true);
  const setScroll = useCallback(
    (el: HTMLDivElement | null) => {
      const previous = scrollEl.current as (HTMLDivElement & { __saveScroll?: () => void }) | null;
      if (previous?.__saveScroll) previous.removeEventListener('scroll', previous.__saveScroll);
      scrollEl.current = el;
      if (el && scrollKey) {
        const saveScroll = () => {
          if (!restoringScroll.current) scrollCache.set(scrollKey, el.scrollTop);
        };
        el.addEventListener('scroll', saveScroll, { passive: true });
        (el as HTMLDivElement & { __saveScroll?: () => void }).__saveScroll = saveScroll;
      }
      scrollRef?.(el);
    },
    [scrollKey, scrollRef],
  );

  const extensions = useMemo(
    () => [
      // The blog's Goldmark renders tables but not strikethrough or underline,
      // so those marks stay out of the editor.
      StarterKit.configure({
        strike: {},
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer' },
        },
      }),
      EditorCodeBlock.configure({ lowlight: createLowlight(common), defaultLanguage: 'plaintext' }),
      Placeholder.configure({ placeholder: t('editorPlaceholder') }),
      // The theme's three shortcodes, editable natively.
      Hl,
      Ruby,
      MathInline,
      Qmoji,
      Image,
      // GFM tables (the schema rejects a table nested in a list, so those keep
      // their verbatim raw form — see render/prose.ts).
      Table.configure({ allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
      RawBlock,
      DropCap,
      LoneImage,
      // Route ↑/↓/Enter/Escape to the slash menu while it is open.
      Extension.create({
        name: 'slashNavigation',
        addKeyboardShortcuts() {
          return {
            ArrowDown: () => slashApi.current.move(1),
            ArrowUp: () => slashApi.current.move(-1),
            Enter: () => slashApi.current.enter(),
            Escape: () => slashApi.current.escape(),
          };
        },
      }),
      Extension.create({
        name: 'editorTabIndent',
        addKeyboardShortcuts() {
          return {
            Tab: () => {
              if (this.editor.isActive('table')) return false;
              return this.editor.commands.insertContent('  ');
            },
            'Shift-Tab': () => false,
          };
        },
      }),
    ],
    [t],
  );
  const editorProps = useMemo(
    () => ({
      attributes: { class: 'content wysiwyg-prose', spellcheck: 'false' },
      handleDOMEvents: {
        click: (_view: unknown, event: MouseEvent) => {
          if ((!event.ctrlKey && !event.metaKey) || event.button !== 0) return false;
          const target = event.target as Element | null;
          const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
          if (!anchor) return false;
          event.preventDefault();
          window.open(anchor.href, '_blank', 'noopener,noreferrer');
          return true;
        },
      },
    }),
    [],
  );
  const handleUpdate = useCallback(
    ({ editor }: { editor: Editor }) => {
      if (serialiseTimer.current !== null) cancelAnimationFrame(serialiseTimer.current);
      // Serialising a 40KB document is linear. Coalesce bursts from IME/paste
      // and let ProseMirror paint first so typing never blocks the main thread.
      serialiseTimer.current = requestAnimationFrame(() => {
        const next = proseToMarkdown(editor.getJSON() as ProseDoc);
        if (next !== lastValueRef.current) {
          lastValueRef.current = next;
          onChange(next);
        }
      });
    },
    [onChange],
  );

  const editor = useEditor(
    {
      extensions,
      content: initialContent,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps,
      onUpdate: handleUpdate,
    },
    [],
  );

  // Apply external changes only when the user is not mid-edit.
  useEffect(() => {
    if (!editor) return;
    // React parents re-render for worker/node-view updates. Only replace the
    // ProseMirror document when the prop itself changed; comparing a freshly
    // serialised document is insufficient because canonical Markdown can
    // differ from the source while still representing the same document.
    if (value === lastPropRef.current) return;
    lastPropRef.current = value;
    if (value === lastValueRef.current) return;
    if (editor.isFocused) return;
    if (value === proseToMarkdown(editor.getJSON() as ProseDoc)) return;
    lastValueRef.current = value;
    // React node views use flushSync; run document replacement outside the
    // React commit. The microtask re-checks the prop instead of relying on a
    // cancelled flag: a later render may run this effect's cleanup before the
    // microtask executes, and cancelling here would also cancel the pending
    // post-switch restore that the replacement is supposed to fire. While the
    // replacement runs, selection caching is suppressed (the transaction
    // parks the caret at the doc start and would overwrite the cached
    // position the restore is about to use).
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      if (lastPropRef.current !== value) return; // superseded by a newer prop
      applyingExternal.current = true;
      const nextDoc = editor.schema.nodeFromJSON(markdownToProse(value));
      editor.view.dispatch(
        editor.state.tr
          .replaceWith(0, editor.state.doc.content.size, nextDoc.content)
          .setMeta('addToHistory', false)
          .setMeta('preventUpdate', true),
      );
      applyingExternal.current = false;
      // The replacement parks the caret at the doc start — re-seek to the
      // editing site on the new document.
      restoreRef.current?.();
    });
  }, [value, editor]);

  // Return to the editing site after switching posts (the editor remounts):
  // restore the cached caret, then the scroll offset. The scroll-ref callback
  // cannot do this — with `immediatelyRender: false` the surface is still
  // empty when it runs, so the assignment is clamped to 0 and lost.
  // Restoring also has to survive the draft-restore chain: switching back
  // re-feeds the unsaved draft through usePostEditor -> setContent (in a
  // later render — no synchronous restore or single rAF is reliably late
  // enough, and that replacement parks the caret at the doc start). So the
  // restore is idempotent, kept in `restoreRef`, fired once from rAF and
  // again after every external replacement while this editor is mounted.
  useEffect(() => {
    if (!editor || !scrollKey) return;
    let restoring = true;
    const saveSelection = () => {
      if (applyingExternal.current || restoring || !editor.isFocused) return;
      const { from, to } = editor.state.selection;
      selectionCache.set(scrollKey, { from, to });
      // Also persist the scroll offset on every transaction: ProseMirror's
      // own scroll-to-caret does not always surface as a scroll event (not in
      // headless views), and the scroll listener alone can miss it.
      const el = scrollEl.current;
      if (el && !restoringScroll.current) scrollCache.set(scrollKey, el.scrollTop);
    };
    // Snapshot the position NOW: an early restore can clamp the scroller
    // (old document height) and its scroll event would write the clamped
    // value back into the cache, so the restore must carry its own copy.
    const savedScroll = scrollCache.get(scrollKey) ?? 0;
    const savedSel = selectionCache.get(scrollKey);
    const restore = () => {
      if (editor.isDestroyed) return;
      restoringScroll.current = true;
      const size = editor.state.doc.content.size;
      if (savedSel && savedSel.from <= size) {
        // Seek by caret: raw blocks render async, so a snapshotted offset
        // drifts while node views settle — scrollIntoView always lands the
        // caret in view regardless of layout changes.
        editor.commands.setTextSelection({
          from: Math.min(savedSel.from, size),
          to: Math.min(savedSel.to, size),
        });
      }
      requestAnimationFrame(() => {
        const el = scrollEl.current;
        if (!el || editor.isDestroyed) return;
        el.scrollTop = savedScroll;
        if (savedSel && savedSel.from <= editor.state.doc.content.size) {
          const caret = editor.view.coordsAtPos(savedSel.from);
          const box = el.getBoundingClientRect();
          if (caret.top < box.top) el.scrollTop -= box.top - caret.top + 24;
          else if (caret.bottom > box.bottom) el.scrollTop += caret.bottom - box.bottom + 24;
        }
        restoringScroll.current = false;
        restoring = false;
      });
    };
    restoreRef.current = restore;
    const frame = requestAnimationFrame(() => restoreRef.current?.());
    editor.on('selectionUpdate', saveSelection);
    editor.on('update', saveSelection);
    const saveOnBlur = () => {
      if (applyingExternal.current || restoring) return;
      const { from, to } = editor.state.selection;
      selectionCache.set(scrollKey, { from, to });
      if (scrollEl.current) scrollCache.set(scrollKey, scrollEl.current.scrollTop);
    };
    editor.on('blur', saveOnBlur);
    return () => {
      cancelAnimationFrame(frame);
      restoreRef.current = null;
      editor.off('selectionUpdate', saveSelection);
      editor.off('update', saveSelection);
      editor.off('blur', saveOnBlur);
    };
  }, [editor, scrollKey]);

  const submitLink = () => {
    if (!editor) return;
    const href = linkHref.trim();
    if (href) editor.chain().focus().setLink({ href }).run();
    else editor.chain().focus().unsetLink().run();
    setLinkOpen(false);
    setLinkHref('');
  };

  const submitRuby = () => {
    if (!editor) return;
    const text = rubyText.trim();
    const rt = rubyRt.trim();
    if (text && rt) {
      const range = rubyRange.current ?? editor.state.selection;
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: range.from, to: range.to },
          { type: 'ruby', attrs: { rt }, content: [{ type: 'text', text }] },
        )
        .run();
    }
    rubyRange.current = null;
    setRubyOpen(false);
    setRubyText('');
    setRubyRt('');
  };

  const toggleRuby = () => {
    if (!editor) return;
    const { $from, from, to } = editor.state.selection;
    const selectedNode = (
      editor.state.selection as typeof editor.state.selection & {
        node?: { type: { name: string }; textContent: string };
      }
    ).node;
    if (selectedNode?.type.name === 'ruby') {
      editor.chain().focus().insertContentAt({ from, to }, selectedNode.textContent).run();
      return;
    }
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name !== 'ruby') continue;
      const pos = $from.before(depth);
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: pos, to: pos + $from.node(depth).nodeSize },
          $from.node(depth).textContent,
        )
        .run();
      return;
    }
    setRubyText(editor.state.doc.textBetween(from, to));
    rubyRange.current = { from, to };
    setRubyRt('');
    setRubyOpen(true);
  };

  const pickQmoji = (name: string, mode: 'inline' | 'block' = 'inline') => {
    if (editor?.isActive('qmoji')) editor.chain().focus().updateAttributes('qmoji', { name }).run();
    else {
      const chain = editor?.chain().focus();
      if (mode === 'block')
        chain
          ?.insertContent([
            { type: 'hardBreak' },
            { type: 'qmoji', attrs: { name, mode } },
            { type: 'hardBreak' },
          ])
          .run();
      else chain?.insertQmoji(name).run();
    }
    setQmojiPos(null);
  };

  const openQmoji = () => {
    if (!editor) return;
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    setQmojiPos({ top: coords.bottom + 8, left: coords.left });
  };

  const openInlineMath = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);
    mathRange.current = { from, to };
    setMathText('');
    setMathOpen({ top: coords.bottom + 8, left: coords.left });
  };

  const submitInlineMath = () => {
    if (!editor) return;
    const tex = mathText.trim();
    const range = mathRange.current ?? editor.state.selection;
    if (tex)
      editor
        .chain()
        .focus()
        .insertContentAt({ from: range.from, to: range.to }, { type: 'mathInline', attrs: { tex } })
        .run();
    mathRange.current = null;
    setMathOpen(null);
    setMathText('');
  };

  const openSlash = () => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc');
    editor
      .chain()
      .focus()
      .insertContent(before && !/\s$/.test(before) ? ' /' : '/')
      .run();
  };

  if (!editor) {
    return (
      <div className="wysiwyg-surface">
        <div
          className="wysiwyg-scroll theme-root"
          data-theme={theme === 'dark' ? 'dark' : 'light'}
          ref={setScroll}
        />
      </div>
    );
  }

  return (
    <div className="wysiwyg-surface">
      <FormattingToolbar
        editor={editor}
        onOpenQmoji={openQmoji}
        onOpenSlash={openSlash}
        onRuby={toggleRuby}
        onInlineMath={openInlineMath}
      />
      {tocOpen && (
        <TocPanel
          editor={editor}
          scrollerRef={scrollEl}
          onClose={() => useUI.getState().toggleToc()}
        />
      )}
      <div
        className="wysiwyg-scroll theme-root"
        data-theme={theme === 'dark' ? 'dark' : 'light'}
        ref={setScroll}
      >
        <EditorContent editor={editor} />
        <BlockHandle editor={editor} scroller={scrollEl} />
        <TableDrag editor={editor} scroller={scrollEl} />
      </div>
      {mathOpen && (
        <form
          className="inline-math-dialog"
          style={{ top: mathOpen.top, left: mathOpen.left }}
          onSubmit={(event) => {
            event.preventDefault();
            submitInlineMath();
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <label>
            行内公式
            <input
              aria-label="行内公式内容"
              value={mathText}
              onChange={(event) => setMathText(event.target.value)}
              placeholder="例如 x^2 + y^2"
            />
          </label>
          <div>
            <button type="button" onClick={() => setMathOpen(null)}>
              取消
            </button>
            <button type="submit" disabled={!mathText.trim()}>
              插入
            </button>
          </div>
        </form>
      )}
      <BubbleMenu
        editor={editor}
        className="bubble-menu"
        updateDelay={100}
        options={{ placement: 'top', offset: 8 }}
      >
        {linkOpen ? (
          <form
            className="bubble-link"
            onSubmit={(e) => {
              e.preventDefault();
              submitLink();
            }}
          >
            <input
              type="url"
              placeholder="https://"
              value={linkHref}
              onChange={(e) => setLinkHref(e.target.value)}
              onBlur={submitLink}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setLinkOpen(false);
                }
              }}
            />
          </form>
        ) : rubyOpen ? (
          <form
            className="bubble-ruby"
            onSubmit={(e) => {
              e.preventDefault();
              submitRuby();
            }}
          >
            <input
              className="ruby-text"
              placeholder={t('shortcodeRubyText')}
              value={rubyText}
              onChange={(e) => setRubyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setRubyOpen(false);
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitRuby();
                }
              }}
            />
            <input
              className="ruby-rt"
              placeholder={t('shortcodeRubyRt')}
              value={rubyRt}
              onChange={(e) => setRubyRt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setRubyOpen(false);
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitRuby();
                }
              }}
            />
            <button type="submit" title="应用注音">
              应用
            </button>
          </form>
        ) : (
          <>
            <BubbleBtn
              editor={editor}
              mark="bold"
              label="B"
              className="bold"
              title={`Bold (${formatCombo('Mod+B')})`}
            />
            <BubbleBtn
              editor={editor}
              mark="italic"
              label="I"
              className="italic"
              title={`Italic (${formatCombo('Mod+I')})`}
            />
            <BubbleBtn
              editor={editor}
              mark="code"
              label={<Code2 size={15} />}
              title={t('inlineCode')}
            />
            <BubbleBtn editor={editor} mark="strike" label="S" className="strike" title="删除线" />
            <BubbleBtn editor={editor} node="heading" attrs={{ level: 1 }} label="H1" />
            <BubbleBtn editor={editor} node="heading" attrs={{ level: 2 }} label="H2" />
            <BubbleBtn editor={editor} node="heading" attrs={{ level: 3 }} label="H3" />
            <BubbleBtn
              editor={editor}
              node="bulletList"
              label={<List size={15} />}
              title={t('slashBullet')}
            />
            <BubbleBtn
              editor={editor}
              node="blockquote"
              label={<Quote size={15} />}
              title={t('slashQuote')}
            />
            <BubbleHl editor={editor} />
            <button
              type="button"
              title={t('slashRuby')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleRuby}
            >
              あ
            </button>
            <button
              type="button"
              className={editor.isActive('link') ? 'active' : ''}
              title={t('link')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setLinkHref(editor.getAttributes('link').href ?? '');
                setLinkOpen(true);
              }}
            >
              <Link2 size={15} aria-hidden="true" />
            </button>
          </>
        )}
      </BubbleMenu>
      <SlashMenu
        editor={editor}
        apiRef={slashApi}
        onOpenQmoji={setQmojiPos}
        onOpenImage={() => setImageOpen(true)}
        onOpenInlineMath={openInlineMath}
      />
      <QmojiPicker
        open={qmojiPos !== null}
        position={qmojiPos}
        onClose={() => setQmojiPos(null)}
        onPick={pickQmoji}
      />
      {imageOpen && (
        <ImageDialog
          onClose={() => setImageOpen(false)}
          onInsert={(src, alt) => {
            editor.chain().focus().insertImage({ src, alt }).run();
            setImageOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** A bubble toggle button whose `active` state tracks the live selection.
 *  Computing `isActive` during the parent's render goes stale as soon as the
 *  caret moves without a content change, so the button subscribes itself. */
function BubbleBtn({
  editor,
  mark,
  node,
  attrs,
  label,
  className,
  title,
}: {
  editor: Editor;
  mark?: string;
  node?: string;
  attrs?: Record<string, unknown>;
  label: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const active = useEditorState({
    editor,
    selector: (snap) => {
      if (!snap.editor) return false;
      return mark
        ? snap.editor.isActive(mark)
        : node
          ? snap.editor.isActive(node, attrs ?? {})
          : false;
    },
  });
  const run = () => {
    if (mark === 'bold') editor.chain().focus().toggleBold().run();
    else if (mark === 'italic') editor.chain().focus().toggleItalic().run();
    else if (mark === 'code') editor.chain().focus().toggleCode().run();
    else if (mark === 'strike') editor.chain().focus().toggleStrike().run();
    else if (node === 'heading')
      editor
        .chain()
        .focus()
        .toggleHeading({ level: Number(attrs?.level ?? 1) as 1 | 2 | 3 | 4 | 5 | 6 })
        .run();
    else if (node === 'bulletList') editor.chain().focus().toggleBulletList().run();
    else if (node === 'blockquote') editor.chain().focus().toggleBlockquote().run();
  };
  return (
    <button
      type="button"
      className={`${active ? 'active' : ''} ${className ?? ''}`.trim()}
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );
}

/** Highlight button for the bubble menu: toggles the colour, pick a new one
 *  with the caret. */
function BubbleHl({ editor }: { editor: Editor }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const activeColor = useEditorState({
    editor,
    selector: (snap) => (snap.editor ? String(snap.editor.getAttributes('hl').color ?? '') : ''),
  });
  return (
    <div className="ft-split">
      <button
        type="button"
        className={activeColor ? 'active' : ''}
        title={t('slashHl')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          editor
            .chain()
            .focus()
            .toggleHl(activeColor || HL_COLORS[0]!)
            .run()
        }
      >
        <span className="hl-swatch" style={{ background: hlHex(activeColor) }} />
      </button>
      <button
        type="button"
        className="ft-caret"
        title={t('slashHl')}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="hl-colors" role="menu">
          {HL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitem"
              title={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().toggleHl(c).run();
                setOpen(false);
              }}
            >
              <span className="hl-swatch" style={{ background: hlHex(c) }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function hlHex(color: string): string {
  const map: Record<string, string> = {
    orange: '#FF3D00',
    yellow: '#FFD600',
    blue: '#2979FF',
    green: '#00E676',
  };
  return map[color] ?? '#2979FF';
}
