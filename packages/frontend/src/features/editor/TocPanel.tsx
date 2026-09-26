/**
 * Floating table of contents for the WYSIWYG surface, mirroring the blog's
 * Polymer aside: headings become a nested, level-indented list that follows
 * the document live, clicking an entry scrolls that heading into view, and
 * the section currently under the top of the viewport stays highlighted
 * (the theme's TOC spy).
 *
 * Headings are read straight from the ProseMirror document — the position of
 * each heading node is kept so a click can seek the caret and scroll the real
 * DOM node into view without any id plumbing.
 */
import { useEffect, useRef, useState } from 'react';
import { ListTree, X } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { useI18n } from '../../i18n/useI18n.js';

export interface TocHeading {
  level: number;
  text: string;
  /** Document position right before the heading node. */
  pos: number;
}

type TocNode = TocHeading & { children: TocNode[] };

function readHeadings(editor: Editor): TocHeading[] {
  const out: TocHeading[] = [];
  editor.state.doc.descendants((node, pos) => {
    // H2–H3 only, matching the blog's ToC: hugo.toml configures no
    // [markup.tableOfContents], so Hugo's defaults apply (startLevel 2,
    // endLevel 3). H1 is the post title's job; deeper headings exist in the
    // document but not in the outline.
    const level = Number(node.attrs.level);
    if (node.type.name === 'heading' && level >= 2 && level <= 3 && node.textContent.trim()) {
      out.push({ level, text: node.textContent.trim(), pos });
    }
    return true;
  });
  return out;
}

/** Nest a flat heading list into the ul>li>ul shape of the blog's ToC.
 *  Skipped levels (h2 followed by h4) simply indent deeper. */
function nest(items: TocHeading[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const item of items) {
    const node: TocNode = { ...item, children: [] };
    while (stack.length && stack[stack.length - 1]!.level >= node.level) stack.pop();
    (stack.length ? stack[stack.length - 1]!.children : root).push(node);
    stack.push(node);
  }
  return root;
}

export function TocPanel({
  editor,
  scrollerRef,
  onClose,
}: {
  editor: Editor;
  /** The WYSIWYG scroll container, for the scroll-spy. */
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [headings, setHeadings] = useState<TocHeading[]>(() => readHeadings(editor));
  const headingsRef = useRef(headings);
  headingsRef.current = headings;
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Live update: re-read the headings after each document transaction (rAF
  // coalesced — IME and paste bursts must not re-walk the doc per keystroke).
  useEffect(() => {
    let frame = 0;
    const onUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setHeadings(readHeadings(editor));
      });
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [editor]);

  // Scroll-spy: the last heading whose top edge sits above the spy line (a
  // little below the scroller's top) is the section being read. Reads the
  // live `headingsRef` so the single scroll listener survives list updates.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const spy = () => {
      frame = 0;
      const line = scroller.getBoundingClientRect().top + 80;
      let current: number | null = null;
      for (const heading of headingsRef.current) {
        try {
          if (editor.view.coordsAtPos(heading.pos).top <= line) current = heading.pos;
          else break;
        } catch {
          break; // position not mapped (async replacement in flight)
        }
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(spy);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    spy();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [editor, headings, scrollerRef]);

  const jump = (heading: TocHeading) => {
    // The list can go stale for one frame while a document replacement is in
    // flight — verify the target is still a heading before seeking.
    const node = editor.state.doc.nodeAt(heading.pos);
    if (!node || node.type.name !== 'heading') return;
    // focus() defaults to scrollIntoView: true, which dispatches an instant
    // scroll-to-selection on the next frame — it would cancel the smooth
    // animation below (and leave a heading below the viewport stuck at the
    // bottom edge until a second click). Keep the focus, drop the scroll.
    editor.commands.focus(undefined, { scrollIntoView: false });
    editor.commands.setTextSelection(heading.pos + 1);
    const dom = editor.view.nodeDOM(heading.pos);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <aside className="toc-floater" aria-label={t('tocPanel')}>
      <div className="toc-floater-head">
        <ListTree size={14} aria-hidden="true" />
        <span className="toc-floater-title">{t('tocPanel')}</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="icon-btn"
          title={t('close')}
          aria-label={t('close')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="toc-floater-scroll" ref={listRef}>
        {headings.length === 0 ? (
          <div className="toc-empty">{t('tocEmpty')}</div>
        ) : (
          <TocTree nodes={nest(headings)} active={active} jump={jump} />
        )}
      </div>
    </aside>
  );
}

function TocTree({
  nodes,
  active,
  jump,
}: {
  nodes: TocNode[];
  active: number | null;
  jump: (heading: TocHeading) => void;
}) {
  return (
    <ul className="toc-list">
      {nodes.map((node) => (
        <li key={node.pos}>
          <button
            type="button"
            className={'toc-link' + (active === node.pos ? ' active' : '')}
            title={node.text}
            onClick={() => jump(node)}
          >
            {node.text}
          </button>
          {node.children.length > 0 && <TocTree nodes={node.children} active={active} jump={jump} />}
        </li>
      ))}
    </ul>
  );
}
