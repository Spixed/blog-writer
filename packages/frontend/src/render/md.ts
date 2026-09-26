/**
 * Goldmark-compatible markdown rendering pipeline.
 *
 * hugo.toml: goldmark.renderer.unsafe = true, passthrough math delimiters,
 * tables (markdown-it built-in), linkify. The pipeline order mirrors what Hugo
 * does to a page body: fences and math are protected first, shortcodes are
 * resolved at the source level, then markdown runs, then placeholders are
 * swapped back with their fully rendered HTML.
 */

import type { QmojiEntry } from '@blog-writer/shared';
import type { MarkdownIt as Md } from 'markdown-it';
import MarkdownIt from 'markdown-it';
import { type BlockRange, splitBlocks } from './blocks.js';
import { escapeHtml } from './escape.js';
import { extractFences, type Fence, replaceFencePlaceholder } from './fences.js';
import { highlightCode } from './highlight.js';
import { extractMath } from './math.js';
import { figurePlugin, moreMarkerPlugin, tasklistPlugin } from './plugins.js';
import { rewriteShortcodes } from './shortcode.js';

export interface RenderContext {
  qmoji: QmojiEntry[];
}

export interface RenderOutput {
  html: string;
  hasMath: boolean;
}

export interface RenderOptions {
  /**
   * Insert invisible marker elements before every top-level block so the
   * inline editor can map rendered elements back to source ranges. Off by
   * default: markers are only needed by the editable preview.
   */
  markers?: boolean;
}

let mdInstance: Md | null = null;

function md(): Md {
  if (!mdInstance) {
    mdInstance = new MarkdownIt({
      html: true, // goldmark.renderer.unsafe
      linkify: true, // bare URLs -> links (matches the built site)
      typographer: false,
      breaks: false,
    });
    mdInstance.use(figurePlugin);
    mdInstance.use(moreMarkerPlugin);
    mdInstance.use(tasklistPlugin);
  }
  return mdInstance;
}

async function renderFence(fence: Fence): Promise<string> {
  const label = fence.lang
    ? `<div class="code-toolbar"><span class="code-lang">${escapeHtml(fence.lang.toUpperCase())}</span></div>`
    : '';
  const inner = await highlightCode(fence.lang, fence.code);
  return `<div class="code-container">${label}<div class="highlight">${inner}</div></div>`;
}

export async function renderSource(
  source: string,
  ctx: RenderContext,
  options: RenderOptions = {},
): Promise<RenderOutput> {
  const marked = options.markers ? withBlockMarkers(source) : source;
  const { src: s1, fences } = extractFences(marked);
  const { src: s2 } = extractMath(s1);
  const { src: s3, fragments } = rewriteShortcodes(s2, md(), ctx.qmoji);

  let html = md().render(s3);

  // Swap shortcode placeholders back in. Fragments may reference each other
  // (nested shortcodes), so loop until stable.
  let prev = '';
  let guard = 0;
  while (html !== prev && guard++ < 16) {
    prev = html;
    for (const [ph, frag] of fragments) {
      html = html.split(ph).join(frag);
    }
  }

  const hasMath = html.includes('data-math=');

  for (let i = 0; i < fences.length; i++) {
    html = replaceFencePlaceholder(html, i, await renderFence(fences[i]));
  }

  return { html, hasMath };
}

/**
 * Interleave marker elements between top-level blocks. A marker is a lone
 * `<p data-blk-marker="i">` line, which markdown-it passes through verbatim as
 * an HTML block (html: true, surrounded by blank lines). The preview hides
 * them with CSS and uses them to align rendered elements with source ranges.
 */
function withBlockMarkers(src: string): string {
  const blocks: BlockRange[] = splitBlocks(src);
  const lines = src.split('\n');
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    out.push('');
    out.push(`<p data-blk-marker="${i}"></p>`);
    out.push('');
    out.push(...lines.slice(blocks[i].start, blocks[i].end));
  }
  return out.join('\n');
}
