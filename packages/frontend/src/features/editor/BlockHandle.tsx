/**
 * Notion-style block handle: the small grip that appears to the left of whichever
 * top-level block the pointer is over. Drag it to reorder blocks; press + to
 * insert an empty block below and open the slash menu.
 *
 * Positions are resolved through `view.posAtCoords` and the block DOM rect, so
 * the handle tracks blocks of any height (including raw-block atoms).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { createDragScroller } from './drag-autoscroll.js';

const HANDLE_W = 48;

interface HandlePos {
  top: number;
  left: number;
  /** Position of the top-level block the handle belongs to. */
  pos: number;
}

interface DropAt {
  top: number;
  left: number;
  width: number;
  /** Distance from the block's top to its bottom (where an after-drop lands). */
  height: number;
  pos: number;
  after: boolean;
}/** Resolve the top-level block (and its DOM rect) at viewport coordinates. */
function blockAt(editor: Editor, x: number, y: number) {
  const view = editor.view;
  const bounds = view.dom.getBoundingClientRect();
  // Clamp into the *content* box, not the root box: points over the root's
  // padding (or in the margin strip left of it, where the handle itself sits)
  // resolve to no block at all and would hide the handle mid-approach.
  const cs = getComputedStyle(view.dom);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const left = Math.min(bounds.right - padR - 1, Math.max(bounds.left + padL + 1, x));
  const element = document.elementFromPoint(left, y);
  let block = element instanceof HTMLElement ? element : element?.parentElement;
  while (block && block.parentElement !== view.dom) block = block.parentElement;
  if (block?.parentElement === view.dom) {
    let found: { pos: number; rect: DOMRect } | null = null;
    view.state.doc.forEach((_node, pos) => {
      if (view.nodeDOM(pos) === block) found = { pos, rect: block!.getBoundingClientRect() };
    });
    if (found) return found;
  }
  const hit = view.posAtCoords({ left, top: y });
  if (!hit) return null;
  const $pos = view.state.doc.resolve(hit.pos);
  if ($pos.depth < 1) return null;
  const pos = $pos.before(1);
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  return { pos, rect: dom.getBoundingClientRect() };
}

