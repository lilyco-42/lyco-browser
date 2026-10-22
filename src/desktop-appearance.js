'use strict';
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const SDK_REVISION = 'a74bd2cf372efad2407d6be4b57739e682cf1d9a';

function parseAppearance(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 4096) throw Error('Invalid desktop response');
  const value = JSON.parse(stdout);
  if (!value || value.schema !== 1 || value.sdk !== 'UniDesktop/SDK' || value.revision !== SDK_REVISION ||
      value.platform !== 'windows' || ![null, 'light', 'dark'].includes(value.theme) ||
      typeof value.capabilities?.detectTheme !== 'boolean' || typeof value.capabilities?.readAccent !== 'boolean' ||
      (value.accent !== null && (!Array.isArray(value.accent) || value.accent.length !== 4 ||
        !value.accent.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255))) ||
      (!value.capabilities.detectTheme && value.theme !== null) || (!value.capabilities.readAccent && value.accent !== null)) {
    throw Error('Invalid desktop capabilities');
  }
  // Only copy this read-only contract; never forward arbitrary helper output to a renderer.
  return {state: 'ready', sdk: value.sdk, revision: SDK_REVISION, theme: value.theme,
    accent: value.accent, capabilities: {detectTheme: value.capabilities.detectTheme, readAccent: value.capabilities.readAccent}};
}

function createDesktopAppearance({directory, platform = process.platform, run = promisify(execFile), now = Date.now} = {}) {
  const executable = path.join(directory, 'desktop', 'lyco-desktop-probe.exe');
  let pending, cached, completedAt = 0;
  return async function readAppearance() {
    if (platform !== 'win32') return {state: 'unsupported', theme: null, accent: null};
    if (pending) return pending;
    if (cached && now() - completedAt < 5000) return cached;
    pending = (async () => {
      try {
        // The caller supplies no command, path, arguments, environment or shell.
        // Avoid inheriting account/API credentials into this read-only child.
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
          /^(SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
        const {stdout} = await run(executable, [], {shell: false, windowsHide: true, timeout: 3000,
          maxBuffer: 4096, encoding: 'utf8', cwd: path.dirname(executable), env});
        cached = parseAppearance(stdout);
      } catch (error) {
        cached = {state: error?.code === 'ENOENT' ? 'missing' : 'unavailable', theme: null, accent: null};
      }
      completedAt = now();
      return cached;
    })();
    try {return await pending;} finally {pending = undefined;}
  };
}
module.exports = {SDK_REVISION, parseAppearance, createDesktopAppearance};
