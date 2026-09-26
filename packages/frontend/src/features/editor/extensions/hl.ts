/**
 * `hl` mark — the theme's inline `{{% hl <color> %}}…{{% /hl %}}` shortcode,
 * editable like bold or italic. The colour is the shortcode's first argument
 * (`orange` / `yellow` / `blue` / `green`); the exact span the theme emits is
 * reproduced in `renderHTML`, so the editor shows the same highlight as the blog.
 */
import { Mark, mergeAttributes } from '@tiptap/core';
import { HL_COLOR_MAP } from '@blog-writer/shared';
import type { CommandCtx } from './commands.js';

export const HL_COLORS = Object.keys(HL_COLOR_MAP);

export const Hl = Mark.create({
  name: 'hl',
  inclusive: false,
  excludes: '',

  addAttributes() {
    return {
      color: {
        default: '',
        parseHTML: (el) => {
          const m = /color:\s*(#[0-9a-fA-F]{3,6})/.exec(el.getAttribute('style') ?? '');
          if (!m) return '';
          const found = Object.entries(HL_COLOR_MAP).find(([, hex]) => hex.toLowerCase() === m[1]!.toLowerCase());
          return found ? found[0] : '';
        },
        renderHTML: (attrs) => (attrs.color ? { style: `color: ${HL_COLOR_MAP[String(attrs.color)] ?? '#2979FF'}` } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span.hl-shortcode' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'hl-shortcode', style: `font-weight: bold;${HTMLAttributes.style ?? ''}` }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleHl:
        (color: string) =>
        ({ commands }: CommandCtx) =>
          commands.setMark(this.name, { color }),
    };
  },
});
