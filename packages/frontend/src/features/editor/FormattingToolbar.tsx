/**
 * The fixed formatting toolbar above the WYSIWYG surface. Every button
 * subscribes to editor state itself (`useEditorState`), so highlight states
 * follow the selection even when the surrounding component does not re-render.
 */

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Code2,
  List,
  ListOrdered,
  Plus,
  Quote,
  Sigma,
  Smile,
  SquareCode,
  Table2,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SelectMenu } from '../../components/SelectMenu.js';
import { useI18n } from '../../i18n/useI18n.js';
import { formatCombo } from '../../platform.js';
import { HL_COLORS } from './extensions/hl.js';

export function FormattingToolbar({
  editor,
  onOpenQmoji,
  onOpenSlash,
  onRuby,
  onInlineMath,
}: {
  editor: Editor;
  onOpenQmoji: () => void;
  onOpenSlash: () => void;
  onRuby: () => void;
  onInlineMath: () => void;
}) {
  const { t } = useI18n();
  const [hlOpen, setHlOpen] = useState(false);

  return (
    <div className="format-toolbar">
      <div className="ft-group">
        <TBtn editor={editor} node="heading" attrs={{ level: 1 }} label="H1" />
        <TBtn editor={editor} node="heading" attrs={{ level: 2 }} label="H2" />
        <TBtn editor={editor} node="heading" attrs={{ level: 3 }} label="H3" />
        <TBtn editor={editor} node="heading" attrs={{ level: 4 }} label="H4" />
        <TBtn editor={editor} node="heading" attrs={{ level: 5 }} label="H5" />
        <TBtn editor={editor} node="heading" attrs={{ level: 6 }} label="H6" />
      </div>
      <div className="ft-divider" />
      <div className="ft-group">
        <TBtn
          editor={editor}
          node="bulletList"
          label={<List size={16} />}
          title={t('slashBullet')}
        />
        <TBtn
          editor={editor}
          node="orderedList"
          label={<ListOrdered size={16} />}
          title={t('slashOrdered')}
        />
        <TBtn
          editor={editor}
          node="blockquote"
          label={<Quote size={16} />}
          title={t('slashQuote')}
        />
        <TBtn
          editor={editor}
          node="codeBlock"
          label={<SquareCode size={16} />}
          title={t('slashCode')}
        />
      </div>
      <div className="ft-divider" />
      <div className="ft-group">
        <TBtn
          editor={editor}
          mark="bold"
          label="B"
          className="bold"
          title={`Bold (${formatCombo('Mod+B')})`}
        />
        <TBtn
          editor={editor}
          mark="italic"
          label="I"
          className="italic"
          title={`Italic (${formatCombo('Mod+I')})`}
        />
        <TBtn editor={editor} mark="strike" label="S" className="strike" title="删除线" />
        <TBtn editor={editor} mark="code" label={<Code2 size={15} />} title={t('inlineCode')} />
        <HlButton editor={editor} open={hlOpen} onToggle={() => setHlOpen((v) => !v)} />
        <button
          type="button"
          title={t('slashRuby')}
          aria-label={t('slashRuby')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRuby}
        >
          あ
        </button>
        <button
          type="button"
          title={t('slashInlineMath')}
          aria-label={t('slashInlineMath')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onInlineMath}
        >
          <Sigma size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="ft-divider" />
      <div className="ft-group">
        <button
          type="button"
          className="ft-insert-qmoji"
          title={t('slashQmoji')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenQmoji}
        >
          <Smile size={16} aria-hidden="true" />
          <span>Qmoji</span>
        </button>
        <button
          type="button"
          className="ft-slash-command"
          title="Slash commands"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenSlash}
        >
          /
        </button>
      </div>
      <CodeLanguage editor={editor} />
      <TableControls editor={editor} />
      <AtomInspector editor={editor} onOpenQmoji={onOpenQmoji} />
      <div style={{ flex: 1 }} />
    </div>
  );
}

