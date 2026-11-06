'use strict';
const REPOSITORY = 'lilyco-42/lyco-browser';
const BASE = 'https://github.com/' + REPOSITORY;

function stableVersion(tag) {
  const match = typeof tag === 'string' && /^v((?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8}))$/.exec(tag);
  return match ? match[1] : null;
}

function stableReleaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash) return null;
    const prefix = '/' + REPOSITORY + '/releases/tag/';
    if (!url.pathname.startsWith(prefix)) return null;
    const tag = url.pathname.slice(prefix.length);
    const version = stableVersion(tag);
    return version ? {remoteVersion: version, releaseName: version, releaseUrl: BASE + '/releases/tag/' + tag} : null;
  } catch { return null; }
}

function updateAssetUrlIsAllowed(value, assetName) {
  if (typeof assetName !== 'string' || !assetName || /[/\\]/.test(assetName)) return false;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash) return false;
    const prefix = '/' + REPOSITORY + '/releases/download/';
    if (!url.pathname.startsWith(prefix)) return false;
    const parts = url.pathname.slice(prefix.length).split('/');
    return parts.length === 2 && Boolean(stableVersion(parts[0])) && parts[1] === encodeURIComponent(assetName);
  } catch { return false; }
}

async function resolveStableReleaseMeta({fetch: request = globalThis.fetch, userAgent = 'LYCO Browser', timeout = 20000} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    let release;
    try {
      const response = await request('https://api.github.com/repos/' + REPOSITORY + '/releases/latest', {
        headers: {Accept: 'application/vnd.github+json', 'User-Agent': userAgent}, signal: controller.signal,
      });
      if (response.ok) release = await response.json();
    } catch { /* A rate limit or unavailable API may use the official latest redirect. */ }
    if (release !== undefined) {
      const version = stableVersion(release?.tag_name);
      if (!version || release.draft !== false || release.prerelease !== false) throw Error('没有可用的正式版本发布');
      return {remoteVersion: version, releaseName: String(release.name || version),
        releaseUrl: BASE + '/releases/tag/' + release.tag_name, source: 'api', apiRelease: release};
    }
    const response = await request(BASE + '/releases/latest', {
      redirect: 'follow', headers: {Accept: 'text/html', 'User-Agent': userAgent}, signal: controller.signal,
    });
    const meta = response.ok && stableReleaseUrl(response.url);
    if (!meta) throw Error('暂时无法确认正式版本，请稍后重试');
    // Only the official /latest redirect is authoritative here. Atom entries
    // and arbitrary links in an HTML body may include CI/pre-release builds.
    return {...meta, source: 'latest-redirect'};
  } finally { clearTimeout(timer); }
}

module.exports = {stableVersion, stableReleaseUrl, updateAssetUrlIsAllowed, resolveStableReleaseMeta};
