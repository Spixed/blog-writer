import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { dropCapMeasurements } from '../../../render/external-scripts.js';

const key = new PluginKey<DecorationSet>('dropCap');

/** Layout belongs in decorations, never direct mutations of editable DOM. */
export const DropCap = Extension.create({
  name: 'dropCap',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, previous) => tr.getMeta(key) ?? previous.map(tr.mapping, tr.doc),
        },
        props: { decorations: (state) => key.getState(state) },
        view(view) {
          let frame = 0;
          let destroyed = false;
          const measure = () => {
            frame = 0;
            if (destroyed) return;
            const decorations: Decoration[] = [];
            dropCapMeasurements(view.dom).forEach((size, el) => {
              const pos = view.posAtDOM(el, 0) - 1;
              const node = pos >= 0 ? view.state.doc.nodeAt(pos) : null;
              if (node?.type.name === 'paragraph') {
                decorations.push(
                  Decoration.node(
                    pos,
                    pos + node.nodeSize,
                    { style: `--drop-cap-size: ${size}` },
                    { size },
                  ),
                );
              }
            });
            const current = key.getState(view.state)?.find() ?? [];
            if (
              current.length === decorations.length &&
              current.every(
                (d, i) =>
                  d.from === decorations[i]!.from &&
                  d.to === decorations[i]!.to &&
                  d.spec.size === decorations[i]!.spec.size,
              )
            )
              return;
            view.dispatch(
              view.state.tr
                .setMeta(key, DecorationSet.create(view.state.doc, decorations))
                .setMeta('addToHistory', false),
            );
          };
          const schedule = () => {
            if (!destroyed && !frame) frame = requestAnimationFrame(measure);
          };
          const observer = new ResizeObserver(schedule);
          observer.observe(view.dom);
          document.fonts?.ready.then(schedule);
          schedule();
          return {
            update: schedule,
            destroy() {
              destroyed = true;
              cancelAnimationFrame(frame);
              observer.disconnect();
            },
          };
        },
      }),
    ];
  },
});
