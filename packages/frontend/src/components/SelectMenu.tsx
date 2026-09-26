import type { LucideIcon } from 'lucide-react';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption<Value extends string> {
  value: Value;
  label: string;
  icon?: LucideIcon;
  detail?: string;
}

export function SelectMenu<Value extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
  disabled = false,
  popoverWidth,
  align = 'start',
}: {
  value: Value;
  options: readonly SelectOption<Value>[];
  onChange: (value: Value) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  popoverWidth?: number;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<React.CSSProperties | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];
  const CurrentIcon = current?.icon;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const button = trigger.current;
      const menu = popover.current;
      const host = root.current;
      if (!button || !menu || !host) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(popoverWidth ?? Math.max(rect.width, 176), innerWidth - 16);
      const left = Math.max(
        8,
        Math.min(align === 'end' ? rect.right - width : rect.left, innerWidth - width - 8),
      );
      const below = innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const placeAbove = below < Math.min(menu.scrollHeight, 160) && above > below;
      const maxHeight = Math.min(320, placeAbove ? above : below);
      const top = placeAbove
        ? Math.max(8, rect.top - Math.min(menu.scrollHeight, maxHeight) - 7)
        : rect.bottom + 7;
      const inherited = getComputedStyle(host);
      const style = { position: 'fixed', top, left, width, maxHeight } as React.CSSProperties &
        Record<string, string>;
      for (const token of [
        '--app-panel',
        '--app-panel-2',
        '--app-border',
        '--app-border-strong',
        '--app-accent',
        '--app-text',
        '--app-text-muted',
        '--app-shadow',
      ]) {
        style[token] = inherited.getPropertyValue(token);
      }
      setPosition(style);
    };
    updatePosition();
    popover.current
      ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
      ?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !popover.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      setPosition(null);
    };
  }, [open, popoverWidth, align]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [
      ...(popover.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    items[next]?.focus();
  };

  return (
    <div className={`select-menu ${className}`} ref={root} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        className="select-menu-trigger"
        aria-label={`${label}: ${current?.label ?? ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || !options.length}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {CurrentIcon && (
          <CurrentIcon
            aria-hidden="true"
            className="select-menu-leading"
            size={16}
            strokeWidth={1.8}
          />
        )}
        <span className="select-menu-value">{current?.label ?? label}</span>
        <ChevronDown
          aria-hidden="true"
          className="select-menu-chevron"
          size={15}
          strokeWidth={1.8}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={popover}
            className="select-menu-popover"
            role="menu"
            aria-label={label}
            onKeyDown={(event) => {
              event.stopPropagation();
              onKeyDown(event);
            }}
            style={position ?? { position: 'fixed', visibility: 'hidden' }}
          >
            <div className="select-menu-heading">{label}</div>
            {options.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.value === value}
                  className="select-menu-option"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    trigger.current?.focus();
                  }}
                >
                  {Icon && <Icon aria-hidden="true" size={16} strokeWidth={1.8} />}
                  <span className="select-menu-option-copy">
                    <span>{option.label}</span>
                    {option.detail && <small>{option.detail}</small>}
                  </span>
                  {option.value === value && (
                    <Check
                      aria-hidden="true"
                      className="select-menu-check"
                      size={15}
                      strokeWidth={2}
                    />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