function TableControls({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => Boolean(current?.isActive('table')),
  });
  if (!active) return null;
  const chain = () => editor.chain().focus();
  return (
    <div className="table-controls">
      <button
        type="button"
        title="在上方插入行"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => chain().addRowBefore().run()}
      >
        <Plus size={13} />
        <ArrowUp size={13} />行
      </button>
      <button
        type="button"
        title="在下方插入行"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => chain().addRowAfter().run()}
      >
        <Plus size={13} />
        <ArrowDown size={13} />行
      </button>
      <button
        type="button"
        title="删除行"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => chain().deleteRow().run()}
      >
        <Trash2 size={13} />行
      </button>
      <span className="tc-sep" />
      <button
        type="button"
        title="在左侧插入列"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => chain().addColumnBefore().run()}
      >
        <Plus size={13} />
        <ArrowLeft size={13} />列
      </button>
      <button
        type="button"
        title="在右侧插入列"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => chain().addColumnAfter().run()}
      >
        <Plus size={13} />
        <ArrowRight size={13} />列
      </button>
      <button
        type="button"
        title="删除列"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => chain().deleteColumn().run()}
      >
        <Trash2 size={13} />列
      </button>
      <span className="tc-sep" />
      <button
        type="button"
        title="切换表头行"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => chain().toggleHeaderRow().run()}
      >
        <Table2 size={13} />
        表头
      </button>
      <button
        type="button"
        title="删除表格"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => chain().deleteTable().run()}
      >
        <Trash2 size={13} />
        表格
      </button>
    </div>
  );
}

/** Keep atom properties outside the document so inputs never steal its caret. */
function AtomInspector({ editor, onOpenQmoji }: { editor: Editor; onOpenQmoji: () => void }) {
  const selected = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const name = ['qmoji', 'ruby', 'image'].find((type) => current?.isActive(type));
      return name && current ? { name, attrs: current.getAttributes(name) } : null;
    },
  });
  if (!selected) return null;
  const { name, attrs } = selected;
  const update = (attributes: Record<string, string>) => {
    const from = editor.state.selection.from;
    editor.chain().updateAttributes(name, attributes).setNodeSelection(from).run();
  };
  const field = (key: string, label: string) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={String(attrs[key] ?? '')}
        onChange={(e) => update({ [key]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="atom-inspector" aria-label="选中内容设置">
      {name === 'qmoji' ? (
        <>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onOpenQmoji}>
            替换 Qmoji · {String(attrs.name)}
          </button>
          <SelectMenu
            label="Qmoji 显示方式"
            value={String(attrs.mode)}
            onChange={(mode) => update({ mode })}
            options={[
              { value: 'inline', label: '行内' },
              { value: 'block', label: '独立成行' },
            ]}
          />
        </>
      ) : name === 'ruby' ? (
        field('rt', '注音')
      ) : (
        <>
          {field('src', '图片地址')}
          {field('title', '图片标题')}
        </>
      )}
    </div>
  );
}

function CodeLanguage({ editor }: { editor: Editor }) {
  const language = useEditorState({
    editor,
    selector: (snap) => {
      if (!snap.editor?.isActive('codeBlock')) return null;
      return String(snap.editor.getAttributes('codeBlock').language ?? '');
    },
  });
  if (language === null) return null;
  const common = [
    '',
    'javascript',
    'typescript',
    'python',
    'bash',
    'json',
    'html',
    'css',
    'markdown',
    'go',
    'rust',
    'cpp',
    'java',
    'sql',
  ];
  const value = common.includes(language) ? language : '__custom__';
  return (
    <div className="code-language-control">
      <span>Language</span>
      <SelectMenu
        label="代码语言"
        value={value}
        onChange={(next) => {
          editor
            .chain()
            .focus()
            .updateAttributes('codeBlock', { language: next === '__custom__' ? language : next })
            .run();
        }}
        options={[
          ...common.map((item) => ({ value: item, label: item || 'Plain text' })),
          ...(!common.includes(language) ? [{ value: '__custom__', label: language }] : []),
        ]}
      />
      <input
        className="code-language-custom"
        value={language}
        placeholder="custom"
        onChange={(event) =>
          editor.chain().updateAttributes('codeBlock', { language: event.target.value }).run()
        }
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Custom code language"
      />
    </div>
  );
}

