import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { httpConditional, setRequestTransport } from './httpJson';

const RECENT_CSV = 'https://urlhaus.abuse.ch/downloads/csv_recent/';

describe('httpConditional', () => {
  beforeEach(() => {
    setRequestTransport(async (_url, opts) => {
      const headers = (opts?.headers || {}) as Record<string, string>;
      if (headers['If-None-Match'] === '"urlhaus-1234"') {
        return { status: 304, headers: { etag: '"urlhaus-1234"' }, body: '' };
      }
      return { status: 200, headers: { etag: '"urlhaus-1234"' }, body: 'abuse.ch URLhaus recent dump csv data\n' };
    });
  });

  afterEach(() => {
    setRequestTransport(null);
  });

  it('fetches the dump, then answers 304 to the same validators', async () => {
    const first = await httpConditional(RECENT_CSV, {
      timeoutMs: 60_000,
      headers: { Accept: 'text/csv', 'Accept-Encoding': 'gzip' },
    });

    expect(first.changed).toBe(true);
    expect(first.body).toBeTruthy();
    expect(first.body!).toContain('abuse.ch URLhaus');
    // One of the two must come back, or there is nothing to revalidate with.
    expect(first.etag ?? first.lastModified).toBeTruthy();

    const second = await httpConditional(RECENT_CSV, {
      etag: first.etag,
      lastModified: first.lastModified,
      timeoutMs: 60_000,
      headers: { Accept: 'text/csv', 'Accept-Encoding': 'gzip' },
    });

    expect(second.changed).toBe(false);
    expect(second.body).toBeNull();
    // Validators survive a 304 so the next poll can still revalidate.
    expect(second.etag ?? second.lastModified).toBeTruthy();
  });

  it('degrades to a plain GET when given no validators', async () => {
    const res = await httpConditional(RECENT_CSV, {
      timeoutMs: 60_000,
      headers: { Accept: 'text/csv', 'Accept-Encoding': 'gzip' },
    });
    expect(res.changed).toBe(true);
    expect(res.body).toBeTruthy();
  });
});
