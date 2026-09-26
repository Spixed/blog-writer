/**
 * Syntax highlighting matching the Polymer theme's current Chroma palette.
 * Languages are loaded on demand; unknown languages fall back to a plain,
 * palette-consistent <pre>.
 */
import { createHighlighter } from 'shiki';
import type { Highlighter, ThemeRegistrationRaw } from 'shiki';
import { escapeHtml } from './escape.js';

/** Polymer Dark expressed as a TextMate theme for the live preview. */
const CHROMA_MONOKAI: ThemeRegistrationRaw = {
  name: 'polymer-dark',
  type: 'dark',
  colors: {
    'editor.background': '#252529',
    'editor.foreground': '#d4d4d4',
  },
  settings: [
    { settings: { foreground: '#d4d4d4', background: '#252529' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#6a9955', fontStyle: 'italic' } },
    { scope: ['meta.preprocessor', 'punctuation.definition.directive'], settings: { foreground: '#c586c0', fontStyle: 'bold' } },
    { scope: ['keyword'], settings: { foreground: '#c586c0' } },
    { scope: ['storage'], settings: { foreground: '#c586c0' } },
    { scope: ['storage.type.built-in.primitive', 'storage.type'], settings: { foreground: '#569cd6' } },
    { scope: ['storage.type.string'], settings: { foreground: '#ce9178' } },
    // `from`/`import` are KeywordNamespace in Chroma (#f92672), unlike the
    // rest of the keyword family (#66d9ef).
    { scope: ['keyword.control.import'], settings: { foreground: '#c586c0' } },
    { scope: ['keyword.operator'], settings: { foreground: '#d4d4d4' } },
    { scope: ['constant.language'], settings: { foreground: '#c586c0' } },
    { scope: ['string'], settings: { foreground: '#ce9178' } },
    { scope: ['punctuation.definition.string', 'constant.character.format.placeholder'], settings: { foreground: '#ce9178' } },
    { scope: ['string.quoted.other.lt-gt.include'], settings: { foreground: '#ce9178', fontStyle: 'normal' } },
    { scope: ['constant.character.escape'], settings: { foreground: '#d7ba7d' } },
    { scope: ['constant.numeric'], settings: { foreground: '#b5cea8' } },
    {
      scope: ['entity.name.function'],
      settings: { foreground: '#dcdcaa' },
    },
    { scope: ['support.function'], settings: { foreground: '#dcdcaa' } },
    { scope: ['support.function.builtin.python'], settings: { foreground: '#4ec9b0' } },
    { scope: ['entity.name.class', 'support.class'], settings: { foreground: '#4ec9b0' } },
    { scope: ['entity.name.type', 'support.type'], settings: { foreground: '#569cd6' } },
    { scope: ['entity.other.attribute-name', 'variable.other.property'], settings: { foreground: '#9cdcfe' } },
    { scope: ['entity.name.tag'], settings: { foreground: '#9cdcfe' } },
    { scope: ['punctuation'], settings: { foreground: '#d4d4d4' } },
    { scope: ['invalid'], settings: { foreground: '#f44747' } },
  ],
};

let hlPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!hlPromise) {
    hlPromise = createHighlighter({ langs: [], themes: [CHROMA_MONOKAI] });
  }
  return hlPromise;
}

/** Shiki grammar aliases for names Hugo/Chroma accepts. */
const LANG_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  cc: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript',
  md: 'markdown',
  yml: 'yaml',
  text: '',
  plaintext: '',
  '': '',
};

function resolveLang(lang: string): string {
  const norm = lang.trim().toLowerCase();
  return LANG_ALIASES[norm] ?? norm;
}

const FALLBACK_PRE =
  '<pre tabindex="0" style="background-color:#252529;color:#d4d4d4"><code>';

export async function highlightCode(lang: string, code: string): Promise<string> {
  const hl = await getHighlighter();
  const resolved = resolveLang(lang);
  if (resolved) {
    try {
      if (!hl.getLoadedLanguages().includes(resolved)) {
        await hl.loadLanguage(resolved as never);
      }
      return hl.codeToHtml(code, { lang: resolved, theme: 'polymer-dark' });
    } catch {
      // unknown language -> plain fallback below
    }
  }
  return `${FALLBACK_PRE}${code.split('\n').map((line) => `<span class="line">${escapeHtml(line)}</span>`).join('\n')}</code></pre>`;
}
