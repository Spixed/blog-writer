import type {
  HugoResult,
  Lang,
  MediaItem,
  PostContent,
  PostMeta,
  WatchEvent,
  WorkspaceApi,
  WorkspaceConfig,
  WorkspaceInfo,
} from '@blog-writer/shared';

interface FetchOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | boolean | undefined>;
}

/**
 * Backend adapter for the Node server (also used by Electron, which runs the
 * same server in the main process).
 */
export class NodeApi implements WorkspaceApi {
  private readonly base: string;

  constructor(base = '/api') {
    this.base = base;
  }

  private async request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
    const url = new URL(`${this.base}${path}`, window.location.origin);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`响应解析失败 (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const message =
        typeof data === 'object' && data && 'error' in data
          ? String((data as { error: unknown }).error)
          : `请求失败 (${res.status})`;
      throw new Error(message);
    }
    return data as T;
  }

  listWorkspaces(): Promise<WorkspaceInfo[]> {
    return this.request<{ workspaces: WorkspaceInfo[] }>('/workspaces').then((r) => r.workspaces);
  }

  addWorkspace(name: string, root: string): Promise<WorkspaceInfo> {
    return this.request<{ workspace: WorkspaceInfo }>('/workspaces', {
      method: 'POST',
      body: { name, root },
    }).then((r) => r.workspace);
  }

  async removeWorkspace(name: string): Promise<void> {
    await this.request(`/workspaces/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }

  getActiveWorkspace(): Promise<WorkspaceInfo | null> {
    return this.request<{ workspace: WorkspaceInfo | null }>('/workspace').then((r) => r.workspace);
  }

  setActiveWorkspace(name: string): Promise<WorkspaceInfo> {
    return this.request<{ workspace: WorkspaceInfo }>('/workspace', {
      method: 'PUT',
      body: { name },
    }).then((r) => r.workspace);
  }

  validateWorkspace(root: string): Promise<{ ok: boolean; error?: string }> {
    return this.request<{ ok: boolean; error?: string }>('/workspace/validate', {
      method: 'POST',
      body: { root },
    });
  }

  readConfig(): Promise<WorkspaceConfig> {
    return this.request<WorkspaceConfig>('/config');
  }

  listPosts(lang: Lang): Promise<PostMeta[]> {
    return this.request<{ posts: PostMeta[] }>(`/posts/${lang}`).then((r) => r.posts);
  }

  readPost(lang: Lang, slug: string): Promise<PostContent> {
    return this.request<PostContent>(`/posts/${lang}/${encodeURIComponent(slug)}`);
  }

  async writePost(
    lang: Lang,
    slug: string,
    data: { frontmatter: Record<string, unknown>; body: string },
  ): Promise<void> {
    await this.request(`/posts/${lang}/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: data,
    });
  }

  async createPost(
    lang: Lang,
    slug: string,
    data: { frontmatter: Record<string, unknown>; body: string },
  ): Promise<void> {
    await this.request(`/posts/${lang}/${encodeURIComponent(slug)}`, {
      method: 'POST',
      body: data,
    });
  }

  async renamePost(
    lang: Lang,
    slug: string,
    newSlug: string,
    opts?: { pair?: boolean },
  ): Promise<void> {
    await this.request(`/posts/${lang}/${encodeURIComponent(slug)}/rename`, {
      method: 'POST',
      body: { newSlug, pair: opts?.pair ?? false },
    });
  }

  async deletePost(lang: Lang, slug: string, opts?: { pair?: boolean }): Promise<void> {
    await this.request(`/posts/${lang}/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      query: { pair: opts?.pair },
    });
  }

  async restorePost(lang: Lang, slug: string, raw: string): Promise<void> {
    await this.request(`/posts/${lang}/${encodeURIComponent(slug)}/restore`, {
      method: 'PUT',
      body: { raw },
    });
  }

  listTaxonomy(kind: 'categories' | 'tags'): Promise<string[]> {
    return this.request<{ terms: string[] }>(`/taxonomy/${kind}`).then((r) => r.terms);
  }

  listMedia(relDir?: string): Promise<MediaItem[]> {
    return this.request<{ items: MediaItem[] }>('/media', { query: { dir: relDir } }).then(
      (r) => r.items,
    );
  }

  async uploadMedia(relDir: string, filename: string, data: ArrayBuffer): Promise<MediaItem> {
    const bytes = new Uint8Array(data);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk)
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return this.request<{ item: MediaItem }>('/media', {
      method: 'POST',
      body: { dir: relDir, filename, data: btoa(binary) },
    }).then((r) => r.item);
  }

  async deleteMedia(relPath: string): Promise<void> {
    await this.request(`/media/${relPath.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'DELETE',
    });
  }

  hugo(action: 'serve' | 'build' | 'stop'): Promise<HugoResult> {
    return this.request<{ result: HugoResult }>('/hugo', { method: 'POST', body: { action } }).then(
      (r) => r.result,
    );
  }

  watch(cb: (e: WatchEvent) => void): () => void {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    let socket: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(url);
      socket.onmessage = (ev) => {
        try {
          cb(JSON.parse(ev.data) as WatchEvent);
        } catch {
          // ignore malformed frames
        }
      };
      socket.onclose = () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, 1500);
      };
      socket.onerror = () => {
        socket?.close();
      };
    };
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }
}

export const api = new NodeApi();
