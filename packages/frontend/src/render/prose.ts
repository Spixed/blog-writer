/**
 * Markdown <-> ProseMirror bridge for the WYSIWYG modes.
 *
 * The editor shows two kinds of top-level nodes:
 *  - *native* blocks (paragraph, heading, list, blockquote, code fence, rule)
 *    that ProseMirror edits directly, Notion-style;
 *  - `rawBlock` atoms for everything else (tables, math, the three theme
 *    shortcodes, raw HTML, task lists, indented fences): they carry their
 *    exact source, which the node view renders with the shared pipeline (so it
 *    looks identical to the blog) and which is written back verbatim.
 *
 * Native blocks are re-serialised canonically when the document changes; that
 * is inherent to WYSIWYG. The byte-exact round trip the project guarantees is
 * scoped to the plain-Markdown editor (split mode), where the source is never
 * touched by a converter.
 */
import MarkdownIt from 'markdown-it';
import type { MarkdownIt as Md, Token } from 'markdown-it';
import { splitBlocks } from './blocks.js';

export interface ProseMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface ProseNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
  marks?: ProseMark[];
  text?: string;
}
export interface ProseDoc extends ProseNode {
  type: 'doc';
}

const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const HTML_OPEN = /^[ \t]*<(?:[a-zA-Z][\w.-]*|!|\?|\/)/;
// CRLF sources keep a trailing '\r', which `$` would otherwise not match.
const TABLE_SEP = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*\r?$/;
const TASKLI = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\][ \t]+/;

let mdInstance: Md | null = null;

/**
 * Plain markdown-it: no figure/more/tasklist plugins (those blocks are raw
 * atoms). HTML tokens let table cells distinguish real <br> tags from escaped
 * text; unsupported HTML still falls back to a raw block.
 */
function md(): Md {
  if (!mdInstance) {
    mdInstance = new MarkdownIt({ html: true, linkify: true, breaks: false, typographer: false });
  }
  return mdInstance;
}

function isBlank(line: string): boolean {
  return /^[ \t]*\r?$/.test(line);
}

// ---- inline shortcode support -------------------------------------------
// `{{< qq-emoji … >}}`, `{{< ruby … >}}` and inline `{{% hl … %}}…{{% /hl %}}`
// are editable inline atoms/marks, so a block that contains only these stays a
// native prose block. Everything else shortcode-shaped is a raw block.

type InlinePart =
  | { kind: 'text'; value: string }
  | { kind: 'qmoji'; name: string; mode: string }
  | { kind: 'ruby'; text: string; rt: string }
  | { kind: 'math'; tex: string }
  | { kind: 'hl-open'; color: string }
  | { kind: 'hl-close' };

/** End index (exclusive) of the `{{ … }}` tag at `start`, honouring quotes. */
function findTagEnd(text: string, start: number): number {
  const close = text[start + 2] === '%' ? '%}}' : '>}}';
  let i = start + 3;
  let inStr = false;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') inStr = !inStr;
    if (!inStr && text.startsWith(close, i)) return i + close.length;
    i++;
  }
  return -1;
}

/** Hugo's `.Get N`: positional args, whitespace separated, quoted allowed. */
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

function parseTag(tag: string): { name: string; args: string[]; isClose: boolean } | null {
  const m = /^\{\{([<%])\s*(\/)?\s*([A-Za-z][\w-]*)\s*([\s\S]*?)\s*[>%]\}\}$/.exec(tag);
  if (!m) return null;
  return { name: m[3], args: tokenizeArgs(m[4]), isClose: m[2] === '/' };
}

/** A `{{ … }}` tag scanner that walks the whole string once. */
function* scanTags(text: string): Generator<{ start: number; end: number; tag: string }> {
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf('{{', i);
    if (at === -1) return;
    const end = findTagEnd(text, at);
    if (end === -1) {
      i = at + 2;
      continue;
    }
    yield { start: at, end, tag: text.slice(at, end) };
    i = end;
  }
}

/**
 * Does `src` contain a shortcode that must stay verbatim (a *block* one)?
 * Inline qq-emoji / ruby / single-line hl are fine; anything else is raw.
 */
