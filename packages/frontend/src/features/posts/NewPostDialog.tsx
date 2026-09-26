import type { Lang } from '@blog-writer/shared';
import {
  defaultFrontmatter,
  fromDatetimeLocal,
  suggestSlug,
  toDatetimeLocal,
  validateSlug,
} from '@blog-writer/shared';
import { useEffect, useState } from 'react';
import { SelectMenu } from '../../components/SelectMenu.js';
import { Dialog, DialogActions, TagInput, Toggle, useToasts } from '../../components/ui.js';
import { useConfig, useTaxonomy, useWritePost } from '../../hooks/queries.js';
import { useI18n } from '../../i18n/useI18n.js';

export function NewPostDialog({
  lang,
  onClose,
  onCreated,
}: {
  lang: Lang;
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const { t } = useI18n();
  const config = useConfig();
  const cats = useTaxonomy('categories');
  const tags = useTaxonomy('tags');
  const write = useWritePost();
  const toast = useToasts((s) => s.push);
  const [fm, setFm] = useState(() => defaultFrontmatter(new Date()));
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const slugError = validateSlug(slug);
  const titleEmpty = !String(fm.title ?? '').trim();

  useEffect(() => {
    if (!slugTouched && String(fm.title ?? '').trim()) setSlug(suggestSlug(String(fm.title)));
  }, [fm.title, slugTouched]);

  const handleCreate = () => {
    if (titleEmpty || slugError || !slug) return;
    write.mutate(
      { lang, slug, frontmatter: fm, body: '', create: true },
      {
        onSuccess: () => {
          toast(t('created'));
          onCreated(slug);
        },
        onError: (e) => toast(`${t('createFailed')}: ${e instanceof Error ? e.message : e}`),
      },
    );
  };

  return (
    <Dialog title={t('newPostTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          <span>{t('fm.title')}</span>
          <input
            type="text"
            value={String(fm.title ?? '')}
            autoFocus
            onChange={(e) => setFm({ ...fm, title: e.target.value })}
          />
          {titleEmpty && <span className="err">{t('err.titleRequired')}</span>}
        </label>
        <label className="field">
          <span>{t('slug')}</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
          />
          {slugError && <span className="err">{t(`err.${slugError.code}`)}</span>}
        </label>
        <label className="field">
          <span>{t('fm.date')}</span>
          <input
            type="datetime-local"
            value={toDatetimeLocal(fm.date) ?? ''}
            onChange={(e) => setFm({ ...fm, date: fromDatetimeLocal(e.target.value) ?? fm.date })}
          />
        </label>
        <label className="field">
          <span>{t('fm.author')}</span>
          <SelectMenu
            label={t('fm.author')}
            value={String(fm.author ?? '')}
            onChange={(author) => setFm({ ...fm, author })}
            options={[
              { value: '', label: '—' },
              ...(config.data?.authors ?? []).map((a) => ({
                value: a.key,
                label: a.nickname ?? a.name,
              })),
            ]}
          />
        </label>
        <div style={{ display: 'flex', gap: 16 }}>
          <Toggle
            checked={Boolean(fm.draft)}
            onChange={(v) => setFm({ ...fm, draft: v })}
            label={t('fm.draft')}
          />
          <Toggle
            checked={Boolean(fm.featured)}
            onChange={(v) => setFm({ ...fm, featured: v })}
            label={t('fm.featured')}
          />
        </div>
        <div className="field">
          <span>{t('fm.categories')}</span>
          <TagInput
            values={(fm.categories as string[]) ?? []}
            suggestions={cats.data ?? []}
            onChange={(v) => setFm({ ...fm, categories: v })}
          />
        </div>
        <div className="field">
          <span>{t('fm.tags')}</span>
          <TagInput
            values={(fm.tags as string[]) ?? []}
            suggestions={tags.data ?? []}
            onChange={(v) => setFm({ ...fm, tags: v })}
          />
        </div>
      </div>
      <DialogActions>
        <button className="icon-btn" onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          className="icon-btn primary"
          disabled={titleEmpty || !!slugError || write.isPending}
          onClick={handleCreate}
        >
          {t('create')}
        </button>
      </DialogActions>
    </Dialog>
  );
}
