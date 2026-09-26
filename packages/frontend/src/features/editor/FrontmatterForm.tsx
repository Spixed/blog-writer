import { useEffect, useMemo, useRef, useState } from 'react';
import yaml from 'js-yaml';
import { CalendarDays } from 'lucide-react';
import {
  FIELD_SCHEMA,
  toDatetimeLocal,
  fromDatetimeLocal,
  validateFrontmatter,
} from '@blog-writer/shared';
import type { Frontmatter } from '@blog-writer/shared';
import { useConfig, useTaxonomy } from '../../hooks/queries.js';
import { TagInput, Toggle } from '../../components/ui.js';
import { SelectMenu } from '../../components/SelectMenu.js';
import { useI18n } from '../../i18n/useI18n.js';

interface Props {
  frontmatter: Frontmatter;
  onChange: (next: Frontmatter) => void;
}

export function FrontmatterForm({ frontmatter, onChange }: Props) {
  const { t } = useI18n();
  const config = useConfig();
  const cats = useTaxonomy('categories');
  const tags = useTaxonomy('tags');
  const errors = useMemo(() => validateFrontmatter(frontmatter), [frontmatter]);
  const errFor = (key: string) => errors.find((e) => e.field === key);

  const set = <K extends keyof Frontmatter>(key: K, value: Frontmatter[K]) =>
    onChange({ ...frontmatter, [key]: value });

  return (
    <div className="fm-body">
      {errors.length > 0 && (
        <div className="fm-errors">
          <span className="badge draft">{t('fmValidation', { n: errors.length })}</span>
        </div>
      )}
      <div className="fm-grid">
        {FIELD_SCHEMA.filter((f) => f.group !== 'advanced').map((f) => (
          <div key={String(f.key)} className={`field ${f.type === 'textarea' ? 'full' : ''}`}>
            <label>{t(`fm.${f.key}`,)}</label>
            {f.type === 'text' && (
              <input
                type="text"
                value={String(frontmatter[f.key as keyof Frontmatter] ?? '')}
                placeholder={f.placeholder}
                onChange={(e) => set(f.key as never, e.target.value)}
              />
            )}
            {f.type === 'textarea' && (
              <textarea
                value={String(frontmatter[f.key as keyof Frontmatter] ?? '')}
                placeholder={f.placeholder}
                onChange={(e) => set(f.key as never, e.target.value)}
              />
            )}
            {f.type === 'datetime' && (
              <DatetimeField
                value={toDatetimeLocal(frontmatter[f.key as keyof Frontmatter]) ?? ''}
                onCommit={(local) => {
                  const next = fromDatetimeLocal(local);
                  // Partial states while the user is still typing a segment
                  // (e.g. a half-entered year) parse to garbage or nothing —
                  // keep the current value instead of writing an empty one.
                  if (next) set(f.key as never, next as never);
                }}
              />
            )}
            {f.type === 'boolean' && (
              <Toggle
                checked={Boolean(frontmatter[f.key as keyof Frontmatter])}
                onChange={(v) => set(f.key as never, v as never)}
              />
            )}
            {f.type === 'number' && (
              <input
                type="number"
                value={String(frontmatter[f.key as keyof Frontmatter] ?? 0)}
                onChange={(e) => set(f.key as never, Number(e.target.value) as never)}
              />
            )}
            {f.type === 'select' && f.optionsFrom === 'authors' && (
              <SelectMenu label={t(`fm.${f.key}`)} value={String(frontmatter[f.key as keyof Frontmatter] ?? '')}
                onChange={(author) => set(f.key as never, author as never)}
                options={[{ value: '', label: '—' }, ...(config.data?.authors ?? []).map((a) => ({ value: a.key, label: a.nickname ?? a.name }))]} />
            )}
            {(f.type === 'multiselect' || (f.type === 'select' && f.optionsFrom !== 'authors')) && (
              <TagInput
                values={(frontmatter[f.key as keyof Frontmatter] as string[]) ?? []}
                suggestions={
                  f.optionsFrom === 'categories'
                    ? cats.data ?? []
                    : f.optionsFrom === 'tags'
                      ? tags.data ?? []
                      : []
                }
                onChange={(v) => set(f.key as never, v as never)}
              />
            )}
            {errFor(String(f.key)) && (
              <span className="err">{t(`err.${errFor(String(f.key))!.code}`)}</span>
            )}
          </div>
        ))}
        {FIELD_SCHEMA.filter((f) => f.group === 'advanced').map((f) => (
          <div key={String(f.key)} className="field">
            <label>{t(`fm.${f.key}`)}</label>
            {f.type === 'number' && (
              <input
                type="number"
                value={String(frontmatter[f.key as keyof Frontmatter] ?? 0)}
                onChange={(e) => set(f.key as never, Number(e.target.value) as never)}
              />
            )}
          </div>
        ))}
      </div>
      <RawFrontmatter frontmatter={frontmatter} onChange={onChange} />
    </div>
  );
}

