/**
 * Keeps a Render free instance awake. Render sleeps a free web service after
 * 15 minutes with no inbound traffic through its router, so the server pings
 * its own public /health URL (not localhost, which Render would not count)
 * every few minutes.
 *
 * Cost: an always-on free service uses ~744 of the 750 free instance hours a
 * month, so keep only one such service on the account.
 */
export interface KeepAliveOptions {
  /** Public base URL, e.g. https://revibe-api.onrender.com */
  baseUrl: string;
  intervalMs: number;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export function startKeepAlive({ baseUrl, intervalMs, fetchImpl = fetch, log = console.log }: KeepAliveOptions): () => void {
  const url = `${baseUrl.replace(/\/+$/, '')}/health`;
  let failures = 0;

  const ping = async () => {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'revibe-keepalive' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (failures > 0) log(`keep-alive: ${url} reachable again`);
      failures = 0;
    } catch (e) {
      failures += 1;
      // Log the first failure and then every 6th, so a long outage does not flood the logs.
      if (failures === 1 || failures % 6 === 0) log(`keep-alive: ping to ${url} failed (${failures}x): ${(e as Error).message}`);
    }
  };

  const timer = setInterval(ping, intervalMs);
  timer.unref(); // never keeps the process alive on shutdown
  const every = intervalMs >= 60_000 ? `${Math.round(intervalMs / 60_000)} min` : `${Math.round(intervalMs / 1000)} s`;
  log(`keep-alive: pinging ${url} every ${every}`);
  return () => clearInterval(timer);
}
