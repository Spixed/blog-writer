import { QMOJI_CDN } from '@blog-writer/shared';

/**
 * Post media references root-relative URLs (/process/img-1.png), which on
 * the built blog resolve against the site's own origin. Inside the editor the
 * origin is the app, so the display layer rewrites them to the backend's raw
 * static endpoint (/api/media/raw/..., proxied to the workspace server in
 * dev; served by the Electron/Tauri shell later - this helper is the single
 * place that assumption lives).
 *
 * Qmoji assets reference jsDelivr directly (same URLs the built blog uses).
 * jsDelivr is slow or unreachable on some networks, so the editor routes them
 * through the backend's disk-caching proxy (/api/qmoji/...) — bytes identical,
 * but served from disk after the first fetch.
 *
 * Rewriting happens at display time only: renderSource output stays
 * byte-comparable with Hugo for the block tests, and Markdown serialization
 * is never touched.
 */

const QMOJI_REMOTE = `${QMOJI_CDN}/`;

/** Map a jsDelivr qmoji URL to the backend's caching proxy. */
export function resolveQmojiUrl(url: string): string {
  if (url.startsWith(QMOJI_REMOTE)) return `/api/qmoji/${url.slice(QMOJI_REMOTE.length)}`;
  return url;
}

/** Map a root-relative media URL to the backend static endpoint. */
export function resolveMediaUrl(url: string): string {
  if (url.startsWith('/') && !url.startsWith('//')) return `/api/media/raw${url}`;
  return resolveQmojiUrl(url);
}

const MEDIA_ATTR = /\b(src|poster)="(\/(?!api\/)[^"\\/][^"]*)"/g;
// Qmoji output carries absolute CDN urls (img src, lottie data-lottie-path).
const QMOJI_ATTR =
  /\b(src|poster|data-lottie-path)="(https:\/\/cdn\.jsdelivr\.net\/gh\/Spixed\/Qmoji@main\/res\/[^"]*)"/g;

/**
 * Rewrite root-relative and qmoji CDN src/poster attributes in rendered HTML.
 *
 * Order matters: root-relative media must be rewritten BEFORE the qmoji pass.
 * QMOJI_ATTR turns absolute CDN urls into root-relative `/api/qmoji/...`
 * paths; if MEDIA_ATTR ran after it, it would match those freshly rewritten
 * attributes and double-prefix them into the broken
 * `/api/media/raw/api/qmoji/...`. The `(?!api\/)` lookahead additionally keeps
 * the media pass idempotent for already-proxied URLs.
 */
export function resolveMediaHtml(html: string): string {
  return html
    .replace(MEDIA_ATTR, (_m, attr: string, p: string) => `${attr}="${resolveMediaUrl(p)}"`)
    .replace(QMOJI_ATTR, (_m, attr: string, u: string) => `${attr}="${resolveQmojiUrl(u)}"`);
}
