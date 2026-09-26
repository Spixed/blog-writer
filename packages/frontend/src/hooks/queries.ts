import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Lang, PostContent, PostMeta, WorkspaceConfig, WorkspaceInfo } from '@blog-writer/shared';
import { api } from '../api/index.js';

const qk = {
  config: ['config'] as const,
  posts: (lang: Lang) => ['posts', lang] as const,
  post: (lang: Lang, slug: string) => ['post', lang, slug] as const,
  workspaces: ['workspaces'] as const,
  active: ['workspace', 'active'] as const,
  taxonomy: (kind: string) => ['taxonomy', kind] as const,
};

export function useConfig() {
  return useQuery<WorkspaceConfig>({ queryKey: qk.config, queryFn: () => api.readConfig() });
}

export function useWorkspaces() {
  return useQuery<WorkspaceInfo[]>({ queryKey: qk.workspaces, queryFn: () => api.listWorkspaces() });
}

export function useActiveWorkspace() {
  return useQuery<WorkspaceInfo | null>({
    queryKey: qk.active,
    queryFn: () => api.getActiveWorkspace(),
  });
}

export function useAddWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, root }: { name: string; root: string }) => api.addWorkspace(name, root),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workspaces });
      qc.invalidateQueries({ queryKey: qk.active });
    },
  });
}

export function useSetActiveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.setActiveWorkspace(name),
    onSuccess: (workspace) => {
      // Every post/config query is relative to the active server workspace.
      // Remove old responses before the next selection can reuse a matching slug.
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'workspaces' });
      qc.setQueryData(qk.active, workspace);
      qc.invalidateQueries({ queryKey: qk.workspaces });
    },
  });
}

export function usePosts(lang: Lang) {
  return useQuery<PostMeta[]>({
    queryKey: qk.posts(lang),
    queryFn: () => api.listPosts(lang),
  });
}

export function usePost(lang: Lang, slug: string | null) {
  return useQuery<PostContent>({
    queryKey: slug ? qk.post(lang, slug) : ['post', lang, '__none__'],
    queryFn: () => api.readPost(lang, slug as string),
    enabled: !!slug,
    staleTime: 0,
  });
}

export function useWritePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      lang,
      slug,
      frontmatter,
      body,
      create,
    }: {
      lang: Lang;
      slug: string;
      frontmatter: Record<string, unknown>;
      body: string;
      create?: boolean;
    }) =>
      create
        ? api.createPost(lang, slug, { frontmatter, body })
        : api.writePost(lang, slug, { frontmatter, body }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.posts(vars.lang) });
      qc.invalidateQueries({ queryKey: qk.posts(vars.lang === 'zh' ? 'en' : 'zh') });
      qc.invalidateQueries({ queryKey: qk.config });
      qc.invalidateQueries({ queryKey: qk.post(vars.lang, vars.slug) });
    },
  });
}

export function useRenamePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      lang,
      slug,
      newSlug,
      pair,
    }: {
      lang: Lang;
      slug: string;
      newSlug: string;
      pair?: boolean;
    }) => api.renamePost(lang, slug, newSlug, { pair }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.posts('zh') });
      qc.invalidateQueries({ queryKey: qk.posts('en') });
      qc.removeQueries({ queryKey: qk.post(vars.lang, vars.slug) });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lang, slug, pair }: { lang: Lang; slug: string; pair?: boolean }) =>
      api.deletePost(lang, slug, { pair }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.posts('zh') });
      qc.invalidateQueries({ queryKey: qk.posts('en') });
      qc.invalidateQueries({ queryKey: qk.config });
    },
  });
}

export function useRestorePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lang, slug, raw }: { lang: Lang; slug: string; raw: string }) =>
      api.restorePost(lang, slug, raw),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.posts(vars.lang) });
      qc.invalidateQueries({ queryKey: qk.posts(vars.lang === 'zh' ? 'en' : 'zh') });
      qc.invalidateQueries({ queryKey: qk.config });
    },
  });
}

export function useTaxonomy(kind: 'categories' | 'tags') {
  return useQuery<string[]>({
    queryKey: qk.taxonomy(kind),
    queryFn: () => api.listTaxonomy(kind),
    staleTime: 60_000,
  });
}

export { qk };
