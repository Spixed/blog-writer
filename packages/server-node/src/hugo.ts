import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HugoResult } from '@blog-writer/shared';

const DEFAULT_PORT = 7842;

type OutputListener = (line: string) => void;
type StatusListener = (s: { running: boolean; url: string | null }) => void;

/**
 * Manages an optional `hugo server` / `hugo build` subprocess for the
 * "Hugo 校验/预览" feature. The in-app preview is rendered client-side; this
 * is the ground-truth check. Output lines are streamed to listeners so the UI
 * can show a live console next to the embedded preview iframe.
 */
export class HugoManager {
  private serveProc: ChildProcessWithoutNullStreams | null = null;
  private serveUrl: string | null = null;
  private outputListeners = new Set<OutputListener>();
  private statusListeners = new Set<StatusListener>();
  private readonly bin: string;

  constructor(bin?: string) {
    this.bin = bin ?? 'hugo';
  }

  get serving(): boolean {
    return this.serveProc !== null;
  }

  get url(): string | null {
    return this.serveUrl;
  }

  onOutput(listener: OutputListener): () => void {
    this.outputListeners.add(listener);
    return () => this.outputListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emitOutput(line: string): void {
    for (const l of this.outputListeners) l(line);
  }

  private emitStatus(): void {
    const s = { running: this.serving, url: this.serveUrl };
    for (const l of this.statusListeners) l(s);
  }

  async serve(root: string, port = DEFAULT_PORT): Promise<HugoResult> {
    if (this.serveProc) {
      return { ok: true, url: this.serveUrl ?? undefined };
    }
    return new Promise<HugoResult>((resolve) => {
      let settled = false;
      const finish = (r: HugoResult) => {
        if (!settled) {
          settled = true;
          resolve(r);
        }
      };
      try {
        const proc = spawn(
          this.bin,
          ['server', '-D', '--disableFastRender', '--bind', '127.0.0.1', '--port', String(port)],
          { cwd: root, shell: false },
        );
        this.serveProc = proc;
        this.emitStatus();

        const onLine = (line: string) => {
          if (!line) return;
          this.emitOutput(line);
          const avail = /Web Server is available at (http:\/\/\S+)/.exec(line);
          if (avail) {
            this.serveUrl = avail[1];
            this.emitStatus();
            finish({ ok: true, url: this.serveUrl });
          } else if (/Error|error while building/i.test(line)) {
            finish({ ok: false, error: 'Hugo 构建失败' });
          }
        };

        const split = (chunk: Buffer) => {
          for (const line of chunk.toString('utf8').split(/\r?\n/)) onLine(line);
        };
        proc.stdout.on('data', split);
        proc.stderr.on('data', split);
        proc.on('error', (err) => finish({ ok: false, error: `无法启动 hugo: ${err.message}` }));
        proc.on('exit', (code) => {
          this.serveProc = null;
          this.serveUrl = null;
          this.emitStatus();
          if (!settled) finish({ ok: false, error: `hugo 进程退出 (code ${code})` });
        });
        setTimeout(() => finish({ ok: false, error: '启动 hugo 超时' }), 30_000);
      } catch (err) {
        finish({ ok: false, error: (err as Error).message });
      }
    });
  }

  async stop(): Promise<HugoResult> {
    if (this.serveProc) {
      this.serveProc.kill('SIGTERM');
      this.serveProc = null;
      this.serveUrl = null;
      this.emitStatus();
    }
    return { ok: true };
  }

  async build(root: string): Promise<HugoResult> {
    return new Promise<HugoResult>((resolve) => {
      try {
        const proc = spawn(this.bin, ['--gc', '--renderToMemory'], { cwd: root, shell: false });
        let output = '';
        const collect = (chunk: Buffer) => {
          const text = chunk.toString('utf8');
          output += text;
          for (const line of text.split(/\r?\n/)) this.emitOutput(line);
        };
        proc.stdout.on('data', collect);
        proc.stderr.on('data', collect);
        proc.on('error', (err) =>
          resolve({ ok: false, error: `无法启动 hugo: ${err.message}`, output }),
        );
        proc.on('exit', (code) => {
          if (code === 0) resolve({ ok: true, output });
          else resolve({ ok: false, error: `hugo 构建失败 (code ${code})`, output });
        });
      } catch (err) {
        resolve({ ok: false, error: (err as Error).message });
      }
    });
  }

  /** Resolve a static/ asset path to a URL served by hugo (or disk path). */
  async resolveAsset(root: string, rel: string): Promise<string | null> {
    const p = path.join(root, 'static', rel);
    try {
      await fs.access(p);
      return p;
    } catch {
      return null;
    }
  }
}
