import { useEffect, useRef } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { Compartment, EditorSelection, EditorState, Transaction, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder, lineNumbers, highlightActiveLine, drawSelection, highlightWhitespace, Decoration, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { defaultHighlightStyle, syntaxHighlighting, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, openSearchPanel, closeSearchPanel } from '@codemirror/search';
import { useUI } from '../../store/ui.js';

export interface MarkdownSourceEditorProps { value: string; onChange: (value: string) => void; placeholder?: string; scrollerRef?: (el: HTMLElement | null) => void; scrollKey?: string; }
const shortcodeMarks = Decoration.mark({ class: 'cm-blog-shortcode' });
const shortcodeHighlight = ViewPlugin.fromClass(class {
  decorations;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view); }
  build(view: EditorView) { const b = new RangeSetBuilder<Decoration>(); const re = /\{\{[<%][\s\S]*?[>%]\}\}/g; for (const { from, to } of view.visibleRanges) { const text = view.state.sliceDoc(from, to); let m; while ((m = re.exec(text))) b.add(from + m.index, from + m.index + m[0].length, shortcodeMarks); } return b.finish(); }
}, { decorations: (v) => v.decorations });

/** Typing a Markdown emphasis character with a selection wraps it instead of
 *  replacing it (brackets and quotes are handled by closeBrackets already). */
const WRAP_CHARS: Record<string, string> = { '*': '*', '_': '_', '~': '~' };
const wrapSelection = EditorView.inputHandler.of((view, from, to, text) => {
  const wrap = WRAP_CHARS[text];
  if (!wrap || from === to || view.composing) return false;
  view.dispatch(view.state.changeByRange((range) => ({
    changes: [{ from: range.from, insert: wrap }, { from: range.to, insert: wrap }],
    range: EditorSelection.range(range.from + wrap.length, range.to + wrap.length),
  })));
  return true;
});

/** Pair inline math delimiters while keeping the caret between the dollars. */
const pairMathDelimiter = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '$' || from !== to || view.composing) return false;
  if (view.state.sliceDoc(from, from + 1) === '$') {
    view.dispatch({ selection: { anchor: from + 1 } });
    return true;
  }
  view.dispatch({ changes: { from, to, insert: '$$' }, selection: { anchor: from + 1 } });
  return true;
});

const theme = EditorView.theme({ '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--app-text)' }, '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--app-mono)', fontSize: '13px', lineHeight: '1.65' }, '.cm-content': { padding: '14px 16px 28px', minHeight: '100%' }, '.cm-gutters': { backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)', border: 'none', borderRight: '1px solid var(--app-border)', paddingLeft: '8px' }, '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--app-accent) 7%, transparent)' }, '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--app-accent) 10%, transparent)' }, '.cm-tooltip': { zIndex: '30' } });

const wrapCompartment = new Compartment();

/** Per-post view state: scroll offset plus the caret, so switching posts and
 *  back returns to the editing site instead of the first line. */
