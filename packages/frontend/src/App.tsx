import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './api/index.js';
import { Toaster } from './components/ui.js';
import { WorkspaceGate } from './features/posts/WorkspaceGate.js';
import { useActiveWorkspace, useConfig } from './hooks/queries.js';
import { MainShell } from './MainShell.js';
import { initRenderWorker } from './render/useRender.js';
import { useHugo } from './store/hugo.js';
import { useUI } from './store/ui.js';

export default function App() {
  const active = useActiveWorkspace();
  const config = useConfig();
  const theme = useUI((s) => s.theme);
  const uiLang = useUI((s) => s.uiLang);
  const qc = useQueryClient();

  // Resolve the persisted preference on every system colour-scheme change.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.setAttribute(
        'data-app-theme',
        theme === 'auto' ? (mq.matches ? 'dark' : 'light') : theme,
      );
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // Reflect the UI language on <html lang>.
  useEffect(() => {
    document.documentElement.lang = uiLang;
  }, [uiLang]);

  // The shared render worker serves both the preview pane and the WYSIWYG
  // raw-block node views; seed it with the site's qmoji mapping.
  useEffect(() => {
    if (config.data) initRenderWorker(config.data.qmojiMapping);
  }, [config.data]);

  // Watch the backend for external changes (git, Obsidian, other editors) and
  // Hugo subprocess output/status.
  useEffect(() => {
    const unsub = api.watch((e) => {
      if (e.type === 'config:change') {
        qc.invalidateQueries({ queryKey: ['config'] });
        qc.invalidateQueries({ queryKey: ['taxonomy'] });
        return;
      }
      if (e.type === 'hugo:output') {
        useHugo.getState().appendLine(e.line);
        return;
      }
      if (e.type === 'hugo:status') {
        useHugo.getState().syncStatus(e.running, e.url);
        return;
      }
      qc.invalidateQueries({ queryKey: ['posts', e.lang] });
      if (e.type === 'post:change' || e.type === 'post:add') {
        qc.invalidateQueries({ queryKey: ['post', e.lang, e.slug] });
      } else if (e.type === 'post:unlink') {
        qc.removeQueries({ queryKey: ['post', e.lang, e.slug] });
      }
    });
    return unsub;
  }, [qc]);

  if (active.isLoading) {
    return (
      <div className="app-shell">
        <div className="empty-state">
          <div className="glyph">…</div>
        </div>
      </div>
    );
  }

  if (!active.data) {
    return (
      <div className="app-shell">
        <WorkspaceGate />
        <Toaster />
      </div>
    );
  }

  if (config.error) {
    return (
      <div className="app-shell">
        <div className="empty-state">
          <div className="glyph">!</div>
          <div>{(config.error as Error).message}</div>
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <>
      <MainShell />
      <Toaster />
    </>
  );
}