/** A mark/node toggle button whose `active` state tracks the live selection. */
function TBtn({
  editor,
  mark,
  node,
  attrs,
  label,
  className,
  title,
}: {
  editor: Editor;
  mark?: string;
  node?: string;
  attrs?: Record<string, unknown>;
  label: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const active = useEditorState({
    editor,
    selector: (snap) => {
      if (!snap.editor) return false;
      return mark
        ? snap.editor.isActive(mark)
        : node
          ? snap.editor.isActive(node, attrs ?? {})
          : false;
    },
  });
  const run = () => {
    if (mark === 'bold') editor.chain().focus().toggleBold().run();
    else if (mark === 'italic') editor.chain().focus().toggleItalic().run();
    else if (mark === 'code') editor.chain().focus().toggleCode().run();
    else if (mark === 'strike') editor.chain().focus().toggleStrike().run();
    else if (node === 'heading')
      editor
        .chain()
        .focus()
        .toggleHeading({ level: Number(attrs?.level ?? 1) as 1 | 2 | 3 | 4 | 5 | 6 })
        .run();
    else if (node === 'bulletList') editor.chain().focus().toggleBulletList().run();
    else if (node === 'orderedList') editor.chain().focus().toggleOrderedList().run();
    else if (node === 'blockquote') editor.chain().focus().toggleBlockquote().run();
    else if (node === 'codeBlock') editor.chain().focus().toggleCodeBlock().run();
  };
  return (
    <button
      type="button"
      className={`${active ? 'active' : ''} ${className ?? ''}`.trim()}
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );
}

/** The highlight button: click toggles, the caret opens a colour menu. */
function HlButton({
  editor,
  open,
  onToggle,
}: {
  editor: Editor;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const activeColor = useEditorState({
    editor,
    selector: (snap) => (snap.editor ? String(snap.editor.getAttributes('hl').color ?? '') : ''),
  });
  const caretRef = useRef<HTMLButtonElement>(null);
  // The menu is pinned to the viewport (position:fixed), so it must carry
  // coordinates measured from the caret button — `top:100%` on a fixed
  // element resolves against the viewport and lands off-screen.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const r = caretRef.current?.getBoundingClientRect();
      // Centre the menu on the caret button (inline translateX(-50%) pairs
      // with this) so the colour popover reads as attached to the control.
      if (r) setMenuPos({ top: r.bottom + 4, left: r.left + r.width / 2 });
    };
    update();
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest('.hl-colors') || e.target.closest('.ft-caret')) return;
      onToggle();
    };
    window.addEventListener('resize', update);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open, onToggle]);
  const pick = (color: string) => {
    editor.chain().focus().setMark('hl', { color }).run();
    onToggle();
  };
  return (
    <div className="ft-split">
      <button
        type="button"
        className={activeColor ? 'active' : ''}
        title={t('slashHl')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          activeColor
            ? editor.chain().focus().unsetMark('hl').run()
            : editor.chain().focus().setMark('hl', { color: HL_COLORS[0]! }).run()
        }
      >
        <span className="hl-swatch" style={{ background: colorHex(activeColor) }} />
      </button>
      <button
        ref={caretRef}
        type="button"
        className="ft-caret"
        title={t('slashHl')}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
      >
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && menuPos && (
        <div
          className="hl-colors"
          role="menu"
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            transform: 'translateX(-50%)',
          }}
        >
          {HL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitem"
              title={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
            >
              <span className="hl-swatch" style={{ background: colorHex(c) }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function colorHex(color: string): string {
  const map: Record<string, string> = {
    orange: '#FF3D00',
    yellow: '#FFD600',
    blue: '#2979FF',
    green: '#00E676',
  };
  return map[color] ?? '#2979FF';
}
