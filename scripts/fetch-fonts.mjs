/**
 * Download the editor theme's web fonts and vendor them locally under
 * packages/frontend/public/fonts, so the packaged app never depends on
 * fonts.loli.net / fontsapi.zeoseven.com at runtime (offline-friendly and
 * fast). Idempotent: files already on disk are not re-downloaded.
 *
 * Sources (must match what themes/polymer loads in production):
 *  - fonts.loli.net (Google Fonts mirror): Noto Sans SC, ZCOOL XiaoWei,
 *    Space Grotesk, Space Mono
 *  - fontsapi.zeoseven.com/442: Maple Mono NF CN (code face)
 *  - fontsapi.zeoseven.com/256: Huiwen-mincho (CJK heading face)
 *
 * Usage: node scripts/fetch-fonts.mjs   (or bun scripts/fetch-fonts.mjs)
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('packages/frontend/public/fonts');
const FILES_DIR = path.join(OUT_DIR, 'files');
// A Chrome UA makes Google Fonts (and mirrors) serve woff2 instead of ttf.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const SOURCES = [
  {
    name: 'google-fonts.css',
    url: 'https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@400;700;900&family=ZCOOL+XiaoWei&family=Space+Grotesk:wght@300;700;900&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap',
  },
  { name: 'zeoseven-442.css', url: 'https://fontsapi.zeoseven.com/442/main/result.css' },
  { name: 'zeoseven-256.css', url: 'https://fontsapi.zeoseven.com/256/main/result.css' },
];

const URL_RE = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

async function fetchWithRetry(url, init, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw new Error(`下载失败 (${url}): ${lastErr?.message ?? lastErr}`);
}

/** Deterministic local filename for a remote font URL. */
function localName(url) {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 16);
  const ext = path.extname(new URL(url).pathname).toLowerCase() || '.woff2';
  return `${hash}${ext === '.woff' || ext === '.woff2' || ext === '.ttf' || ext === '.otf' ? ext : '.woff2'}`;
}

async function main() {
  await fs.mkdir(FILES_DIR, { recursive: true });
  let total = 0;
  let downloaded = 0;

  for (const src of SOURCES) {
    const cssPath = path.join(OUT_DIR, src.name);
    try {
      const cachedCss = await fs.readFile(cssPath, 'utf8');
      const cachedFonts = [...cachedCss.matchAll(/url\(["']?\.\/files\/([^"')]+)["']?\)/g)].map(
        (match) => path.join(FILES_DIR, match[1]),
      );
      if (
        cachedFonts.length > 0 &&
        (
          await Promise.all(
            cachedFonts.map((file) =>
              fs.access(file).then(
                () => true,
                () => false,
              ),
            ),
          )
        ).every(Boolean)
      ) {
        console.log(`✓ ${src.name}: 本地缓存完整，跳过网络下载`);
        continue;
      }
    } catch {
      // Missing stylesheet: fetch it and its font files below.
    }

    const res = await fetchWithRetry(src.url, { headers: { 'User-Agent': UA } });
    let css = await res.text();

    const jobs = [];
    const base = new URL(src.url);
    css = css.replace(URL_RE, (_m, _q, raw) => {
      if (!/^https?:\/\//.test(raw) && !raw.startsWith('//')) {
        // Relative to the CSS itself (zeoseven serves ./hash.woff2 style urls).
        const abs = new URL(raw, base).href;
        const name = localName(abs);
        jobs.push({ url: abs, name });
        return `url("./files/${name}")`;
      }
      const url = raw.startsWith('//') ? `https:${raw}` : raw;
      const name = localName(url);
      jobs.push({ url, name });
      return `url("./files/${name}")`;
    });

    let done = 0;
    await Promise.all(
      Array.from({ length: 12 }, async function worker() {
        for (;;) {
          const job = jobs.shift();
          if (!job) return;
          const dest = path.join(FILES_DIR, job.name);
          try {
            await fs.access(dest);
          } catch {
            const r = await fetchWithRetry(job.url, { headers: { 'User-Agent': UA } });
            const buf = Buffer.from(await r.arrayBuffer());
            await fs.writeFile(dest, buf);
            total += buf.byteLength;
            downloaded++;
          }
          done++;
          if (done % 50 === 0) console.log(`  [${src.name}] ${done}/${done + jobs.length}`);
        }
      }),
    );

    await fs.writeFile(cssPath, css, 'utf8');
    console.log(`✓ ${src.name}: ${done} 个字体文件，共 ${downloaded} 个新下载`);
  }

  console.log(
    `完成。新增 ${downloaded} 个文件，本批总大小 ${(total / 1024 / 1024).toFixed(1)} MB → ${OUT_DIR}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
