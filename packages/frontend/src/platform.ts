/**
 * Platform helpers for cross-platform shortcut display. The editors already
 * bind `Mod-` (Tiptap) / `Mod-` (CodeMirror) which map to Ctrl on Windows and
 * Cmd on macOS automatically — only the *labels* need platform awareness.
 */

/** True on macOS / iOS where the primary modifier is Cmd. */
export function isApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

/** The primary modifier as shown to the user: ⌘ on Apple, Ctrl elsewhere. */
export function modLabel(): string {
  return isApple() ? '⌘' : 'Ctrl';
}

/**
 * Render a shortcut combo written with `Mod`/`Shift`/`Alt` into a
 * platform-correct label: "Mod+Shift+Z" → "⇧⌘Z" on Apple, "Ctrl+Shift+Z"
 * elsewhere. Plain keys pass through ("B" → "B").
 */
export function formatCombo(combo: string): string {
  const parts = combo.split('+').map((part) => part.trim());
  const key = parts.pop() ?? '';
  const hasShift = parts.includes('Shift');
  const hasAlt = parts.includes('Alt');
  const hasMod = parts.includes('Mod');
  const hasCtrl = parts.includes('Ctrl');
  if (isApple()) {
    return `${hasCtrl ? '^' : ''}${hasAlt ? '⌥' : ''}${hasShift ? '⇧' : ''}${hasMod ? '⌘' : ''}${prettyKey(key)}`;
  }
  // `Mod` renders as Ctrl off the Apple platform; a literal Ctrl passes through.
  return `${hasMod || hasCtrl ? 'Ctrl+' : ''}${hasAlt ? 'Alt+' : ''}${hasShift ? 'Shift+' : ''}${prettyKey(key)}`;
}

function prettyKey(key: string): string {
  const map: Record<string, string> = { Enter: '↵', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return map[key] ?? key;
}