function hasRawShortcode(src: string): boolean {
  const tags = [...scanTags(src)];
  for (let index = 0; index < tags.length; index++) {
    const { end, tag } = tags[index]!;
    const parsed = parseTag(tag);
    if (!parsed) return true;
    if (parsed.isClose) return true;
    if (parsed.name === 'qq-emoji') {
      const [name, mode] = parsed.args;
      // Block-mode qmoji is still an editable atom. Keeping it inside the
      // paragraph/list schema lets users select and replace the shortcode
      // instead of turning the whole surrounding list into one raw island.
      if (!name) return true;
      continue;
    }
    if (parsed.name === 'ruby') continue;
    if (parsed.name === 'hl') {
      // Inline only when a closer exists and the wrapped content is one line.
      let closeStart = -1;
      let closeEnd = end;
      for (const c of scanTags(src.slice(end))) {
        const cp = parseTag(c.tag);
        if (cp?.isClose && cp.name === 'hl') {
          closeStart = end + c.start;
          closeEnd = end + c.end;
          break;
        }
      }
      if (closeStart === -1) return true;
      if (src.slice(end, closeStart).includes('\n')) return true;
      // The matching closer belongs to this inline mark. Do not inspect it as
      // a new shortcode on the next iteration (which used to turn every valid
      // highlight paragraph into a rawBlock).
      while (index + 1 < tags.length && tags[index + 1]!.start < closeEnd) index++;
      continue;
    }
    return true; // unknown shortcode
  }
  return false;
}

/** Split a text run into literal text and the inline shortcodes it contains. */
function splitInline(text: string): InlinePart[] {
  const out: InlinePart[] = [];
  const pushText = (value: string) => {
    const re = /(?<!\\)\$([^\n$]+)(?<!\\)\$|\\\(([^\n]+?)\\\)/g;
    let lastMath = 0;
    for (const match of value.matchAll(re)) {
      const at = match.index ?? 0;
      if (at > lastMath) out.push({ kind: 'text', value: value.slice(lastMath, at) });
      out.push({ kind: 'math', tex: match[1] ?? match[2] ?? '' });
      lastMath = at + match[0].length;
    }
    if (lastMath < value.length) out.push({ kind: 'text', value: value.slice(lastMath) });
  };
  let last = 0;
  for (const { start, end, tag } of scanTags(text)) {
    const parsed = parseTag(tag);
    if (!parsed) continue;
    if (parsed.isClose) {
      if (parsed.name !== 'hl') continue;
      pushText(text.slice(last, start)); out.push({ kind: 'hl-close' });
    } else if (parsed.name === 'qq-emoji') {
      const [name, mode] = parsed.args;
      if (!name) continue;
      pushText(text.slice(last, start)); out.push({ kind: 'qmoji', name, mode: mode ?? 'inline' });
    } else if (parsed.name === 'ruby') {
      const [t, rt] = parsed.args;
      pushText(text.slice(last, start)); out.push({ kind: 'ruby', text: t ?? '', rt: rt ?? '' });
    } else if (parsed.name === 'hl') {
      pushText(text.slice(last, start)); out.push({ kind: 'hl-open', color: parsed.args[0] ?? '' });
    } else {
      continue; // unknown: keep as literal text
    }
    last = end;
  }
  if (last < text.length) pushText(text.slice(last));
  return out;
}

/** GFM cell alignment as markdown-it reports it (`text-align:center`). */
function cellAlign(token: Token): 'left' | 'center' | 'right' | null {
  const style = token.attrGet('style');
  if (!style) return null;
  const m = /text-align:\s*(left|center|right)/.exec(String(style));
  return m ? (m[1] as 'left' | 'center' | 'right') : null;
}

/** Strip the leading/trailing blank lines a block owns (splitBlocks convention). */
function trimBlankLines(src: string): string {
  const lines = src.split('\n');
  let a = 0;
  let b = lines.length;
  while (a < b && isBlank(lines[a])) a++;
  while (b > a && isBlank(lines[b - 1])) b--;
  return lines.slice(a, b).join('\n');
}

