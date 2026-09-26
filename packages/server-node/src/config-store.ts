import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceInfo } from '@blog-writer/shared';

interface ConfigFile {
  version: number;
  workspaces: WorkspaceInfo[];
  active: string | null;
}

const CONFIG_VERSION = 1;

function configPath(): string {
  const dir = process.env.BLOG_WRITER_HOME || path.join(os.homedir(), '.blog-writer');
  return path.join(dir, 'config.json');
}

async function readConfig(): Promise<ConfigFile> {
  const p = configPath();
  try {
    const raw = await fs.readFile(p, 'utf8');
    const parsed = JSON.parse(raw) as ConfigFile;
    if (parsed.version === CONFIG_VERSION && Array.isArray(parsed.workspaces)) return parsed;
  } catch {
    // missing or invalid: fall through to defaults
  }
  return { version: CONFIG_VERSION, workspaces: [], active: null };
}

async function writeConfig(cfg: ConfigFile): Promise<void> {
  const p = configPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf8');
  await fs.rename(tmp, p);
}

export class WorkspaceStore {
  private cache: ConfigFile | null = null;

  private async get(): Promise<ConfigFile> {
    if (!this.cache) this.cache = await readConfig();
    return this.cache;
  }

  async list(): Promise<WorkspaceInfo[]> {
    return (await this.get()).workspaces;
  }

  async active(): Promise<WorkspaceInfo | null> {
    const cfg = await this.get();
    return cfg.workspaces.find((w) => w.name === cfg.active) ?? null;
  }

  async setActive(name: string): Promise<WorkspaceInfo> {
    const cfg = await this.get();
    const ws = cfg.workspaces.find((w) => w.name === name);
    if (!ws) throw new Error(`工作区不存在: ${name}`);
    cfg.active = name;
    await writeConfig(cfg);
    return ws;
  }

  async add(name: string, root: string): Promise<WorkspaceInfo> {
    const cfg = await this.get();
    if (cfg.workspaces.some((w) => w.name === name)) throw new Error(`工作区名已存在: ${name}`);
    const abs = path.resolve(root);
    const ws: WorkspaceInfo = { name, root: abs };
    cfg.workspaces.push(ws);
    if (!cfg.active) cfg.active = name;
    await writeConfig(cfg);
    return ws;
  }

  async remove(name: string): Promise<void> {
    const cfg = await this.get();
    cfg.workspaces = cfg.workspaces.filter((w) => w.name !== name);
    if (cfg.active === name) cfg.active = cfg.workspaces[0]?.name ?? null;
    await writeConfig(cfg);
  }

  /** Ensure a default workspace exists for a discovered blog root. */
  async ensureDefault(root: string, name = 'default'): Promise<WorkspaceInfo> {
    const cfg = await this.get();
    const abs = path.resolve(root);
    const existing = cfg.workspaces.find((w) => w.root === abs);
    if (existing) {
      if (!cfg.active) {
        cfg.active = existing.name;
        await writeConfig(cfg);
      }
      return existing;
    }
    return this.add(name, abs);
  }
}
