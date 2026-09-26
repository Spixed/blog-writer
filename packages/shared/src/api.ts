import type {
  HugoResult,
  Lang,
  MediaItem,
  PostContent,
  PostMeta,
  WatchEvent,
  WorkspaceConfig,
  WorkspaceInfo,
} from './types.js';

/**
 * Backend-agnostic workspace contract.
 *
 * Implementations:
 *  - Node server / Electron main process (HTTP + WebSocket)
 *  - Tauri (invoke)
 *  - (future) GPUI native shell
 *
 * The frontend talks exclusively through this interface, so switching shells
 * only means swapping the adapter.
 */
export interface WorkspaceApi {
  // ---- workspace -------------------------------------------------------
  listWorkspaces(): Promise<WorkspaceInfo[]>;
  addWorkspace(name: string, root: string): Promise<WorkspaceInfo>;
  removeWorkspace(name: string): Promise<void>;
  getActiveWorkspace(): Promise<WorkspaceInfo | null>;
  setActiveWorkspace(name: string): Promise<WorkspaceInfo>;
  /** Validate a directory looks like a Hugo site. */
  validateWorkspace(root: string): Promise<{ ok: boolean; error?: string }>;

  // ---- config ----------------------------------------------------------
  readConfig(): Promise<WorkspaceConfig>;

  // ---- posts -----------------------------------------------------------
  listPosts(lang: Lang): Promise<PostMeta[]>;
  readPost(lang: Lang, slug: string): Promise<PostContent>;
  writePost(
    lang: Lang,
    slug: string,
    data: { frontmatter: FrontmatterLike; body: string },
  ): Promise<void>;
  createPost(
    lang: Lang,
    slug: string,
    data: { frontmatter: FrontmatterLike; body: string },
  ): Promise<void>;
  renamePost(
    lang: Lang,
    slug: string,
    newSlug: string,
    opts?: { pair?: boolean },
  ): Promise<void>;
  deletePost(lang: Lang, slug: string, opts?: { pair?: boolean }): Promise<void>;
  /**
   * Restore a deleted post's exact bytes (Undo). Bypasses front matter
   * (de)serialization so the file comes back identical to what was deleted.
   */
  restorePost(lang: Lang, slug: string, raw: string): Promise<void>;

  // ---- taxonomy --------------------------------------------------------
  listTaxonomy(kind: 'categories' | 'tags'): Promise<string[]>;

  // ---- media -----------------------------------------------------------
  listMedia(relDir?: string): Promise<MediaItem[]>;
  uploadMedia(relDir: string, filename: string, data: ArrayBuffer): Promise<MediaItem>;
  deleteMedia(relPath: string): Promise<void>;

  // ---- hugo ------------------------------------------------------------
  hugo(action: 'serve' | 'build' | 'stop'): Promise<HugoResult>;

  // ---- watching --------------------------------------------------------
  watch(cb: (e: WatchEvent) => void): () => void;
}

/** Loose front matter accepted from the UI. */
export type FrontmatterLike = Record<string, unknown>;

export const isWorkspaceApi = (v: unknown): v is WorkspaceApi =>
  typeof v === 'object' && v !== null && 'listPosts' in v;
