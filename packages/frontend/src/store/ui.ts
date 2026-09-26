import type { Lang } from '@blog-writer/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UiLang } from '../i18n/dicts.js';

export type AppTheme = 'light' | 'dark' | 'auto';
export type SortMode = 'date-desc' | 'date-asc' | 'title-asc';
export type ListFilter = 'all' | 'draft' | 'published' | 'featured';

/**
 * The three editing modes. `bilingual` is a mode in its own right (not a
 * toggle): it shows two WYSIWYG editors side by side, while `split` pairs a
 * plain Markdown editor with a read-only live render.
 */
export type EditorMode = 'wysiwyg' | 'split' | 'bilingual';

export const EDITOR_MODES: EditorMode[] = ['wysiwyg', 'split', 'bilingual'];

/**
 * Floating-panel position, anchored to a viewport edge rather than stored as
 * an absolute point: shrinking the window slides the panel along with the
 * anchored edge (dx/dy = distance from that edge to the panel's near side),
 * so a panel parked in a corner stays inside the viewport at any size.
 */
export interface FmPos {
  ax: 'left' | 'right';
  ay: 'top' | 'bottom';
  dx: number;
  dy: number;
}

interface UIState {
  /**
   * Current language. Drives both the UI chrome and the content being edited:
   * the post list, the front matter and the body all follow this language.
   */
  uiLang: UiLang;
  theme: AppTheme;
  /** Body presentation; shared by every pane so both languages stay in sync. */
  editorMode: EditorMode;
  /** Whether the floating front-matter panel is open (works in every mode). */
  fmPanelOpen: boolean;
  /** Whether the WYSIWYG table-of-contents floater is open (session only). */
  tocOpen: boolean;
  /** Whether the article library sidebar is collapsed to a slim rail. */
  sidebarCollapsed: boolean;
  /** Last dragged position of each language's front-matter panel (session). */
  fmPos: Partial<Record<Lang, FmPos>>;
  /** Left-column width of split mode, as a fraction of the pane (0.2 - 0.8). */
  splitRatio: number;
  autosave: boolean;
  autosaveDelay: number;
  /** Soft-wrap long lines in the split-mode Markdown source editor. */
  sourceWrap: boolean;
  search: string;
  sort: SortMode;
  filter: ListFilter;
  authorFilter: string;
  selected: { lang: Lang; slug: string } | null;
  setUiLang: (l: UiLang) => void;
  setTheme: (t: AppTheme) => void;
  setEditorMode: (m: EditorMode) => void;
  setFmPanelOpen: (open: boolean) => void;
  toggleFmPanel: () => void;
  toggleToc: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setFmPos: (lang: Lang, pos: FmPos) => void;
  setSplitRatio: (r: number) => void;
  setAutosave: (enabled: boolean) => void;
  setAutosaveDelay: (delay: number) => void;
  setSourceWrap: (wrap: boolean) => void;
  setSearch: (s: string) => void;
  setSort: (s: SortMode) => void;
  setFilter: (f: ListFilter) => void;
  setAuthorFilter: (author: string) => void;
  select: (lang: Lang, slug: string) => void;
  clearSelection: () => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      uiLang: 'zh',
      theme: 'auto',
      editorMode: 'wysiwyg',
      fmPanelOpen: false,
      tocOpen: false,
      sidebarCollapsed: false,
      fmPos: {},
      splitRatio: 0.5,
      autosave: false,
      autosaveDelay: 1000,
      sourceWrap: false,
      search: '',
      sort: 'date-desc',
      filter: 'all',
      authorFilter: '',
      selected: null,
      setUiLang: (uiLang) =>
        set((s) => ({
          uiLang,
          authorFilter: '',
          // Keep the same post selected, but switch to its version in the new
          // language (the editor offers to create it if missing).
          selected: s.selected ? { lang: uiLang, slug: s.selected.slug } : null,
        })),
      setTheme: (theme) => set({ theme }),
      setEditorMode: (editorMode) => set({ editorMode }),
      setFmPanelOpen: (fmPanelOpen) => set({ fmPanelOpen }),
      toggleFmPanel: () => set((s) => ({ fmPanelOpen: !s.fmPanelOpen })),
      toggleToc: () => set((s) => ({ tocOpen: !s.tocOpen })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setFmPos: (lang, pos) => set((s) => ({ fmPos: { ...s.fmPos, [lang]: pos } })),
      setSplitRatio: (splitRatio) => set({ splitRatio: Math.min(0.8, Math.max(0.2, splitRatio)) }),
      setAutosave: (autosave) => set({ autosave }),
      setAutosaveDelay: (autosaveDelay) =>
        set({ autosaveDelay: Math.min(10000, Math.max(250, autosaveDelay)) }),
      setSourceWrap: (sourceWrap) => set({ sourceWrap }),
      setSearch: (search) => set({ search }),
      setSort: (sort) => set({ sort }),
      setFilter: (filter) => set({ filter }),
      setAuthorFilter: (authorFilter) => set({ authorFilter }),
      select: (lang, slug) => set({ selected: { lang, slug } }),
      clearSelection: () => set({ selected: null }),
    }),
    {
      name: 'blog-writer-ui',
      version: 7,
      partialize: (s) => ({
        uiLang: s.uiLang,
        theme: s.theme,
        editorMode: s.editorMode,
        fmPanelOpen: s.fmPanelOpen,
        splitRatio: s.splitRatio,
        autosave: s.autosave,
        autosaveDelay: s.autosaveDelay,
        sourceWrap: s.sourceWrap,
        sidebarCollapsed: s.sidebarCollapsed,
        sort: s.sort,
        authorFilter: s.authorFilter,
      }),
      // v2 stored `bilingual: boolean` and modes `edit | split | preview`.
      // Migrate them into the new three-mode world.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const mode = p.editorMode as string | undefined;
        // v2 stored `bilingual: boolean` and modes `edit | split | preview`.
        // v3 collapses them into a single `editorMode`.
        const editorMode: EditorMode =
          version < 3
            ? mode === 'split' || mode === 'preview'
              ? 'split'
              : p.bilingual
                ? 'bilingual'
                : 'wysiwyg'
            : ((mode as EditorMode) ?? 'wysiwyg');
        return {
          uiLang: (p.uiLang as UiLang) ?? 'zh',
          theme: (p.theme as AppTheme) ?? 'auto',
          editorMode,
          fmPanelOpen: (p.fmPanelOpen as boolean) ?? false,
          splitRatio: (p.splitRatio as number) ?? 0.5,
          autosave: version >= 4 ? Boolean(p.autosave) : false,
          autosaveDelay: typeof p.autosaveDelay === 'number' ? p.autosaveDelay : 1000,
          sourceWrap: version >= 6 ? Boolean(p.sourceWrap) : false,
          sidebarCollapsed: typeof p.sidebarCollapsed === 'boolean' ? p.sidebarCollapsed : false,
          sort: (p.sort as SortMode) ?? 'date-desc',
          authorFilter: typeof p.authorFilter === 'string' ? p.authorFilter : '',
        };
      },
    },
  ),
);
