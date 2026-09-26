import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpenText, CheckCheck, CirclePlus, Keyboard, Monitor, Moon, PanelRightOpen, Redo2, Settings2, Sun, Trash2, Undo2 } from 'lucide-react';
import { api } from './api/index.js';
import {
  useActiveWorkspace,
  useAddWorkspace,
  useConfig,
  useSetActiveWorkspace,
  useWorkspaces,
} from './hooks/queries.js';
import { useUI } from './store/ui.js';
import type { AppTheme } from './store/ui.js';
import { useHugo } from './store/hugo.js';
import { isEditableTarget, useUndo } from './store/undo.js';
import { useI18n } from './i18n/useI18n.js';
import { formatCombo } from './platform.js';
import { useToasts, Dialog, DialogActions } from './components/ui.js';
import { ShortcutsDialog } from './components/ShortcutsDialog.js';
import { HugoPanel } from './components/HugoPanel.js';
import { PostList } from './features/posts/PostList.js';
import { NewPostDialog } from './features/posts/NewPostDialog.js';
import { EditorArea } from './features/editor/EditorArea.js';
import { SelectMenu } from './components/SelectMenu.js';
import type { SelectOption } from './components/SelectMenu.js';

const themeOptions: SelectOption<AppTheme>[] = [
  { value: 'auto', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色模式', icon: Sun },
  { value: 'dark', label: '深色模式', icon: Moon },
];

export function MainShell() {
  const { t, lang, setLang } = useI18n();
  const ui = useUI();
  const workspaces = useWorkspaces();
  const active = useActiveWorkspace();
  const setActive = useSetActiveWorkspace();
  const addWorkspace = useAddWorkspace();
  const config = useConfig();
  const toast = useToasts((s) => s.push);
  const hugoOpen = useHugo((s) => s.open);
  const openPanel = useHugo((s) => s.openPanel);
  const closePanel = useHugo((s) => s.closePanel);
  const canUndo = useUndo((s) => s.past.length > 0);
  const canRedo = useUndo((s) => s.future.length > 0);
  const undo = useUndo((s) => s.undo);
  const redo = useUndo((s) => s.redo);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [hugoOut, setHugoOut] = useState<null | { ok: boolean; output?: string; error?: string }>(null);
  const qc = useQueryClient();

  // Global undo/redo for document-level operations (delete/rename). Editing
  // surfaces keep their own history, so keystrokes inside them are left alone.
  // Mod+/ opens the shortcuts cheatsheet from anywhere.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen((open) => !open);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (isEditableTarget(e)) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (isEditableTarget(e)) return;
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const runBuild = async () => {
    // The validation output and the floating front-matter panel fight for the
    // top layer, so get the panel out of the way first.
    useUI.getState().setFmPanelOpen(false);
    try {
      const result = await api.hugo('build');
      setHugoOut(result);
    } catch (e) {
      toast(`${t('hugoError')}: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true"><BookOpenText size={21} strokeWidth={1.7} /></span>
          <span>Blog Writer<small>写作工作台</small></span>
        </span>
        <div className="workspace-cluster">
          <span className="workspace-caption">工作区</span>
          <SelectMenu className="workspace-picker" label="工作区" value={active.data?.name ?? ''} popoverWidth={270}
            disabled={setActive.isPending}
            options={(workspaces.data ?? []).map((ws) => ({ value: ws.name, label: ws.name, detail: ws.root }))}
            onChange={(name) => setActive.mutate(name, {
              onSuccess: () => ui.clearSelection(),
              onError: (error) => toast(`切换工作区失败：${error instanceof Error ? error.message : error}`),
            })} />
          <button className="icon-btn icon-only workspace-manage" onClick={() => setWorkspaceOpen(true)} title="管理工作区" aria-label="管理工作区"><Settings2 size={17} /></button>
        </div>
        {config.data && <span className="site-name" title={config.data.siteTitle}>{config.data.siteTitle}</span>}
        <div className="spacer" />
        <button
          className="icon-btn"
          onClick={() => setShortcutsOpen(true)}
          title={t('scTitle') + ` (${formatCombo('Mod+/')})`}
        >
          <Keyboard size={17} aria-hidden="true" />
        </button>
        <button
          className="icon-btn"
          disabled={!canUndo}
          onClick={() => undo()}
          title={`${t('undo')} (${formatCombo('Mod+Z')})`}
        >
          <Undo2 size={17} aria-hidden="true" />
        </button>
        <button
          className="icon-btn"
          disabled={!canRedo}
          onClick={() => redo()}
          title={`${t('redo')} (${formatCombo('Mod+Shift+Z')})`}
        >
          <Redo2 size={17} aria-hidden="true" />
        </button>
        <div className="seg" style={{ width: 86, flex: 'none' }} title={t('langTitle')}>
          <button className={lang === 'zh' ? 'active' : ''} onClick={() => setLang('zh')}>
            中文
          </button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
            EN
          </button>
        </div>
        <button className="icon-btn" onClick={runBuild} title={t('validate')}>
          <CheckCheck size={16} aria-hidden="true" />{t('validate')}
        </button>
        <button
          className={`icon-btn ${hugoOpen ? 'primary' : ''}`}
          onClick={() => {
            if (!hugoOpen) useUI.getState().setFmPanelOpen(false);
            hugoOpen ? closePanel() : openPanel();
          }}
          title={t('hugoPreview')}
        >
          <PanelRightOpen size={16} aria-hidden="true" />{t('hugoPreview')}
        </button>
        <SelectMenu className="theme-picker" label="界面外观" value={ui.theme} options={themeOptions} onChange={ui.setTheme} align="end" />
        <button className="icon-btn primary" onClick={() => setNewPostOpen(true)}>
          <CirclePlus size={16} aria-hidden="true" />{t('newPost')}
        </button>
      </header>
      <div className="app-body">
        <PostList />
        <EditorArea />
        {hugoOpen && <HugoPanel />}
      </div>
      {newPostOpen && (
        <NewPostDialog
          lang={ui.uiLang}
          onClose={() => setNewPostOpen(false)}
          onCreated={(slug) => {
            setNewPostOpen(false);
            ui.select(ui.uiLang, slug);
            qc.invalidateQueries({ queryKey: ['posts', ui.uiLang] });
          }}
        />
      )}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {workspaceOpen && (
        <Dialog title="管理工作区" onClose={() => setWorkspaceOpen(false)} width={520}>
          <div className="workspace-manager-list">
            {(workspaces.data ?? []).map((ws) => <div className="workspace-manager-row" key={ws.name}>
              <div><strong>{ws.name}</strong><small>{ws.root}</small></div>
              <button className="icon-btn danger" disabled={(workspaces.data?.length ?? 0) <= 1} title={`删除 ${ws.name}`} onClick={async () => {
                try {
                  await api.removeWorkspace(ws.name);
                  if (ws.name === active.data?.name) useUI.getState().clearSelection();
                  await qc.invalidateQueries();
                } catch (e) { setWorkspaceError(e instanceof Error ? e.message : String(e)); }
              }}><Trash2 size={15} aria-hidden="true" />删除</button>
            </div>)}
          </div>
          <form className="workspace-manager-form" onSubmit={(e) => {
            e.preventDefault(); setWorkspaceError('');
            addWorkspace.mutate({ name: workspaceName.trim(), root: workspaceRoot.trim() }, {
              onSuccess: () => { setWorkspaceName(''); setWorkspaceRoot(''); },
              onError: (error) => setWorkspaceError(error instanceof Error ? error.message : String(error)),
            });
          }}>
            <input aria-label="工作区名称" placeholder="工作区名称" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required />
            <input aria-label="博客路径" placeholder="博客根目录路径" value={workspaceRoot} onChange={(e) => setWorkspaceRoot(e.target.value)} required />
            <button className="icon-btn primary" disabled={addWorkspace.isPending} type="submit">添加工作区</button>
          </form>
          {workspaceError && <p className="workspace-error" role="alert">{workspaceError}</p>}
        </Dialog>
      )}
      {hugoOut && (
        <Dialog title={t('hugoPreview')} onClose={() => setHugoOut(null)} width={640}>
          <div style={{ marginBottom: 8, color: hugoOut.ok ? 'var(--app-success)' : 'var(--app-danger)' }}>
            {hugoOut.ok ? 'OK' : `${t('statusError')}${hugoOut.error ? `: ${hugoOut.error}` : ''}`}
          </div>
          <pre
            style={{
              maxHeight: 320,
              overflow: 'auto',
              background: 'var(--app-panel-2)',
              border: '1px solid var(--app-border)',
              borderRadius: 6,
              padding: 10,
              fontSize: 11,
              fontFamily: 'var(--app-mono)',
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {hugoOut.output ?? ''}
          </pre>
          <DialogActions>
            <button className="icon-btn" onClick={() => setHugoOut(null)}>
              {t('close')}
            </button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}
