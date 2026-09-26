/**
 * One language version of a post: its front matter and body, the dirty flag,
 * debounced autosave, Ctrl+S, and pull-from-server on external changes.
 *
 * The state lives above the mode switch so changing the editor mode (or
 * flipping into bilingual) never drops unsaved edits.
 */
import { useEffect, useRef, useState } from 'react';
import type { Frontmatter, Lang, PostContent } from '@blog-writer/shared';
import { useActiveWorkspace, usePost, useWritePost } from '../../hooks/queries.js';
import { useHugo } from '../../store/hugo.js';
import { useToasts } from '../../components/ui.js';
import { useI18n } from '../../i18n/useI18n.js';
import { useUI } from '../../store/ui.js';
import { sourceHasMath } from '../../render/math.js';

export interface PostEditor {
  post: PostContent | undefined;
  exists: boolean;
  fm: Frontmatter;
  body: string;
  setFm: (fm: Frontmatter) => void;
  setBody: (body: string) => void;
  dirty: boolean;
  saving: boolean;
  save: (opts?: { silent?: boolean }) => void;
  conflict: boolean;
  discardLocal: () => void;
}

const EMPTY_FM: Frontmatter = {};
const draftCache = new Map<string, { fm: Frontmatter; body: string; lead: string }>();

function sameFrontmatter(a: Frontmatter, b: Frontmatter): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Drop the meaningless blank lines before the first block (Hugo ignores them). */
function stripLead(body: string): string {
  return body.replace(/^[\r\n]+/, '');
}

function withDerivedMath(fm: Frontmatter, body: string): Frontmatter {
  const next = { ...fm };
  if (sourceHasMath(body)) next.math = true;
  else delete next.math;
  return next;
}

export function usePostEditor(lang: Lang, slug: string | null): PostEditor {
  const { t } = useI18n();
  const post = usePost(lang, slug);
  const workspace = useActiveWorkspace();
  const write = useWritePost();
  const toast = useToasts((s) => s.push);
  const autosave = useUI((s) => s.autosave);
  const autosaveDelay = useUI((s) => s.autosaveDelay);
  const savingRef = useRef(false);
  const key = `${workspace.data?.name ?? ''}:${lang}:${slug ?? ''}`;

  const [body, setBody] = useState<string>(() => stripLead(post.data?.body ?? ''));
  const [fm, setFm] = useState<Frontmatter>(() => withDerivedMath(post.data?.frontmatter ?? EMPTY_FM, stripLead(post.data?.body ?? '')));
  // The blank lines a file has between its front matter and its first block are
  // invisible in Markdown (Hugo drops them), so they are kept out of the
  // editing surface but re-prepended on save to keep the file byte-exact.
  const leadRef = useRef(post.data?.body.slice(0, post.data?.body.length - stripLead(post.data?.body ?? '').length) ?? '');
  const [saved, setSaved] = useState({
    fm: post.data?.frontmatter ?? EMPTY_FM,
    body: stripLead(post.data?.body ?? ''),
  });
  const [conflict, setConflict] = useState(false);
  const setDraftFm = (next: Frontmatter) => {
    const nextFm = withDerivedMath(next, body);
    draftCache.set(key, { fm: nextFm, body, lead: leadRef.current });
    setFm(nextFm);
  };
  const setDraftBody = (next: string) => {
    const nextFm = withDerivedMath(fm, next);
    draftCache.set(key, { fm: nextFm, body: next, lead: leadRef.current });
    setFm(nextFm);
    setBody(next);
  };
  const dirty = !sameFrontmatter(fm, saved.fm) || body !== saved.body;
  useEffect(() => {
    const draft = draftCache.get(key);
    if (draft && !dirty) { leadRef.current = draft.lead; setFm(draft.fm); setBody(draft.body); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = (opts: { silent?: boolean } = {}) => {
    if (!dirty || savingRef.current || slug === null) return;
    savingRef.current = true;
    write.mutate(
      { lang, slug, frontmatter: fm, body: leadRef.current + body },
      {
        onSuccess: () => {
          setSaved({ fm, body });
          const latest = draftCache.get(key);
          if (latest && sameFrontmatter(latest.fm, fm) && latest.body === body) draftCache.delete(key);
          setConflict(false);
          if (!opts.silent) toast(t('saved'));
          // If the Hugo preview is open, reload it so the edit shows up.
          if (useHugo.getState().open) useHugo.getState().refresh();
        },
        onError: (e) => toast(`${t('saveFailed')}: ${e instanceof Error ? e.message : e}`),
        onSettled: () => { savingRef.current = false; },
      },
    );
  };

  // Debounced autosave after the last keystroke.
  useEffect(() => {
    // Wait for an in-flight write to settle. If the user keeps typing while a
    // save is in progress, the pending-state transition below restarts this
    // timer and persists the newest body instead of leaving it dirty forever.
    if (!autosave || !dirty || write.isPending) return;
    const timer = setTimeout(() => save({ silent: true }), autosaveDelay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, autosaveDelay, dirty, fm, body, write.isPending]);

  // Ctrl/Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fm, body, dirty]);

  // Pull in external changes (file watcher) when there are no local edits.
  useEffect(() => {
    if (dirty && post.data && (post.data.body !== leadRef.current + body || !sameFrontmatter(post.data.frontmatter, fm))) {
      setConflict(true);
      return;
    }
    if (dirty || !post.data) return;
    if (!sameFrontmatter(post.data.frontmatter, fm) || post.data.body !== leadRef.current + body) {
      const stripped = stripLead(post.data.body);
      leadRef.current = post.data.body.slice(0, post.data.body.length - stripped.length);
      setFm(withDerivedMath(post.data.frontmatter, stripped));
      setBody(stripped);
      setSaved({ fm: post.data.frontmatter, body: stripped });
      setConflict(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.data?.frontmatter, post.data?.body]);

  const discardLocal = () => {
    if (!post.data) return;
    const stripped = stripLead(post.data.body);
    leadRef.current = post.data.body.slice(0, post.data.body.length - stripped.length);
    setFm(withDerivedMath(post.data.frontmatter, stripped)); setBody(stripped); setSaved({ fm: post.data.frontmatter, body: stripped }); setConflict(false);
  };

  return {
    post: post.data,
    exists: !!post.data,
    fm,
    body,
    setFm: setDraftFm,
    setBody: setDraftBody,
    dirty,
    saving: write.isPending,
    save,
    conflict,
    discardLocal,
  };
}
