import { create } from 'zustand';
import { api } from '../api/index.js';

export type HugoStatus = 'idle' | 'starting' | 'running' | 'error';

const MAX_LINES = 500;

interface HugoState {
  open: boolean;
  status: HugoStatus;
  url: string | null;
  error: string | null;
  lines: string[];
  /** Bumped to force the iframe to reload (e.g. after saving a post). */
  refreshKey: number;
  panelPos: { x: number; y: number } | null;
  openPanel: () => Promise<void>;
  closePanel: () => Promise<void>;
  stopServer: () => Promise<void>;
  appendLine: (line: string) => void;
  syncStatus: (running: boolean, url?: string | null) => void;
  refresh: () => void;
  setPanelPos: (pos: { x: number; y: number }) => void;
}

export const useHugo = create<HugoState>((set, get) => ({
  open: false,
  status: 'idle',
  url: null,
  error: null,
  lines: [],
  refreshKey: 0,
  panelPos: null,

  openPanel: async () => {
    if (get().status === 'running') { set({ open: true }); return; }
    set({ open: true, status: 'starting', error: null, lines: [] });
    try {
      const r = await api.hugo('serve');
      if (r.ok) {
        set({ status: 'running', url: r.url ?? null });
      } else {
        set({ status: 'error', error: r.error ?? 'unknown' });
      }
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  closePanel: async () => {
    set({ open: false });
  },

  stopServer: async () => {
    set({ open: false, status: 'idle', url: null });
    try {
      await api.hugo('stop');
    } catch {
      // server may already be gone
    }
  },

  appendLine: (line) => {
    if (!line) return;
    set((s) => {
      const lines = [...s.lines, line];
      if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
      return { lines };
    });
  },

  syncStatus: (running, url) => {
    set({ status: running ? 'running' : 'idle', url: running ? url ?? null : null });
  },

  refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  setPanelPos: (panelPos) => set({ panelPos }),
}));
