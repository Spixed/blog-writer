import { useEffect, useRef } from 'react';
import { ExternalLink, RefreshCw, Square, X } from 'lucide-react';
import { useConfig } from '../hooks/queries.js';
import { useHugo } from '../store/hugo.js';
import { useUI } from '../store/ui.js';
import { useI18n } from '../i18n/useI18n.js';

/**
 * In-app Hugo preview: an iframe of the live `hugo server` output plus a
 * console of the server's stdout/stderr. The preview window and Hugo process
 * have separate close controls.
 */
export function HugoPanel() {
  const { t } = useI18n();
  const config = useConfig();
  const status = useHugo((s) => s.status);
  const url = useHugo((s) => s.url);
  const error = useHugo((s) => s.error);
  const lines = useHugo((s) => s.lines);
  const refreshKey = useHugo((s) => s.refreshKey);
  const closePanel = useHugo((s) => s.closePanel);
  const stopServer = useHugo((s) => s.stopServer);
  const refresh = useHugo((s) => s.refresh);
  const panelPos = useHugo((s) => s.panelPos);
  const setPanelPos = useHugo((s) => s.setPanelPos);
  const consoleRef = useRef<HTMLPreElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      const parent = panelRef.current?.parentElement;
      if (!parent) return;
      const bounds = parent.getBoundingClientRect();
      setPanelPos({
        x: Math.min(Math.max(0, bounds.width - 120), Math.max(0, event.clientX - bounds.left - drag.current.dx)),
        y: Math.min(Math.max(0, bounds.height - 48), Math.max(0, event.clientY - bounds.top - drag.current.dy)),
      });
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [setPanelPos]);

  const defaultLang = config.data?.defaultContentLanguage ?? 'zh';
  const selected = useUI((s) => s.selected);
  const previewPath = selected
    ? `${selected.lang === defaultLang ? '' : `/${selected.lang}`}/post/${selected.slug}/`
    : '/';

  const statusText =
    status === 'starting'
      ? t('statusStarting')
      : status === 'running'
        ? t('statusRunning')
        : status === 'error'
          ? t('statusError')
          : t('statusStopped');

  // Keep the console pinned to the latest line.
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const iframeSrc = url ? `${url.replace(/\/$/, '')}${previewPath}?bw=${refreshKey}` : null;

  return (
    <div className="hugo-panel" ref={panelRef} style={panelPos ? { left: panelPos.x, top: panelPos.y, right: 'auto', bottom: 'auto' } : undefined}>
      <div className="hugo-header" onPointerDown={(event) => {
        if (window.innerWidth <= 640 || (event.target as HTMLElement).closest('button,a')) return;
        const bounds = panelRef.current?.getBoundingClientRect();
        if (bounds) drag.current = { dx: event.clientX - bounds.left, dy: event.clientY - bounds.top };
      }}>
        <span className="hugo-title">{t('hugoPanelTitle')}</span>
        <span className={`badge ${status === 'running' ? 'featured' : status === 'error' ? 'draft' : ''}`}>
          {statusText}
        </span>
        {url && (
          <span className="hugo-url" title={url}>
            {url}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="icon-btn" onClick={refresh} disabled={!iframeSrc} title={t('refresh')}>
          <RefreshCw size={16} aria-hidden="true" />
        </button>
        {url && (
          <a
            className="icon-btn"
            href={iframeSrc ?? '#'}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} aria-hidden="true" />{t('openInBrowser')}
          </a>
        )}
        <button className="icon-btn danger" onClick={stopServer} title="停止 Hugo 服务并关闭窗口"><Square size={14} aria-hidden="true" />停止服务</button>
        <button className="icon-btn" onClick={closePanel} title={t('close')} aria-label={t('close')}><X size={17} aria-hidden="true" /></button>
      </div>
      <div className="hugo-body">
        {iframeSrc ? (
          <iframe className="hugo-iframe" src={iframeSrc} title="Hugo preview" />
        ) : (
          <div className="hugo-placeholder">
            <div className="glyph">{status === 'error' ? '!' : '…'}</div>
            {status === 'error' ? (
              <div>{error}</div>
            ) : (
              <div>{t('hugoHint')}</div>
            )}
          </div>
        )}
      </div>
      <details className="hugo-console" open>
        <summary>{t('hugoConsole')}</summary>
        <pre ref={consoleRef} className="hugo-console-pre">
          {lines.length ? lines.join('\n') : t('statusStarting')}
        </pre>
      </details>
    </div>
  );
}
