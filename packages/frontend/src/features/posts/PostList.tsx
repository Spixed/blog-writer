import type { Lang, PostMeta } from '@blog-writer/shared';
import { PanelLeftClose, PanelLeftOpen, Star } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { SelectMenu } from '../../components/SelectMenu.js';
import { useConfig, usePosts } from '../../hooks/queries.js';
import { useI18n } from '../../i18n/useI18n.js';
import type { SortMode } from '../../store/ui.js';
import { useUI } from '../../store/ui.js';
import {
  DeleteDialog,
  type MenuState,
  PostContextMenu,
  RenameDialog,
} from '../editor/PostContextMenu.js';

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function PostList() {
  const { t, lang } = useI18n();
  const search = useUI((s) => s.search);
  const sort = useUI((s) => s.sort);
  const filter = useUI((s) => s.filter);
  const authorFilter = useUI((s) => s.authorFilter);
  const setSearch = useUI((s) => s.setSearch);
  const setSort = useUI((s) => s.setSort);
  const setFilter = useUI((s) => s.setFilter);
  const setAuthorFilter = useUI((s) => s.setAuthorFilter);
  const selected = useUI((s) => s.selected);
  const select = useUI((s) => s.select);
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const config = useConfig();
  const posts = usePosts(lang);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<MenuState | null>(null);
  const [deleting, setDeleting] = useState<MenuState | null>(null);

  const items = posts.data ?? [];
  const authors = [
    ...new Set(items.map((p) => p.author).filter((author): author is string => Boolean(author))),
  ].sort();
  // authors.toml maps the front-matter key to a display name; show
  // "名称(编号)" and fall back to the bare key when unmapped.
  const authorName = (key: string): string => {
    const info = config.data?.authors.find((a) => a.key === key);
    return info ? `${info.nickname ?? info.name}(${key})` : key;
  };
  useEffect(() => {
    if (posts.data && authorFilter && !authors.includes(authorFilter)) setAuthorFilter('');
  }, [posts.data, authorFilter, setAuthorFilter, authors.includes]);
  const q = search.trim().toLowerCase();
  const filtered = items
    .filter((p) => {
      if (q && !(p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)))
        return false;
      if (filter === 'draft' && !p.draft) return false;
      if (filter === 'published' && p.draft) return false;
      if (filter === 'featured' && !p.featured) return false;
      if (authorFilter && p.author !== authorFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'date-asc') return a.date.localeCompare(b.date);
      if (sort === 'title-asc') return a.title.localeCompare(b.title, lang);
      return b.date.localeCompare(a.date);
    });

  const onContextMenu = (e: React.MouseEvent, p: PostMeta) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, lang: p.lang, slug: p.slug });
  };

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-heading">
        <button
          type="button"
          className="icon-btn icon-only sidebar-toggle"
          title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          aria-expanded={!collapsed}
          onClick={toggleSidebar}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={16} aria-hidden="true" />
          )}
        </button>
        {!collapsed && (
          <>
            <div>
              <small>LIBRARY</small>
              <strong>{lang === 'zh' ? '文章' : 'Articles'}</strong>
            </div>
            <span>{String(filtered.length).padStart(2, '0')}</span>
          </>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="sidebar-toolbar">
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="filter-row">
              <SelectMenu
                label="排序"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'date-desc' as SortMode, label: t('sortDateDesc') },
                  { value: 'date-asc' as SortMode, label: t('sortDateAsc') },
                  { value: 'title-asc' as SortMode, label: t('sortTitle') },
                ]}
              />
              <SelectMenu
                label="作者筛选"
                value={authorFilter}
                onChange={setAuthorFilter}
                options={[
                  { value: '', label: '全部作者' },
                  ...authors.map((author) => ({ value: author, label: authorName(author) })),
                ]}
              />
            </div>
            <div className="seg">
              {(['all', 'published', 'draft', 'featured'] as const).map((f) => (
                <button
                  key={f}
                  className={filter === f ? 'active' : ''}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all'
                    ? t('filterAll')
                    : f === 'published'
                      ? t('filterPublished')
                      : f === 'draft'
                        ? t('filterDraft')
                        : t('filterFeatured')}
                </button>
              ))}
            </div>
          </div>
          <div className="post-list">
            {posts.isLoading && (
              <div style={{ padding: 12, color: 'var(--app-text-muted)' }}>{t('loading')}</div>
            )}
            {posts.error && (
              <div style={{ padding: 12, color: 'var(--app-danger)' }}>{t('loadFailed')}</div>
            )}
            {!posts.isLoading && filtered.length === 0 && (
              <div style={{ padding: 16, color: 'var(--app-text-muted)', textAlign: 'center' }}>
                {t('noPosts')}
              </div>
            )}
            {filtered.map((p) => (
              <PostItem
                key={p.slug}
                post={p}
                authorLabel={p.author ? authorName(p.author) : ''}
                active={!!selected && selected.lang === p.lang && selected.slug === p.slug}
                onSelect={() => select(p.lang, p.slug)}
                onContextMenu={(e) => onContextMenu(e, p)}
              />
            ))}
          </div>
          <div className="library-footer">
            <span className="library-status" />
            {lang === 'zh' ? '本地工作区' : 'Local workspace'}
            <span>HUGO / MD</span>
          </div>
        </>
      )}
      {menu && (
        <PostContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onRename={(m) => {
            setMenu(null);
            setRenaming(m);
          }}
          onDelete={(m) => {
            setMenu(null);
            setDeleting(m);
          }}
        />
      )}
      {renaming && (
        <RenameDialog
          lang={renaming.lang}
          slug={renaming.slug}
          onClose={() => setRenaming(null)}
          onRenamed={(newSlug) => {
            setRenaming(null);
            select(renaming.lang, newSlug);
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          lang={deleting.lang}
          slug={deleting.slug}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            if (selected?.slug === deleting.slug) {
              const next = items.find((p) => p.slug !== deleting.slug);
              if (next) select(next.lang, next.slug);
              else useUI.getState().clearSelection();
            }
          }}
        />
      )}
    </div>
  );
}

const PostItem = memo(function PostItem({
  post,
  authorLabel,
  active,
  onSelect,
  onContextMenu,
}: {
  post: PostMeta;
  authorLabel?: string;
  active: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className={`post-item ${active ? 'active' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <div className="title">{post.title || post.slug}</div>
      <div className="meta">
        <span>{fmtDate(post.date)}</span>
        {authorLabel && (
          <span className="post-author" title={post.author}>
            {authorLabel}
          </span>
        )}
        {post.draft && <span className="badge draft">draft</span>}
        {post.featured && (
          <span className="badge featured" title="精选">
            <Star size={11} fill="currentColor" aria-hidden="true" />
          </span>
        )}
        {!post.hasPair && (
          <span className="badge solo" title="unpaired">
            solo
          </span>
        )}
      </div>
    </button>
  );
});

export type { Lang };
