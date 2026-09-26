import { create } from 'zustand';

/**
 * Document-level undo/redo for destructive post-management operations (delete,
 * rename). Editor typing has its own history: TipTap ships UndoRedo, and the
 * split-mode textarea uses the browser's native undo.
 *
 * Each entry stores both directions: `undo` reverts the operation, `redo`
 * reapplies it. Deleting a post keeps its raw bytes so the restore is exact.
 */

export interface UndoEntry {
  id: number;
  label: string;
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
}

interface UndoState {
  past: UndoEntry[];
  future: UndoEntry[];
  push: (entry: Omit<UndoEntry, 'id'>) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
}

let nextId = 1;

export const useUndo = create<UndoState>((set, get) => ({
  past: [],
  future: [],
  push: (entry) =>
    set((s) => ({
      past: [...s.past, { ...entry, id: nextId++ }],
      future: [],
    })),
  undo: async () => {
    const { past } = get();
    const entry = past[past.length - 1];
    if (!entry) return;
    await entry.undo();
    set((s) => ({
      past: s.past.filter((e) => e.id !== entry.id),
      future: [entry, ...s.future],
    }));
  },
  redo: async () => {
    const { future } = get();
    const entry = future[0];
    if (!entry) return;
    await entry.redo();
    set((s) => ({
      future: s.future.filter((e) => e.id !== entry.id),
      past: [...s.past, entry],
    }));
  },
  clear: () => set({ past: [], future: [] }),
}));

/** True when a keyboard event originated inside an editable surface. */
export function isEditableTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // ProseMirror manages its own undo; the root element carries the class.
  return !!target.closest('.wysiwyg-surface, .ProseMirror');
}
