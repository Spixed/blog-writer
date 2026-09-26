import { mergeAttributes, Node } from '@tiptap/core';
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { typesetMath } from '../../../render/external-scripts.js';

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { tex: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span[data-inline-math]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-inline-math': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },
});

function MathInlineView({ node, updateAttributes }: NodeViewProps) {
  const tex = String(node.attrs.tex ?? '');
  const root = useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tex);
  useEffect(() => {
    if (root.current && !editing) typesetMath(root.current);
  }, [editing]);
  useEffect(() => setDraft(tex), [tex]);
  const save = () => {
    setEditing(false);
    if (draft !== tex) updateAttributes({ tex: draft });
  };
  return (
    <NodeViewWrapper
      as="span"
      className="inline-math-node"
      contentEditable={false}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <input
          aria-label="行内公式"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setDraft(tex);
              setEditing(false);
            }
            if (event.key === 'Enter') save();
          }}
        />
      ) : (
        <span ref={root}>
          <span className="math-inline" data-math={tex}>
            \({tex}\)
          </span>
        </span>
      )}
    </NodeViewWrapper>
  );
}
