import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Lang, PostContent, PostMeta } from '@blog-writer/shared';
import { LANGS, parseDateField, validateSlug } from '@blog-writer/shared';
import { dumpFile, type ParsedFile, parseFile } from './frontmatter-io.js';
import type { Site } from './site.js';

const OTHER_LANG: Record<Lang, Lang> = { zh: 'en', en: 'zh' };

async function readFileSafe(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export class PostStore {
  private metaCache = new Map<string, { mtime: number; meta: PostMeta }>();

  constructor(private site: Site) {}

  invalidateCache(): void {
    this.metaCache.clear();
  }

  private pathFor(lang: Lang, slug: string): string {
    return this.site.postPath(lang, slug);
  }

  private async stat(p: string): Promise<{ mtime: number; size: number } | null> {
    try {
      const st = await fs.stat(p);
      return { mtime: st.mtimeMs, size: st.size };
    } catch {
      return null;
    }
  }

  async list(lang: Lang): Promise<PostMeta[]> {
    const dir = this.site.postDir(lang);
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const mdNames = names.filter((n) => n.toLowerCase().endsWith('.md')).sort();

    const metas: PostMeta[] = [];
    for (const name of mdNames) {
      const slug = name.slice(0, -3);
      const p = path.join(dir, name);
      const st = await this.stat(p);
      if (!st) continue;

      const cacheKey = `${lang}:${slug}`;
      const cached = this.metaCache.get(cacheKey);
      let parsed: ParsedFile;
      let raw: string | null = null;
      if (cached && cached.mtime === st.mtime) {
        metas.push(cached.meta);
        continue;
      }
      raw = await readFileSafe(p);
      if (raw === null) continue;
      parsed = parseFile(raw);
      const fm = parsed.frontmatter;
      const date = parseDateField(fm.date);
      const meta: PostMeta = {
        slug,
        lang,
        title: typeof fm.title === 'string' ? fm.title : slug,
        date: date ? date.toISOString() : '',
        draft: Boolean(fm.draft),
        featured: Boolean(fm.featured),
        author: typeof fm.author === 'string' ? fm.author : undefined,
        categories: Array.isArray(fm.categories) ? fm.categories.map(String) : [],
        tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
        description: typeof fm.description === 'string' ? fm.description : undefined,
        weight: typeof fm.weight === 'number' ? fm.weight : 0,
        hasPair: await fileExists(this.pathFor(OTHER_LANG[lang], slug)),
        size: st.size,
        modified: st.mtime,
      };
      this.metaCache.set(cacheKey, { mtime: st.mtime, meta });
      metas.push(meta);
    }
    return metas;
  }

  async read(lang: Lang, slug: string): Promise<PostContent> {
    this.guardSlug(slug);
    const p = this.pathFor(lang, slug);
    const raw = await readFileSafe(p);
    if (raw === null) throw new Error(`文章不存在: ${lang}/post/${slug}.md`);
    const parsed = parseFile(raw);
    return {
      slug,
      lang,
      raw: parsed.raw,
      frontmatter: parsed.frontmatter,
      frontmatterRaw: parsed.frontmatterRaw,
      body: parsed.body,
      path: p,
    };
  }

  async write(
    lang: Lang,
    slug: string,
    next: { frontmatter: Record<string, unknown>; body: string },
    opts: { create?: boolean } = {},
  ): Promise<void> {
    this.guardSlug(slug);
    const p = this.pathFor(lang, slug);
    const existingRaw = await readFileSafe(p);
    if (existingRaw === null && !opts.create) {
      throw new Error(`文章不存在: ${lang}/post/${slug}.md`);
    }
    const parsed = existingRaw !== null ? parseFile(existingRaw) : null;
    const text = dumpFile(
      parsed ?? {
        raw: '',
        frontmatterRaw: '',
        frontmatter: {},
        body: '',
        eol: '\n',
        hasFrontmatter: false,
      },
      next,
    );
    await this.atomicWrite(p, text);
    this.metaCache.delete(`${lang}:${slug}`);
  }

  async create(
    lang: Lang,
    slug: string,
    next: { frontmatter: Record<string, unknown>; body: string },
  ): Promise<void> {
    this.guardSlug(slug);
    const p = this.pathFor(lang, slug);
    if (await fileExists(p)) throw new Error(`文章已存在: ${lang}/post/${slug}.md`);
    await this.write(lang, slug, next, { create: true });
  }

  async rename(lang: Lang, slug: string, newSlug: string, pair = false): Promise<void> {
    this.guardSlug(slug);
    this.guardSlug(newSlug);
    if (slug === newSlug) return;
    const ops: [string, string][] = [[this.pathFor(lang, slug), this.pathFor(lang, newSlug)]];
    if (pair)
      ops.push([this.pathFor(OTHER_LANG[lang], slug), this.pathFor(OTHER_LANG[lang], newSlug)]);
    for (const [from, to] of ops) {
      if (!(await fileExists(from))) continue;
      if (await fileExists(to)) throw new Error(`目标文章已存在: ${path.basename(to)}`);
    }
    for (const [from, to] of ops) {
      if (!(await fileExists(from))) continue;
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(from, to);
      this.metaCache.delete(`${lang}:${path.basename(from, '.md')}`);
    }
  }

  async del(lang: Lang, slug: string, pair = false): Promise<void> {
    this.guardSlug(slug);
    const targets = [this.pathFor(lang, slug)];
    if (pair) targets.push(this.pathFor(OTHER_LANG[lang], slug));
    for (const p of targets) {
      try {
        await fs.unlink(p);
      } catch {
        // ignore missing files
      }
      this.metaCache.delete(`${lang}:${slug}`);
    }
  }

  /**
   * Write a file's exact bytes back. Undo uses this after a delete: restoring a
   * post must bypass front matter (de)serialization, or the restored file would
   * drift away from the deleted original.
   */
  async restore(lang: Lang, slug: string, raw: string): Promise<void> {
    this.guardSlug(slug);
    await this.atomicWrite(this.pathFor(lang, slug), raw);
    this.metaCache.delete(`${lang}:${slug}`);
  }

  /** All posts across both languages with parsed front matter (for taxonomy). */
  async *scanAll(): AsyncGenerator<{
    lang: Lang;
    slug: string;
    frontmatter: Record<string, unknown>;
  }> {
    for (const lang of LANGS) {
      const metas = await this.list(lang);
      for (const m of metas) {
        const raw = await readFileSafe(this.pathFor(lang, m.slug));
        if (raw === null) continue;
        yield { lang, slug: m.slug, frontmatter: parseFile(raw).frontmatter };
      }
    }
  }

  private guardSlug(slug: string): void {
    const err = validateSlug(slug);
    if (err) throw new Error(err.message);
  }

  private async atomicWrite(p: string, text: string): Promise<void> {
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, text, 'utf8');
    await fs.rename(tmp, p);
  }
}
