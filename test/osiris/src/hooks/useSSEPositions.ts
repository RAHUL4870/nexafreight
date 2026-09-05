'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { BASE_URL, getToken } from '@/lib/nexafreight'
import type { PositionReport, PositionOut } from '@/lib/nexafreight'
import { useAuthStore } from '@/store/useAuthStore'

export interface UseSSEPositionsOptions {
  /**
   * Direct backend URL (default: process.env.NEXT_PUBLIC_NEXA_API_URL or http://localhost:8000).
   * Connecting directly bypasses Next.js rewrite buffering for SSE streams.
   */
  apiUrl?: string
  /**
   * Optional manual override for JWT token. If omitted, retrieved from useAuthStore or storage.
   */
  token?: string | null
  /**
   * Whether the stream should be active (default: true).
   */
  enabled?: boolean
}

export interface UseSSEPositionsReturn {
  /** Current positions keyed by asset_id (new reports overwrite previous reports) */
  positions: Record<string, PositionReport>
  /** Array of current positions for convenient mapping */
  positionsList: PositionReport[]
  /** Whether the EventSource connection is open and active */
  isConnected: boolean
  /** Timestamp of the most recent position batch received */
  lastUpdate: Date | null
  /** Last connection error encountered */
  error: Event | null
}

/**
 * Constructs the direct SSE endpoint URL with token parameter.
 */
export function buildSSEUrl(apiUrl: string = BASE_URL, token?: string | null): string {
  const cleanBase = apiUrl.replace(/\/$/, '')
  const url = new URL(`${cleanBase}/api/map/positions/stream`)
  if (token) {
    url.searchParams.set('token', token)
  }
  return url.toString()
}

/**
 * Parses raw JSON string or object payload into normalized PositionReport records.
 * Overwrites existing records keyed by asset_id so memory stays bounded.
 */
export function parsePositionPayload(
  raw: string | unknown,
  existingMap: Record<string, PositionReport> = {}
): { updatedMap: Record<string, PositionReport>; hasChanges: boolean } {
  if (!raw) return { updatedMap: existingMap, hasChanges: false }

  let items: unknown[] = []
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed === '{}') {
      return { updatedMap: existingMap, hasChanges: false }
    }
    try {
      const parsed = JSON.parse(trimmed)
      items = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return { updatedMap: existingMap, hasChanges: false }
    }
  } else if (Array.isArray(raw)) {
    items = raw
  } else if (typeof raw === 'object') {
    items = [raw]
  }

  const next = { ...existingMap }
  let hasChanges = false

  for (const item of items) {
    if (item && typeof item === 'object' && 'asset_id' in item) {
      const rawPos = item as Partial<PositionReport & PositionOut>
      const assetId = String(rawPos.asset_id)
      const lat = Number(rawPos.lat ?? rawPos.latitude)
      const lon = Number(rawPos.lon ?? rawPos.longitude)

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        next[assetId] = {
          asset_id: assetId,
          asset_type: rawPos.asset_type || 'VESSEL',
          lat,
          lon,
          latitude: lat,
          longitude: lon,
          speed_knots: rawPos.speed_knots ?? null,
          heading_deg: rawPos.heading_deg ?? null,
          provenance: rawPos.provenance || 'REAL',
          source: rawPos.source || 'SSE',
          timestamp:
            rawPos.timestamp ||
            rawPos.reported_at ||
            rawPos.recorded_at ||
            new Date().toISOString(),
          recorded_at: rawPos.recorded_at,
          reported_at: rawPos.reported_at,
        }
        hasChanges = true
      }
    }
  }

  return { updatedMap: hasChanges ? next : existingMap, hasChanges }
}

/**
 * React hook that connects to NexaFreight's live position SSE stream
 * (/api/map/positions/stream) and maintains an up-to-date map of moving asset positions.
 */
export function useSSEPositions(
  options: UseSSEPositionsOptions = {}
): UseSSEPositionsReturn {
  const { apiUrl = BASE_URL, token: tokenOverride, enabled = true } = options

  const auth = useAuthStore()
  const activeToken =
    tokenOverride ??
    auth?.token ??
    (typeof window !== 'undefined' ? getToken() : null)

  const [positions, setPositions] = useState<Record<string, PositionReport>>({})
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<Event | null>(null)

  const esRef = useRef<EventSource | null>(null)
  const positionsRef = useRef<Record<string, PositionReport>>(positions)
  positionsRef.current = positions

  useEffect(() => {
    // Only run on the client
    if (typeof window === 'undefined') return

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let isCancelled = false

    // Clean up any previous EventSource instance
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    if (!enabled) {
      setIsConnected(false)
      return
    }

    const connect = () => {
      if (isCancelled) return

      const sseUrl = buildSSEUrl(apiUrl, activeToken)
      console.log('[useSSEPositions] Connecting EventSource to:', apiUrl + '/api/map/positions/stream')

      const es = new EventSource(sseUrl)
      esRef.current = es

      const processPayload = (raw: string) => {
        setPositions((prev) => {
          const { updatedMap, hasChanges } = parsePositionPayload(raw, prev)
          if (hasChanges) {
            setLastUpdate(new Date())
            return updatedMap
          }
          return prev
        })
      }

      // Handlers for POSITION_UPDATE, HEARTBEAT, and generic message events
      es.addEventListener('POSITION_UPDATE', (event: MessageEvent) => {
        processPayload(event.data)
      })

      es.addEventListener('HEARTBEAT', () => {
        setIsConnected(true)
        setError(null)
      })

      es.onmessage = (event: MessageEvent) => {
        processPayload(event.data)
      }

      es.onopen = () => {
        console.log('[useSSEPositions] Connection established to', apiUrl)
        setIsConnected(true)
        setError(null)
      }

      es.onerror = (err) => {
        console.warn('[useSSEPositions] Connection error or reconnecting:', err)
        setIsConnected(false)
        setError(err)

        // If closed permanently (e.g. server restarted or network drop), schedule a reconnect
        if (es.readyState === EventSource.CLOSED && !isCancelled) {
          console.log('[useSSEPositions] Connection closed; retrying in 4s...')
          es.close()
          esRef.current = null
          reconnectTimer = setTimeout(() => {
            connect()
          }, 4000)
        }
      }
    }

    connect()

    // Periodic memory audit log (every 60s) to verify bounded size as requested in Step 7
    const memoryAuditInterval = setInterval(() => {
      const activeCount = Object.keys(positionsRef.current).length
      console.log(`[useSSEPositions] Telemetry memory audit: ${activeCount} active assets tracked (memory bounded by asset_id keying)`)
    }, 60000)

    return () => {
      isCancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearInterval(memoryAuditInterval)
      console.log('[useSSEPositions] Closing connection to', apiUrl)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      setIsConnected(false)
    }
  }, [apiUrl, activeToken, enabled])

  const positionsList = useMemo(() => Object.values(positions), [positions])

  return {
    positions,
    positionsList,
    isConnected,
    lastUpdate,
    error,
  }
}
