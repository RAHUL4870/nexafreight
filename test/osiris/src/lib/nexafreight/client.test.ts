import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setToken,
  clearToken,
  hasToken,
  getPorts,
  getAllRoutes,
  getShipmentDetail,
  getShipmentRoute,
  getShipments,
  nexaClient,
} from './client'
import { NexaHttpError } from './errors'

describe('NexaFreight Client — Phase 2 endpoints', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    clearToken()
    setToken('test-access-token')
  })

  afterEach(() => {
    global.fetch = originalFetch
    clearToken()
    vi.restoreAllMocks()
  })

  it('throws 401 if calling getPorts without token', async () => {
    clearToken()
    await expect(getPorts()).rejects.toThrow(NexaHttpError)
  })

  it('calls GET /api/map/ports with Authorization header', async () => {
    const mockPorts = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [103.85, 1.29] },
          properties: {
            port_id: '1',
            name: 'Port of Singapore',
            congestion_index: 1.15,
          },
        },
      ],
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPorts,
    } as Response)

    const result = await getPorts()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/map/ports'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
        }),
      })
    )
    expect(result.features).toHaveLength(1)
    expect(result.features[0].properties.name).toBe('Port of Singapore')
  })

  it('calls GET /api/map/routes with Authorization header', async () => {
    const mockRoutes = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [103.85, 1.29],
              [121.5, 31.2],
            ],
          },
          properties: {
            leg_id: '101',
            mode: 'SEA',
            route_quality: 'high',
          },
        },
      ],
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRoutes,
    } as Response)

    const result = await getAllRoutes()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/map/routes'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
        }),
      })
    )
    expect(result.features).toHaveLength(1)
  })

  it('calls GET /api/shipments/{id} with URI encoding', async () => {
    const shipmentId = 'shipment-uuid-123'
    const mockDetail = {
      id: shipmentId,
      origin: 'SGSIN',
      destination: 'CNSHG',
      mode: 'SEA',
      status: 'IN_TRANSIT',
      strictest_sla_deadline: null,
      revised_eta: null,
      cargo_class: 'GENERAL',
      route_version: 1,
      container_count: 2,
      legs: [],
      orders: [],
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockDetail,
    } as Response)

    const result = await getShipmentDetail(shipmentId)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/shipments/${shipmentId}`),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
        }),
      })
    )
    expect(result.id).toBe(shipmentId)
  })

  it('calls GET /api/shipments/{id}/route', async () => {
    const shipmentId = 'shipment-uuid-456'
    const mockRoute = {
      type: 'FeatureCollection',
      features: [],
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRoute,
    } as Response)

    const result = await getShipmentRoute(shipmentId)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/shipments/${shipmentId}/route`),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
        }),
      })
    )
    expect(result.features).toEqual([])
  })

  it('calls GET /api/map/feed-health with Authorization header', async () => {
    const mockHealth = {
      adapters: [
        {
          adapter_name: 'replay_ais',
          is_healthy: true,
          last_success_at: '2026-09-05T12:00:00Z',
          messages_received: 100,
          provenance: 'REPLAYED',
        },
      ],
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockHealth,
    } as Response)

    const result = await nexaClient.getFeedHealth()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/map/feed-health'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
        }),
      })
    )
    expect(result.adapters).toHaveLength(1)
    expect(result.adapters[0].adapter_name).toBe('replay_ais')
  })

  it('exposes convenience methods on nexaClient object', () => {
    expect(typeof nexaClient.getPorts).toBe('function')
    expect(typeof nexaClient.getAllRoutes).toBe('function')
    expect(typeof nexaClient.getShipmentDetail).toBe('function')
    expect(typeof nexaClient.getShipmentRoute).toBe('function')
    expect(typeof nexaClient.getFeedHealth).toBe('function')
  })
})
