import { useCallback } from 'react';
import { DICTS, type UiLang } from './dicts.js';
import { useUI } from '../store/ui.js';

/** Translate a key, with optional {param} interpolation. */
export function translate(lang: UiLang, key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[lang] ?? DICTS.zh;
  let text = dict[key] ?? DICTS.zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export function useI18n() {
  const lang = useUI((s) => s.uiLang);
  const setLang = useUI((s) => s.setUiLang);
  const t = useCallback((key: string, params?: Record<string, string | number>) => translate(lang, key, params), [lang]);
  return { t, lang, setLang };
}
