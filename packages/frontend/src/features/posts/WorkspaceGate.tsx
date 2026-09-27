import { useState } from 'react';
import { canPickDirectory, pickDirectory, suggestName } from '../../api/native.js';
import { useAddWorkspace, useSetActiveWorkspace, useWorkspaces } from '../../hooks/queries.js';
import { useI18n } from '../../i18n/useI18n.js';

/**
 * Shown when no workspace has been chosen yet. The first run registers
 * D:\Projects\blog automatically if the server was started with BLOG_ROOT.
 */
export function WorkspaceGate() {
  const { t } = useI18n();
  const workspaces = useWorkspaces();
  const setActive = useSetActiveWorkspace();
  const add = useAddWorkspace();
  const [root, setRoot] = useState('');
  const [name, setName] = useState('default');
  const [err, setErr] = useState<string | null>(null);

  const busy = setActive.isPending || add.isPending;

  const handleBrowse = async () => {
    if (!canPickDirectory()) {
      setErr('当前环境没有可用的原生文件夹选择器，请使用 Electron 安装版。');
      return;
    }
    const picked = await pickDirectory();
    if (!picked) return;
    setRoot(picked);
    // Default the name to the folder's basename unless the user typed one.
    if (!name.trim() || name.trim() === 'default') setName(suggestName(picked));
  };

  const handleAdd = () => {
    setErr(null);
    if (!root.trim()) {
      setErr(t('workspaceDesc'));
      return;
    }
    add.mutate(
      { name: name.trim() || 'default', root: root.trim() },
      {
        onSuccess: (ws) => setActive.mutate(ws.name),
        onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
      },
    );
  };

  return (
    <div className="gate">
      <div className="card">
        <h1>{t('selectWorkspace')}</h1>
        <p>{t('workspaceDesc')}</p>
        {workspaces.data && workspaces.data.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {workspaces.data.map((ws) => (
              <button
                key={ws.name}
                className="icon-btn"
                style={{ justifyContent: 'space-between' }}
                disabled={busy}
                onClick={() => setActive.mutate(ws.name)}
              >
                <span>{ws.name}</span>
                <span style={{ fontFamily: 'var(--app-mono)', fontSize: 11, opacity: 0.6 }}>
                  {ws.root}
                </span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{
                flex: 1,
                border: '1px solid var(--app-border)',
                background: 'var(--app-bg)',
                borderRadius: 'var(--app-radius)',
                padding: '7px 9px',
                outline: 'none',
              }}
              placeholder="D:\Projects\blog"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
            />
            <button className="icon-btn" disabled={busy} onClick={handleBrowse}>
              浏览…
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{
                flex: 1,
                border: '1px solid var(--app-border)',
                background: 'var(--app-bg)',
                borderRadius: 'var(--app-radius)',
                padding: '7px 9px',
                outline: 'none',
              }}
              placeholder={t('name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="icon-btn primary" disabled={busy} onClick={handleAdd}>
              {t('add')}
            </button>
          </div>
          {err && <div style={{ color: 'var(--app-danger)', fontSize: 12 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}
