'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getFeedHealth, type FeedHealthResponse, type FeedHealth } from '@/lib/nexafreight';
import { Activity, ShieldCheck, AlertCircle } from 'lucide-react';

export interface FeedAdapterStatus {
  key: string;
  name: string;
  shortName: string;
  isHealthy: boolean;
  messagesReceived: number;
  lastSuccessAt: string | null;
  provenance: string;
}

export interface FeedHealthIndicatorProps {
  className?: string;
  intervalMs?: number;
}

export default function FeedHealthIndicator({
  className = '',
  intervalMs = 30000,
}: FeedHealthIndicatorProps) {
  const [adapters, setAdapters] = useState<FeedAdapterStatus[]>([]);
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean>(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  const checkHealth = useCallback(async () => {
    try {
      const res: FeedHealthResponse = await getFeedHealth();
      const rawList = res?.adapters || [];
      setIsBackendHealthy(true);
      setLastCheck(new Date());

      // Identify backend adapters
      const aisAdapter = rawList.find(a =>
        a.adapter_name.toLowerCase().includes('ais')
      );
      const interpolatorAdapter = rawList.find(a =>
        a.adapter_name.toLowerCase().includes('interpolat') ||
        a.adapter_name.toLowerCase().includes('sim') ||
        a.adapter_name.toLowerCase().includes('truck')
      );
      const flightAdapter = rawList.find(a =>
        a.adapter_name.toLowerCase().includes('flight')
      );

      // Build adapter statuses for: AIS, TRUCK SIM, FLIGHT REPLAY
      const list: FeedAdapterStatus[] = [
        {
          key: 'ais',
          name: 'AIS Vessel Tracking',
          shortName: 'AIS',
          isHealthy: aisAdapter ? Boolean(aisAdapter.is_healthy) : false,
          messagesReceived: aisAdapter?.messages_received ?? 0,
          lastSuccessAt: aisAdapter?.last_success_at ?? null,
          provenance: aisAdapter?.provenance ? String(aisAdapter.provenance) : 'REPLAYED',
        },
        {
          key: 'truck_sim',
          name: 'Road Truck Sim',
          shortName: 'TRUCK',
          isHealthy: interpolatorAdapter ? Boolean(interpolatorAdapter.is_healthy) : false,
          messagesReceived: interpolatorAdapter?.messages_received ?? 0,
          lastSuccessAt: interpolatorAdapter?.last_success_at ?? null,
          provenance: interpolatorAdapter?.provenance ? String(interpolatorAdapter.provenance) : 'SIMULATED',
        },
        {
          key: 'flight_replay',
          name: 'Flight Cargo Replay',
          shortName: 'AIR',
          // If a dedicated flight adapter is reported, use it; otherwise interpolator handles flights
          isHealthy: flightAdapter
            ? Boolean(flightAdapter.is_healthy)
            : interpolatorAdapter
            ? Boolean(interpolatorAdapter.is_healthy)
            : false,
          messagesReceived: flightAdapter?.messages_received ?? interpolatorAdapter?.messages_received ?? 0,
          lastSuccessAt: flightAdapter?.last_success_at ?? interpolatorAdapter?.last_success_at ?? null,
          provenance: flightAdapter?.provenance
            ? String(flightAdapter.provenance)
            : interpolatorAdapter?.provenance
            ? String(interpolatorAdapter.provenance)
            : 'SIMULATED',
        },
      ];

      setAdapters(list);
    } catch {
      // Backend request failed or unauthenticated
      setIsBackendHealthy(false);
      setAdapters(prev =>
        prev.length > 0
          ? prev.map(a => ({ ...a, isHealthy: false }))
          : [
              { key: 'ais', name: 'AIS Vessel Tracking', shortName: 'AIS', isHealthy: false, messagesReceived: 0, lastSuccessAt: null, provenance: 'REPLAYED' },
              { key: 'truck_sim', name: 'Road Truck Sim', shortName: 'TRUCK', isHealthy: false, messagesReceived: 0, lastSuccessAt: null, provenance: 'SIMULATED' },
              { key: 'flight_replay', name: 'Flight Cargo Replay', shortName: 'AIR', isHealthy: false, messagesReceived: 0, lastSuccessAt: null, provenance: 'SIMULATED' },
            ]
      );
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, intervalMs);

    const handleAuthRefresh = () => {
      checkHealth();
    };
    window.addEventListener('nexafreight:auth_success', handleAuthRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('nexafreight:auth_success', handleAuthRefresh);
    };
  }, [checkHealth, intervalMs]);

  const allHealthy = isBackendHealthy && adapters.every(a => a.isHealthy);

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="pointer-events-auto glass-panel px-2.5 py-1 flex items-center gap-2.5 text-[9px] font-mono tracking-wider border-[var(--border-primary)] bg-black/40 hover:border-[#00BCD4]/50 transition-colors cursor-pointer select-none">
        <div className="flex items-center gap-1.5 text-[var(--text-muted)] font-bold">
          <Activity className={`w-3 h-3 ${allHealthy ? 'text-[#00BCD4]' : 'text-[#FF3D57]'}`} />
          <span className="hidden sm:inline">FEEDS</span>
        </div>

        {/* Individual Adapter Dots */}
        <div className="flex items-center gap-2">
          {adapters.map(adapter => {
            const dotColor = adapter.isHealthy ? 'bg-[#00E676]' : 'bg-[#FF3D57]';
            const shadowColor = adapter.isHealthy
              ? 'shadow-[0_0_6px_rgba(0,230,118,0.7)]'
              : 'shadow-[0_0_6px_rgba(255,61,87,0.8)] animate-pulse';

            return (
              <div
                key={adapter.key}
                className="flex items-center gap-1"
                title={`${adapter.name}: ${adapter.isHealthy ? 'HEALTHY' : 'OFFLINE'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${shadowColor}`} />
                <span className={`text-[8px] font-bold ${adapter.isHealthy ? 'text-[var(--text-secondary)]' : 'text-[#FF3D57]'}`}>
                  {adapter.shortName}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip Popup on Hover */}
      {showTooltip && (
        <div className="absolute top-full mt-2 right-0 z-[500] w-64 p-3 bg-[#0A0E17]/95 border border-[var(--border-primary)] rounded shadow-2xl backdrop-blur-md pointer-events-none">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-primary)]/50">
            <div className="flex items-center gap-1.5">
              {allHealthy ? (
                <ShieldCheck className="w-3.5 h-3.5 text-[#00E676]" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-[#FF3D57]" />
              )}
              <span className="text-[10px] font-mono font-bold text-white tracking-widest uppercase">
                TELEMETRY FEED HEALTH
              </span>
            </div>
            <span
              className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${
                allHealthy
                  ? 'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30'
                  : 'bg-[#FF3D57]/15 text-[#FF3D57] border border-[#FF3D57]/30'
              }`}
            >
              {allHealthy ? 'HEALTHY' : 'DEGRADED'}
            </span>
          </div>

          <div className="space-y-2">
            {adapters.map(adapter => (
              <div
                key={adapter.key}
                className="flex items-start justify-between text-[9px] font-mono p-1.5 rounded bg-white/[0.03] border border-white/[0.05]"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        adapter.isHealthy ? 'bg-[#00E676]' : 'bg-[#FF3D57]'
                      }`}
                    />
                    <span className="font-bold text-white">{adapter.name}</span>
                  </div>
                  <div className="text-[8px] text-[var(--text-muted)] mt-0.5 pl-3">
                    {adapter.messagesReceived.toLocaleString()} msgs • {adapter.provenance}
                  </div>
                </div>
                <span
                  className={`font-bold ${
                    adapter.isHealthy ? 'text-[#00E676]' : 'text-[#FF3D57]'
                  }`}
                >
                  {adapter.isHealthy ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            ))}
          </div>

          {lastCheck && (
            <div className="mt-2 pt-1.5 border-t border-white/[0.05] text-[8px] font-mono text-[var(--text-muted)] text-right">
              Updated: {lastCheck.toLocaleTimeString()} (every 30s)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
