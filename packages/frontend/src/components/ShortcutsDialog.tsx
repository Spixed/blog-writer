/**
 * The shortcut cheatsheet. Opens from the top-bar keyboard button and with
 * Mod+/ — entries are written with `Mod` and rendered per platform, so macOS
 * readers see ⌘-combos while everyone else sees Ctrl.
 */
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/useI18n.js';
import { formatCombo, isApple, modLabel } from '../platform.js';
import { Dialog } from './ui.js';

interface ShortcutEntry {
  combo: string;
  label: string;
  /** Free-form note shown under the label (e.g. alternatives). */
  note?: ReactNode;
}

interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

function Kbd({ combo }: { combo: string }) {
  return <kbd className="shortcut-kbd">{formatCombo(combo)}</kbd>;
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const groups: ShortcutGroup[] = [
    {
      title: t('scGroupGlobal'),
      entries: [
        { combo: 'Mod+S', label: t('scSave') },
        { combo: 'Mod+Z', label: t('scUndo'), note: t('scUndoNote') },
        { combo: 'Mod+Shift+Z', label: t('scRedo'), note: isApple() ? undefined : t('scRedoNote') },
        { combo: 'Mod+/', label: t('scPanel') },
      ],
    },
    {
      title: t('scGroupSource'),
      entries: [
        { combo: 'Mod+F', label: t('scFind') },
        { combo: 'Enter', label: t('scFindNext') },
        { combo: 'Shift+Enter', label: t('scFindPrev') },
        { combo: 'Escape', label: t('scClose') },
      ],
    },
    {
      title: t('scGroupWysiwyg'),
      entries: [
        { combo: 'Mod+B', label: t('scBold') },
        { combo: 'Mod+I', label: t('scItalic') },
        { combo: 'Mod+Shift+S', label: t('scStrike') },
        { combo: 'Mod+E', label: t('scInlineCode') },
        { combo: '/', label: t('scSlash') },
        { combo: 'Tab', label: t('scIndent') },
        { combo: 'Mod+Enter', label: t('scApplyBlock'), note: t('scApplyBlockNote') },
      ],
    },
  ];
  return (
    <Dialog title={t('scTitle')} onClose={onClose} width={560}>
      <p className="shortcut-modhint">{t('scModHint', { mod: modLabel() })}</p>
      <div className="shortcut-groups">
        {groups.map((group) => (
          <section key={group.title} className="shortcut-group">
            <h3>{group.title}</h3>
            <ul>
              {group.entries.map((entry) => (
                <li key={entry.combo + entry.label}>
                  <span className="shortcut-desc">
                    {entry.label}
                    {entry.note && <small>{entry.note}</small>}
                  </span>
                  <span className="shortcut-keys">
                    <Kbd combo={entry.combo} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
