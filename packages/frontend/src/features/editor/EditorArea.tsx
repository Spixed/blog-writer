/**
 * The editor: three modes — WYSIWYG (one Notion-style surface), split (plain
 * Markdown | live render, synced scroll) and bilingual (two WYSIWYG surfaces,
 * synced scroll). Front matter is a floating panel available in every mode.
 *
 * Per-language state (front matter, body, dirty, autosave) lives in
 * usePostEditor *above* the mode switch, so changing modes never drops edits.
 */
import { useState } from 'react';
import { Files, FilePenLine, ListTree, Save } from 'lucide-react';
import type { Frontmatter, Lang } from '@blog-writer/shared';
import { defaultFrontmatter } from '@blog-writer/shared';
import { EDITOR_MODES, useUI } from '../../store/ui.js';
import { usePostEditor } from './usePostEditor.js';
import type { PostEditor } from './usePostEditor.js';
import { WysiwygEditor } from './WysiwygEditor.js';
import { FrontmatterPanel } from './FrontmatterPanel.js';
import { PreviewPane } from '../../components/PreviewPane.js';
import { usePost, useWritePost } from '../../hooks/queries.js';
import { useI18n } from '../../i18n/useI18n.js';
import { useSyncScroll } from '../../hooks/useSyncScroll.js';
import { useToasts } from '../../components/ui.js';
import { MarkdownSourceEditor } from './MarkdownSourceEditor.js';

const OTHER_LANG: Record<Lang, Lang> = { zh: 'en', en: 'zh' };
const LANG_LABEL: Record<Lang, string> = { zh: '中文', en: 'English' };

type ScrollerReg = (id: string) => (el: HTMLElement | null) => void;

export function EditorArea() {
  const selected = useUI((s) => s.selected);
  if (!selected) return <EmptyState />;
  return (
    <EditorContent
      key={`${selected.lang}:${selected.slug}`}
      lang={selected.lang}
      slug={selected.slug}
    />
  );
}

function EditorContent({ lang, slug }: { lang: Lang; slug: string }) {
  const { t } = useI18n();
  const editorMode = useUI((s) => s.editorMode);
  const setEditorMode = useUI((s) => s.setEditorMode);
  const fmOpen = useUI((s) => s.fmPanelOpen);
  const toggleFm = useUI((s) => s.toggleFmPanel);
  const splitRatio = useUI((s) => s.splitRatio);
  const setSplitRatio = useUI((s) => s.setSplitRatio);
  const autosave = useUI((s) => s.autosave);
  const setAutosave = useUI((s) => s.setAutosave);
  const autosaveDelay = useUI((s) => s.autosaveDelay);
  const setAutosaveDelay = useUI((s) => s.setAutosaveDelay);

  // Both language versions are kept alive so flipping to bilingual (or
  // switching the content language) keeps unsaved edits.
  const zh = usePostEditor('zh', slug);
  const en = usePostEditor('en', slug);
  const editors: Record<Lang, PostEditor> = { zh, en };

  // Bilingual mode shares one sync hook across both panes.
  const bilingualSync = useSyncScroll(editorMode === 'bilingual', zh.body);

  return (
    <div className="editor-area">
      <div className="editor-header">
        <div className="document-heading"><span className="document-eyebrow">{lang === 'zh' ? '正在写作' : 'WRITING'}</span><strong>{String(editors[lang].fm.title || slug)}</strong><span className="slug">post/{slug}.md</span></div>
        <div style={{ flex: 1 }} />
        <div className="seg mode-seg" title={t('modeHint')}>
          {EDITOR_MODES.map((m) => (
            <button
              key={m}
              className={editorMode === m ? 'active' : ''}
              onClick={() => setEditorMode(m)}
              title={t('modeHint.' + m)}
            >
              {t('mode.' + m)}
            </button>
          ))}
        </div>
        <button
          className={'icon-btn ' + (fmOpen ? 'primary' : '')}
          onClick={toggleFm}
          title={t('fmPanel')}
        >
          {t('frontmatter')}
        </button>
        {autosave && (
          <label className="autosave-delay" title="自动保存延迟">
            <input aria-label="自动保存延迟" type="number" min={250} max={10000} step={250}
              value={autosaveDelay} onChange={(e) => setAutosaveDelay(Number(e.target.value) || 1000)} /> ms
          </label>
        )}
        <button
          className={'icon-btn autosave-toggle ' + (autosave ? 'primary' : '')}
          aria-pressed={autosave}
          onClick={() => setAutosave(!autosave)}
          title={t('autosaveToggle')}
        >
          {autosave ? t('autosaveOn') : t('autosaveOff')}
        </button>
      </div>
      {editorMode === 'split' ? (
        <SplitPane
          lang={lang}
          slug={slug}
          editor={editors[lang]}
          ratio={splitRatio}
          onRatio={setSplitRatio}
          fmOpen={fmOpen}
          onToggleFm={toggleFm}
        />
      ) : editorMode === 'bilingual' ? (
        <div className="bilingual-split">
          <WysiwygPane
            lang="zh"
            slug={slug}
            editor={zh}
            fmOpen={fmOpen}
            onToggleFm={toggleFm}
            register={bilingualSync.register}
          />
          <WysiwygPane
            lang="en"
            slug={slug}
            editor={en}
            fmOpen={fmOpen}
            onToggleFm={toggleFm}
            register={bilingualSync.register}
          />
        </div>
      ) : (
        <WysiwygPane
          lang={lang}
          slug={slug}
          editor={editors[lang]}
          fmOpen={fmOpen}
          onToggleFm={toggleFm}
        />
      )}
    </div>
  );
}

