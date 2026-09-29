/**
 * `qmoji` — the theme's inline `{{< qq-emoji "微笑" >}}` shortcode as an inline
 * atom. It renders through the same worker pipeline the preview uses (img for
 * static/APNG emoji, lottie for the super ones), so it looks identical to the
 * blog; the raw source is re-derived from the node's attrs on the way out.
 *
 * Block-mode qmoji uses the same atom with a full-width presentation, keeping
 * surrounding prose independently editable. The toolbar edits name and mode.
 */

import { mergeAttributes, Node } from '@tiptap/core';
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { animateLottie } from '../../../render/external-scripts.js';
import { resolveMediaHtml } from '../../../render/media-url.js';
import { renderNow, useRenderWorkerRevision } from '../../../render/useRender.js';
import type { CommandCtx } from './commands.js';

/** Rebuild the shortcode source a qmoji node stands for. */
export function qmojiSource(name: string, mode: string): string {
  const clean = String(name ?? '').replace(/"/g, '');
  return mode === 'block' ? `{{< qq-emoji "${clean}" "block" >}}` : `{{< qq-emoji "${clean}" >}}`;
}

export const Qmoji = Node.create({
  name: 'qmoji',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: { default: '' },
      mode: { default: 'inline' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-qmoji]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-qmoji': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(QmojiView);
  },

  addCommands() {
    return {
      insertQmoji:
        (name: string) =>
        ({ commands }: CommandCtx) =>
          commands.insertContent({ type: this.name, attrs: { name, mode: 'inline' } }),
    };
  },
});

function QmojiView({ node, selected }: NodeViewProps) {
  const name = String(node.attrs.name ?? '');
  const mode = String(node.attrs.mode ?? 'inline');
  const source = qmojiSource(name, mode);
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [_attempt, setAttempt] = useState(0);
  const bodyRef = useRef<HTMLSpanElement>(null);
  // The emoji mapping reaches the render worker from the server config; if the
  // editor mounted before it arrived the first paint shows a placeholder, so
  // re-render once the config is in.
  const _workerRevision = useRenderWorkerRevision();

  // Re-render only when this emoji's own source changes.
  useEffect(() => {
    let cancelled = false;
    renderNow(source).then((msg) => {
      if (!cancelled) {
        setHtml(msg.html);
        setError(msg.error ?? '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // The shortcode renderer intentionally returns a paragraph/container for
  // normal Markdown output. That wrapper is invalid inside an inline NodeView
  // (`<span><p>…`) and makes ProseMirror insert separator paragraphs, which
  // in turn triggers drop-cap and scroll reflows. Keep only the rendered
  // payload inside the atom; block mode is represented as an inline-block atom
  // and is still independently selectable/editable.
  const safeHtml = useMemo(() => normalizeQmojiHtml(html, mode), [html, mode]);

  // Lottie emoji animate themselves; static ones are just <img>. The effect
  // must key on the rendered payload: at mount `html` is still empty (render
  // is async), so an empty-dep effect would find no [data-lottie-path] nodes.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) return animateLottie(el);
  }, [safeHtml]);

  return (
    <NodeViewWrapper
      as="span"
      className={`qmoji-atom qmoji-${mode}-atom${selected ? ' selected' : ''}`}
      title={name}
      contentEditable={false}
    >
      <span ref={bodyRef} dangerouslySetInnerHTML={{ __html: resolveMediaHtml(safeHtml) }} />
      {!html &&
        (error ? (
          <button
            type="button"
            className="qmoji-pending"
            title={error}
            onClick={() => setAttempt((n) => n + 1)}
          >
            重试 /{name}
          </button>
        ) : (
          <span className="qmoji-pending" aria-label={`Qmoji ${name}`}>
            /{name}
          </span>
        ))}
    </NodeViewWrapper>
  );
}

function normalizeQmojiHtml(html: string, mode: string): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  // Inline output is usually `<p><img …></p>`; unwrap all paragraph shells.
  if (mode !== 'block') {
    const paragraphs = [...root.querySelectorAll(':scope > p')];
    if (paragraphs.length) return paragraphs.map((p) => p.innerHTML).join('');
  }
  // Block output may be wrapped in a single paragraph or div. Keep the actual
  // image/Lottie element and avoid nesting a block element in a span.
  const block = root.querySelector(':scope > p, :scope > div');
  if (block && root.children.length === 1) return block.innerHTML;
  return root.innerHTML;
}
