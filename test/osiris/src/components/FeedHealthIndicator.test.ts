import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as nexaModule from '@/lib/nexafreight';

describe('FeedHealth data parsing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly maps API response into adapter statuses', async () => {
    const mockHealth: nexaModule.FeedHealthResponse = {
      adapters: [
        {
          adapter_name: 'replay_ais',
          is_healthy: true,
          last_success_at: '2026-09-05T12:00:00Z',
          messages_received: 4500,
          provenance: 'REPLAYED',
        },
        {
          adapter_name: 'position_interpolator',
          is_healthy: true,
          last_success_at: '2026-09-05T12:00:05Z',
          messages_received: 120,
          provenance: 'SIMULATED',
        },
      ],
    };

    vi.spyOn(nexaModule, 'getFeedHealth').mockResolvedValue(mockHealth);

    const res = await nexaModule.getFeedHealth();
    expect(res.adapters).toHaveLength(2);
    expect(res.adapters[0].adapter_name).toBe('replay_ais');
    expect(res.adapters[0].is_healthy).toBe(true);
    expect(res.adapters[1].adapter_name).toBe('position_interpolator');
    expect(res.adapters[1].is_healthy).toBe(true);
  });
});
