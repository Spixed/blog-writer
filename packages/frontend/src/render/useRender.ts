/**
 * Debounced markdown rendering in a Web Worker.
 *
 * `initRenderWorker` must be called once with the site's qmoji mapping before
 * rendering; it is a no-op afterwards (the worker is shared app-wide).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { QmojiEntry } from '@blog-writer/shared';

export interface RenderState {
  html: string;
  hasMath: boolean;
  loading: boolean;
  error?: string;
}

interface ReadyMsg {
  type: 'ready';
}
interface ResultMsg {
  type: 'result';
  id: number;
  html: string;
  hasMath: boolean;
  error?: string;
}
type OutMsg = ReadyMsg | ResultMsg;

let worker: Worker | null = null;
let seq = 0;
let currentQmoji: QmojiEntry[] = [];
interface PendingRender {
  source: string;
  markers: boolean;
  resolve: (msg: ResultMsg) => void;
  retries: number;
  timer?: ReturnType<typeof setTimeout>;
}
const pending = new Map<number, PendingRender>();
let qmojiSignature = '';
let workerRevision = 0;
const revisionListeners = new Set<() => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const instance = worker;
    worker.onmessage = (e: MessageEvent<OutMsg>) => {
      const msg = e.data;
      if (msg.type === 'ready') return;
      const request = pending.get(msg.id);
      if (request) {
        pending.delete(msg.id);
        clearTimeout(request.timer);
        request.resolve(msg);
      }
    };
    worker.onerror = (event) => recoverWorker(instance, event.message || '渲染进程加载失败');
    worker.onmessageerror = () => recoverWorker(instance, '渲染结果无法读取');
    worker.postMessage({ type: 'init', qmoji: currentQmoji });
  }
  return worker;
}

function recoverWorker(instance: Worker, reason: string): void {
  if (worker !== instance) return;
  instance.terminate();
  worker = null;
  for (const [id, request] of pending) {
    clearTimeout(request.timer);
    if (request.retries++ === 0) {
      sendRender(id, request);
    } else {
      pending.delete(id);
      request.resolve({ type: 'result', id, html: '', hasMath: false, error: reason });
    }
  }
}

function sendRender(id: number, request: PendingRender): void {
  try {
    const instance = getWorker();
    // Cold grammar loads can take seconds. Keep all parsing off the UI thread
    // and bound both attempts instead of leaving unresolved requests forever.
    request.timer = setTimeout(() => recoverWorker(instance, '渲染超时，请重试'), 15_000);
    instance.postMessage({ type: 'render', id, source: request.source, markers: request.markers });
  } catch (error) {
    clearTimeout(request.timer);
    pending.delete(id);
    request.resolve({ type: 'result', id, html: '', hasMath: false, error: String(error) });
  }
}

export function initRenderWorker(qmoji: QmojiEntry[]): void {
  const signature = JSON.stringify(qmoji);
  currentQmoji = qmoji;
  if (signature === qmojiSignature && worker) return;
  qmojiSignature = signature;
  try { getWorker().postMessage({ type: 'init', qmoji }); }
  catch { worker = null; } // renderNow reports unavailable workers as visible errors.
  workerRevision++;
  revisionListeners.forEach((listener) => listener());
}

/** Re-render block node views when the workspace shortcode mapping arrives. */
export function useRenderWorkerRevision(): number {
  return useSyncExternalStore(
    (listener) => {
      revisionListeners.add(listener);
      return () => revisionListeners.delete(listener);
    },
    () => workerRevision,
    () => 0,
  );
}

export function renderNow(source: string, markers = false): Promise<ResultMsg> {
  const id = ++seq;
  return new Promise((resolve) => {
    const request: PendingRender = { source, markers, resolve, retries: 0 };
    pending.set(id, request);
    sendRender(id, request);
  });
}

export function useRender(source: string | undefined, markers = false): RenderState & { retry: () => void } {
  const workerRevision = useRenderWorkerRevision();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RenderState>({
    html: '',
    hasMath: false,
    loading: false,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (source === undefined) {
      request.current++;
      setState({ html: '', hasMath: false, loading: false });
      return;
    }
    const requestId = ++request.current;
    setState((s) => ({ ...s, loading: true }));
    timer.current = setTimeout(() => {
      renderNow(source, markers).then((msg) => {
        if (request.current !== requestId) return;
        setState({ html: msg.html, hasMath: msg.hasMath, loading: false, error: msg.error });
      });
    }, 150);
    return () => {
      request.current++;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [source, markers, workerRevision, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
