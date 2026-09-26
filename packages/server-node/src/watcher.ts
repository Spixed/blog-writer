import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import type { Lang, WatchEvent } from '@blog-writer/shared';
import type { Site } from './site.js';

type Listener = (e: WatchEvent) => void;

/**
 * Watches the Hugo site for external changes (other editors, git, Obsidian)
 * and relays them to subscribers over the WebSocket.
 */
export class Watcher {
  private watcher: FSWatcher | null = null;
  private listeners = new Set<Listener>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(private site: Site) {}

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.watcher) return;
    const { root, themeDir } = this.site;
    // Chokidar v4 deliberately dropped glob expansion. Watch directories and
    // filter paths in handleChange so nested posts and media are reliable.
    const paths = [
      path.join(root, 'hugo.toml'), path.join(root, 'config.toml'),
      path.join(root, 'content'), path.join(root, 'data'), path.join(root, 'static'),
    ];
    if (themeDir) {
      paths.push(path.join(themeDir, 'data'));
      paths.push(path.join(themeDir, 'layouts'));
    }

    this.watcher = watch(paths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
    });

    const emit = (e: WatchEvent) => {
      const key =
        'lang' in e ? `${e.type}:${e.lang}:${e.slug}` : e.type;
      const existing = this.debounceTimers.get(key);
      if (existing) clearTimeout(existing);
      this.debounceTimers.set(
        key,
        setTimeout(() => {
          this.debounceTimers.delete(key);
          for (const l of this.listeners) l(e);
        }, 60),
      );
    };

    this.watcher.on('add', (p: string) => this.handleChange(p, 'add', emit));
    this.watcher.on('change', (p: string) => this.handleChange(p, 'change', emit));
    this.watcher.on('unlink', (p: string) => this.handleChange(p, 'unlink', emit));

    await new Promise<void>((resolve) => {
      if (this.watcher) this.watcher.on('ready', () => resolve());
      else resolve();
    });
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }

  private handleChange(
    filePath: string,
    kind: 'add' | 'change' | 'unlink',
    emit: (e: WatchEvent) => void,
  ): void {
    const rel = path.relative(this.site.root, filePath).replace(/\\/g, '/');
    if (rel === 'hugo.toml' || rel === 'config.toml' || rel.startsWith('data/')) {
      this.site.invalidate();
      emit({ type: 'config:change' });
      return;
    }
    if (rel.startsWith('static/')) {
      // Media changes invalidate the list without pretending they are posts.
      emit({ type: 'config:change' });
      return;
    }
    if (this.site.themeDir) {
      const themeRel = path.relative(this.site.root, this.site.themeDir).replace(/\\/g, '/');
      if (rel === themeRel || rel.startsWith(`${themeRel}/`)) {
        this.site.invalidate();
        emit({ type: 'config:change' });
        return;
      }
    }
    const m = /^content\/(.+?)\/post\/(.+)\.md$/.exec(rel);
    if (m) {
      const [, langSeg, slug] = m;
      const lang: Lang = langSeg === 'en' ? 'en' : 'zh';
      const type = kind === 'unlink' ? 'post:unlink' : kind === 'add' ? 'post:add' : 'post:change';
      emit({ type, lang, slug });
    }
  }
}
