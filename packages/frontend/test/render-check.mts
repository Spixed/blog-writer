/**
 * Render-pipeline verification: runs every post body through the same
 * pipeline the preview worker uses and compares the result against the HTML
 * Hugo actually built (ground truth in .runtime/render-testsite/).
 *
 * Run: bun run test/render-check.mts
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { renderSource } from '../src/render/md.js';

const BLOG = process.env.BLOG_ROOT ?? path.resolve(import.meta.dir, '../../../fixtures/blog');
// hugo resolves a relative --destination against --source, so the built site
// lives next to the blog being built.
const BUILT = path.join(BLOG, '.runtime/render-testsite');

interface Post {
  lang: 'zh' | 'en';
  slug: string;
  body: string;
}

function splitBody(raw: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  return m ? m[2] : raw;
}

async function readPosts(): Promise<Post[]> {
  const posts: Post[] = [];
  for (const lang of ['zh', 'en'] as const) {
    const dir = path.join(BLOG, 'content', lang, 'post');
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md'));
    for (const name of names) {
      const raw = await fs.readFile(path.join(dir, name), 'utf8');
      posts.push({ lang, slug: name.slice(0, -3), body: splitBody(raw) });
    }
  }
  return posts;
}

async function readQmoji(): Promise<{ emojiId: string; describe: string; emojiType: number }[]> {
  const raw = await fs.readFile(path.join(BLOG, 'themes/polymer/data/qmoji/mapping.json'), 'utf8');
  return JSON.parse(raw);
}

/** Balanced extraction of the `<div class=content>` region from a built page. */
function extractContent(html: string): string | null {
  const marker = 'class=content>';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const from = html.indexOf('>', start) + 1;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0] === '<div') depth++;
    else {
      depth--;
      if (depth === 0) return html.slice(from, m.index);
    }
  }
  return null;
}

/** Hugo leaves passthrough math as literal text; the pipeline carries it in a
 * data attribute. Put it back as text so the comparison is apples-to-apples.
 * The theme's qq-emoji shortcode also emits inline <script> blocks which the
 * preview deliberately omits, so they are stripped from Hugo's side too. */
function inlineMath(html: string): string {
  return (
    html
      .replace(/<script[\s\S]*?<\/script>/g, '')
      // Hugo's passthrough keeps the original $ / $$ delimiters in the text, so
      // restore them around the TeX from the data attribute.
      .replace(
        /<(div|span) class="math-(inline|display)" data-math="([^"]*)"><\/\1>/g,
        (_m, _tag, kind: string, tex: string) => {
          const d = kind === 'display' ? '$$' : '$';
          return `${d}${tex
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')}${d}`;
        },
      )
      .replace(/<div class="more-marker">[^<]*<\/div>/g, '')
  );
}

function count(pattern: RegExp, s: string): number {
  const re = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  let n = 0;
  while (re.exec(s)) n++;
  return n;
}

