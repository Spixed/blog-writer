import { mergeAttributes, Node } from '@tiptap/core';
import type { CommandCtx } from './commands.js';

export interface RubyOptions {
  text: string;
  rt: string;
}

export const Ruby = Node.create({
  name: 'ruby',
  group: 'inline',
  content: 'text*',
  inline: true,
  selectable: true,

  addAttributes() {
    return { rt: { default: '' } };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-ruby]',
        contentElement: 'rb',
        getAttrs: (element) => ({
          rt: (element as HTMLElement).querySelector('rt')?.textContent ?? '',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-ruby': '', class: 'ruby-atom' }),
      [
        'ruby',
        {},
        ['rb', {}, 0],
        ['rt', { contenteditable: 'false' }, String(node.attrs.rt ?? '')],
      ],
    ];
  },

  addCommands() {
    return {
      insertRuby:
        (attrs: RubyOptions) =>
        ({ commands }: CommandCtx) =>
          commands.insertContent({
            type: this.name,
            attrs: { rt: attrs.rt },
            content: attrs.text ? [{ type: 'text', text: attrs.text }] : [],
          }),
    };
  },
});
