/**
 * `rawBlock`: a non-editable document island for everything the editor schema
 * does not model natively — tables, math, the three theme shortcodes, raw
 * HTML, task lists, indented fences.
 *
 * It stores the block's exact Markdown source, renders it with the same worker
 * pipeline the preview uses (so it looks identical to the blog, MathJax and
 * lottie included) and writes the source back verbatim. Double-click (or the
 * toolbar) opens an inline source editor; nothing else in the document is
 * touched.
 */
import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { renderNow, useRenderWorkerRevision } from '../../render/useRender.js';
import { animateLottie, typesetMath } from '../../render/external-scripts.js';
import { useI18n } from '../../i18n/useI18n.js';
import { modLabel } from '../../platform.js';
import { useResolvedTheme } from '../../hooks/useResolvedTheme.js';
import { resolveMediaHtml } from '../../render/media-url.js';

export const RawBlock = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-source') ?? '',
        renderHTML: (attrs) => ({ 'data-source': attrs.source }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-raw-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-raw-block': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawBlockView);
  },
});

function RawBlockView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { t } = useI18n();
  const theme = useResolvedTheme();
  const workerRevision = useRenderWorkerRevision();
  const source = String(node.attrs.source ?? '');
  const [html, setHtml] = useState('');
  const [renderError, setRenderError] = useState('');
  const [hasMath, setHasMath] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rendering, setRendering] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState(source);
  const bodyRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(source);
  }, [source]);

  // Re-render only this block when its own source changes.
  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    renderNow(source).then((msg) => {
      if (cancelled) return;
      setHtml(msg.html);
      setHasMath(msg.hasMath);
      setRenderError(msg.error ?? '');
      setRendering(false);
    });
    return () => {
      cancelled = true;
    };
  }, [source, workerRevision, attempt]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && hasMath && !editing) typesetMath(el);
  }, [html, hasMath, editing]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) return animateLottie(el);
  }, [html, editing]);

  useEffect(() => {
    if (editing) {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== source) updateAttributes({ source: draft });
  };

  const stop = (e: React.MouseEvent) => e.preventDefault();

  if (editing) {
    return (
      <NodeViewWrapper className="raw-block editing" contentEditable={false}>
        <textarea
          ref={taRef}
          className="raw-block-source"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(source);
              setEditing(false);
            }
            if (e.ctrlKey && e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        <div className="raw-block-hint">{t('rawBlockHint', { mod: modLabel() })}</div>
      </NodeViewWrapper>
    );
  }

  return (
      <NodeViewWrapper
        className={`raw-block${selected ? ' selected' : ''}`}
        contentEditable={false}
        data-source-length={source.length}
        data-render-error={renderError || undefined}
      >
      <div className="raw-block-toolbar" onMouseDown={stop}>
        <button title={t('editSource')} onMouseDown={stop} onClick={() => setEditing(true)}>
          <Pencil size={15} aria-hidden="true" />
        </button>
        <button title={t('delete')} onMouseDown={stop} onClick={() => deleteNode()}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
      <div
        className="raw-block-body theme-root"
        data-theme={theme === 'dark' ? 'dark' : 'light'}
      >
          <div
            className="content"
            ref={bodyRef}
            dangerouslySetInnerHTML={{ __html: resolveMediaHtml(html) }}
          />
          {rendering && !html && <div className="raw-block-placeholder"><span>渲染中</span><pre>{source}</pre></div>}
          {renderError && <div className="raw-block-error" role="alert">{renderError} <button type="button" onClick={() => setAttempt((n) => n + 1)}>重新渲染</button></div>}
      </div>
    </NodeViewWrapper>
  );
}
