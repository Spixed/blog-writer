/**
 * Goldmark passthrough math extraction.
 *
 * hugo.toml enables goldmark.extensions.passthrough with block `$$…$$` /
 * `\[…\]` and inline `$…$` / `\(…\)`. The delimiters are replaced by empty
 * placeholder elements carrying the raw TeX in a data attribute; the preview
 * component fills them in and lets MathJax typeset them. Keeping the raw TeX
 * out of the markdown token stream prevents `a_b` from turning into `a<em>b</em>`.
 */
export interface MathResult {
  src: string;
  hasMath: boolean;
}

import { escapeHtml } from './escape.js';
import { extractFences } from './fences.js';

export function sourceHasMath(source: string): boolean {
  return extractMath(extractFences(source).src).hasMath;
}

export function extractMath(src: string): MathResult {
  let hasMath = false;

  const ph = (tex: string, display: boolean): string => {
    hasMath = true;
    const tag = display ? 'div' : 'span';
    return `<${tag} class="${display ? 'math-display' : 'math-inline'}" data-math="${escapeHtml(
      tex,
    )}"></${tag}>`;
  };

  const out = src
    .replace(/(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g, (_m, t: string) => ph(t, true))
    // `\[` / `\]` are block-level only in hugo.toml: the delimiter must open
    // the line (up to 3 spaces) and close it, otherwise it is a plain escape.
    .replace(/^[ \t]{0,3}\\\[([\s\S]+?)\\\][ \t]*$/gm, (_m, t: string) => ph(t, true))
    // `\( ... \)` is inline: it must open at a word boundary.
    .replace(/(^|[\s])\\\(([\s\S]+?)\\\)/g, (_m, pre: string, t: string) => pre + ph(t, false))
    .replace(/(?<!\\)\$([^\n$]+)(?<!\\)\$/g, (_m, t: string) => ph(t, false));

  return { src: out, hasMath };
}
