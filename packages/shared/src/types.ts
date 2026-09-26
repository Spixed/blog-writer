/**
 * Core domain types shared between the frontend and every backend adapter
 * (Node server, Electron main process, Tauri commands).
 */

export type Lang = 'zh' | 'en';

export const LANGS: Lang[] = ['zh', 'en'];

/** Front matter as stored on disk. Unknown fields are preserved. */
export interface Frontmatter {
  title?: string;
  date?: string;
  draft?: boolean;
  author?: string;
  featured?: boolean;
  categories?: string[];
  tags?: string[];
  description?: string;
  weight?: number;
  keywords?: string[];
  [key: string]: unknown;
}

/** A single post file on disk (one language). */
export interface PostContent {
  slug: string;
  lang: Lang;
  /** Raw file content, front matter included (for dirty comparisons). */
  raw: string;
  /** Parsed front matter. */
  frontmatter: Frontmatter;
  /** Original front matter text (between the --- fences). */
  frontmatterRaw: string;
  /** Markdown body without front matter. */
  body: string;
  /** Absolute path on disk (backend only; frontend should not need it). */
  path?: string;
}

/** Lightweight metadata used in lists. */
export interface PostMeta {
  slug: string;
  lang: Lang;
  title: string;
  date: string;
  draft: boolean;
  featured: boolean;
  author?: string;
  categories: string[];
  tags: string[];
  description?: string;
  weight: number;
  /** Whether the paired-language version of this post exists. */
  hasPair: boolean;
  /** File size in bytes. */
  size: number;
  /** mtime in ms epoch. */
  modified: number;
}

export interface AuthorInfo {
  key: string;
  name: string;
  nickname?: string;
  avatar?: string;
  bio?: { en?: string; zh?: string };
  github?: string;
  email?: string;
  website?: string;
  weight?: number;
}

export interface QmojiEntry {
  emojiId: string;
  describe: string;
  /** 0 = static thumb, 1 = APNG, 2 = Lottie */
  emojiType: number;
}

export type MathEngine = 'mathjax' | 'katex';

export interface WorkspaceConfig {
  /** Absolute blog root. */
  root: string;
  /** Absolute content dir, e.g. <root>/content. */
  contentDir: string;
  /** Absolute theme dir, e.g. <root>/themes/polymer. */
  themeDir: string | null;
  themeName: string | null;
  siteTitle: string;
  defaultContentLanguage: Lang;
  mathEngine: MathEngine;
  math: boolean;
  authors: AuthorInfo[];
  defaultAuthor: string | null;
  qmojiMapping: QmojiEntry[];
  /** Taxonomy terms collected from all posts. */
  categories: string[];
  tags: string[];
}

export interface WorkspaceInfo {
  name: string;
  root: string;
}

export type WatchEvent =
  | { type: 'post:change'; lang: Lang; slug: string }
  | { type: 'post:add'; lang: Lang; slug: string }
  | { type: 'post:unlink'; lang: Lang; slug: string }
  | { type: 'config:change' }
  | { type: 'hugo:output'; line: string }
  | { type: 'hugo:status'; running: boolean; url?: string | null };

export interface MediaItem {
  name: string;
  /** Path relative to the static dir, e.g. "process/foo.png". */
  relPath: string;
  size: number;
  modified: number;
  url: string;
}

export interface HugoResult {
  ok: boolean;
  url?: string;
  output?: string;
  error?: string;
}

export interface ApiError {
  error: string;
}
