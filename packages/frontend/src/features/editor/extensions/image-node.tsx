/**
 * `image` — `![alt](src "title")` as an inline atom, so images display inline
 * exactly where they sit in the source (the same paragraph as the text around
 * them, or alone — CSS centres a lone image like the blog's figure). The
 * theme's `?width=` / `?height=` query params become an inline style, mirroring
 * the theme's own render-image hook.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { CSSProperties } from 'react';
import type { CommandCtx } from './commands.js';
import { resolveMediaUrl } from '../../../render/media-url.js';

/** Width/height query params -> inline style, mirroring render-image.html. */
function imageStyle(src: string): string {
  const qi = src.indexOf('?');
  if (qi === -1) return '';
  const q = new URLSearchParams(src.slice(qi + 1));
  const w = q.get('width');
  const h = q.get('height');
  let style = '';
  if (w) style += `width: ${/^\d+$/.test(w) ? `${w}px` : w};`;
  if (h) style += ` height: ${/^\d+$/.test(h) ? `${h}px` : h};`;
  return style.trim();
}

export interface ImageOptions {
  src: string;
  alt?: string;
  title?: string;
}

export const Image = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el) => el.getAttribute('src') ?? '',
        renderHTML: (attrs) => ({ src: resolveMediaUrl(String(attrs.src ?? '')) }),
      },
      alt: { default: '' },
      title: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-editor-image]' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },

  renderHTML({ HTMLAttributes, node }) {
    const src = String(node.attrs.src ?? '');
    const style = imageStyle(src);
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        'data-editor-image': '',
        alt: String(node.attrs.alt ?? ''),
        title: node.attrs.title ? String(node.attrs.title) : null,
        loading: 'lazy',
        style: style || null,
      }),
    ];
  },

  addCommands() {
    return {
      insertImage:
        (attrs: ImageOptions) =>
        ({ commands }: CommandCtx) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

function ImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const src = String(node.attrs.src ?? '');
  const alt = String(node.attrs.alt ?? '');
  const title = String(node.attrs.title ?? '');
  const [caption, setCaption] = useState(alt);
  const composing = useRef(false);
  useEffect(() => { if (!composing.current) setCaption(alt); }, [alt]);
  const query = new URLSearchParams(src.split('?')[1] ?? '');
  const dimension = (name: string) => {
    const value = query.get(name);
    return value ? (/^\d+$/.test(value) ? `${value}px` : value) : undefined;
  };
  const style: CSSProperties = { width: dimension('width'), height: dimension('height') };
  return (
    <NodeViewWrapper
      as="span"
      className={`image-atom${selected ? ' selected' : ''}`}
      contentEditable={false}
    >
      <img
        src={resolveMediaUrl(src)}
        alt={alt}
        title={title || undefined}
        loading="eager"
        decoding="async"
        style={style}
      />
      <input
        className="image-caption-input"
        value={caption}
        placeholder="Caption"
        aria-label="Image caption"
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(event) => {
          composing.current = false;
          setCaption(event.currentTarget.value);
          updateAttributes({ alt: event.currentTarget.value });
        }}
        onChange={(event) => {
          setCaption(event.target.value);
          if (!composing.current) updateAttributes({ alt: event.target.value });
        }}
        onBlur={() => { if (caption !== alt) updateAttributes({ alt: caption }); }}
        onMouseDown={(event) => event.stopPropagation()}
      />
    </NodeViewWrapper>
  );
}
