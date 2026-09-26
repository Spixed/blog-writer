/**
 * Command typing for the custom editor extensions. `declare module` here is a
 * true augmentation (the import makes this a module and pins the specifier to
 * the real package; without it the declaration would shadow @tiptap/core with
 * an ambient stub and erase Node/Extension/mergeAttributes everywhere).
 */
import type { CommandProps, Commands } from '@tiptap/core';

/** The command context TipTap passes to every command (commands, editor, …). */
export type CommandCtx = CommandProps;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    hl: {
      /** Toggle the theme's inline highlight shortcode mark. */
      toggleHl: (color: string) => ReturnType;
    };
    ruby: {
      /** Insert an inline `{{< ruby "text" "rt" >}}` atom. */
      insertRuby: (attrs: { text: string; rt: string }) => ReturnType;
    };
    qmoji: {
      /** Insert an inline `{{< qq-emoji "name" >}}` atom. */
      insertQmoji: (name: string) => ReturnType;
    };
    image: {
      /** Insert an inline image node. */
      insertImage: (attrs: { src: string; alt?: string; title?: string }) => ReturnType;
    };
  }
}

export type { Commands };