/**
 * A block that must survive verbatim: block shortcodes, math passthrough, raw
 * HTML, tables, task lists, or an indented fence (which cannot live at the top
 * level of the editor schema). Inline qmoji/ruby/hl are allowed in prose.
 */
function isRawBlock(src: string): boolean {
  if (hasRawShortcode(src)) return true;
  if (/(?<!\\)\$\$[\s\S]+?(?<!\\)\$\$|^[ \t]{0,3}\\\[[\s\S]+?\\\][ \t]*$/m.test(src)) return true;
  const lines = src.split('\n');
  for (const line of lines) {
    if (HTML_OPEN.test(line)) return true;
    if (TASKLI.test(line)) return true;
    // GFM allows a top-level table up to 3 spaces of indent, so only a deeply
    // indented one (nested in a list/blockquote, where it cannot live in the
    // schema) stays verbatim.
    if (line.includes('|') && TABLE_SEP.test(line) && /^[ \t]{4,}/.test(line)) return true;
  }
  const first = lines.find((l) => !isBlank(l)) ?? '';
  return FENCE_OPEN.test(first) && /^[ \t]/.test(first);
}

/** Collect tokens until the matching `close`, honouring nested _open/_close. */
function untilClose(tokens: Token[], i: number, close: string): [Token[], number] {
  const out: Token[] = [];
  let depth = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type.endsWith('_open')) depth++;
    else if (t.type.endsWith('_close')) {
      depth--;
      if (depth === 0) return [out, i + 1];
    }
    out.push(t);
    i++;
  }
  return [out, i];
}

function inlineNodes(tokens: Token[], marks: ProseMark[], tableCell = false): ProseNode[] | null {
  const out: ProseNode[] = [];
  const stack = [...marks];
  for (const t of tokens) {
    // markdown-it wraps block inline content in an `inline` container token;
    // its `.children` are the real marks/text.
    if (t.type === 'inline') {
      const kids = inlineNodes(t.children ?? [], stack, tableCell);
      if (kids === null) return null;
      out.push(...kids);
      continue;
    }
    switch (t.type) {
      case 'text': {
        // Inline shortcodes ride along as literal text; lift them
        // out here so qmoji/ruby become atoms and hl becomes a mark.
        for (const p of splitInline(t.content)) {
          if (p.kind === 'text') {
            if (p.value !== '') {
              out.push({ type: 'text', text: p.value, marks: stack.length ? [...stack] : undefined });
            }
          } else if (p.kind === 'qmoji') {
            out.push({ type: 'qmoji', attrs: { name: p.name, mode: p.mode } });
          } else if (p.kind === 'ruby') {
            out.push({ type: 'ruby', attrs: { rt: p.rt }, content: p.text ? [{ type: 'text', text: p.text }] : [] });
          } else if (p.kind === 'math') {
            out.push({ type: 'mathInline', attrs: { tex: p.tex } });
          } else if (p.kind === 'hl-open') {
            stack.push({ type: 'hl', attrs: { color: p.color } });
          } else if (p.kind === 'hl-close') {
            const li = stack.map((m) => m.type).lastIndexOf('hl');
            if (li === -1) return null; // stray closer: not editable
            stack.splice(li, 1);
          }
        }
        break;
      }
      case 'html_inline':
        if (!tableCell || !/^<br\s*\/?>$/i.test(t.content)) return null;
        out.push({ type: 'hardBreak' });
        break;
      case 'code_inline':
        out.push({ type: 'text', text: t.content, marks: [...stack, { type: 'code' }] });
        break;
      case 's_open':
        stack.push({ type: 'strike' });
        break;
      case 's_close':
        if (stack.at(-1)?.type === 'strike') stack.pop();
        break;
      case 'image':
        out.push({
          type: 'image',
          attrs: {
            src: String(t.attrGet('src') ?? ''),
            alt: t.content ?? '',
            title: t.attrGet('title') ?? '',
          },
        });
        break;
      // Goldmark renders a bare newline as a space; `  \n` is the only <br>.
      case 'softbreak':
        out.push({ type: 'text', text: ' ', marks: stack.length ? [...stack] : undefined });
        break;
      case 'hardbreak':
        out.push({ type: 'hardBreak' });
        break;
      case 'strong_open':
        stack.push({ type: 'bold' });
        break;
      case 'em_open':
        stack.push({ type: 'italic' });
        break;
      case 'link_open':
        stack.push({ type: 'link', attrs: { href: String(t.attrGet('href') ?? '') } });
        break;
      case 'strong_close':
      case 'em_close':
      case 'link_close':
        stack.pop();
        break;
      default:
        // html_inline, anything plugin-produced: not natively editable.
        return null;
    }
  }
  // An unterminated `{{% hl %}}` would wrap the rest of the document on
  // serialisation; refuse so the block keeps its verbatim raw form instead.
  if (stack.some((m) => m.type === 'hl')) return null;
  return out;
}

