'use strict';
const {
  app, Tray, Menu, clipboard, nativeImage, shell, Notification,
  BrowserWindow, ipcMain, dialog, screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { zjc, shq, distroName, WSL } = require('./lib/wsl');

const POLL_MS = 5000;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const TABBY_CANDIDATES = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Tabby', 'Tabby.exe'),
  'C:\\Program Files\\Tabby\\Tabby.exe',
];
const firstExisting = (list) => list.find((p) => p && fs.existsSync(p)) || null;

// --- diagnostics ------------------------------------------------------------
// Appends to zjc-tray.log next to the app so exits/crashes are attributable.
const LOG_FILE = path.join(__dirname, 'zjc-tray.log');
function logLine(...parts) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${parts.join(' ')}\n`);
  } catch { /* logging must never break the app */ }
}
process.on('uncaughtException', (err) => logLine('uncaughtException:', err.stack || err));
process.on('unhandledRejection', (err) => logLine('unhandledRejection:', (err && err.stack) || err));
app.on('render-process-gone', (_e, _wc, details) => logLine('render-process-gone:', JSON.stringify(details)));
app.on('child-process-gone', (_e, details) => logLine('child-process-gone:', JSON.stringify(details)));
app.on('before-quit', () => logLine('before-quit (app is exiting)'));
app.on('second-instance', () => logLine('second-instance launch attempt (ignored)'));

// --- settings ---------------------------------------------------------------
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
let settings = { keepWslAlive: false };
try { settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch { /* first run */ }
function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); }
  catch (err) { logLine('saveSettings failed:', err.message); }
}

// Keep the WSL VM from idling out when no terminals are open: dbus-launch
// leaves a detached dbus-daemon running inside WSL. Deliberately no -d flag --
// this targets whatever the default distro is. Only launch if one of ours
// isn't already running, so toggling/restarts don't pile up daemons.
function assertKeepAlive() {
  execFile('wsl.exe', ['--', 'bash', '-c',
    'pgrep -f -- "--fork --print-pid" >/dev/null || exec dbus-launch true'],
  { windowsHide: true }, (err) => { if (err) logLine('keep-alive start failed:', err.message); });
}
// Kill only dbus-launch-spawned daemons (--fork --print-pid is their argv
// signature); a systemd-managed session/system dbus must survive this.
function stopKeepAlive() {
  execFile('wsl.exe', ['--', 'bash', '-c', 'pkill -f -- "--fork --print-pid"'],
    { windowsHide: true }, () => {});
}
function setKeepAlive(enabled) {
  settings.keepWslAlive = enabled;
  saveSettings();
  if (enabled) assertKeepAlive(); else stopKeepAlive();
}

let tray = null;
let newWin = null;
let distro = 'Ubuntu';
let sessions = [];
let lastError = null;
let clkTck = 100;
let home = '/home';
let polling = false;
const prevCpu = new Map(); // name -> { ticks, at }
const cpuPct = new Map();  // name -> percent (can exceed 100 on multi-core)

// --- data -------------------------------------------------------------------

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const data = JSON.parse(await zjc('json'));
    clkTck = data.clk_tck || 100;
    home = data.home || home;
    const now = Date.now();
    for (const s of data.sessions) {
      if (s.cpu_ticks == null) { prevCpu.delete(s.name); cpuPct.delete(s.name); continue; }
      const p = prevCpu.get(s.name);
      if (p && now > p.at && s.cpu_ticks >= p.ticks) {
        cpuPct.set(s.name, ((s.cpu_ticks - p.ticks) / clkTck) / ((now - p.at) / 1000) * 100);
      }
      prevCpu.set(s.name, { ticks: s.cpu_ticks, at: now });
    }
    for (const name of [...prevCpu.keys()]) {
      if (!data.sessions.some((s) => s.name === name)) { prevCpu.delete(name); cpuPct.delete(name); }
    }
    sessions = data.sessions;
    lastError = null;
  } catch (err) {
    lastError = String(err.stderr || err.message || 'zjc failed').trim();
  }
  polling = false;
  render();
}

const shorten = (p) => (p && p.startsWith(home) ? '~' + p.slice(home.length) : p || '-');
const fmtMem = (kb) => (kb >= 1024 * 1024 ? (kb / 1024 / 1024).toFixed(1) + ' GB'
  : Math.round(kb / 1024) + ' MB');
const fmtCpu = (name) => (cpuPct.has(name) ? cpuPct.get(name).toFixed(1) + '%' : '—');

// --- actions ----------------------------------------------------------------

function notify(title, body) {
  new Notification({ title, body: body || '' }).show();
}

function openChrome(url) {
  const chrome = firstExisting(CHROME_CANDIDATES);
  if (chrome) execFile(chrome, [url], { windowsHide: true }, () => {});
  else shell.openExternal(url);
}

function openVSCode(cwd) {
  execFile('cmd.exe', ['/c', 'code', '--remote', `wsl+${distro}`, cwd],
    { windowsHide: true },
    (err) => { if (err) notify('VS Code failed', err.message); });
}

// Tabby's yargs CLI eats dash-flags and `--` (verified against its parser),
// so the command must be entirely positional: no -d, no bash -lc. wsl.exe
// runs its command line through bash -c, which expands the tilde.
function openTabby(name) {
  const tabby = firstExisting(TABBY_CANDIDATES);
  if (!tabby) return notify('Tabby not found', 'Install Tabby or edit TABBY_CANDIDATES in main.js');
  execFile(tabby, ['run', WSL, '~/Code/zjc', 'attach', name],
    { windowsHide: true },
    (err) => { if (err) notify('Tabby failed', err.message); });
}

async function killSession(name) {
  try {
    await zjc(`kill ${shq(name)}`);
  } catch (err) {
    notify('Kill failed', String(err.stderr || err.message).trim());
  }
  poll();
}

// --- popup menu (custom window: native menus can't drop the icon gutter) ----

const MENU_W = 340;
let menuWin = null;
let menuHeight = 260;
let lastHide = 0;

function createMenuWin() {
  menuWin = new BrowserWindow({
    width: MENU_W,
    height: menuHeight,
    show: false,
    frame: false,
    backgroundColor: '#1b1b1b',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'menu-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  menuWin.loadFile('menu.html');
  menuWin.on('blur', () => { lastHide = Date.now(); if (!menuWin.isDestroyed()) menuWin.hide(); });
  menuWin.on('closed', () => { logLine('menuWin closed'); menuWin = null; });
  menuWin.webContents.on('render-process-gone', (_e, details) => {
    logLine('menu renderer gone:', JSON.stringify(details), '- recreating');
    if (menuWin && !menuWin.isDestroyed()) menuWin.destroy();
    menuWin = null;
  });
  menuWin.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) logLine('menu renderer console error:', message);
  });
}

function ensureMenuWin() {
  if (!menuWin || menuWin.isDestroyed()) createMenuWin();
}

function viewModel() {
  return {
    error: lastError,
    loginEnabled: app.getLoginItemSettings(LOGIN_OPTS).openAtLogin,
    sessions: sessions.map((s) => {
      const c = s.claude;
      return {
        name: s.name,
        live: s.state === 'live',
        remote: !!(c && c.remote),
        url: c ? c.url : null,
        cwd: s.cwd,
        cwdShort: shorten(s.cwd),
        what: c ? (c.remote ? 'claude --remote-control' : 'claude (not remote)')
          : (s.program && s.program !== '-' ? s.program : 'nothing running'),
        cpu: fmtCpu(s.name),
        mem: fmtMem(s.rss_kb || 0),
      };
    }),
  };
}

function render() {
  if (tray) {
    const live = sessions.filter((s) => s.state === 'live');
    tray.setToolTip(`zjc — ${live.length} live session${live.length === 1 ? '' : 's'}`);
  }
  if (menuWin && !menuWin.isDestroyed()) menuWin.webContents.send('state', viewModel());
}

function positionMenu() {
  // Anchor to the tray icon, not the cursor: this also runs on height changes
  // while the menu is open, when the cursor is over the menu itself.
  const tb = tray ? tray.getBounds() : null;
  const anchor = tb && tb.width
    ? { x: Math.round(tb.x + tb.width / 2), y: tb.y }
    : screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(anchor).workArea;
  const h = Math.min(menuHeight, wa.height - 16);
  let x = Math.round(anchor.x - MENU_W / 2);
  x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - MENU_W - 8));
  const y = wa.y + wa.height - h - 8;
  menuWin.setBounds({ x, y, width: MENU_W, height: h });
}

function toggleMenu() {
  ensureMenuWin();
  if (menuWin.isVisible()) { menuWin.hide(); return; }
  // clicking the tray icon blurs (hides) an open menu just before this fires
  if (Date.now() - lastHide < 300) return;
  render();
  positionMenu();
  menuWin.show();
  menuWin.focus();
}

// Unpackaged app: the login item must be electron.exe + our app dir, otherwise
// Windows would launch Electron's default welcome app at login.
const LOGIN_OPTS = { path: process.execPath, args: [__dirname] };

// Right-click: small native options menu (left-click keeps the sessions popup)
function showOptionsMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: app.getLoginItemSettings(LOGIN_OPTS).openAtLogin,
      click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked, ...LOGIN_OPTS }),
    },
    {
      label: 'Keep WSL alive',
      type: 'checkbox',
      checked: settings.keepWslAlive,
      click: (mi) => setKeepAlive(mi.checked),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { logLine('quit from options menu'); app.quit(); } },
  ]);
  tray.popUpContextMenu(menu);
}

ipcMain.on('menu-height', (_ev, h) => {
  const nh = Math.max(80, Math.min(Math.round(h), 700));
  if (nh === menuHeight) return;
  menuHeight = nh;
  if (menuWin && menuWin.isVisible()) positionMenu();
});

const hideMenu = () => { if (menuWin && !menuWin.isDestroyed()) menuWin.hide(); };

ipcMain.handle('menu-action', async (_ev, a) => {
  switch (a.type) {
    case 'copy-url': clipboard.writeText(a.url); notify('Copied remote URL', a.url); break;
    case 'chrome': openChrome(a.url); break;
    case 'vscode': openVSCode(a.cwd); break;
    case 'tabby': openTabby(a.name); break;
    case 'kill': hideMenu(); await killSession(a.name); break;
    case 'new': hideMenu(); openNewSessionWindow(); break;
    case 'refresh': poll(); break;
    case 'login': app.setLoginItemSettings({ openAtLogin: !!a.enabled, ...LOGIN_OPTS }); render(); break;
    case 'quit': logLine('quit clicked in menu'); app.quit(); break;
    case 'hide': hideMenu(); break;
  }
});

// --- new session window -----------------------------------------------------

function openNewSessionWindow() {
  if (newWin) { newWin.focus(); return; }
  newWin = new BrowserWindow({
    width: 460,
    height: 340,
    resizable: false,
    maximizable: false,
    minimizable: false,
    autoHideMenuBar: true,
    title: 'New zellij session',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  newWin.loadFile('new-session.html');
  newWin.on('closed', () => { newWin = null; });
}

function windowsToWsl(p) {
  let m = p.match(/^\\\\wsl(?:\.localhost|\$)\\[^\\]+(\\.*)?$/i);
  if (m) return (m[1] || '/').replace(/\\/g, '/') || '/';
  m = p.match(/^([A-Za-z]):(\\.*)?$/);
  if (m) return `/mnt/${m[1].toLowerCase()}${(m[2] || '/').replace(/\\/g, '/')}`;
  return p;
}

ipcMain.handle('create-session', async (_ev, { name, dir }) => {
  // wsl.exe inherits the Windows cwd (as /mnt/c/...), so always pass -d;
  // expand ~ here since shq() would keep it literal.
  dir = (dir || '~').trim();
  if (dir === '~') dir = home;
  else if (dir.startsWith('~/')) dir = home + dir.slice(1);
  const args = ['new', '-d', shq(dir)];
  if (name) args.push(shq(name));
  try {
    // zjc new waits up to 90s for the Remote Control banner; stdout's last
    // line is the URL, progress goes to stderr.
    const out = await zjc(args.join(' '), { timeout: 120000 });
    const url = (out.trim().split('\n').pop() || '').trim();
    poll();
    if (/^https:\/\//.test(url)) {
      clipboard.writeText(url);
      return { ok: true, url };
    }
    return { ok: true, url: null, message: out.trim() || 'created, but no URL appeared' };
  } catch (err) {
    return { ok: false, message: String(err.stderr || err.stdout || err.message || '').trim() };
  }
});

ipcMain.handle('pick-dir', async () => {
  const res = await dialog.showOpenDialog(newWin, {
    title: 'Pick a directory',
    defaultPath: `\\\\wsl.localhost\\${distro}${home.replace(/\//g, '\\')}`,
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return windowsToWsl(res.filePaths[0]);
});

ipcMain.handle('open-url', (_ev, url) => {
  if (/^https:\/\/claude\.ai\//.test(url)) openChrome(url);
});

// --- app lifecycle ----------------------------------------------------------

function trayIcon() {
  const p = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(p)) return nativeImage.createFromPath(p);
  return nativeImage.createEmpty();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    logLine(`started pid=${process.pid}`);
    app.setAppUserModelId('zjc.tray');
    try { distro = (await distroName()) || distro; } catch { /* keep default */ }
    tray = new Tray(trayIcon());
    createMenuWin();
    tray.on('click', toggleMenu);
    tray.on('right-click', showOptionsMenu);
    if (settings.keepWslAlive) assertKeepAlive();
    render();
    poll();
    setInterval(poll, POLL_MS);
  });
  // tray app: keep running with no windows
  app.on('window-all-closed', () => {});
}
