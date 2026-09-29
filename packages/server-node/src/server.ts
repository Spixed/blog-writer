import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  HugoResult,
  Lang,
  MediaItem,
  WatchEvent,
  WorkspaceConfig,
  WorkspaceInfo,
} from '@blog-writer/shared';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { WorkspaceStore } from './config-store.js';
import { HugoManager } from './hugo.js';
import { PostStore } from './posts.js';
import { fetchQmoji, qmojiContentType } from './qmoji.js';
import { Site } from './site.js';
import { Watcher } from './watcher.js';

interface ActiveWorkspace {
  site: Site;
  posts: PostStore;
  watcher: Watcher;
  taxonomy: { categories: string[]; tags: string[] } | null;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  /** Blog root to register as the default workspace on first run. */
  defaultRoot?: string;
  /** Suggested name for the default workspace. */
  defaultName?: string;
  frontendDist?: string;
  /** Hugo binary to spawn; defaults to `hugo` on PATH. */
  hugoBin?: string;
}

type RouteHandler = (req: any, reply: any) => Promise<any>;

function isLang(v: string): v is Lang {
  return v === 'zh' || v === 'en';
}

export async function createServer(opts: ServerOptions = {}): Promise<{
  app: FastifyInstance;
  close: () => Promise<void>;
}> {
  const store = new WorkspaceStore();
  const hugo = new HugoManager(opts.hugoBin);
  let active: ActiveWorkspace | null = null;
  const sockets = new Set<WebSocket>();

  const broadcast = (e: WatchEvent) => {
    const msg = JSON.stringify(e);
    for (const s of sockets) {
      if (s.readyState === s.OPEN) s.send(msg);
    }
  };

  // Stream hugo subprocess output and status changes to all clients.
  hugo.onOutput((line) => broadcast({ type: 'hugo:output', line }));
  hugo.onStatus((s) => broadcast({ type: 'hugo:status', running: s.running, url: s.url }));

  async function activate(name: string): Promise<WorkspaceInfo> {
    const info = await store.setActive(name);
    if (active) await active.watcher.stop();
    const site = await Site.open(info.root);
    const posts = new PostStore(site);
    const watcher = new Watcher(site);
    await watcher.start();
    watcher.on(broadcast);
    active = { site, posts, watcher, taxonomy: null };
    broadcast({ type: 'config:change' });
    return info;
  }

  async function requireActive(): Promise<ActiveWorkspace> {
    if (active) return active;
    const info = await store.active();
    if (!info) throw new Error('尚未选择工作区');
    await activate(info.name);
    if (!active) throw new Error('工作区激活失败');
    return active;
  }

  // Auto-register the default workspace on first run.
  if (opts.defaultRoot) {
    const valid = await Site.isValidSite(opts.defaultRoot);
    if (valid) await store.ensureDefault(opts.defaultRoot, opts.defaultName ?? 'default');
  }

  // Media uploads are base64 encoded in the adapter (~4/3 overhead); allow a
  // 50 MiB file plus JSON framing while still rejecting oversized payloads in
  // the route below.
  const app = Fastify({ logger: false, bodyLimit: 72 * 1024 * 1024 });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(websocket);

  const wrap =
    (handler: RouteHandler) =>
    async (req: any, reply: any): Promise<any> => {
      try {
        return await handler(req, reply);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = /不存在|无效|未找到|尚未/.test(message) ? 404 : 400;
        reply.code(code);
        return { error: message };
      }
    };

  // ---- health ----------------------------------------------------------
  app.get('/api/health', () => ({ ok: true, version: '0.1.1' }));

  // ---- workspaces ------------------------------------------------------
  app.get(
    '/api/workspaces',
    wrap(async () => ({ workspaces: await store.list() })),
  );

  app.post(
    '/api/workspaces',
    wrap(async (req) => {
      const { name, root } = req.body ?? {};
      if (!name || !root) throw new Error('需要 name 与 root');
      const valid = await Site.isValidSite(root);
      if (!valid) throw new Error('该目录不是 Hugo 站点（缺少 hugo.toml/config.toml）');
      return { workspace: await store.add(name, root) };
    }),
  );

  app.delete(
    '/api/workspaces/:name',
    wrap(async (req) => {
      await store.remove(decodeURIComponent(req.params.name));
      return { ok: true };
    }),
  );

  app.get(
    '/api/workspace',
    wrap(async () => ({ workspace: await store.active() })),
  );

  app.put(
    '/api/workspace',
    wrap(async (req) => {
      const { name } = req.body ?? {};
      if (!name) throw new Error('需要 name');
      return { workspace: await activate(name) };
    }),
  );

  app.post(
    '/api/workspace/validate',
    wrap(async (req) => {
      const { root } = req.body ?? {};
      if (!root) throw new Error('需要 root');
      const ok = await Site.isValidSite(root);
      return { ok, error: ok ? undefined : '该目录不是 Hugo 站点' };
    }),
  );

  // ---- config ----------------------------------------------------------
  app.get(
    '/api/config',
    wrap(async () => {
      const ctx = await requireActive();
      const config: WorkspaceConfig = await ctx.site.toConfig();
      if (!ctx.taxonomy) {
        ctx.taxonomy = await collectTaxonomy(ctx.posts);
      }
      config.categories = ctx.taxonomy.categories;
      config.tags = ctx.taxonomy.tags;
      return config;
    }),
  );

  // ---- posts -----------------------------------------------------------
  app.get(
    '/api/posts/:lang',
    wrap(async (req) => {
      const lang = req.params.lang;
      if (!isLang(lang)) throw new Error('无效的语言');
      const ctx = await requireActive();
      return { posts: await ctx.posts.list(lang) };
    }),
  );

  app.get(
    '/api/posts/:lang/:slug',
    wrap(async (req, reply) => {
      const lang = req.params.lang;
      if (!isLang(lang)) throw new Error('无效的语言');
      const ctx = await requireActive();
      const post = await ctx.posts.read(lang, req.params.slug);
      reply.header('Cache-Control', 'no-store');
      return post;
    }),
  );

  app.post(
    '/api/posts/:lang/:slug',
    wrap(async (req) => {
      const lang = req.params.lang;
      if (!isLang(lang)) throw new Error('无效的语言');
      const ctx = await requireActive();
      const { frontmatter, body } = req.body ?? {};
      if (!frontmatter) throw new Error('需要 frontmatter');
      await ctx.posts.create(lang, req.params.slug, { frontmatter, body: body ?? '' });
      ctx.taxonomy = null;
      broadcast({ type: 'post:add', lang, slug: req.params.slug });
      return { ok: true };
    }),
  );

  app.put(
    '/api/posts/:lang/:slug',
    wrap(async (req) => {
      const lang = req.params.lang;
      if (!isLang(lang)) throw new Error('无效的语言');
      const ctx = await requireActive();
      const { frontmatter, body } = req.body ?? {};
      if (!frontmatter) throw new Error('需要 frontmatter');
      await ctx.posts.write(lang, req.params.slug, { frontmatter, body: body ?? '' });
      ctx.taxonomy = null;
      broadcast({ type: 'post:change', lang, slug: req.params.slug });
      return { ok: true };
    }),
  );

  app.post(
    '/api/posts/:lang/:slug/rename',
    wrap(async (req) => {
      const lang = req.params.lang;
      if (!isLang(lang)) throw new Error('无效的语言');
      const ctx = await requireActive();
      const { newSlug, pair } = req.body ?? {};
      if (!newSlug) throw new Error('需要 newSlug');
      await ctx.posts.rename(lang, req.params.slug, newSlug, Boolean(pair));
      ctx.taxonomy = null;
      broadcast({ type: 'post:unlink', lang, slug: req.params.slug });
      broadcast({ type: 'post:add', lang, slug: newSlug });
      return { ok: true };
    }),
  );

  app.delete(
    '/api/posts/:lang/:slug',
    wrap(async (req) => {
      const lang = req.params.lang;
      if (!isLang(lang)) throw new Error('无效的语言');
      const ctx = await requireActive();
      const pair = req.query.pair === 'true' || req.query.pair === true;
      await ctx.posts.del(lang, req.params.slug, pair);
      ctx.taxonomy = null;
      broadcast({ type: 'post:unlink', lang, slug: req.params.slug });
      return { ok: true };
    }),
  );

  // ---- undo of a delete: write the original bytes back verbatim --------
  app.put(
    '/api/posts/:lang/:slug/restore',
    wrap(async (req) => {
      const lang = req.params.lang;
      if (!isLang(lang)) throw new Error('无效的语言');
      const ctx = await requireActive();
      const { raw } = req.body ?? {};
      if (typeof raw !== 'string') throw new Error('需要 raw');
      await ctx.posts.restore(lang, req.params.slug, raw);
      ctx.taxonomy = null;
      broadcast({ type: 'post:add', lang, slug: req.params.slug });
      return { ok: true };
    }),
  );

  // ---- taxonomy --------------------------------------------------------
  app.get(
    '/api/taxonomy/:kind',
    wrap(async (req) => {
      const kind = req.params.kind;
      if (kind !== 'categories' && kind !== 'tags') throw new Error('无效的 taxonomy 类型');
      const ctx = await requireActive();
      if (!ctx.taxonomy) ctx.taxonomy = await collectTaxonomy(ctx.posts);
      return { terms: kind === 'categories' ? ctx.taxonomy.categories : ctx.taxonomy.tags };
    }),
  );

  // ---- media -----------------------------------------------------------
  const safeStaticPath = (site: Site, rel: string): string => {
    const base = path.resolve(site.staticDir);
    const candidate = path.resolve(base, rel);
    if (candidate !== base && !candidate.startsWith(base + path.sep)) throw new Error('无效的路径');
    return candidate;
  };
  // Serve a static file verbatim (post images/videos reference root-relative
  // URLs like /process/img-1.png, which resolve against the blog origin when
  // Hugo serves the site; here the editor rewrites them to this endpoint).
  app.get(
    '/api/media/raw/*',
    wrap(async (req, reply) => {
      const ctx = await requireActive();
      const relPath = req.params['*'];
      if (!relPath) throw new Error('无效的路径');
      const file = safeStaticPath(ctx.site, relPath);
      let data: Buffer;
      try {
        data = await fs.readFile(file);
      } catch {
        throw new Error('文件不存在');
      }
      const ext = path.extname(file).toLowerCase();
      const mime: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.avif': 'image/avif',
        '.ico': 'image/x-icon',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.json': 'application/json',
        '.txt': 'text/plain; charset=utf-8',
      };
      reply.header('Content-Type', mime[ext] ?? 'application/octet-stream');
      reply.header('Cache-Control', 'public, max-age=0, must-revalidate');
      return reply.send(data);
    }),
  );

  app.get(
    '/api/media',
    wrap(async (req) => {
      const ctx = await requireActive();
      const relDir = typeof req.query.dir === 'string' ? req.query.dir : '';
      const dir = safeStaticPath(ctx.site, relDir);
      const items: MediaItem[] = [];
      try {
        const walk = async (current: string, prefix: string): Promise<void> => {
          for (const e of await fs.readdir(current, { withFileTypes: true })) {
            const full = path.join(current, e.name);
            const relPath = path.join(prefix, e.name).replace(/\\/g, '/');
            if (e.isDirectory()) await walk(full, relPath);
            else if (e.isFile() && /\.(png|jpe?g|gif|webp|svg|avif|mp4|webm)$/i.test(e.name)) {
              const st = await fs.stat(full);
              items.push({
                name: e.name,
                relPath,
                size: st.size,
                modified: st.mtimeMs,
                url: `/${relPath}`,
              });
            }
          }
        };
        await walk(dir, relDir);
      } catch {
        // dir missing
      }
      items.sort((a, b) => b.modified - a.modified);
      return { items };
    }),
  );

  app.post(
    '/api/media',
    wrap(async (req) => {
      const ctx = await requireActive();
      const body = req.body ?? {};
      const dirName = typeof body.dir === 'string' ? body.dir : '';
      const filename = typeof body.filename === 'string' ? path.basename(body.filename) : '';
      if (
        !filename ||
        filename === '.' ||
        filename === '..' ||
        /[<>:"/\\|?*\x00-\x1f]/.test(filename) ||
        !/\.(png|jpe?g|gif|webp|svg|avif|mp4|webm)$/i.test(filename)
      )
        throw new Error('不支持的媒体格式');
      const raw = typeof body.data === 'string' ? body.data : '';
      if (!raw || raw.length > 80 * 1024 * 1024) throw new Error('文件过大或为空');
      const dir = safeStaticPath(ctx.site, dirName);
      await fs.mkdir(dir, { recursive: true });
      let target = path.join(dir, filename);
      const ext = path.extname(filename),
        stem = path.basename(filename, ext);
      let n = 1;
      while (true) {
        try {
          await fs.access(target);
          target = path.join(dir, `${stem}-${n++}${ext}`);
        } catch {
          break;
        }
      }
      const data = Buffer.from(raw, 'base64');
      if (data.byteLength > 50 * 1024 * 1024) throw new Error('文件过大');
      await fs.writeFile(target, data, { flag: 'wx' });
      const st = await fs.stat(target);
      const relPath = path.relative(ctx.site.staticDir, target).replace(/\\/g, '/');
      const item: MediaItem = {
        name: path.basename(target),
        relPath,
        size: st.size,
        modified: st.mtimeMs,
        url: `/${relPath}`,
      };
      return { item };
    }),
  );

  app.delete(
    '/api/media/*',
    wrap(async (req) => {
      const ctx = await requireActive();
      const relPath = req.params['*'];
      if (!relPath) throw new Error('无效的路径');
      await fs.unlink(safeStaticPath(ctx.site, relPath));
      return { ok: true };
    }),
  );

  // ---- qmoji (disk-cached jsDelivr proxy) ------------------------------
  app.get(
    '/api/qmoji/*',
    wrap(async (req, reply) => {
      const relPath = req.params['*'];
      if (!relPath) throw new Error('无效的路径');
      const data = await fetchQmoji(relPath);
      reply.header('Content-Type', qmojiContentType(relPath));
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.send(data);
    }),
  );

  // ---- hugo ------------------------------------------------------------
  app.post(
    '/api/hugo',
    wrap(async (req): Promise<{ result: HugoResult }> => {
      const ctx = await requireActive();
      const action = req.body?.action;
      if (action === 'serve') return { result: await hugo.serve(ctx.site.root) };
      if (action === 'build') return { result: await hugo.build(ctx.site.root) };
      if (action === 'stop') return { result: await hugo.stop() };
      throw new Error('无效的 action');
    }),
  );

  // ---- websocket -------------------------------------------------------
  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('message', (raw) => {
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
        const msg = JSON.parse(text);
        if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      } catch {
        // ignore malformed frames
      }
    });
  });

  if (opts.frontendDist) {
    const root = path.resolve(opts.frontendDist);
    const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
    app.get('/*', async (req: any, reply) => {
      const requested = typeof req.params['*'] === 'string' ? req.params['*'] : '';
      const candidate = path.resolve(root, requested || 'index.html');
      if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return reply.code(403).send('Forbidden');
      let target = candidate;
      try { if (!(await fs.stat(target)).isFile()) target = path.join(root, 'index.html'); } catch { target = path.join(root, 'index.html'); }
      reply.header('Content-Type', mime[path.extname(target).toLowerCase()] ?? 'application/octet-stream');
      return reply.send(await fs.readFile(target));
    });
  }

  // Re-broadcast watcher events through the active context's watcher.
  // (watcher.on was registered during activate(); nothing else needed here.)

  const close = async (): Promise<void> => {
    for (const s of sockets) {
      try {
        s.close();
      } catch {
        // ignore
      }
    }
    sockets.clear();
    if (active) await active.watcher.stop();
    await hugo.stop();
    await app.close();
  };

  const port = opts.port ?? 7841;
  const host = opts.host ?? '127.0.0.1';
  await app.listen({ port, host });

  return { app, close };
}

async function collectTaxonomy(
  posts: PostStore,
): Promise<{ categories: string[]; tags: string[] }> {
  const cats = new Set<string>();
  const tags = new Set<string>();
  for await (const { frontmatter } of posts.scanAll()) {
    if (Array.isArray(frontmatter.categories))
      frontmatter.categories.forEach((c) => cats.add(String(c)));
    if (Array.isArray(frontmatter.tags)) frontmatter.tags.forEach((t) => tags.add(String(t)));
  }
  return {
    categories: [...cats].sort((a, b) => a.localeCompare(b, 'zh')),
    tags: [...tags].sort((a, b) => a.localeCompare(b, 'zh')),
  };
}
