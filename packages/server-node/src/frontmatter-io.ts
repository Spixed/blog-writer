import type { Frontmatter } from '@blog-writer/shared';
import { CANONICAL_FM_KEYS, formatDateField } from '@blog-writer/shared';
import yaml from 'js-yaml';

const FM_SPLIT_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface ParsedFile {
  raw: string;
  frontmatterRaw: string;
  frontmatter: Frontmatter;
  body: string;
  eol: '\n' | '\r\n';
  /** Whether the file had a front matter block at all. */
  hasFrontmatter: boolean;
}

export function detectEol(text: string): '\n' | '\r\n' {
  const i = text.indexOf('\n');
  if (i > 0 && text[i - 1] === '\r') return '\r\n';
  return '\n';
}

export function parseFile(raw: string): ParsedFile {
  const eol = detectEol(raw);
  const match = FM_SPLIT_RE.exec(raw);
  if (!match) {
    return { raw, frontmatterRaw: '', frontmatter: {}, body: raw, eol, hasFrontmatter: false };
  }
  const [, fmRaw, body] = match;
  let frontmatter: Frontmatter = {};
  try {
    const parsed = yaml.load(fmRaw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontmatter = parsed as Frontmatter;
    }
  } catch {
    // Keep raw text; the editor will surface the broken YAML for manual fixing.
    frontmatter = {};
  }
  return { raw, frontmatterRaw: fmRaw, frontmatter, body, eol, hasFrontmatter: true };
}

/** Structural equality that treats absent/undefined as equal and Dates by instant. */
export function fmEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    if (!(a instanceof Date) || !(b instanceof Date)) return false;
    return a.getTime() === b.getTime();
  }
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => fmEqual(v, b[i]));
  }
  const ak = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const bk = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ak.length !== bk.length) return false;
  return ak.every((k) =>
    fmEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

function sortKeys(fm: Frontmatter): string[] {
  const known = CANONICAL_FM_KEYS.filter((k) => fm[k] !== undefined);
  const unknown = Object.keys(fm)
    .filter((k) => !CANONICAL_FM_KEYS.includes(k) && fm[k] !== undefined)
    .sort();
  return [...known, ...unknown];
}

export function dumpFrontmatter(fm: Frontmatter): string {
  const offset = Number(process.env.BLOG_TZ_OFFSET_MINUTES ?? 480);
  const ordered: Record<string, unknown> = {};
  for (const key of sortKeys(fm)) ordered[key] = fm[key];
  return yaml.dump(ordered, {
    lineWidth: 0,
    noArrayIndent: false,
    quotingType: "'",
    replacer: (key: string, value: unknown) => {
      if (value instanceof Date) return formatDateField(value, offset);
      // Normalize ISO / loose date strings to Hugo's canonical format so that
      // JSON round-trips (Date -> ISO string) stay byte-stable.
      if (key === 'date' && typeof value === 'string' && value) {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return formatDateField(d, offset);
      }
      return value;
    },
  });
}

/**
 * Serialize a post. If the front matter is canonically unchanged (dates may be
 * Date or string on either side) we keep the original text verbatim so
 * untouched files produce zero diffs.
 */
export function dumpFile(
  parsed: ParsedFile,
  next: { frontmatter: Frontmatter; body: string },
): string {
  const eol = parsed.eol;
  const nextText = dumpFrontmatter(next.frontmatter);
  const fmText =
    parsed.hasFrontmatter && nextText === dumpFrontmatter(parsed.frontmatter)
      ? parsed.frontmatterRaw
      : nextText;
  // frontmatterRaw never ends with a newline (the closing fence consumed it),
  // so always emit one before the closing marker. The body capture already
  // excludes exactly one newline after the closing fence, so append as-is.
  const fmBlock = fmText.endsWith('\n') || fmText === '' ? fmText : `${fmText}\n`;
  const text = `---${eol}${fmBlock}---${eol}${next.body}`;
  return text.replace(/\r?\n/g, eol === '\r\n' ? '\r\n' : '\n');
}
