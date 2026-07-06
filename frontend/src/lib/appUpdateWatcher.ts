// Cloudflare sits in front of the static build with no deploy-time cache
// purge, so browsers/edge can keep serving a stale index.html + bundle
// indefinitely after a deploy. This polls a never-cached version.json and
// silently reloads to the new build when the running app falls behind.

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const RELOAD_PARAM = '_av';
const RELOAD_GUARD_KEY = 'aquamind:reloadingToBuild';

async function fetchLatestBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?cb=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.buildId === 'string' ? data.buildId : null;
  } catch {
    return null;
  }
}

function reloadToLatest(buildId: string) {
  // Guard against reload loops: if we already tried reloading to this exact
  // build and we're still out of date afterwards (e.g. the CDN re-served the
  // same stale HTML), stop retrying instead of flashing the page forever.
  if (sessionStorage.getItem(RELOAD_GUARD_KEY) === buildId) {
    console.warn(`[appUpdateWatcher] already attempted reload to build ${buildId}, giving up`);
    return;
  }
  sessionStorage.setItem(RELOAD_GUARD_KEY, buildId);

  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_PARAM, buildId);
  window.location.replace(url.toString());
}

async function checkForUpdate() {
  const latestBuildId = await fetchLatestBuildId();
  if (latestBuildId && latestBuildId !== __APP_BUILD_ID__) {
    reloadToLatest(latestBuildId);
  }
}

export function startAppUpdateWatcher() {
  // Clean up the cache-busting query param a previous reload added, and
  // clear the guard once we've confirmed this load is on the build it
  // reloaded for.
  const url = new URL(window.location.href);
  if (url.searchParams.has(RELOAD_PARAM)) {
    url.searchParams.delete(RELOAD_PARAM);
    window.history.replaceState(null, '', url.toString());
  }
  if (sessionStorage.getItem(RELOAD_GUARD_KEY) === __APP_BUILD_ID__) {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  }

  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('online', checkForUpdate);
}
