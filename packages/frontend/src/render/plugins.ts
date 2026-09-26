/**
 * markdown-it plugins mirroring the theme's Goldmark render hooks:
 * - figurePlugin  -> layouts/_default/_markup/render-image.html
 * - moreMarker    -> <!--more--> summary divider (editor-only affordance)
 * - tasklistPlugin-> GFM task lists (theme styles ul.task-list)
 */
import type { MarkdownIt, Token } from 'markdown-it';
import { escapeHtml } from './escape.js';

/** Width/height query params -> inline style, mirroring render-image.html. */
function imageStyle(src: string): string {
  const qi = src.indexOf('?');
  if (qi === -1) return '';
  const q = new URLSearchParams(src.slice(qi + 1));
  const w = q.get('width');
  const h = q.get('height');
  let style = '';
  if (w) style += `width: ${/^\d+$/.test(w) ? `${w}px` : w};`;
  if (h) style += ` height: ${/^\d+$/.test(h) ? `${h}px` : h};`;
  return style.trim();
}

type TokenCtor = new (type: string, tag: string, nesting: 1 | 0 | -1) => Token;

function transformImages(children: Token[], Token: TokenCtor): Token[] {
  const out: Token[] = [];
  for (const child of children) {
    if (child.type !== 'image') {
      out.push(child);
      continue;
    }
    const src = String(child.attrGet('src') ?? '');
    const alt = String(child.content ?? '');
    const title = child.attrGet('title');
    const style = imageStyle(src);

    const open = new Token('figure_open', 'figure', 1);
    open.attrSet('class', 'image-figure');

    const img = new Token('html_inline', '', 0);
    img.content = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${
      title != null ? ` title="${escapeHtml(String(title))}"` : ''
    }${style ? ` style="${escapeHtml(style)}"` : ''} class="content-image" loading="lazy" />`;

    out.push(open, img);
    if (alt) {
      const cap = new Token('html_inline', '', 0);
      cap.content = `<figcaption>${escapeHtml(alt)}</figcaption>`;
      out.push(cap);
    }
    out.push(new Token('figure_close', 'figure', -1));
  }
  return out;
}

export function figurePlugin(md: MarkdownIt): void {
  // Must run after the `inline` core rule: image tokens only exist once the
  // paragraph's inline children have been parsed.
  md.core.ruler.after('inline', 'image_figure', (state) => {
    for (const tok of state.tokens) {
      if (tok.type === 'inline' && tok.children) {
        tok.children = transformImages(tok.children, state.Token as TokenCtor);
      }
    }
  });
}

export function moreMarkerPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'more_marker', (state) => {
    for (const tok of state.tokens) {
      if (
        (tok.type === 'html_block' || tok.type === 'html_inline') &&
        tok.content.trim() === '<!--more-->'
      ) {
        tok.content = '<div class="more-marker">MORE · 摘要分割线</div>';
      }
    }
  });
}

export function tasklistPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'tasklist', (state) => {
    const { tokens } = state;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'list_item_open') continue;
      const inline = tokens[i + 2];
      if (inline?.type !== 'inline' || !inline.children?.length) continue;
      const first = inline.children[0];
      if (first.type !== 'text') continue;
      const m = /^\[([ xX])\]\s*/.exec(first.content);
      if (!m) continue;

      first.content = first.content.slice(m[0].length);
      const box = new state.Token('html_inline', '', 0);
      box.content = `<input type="checkbox" disabled${m[1].toLowerCase() === 'x' ? ' checked' : ''}>`;
      inline.children.unshift(box);

      for (let j = i; j >= 0; j--) {
        if (tokens[j].type === 'bullet_list_open') {
          tokens[j].attrSet('class', 'task-list');
          break;
        }
      }
    }
  });
}