const scrollCache = new Map<string, { scroll: number; anchor: number; head: number }>();
export function MarkdownSourceEditor({ value, onChange, placeholder, scrollerRef, scrollKey }: MarkdownSourceEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null); const viewRef = useRef<EditorView | null>(null); const onChangeRef = useRef(onChange); const valueRef = useRef(value); onChangeRef.current = onChange;
  const applyingExternal = useRef(false);
  const pendingRestore = useRef<(() => void) | null>(null);
  const sourceWrap = useUI((s) => s.sourceWrap);
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const saveState = (v: EditorView) => {
      // Skip detached DOMs: React may run cleanup after unmounting the host,
      // and a detached scroller reports scrollTop 0, which would poison the
      // cache and lose the position of the post being switched away from.
      if (!scrollKey || !v.scrollDOM.isConnected) return;
      const s = v.state.selection.main;
      scrollCache.set(scrollKey, { scroll: v.scrollDOM.scrollTop, anchor: s.anchor, head: s.head });
    };
    const update = EditorView.updateListener.of((u) => { if (u.docChanged) { const next = u.state.doc.toString(); valueRef.current = next; if (!applyingExternal.current) { onChangeRef.current(next); saveState(u.view); } } });
    const extensions: Extension[] = [lineNumbers(), history(), drawSelection(), highlightWhitespace(), highlightActiveLine(), indentOnInput(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }), markdown({ base: markdownLanguage, codeLanguages: languages }), shortcodeHighlight, closeBrackets(), wrapSelection, pairMathDelimiter, keymap.of([...closeBracketsKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab, { key: 'Mod-f', run: (v) => { openSearchPanel(v); return true; } }, { key: 'Escape', run: (v) => closeSearchPanel(v) }]), wrapCompartment.of(sourceWrap ? EditorView.lineWrapping : []), theme, cmPlaceholder(placeholder ?? ''), update];
    const view = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: host }); viewRef.current = view; view.scrollDOM.classList.add('markdown-source-input');
    if (scrollKey) {
      // Restore once the first layout has happened: assigning scrollTop (or a
      // selection) before CodeMirror has measured its viewport is clamped away
      // and lost. The restore must also wait for the draft-restore chain
      // (usePostEditor re-feeds the unsaved draft through a full document
      // replace, which would otherwise wipe the restored caret) — so it is
      // parked in `pendingRestore` and the replace fires it when done; the
      // rAF below is only a fallback for views without a pending replace.
      const saved = scrollCache.get(scrollKey);
      const restore = () => {
        if (viewRef.current !== view) return;
        if (saved) {
          const max = view.state.doc.length;
          if (saved.anchor <= max) {
            view.dispatch({ selection: { anchor: Math.min(saved.anchor, max), head: Math.min(saved.head, max) } });
          }
          view.scrollDOM.scrollTop = saved.scroll;
        }
        saveState(view);
      };
      pendingRestore.current = restore;
      const frame = requestAnimationFrame(() => {
        // Fallback for views without a pending replace. Deliberately does NOT
        // clear `pendingRestore`: a rendering frame can land before the React
        // task that runs the draft replacement, and that replacement must
        // still fire the restore again on the new document.
        if (pendingRestore.current === restore) restore();
      });
      const saveScroll = () => saveState(view);
      // The cache is only maintained by live scroll/update events: a save in
      // the cleanup would run for freshly-mounted (and re-mounted) views with
      // scrollTop 0 — under React StrictMode every mount runs cleanup once —
      // and would erase the position we are about to restore.
      view.scrollDOM.addEventListener('scroll', saveScroll, { passive: true });
      scrollerRef?.(view.scrollDOM);
      return () => { cancelAnimationFrame(frame); if (pendingRestore.current === restore) pendingRestore.current = null; view.scrollDOM.removeEventListener('scroll', saveScroll); scrollerRef?.(null); view.destroy(); viewRef.current = null; };
    }
    scrollerRef?.(view.scrollDOM);
    return () => { scrollerRef?.(null); view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === valueRef.current) return;
    valueRef.current = value;
    // Suppress position caching while the replacement runs (the selection
    // mapping would park it at a doc boundary) and fire the pending
    // post-switch restore once the draft text is actually in the view.
    applyingExternal.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value }, annotations: Transaction.addToHistory.of(false) });
    applyingExternal.current = false;
    pendingRestore.current?.();
    pendingRestore.current = null;
  }, [value]);
  useEffect(() => { const view = viewRef.current; if (!view) return; view.dispatch({ effects: wrapCompartment.reconfigure(sourceWrap ? EditorView.lineWrapping : []) }); }, [sourceWrap]);
  return (
    <div ref={hostRef} className="markdown-source-editor markdown-source-input" aria-label="Markdown source">
      <button
        type="button"
        className={'source-wrap-toggle' + (sourceWrap ? ' active' : '')}
        aria-pressed={sourceWrap}
        title="自动换行"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => useUI.getState().setSourceWrap(!sourceWrap)}
      >
        <CornerDownLeft size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