/** One language version shown as a WYSIWYG surface. */
function WysiwygPane({
  lang,
  slug,
  editor,
  fmOpen,
  onToggleFm,
  register,
}: {
  lang: Lang;
  slug: string;
  editor: PostEditor;
  fmOpen: boolean;
  onToggleFm: () => void;
  register?: ScrollerReg;
}) {
  const { t } = useI18n();
  const tocOpen = useUI((s) => s.tocOpen);
  const toggleToc = useUI((s) => s.toggleToc);

  if (!editor.exists) {
    return (
      <div className="pane">
        <PaneHead lang={lang} slug={slug} />
        <MissingPane lang={lang} slug={slug} />
      </div>
    );
  }

  return (
    <div className="pane">
      <PaneHead lang={lang} slug={slug}>
        {editor.dirty && <span className="dirty-dot" title={t('unsavedChanges')} />}
        <span className="save-state">{editor.dirty ? '有未保存修改' : '已与文件同步'}</span>
        {!editor.post?.frontmatterRaw && <span className="badge draft">{t('noFrontmatter')}</span>}
        <div style={{ flex: 1 }} />
        <button
          className={'icon-btn toc-toggle ' + (tocOpen ? 'primary' : '')}
          aria-pressed={tocOpen}
          onClick={toggleToc}
          title={t('tocPanel')}
        >
          <ListTree size={15} aria-hidden="true" />{t('tocPanel')}
        </button>
        <button
          className="icon-btn primary"
          disabled={!editor.dirty || editor.saving}
          onClick={() => editor.save()}
        >
          <Save size={15} aria-hidden="true" />{editor.saving ? t('saving') : t('save')}
        </button>
      </PaneHead>
      <WysiwygEditor
        value={editor.body}
        onChange={editor.setBody}
        scrollKey={`${lang}:${slug}`}
        scrollRef={register ? register(lang) : undefined}
      />
      {editor.conflict && <div className="editor-conflict" role="alert">文件已被外部修改。<button type="button" onClick={editor.discardLocal}>载入外部版本</button><span>保留本地修改并手动保存</span></div>}
      {fmOpen && (
        <FrontmatterPanel
          lang={lang}
          frontmatter={editor.fm}
          onChange={editor.setFm}
          onClose={onToggleFm}
          bilingual={register !== undefined}
        />
      )}
    </div>
  );
}

