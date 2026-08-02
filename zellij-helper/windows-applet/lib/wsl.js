'use strict';
const { execFile } = require('child_process');

const WSL = 'wsl.exe';

function run(file, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      windowsHide: true,
      timeout: opts.timeout ?? 20000,
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8',
    }, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout; err.stderr = stderr; return reject(err); }
      resolve(stdout);
    });
  });
}

// Single-quote a value for use inside the bash -lc payload. Windows-side arg
// quoting is handled by execFile; single quotes pass through wsl.exe intact.
function shq(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }

// Run zjc in the default WSL distro through a login shell (so the user's PATH
// applies), falling back to the known checkout when it's not on PATH.
function zjc(args, opts) {
  const payload =
    `command -v zjc >/dev/null 2>&1 && exec zjc ${args}; exec $HOME/Code/zjc ${args}`;
  return run(WSL, ['--', 'bash', '-lc', payload], opts);
}

async function distroName() {
  const out = await run(WSL, ['--', 'bash', '-c', 'echo $WSL_DISTRO_NAME']);
  return out.trim();
}

module.exports = { run, zjc, shq, distroName, WSL };
