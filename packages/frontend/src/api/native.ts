/**
 * Access to the Electron preload bridge (electron/preload.cjs). Everything is
 * optional so the same bundle keeps working under the plain dev server, where
 * `window.blogWriter` does not exist and folder picking degrades to typing.
 */

export interface BlogWriterBridge {
  chooseDirectory: () => Promise<string | null>;
}

declare global {
  interface Window {
    blogWriter?: BlogWriterBridge;
  }
}

export function bridge(): BlogWriterBridge | null {
  return typeof window !== 'undefined' ? (window.blogWriter ?? null) : null;
}

/** Whether the OS folder picker is available in this environment. */
export function canPickDirectory(): boolean {
  return typeof bridge()?.chooseDirectory === 'function';
}

/** Open the native folder picker; resolves to an absolute path or null. */
export async function pickDirectory(): Promise<string | null> {
  const b = bridge();
  if (!b?.chooseDirectory) return null;
  try {
    return await b.chooseDirectory();
  } catch {
    return null;
  }
}

/** Extract a workspace name suggestion from an absolute blog path. */
export function suggestName(root: string): string {
  const parts = root.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