function parseBlocks(tokens: Token[]): ProseNode[] | null;
function parseBlocks(tokens: Token[], marks: ProseMark[]): ProseNode[] | null;
function parseBlocks(tokens: Token[], marks?: ProseMark[]): ProseNode[] | null {
  const base = marks ?? [];
  const out: ProseNode[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'paragraph_open') {
      const [inner, j] = untilClose(tokens, i + 1, 'paragraph_close');
      const kids = inlineNodes(inner, base);
      if (kids === null) return null;
      out.push({ type: 'paragraph', content: kids });
      i = j;
    } else if (t.type === 'heading_open') {
      const [inner, j] = untilClose(tokens, i + 1, 'heading_close');
      const kids = inlineNodes(inner, base);
      if (kids === null) return null;
      out.push({ type: 'heading', attrs: { level: Number(t.tag.slice(1)) }, content: kids });
      i = j;
    } else if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      const close = t.type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close';
      const [inner, j] = untilClose(tokens, i + 1, close);
      const kids = parseListItems(inner);
      if (kids === null) return null;
      out.push({
        type: t.type === 'bullet_list_open' ? 'bulletList' : 'orderedList',
        content: kids,
      });
      i = j;
    } else if (t.type === 'blockquote_open') {
      const [inner, j] = untilClose(tokens, i + 1, 'blockquote_close');
      const kids = parseBlocks(inner, base);
      if (kids === null) return null;
      out.push({ type: 'blockquote', content: kids });
      i = j;
    } else if (t.type === 'fence' || t.type === 'code_block') {
      const language = t.info ? t.info.trim().split(/\s+/)[0]! : '';
      out.push({
        type: 'codeBlock',
        attrs: { language },
        content: [{ type: 'text', text: t.content.replace(/\n$/, '') }],
      });
      i++;
    } else if (t.type === 'hr') {
      out.push({ type: 'horizontalRule' });
      i++;
    } else if (t.type === 'table_open') {
      const [inner, j] = untilClose(tokens, i + 1, 'table_close');
      const table = parseTable(inner);
      if (!table) return null;
      out.push(table);
      i = j;
    } else if (t.type === 'inline') {
      const kids = inlineNodes([t], base);
      if (kids === null) return null;
      if (kids.length) out.push({ type: 'paragraph', content: kids });
      i++;
    } else {
      return null; // html_block, table_open, math_block, … -> raw
    }
  }
  return out;
}

function parseListItems(tokens: Token[]): ProseNode[] | null {
  const out: ProseNode[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type !== 'list_item_open') return null;
    const [inner, j] = untilClose(tokens, i + 1, 'list_item_close');
    const kids = parseBlocks(inner);
    if (kids === null) return null;
    // listItem's schema is `paragraph block*`: an item starting with another
    // block (a nested table, a fence, …) cannot be represented, so keep the
    // whole list verbatim instead of corrupting it.
    if (kids.length > 0 && kids[0]!.type !== 'paragraph') return null;
    out.push({ type: 'listItem', content: kids });
    i = j;
  }
  return out;
}

/**
 * GFM table -> `table`/`tableRow`/`tableCell`/`tableHeader`. Alignment comes
 * from markdown-it's per-cell `style` (derived from the separator row) and is
 * stored on the header cells, which is enough to rebuild the separator.
 */
