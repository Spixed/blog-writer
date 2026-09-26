/**
 * Drag-to-reorder handles for table rows and columns. Hovering a table shows
 * a grip above every column and left of every row; dragging one over the same
 * table previews the insertion boundary with a glowing line and rebuilds the
 * table node on drop (see extensions/table-move.ts).
 *
 * Tables with merged cells or ragged rows are skipped — a reorder would be
 * ambiguous. All coordinates are scroller-local (content box), matching
 * BlockHandle.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { canReorder, moveTableColumn, moveTableRow } from './extensions/table-move.js';
import { createDragScroller } from './drag-autoscroll.js';

interface TableLayout {
  tablePos: number;
  top: number;
  left: number;
  width: number;
  height: number;
  cols: { center: number; left: number }[];
  rows: { center: number; top: number }[];
}

interface DragState {
  kind: 'row' | 'col';
  from: number;
}

interface DropHint {
  kind: 'row' | 'col';
  /** Insertion index (in the source layout's numbering). */
  index: number;
  /** Local px position of the boundary line. */
  at: number;
}

export function TableDrag({
  editor,
  scroller,
}: {
  editor: Editor;
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const [table, setTable] = useState<TableLayout | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);
  const tableRef = useRef<TableLayout | null>(null);
  const drag = useRef<DragState | null>(null);

  const layout = useCallback(
    (clientX: number, clientY: number): TableLayout | null => {
      const sc = scroller.current;
      if (!sc) return null;
      const el = document.elementFromPoint(clientX, clientY);
      const tableEl = el instanceof Element ? el.closest('table') : null;
      if (!(tableEl instanceof HTMLTableElement) || !sc.contains(tableEl)) return null;
      const view = editor.view;
      let tablePos: number | null = null;
      try {
        const $pos = view.state.doc.resolve(view.posAtDOM(tableEl, 0));
        for (let d = $pos.depth; d >= 0; d--) {
          if ($pos.node(d).type.spec.tableRole === 'table') {
            tablePos = $pos.before(d);
            break;
          }
        }
      } catch {
        return null;
      }
      if (tablePos === null) return null;
      const node = view.state.doc.nodeAt(tablePos);
      if (!node || !canReorder(node)) return null;
      const sr = sc.getBoundingClientRect();
      const tr = tableEl.getBoundingClientRect();
      const rowEls = [...tableEl.querySelectorAll('tr')];
      if (rowEls.length !== node.childCount) return null;
      const cellEls = rowEls[0] ? [...rowEls[0].children] : [];
      if (cellEls.length !== (node.firstChild?.childCount ?? 0)) return null;
      const local = (r: DOMRect) => ({ top: r.top - sr.top + sc.scrollTop, left: r.left - sr.left });
      const tRect = local(tr);
      return {
        tablePos,
        top: tRect.top,
        left: tRect.left,
        width: tr.width,
        height: tr.height,
        cols: cellEls.map((c) => {
          const r = c.getBoundingClientRect();
          const l = local(r);
          return { center: l.left + r.width / 2, left: l.left };
        }),
        rows: rowEls.map((r) => {
          const rect = r.getBoundingClientRect();
          const l = local(rect);
          return { center: l.top + rect.height / 2, top: l.top };
        }),
      };
    },
    [editor, scroller],
  );

  const apply = useCallback(
    (t: TableLayout | null) => {
      tableRef.current = t;
      setTable(t);
    },
    [],
  );

  /** True when the pointer sits on top of a rendered grip: the grips live
   *  outside the table box, and losing them there makes dragging (which must
   *  start on the grip) impossible. The bands span from just inside the table
   *  edge to just above/beside the grips so the approach path is covered. */
  const nearGrip = useCallback((t: TableLayout, x: number, y: number): boolean => {
    // column grips sit above the table
    if (y >= t.top - 24 && y <= t.top + 4) {
      for (const c of t.cols) if (Math.abs(x - c.center) <= 14) return true;
    }
    // row grips sit left of the table
    if (x >= t.left - 28 && x <= t.left + 4) {
      for (const r of t.rows) if (Math.abs(y - r.center) <= 14) return true;
    }
    return false;
  }, []);

  // Track the table under the pointer (paused while a drag is in flight so
  // the source layout stays stable for the indicator).
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const onMove = (e: PointerEvent) => {
      if (drag.current) return;
      if (e.target instanceof Element && e.target.closest('.table-grip')) return;
      const found = layout(e.clientX, e.clientY);
      if (found) {
        apply(found);
        return;
      }
      // Off the table: keep the grips alive while the pointer travels across
      // the grip strip towards them.
      const current = tableRef.current;
      if (current && nearGrip(current, e.clientX - sc.getBoundingClientRect().left, e.clientY - sc.getBoundingClientRect().top + sc.scrollTop)) return;
      apply(null);
    };
    const onLeave = () => {
      if (!drag.current) apply(null);
    };
    sc.addEventListener('pointermove', onMove);
    sc.addEventListener('pointerleave', onLeave);
    return () => {
      sc.removeEventListener('pointermove', onMove);
      sc.removeEventListener('pointerleave', onLeave);
    };
  }, [layout, scroller, apply, nearGrip]);

  const indexAt = (t: TableLayout, kind: 'row' | 'col', x: number, y: number): number => {
    const stops = kind === 'col' ? t.cols : t.rows;
    const pos = kind === 'col' ? x : y;
    for (let i = 0; i < stops.length; i++) {
      if (pos < stops[i]!.center) return i;
    }
    return stops.length;
  };

  // Drag preview + drop application. Capture listeners mirror BlockHandle's
  // so the native ProseMirror drop handler never sees these drags.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const hintFor = (t: TableLayout, kind: 'row' | 'col', clientX: number, clientY: number): DropHint | null => {
      const sr = sc.getBoundingClientRect();
      const x = clientX - sr.left;
      const y = clientY - sr.top + sc.scrollTop;
      const inside =
        x >= t.left - 16 && x <= t.left + t.width + 16 && y >= t.top - 24 && y <= t.top + t.height + 24;
      if (!inside) return null;
      const index = indexAt(t, kind, x, y);
      let at: number;
      if (kind === 'col') {
        at = index < t.cols.length ? t.cols[index]!.left : t.left + t.width;
      } else {
        at = index < t.rows.length ? t.rows[index]!.top : t.top + t.height;
      }
      return { kind, index, at };
    };
    const scrollerCtl = createDragScroller(() => scroller.current, () => {
      // Content moved under a stationary pointer: re-derive the indicator.
      const d = drag.current;
      if (d && tableRef.current) setHint(hintFor(tableRef.current, d.kind, scrollerCtl.x, scrollerCtl.y));
    });
    const onDragOver = (e: DragEvent) => {
      const d = drag.current;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      scrollerCtl.dragover(e);
      const t = tableRef.current;
      setHint(t ? hintFor(t, d.kind, e.clientX, e.clientY) : null);
    };
    const onDrop = (e: DragEvent) => {
      const d = drag.current;
      drag.current = null;
      scrollerCtl.stop();
      setHint(null);
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      const t = tableRef.current;
      if (!t) return;
      const hint = hintFor(t, d.kind, e.clientX, e.clientY);
      if (!hint) return;
      const to = hint.index;
      // `to` counts the source row still in place; adjust after its removal.
      const target = to > d.from ? to - 1 : to;
      if (target === d.from) return;
      const dispatch = (tr: Parameters<typeof editor.view.dispatch>[0]) => editor.view.dispatch(tr);
      const ok =
        d.kind === 'row'
          ? moveTableRow(editor.view.state, dispatch, t.tablePos, d.from, target)
          : moveTableColumn(editor.view.state, dispatch, t.tablePos, d.from, target);
      editor.view.dragging = null;
      if (ok) editor.view.focus();
    };
    const onDragEnd = () => {
      drag.current = null;
      scrollerCtl.stop();
      setHint(null);
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
  }, [editor, scroller]);

  if (!table && !hint) return null;

  return (
    <>
      {table && (
        <>
          {table.cols.map((c, i) => (
            <button
              key={`col-${i}`}
              type="button"
              className="table-grip col"
              style={{ top: table.top - 21, left: Math.max(2, c.center - 9) }}
              draggable
              title="拖拽交换列"
              aria-label={`拖拽第 ${i + 1} 列`}
              onDragStart={(e) => {
                e.stopPropagation();
                drag.current = { kind: 'col', from: i };
                e.dataTransfer.setData('application/x-blog-writer-table', `col:${i}`);
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              ⣿
            </button>
          ))}
          {table.rows.map((r, i) => (
            <button
              key={`row-${i}`}
              type="button"
              className="table-grip row"
              style={{ top: r.center - 9, left: Math.max(2, table.left - 25) }}
              draggable
              title="拖拽交换行"
              aria-label={`拖拽第 ${i + 1} 行`}
              onDragStart={(e) => {
                e.stopPropagation();
                drag.current = { kind: 'row', from: i };
                e.dataTransfer.setData('application/x-blog-writer-table', `row:${i}`);
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              ⣿
            </button>
          ))}
        </>
      )}
      {hint && table && (
        <div
          className={`table-drop-line ${hint.kind}`}
          style={
            hint.kind === 'col'
              ? { left: hint.at - 1.5, top: table.top, height: table.height }
              : { top: hint.at - 1.5, left: table.left, width: table.width }
          }
        />
      )}
    </>
  );
}
