/**
 * Extract fenced code blocks before any other processing.
 *
 * Hugo shortcodes are not expanded inside code fences, and math delimiters
 * must not be touched there either, so fences are replaced by opaque
 * placeholders that survive markdown rendering. The highlighted HTML is
 * swapped back in afterwards (see renderFence in md.ts).
 */
export interface Fence {
  lang: string;
  code: string;
}

export interface FenceResult {
  src: string;
  fences: Fence[];
}

const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})(.*)\r?$/;

export function extractFences(src: string): FenceResult {
  const lines = src.split('\n');
  const out: string[] = [];
  const fences: Fence[] = [];

  let i = 0;
  while (i < lines.length) {
    const m = FENCE_OPEN.exec(lines[i]);
    if (!m) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const [, indent, marker] = m;
    // A closing fence uses the same character and is at least as long.
    const closeRe = new RegExp(`^[ \\t]*${marker[0]}{${marker.length},}[ \\t]*\\r?$`);

    const body: string[] = [];
    let closed = false;
    let j = i + 1;
    while (j < lines.length) {
      if (closeRe.test(lines[j])) {
        closed = true;
        break;
      }
      body.push(lines[j]);
      j++;
    }

    const lang = m[3].trim().split(/\s+/)[0] ?? '';
    const id = fences.length;
    // Goldmark strips a fenced block's own indentation (a fence inside a list
    // item is dedented by the item's content indent) before handing the code
    // to the highlighter, so the editor must do the same or every line keeps
    // its Markdown-structural indent and renders deeper than the blog.
    fences.push({ lang, code: dedent(body, indent).join('\n') });
    out.push(`${indent}<div data-fence="${id}"></div>`);
    i = closed ? j + 1 : j;
  }

  return { src: out.join('\n'), fences };
}

/** Remove up to `indent` leading spaces from every body line (spaces only: a
 * tab in the indent is too ambiguous to strip, and never occurs in practice). */
function dedent(body: string[], indent: string): string[] {
  const n = indent.length - indent.replace(/ /g, '').length;
  if (n === 0) return body;
  return body.map((line) => {
    let k = 0;
    while (k < n && k < line.length && line[k] === ' ') k++;
    return line.slice(k);
  });
}

/** Placeholder left in the markdown source for fence `id`. */
export function fencePlaceholder(id: number): string {
  return `<div data-fence="${id}"></div>`;
}

/**
 * Swap a fence placeholder for its highlighted HTML. The placeholder may keep
 * the original fence indentation (fences inside list items), so the match
 * tolerates leading spaces. A replacer function is used because fence bodies
 * can contain `$'` / `$&` sequences, which `String.replace` would otherwise
 * interpret as back-references and duplicate the rest of the document.
 */
export function replaceFencePlaceholder(html: string, id: number, fenceHtml: string): string {
  return html.replace(new RegExp(`[ \\t]*${fencePlaceholder(id)}`), () => fenceHtml);
}