function parseTable(tokens: Token[]): ProseNode | null {
  const rows: ProseNode[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'thead_open' || t.type === 'tbody_open' || t.type === 'thead_close' || t.type === 'tbody_close') {
      i++;
      continue;
    }
    if (t.type !== 'tr_open') return null;
    const [inner, j] = untilClose(tokens, i + 1, 'tr_close');
    const cells: ProseNode[] = [];
    let k = 0;
    while (k < inner.length) {
      const c = inner[k];
      if (c.type !== 'th_open' && c.type !== 'td_open') {
        k++;
        continue;
      }
      const [cellInner, m] = untilClose(inner, k + 1, c.type === 'th_open' ? 'th_close' : 'td_close');
      const kids = inlineNodes(cellInner, [], true);
      if (kids === null) return null;
      const isHead = c.type === 'th_open';
      cells.push({
        type: isHead ? 'tableHeader' : 'tableCell',
        attrs: { align: cellAlign(c) },
        // A cell holds block content; a single paragraph keeps the round trip
        // clean (extra blocks join with `<br>` on serialisation).
        content: kids.length ? [{ type: 'paragraph', content: kids }] : [{ type: 'paragraph' }],
      });
      k = m;
    }
    if (!cells.length) return null;
    rows.push({ type: 'tableRow', content: cells });
    i = j;
  }
  if (!rows.length) return null;
  return { type: 'table', content: rows };
}

export function markdownToProse(body: string): ProseDoc {
  const lines = body.split('\n');
  const content: ProseNode[] = [];
  for (const b of splitBlocks(body)) {
    const src = lines.slice(b.start, b.end).join('\n');
    const source = trimBlankLines(src);
    if (!source) continue;
    if (isRawBlock(source)) {
      content.push({ type: 'rawBlock', attrs: { source } });
      continue;
    }
    const nodes = parseBlocks(md().parse(source, {}));
    if (!nodes || nodes.length === 0) {
      content.push({ type: 'rawBlock', attrs: { source } });
      continue;
    }
    content.push(...nodes);
  }
  if (content.length === 0) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}

// ---- serialisation ------------------------------------------------------

function scArg(v: string): string {
  return `"${String(v ?? '').replace(/"/g, '')}"`;
}

function inlineToMd(nodes: ProseNode[] = [], tableCell = false): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') {
        let s = n.text ?? '';
        if (tableCell && !n.marks?.some((mark) => mark.type === 'code'))
          s = s.replace(/<br\s*\/?>/gi, (tag) => `\\${tag}`);
        // Outermost first: the parse keeps marks in source order, so wrapping
        // them again in the same order round-trips.
        const marks = [...(n.marks ?? [])].sort((a, b) => markOrder(a.type) - markOrder(b.type));
        for (const m of marks) {
          if (m.type === 'bold') s = `**${s}**`;
          else if (m.type === 'italic') s = `*${s}*`;
          else if (m.type === 'code') s = `\`${s}\``;
          else if (m.type === 'strike') s = `~~${s}~~`;
          else if (m.type === 'link') s = `[${s}](${String(m.attrs?.href ?? '')})`;
          else if (m.type === 'hl') {
            const color = String(m.attrs?.color ?? '');
            s = `{{% hl${color ? ` ${scArg(color)}` : ''} %}}${s}{{% /hl %}}`;
          }
        }
        return s;
      }
      if (n.type === 'hardBreak') return tableCell ? '<br>' : '  \n';
      if (n.type === 'image') {
        const alt = String(n.attrs?.alt ?? '');
        const src = String(n.attrs?.src ?? '');
        const title = String(n.attrs?.title ?? '');
        return `![${alt}](${src}${title ? ` ${scArg(title)}` : ''})`;
      }
      if (n.type === 'qmoji') {
        const name = String(n.attrs?.name ?? '');
        const mode = String(n.attrs?.mode ?? 'inline');
        return mode === 'block'
          ? `{{< qq-emoji ${scArg(name)} "block" >}}`
          : `{{< qq-emoji ${scArg(name)} >}}`;
      }
      if (n.type === 'ruby')
        return `{{< ruby ${scArg((n.content ?? []).map((child) => child.text ?? '').join(''))} ${scArg(String(n.attrs?.rt ?? ''))} >}}`;
      if (n.type === 'mathInline') return `$${String(n.attrs?.tex ?? '')}$`;
      return '';
    })
    .join('');
}