/** Plain Markdown on the left, the live render on the right, synced. */
function SplitPane({
  lang,
  slug,
  editor,
  ratio,
  onRatio,
  fmOpen,
  onToggleFm,
}: {
  lang: Lang;
  slug: string;
  editor: PostEditor;
  ratio: number;
  onRatio: (r: number) => void;
  fmOpen: boolean;
  onToggleFm: () => void;
}) {
  const { t } = useI18n();
  const [signal, setSignal] = useState(0);
  const { register } = useSyncScroll(true, signal);

  if (!editor.exists) {
    return (
      <div className="pane">
        <PaneHead lang={lang} slug={slug} />
        <MissingPane lang={lang} slug={slug} />
      </div>
    );
  }

  return (
    <div className="pane">
      <PaneHead lang={lang} slug={slug}>
        {editor.dirty && <span className="dirty-dot" title={t('unsavedChanges')} />}
        <span className="save-state">{editor.dirty ? '有未保存修改' : '已与文件同步'}</span>
        {!editor.post?.frontmatterRaw && <span className="badge draft">{t('noFrontmatter')}</span>}
        <div style={{ flex: 1 }} />
        <button
          className="icon-btn primary"
          disabled={!editor.dirty || editor.saving}
          onClick={() => editor.save()}
        >
          <Save size={15} aria-hidden="true" />{editor.saving ? t('saving') : t('save')}
        </button>
      </PaneHead>
      <div className="split-pane" style={{ '--split': ratio } as React.CSSProperties}>
        <div className="split-editor">
          <MarkdownSourceEditor
            value={editor.body}
            onChange={editor.setBody}
            placeholder={t('splitEditorHint')}
            scrollKey={`${lang}:${slug}`}
            scrollerRef={register('source')}
          />
        </div>
        <SplitDivider onRatio={onRatio} />
        <div className="split-preview">
          <PreviewPane
            source={editor.body}
            scrollerRef={register('render')}
            onRendered={() => setSignal((n) => n + 1)}
          />
        </div>
      </div>
      {editor.conflict && <div className="editor-conflict" role="alert">文件已被外部修改。<button type="button" onClick={editor.discardLocal}>载入外部版本</button><span>保留本地修改并手动保存</span></div>}
      {fmOpen && (
        <FrontmatterPanel
          lang={lang}
          frontmatter={editor.fm}
          onChange={editor.setFm}
          onClose={onToggleFm}
        />
      )}
    </div>
  );
}

function PaneHead({
  lang,
  slug,
  children,
}: {
  lang: Lang;
  slug: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="pane-head">
      <span className="badge">{LANG_LABEL[lang]}</span>
      <span className="slug">
        {lang}/post/{slug}.md
      </span>
      {children}
    </div>
  );
}

/** Shown when the selected post has no file in this language yet. */
function MissingPane({ lang, slug }: { lang: Lang; slug: string }) {
  const { t } = useI18n();
  const sibling = usePost(OTHER_LANG[lang], slug);
  const create = useWritePost();
  const toast = useToasts((s) => s.push);

  const createVersion = () => {
    // Seed metadata from the other language (date, author, taxonomies) but
    // leave the translatable text empty.
    const seed: Frontmatter = sibling.data
      ? { ...sibling.data.frontmatter }
      : defaultFrontmatter(new Date());
    delete seed.title;
    delete seed.description;
    create.mutate(
      { lang, slug, frontmatter: seed, body: '', create: true },
      {
        onSuccess: () => toast(t('created')),
        onError: (e) => toast(`${t('createFailed')}: ${e instanceof Error ? e.message : e}`),
      },
    );
  };

  return (
    <div className="empty-state">
      <div className="glyph"><Files size={30} strokeWidth={1.5} aria-hidden="true" /></div>
      <div>{t('missingVersion')}</div>
      <button className="icon-btn primary" disabled={create.isPending} onClick={createVersion}>
        {create.isPending ? t('creating') : t('createVersion')}
      </button>
    </div>
  );
}

function SplitDivider({ onRatio }: { onRatio: (r: number) => void }) {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const pane = e.currentTarget.parentElement;
    if (!pane) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const rect = pane.getBoundingClientRect();
      if (rect.width > 0) onRatio((ev.clientX - rect.left) / rect.width);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div className="split-divider" onPointerDown={onPointerDown} />;
}

function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="editor-area">
      <div className="empty-state">
        <div className="glyph"><FilePenLine size={30} strokeWidth={1.5} aria-hidden="true" /></div>
        <div>{t('selectPostHint')}</div>
      </div>
    </div>
  );
}