/**
 * Segmented date-time editor: [YYYY]-[MM]-[DD] [HH]:[MM].
 *
 * Chrome's native datetime-local cannot do "jump to the month after four
 * digits": its year segment buffers up to six digits (extra digits silently
 * widen the year to 199803…), and the closed shadow root plus untrusted-event
 * rules make segment focus unreachable from JS. This field owns the segments:
 * four digits jump to the month, two digits jump through month/day/hour/
 * minute, Backspace on an empty segment steps back, Arrow keys walk segments,
 * and every fully-valid assembly commits live. A hidden datetime-local proxy
 * driven by showPicker() keeps the calendar dropdown where available.
 */
const DT_ORDER = ['y', 'mo', 'd', 'h', 'mi'] as const;
type DtKey = (typeof DT_ORDER)[number];
const DT_MAX: Record<DtKey, number> = { y: 4, mo: 2, d: 2, h: 2, mi: 2 };

function splitDatetimeLocal(v: string): Record<DtKey, string> {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  return m
    ? { y: m[1]!, mo: m[2]!, d: m[3]!, h: m[4]!, mi: m[5]! }
    : { y: '', mo: '', d: '', h: '', mi: '' };
}

function segmentValid(key: DtKey, raw: string, segs: Record<DtKey, string>): boolean {
  if (!/^\d+$/.test(raw) || raw.length !== DT_MAX[key]) return false;
  const n = Number(raw);
  if (key === 'y') return n >= 1000;
  if (key === 'mo') return n >= 1 && n <= 12;
  if (key === 'h') return n <= 23;
  if (key === 'mi') return n <= 59;
  if (key === 'd') {
    if (n < 1) return false;
    const y = Number(segs.y);
    const mo = Number(segs.mo);
    if (y >= 1000 && mo >= 1 && mo <= 12) return n <= new Date(y, mo, 0).getDate();
    return n <= 31;
  }
  return true;
}

