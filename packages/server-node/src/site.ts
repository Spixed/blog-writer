import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type {
  AuthorInfo,
  Lang,
  MathEngine,
  QmojiEntry,
  WorkspaceConfig,
} from '@blog-writer/shared';

const CONFIG_FILES = ['hugo.toml', 'config.toml'];

async function findConfigFile(root: string): Promise<string | null> {
  for (const f of CONFIG_FILES) {
    try {
      await fs.access(path.join(root, f));
      return path.join(root, f);
    } catch {
      // try next
    }
  }
  return null;
}

/** Loose shape of a Hugo config file. */
interface HugoConfig {
  title?: string;
  theme?: string | string[];
  contentDir?: string;
  defaultContentLanguage?: string;
  params?: {
    math?: boolean;
    mathEngine?: string;
    description?: string;
    [k: string]: unknown;
  };
  languages?: Record<string, { contentDir?: string; languageName?: string; weight?: number }>;
}

function parseConfig(text: string): HugoConfig {
  return parseToml(text) as HugoConfig;
}

async function readJsonIfExists(p: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readTomlIfExists(p: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return parseToml(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class Site {
  readonly root: string;
  private config: HugoConfig;
  private configPath: string;
  private authorsCache: AuthorInfo[] | null = null;
  private qmojiCache: QmojiEntry[] | null = null;

  private constructor(root: string, config: HugoConfig, configPath: string) {
    this.root = root;
    this.config = config;
    this.configPath = configPath;
  }

  static async open(root: string): Promise<Site> {
    const cfgPath = await findConfigFile(root);
    if (!cfgPath) throw new Error('未找到 Hugo 配置文件 (hugo.toml/config.toml)');
    const text = await fs.readFile(cfgPath, 'utf8');
    const config = parseConfig(text);
    return new Site(path.resolve(root), config, cfgPath);
  }

  static async isValidSite(root: string): Promise<boolean> {
    return !!(await findConfigFile(root));
  }

  invalidate(): void {
    this.authorsCache = null;
    this.qmojiCache = null;
  }

  get themeName(): string | null {
    const t = this.config.theme;
    if (Array.isArray(t)) return t[0] ?? null;
    return typeof t === 'string' ? t : null;
  }

  get themeDir(): string | null {
    const name = this.themeName;
    if (!name) return null;
    const dir = path.join(this.root, 'themes', name);
    return dir;
  }

  get staticDir(): string {
    return path.join(this.root, 'static');
  }

  /** Content dir for a language, honoring languages.<lang>.contentDir. */
  contentDirFor(lang: Lang): string {
    const langConf = this.config.languages?.[lang];
    const rel = langConf?.contentDir ?? this.config.contentDir ?? 'content';
    return path.join(this.root, rel);
  }

  get defaultLang(): Lang {
    const def = this.config.defaultContentLanguage;
    return def === 'en' ? 'en' : 'zh';
  }

  get mathEngine(): MathEngine {
    return this.config.params?.mathEngine === 'katex' ? 'katex' : 'mathjax';
  }

  postDir(lang: Lang): string {
    return path.join(this.contentDirFor(lang), 'post');
  }

  postPath(lang: Lang, slug: string): string {
    return path.join(this.postDir(lang), `${slug}.md`);
  }

  async readAuthors(): Promise<AuthorInfo[]> {
    if (this.authorsCache) return this.authorsCache;
    const rootFile = path.join(this.root, 'data', 'authors.toml');
    const themeFile = this.themeDir ? path.join(this.themeDir, 'data', 'authors.toml') : null;
    const raw = (await readTomlIfExists(rootFile)) ?? (themeFile ? await readTomlIfExists(themeFile) : null);
    const authors: AuthorInfo[] = [];
    if (raw) {
      for (const [key, value] of Object.entries(raw)) {
        if (value && typeof value === 'object') {
          const v = value as Record<string, unknown>;
          authors.push({
            key,
            name: String(v.name ?? key),
            nickname: v.nickname ? String(v.nickname) : undefined,
            avatar: v.avatar ? String(v.avatar) : undefined,
            bio: v.bio as AuthorInfo['bio'],
            github: v.github ? String(v.github) : undefined,
            email: v.email ? String(v.email) : undefined,
            website: v.website ? String(v.website) : undefined,
            weight: typeof v.weight === 'number' ? v.weight : undefined,
          });
        }
      }
    }
    authors.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    this.authorsCache = authors;
    return authors;
  }

  async readQmoji(): Promise<QmojiEntry[]> {
    if (this.qmojiCache) return this.qmojiCache;
    const rootFile = path.join(this.root, 'data', 'qmoji', 'mapping.json');
    const themeFile = this.themeDir ? path.join(this.themeDir, 'data', 'qmoji', 'mapping.json') : null;
    const raw = (await readJsonIfExists(rootFile)) ?? (themeFile ? await readJsonIfExists(themeFile) : null);
    const entries: QmojiEntry[] = [];
    if (Array.isArray(raw)) {
      for (const e of raw) {
        if (e && typeof e === 'object' && 'emojiId' in e && 'describe' in e) {
          entries.push({
            emojiId: String(e.emojiId),
            describe: String(e.describe),
            emojiType: Number(e.emojiType ?? 0),
          });
        }
      }
    }
    this.qmojiCache = entries;
    return entries;
  }

  async toConfig(): Promise<WorkspaceConfig> {
    const [authors, qmoji] = await Promise.all([this.readAuthors(), this.readQmoji()]);
    return {
      root: this.root,
      contentDir: this.contentDirFor('zh'),
      themeDir: this.themeDir,
      themeName: this.themeName,
      siteTitle: this.config.title ?? 'Untitled Blog',
      defaultContentLanguage: this.defaultLang,
      mathEngine: this.mathEngine,
      math: this.config.params?.math !== false,
      authors,
      defaultAuthor: authors[0]?.key ?? null,
      qmojiMapping: qmoji,
      categories: [],
      tags: [],
    };
  }
}
