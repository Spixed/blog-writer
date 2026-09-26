/**
 * Hugo shortcode rewriting (themes/polymer/layouts/shortcodes).
 *
 * Shortcodes are resolved at the source level, before markdown runs, because
 * markdown would escape the `<` in `{{< … >}}`. Each resolved call is replaced
 * by an opaque placeholder element (`<span data-scph="N">` for inline output,
 * `<div data-scph="N">` for block output) that markdown passes through verbatim;
 * the rendered HTML is swapped back in after rendering.
 *
 * Output mirrors the Go templates exactly (same classes, same inline styles).
 */

import type { QmojiEntry } from '@blog-writer/shared';
import { HL_COLOR_MAP, normalizeQmojiName, qmojiUrl } from '@blog-writer/shared';
import type { MarkdownIt } from 'markdown-it';
import { escapeHtml } from './escape.js';

export interface RewriteResult {
  src: string;
  /** placeholder element -> rendered shortcode HTML */
  fragments: Map<string, string>;
}

const HL_CLOSE_RE = /\{\{[<%]\s*\/\s*hl\s*[>%]\}\}/;

function findTagEnd(src: string, start: number): number {
  // `{{<` / `{{%`: the delimiter character sits at start+2.
  const close = src[start + 2] === '%' ? '%}}' : '>}}';
  let i = start + 3;
  let inStr = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') inStr = !inStr;
    if (!inStr && src.startsWith(close, i)) return i + close.length;
    i++;
  }
  return -1;
}

/** Hugo's `.Get N`: positional args, whitespace separated, quoted strings allowed. */
function tokenizeArgs(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '"') {
      const end = s.indexOf('"', i + 1);
      if (end === -1) {
        out.push(s.slice(i + 1));
        break;
      }
      out.push(s.slice(i + 1, end));
      i = end + 1;
    } else {
      let j = i;
      while (j < s.length && !/\s/.test(s[j])) j++;
      out.push(s.slice(i, j));
      i = j;
    }
  }
  return out;
}

export function rewriteShortcodes(src: string, md: MarkdownIt, qmoji: QmojiEntry[]): RewriteResult {
  const fragments = new Map<string, string>();
  let uid = 0;

  const placeholder = (html: string, block: boolean): string => {
    const tag = block ? 'div' : 'span';
    const ph = `<${tag} data-scph="sc${uid++}"></${tag}>`;
    fragments.set(ph, html);
    return ph;
  };

  const renderQmoji = (args: string[]): string => {
    const name = args[0];
    if (!name) return '<span class="qq-emoji-error">❌ 请提供表情名称</span>';
    const mode = args[1] ?? 'inline';
    const entry = qmoji.find((e) => e.describe === normalizeQmojiName(name));
    if (!entry) return `<span class="qq-emoji-error">(未找到表情: ${escapeHtml(name)})</span>`;

    const url = qmojiUrl(entry);
    const cls = `qmoji qmoji-${mode}`;
    const open = mode === 'block' ? '<div class="qmoji-container-block">' : '';
    const close = mode === 'block' ? '</div>' : '';
    const alt = escapeHtml(entry.describe);

    if (entry.emojiType === 1) {
      return `${open}<img src="${url}" class="${cls}" alt="${alt}" title="${alt}" />${close}`;
    }
    if (entry.emojiType === 2) {
      const id = `lottie-emoji-${entry.emojiId}-${uid++}`;
      return `${open}<span id="${id}" class="super-qmoji qmoji-lottie ${cls}" data-lottie-path="${url}" title="${alt}"></span>${close}`;
    }
    return `${open}<img src="${url}" class="${cls}" alt="${alt}" title="${alt}" />${close}`;
  };

  const renderRuby = (args: string[]): string => {
    const text = args[0] ?? '';
    const rt = args[1] ?? '';
    return `<ruby>${escapeHtml(text)}<rt>${escapeHtml(rt)}</rt></ruby>`;
  };

  const renderHl = (args: string[], inner: string, isBlock: boolean): string => {
    const color = HL_COLOR_MAP[args[0] ?? ''] ?? '#2979FF';
    // `.Inner | markdownify`, recursively resolving shortcodes first.
    const innerHtml = isBlock ? md.render(rewrite(inner)) : md.renderInline(rewrite(inner));
    if (isBlock) {
      return `<div class="hl-shortcode-block" style="color: ${color}; font-weight: bold; border-left: 4px solid ${color}; padding-left: 1rem; margin: 1rem 0;">${innerHtml}</div>`;
    }
    return `<span class="hl-shortcode" style="color: ${color}; font-weight: bold;">${innerHtml}</span>`;
  };

  const rewrite = (text: string): string => {
    // Fresh regex per call: rewrite() recurses for nested shortcodes and a
    // shared global regex would clobber lastIndex across recursion levels.
    const callRe = /\{\{[<%]\s*([A-Za-z][\w-]*)/g;
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(text))) {
      const name = m[1];
      const tagEnd = findTagEnd(text, m.index);
      if (tagEnd === -1) continue;

      const args = tokenizeArgs(text.slice(m.index + m[0].length, tagEnd - 3).trim());

      if (name === 'qq-emoji') {
        out += text.slice(last, m.index) + placeholder(renderQmoji(args), args[1] === 'block');
        last = tagEnd;
        continue;
      }
      if (name === 'ruby') {
        out += text.slice(last, m.index) + placeholder(renderRuby(args), false);
        last = tagEnd;
        continue;
      }
      if (name === 'hl') {
        const close = HL_CLOSE_RE.exec(text.slice(tagEnd));
        if (close) {
          const inner = text.slice(tagEnd, tagEnd + close.index);
          const isBlock = inner.includes('\n'); // findRE "\n" .Inner
          out += text.slice(last, m.index) + placeholder(renderHl(args, inner, isBlock), isBlock);
          last = tagEnd + close.index + close[0].length;
          continue;
        }
      }

      // Unknown shortcode: keep it visible instead of letting markdown mangle it.
      out +=
        text.slice(last, m.index) +
        placeholder(
          `<span class="shortcode-unknown">${escapeHtml(text.slice(m.index, tagEnd))}</span>`,
          false,
        );
      last = tagEnd;
    }
    return out + text.slice(last);
  };

  return { src: rewrite(src), fragments };
}