function DatetimeField({ value, onCommit }: { value: string; onCommit: (local: string) => void }) {
  const { t } = useI18n();
  const [segs, setSegs] = useState(() => splitDatetimeLocal(value));
  const [touched, setTouched] = useState(false);
  const editing = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<Partial<Record<DtKey, HTMLInputElement | null>>>({});
  const pickerRef = useRef<HTMLInputElement>(null);
  const canPick = typeof HTMLInputElement !== 'undefined' && 'showPicker' in HTMLInputElement.prototype;

  const allValid = DT_ORDER.every((k) => segmentValid(k, segs[k], segs));

  // External updates (post switch, draft restore, RAW YAML edit) reach the
  // segments only while the user is not editing the field.
  useEffect(() => {
    if (editing.current) return;
    setSegs((prev) => {
      const next = splitDatetimeLocal(value);
      return DT_ORDER.every((k) => prev[k] === next[k]) ? prev : next;
    });
  }, [value]);

  // Live commit whenever the whole assembly is valid and differs from the
  // model; invalid or partial states never reach the front matter.
  useEffect(() => {
    if (!allValid) return;
    const local = `${segs.y}-${segs.mo}-${segs.d}T${segs.h}:${segs.mi}`;
    if (local !== value) onCommit(local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segs, allValid, value]);

  const focusSeg = (k: DtKey) => {
    const el = segRefs.current[k];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const onSegInput = (k: DtKey, raw: string) => {
    setTouched(true);
    const digits = raw.replace(/\D/g, '').slice(0, DT_MAX[k]);
    setSegs((prev) => ({ ...prev, [k]: digits }));
    if (digits.length === DT_MAX[k]) {
      const idx = DT_ORDER.indexOf(k);
      if (idx < DT_ORDER.length - 1) focusSeg(DT_ORDER[idx + 1]!);
    }
  };

  const onSegKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, k: DtKey) => {
    const idx = DT_ORDER.indexOf(k);
    if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      focusSeg(DT_ORDER[idx - 1]!);
    } else if (e.key === 'ArrowRight' && idx < DT_ORDER.length - 1) {
      e.preventDefault();
      focusSeg(DT_ORDER[idx + 1]!);
    } else if (e.key === 'Backspace' && e.currentTarget.value === '' && idx > 0) {
      e.preventDefault();
      focusSeg(DT_ORDER[idx - 1]!);
    }
  };

  return (
    <div
      ref={wrapRef}
      className="dt-field"
      onFocus={() => {
        editing.current = true;
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          editing.current = false;
          // Leaving the field with an invalid/partial assembly discards the
          // draft segments — the last committed value comes back.
          if (!allValid) setSegs(splitDatetimeLocal(value));
        }
      }}
    >
      {DT_ORDER.map((k, i) => (
        <span key={k} className="dt-seg-wrap">
          {i > 0 && <span className="dt-sep">{i === 3 ? ' ' : i === 1 || i === 2 ? '-' : ':'}</span>}
          <input
            ref={(el) => {
              segRefs.current[k] = el;
            }}
            data-dt={k}
            className={'dt-seg' + (touched && !segmentValid(k, segs[k], segs) ? ' dt-invalid' : '')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={DT_MAX[k] + 1}
            size={DT_MAX[k]}
            aria-label={t(`dtSeg.${k}`)}
            value={segs[k]}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => onSegInput(k, e.target.value)}
            onKeyDown={(e) => onSegKeyDown(e, k)}
          />
        </span>
      ))}
      {canPick && (
        <>
          <input
            ref={pickerRef}
            type="datetime-local"
            className="dt-picker-proxy"
            aria-hidden="true"
            tabIndex={-1}
            value={value}
            onChange={(e) => {
              const local = e.target.value;
              if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) setSegs(splitDatetimeLocal(local));
            }}
          />
          <button
            type="button"
            className="dt-picker-btn"
            title={t('pickDateTime')}
            aria-label={t('pickDateTime')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              try {
                pickerRef.current?.showPicker();
              } catch {
                // showPicker can reject (unsupported/No user gesture) — ignore.
              }
            }}
          >
            <CalendarDays size={14} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

function RawFrontmatter({ frontmatter, onChange }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState(() => yaml.dump(frontmatter, { lineWidth: 0 }));
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  // Reflect form edits in the raw view, but never while it is being edited.
  useEffect(() => {
    if (focused.current) return;
    setText(yaml.dump(frontmatter, { lineWidth: 0 }));
  }, [frontmatter]);

  const commit = () => {
    try {
      const parsed = yaml.load(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        onChange(parsed as Frontmatter);
        setError(null);
      } else {
        setError('front matter must be an object');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--app-border)', padding: '0 12px 12px' }}>
      <details>
        <summary
          style={{
            cursor: 'pointer',
            padding: '6px 0',
            color: 'var(--app-text-muted)',
            fontFamily: 'var(--app-mono)',
            fontSize: 11,
          }}
        >
          {t('rawYaml')}
        </summary>
        <textarea
          className="body-editor"
          style={{ minHeight: 140, fontSize: 12 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={(e) => {
            focused.current = false;
            commit();
          }}
        />
        {error && (
          <div style={{ color: 'var(--app-danger)', fontSize: 11, marginTop: 4 }}>{error}</div>
        )}
      </details>
    </div>
  );
}
