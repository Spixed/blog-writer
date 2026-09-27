import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';

const here = path.dirname(fileURLToPath(import.meta.url));
const portableHome = process.env.PORTABLE_EXECUTABLE_DIR
  ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'user-data')
  : undefined;
const dataHome = process.env.BLOG_WRITER_HOME
  ? path.resolve(process.env.BLOG_WRITER_HOME)
  : portableHome;
if (dataHome) {
  process.env.BLOG_WRITER_HOME = dataHome;
  app.setPath('userData', dataHome);
}
let server;
let windowRef;

// No application menu: the app is a single-window editor and every action has
// its own in-app UI / shortcut.
Menu.setApplicationMenu(null);

// Renderer asks us for a folder (workspace picker). Falls back gracefully in
// non-Electron environments where the preload bridge is absent.
ipcMain.handle('blog-writer:choose-directory', async () => {
  const owner = windowRef ?? BrowserWindow.getAllWindows()[0];
  const res = await dialog.showOpenDialog(owner, {
    title: '选择博客根目录',
    properties: ['openDirectory'],
  });
  return res.canceled ? null : (res.filePaths[0] ?? null);
});

const PORT_FILE = 'server-port.txt';
const BASE_PORT = 7841;
const PORT_SCAN_RANGE = 50;

async function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

/**
 * The renderer's UI preferences (theme, autosave, layout, ...) live in
 * localStorage, which Chromium partitions by origin — including the port.
 * An OS-assigned random port mints a fresh origin every launch and all
 * settings appear reset, so pick a port once, persist it in userData and
 * reuse it for as long as it stays free.
 */
async function resolvePort() {
  const portFile = path.join(app.getPath('userData'), PORT_FILE);
  let saved = Number.NaN;
  try {
    saved = Number.parseInt((await fs.readFile(portFile, 'utf8')).trim(), 10);
  } catch {
    // First launch (no file yet) or unreadable — fall through to the scan.
  }
  const start =
    Number.isInteger(saved) && saved > 0 && saved < 65536 ? saved : BASE_PORT;
  for (let offset = 0; offset < PORT_SCAN_RANGE; offset++) {
    const port = start + offset;
    if (port < 65536 && (await isPortFree(port))) return { port, portFile };
  }
  // Everything busy: fall back to an OS-assigned port. The origin (and
  // therefore persisted settings) won't carry over this run, but the app
  // still starts; the bound port gets persisted for next launch.
  return { port: 0, portFile };
}

/** Persist the actually-bound port so the next launch reuses the same origin. */
async function savePort(portFile, port) {
  try {
    await fs.writeFile(portFile, String(port), 'utf8');
  } catch {
    // Read-only userData: settings simply won't survive restarts.
  }
}

/** Bundled hugo binary (packaged build) or an env override (dev). */
async function resolveHugoBin() {
  if (process.env.BLOG_HUGO_BIN) return process.env.BLOG_HUGO_BIN;
  if (!app.isPackaged) return undefined;
  const candidate = path.join(
    process.resourcesPath,
    'hugo',
    process.platform === 'win32' ? 'hugo.exe' : 'hugo',
  );
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

async function createWindow() {
  const { createServer } = await import('./dist/server.mjs');
  const { port: wantedPort, portFile } = await resolvePort();
  const serverOpts = {
    host: '127.0.0.1',
    port: wantedPort,
    frontendDist: path.join(here, '..', 'packages', 'frontend', 'dist'),
    defaultRoot: process.env.BLOG_ROOT,
    defaultName: process.env.BLOG_NAME,
    hugoBin: await resolveHugoBin(),
  };
  try {
    server = await createServer(serverOpts);
  } catch (error) {
    // Raced with another process that grabbed the port between the free
    // check and listen(): retry once with an OS-assigned port.
    if (wantedPort === 0 || !/EADDRINUSE/i.test(String(error))) throw error;
    server = await createServer({ ...serverOpts, port: 0 });
  }
  const address = server.app.server.address();
  const port = typeof address === 'object' && address ? address.port : 7841;
  await savePort(portFile, port);
  windowRef = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRef.setMenuBarVisibility(false);
  windowRef.once('ready-to-show', () => windowRef.show());
  windowRef.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  await windowRef.loadURL(`http://127.0.0.1:${port}`);
}
app
  .whenReady()
  .then(createWindow)
  .catch((error) => {
    dialog.showErrorBox(
      'Blog Writer 启动失败',
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    app.quit();
  });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', async () => {
  if (server) await server.close();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
