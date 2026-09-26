/**
 * Row/column reorder surgery for tables. The stock TipTap table commands can
 * insert and delete rows/columns but never move them, so the drag handles
 * rebuild the table node with the reordered children.
 *
 * Only GFM-style grids are supported: any merged cell (colspan/rowspan > 1)
 * or a ragged row makes a reorder ambiguous, and the callers refuse to show
 * handles for such tables.
 */
import { Fragment } from '@tiptap/pm/model';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

type Dispatch = (tr: Transaction) => void;

export function hasMergedCells(table: PMNode): boolean {
  let merged = false;
  table.forEach((row) => {
    row.forEach((cell) => {
      if (Number(cell.attrs.colspan ?? 1) > 1 || Number(cell.attrs.rowspan ?? 1) > 1) merged = true;
    });
  });
  return merged;
}

/** Every row must carry the same number of cells for a column move. */
function isRagged(table: PMNode): boolean {
  const count = table.firstChild?.childCount ?? 0;
  if (count === 0) return true;
  for (let i = 0; i < table.childCount; i++) {
    if (table.child(i).childCount !== count) return true;
  }
  return false;
}

export function canReorder(table: PMNode): boolean {
  return table.childCount > 0 && !hasMergedCells(table) && !isRagged(table);
}

function reorderChildren(node: PMNode, from: number, to: number): PMNode[] | null {
  const children: PMNode[] = [];
  node.forEach((child) => children.push(child));
  const [moved] = children.splice(from, 1);
  if (!moved) return null;
  children.splice(to, 0, moved);
  return children;
}

export function moveTableRow(
  state: EditorState,
  dispatch: Dispatch | undefined,
  tablePos: number,
  from: number,
  to: number,
): boolean {
  const table = state.doc.nodeAt(tablePos);
  if (!table || !canReorder(table)) return false;
  if (from === to || from < 0 || to < 0 || from >= table.childCount || to >= table.childCount) return false;
  const rows = reorderChildren(table, from, to);
  if (!rows) return false;
  if (dispatch) {
    const next = table.type.createChecked(table.attrs, Fragment.fromArray(rows), table.marks);
    dispatch(state.tr.replaceWith(tablePos, tablePos + table.nodeSize, next));
  }
  return true;
}

export function moveTableColumn(
  state: EditorState,
  dispatch: Dispatch | undefined,
  tablePos: number,
  from: number,
  to: number,
): boolean {
  const table = state.doc.nodeAt(tablePos);
  if (!table || !canReorder(table)) return false;
  if (from === to || from < 0 || to < 0) return false;
  const rows: PMNode[] = [];
  for (let i = 0; i < table.childCount; i++) {
    const row = table.child(i);
    if (from >= row.childCount || to >= row.childCount) return false;
    const cells = reorderChildren(row, from, to);
    if (!cells) return false;
    rows.push(row.type.createChecked(row.attrs, Fragment.fromArray(cells), row.marks));
  }
  if (dispatch) {
    const next = table.type.createChecked(table.attrs, Fragment.fromArray(rows), table.marks);
    dispatch(state.tr.replaceWith(tablePos, tablePos + table.nodeSize, next));
  }
  return true;
}