function markOrder(type: string): number {
  // Apply inner marks first so the highest priority mark becomes the outer
  // shortcode wrapper and reparsing is deterministic.
  return ({ code: 1, strike: 2, bold: 3, italic: 4, link: 5, hl: 6 } as Record<string, number>)[type] ?? 10;
}

/** A table cell serialises its blocks to one line; extra blocks become `<br>`. */
function cellToMd(cell: ProseNode): string {
  return (cell.content ?? [])
    .map((b) => (b.type === 'paragraph' ? inlineToMd(b.content, true) : nodeToMd(b)))
    .join('<br>')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function tableToMd(table: ProseNode): string {
  const rows = table.content ?? [];
  const head = rows[0];
  const colCount = Math.max(...rows.map((r) => r.content?.length ?? 0), 1);
  const sep = (head?.content ?? [])
    .concat(Array(Math.max(0, colCount - (head?.content?.length ?? 0))).fill(null))
    .map((c: ProseNode | null) => {
      const a = c?.attrs?.align;
      if (a === 'center') return ':---:';
      if (a === 'right') return '---:';
      return '---';
    });
  const line = (cells: ProseNode[]) =>
    `| ${Array.from({ length: colCount }, (_, i) => cellToMd(cells[i] ?? { type: 'tableCell' })).join(' | ')} |`;
  const out = [line(head.content ?? []), `| ${sep.join(' | ')} |`];
  for (const row of rows.slice(1)) out.push(line(row.content ?? []));
  return out.join('\n');
}

function listItemToMd(item: ProseNode, marker: string, indent: string): string {
  const lines: string[] = [];
  let num = 0;
  for (const kid of item.content ?? []) {
    if (kid.type === 'bulletList') {
      for (const li of kid.content ?? []) lines.push(listItemToMd(li, '- ', `${indent}  `));
    } else if (kid.type === 'orderedList') {
      for (const li of kid.content ?? []) lines.push(listItemToMd(li, `${++num}. `, `${indent}  `));
    } else {
      const text = nodeToMd(kid);
      const parts = text.split('\n');
      lines.push(`${indent}${marker}${parts[0]}`);
      for (let k = 1; k < parts.length; k++) lines.push(`${indent}${' '.repeat(marker.length)}${parts[k]}`);
    }
  }
  return lines.join('\n');
}

function nodeToMd(n: ProseNode): string {
  switch (n.type) {
    case 'paragraph':
      return inlineToMd(n.content);
    case 'heading':
      return `${'#'.repeat(Math.max(1, Math.min(6, Number(n.attrs?.level ?? 1))))} ${inlineToMd(n.content)}`;
    case 'horizontalRule':
      return '---';
    case 'codeBlock': {
      const lang = String(n.attrs?.language ?? '');
      const code = (n.content ?? []).map((c) => c.text ?? '').join('').replace(/\n$/, '');
      return '```' + lang + '\n' + code + '\n```';
    }
    case 'bulletList':
      return (n.content ?? []).map((li) => listItemToMd(li, '- ', '')).join('\n');
    case 'orderedList':
      return (n.content ?? []).map((li, i) => listItemToMd(li, `${i + 1}. `, '')).join('\n');
    case 'blockquote': {
      const inner = (n.content ?? []).map(nodeToMd).join('\n\n');
      return inner
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    }
    case 'rawBlock':
      return String(n.attrs?.source ?? '');
    case 'table':
      return tableToMd(n);
    default:
      return '';
  }
}

export function proseToMarkdown(doc: ProseNode): string {
  const body = (doc.content ?? []).map(nodeToMd).filter((s) => s !== '').join('\n\n');
  return body ? `${body}\n` : '';
}
