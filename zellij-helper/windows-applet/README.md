# zjc-tray — Windows system tray applet

Electron tray applet for viewing and managing zellij + claude sessions running
in WSL, driven by [`zjc`](../linux-script/zjc) (`zjc json`).

## What it does

The tray icon (green **Z**) polls `wsl.exe -- bash -lc 'zjc json'` every 5s.
Each session gets a menu entry (`⚡` = claude running with `--remote-control`):

- working dir, what's running, and rough **CPU % / memory** (summed over the
  session's processes; CPU is the delta between polls, so it can exceed 100%
  on multi-core)
- **Copy remote URL** / **Open in Chrome** when a remote claude URL is known
- **Open VS Code here** (`code --remote wsl+<distro> <cwd>`)
- **Open in Tabby** (new Tabby tab attached via `zjc attach`)
- **Kill session**
- **New session…** opens a small form (name optional, dir defaults to `~`,
  Browse understands `\\wsl.localhost\...` and drive paths). It runs `zjc new`,
  waits up to 90s for the Remote Control URL, and copies it to the clipboard.

Plus: Refresh now, Start at login, Quit.

## Setup

```
pnpm install
pnpm start
```

`pnpm install` also generates `assets/icon.png` (`scripts/make-icon.js`, zero
dependencies). Enable "Start at login" from the tray menu to keep it around.

## How it finds things

- **zjc**: `zjc` on the WSL login-shell PATH, falling back to `~/Code/zjc`.
- **Chrome**: `C:\Program Files\Google\Chrome\Application\chrome.exe`
  (falls back to the default browser).
- **Tabby**: `%LOCALAPPDATA%\Programs\Tabby\Tabby.exe`.
- **Distro**: whatever `wsl.exe` uses by default (`$WSL_DISTRO_NAME`).

Candidate paths live at the top of `main.js` if yours differ.

## Notes

- The repo copy of `zjc` (CRLF) mirrors `~/Code/zjc` in WSL (LF). To sync after
  editing the repo copy:

  ```
  wsl.exe bash -c "tr -d '\r' < /mnt/c/Users/john/Code/proof-of-concepts/zellij-helper/linux-script/zjc > ~/Code/zjc.new && bash -n ~/Code/zjc.new && chmod +x ~/Code/zjc.new && mv ~/Code/zjc.new ~/Code/zjc"
  ```

- `zjc new` auto-answers Claude Code's first-visit **folder-trust prompt**
  ("Yes, I trust this folder") — it would otherwise block the Remote Control
  banner forever. You explicitly picked the directory, but be aware the prompt
  is bypassed for it.
- Remote URLs are scraped from pane scrollback (Claude Code doesn't persist
  them). Sessions created by `zjc new` always have theirs recorded; for
  sessions started other ways the URL shows as unknown once the banner leaves
  scrollback.
