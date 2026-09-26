/**
 * Server-side smoke test for the editor UI: renders <EditorArea> in every
 * editor mode (WYSIWYG / split / bilingual) and asserts the chrome structure.
 *
 * Two runtime quirks shape how state is driven:
 *  - zustand v5 hands useSyncExternalStore a server snapshot taken from the
 *    object the store config returned. Later setState (and even persist
 *    hydration) never replaces it, so renderToString cannot see setState.
 *    The test mutates that snapshot object in place instead.
 *  - TipTap's useEditor only creates an editor in the browser (an effect), so
 *    SSR covers the React tree, not the ProseMirror surface.
 *
 * Run: bun run test/ui-smoke.mts
 */

// ---- browser shims (must exist before any app module is imported) ------
const mem: Record<string, string> = {};
const g = globalThis as unknown as Record<string, unknown>;
g.window = globalThis;
g.matchMedia = () => ({
  matches: false,
  media: '',
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
});
g.localStorage = {
  getItem: (k: string) => (k in mem ? mem[k] : null),
  setItem: (k: string, v: string) => {
    mem[k] = String(v);
  },
  removeItem: (k: string) => {
    delete mem[k];
  },
  clear() {
    for (const k of Object.keys(mem)) delete mem[k];
  },
};
g.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0) as never;

const React = await import('react');
const path = await import('node:path');
const { renderToString } = await import('react-dom/server');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { EditorArea } = await import('../src/features/editor/EditorArea.tsx');
const { useUI } = await import('../src/store/ui.ts');
const { qk } = await import('../src/hooks/queries.js');

import type { PostContent, WorkspaceConfig } from '@blog-writer/shared';

// The store's SSR snapshot object (see header note).
const snapshot = useUI.getInitialState() as Record<string, unknown>;

const BODY = [
  '# 冒烟测试',
  '',
  '一些**加粗**与{{% hl %}}高亮{{% /hl %}}短码。',
  '',
  '$$E = mc^2$$',
  '',
  '```ts',
  'const x: number = 1;',
  '```',
  '',
  '{{< qq-emoji id="666" >}}',
].join('\r\n');

const POSTS: Record<string, PostContent> = {
  zh: {
    slug: 'smoke',
    lang: 'zh',
    raw: `---\r\ntitle: 冒烟\r\ndate: 2026-09-18T00:00:00Z\r\n---\r\n${BODY}`,
    frontmatter: { title: '冒烟', date: '2026-09-18T00:00:00Z' },
    frontmatterRaw: 'title: 冒烟\ndate: 2026-09-18T00:00:00Z',
    body: BODY,
  },
  en: {
    slug: 'smoke',
    lang: 'en',
    raw: `---\r\ntitle: Smoke\r\ndate: 2026-09-18T00:00:00Z\r\n---\r\n# Smoke\r\n`,
    frontmatter: { title: 'Smoke', date: '2026-09-18T00:00:00Z' },
    frontmatterRaw: 'title: Smoke\ndate: 2026-09-18T00:00:00Z',
    body: '# Smoke\r\n',
  },
};

const FIXTURE = process.env.BLOG_ROOT ?? path.resolve(import.meta.dir, '../../../fixtures/blog');

const CONFIG: WorkspaceConfig = {
  root: FIXTURE,
  contentDir: path.join(FIXTURE, 'content'),
  themeDir: path.join(FIXTURE, 'themes', 'polymer'),
  themeName: 'polymer',
  siteTitle: 'Smoke',
  defaultContentLanguage: 'zh',
  mathEngine: 'mathjax',
  math: true,
  qmojiMapping: [],
  categories: [],
  tags: [],
  authors: [],
  defaultAuthor: null,
} as unknown as WorkspaceConfig;

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
await qc.prefetchQuery({ queryKey: qk.post('zh', 'smoke'), queryFn: async () => POSTS.zh });
await qc.prefetchQuery({ queryKey: qk.post('en', 'smoke'), queryFn: async () => POSTS.en });
await qc.prefetchQuery({ queryKey: qk.config, queryFn: async () => CONFIG });
await qc.prefetchQuery({ queryKey: qk.taxonomy('categories'), queryFn: async () => [] });
await qc.prefetchQuery({ queryKey: qk.taxonomy('tags'), queryFn: async () => [] });

let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  FAIL ${msg}`);
    failed++;
  } else {
    console.log(`  ok   ${msg}`);
  }
}

type Mode = 'wysiwyg' | 'split' | 'bilingual';

function render(mode: Mode, fmPanelOpen = false): string {
  snapshot.editorMode = mode;
  snapshot.fmPanelOpen = fmPanelOpen;
  snapshot.uiLang = 'zh';
  snapshot.selected = { lang: 'zh', slug: 'smoke' };
  return renderToString(
    React.createElement(QueryClientProvider, { client: qc }, React.createElement(EditorArea)),
  );
}

console.log('ui-smoke: shared chrome');
{
  const html = render('wysiwyg');
  assert(html.includes('class="editor-header"'), 'editor header rendered');
  assert(html.includes('所见即所得'), 'mode label (zh)');
  assert(html.includes('即时渲染') && html.includes('双语翻译'), 'all three mode labels present');
  // React SSR splits interleaved text with `<!-- -->` markers; strip them first.
  assert(html.replace(/<!-- -->/g, '').includes('post/smoke.md'), 'slug shown in the header');
  assert(html.includes('class="seg mode-seg"'), 'mode segmented control');
}

console.log('ui-smoke: WYSIWYG mode');
{
  const html = render('wysiwyg');
  // The scroll container is the theme root so the theme's `.theme-root
  //   .content x` rules match the editor surface.
  assert(html.includes('class="wysiwyg-scroll theme-root"'), 'wysiwyg scroll container');
  assert(html.includes('class="wysiwyg-surface"'), 'wysiwyg surface mounts');
  assert(!html.includes('split-pane'), 'no split layout');
  assert(!html.includes('fm-floater'), 'front matter panel hidden by default');
}

console.log('ui-smoke: WYSIWYG + floating front matter');
{
  const html = render('wysiwyg', true);
  assert(html.includes('class="fm-floater"'), 'floating front matter panel');
  assert(html.includes('FRONT MATTER'), 'panel title');
}

console.log('ui-smoke: split mode');
{
  const html = render('split');
  assert(html.includes('class="split-pane"'), '.split-pane');
  assert(html.includes('class="split-divider"'), 'draggable divider');
  // The split source editor is CodeMirror now. SSR only renders the host div
  // — the EditorView mounts in a browser effect, so cm-editor never appears.
  assert(
    html.includes('class="markdown-source-editor markdown-source-input"'),
    'full-height CodeMirror source editor',
  );
  assert(html.includes('class="split-preview"'), 'preview column');
  assert(html.includes('class="preview-scroll theme-root"'), 'theme root on the preview scroller');
  assert(html.includes('class="content preview-prose"'), 'preview content column');
}

console.log('ui-smoke: bilingual mode');
{
  const html = render('bilingual');
  assert(html.includes('class="bilingual-split"'), '.bilingual-split');
  assert(html.includes('中文') && html.includes('English'), 'both language badges');
  assert(html.split('class="pane-head"').length - 1 === 2, 'two pane heads');
  assert(html.split('class="wysiwyg-scroll theme-root"').length - 1 === 2, 'two wysiwyg scrollers');
  assert(!html.includes('split-pane'), 'no split layout');
}

if (failed) {
  console.error(`ui-smoke: ${failed} FAILURE(S)`);
  process.exit(1);
}
console.log('ui-smoke: all assertions passed');
process.exit(0);
