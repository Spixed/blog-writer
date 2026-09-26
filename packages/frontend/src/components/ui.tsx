import { create } from 'zustand';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/* ---- toast store ------------------------------------------------------ */
interface ToastState {
  toasts: { id: number; text: string }[];
  push: (text: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (text) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2400);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ---- dialog ----------------------------------------------------------- */
export function Dialog({
  title,
  children,
  onClose,
  width,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: number;
}) {
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !(event.target as HTMLElement).closest('[role="menu"]')) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]') ?? [])]
        .filter((item) => item.getClientRects().length);
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, []);
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={root} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} style={width ? { maxWidth: width } : undefined}>
        <div className="dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="dialog-close" aria-label="关闭" onClick={onClose}><X size={17} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="actions">{children}</div>;
}

/* ---- tag input -------------------------------------------------------- */
export function TagInput({
  values,
  suggestions,
  onChange,
  placeholder,
}: {
  values: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const listId = useId();
  return (
    <div className="tag-input">
      {values.map((v, i) => (
        <span key={`${v}-${i}`} className="tag-chip">
          {v}
          <button
            type="button"
            title="移除"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        list={listId}
        placeholder={placeholder ?? '输入后回车添加'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
            e.preventDefault();
            const val = (e.target as HTMLInputElement).value.trim().replace(/,$/, '');
            if (val && !values.includes(val)) onChange([...values, val]);
            (e.target as HTMLInputElement).value = '';
          } else if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
            if (values.length) onChange(values.slice(0, -1));
          }
        }}
        onBlur={(e) => {
          const val = e.target.value.trim();
          if (val && !values.includes(val)) onChange([...values, val]);
          e.target.value = '';
        }}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

/* ---- toggle ----------------------------------------------------------- */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label && <span>{label}</span>}
    </label>
  );
}
