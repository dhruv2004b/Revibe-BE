import { afterEach, describe, expect, it, vi } from 'vitest';
import { startKeepAlive } from '../src/keepalive.js';

afterEach(() => vi.useRealTimers());

describe('keep-alive', () => {
  it('pings the public /health on the interval and stops cleanly', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const stop = startKeepAlive({ baseUrl: 'https://revibe-api.onrender.com/', intervalMs: 600_000, fetchImpl, log: () => {} });
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(calls).toEqual(['https://revibe-api.onrender.com/health']);
    await vi.advanceTimersByTimeAsync(1_200_000);
    expect(calls).toHaveLength(3);

    stop();
    await vi.advanceTimersByTimeAsync(1_200_000);
    expect(calls).toHaveLength(3);
  });

  it('keeps going after failures and logs sparingly', async () => {
    vi.useFakeTimers();
    const logs: string[] = [];
    let ok = false;
    const fetchImpl = (async () => (ok ? new Response('{}', { status: 200 }) : new Response('', { status: 503 }))) as unknown as typeof fetch;

    const stop = startKeepAlive({ baseUrl: 'https://x.onrender.com', intervalMs: 1000, fetchImpl, log: (m) => logs.push(m) });
    await vi.advanceTimersByTimeAsync(7000); // 7 failures: logs at 1st and 6th
    expect(logs.filter((l) => l.includes('failed'))).toHaveLength(2);
    ok = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(logs.at(-1)).toMatch(/reachable again/);
    stop();
  });
});