export function BlockHandle({
  editor,
  scroller,
}: {
  editor: Editor;
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const [handle, setHandle] = useState<HandlePos | null>(null);
  const [drop, setDrop] = useState<DropAt | null>(null);
  const dragFrom = useRef<number | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const toLocal = useCallback(
    (rect: DOMRect): { top: number; left: number } => {
      const sc = scroller.current;
      if (!sc) return { top: rect.top, left: rect.left };
      const sr = sc.getBoundingClientRect();
      return {
        top: rect.top - sr.top + sc.scrollTop,
        left: Math.max(2, rect.left - sr.left - HANDLE_W - 6),
      };
    },
    [scroller],
  );

  const recompute = useCallback(() => {
    const p = lastPointer.current;
    if (!p) return;
    if (dragFrom.current !== null) return;
    const found = blockAt(editor, p.x, p.y);
    setHandle(found ? { ...toLocal(found.rect), pos: found.pos } : null);
  }, [editor, toLocal]);

  // Track the block under the pointer.
  useEffect(() => {
    const dom = scroller.current;
    if (!dom) return;
    const onMove = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.block-handle')) return;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      if (dragFrom.current !== null) return;
      const found = blockAt(editor, e.clientX, e.clientY);
      setHandle(found ? { ...toLocal(found.rect), pos: found.pos } : null);
    };
    const onLeave = () => {
      lastPointer.current = null;
      setHandle(null);
    };
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerleave', onLeave);
    dom.addEventListener('scroll', recompute, { passive: true });
    return () => {
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerleave', onLeave);
      dom.removeEventListener('scroll', recompute);
    };
  }, [editor, toLocal, scroller, recompute]);

  // Keep the handle glued to its block while the document changes (typing).
  useEffect(() => {
    editor.on('transaction', recompute);
    return () => {
      editor.off('transaction', recompute);
    };
  }, [editor, recompute]);

  /** Rects of every top-level block, in document order. */
  const topBlockRects = useCallback((): DOMRect[] => {
    const rects: DOMRect[] = [];
    const doc = editor.state.doc;
    let pos = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const dom = editor.view.nodeDOM(pos);
      if (dom instanceof HTMLElement) rects.push(dom.getBoundingClientRect());
      pos += doc.child(i).nodeSize;
    }
    return rects;
  }, [editor]);

  const toLocalY = useCallback((viewportTop: number) => {
    const sc = scroller.current;
    if (!sc) return viewportTop;
    return viewportTop - sc.getBoundingClientRect().top + sc.scrollTop;
  }, [scroller]);

  const targetAt = (x: number, y: number): DropAt | null => {
    const found = blockAt(editor, x, y);
    if (!found) return null;
    const doc = editor.state.doc;
    let index = -1;
    for (let pos = 0, i = 0; i < doc.childCount; i++) {
      if (pos === found.pos) { index = i; break; }
      pos += doc.child(i).nodeSize;
    }
    if (index < 0) return null;
    const after = y > found.rect.top + found.rect.height / 2;
    // One line per gap: place it midway between the two block edges the drop
    // lands between. Aiming at block edges instead would give every gap two
    // possible line positions (this block's bottom or the next one's top).
    const rects = topBlockRects();
    const pair = (a: DOMRect | null, b: DOMRect | null, fallback: number) =>
      a && b ? (a.bottom + b.top) / 2 : fallback;
    const viewportTop = after
      ? pair(found.rect, rects[index + 1] ?? null, found.rect.bottom + 16)
      : pair(rects[index - 1] ?? null, found.rect, found.rect.top - 16);
    const local = toLocal(found.rect);
    return {
      ...local,
      top: toLocalY(viewportTop),
      width: found.rect.width,
      height: found.rect.height,
      pos: found.pos,
      after,
    };
  };

  const onDragStart = (e: React.DragEvent) => {
    if (!handle) return;
    dragFrom.current = handle.pos;
    // Keep the grip mounted while dragging so pointer transitions do not lose
    // the source. A private payload also prevents ProseMirror's native text
    // drop handler from treating this as an inline copy.
    e.dataTransfer.setData('application/x-blog-writer-block', String(handle.pos));
    e.dataTransfer.effectAllowed = 'move';
    const dom = editor.view.nodeDOM(handle.pos);
    if (dom instanceof HTMLElement) {
      try {
        e.dataTransfer.setDragImage(dom, 24, 24);
      } catch {
        // setDragImage is unavailable in some webviews; the default ghost is fine
      }
    }
  };

  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const scrollerCtl = createDragScroller(() => scroller.current, () => {
      // The page scrolled under a stationary pointer: re-derive the line.
      if (dragFrom.current !== null) setDrop(targetAt(scrollerCtl.x, scrollerCtl.y));
    });
    const onDragOver = (e: DragEvent) => {
      if (dragFrom.current === null) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      scrollerCtl.dragover(e);
      setDrop(targetAt(e.clientX, e.clientY));
    };
    const onDrop = (e: DragEvent) => {
      const from = dragFrom.current;
      dragFrom.current = null;
      scrollerCtl.stop();
      setDrop(null);
      if (from === null) return;
      e.preventDefault();
      e.stopPropagation();
      const target = targetAt(e.clientX, e.clientY);
      if (!target) return;
      const view = editor.view;
      const tr = view.state.tr;
      const node = view.state.doc.nodeAt(from);
      const targetNode = view.state.doc.nodeAt(target.pos);
      if (!node || !targetNode) return;
      // No-op when the block lands where it already is.
      const insertAt =
        target.after ? target.pos + targetNode.nodeSize : target.pos;
      if (insertAt === from || (target.after && insertAt === from + node.nodeSize))
        return;
      tr.delete(from, from + node.nodeSize);
      const to = tr.mapping.map(insertAt);
      tr.insert(to, node);
      tr.setSelection(NodeSelection.create(tr.doc, to));
      view.dispatch(tr);
      view.dragging = null;
      view.focus();
    };
    const onDragEnd = () => {
      dragFrom.current = null;
      scrollerCtl.stop();
      setDrop(null);
    };
    sc.addEventListener('dragover', onDragOver, true);
    sc.addEventListener('drop', onDrop, true);
    sc.addEventListener('dragend', onDragEnd);
    return () => {
      scrollerCtl.stop();
      sc.removeEventListener('dragover', onDragOver, true);
      sc.removeEventListener('drop', onDrop, true);
      sc.removeEventListener('dragend', onDragEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, scroller, toLocal]);

  const onAdd = () => {
    if (!handle) return;
    const view = editor.view;
    const node = view.state.doc.nodeAt(handle.pos);
    if (!node) return;
    const at = handle.pos + node.nodeSize;
    const tr = view.state.tr;
    tr.insert(at, view.state.schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.near(tr.doc.resolve(at)));
    view.dispatch(tr);
    view.focus();
    // A leading '/' opens the slash menu on an empty paragraph.
    editor.commands.insertContent('/');
  };

  if (!handle && !drop) return null;

  return (
    <>
      {handle && (
        <div className="block-handle" style={{ top: handle.top, left: handle.left }}>
          <button
            type="button"
            draggable
            onDragStart={onDragStart}
            title="拖拽排序"
            aria-label="拖拽排序"
          >
            ⠿
          </button>
          <button type="button" onClick={onAdd} title="在下方插入块" aria-label="在下方插入块">
            +
          </button>
        </div>
      )}
      {drop && (
        <div
          className="block-drop-line"
          style={{
            top: drop.top,
            left: drop.left + HANDLE_W + 6,
            width: drop.width,
          }}
        />
      )}
    </>
  );
}
