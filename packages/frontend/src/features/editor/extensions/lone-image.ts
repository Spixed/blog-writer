import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

const key = new PluginKey<DecorationSet>('loneImage');

/**
 * A paragraph whose only inline content is an image reads like the blog's
 * figure and should be centred. CSS cannot express this — `:first-child` and
 * `:has()` ignore text nodes, so a paragraph mixing text and an image is
 * indistinguishable from a lone one — so tag the paragraphs here instead.
 * ProseMirror's separator/trailing-break elements are invisible to the check
 * because they are not document children.
 */
function build(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    if (node.childCount !== 1 || node.child(0)!.type.name !== 'image') return;
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'image-lone' }));
  });
  return DecorationSet.create(doc, decorations);
}

export const LoneImage = Extension.create({
  name: 'loneImage',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key,
      state: {
        init: (_, state) => build(state.doc),
        // Rebuild on content change only; the walk is linear and blog posts
        // are small, so this stays well under a frame.
        apply: (tr, previous) => (tr.docChanged ? build(tr.doc) : previous),
      },
      props: { decorations: (state) => key.getState(state) },
    })];
  },
});
