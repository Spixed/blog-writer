/// <reference lib="webworker" />
/**
 * Render worker: keeps the markdown-it instance and the Shiki highlighter alive
 * off the main thread. Init must be called once with the site's qmoji mapping
 * (it is needed to resolve `{{< qq-emoji >}}` calls).
 */
import type { QmojiEntry } from '@blog-writer/shared';
import { type RenderContext, type RenderOutput, renderSource } from './md.js';

interface InitMsg {
  type: 'init';
  qmoji: QmojiEntry[];
}
interface RenderMsg {
  type: 'render';
  id: number;
  source: string;
  markers?: boolean;
}
type InMsg = InitMsg | RenderMsg;

const ctx: RenderContext = { qmoji: [] };

const post = (msg: unknown): void => {
  (self as unknown as { postMessage: (m: unknown) => void }).postMessage(msg);
};

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    ctx.qmoji = msg.qmoji;
    post({ type: 'ready' });
    return;
  }
  if (msg.type === 'render') {
    try {
      const out: RenderOutput = await renderSource(msg.source, ctx, { markers: msg.markers });
      post({ type: 'result', id: msg.id, html: out.html, hasMath: out.hasMath });
    } catch (err) {
      post({
        type: 'result',
        id: msg.id,
        html: '',
        hasMath: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
