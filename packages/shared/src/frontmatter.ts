import type { Frontmatter } from './types.js';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'datetime'
  | 'boolean'
  | 'number'
  | 'multiselect'
  | 'select';

export interface FieldSchema {
  key: keyof Frontmatter | string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** Options for select/multiselect when static. */
  options?: string[];
  /** Sources options dynamically (server-provided taxonomy or authors). */
  optionsFrom?: 'categories' | 'tags' | 'authors';
  default?: unknown;
  group: 'basic' | 'classification' | 'advanced';
}

/**
 * Field order matches the blog archetype (archetypes/default.md), which is also
 * the canonical order used when serializing unknown front matter.
 */
export const FIELD_SCHEMA: FieldSchema[] = [
  {
    key: 'title',
    label: '标题',
    type: 'text',
    required: true,
    placeholder: '文章标题',
    group: 'basic',
  },
  {
    key: 'date',
    label: '发布日期',
    type: 'datetime',
    required: true,
    group: 'basic',
  },
  {
    key: 'description',
    label: '摘要描述',
    type: 'textarea',
    placeholder: '留空则取正文开头',
    group: 'basic',
  },
  { key: 'draft', label: '草稿', type: 'boolean', default: true, group: 'basic' },
  { key: 'author', label: '作者', type: 'select', optionsFrom: 'authors', group: 'basic' },
  { key: 'featured', label: '精选', type: 'boolean', default: false, group: 'basic' },
  {
    key: 'categories',
    label: '分类',
    type: 'multiselect',
    optionsFrom: 'categories',
    default: [],
    group: 'classification',
  },
  {
    key: 'tags',
    label: '标签',
    type: 'multiselect',
    optionsFrom: 'tags',
    default: [],
    group: 'classification',
  },
  {
    key: 'keywords',
    label: '关键词',
    type: 'multiselect',
    default: [],
    group: 'classification',
  },
  { key: 'weight', label: '权重', type: 'number', default: 0, group: 'advanced' },
];

export const FIELD_KEYS = FIELD_SCHEMA.map((f) => f.key);

/**
 * Canonical serialization order, matching archetypes/default.md.
 * Unknown fields are appended afterwards, sorted.
 */
export const CANONICAL_FM_KEYS = [
  'title',
  'date',
  'draft',
  'author',
  'featured',
  'description',
  'categories',
  'tags',
  'keywords',
  'weight',
];

/** Fields known to the form; anything else is preserved verbatim. */
export const isKnownField = (key: string): boolean => FIELD_KEYS.includes(key);

// ---- date helpers ------------------------------------------------------

const _DATE_FMT = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})?(?:([+-]\d{2}):?(\d{2}))?$/;

/** Blog timezone offset in minutes (UTC+8 by default). */
export const DEFAULT_TZ_OFFSET_MINUTES = 480;

/**
 * Hugo-style date string in the blog's timezone: "2024-02-13 16:34:38+08:00".
 *
 * Formatting uses a fixed offset (not the server's local timezone) so the
 * serialized value is stable across machines and matches Hugo's convention.
 */
export function formatDateField(
  value: Date | string | number,
  offsetMinutes = DEFAULT_TZ_OFFSET_MINUTES,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = shifted.getUTCFullYear();
  const mo = pad(shifted.getUTCMonth() + 1);
  const dd = pad(shifted.getUTCDate());
  const hh = pad(shifted.getUTCHours());
  const mi = pad(shifted.getUTCMinutes());
  const ss = pad(shifted.getUTCSeconds());
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const om = pad(Math.abs(offsetMinutes) % 60);
  return `${y}-${mo}-${dd} ${hh}:${mi}:${ss}${sign}${oh}:${om}`;
}

/** Parse a Hugo date string into a Date, or null if invalid. */
export function parseDateField(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DDTHH:mm" for <input type="datetime-local">, in local time. The
 *  year is zero-padded to four digits so intermediate states (a partially
 *  typed year in the picker) round-trip to a string the input still accepts. */
export function toDatetimeLocal(value: unknown): string | null {
  const d = parseDateField(value);
  if (!d) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = String(d.getFullYear()).padStart(4, '0');
  return `${year}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local string -> Hugo-style date string.
 *
 *  Parsed deterministically against the datetime-local shape instead of
 *  `new Date(local)`: V8's lenient parser mangles intermediate states while
 *  the user is mid-typing a segment (e.g. a zero-padded partial year like
 *  "0003-…" silently becomes an unrelated date). Years below 1000 are treated
 *  as an incomplete year segment and rejected — the field keeps its previous
 *  value and the picker re-syncs on blur. */
export function fromDatetimeLocal(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, dd, hh, mi, ss] = m;
  if (Number(y) < 1000) return null;
  // Same semantics as before: the picker's value is browser-local time, and
  // formatDateField serialises it into the blog's fixed +08:00 offset.
  const d = new Date(
    Number(y),
    Number(mo) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss ?? 0),
  );
  if (Number.isNaN(d.getTime())) return null;
  return formatDateField(d);
}

export interface ValidationError {
  field: string;
  /** Stable key the UI translates via i18n; `message` is the Chinese fallback. */
  code: string;
  message: string;
}

export function validateFrontmatter(fm: Frontmatter): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!fm.title || !String(fm.title).trim()) {
    errors.push({ field: 'title', code: 'titleRequired', message: '标题不能为空' });
  }
  const date = parseDateField(fm.date);
  if (!date) {
    errors.push({ field: 'date', code: 'dateInvalid', message: '日期格式无效' });
  }
  if (fm.weight !== undefined && typeof fm.weight !== 'number') {
    errors.push({ field: 'weight', code: 'weightInvalid', message: '权重必须是数字' });
  }
  return errors;
}

/** Build default front matter for a brand-new post (mirrors archetypes/default.md). */
export function defaultFrontmatter(now: Date = new Date()): Frontmatter {
  return {
    title: '',
    date: formatDateField(now),
    draft: true,
    author: 'spixed',
    featured: false,
    description: '',
    categories: [],
    tags: [],
    keywords: [],
    weight: 0,
  };
}

// ---- slug helpers ------------------------------------------------------

// Hugo (and the filesystem) accept any letter or digit, so slugs may contain
// Chinese, Greek (e.g. birthday_δ-me13), Cyrillic, etc. Only the ASCII
// punctuation that is unsafe in a filename is rejected.
const SLUG_RE = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;

export interface SlugError {
  code: string;
  message: string;
}

export function validateSlug(slug: string): SlugError | null {
  if (!slug) return { code: 'slugEmpty', message: '文件名不能为空' };
  if (slug.length > 100) return { code: 'slugTooLong', message: '文件名过长（最多 100 字符）' };
  if (!SLUG_RE.test(slug))
    return { code: 'slugInvalid', message: '文件名只能包含字母、数字、连字符或下划线' };
  if (/\.{2,}/.test(slug) || slug.includes('/') || slug.includes('\\'))
    return { code: 'slugInvalidChars', message: '文件名包含非法字符' };
  return null;
}

/** Title -> suggested slug (Hugo-style: lowercase, spaces to dashes). */
export function suggestSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
