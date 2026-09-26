import { useEffect, useState } from 'react';
import { useUI } from '../store/ui.js';

export function useResolvedTheme(): 'light' | 'dark' {
  const preference = useUI((state) => state.theme);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return preference === 'auto' ? (systemDark ? 'dark' : 'light') : preference;
}
