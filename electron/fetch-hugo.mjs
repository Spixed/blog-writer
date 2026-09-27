/**
 * Download Hugo v0.166.0 (extended) for the current platform into
 * electron/resources/hugo/, where electron-builder's extraResources copies it
 * into the packaged app. The bundled binary backs the "Hugo 校验/预览" feature
 * so users don't need Hugo installed.
 *
 * Idempotent: skips the download when the staged binary already reports the
 * target version. Downloads try GitHub direct first, then well-known mirror
 * prefixes (settable via HUGO_MIRROR env, e.g. https://ghfast.top/).
 *
 * Usage: node electron/fetch-hugo.mjs   (or bun electron/fetch-hugo.mjs)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = '0.166.0';
const OUT_DIR = path.resolve('electron/resources/hugo');

const PLATFORMS = {
  'win32-x64': { asset: `hugo_extended_${VERSION}_windows-amd64.zip`, bin: 'hugo.exe' },
  'win32-arm64': { asset: `hugo_extended_${VERSION}_windows-arm64.zip`, bin: 'hugo.exe' },
  // Hugo publishes a universal installer package for both macOS CPU families.
  'darwin-x64': { asset: `hugo_extended_${VERSION}_darwin-universal.pkg`, bin: 'hugo' },
  'darwin-arm64': { asset: `hugo_extended_${VERSION}_darwin-universal.pkg`, bin: 'hugo' },
  'linux-x64': { asset: `hugo_extended_${VERSION}_linux-amd64.tar.gz`, bin: 'hugo' },
  'linux-arm64': { asset: `hugo_extended_${VERSION}_linux-arm64.tar.gz`, bin: 'hugo' },
};

function target() {
  const key = `${process.platform}-${process.env.BLOG_WRITER_TARGET_ARCH ?? os.arch()}`;
  const t = PLATFORMS[key];
  if (!t) throw new Error(`不支持的平台: ${key}`);
  return t;
}

function downloadUrls(asset) {
  const base = `https://github.com/gohugoio/hugo/releases/download/v${VERSION}/${asset}`;
  const urls = [base];
  const mirror = process.env.HUGO_MIRROR;
  if (mirror) urls.unshift(`${mirror.replace(/\/$/, '')}/${base}`);
  else urls.push(`https://gh.sevencdn.com/${base}`, `https://ghfast.top/${base}`, `https://gh-proxy.com/${base}`);
  return urls;
}

async function fetchArchive(asset) {
  let lastErr;
  for (const url of downloadUrls(asset)) {
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-dl-')), asset);
    console.log(`下载 ${url}`);
    // curl (bundled with Windows/macOS, universal on Linux) honours the
    // http(s)_proxy environment variables, which Node's fetch does not.
    const r = spawnSync(
      'curl',
      ['-fSL', '--retry', '2', '--max-time', '300', '--connect-timeout', '15', '-o', dest, url],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    if (r.status === 0) {
      const buf = await fsp.readFile(dest);
      if (buf.byteLength < 1_000_000) {
        lastErr = new Error(`文件过小 (${buf.byteLength}B)`);
        console.warn(`  失败: ${lastErr.message}`);
        continue;
      }
      return buf;
    }
    lastErr = new Error(`curl 退出码 ${r.status}`);
    console.warn(`  失败: ${lastErr.message}`);
  }
  throw lastErr ?? new Error('所有下载源均失败');
}

/** tar (bsdtar on Windows) handles both .tar.gz and .zip. */
function extract(archive, destDir, asset) {
  fs.mkdirSync(destDir, { recursive: true });
  if (asset.endsWith('.pkg')) {
    // pkgutil requires the output path not to exist. Keep it below the
    // temporary work directory so repeated CI runs cannot collide with it.
    const pkgDest = path.join(destDir, 'pkg-expanded');
    const r = spawnSync('pkgutil', ['--expand-full', archive, pkgDest], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`macOS 安装包解压失败 (pkgutil exit ${r.status})`);
    return;
  }
  // Git Bash's GNU tar treats "C:\..." as a remote host ("Cannot connect to
  // C:"); Windows' own bsdtar handles drive letters, so prefer it explicitly.
  const tar =
    process.platform === 'win32'
      ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
  const r = spawnSync(tar, ['-xf', archive, '-C', destDir], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`解压失败 (tar exit ${r.status})`);
}

async function findBinary(root, name) {
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name === name) return candidate;
    if (entry.isDirectory()) {
      const found = await findBinary(candidate, name);
      if (found) return found;
    }
  }
  return null;
}

function stagedVersion(bin, attempts = 4) {
  // A freshly written exe can transiently fail to spawn while the AV scans
  // it; retry briefly before declaring the version unreadable.
  for (let i = 0; i < attempts; i++) {
    const r = spawnSync(bin, ['version'], { encoding: 'utf8' });
    const m = /hugo v?(\d+\.\d+\.\d+)/.exec(`${r.stdout ?? ''} ${r.stderr ?? ''}`);
    if (m) return m[1];
    if (r.error) console.warn(`  版本探测重试 ${i + 1}/${attempts}: ${r.error.message}`);
    const wait = Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    if (wait === 'timed-out') continue;
  }
  return null;
}

async function sha256(file) {
  return createHash('sha256')
    .update(await fsp.readFile(file))
    .digest('hex');
}

async function main() {
  const { asset, bin } = target();
  await fsp.mkdir(OUT_DIR, { recursive: true });
  const stagedBin = path.join(OUT_DIR, bin);

  // Already staged and correct? Skip everything (idempotent re-runs).
  try {
    await fsp.access(stagedBin);
    if (stagedVersion(stagedBin) === VERSION) {
      console.log(`✓ 已存在 ${stagedBin} (v${VERSION})，跳过下载`);
      return;
    }
  } catch {
    // not staged yet
  }

  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'hugo-fetch-'));
  try {
    const archive = path.join(work, asset);
    const buf = await fetchArchive(asset);
    await fsp.writeFile(archive, buf);
    console.log(`  sha256: ${await sha256(archive)}`);
    extract(archive, work, asset);
    // Hugo ships docs/ etc. alongside the binary; just grab the executable.
    const extractedBin = await findBinary(work, bin);
    if (!extractedBin) throw new Error(`解压后未找到 ${bin}`);
    await fsp.copyFile(extractedBin, stagedBin);
    await fsp.chmod(stagedBin, 0o755).catch(() => {});
    const ver = stagedVersion(stagedBin);
    if (ver !== VERSION) throw new Error(`校验失败: ${stagedBin} 报告的版本是 ${ver}`);
    console.log(`✓ Hugo v${VERSION} (${process.platform}-${os.arch()}) → ${stagedBin}`);
  } finally {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
