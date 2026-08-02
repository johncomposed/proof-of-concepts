'use strict';
const {
  app, Tray, Menu, clipboard, nativeImage, shell, Notification,
  BrowserWindow, ipcMain, dialog,
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

function openTabby(name) {
  const tabby = firstExisting(TABBY_CANDIDATES);
  if (!tabby) return notify('Tabby not found', 'Install Tabby or edit TABBY_CANDIDATES in main.js');
  const attach =
    `command -v zjc >/dev/null 2>&1 && exec zjc attach ${shq(name)}; ` +
    `exec $HOME/Code/zjc attach ${shq(name)}`;
  execFile(tabby, ['run', WSL, '-d', distro, '--', 'bash', '-lc', attach],
    { windowsHide: true },
    (err) => { if (err) notify('Tabby failed', err.message); });
}

async function killSession(name) {
  try {
    await zjc(`kill ${shq(name)}`);
    notify('Session killed', name);
  } catch (err) {
    notify('Kill failed', String(err.stderr || err.message).trim());
  }
  poll();
}

// --- menu -------------------------------------------------------------------

function topLabel(s) {
  if (s.state !== 'live') return `${s.name}  (exited)`;
  const bolt = s.claude && s.claude.remote ? '⚡ ' : '';
  return `${bolt}${s.name}  —  ${shorten(s.cwd)}`;
}

function sessionSubmenu(s) {
  if (s.state !== 'live') {
    return [
      { label: 'exited — not running', enabled: false },
      { type: 'separator' },
      { label: 'Resurrect in Tabby', click: () => openTabby(s.name) },
      { label: 'Delete session', click: () => killSession(s.name) },
    ];
  }
  const items = [];
  const c = s.claude;
  const what = c ? (c.remote ? 'claude --remote-control' : 'claude (not remote)')
    : (s.program && s.program !== '-' ? s.program : 'nothing running');
  items.push({ label: shorten(s.cwd), enabled: false });
  items.push({ label: `${what}  ·  CPU ${fmtCpu(s.name)}  ·  ${fmtMem(s.rss_kb || 0)}`, enabled: false });
  items.push({ type: 'separator' });
  if (c && c.remote) {
    if (c.url) {
      items.push({
        label: 'Copy remote URL',
        click: () => { clipboard.writeText(c.url); notify('Copied remote URL', c.url); },
      });
      items.push({ label: 'Open in Chrome', click: () => openChrome(c.url) });
    } else {
      items.push({ label: 'Remote URL unknown (banner scrolled off)', enabled: false });
    }
    items.push({ type: 'separator' });
  }
  items.push({ label: 'Open VS Code here', enabled: !!s.cwd, click: () => openVSCode(s.cwd) });
  items.push({ label: 'Open in Tabby', click: () => openTabby(s.name) });
  items.push({ type: 'separator' });
  items.push({ label: 'Kill session', click: () => killSession(s.name) });
  return items;
}

function render() {
  if (!tray) return;
  const live = sessions.filter((s) => s.state === 'live');
  tray.setToolTip(`zjc — ${live.length} live session${live.length === 1 ? '' : 's'}`);

  const tpl = [];
  if (lastError) {
    tpl.push({
      label: 'zjc error (click for details)',
      click: () => dialog.showErrorBox('zjc', lastError),
    });
  } else if (!sessions.length) {
    tpl.push({ label: 'No zellij sessions', enabled: false });
  }
  for (const s of sessions) {
    tpl.push({ label: topLabel(s), submenu: sessionSubmenu(s) });
  }
  tpl.push({ type: 'separator' });
  tpl.push({ label: 'New session…', click: openNewSessionWindow });
  tpl.push({ label: 'Refresh now', click: () => poll() });
  tpl.push({ type: 'separator' });
  tpl.push({
    label: 'Start at login',
    type: 'checkbox',
    checked: app.getLoginItemSettings().openAtLogin,
    click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked }),
  });
  tpl.push({ label: 'Quit', click: () => app.quit() });
  tray.setContextMenu(Menu.buildFromTemplate(tpl));
}

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
      notify('Session ready — URL copied', url);
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
    app.setAppUserModelId('zjc.tray');
    try { distro = (await distroName()) || distro; } catch { /* keep default */ }
    tray = new Tray(trayIcon());
    tray.on('click', () => tray.popUpContextMenu());
    render();
    poll();
    setInterval(poll, POLL_MS);
  });
  // tray app: keep running with no windows
  app.on('window-all-closed', () => {});
}
