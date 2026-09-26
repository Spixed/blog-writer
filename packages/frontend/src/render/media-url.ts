/**
 * Post media references root-relative URLs (/process/img-1.png), which on
 * the built blog resolve against the site's own origin. Inside the editor the
 * origin is the app, so the display layer rewrites them to the backend's raw
 * static endpoint (/api/media/raw/..., proxied to the workspace server in
 * dev; served by the Electron/Tauri shell later - this helper is the single
 * place that assumption lives).
 *
 * Rewriting happens at display time only: renderSource output stays
 * byte-comparable with Hugo for the block tests, and Markdown serialization
 * is never touched.
 */

/** Map a root-relative media URL to the backend static endpoint. */
export function resolveMediaUrl(url: string): string {
  if (url.startsWith('/') && !url.startsWith('//')) return '/api/media/raw' + url;
  return url;
}

const MEDIA_ATTR = /\b(src|poster)="(\/[^"\\/][^"]*)"/g;

/** Rewrite root-relative src/poster attributes in rendered HTML. */
export function resolveMediaHtml(html: string): string {
  return html.replace(MEDIA_ATTR, (_m, attr: string, p: string) => attr + '="' + resolveMediaUrl(p) + '"');
}