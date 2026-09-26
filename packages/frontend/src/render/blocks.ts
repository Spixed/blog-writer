/**
 * Top-level block splitter for the inline (Typora-style) editor.
 *
 * A block is a range of source lines that renders as one unit: paragraphs,
 * headings, lists, blockquotes, tables, fenced code, block math, shortcodes
 * and HTML blocks. Blank runs between blocks belong to the following block,
 * so the ranges tile the whole source. Ranges are half-open `[start, end)`
 * over `src.split('\n')`; CRLF sources keep the '\r' at the end of each line.
 *
 * The splitter is deliberately conservative: when unsure it *extends* a block
 * rather than splitting it, because a marker element inserted inside a
 * container (a list item, a blockquote) would corrupt the render.
 */
export interface BlockRange {
  start: number;
  end: number;
}

const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const HR = /^[ \t]*([-*_])\1{2,}[ \t]*$/;
/** A setext heading underline (`===` / `---`) is part of the paragraph above. */
const SETEXT = /^[ \t]*(-{3,}|={3,})[ \t]*$/;
/** An ATX heading always opens its own block: Goldmark never lets a paragraph
 * lazy-continue into one, so the splitter must not either (otherwise a list
 * swallows every heading and paragraph after it into one giant block). */
const ATX = /^[ \t]{0,3}#{1,6}(?:[ \t][^\n]*|[ \t]*)?$/;
const LIST_ITEM = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+/;
const QUOTE = /^[ \t]{0,3}>/;
const TABLE_SEP = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/;
const MATH_OPEN = /^[ \t]*\$\$/;
const MATH_BRACKET_OPEN = /^[ \t]*\\\[/;
const HTML_OPEN = /^[ \t]*<(?:[a-zA-Z][\w.-]*|!|\?|\/)/;
const SC_OPEN = /^[ \t]*\{\{[<%]/;

function isBlank(line: string): boolean {
  // A CRLF source splits into lines ending with '\r'; the lone '\r' of an
  // empty line is whitespace too.
  return /^[ \t]*\r?$/.test(line);
}

function fenceCloseFor(line: string): RegExp | null {
  const m = FENCE_OPEN.exec(line);
  if (!m) return null;
  const ch = m[1][0];
  return new RegExp(`^[ \\t]*${ch}{${m[1].length},}[ \\t]*\\r?$`);
}

/** Does `line` open a new block (rather than continuing the current one)? */
function startsBlock(line: string, nextLine?: string): boolean {
  if (FENCE_OPEN.test(line)) return true;
  if (HTML_OPEN.test(line)) return true;
  if (SC_OPEN.test(line)) return true;
  if (MATH_OPEN.test(line)) return true;
  if (MATH_BRACKET_OPEN.test(line)) return true;
  if (QUOTE.test(line)) return true;
  if (HR.test(line) && !SETEXT.test(line)) return true;
  if (ATX.test(line)) return true;
  if (LIST_ITEM.test(line)) return true;
  // A table needs a separator row right below the header.
  if (nextLine !== undefined && TABLE_SEP.test(nextLine) && line.includes('|')) return true;
  return false;
}

/** A shortcode tag that opens a *block* has a matching closer later on. */
function shortcodeBlockEnd(lines: string[], i: number): number {
  const open = /\{\{([<%])\s*([A-Za-z][\w-]*)/.exec(lines[i]);
  if (!open) return i + 1;
  const close = new RegExp(`\\{\\{${open[1]}\\s*/\\s*${open[2]}\\s*[>%]\\}`);
  for (let k = i + 1; k < lines.length; k++) {
    if (close.test(lines[k])) return k + 1;
  }
  return i + 1;
}

export function splitBlocks(src: string): BlockRange[] {
  const lines = src.split('\n');
  const blocks: BlockRange[] = [];
  let i = 0;

  while (i < lines.length) {
    const start = i;
    let j = i;
    while (j < lines.length && isBlank(lines[j])) j++;
    if (j >= lines.length) {
      blocks.push({ start, end: lines.length });
      break;
    }
    blocks.push({ start, end: consumeBlock(lines, j) });
    i = blocks[blocks.length - 1].end;
  }

  return blocks;
}

/** Returns the (exclusive) end line of the block whose content starts at `i`. */
function consumeBlock(lines: string[], i: number): number {
  const line = lines[i];

  // Fenced code: everything up to the matching closing fence.
  const close = fenceCloseFor(line);
  if (close) {
    let k = i + 1;
    while (k < lines.length && !close.test(lines[k])) k++;
    return k < lines.length ? k + 1 : k;
  }

  // Block math: $$…$$ or \[…\] (possibly multi-line).
  if (MATH_OPEN.test(line)) {
    if (line.slice(0, 2) === '$$' && line.indexOf('$$', 2) !== -1) return i + 1;
    let k = i + 1;
    while (k < lines.length && !lines[k].includes('$$')) k++;
    return k < lines.length ? k + 1 : k;
  }
  if (MATH_BRACKET_OPEN.test(line)) {
    let k = i + 1;
    while (k < lines.length && !lines[k].includes('\\]')) k++;
    return k < lines.length ? k + 1 : k;
  }

  // Block shortcode: {{% hl %}} … {{% /hl %}}.
  if (SC_OPEN.test(line)) {
    const tagEnd = shortcodeEndOnLine(line);
    if (tagEnd !== null) {
      // Self-contained on one line if a closer follows on the same line.
      const rest = line.slice(tagEnd);
      if (/\{\{[<%]\s*\/\s*[A-Za-z][\w-]*\s*[>%]\}/.test(rest)) return i + 1;
    }
    return shortcodeBlockEnd(lines, i);
  }

  // HTML block (incl. comments such as <!--more-->): until the blank line.
  if (HTML_OPEN.test(line)) {
    let k = i + 1;
    while (k < lines.length && !isBlank(lines[k])) k++;
    return k;
  }

  // List: items, their continuations and nested content stay together.
  const lm = LIST_ITEM.exec(line);
  if (lm) {
    const indent = lm[1].length;
    let k = i + 1;
    while (k < lines.length) {
      if (isBlank(lines[k])) {
        // A blank line keeps the list alive only if list content follows.
        let n = k + 1;
        while (n < lines.length && isBlank(lines[n])) n++;
        let keeps = false;
        if (n < lines.length) {
          const next = lines[n];
          const ind = next.length - next.trimStart().length;
          keeps =
            LIST_ITEM.test(next) ||
            QUOTE.test(next) ||
            ind >= indent + 2 ||
            !startsBlock(next, lines[n + 1]);
        }
        if (!keeps) break;
        k = n;
        continue;
      }
      if (LIST_ITEM.test(lines[k]) || QUOTE.test(lines[k])) {
        k++;
        continue;
      }
      const ind = lines[k].length - lines[k].trimStart().length;
      if (ind >= indent + 2) {
        k++;
        continue;
      }
      // Lazy continuation of the last item.
      if (!startsBlock(lines[k], lines[k + 1])) {
        k++;
        continue;
      }
      break;
    }
    return k;
  }

  // Blockquote: quote lines (with blank-separated paragraphs) and lazy
  // continuations stay together.
  if (QUOTE.test(line)) {
    let k = i + 1;
    while (k < lines.length) {
      if (QUOTE.test(lines[k])) {
        k++;
        continue;
      }
      if (isBlank(lines[k])) {
        let n = k + 1;
        while (n < lines.length && isBlank(lines[n])) n++;
        if (n < lines.length && QUOTE.test(lines[n])) {
          k = n;
          continue;
        }
        break;
      }
      // Lazy continuation of the last quoted paragraph.
      if (!startsBlock(lines[k], lines[k + 1])) {
        k++;
        continue;
      }
      break;
    }
    return k;
  }

  // Table: header + separator + rows.
  if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
    let k = i + 1;
    while (k < lines.length && lines[k].includes('|') && !isBlank(lines[k])) k++;
    return k;
  }

  // Paragraph: consumes setext underlines and lazy continuation lines.
  let k = i + 1;
  while (k < lines.length) {
    if (isBlank(lines[k])) break;
    if (SETEXT.test(lines[k])) {
      k++;
      continue;
    }
    if (startsBlock(lines[k], lines[k + 1])) break;
    k++;
  }
  return k;
}

function shortcodeEndOnLine(line: string): number | null {
  const start = line.indexOf('{{');
  if (start === -1) return null;
  const close = line[start + 2] === '%' ? '%}}' : '>}}';
  let inStr = false;
  for (let k = start + 3; k < line.length; k++) {
    if (line[k] === '"') inStr = !inStr;
    if (!inStr && line.startsWith(close, k)) return k + close.length;
  }
  return null;
}

/**
 * A single-line block whose rendered text is plain (no inline markup): it can
 * be edited as rendered text while the prefix (`## `, `> ` …) is preserved, so
 * the write-back only touches the text itself. Returns null when the block
 * must be edited as raw source.
 */
export interface SimpleText {
  prefix: string;
  text: string;
}

const PLAIN_TEXT_FORBIDDEN = /[*_~[\]()!<>{}|`$\\]/;

export function simpleTextBlock(lines: string[], b: BlockRange): SimpleText | null {
  // The block's leading blank lines belong to it, so the content line is the
  // first non-blank one; a text-editable block has exactly one.
  let ci = b.start;
  while (ci < b.end && isBlank(lines[ci])) ci++;
  if (ci >= b.end || b.end - ci !== 1) return null;
  const line = lines[ci];
  const head = /^(#{1,6})[ \t]+/.exec(line);
  const quote = /^>[ \t]?/.exec(line);
  const prefix = head ? head[0] : quote ? quote[0] : '';
  const text = line.slice(prefix.length).replace(/\r$/, '');
  if (!text || PLAIN_TEXT_FORBIDDEN.test(text)) return null;
  return { prefix, text };
}

/**
 * Replace just the rendered text of a block (heading or paragraph), leaving
 * the prefix, the blank lines around it and every other byte of the file
 * untouched. Only call this for blocks `simpleTextBlock` accepted.
 */
export function editBlockText(src: string, idx: number, newText: string): string {
  const lines = src.split('\n');
  const b = splitBlocks(src)[idx];
  if (!b) return src;
  const st = simpleTextBlock(lines, b);
  if (!st) return src; // not text-editable; the caller should use replaceBlock
  let ci = b.start;
  while (ci < b.end && isBlank(lines[ci])) ci++;
  // Whatever the user types is written verbatim; only line breaks are flattened
  // (a rendered text edit is a single line by construction).
  lines[ci] =
    `${st.prefix}${newText.replace(/\r?\n/g, ' ')}${lines[ci].endsWith('\r') ? '\r' : ''}`;
  return lines.join('\n');
}

/**
 * Splice a block's source out and put `next` in its place, keeping the
 * document's line endings. The caller decides what `next` is; because the
 * Markdown source is the single source of truth, untouched blocks are never
 * rewritten, so a no-op edit is byte-identical to the original file.
 */
export function replaceBlock(src: string, idx: number, next: string): string {
  const blocks = splitBlocks(src);
  const b = blocks[idx];
  if (!b) return src;
  const lines = src.split('\n');
  // Textarea values always use '\n', so the edit is re-encoded to the
  // document's line endings: in a CRLF file every newline must be '\r\n'
  // (the final line of the file has no newline at all and is left alone).
  const out = lines.slice(0, b.start).concat(next.split('\n'), lines.slice(b.end)).join('\n');
  return src.includes('\r\n') ? out.replace(/(?<!\r)\n/g, '\r\n') : out;
}
