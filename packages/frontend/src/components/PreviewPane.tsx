/**
 * Faithful, read-only article preview: renders markdown in a Web Worker and
 * displays the result under `.theme-root` so the theme's extracted styles
 * apply. MathJax v4 and lottie-web are loaded lazily, mirroring how the theme
 * itself loads them (partials/mathjax.html, assets/js/main.js).
 *
 * The right half of split mode is view-only by design; WYSIWYG editing lives
 * in WysiwygEditor, which renders complex blocks through the same pipeline.
 */
import { useEffect, useRef } from 'react';
import { useConfig } from '../hooks/queries.js';
import { useResolvedTheme } from '../hooks/useResolvedTheme.js';
import { adjustDropCap, animateLottie, typesetMath } from '../render/external-scripts.js';
import { resolveMediaHtml } from '../render/media-url.js';
import { initRenderWorker, useRender } from '../render/useRender.js';

export interface PreviewPaneProps {
  source: string | undefined;
  /** Attach the scrolling container (used by the split-mode scroll sync). */
  scrollerRef?: (el: HTMLDivElement | null) => void;
  /** Fires with fresh HTML whenever the render changes. */
  onRendered?: (html: string) => void;
}

export function PreviewPane({ source, scrollerRef, onRendered }: PreviewPaneProps) {
  const { html, hasMath, loading, error, retry } = useRender(source);
  const config = useConfig();
  const theme = useResolvedTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;

  // Hand the qmoji mapping to the render worker as soon as it is known.
  useEffect(() => {
    if (config.data) initRenderWorker(config.data.qmojiMapping);
  }, [config.data]);

  // Announce a finished render so listeners can re-align (scroll sync).
  useEffect(() => {
    if (html) onRenderedRef.current?.(html);
  }, [html]);

  // Typeset math whenever the render changes.
  useEffect(() => {
    const el = rootRef.current;
    if (el && hasMath) typesetMath(el);
  }, [hasMath]);

  // Size the drop cap exactly like the theme's main.js, after layout settles.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    adjustDropCap(el);
  }, []);

  // Animate lottie qmoji exactly like the theme's main.js.
  useEffect(() => {
    const el = rootRef.current;
    if (el) return animateLottie(el);
  }, []);

  return (
    <div
      className="preview-scroll theme-root"
      data-theme={theme === 'dark' ? 'dark' : 'light'}
      ref={scrollerRef}
    >
      <div
        className="content preview-prose"
        data-theme={theme === 'dark' ? 'dark' : 'light'}
        ref={rootRef}
        dangerouslySetInnerHTML={{ __html: resolveMediaHtml(html) }}
      />
      {loading && <div className="preview-loading">rendering…</div>}
      {error && (
        <div className="preview-error" role="alert">
          {error}{' '}
          <button type="button" className="icon-btn" onClick={retry}>
            重新渲染
          </button>
        </div>
      )}
    </div>
  );
}