function stripTags(s: string): string {
  // Hugo's HTML minifier drops spaces across block boundaries (e.g. "end.Next"
  // where the pipeline writes "end. Next"), so spaces hugging punctuation are
  // removed on both sides before comparing.
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, ' ')
    .replace(/\s*([.,;:!?。，；：！？])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drop code blocks: Hugo and the pipeline highlight with different engines,
 * and Hugo expands shortcodes inside fences only to un-expand them again in
 * the browser, so their raw text is not comparable. */
function stripCodeBlocks(html: string, quoted: boolean): string {
  const open = quoted ? '<div class="code-container">' : '<div class=code-container>';
  return html.replace(
    new RegExp(`${open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?<\\/div><\\/div>`, 'g'),
    '',
  );
}

/** The editor renders `<!--more-->` as a visible marker div (an editor-only
 * affordance); Hugo consumes the comment silently. And Hugo's qmoji
 * shortcodes embed inline replacement `<script>`s that the editor pipeline
 * does not emit. Neither is content, so drop them before comparing text. */
function stripNonContent(html: string): string {
  return html
    .replace(/<div class="?more-marker"?>[\s\S]*?<\/div>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');
}

/** Character-bigram Jaccard similarity; works for CJK (no word boundaries). */
function similarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / new Set([...A, ...B]).size;
}

interface Metrics {
  figure: number;
  code: number;
  hl: number;
  qmoji: number;
  ruby: number;
  table: number;
  img: number;
  blockquote: number;
}

function metrics(html: string): Metrics {
  return {
    figure: count(/<figure/g, html),
    code: count(/code-container/g, html),
    hl: count(/hl-shortcode/g, html),
    // Element-level count: each rendered qmoji references its res dir exactly
    // once (img src or lottie data path), which is immune to attribute quoting.
    qmoji: count(/Qmoji@main\/res\/\d+\//, html),
    ruby: count(/<ruby/g, html),
    table: count(/<table/g, html),
    img: count(/<img/g, html),
    blockquote: count(/<blockquote/g, html),
  };
}

const KEY: (keyof Metrics)[] = [
  'figure',
  'code',
  'hl',
  'qmoji',
  'ruby',
  'table',
  'img',
  'blockquote',
];

async function main(): Promise<void> {
  const [posts, qmoji] = await Promise.all([readPosts(), readQmoji()]);
  console.log(`posts: ${posts.length}, qmoji entries: ${qmoji.length}\n`);

  let problems = 0;
  let compared = 0;
  let skippedDrafts = 0;
  for (const post of posts) {
    const { html, hasMath } = await renderSource(post.body, { qmoji });

    // 1. Placeholder leaks must never survive rendering. Code blocks may
    // legitimately contain `{{` (e.g. GitHub Actions YAML, shortcode examples).
    const codeFree = html
      .replace(/<div class="code-container">[\s\S]*?<\/div><\/div>/g, '')
      .replace(/<code>[\s\S]*?<\/code>/g, '');
    const leaks: string[] = [];
    if (codeFree.includes('data-scph')) leaks.push('shortcode placeholder');
    if (codeFree.includes('data-fence')) leaks.push('fence placeholder');
    if (codeFree.includes('{{')) leaks.push('raw shortcode markup');
    if (leaks.length > 0) {
      console.log(`✗ ${post.lang}/${post.slug}: leaked ${leaks.join(', ')}`);
      problems++;
    }

    // 2. Structural comparison against Hugo's built HTML.
    const builtPath = path.join(
      BUILT,
      post.lang === 'en' ? 'en' : '',
      'post',
      post.slug,
      'index.html',
    );
    let built: string;
    try {
      built = await fs.readFile(builtPath, 'utf8');
    } catch {
      const sourcePath = path.join(BLOG, 'content', post.lang, 'post', `${post.slug}.md`);
      const source = await fs.readFile(sourcePath, 'utf8');
      if (/^---\s*\r?\n[\s\S]*?^draft:\s*true\s*$/im.test(source)) {
        skippedDrafts++;
        continue;
      }
      console.log(`✗ ${post.lang}/${post.slug}: Hugo output missing at ${builtPath}`);
      problems++;
      continue;
    }
    compared++;
    const content = extractContent(built);
    if (content === null) {
      console.log(`? ${post.lang}/${post.slug}: could not locate content in built page`);
      problems++;
      continue;
    }
    const hugo = inlineMath(content);

    const mine = inlineMath(html);
    const hugoNoCode = stripNonContent(stripCodeBlocks(hugo, false));
    const mineNoCode = stripNonContent(stripCodeBlocks(mine, true));
    const mh = metrics(hugoNoCode);
    const mm = metrics(mineNoCode);
    const mismatches = KEY.filter((k) => mh[k] !== mm[k]);
    const sim = similarity(stripTags(hugoNoCode), stripTags(mineNoCode));

    const mathInHugo = /\$[^\n$]+\$|\$\$|\\\(|\\\[/.test(stripTags(hugoNoCode));
    const mathOk = hasMath === mathInHugo;

    // 0.80: code fences are excluded from the comparison (Hugo and the
    // pipeline use different highlighters, see stripCodeBlocks), but the
    // minified Hugo page still leaks fragments of fence text (e.g. escaped
    // quotes inside strings) that the pipeline escapes differently. The
    // remaining text - every non-code block - must match near-verbatim.
    if (mismatches.length > 0 || sim < 0.8 || !mathOk) {
      console.log(
        `⚠ ${post.lang}/${post.slug}: sim=${sim.toFixed(3)} math=${hasMath}/${mathInHugo} ` +
          `diff=[${mismatches.map((k) => `${k} ${mh[k]}→${mm[k]}`).join(', ')}]`,
      );
      problems++;
    } else {
      console.log(`✓ ${post.lang}/${post.slug}: sim=${sim.toFixed(3)} structure ok`);
    }
  }

  if (compared === 0) {
    console.log('✗ No built Hugo pages were compared');
    problems++;
  }
  console.log(
    `\n${posts.length} posts rendered, ${compared} compared with Hugo, ${skippedDrafts} drafts skipped, ${problems} flagged`,
  );
  process.exit(problems > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
