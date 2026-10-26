'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { supabase, isSupabaseConfigured, DEMO_NODES } from '@/lib/supabaseClient';
import { ChargingNode, NodeSelectionPayload, Theme } from '@/types/node';
import NodeCard from '@/components/NodeCard';
import { 
  Zap, 
  Radio, 
  Search, 
  CheckCircle2, 
  Bluetooth, 
  Wallet, 
  ArrowRight,
  Sun,
  Moon,
  MapPin,
  X,
  Hexagon
} from 'lucide-react';
import { 
  generateHexCellId, 
  getHexRingNeighborhood, 
  getActiveMacroSector, 
  MACRO_HEX_SECTORS 
} from '@/lib/hexSpatial';

// Haversine formula to compute distance in km between two GPS coordinates
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Progressive Staged Loader while Leaflet canvas streams in
function MapLoadingSkeleton() {
  const [loadStep, setLoadStep] = useState(1);

  useEffect(() => {
    const t1 = setTimeout(() => setLoadStep(2), 400);
    const t2 = setTimeout(() => setLoadStep(3), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="w-full h-full min-h-[500px] flex flex-col items-center justify-center bg-neutral-950 text-white p-6 relative overflow-hidden select-none">
      {/* Background ambient radar grid */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:24px_24px]" />
      
      {/* Central Pulsing Mesh Core */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full border-2 border-emerald-500/30 animate-ping absolute inset-0" />
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
          <Zap className="w-8 h-8 animate-pulse" />
        </div>
      </div>

      <div className="max-w-xs w-full text-center space-y-3 z-10">
        <div className="text-sm font-bold tracking-tight text-white flex items-center justify-center gap-2">
          <span>RelayEV Mesh Node</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">v1.0</span>
        </div>

        {/* Step-by-step progressive status */}
        <div className="space-y-1.5 text-[11px] font-mono text-left bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3.5 shadow-xl">
          <div className="flex items-center gap-2 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>✓ 20 Regional Ports Ready</span>
          </div>
          <div className={`flex items-center gap-2 transition-opacity duration-300 ${loadStep >= 2 ? 'text-emerald-400' : 'text-neutral-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${loadStep >= 2 ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
            <span>{loadStep >= 2 ? '✓ Vellore Region Calibrated' : 'Calibrating region...'}</span>
          </div>
          <div className={`flex items-center gap-2 transition-opacity duration-300 ${loadStep >= 3 ? 'text-amber-400 animate-pulse' : 'text-neutral-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${loadStep >= 3 ? 'bg-amber-400' : 'bg-neutral-600'}`} />
            <span>{loadStep >= 3 ? 'Rendering Map Surface...' : 'Streaming tiles...'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Dynamically import Leaflet Map to avoid SSR `window` reference error
const MapViewer = dynamic(() => import('@/components/MapViewer'), {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
});

export default function DiscoveryMapPage() {
  const [nodes, setNodes] = useState<ChargingNode[]>(DEMO_NODES);
  const [selectedNode, setSelectedNode] = useState<ChargingNode | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'busy'>('all');
  const [realtimeActive, setRealtimeActive] = useState<boolean>(false);
  const [handoffPayload, setHandoffPayload] = useState<NodeSelectionPayload | null>(null);
  const [theme, setTheme] = useState<Theme>('light');
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  const isDark = theme === 'dark';

  // 1. Fetch nodes from Supabase with graceful fallback
  useEffect(() => {
    let isMounted = true;

    async function fetchNodes() {
      setIsLoading(true);
      try {
        if (!isSupabaseConfigured) {
          console.warn('Supabase credentials not configured. Using local rural demo nodes.');
          if (isMounted) {
            setNodes(DEMO_NODES);
            setIsLoading(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from('nodes')
          .select('*')
          .order('name', { ascending: true });

        if (error) {
          console.error('Supabase query error, falling back to demo nodes:', error.message);
          if (isMounted) setNodes(DEMO_NODES);
        } else if (data && data.length > 0) {
          if (isMounted) setNodes(data as ChargingNode[]);
        } else {
          if (isMounted) setNodes(DEMO_NODES);
        }
      } catch (err) {
        console.error('Network error during node discovery fetch:', err);
        if (isMounted) setNodes(DEMO_NODES);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchNodes();

    // 2. Real-time Status Sync & Clean Unsubscribe (Zombie Prevention)
    let channel: ReturnType<typeof supabase.channel> | null = null;

    if (isSupabaseConfigured) {
      channel = supabase
        .channel('public:nodes')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'nodes' },
          (payload) => {
            const updatedNode = payload.new as ChargingNode;
            setNodes((prevNodes) =>
              prevNodes.map((n) => (n.id === updatedNode.id ? { ...n, ...updatedNode } : n))
            );

            // Update drawer if open
            setSelectedNode((curr) => (curr && curr.id === updatedNode.id ? { ...curr, ...updatedNode } : curr));
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setRealtimeActive(true);
          } else {
            setRealtimeActive(false);
          }
        });
    }

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
        setRealtimeActive(false);
      }
    };
  }, []);

  // Filtered nodes based on search & availability
  const filteredNodes = nodes.filter((node) => {
    const matchesSearch =
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (node.address && node.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
      node.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ? true : node.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // 3. Hierarchical Tier 1 Macro Hexagon resolution
  const activeMacroSector = userCoords
    ? getActiveMacroSector(userCoords[0], userCoords[1])
    : MACRO_HEX_SECTORS[0]; // Default to Vellore Central Macro Sector

  // Calculate distance, Macro Sector Priority, and Hexagonal Spatial Ring neighborhood
  const nodesWithDistance = filteredNodes.map((node) => {
    const distance = userCoords
      ? getDistanceKm(userCoords[0], userCoords[1], node.latitude, node.longitude)
      : null;
    const hexRing = distance !== null ? getHexRingNeighborhood(distance, node.coverageRadiusKm || 2.4) : null;
    const hexCell = node.hexCellId || generateHexCellId(node.latitude, node.longitude);
    const isPrimary = activeMacroSector.stationIds.includes(node.id);
    return { ...node, distance, hexRing, hexCell, isPrimary };
  }).sort((a, b) => {
    // Primary in-hex sector stations always rank higher than outer sector secondary stations
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1;
    }
    if (a.distance !== null && b.distance !== null) {
      return a.distance - b.distance;
    }
    return 0;
  });

  const primaryStations = nodesWithDistance.filter((n) => n.isPrimary);
  const secondaryStations = nodesWithDistance.filter((n) => !n.isPrimary);

  // Count available ports
  const availableCount = nodes.filter((n) => n.status === 'available').length;

  // Handoff to Person 2 (Escrow) and Person 3 (BLE Connector)
  const handleSelectStation = (node: ChargingNode) => {
    const payload: NodeSelectionPayload = {
      nodeId: node.id,
      tariffPerKwh: node.tariff_per_kwh,
      latitude: node.latitude,
      longitude: node.longitude,
      name: node.name,
      maxPowerKw: node.max_power_kw,
    };

    setHandoffPayload(payload);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('relayev:station-selected', { detail: payload })
      );
    }
  };

  return (
    <div className={`relative w-screen h-screen overflow-hidden font-sans flex flex-col transition-colors duration-300 ${
      isDark ? 'bg-neutral-950 text-white' : 'bg-gray-100 text-gray-900'
    }`}>
      {/* Top Floating App Bar (Optimized for Mobile Safe Area & Notches) */}
      <header className="absolute top-0 inset-x-0 pt-[max(0.75rem,env(safe-area-inset-top))] px-3 sm:px-4 z-[900] max-w-2xl mx-auto flex flex-col gap-2 pointer-events-none">
        <div className={`pointer-events-auto backdrop-blur-md border rounded-2xl p-3 shadow-xl flex items-center justify-between gap-3 transition-colors duration-300 ${
          isDark
            ? 'bg-neutral-900/90 border-neutral-800 text-white'
            : 'bg-white/95 border-gray-200 text-gray-900'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
              <Zap className="w-5 h-5 fill-emerald-500/20" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold tracking-tight">RelayEV</h1>
                <span className={`text-[10px] font-mono uppercase px-1.5 py-0.2 rounded border ${
                  isDark
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                }`}>
                  Mesh v1.0
                </span>
              </div>
              <p className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                Rural Offline-First Charging Network
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Toggle Pill (Explicit Light / Dark) */}
            <div className={`flex items-center p-0.5 rounded-xl border ${
              isDark ? 'bg-neutral-950 border-neutral-800' : 'bg-gray-100 border-gray-200'
            }`}>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  !isDark
                    ? 'bg-white text-amber-600 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isDark
                    ? 'bg-neutral-800 text-indigo-400 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Dark</span>
              </button>
            </div>

            {/* Live Sync Status indicator */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
              isDark
                ? 'bg-neutral-800/80 border-neutral-700/60 text-neutral-300'
                : 'bg-gray-100 border-gray-200 text-gray-600'
            }`}>
              <Radio
                className={`w-3 h-3 ${
                  realtimeActive
                    ? 'text-emerald-400 animate-pulse'
                    : isSupabaseConfigured
                    ? 'text-amber-400'
                    : 'text-neutral-400'
                }`}
              />
              <span className="hidden sm:inline">
                {realtimeActive ? 'Realtime' : 'Cache'}
              </span>
            </div>
          </div>
        </div>

        {/* Search & Status Filters Bar */}
        <div className={`pointer-events-auto backdrop-blur-md border rounded-2xl p-2 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center gap-2 transition-colors duration-300 ${
          isDark
            ? 'bg-neutral-900/90 border-neutral-800 text-white'
            : 'bg-white/95 border-gray-200 text-gray-900'
        }`}>
          <div className="relative flex-1 min-w-0">
            <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${
              isDark ? 'text-neutral-400' : 'text-gray-400'
            }`} />
            <input
              type="text"
              placeholder="Search nearby stations or tap to view all..."
              value={searchQuery}
              onFocus={() => setIsSearchOpen(true)}
              onClick={() => setIsSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              className={`w-full pl-9 pr-8 py-2 sm:py-1.5 text-xs border rounded-xl focus:outline-none focus:border-emerald-500/60 transition-colors duration-300 ${
                isDark
                  ? 'bg-neutral-950/70 border-neutral-800 text-neutral-200 placeholder:text-neutral-500'
                  : 'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className={`flex items-center justify-between sm:justify-start gap-1 p-1 border rounded-xl text-xs shrink-0 transition-colors duration-300 ${
            isDark ? 'bg-neutral-950/60 border-neutral-800' : 'bg-gray-50 border-gray-200'
          }`}>
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex-1 sm:flex-initial px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-medium text-center transition-colors ${
                statusFilter === 'all'
                  ? isDark ? 'bg-neutral-800 text-white' : 'bg-gray-200 text-gray-900'
                  : isDark ? 'text-neutral-400 hover:text-neutral-200' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              All ({nodes.length})
            </button>
            <button
              onClick={() => setStatusFilter('available')}
              className={`flex-1 sm:flex-initial px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                statusFilter === 'available'
                  ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                  : isDark ? 'text-neutral-400 hover:text-emerald-400' : 'text-gray-500 hover:text-emerald-600'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Available
            </button>
            <button
              onClick={() => setStatusFilter('busy')}
              className={`flex-1 sm:flex-initial px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                statusFilter === 'busy'
                  ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                  : isDark ? 'text-neutral-400 hover:text-amber-400' : 'text-gray-500 hover:text-amber-600'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Busy
            </button>
          </div>
        </div>

        {/* Nearby Charging Ports Dropdown (Opens on Search Click/Focus) */}
        {isSearchOpen && (
          <div className={`pointer-events-auto backdrop-blur-md border rounded-3xl p-4 shadow-2xl transition-all animate-in slide-in-from-top-2 duration-200 flex flex-col max-h-[65vh] ${
            isDark
              ? 'bg-neutral-900/95 border-neutral-800 text-white'
              : 'bg-white/98 border-gray-200 text-gray-900'
          }`}>
            {/* Header info */}
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-neutral-700/40 dark:border-neutral-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                    <Hexagon className="w-3.5 h-3.5 fill-emerald-500/20" />
                    Tiered Hexagonal Spatial Grid
                  </h3>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    {activeMacroSector.code}
                  </span>
                </div>
                <p className={`text-[11px] mt-0.5 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                  {userCoords 
                    ? `Current Sector: ${activeMacroSector.name} • 3 Nearest Primary Stations Prioritized`
                    : `Sector: ${activeMacroSector.name} • 3 Primary In-Hex Stations + Secondary Highway Nodes`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className={`p-1.5 rounded-full transition-colors ${
                  isDark ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-800'
                }`}
                title="Close list"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of Nearby Charging Ports partitioned into Primary & Secondary */}
            <div className="overflow-y-auto space-y-4 pr-1 max-h-[50vh]">
              {nodesWithDistance.length === 0 ? (
                <div className={`text-center py-6 text-xs ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                  No charging ports found matching your criteria.
                </div>
              ) : (
                <>
                  {/* Tier 1 Primary Choices Section (3 Stations in Current Macro Hexagon) */}
                  {primaryStations.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                          ⭐ Primary Choices • In Your Hexagon ({primaryStations.length})
                        </span>
                        <span className="text-[10px] font-mono text-cyan-500/80 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                          Tier 1 In-Hex
                        </span>
                      </div>

                      {primaryStations.map((node) => {
                        const isAvailable = node.status === 'available';
                        const isBusy = node.status === 'busy';
                        return (
                          <div
                            key={node.id}
                            onClick={() => {
                              setSelectedNode(node);
                              setIsSearchOpen(false);
                            }}
                            className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                              isDark
                                ? 'bg-cyan-950/20 hover:bg-cyan-900/30 border-cyan-500/30 hover:border-cyan-400/60 active:scale-[0.99] shadow-sm shadow-cyan-950/40'
                                : 'bg-cyan-50/50 hover:bg-cyan-50 border-cyan-200 hover:border-cyan-400 active:scale-[0.99]'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                {/* Primary In-Hex Priority Badge */}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                  ⭐ Primary
                                </span>

                                {isAvailable ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Available
                                  </span>
                                ) : isBusy ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    Busy
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                    Offline Fault
                                  </span>
                                )}

                                {node.hexRing ? (
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${node.hexRing.badgeClass}`}>
                                    <Hexagon className="w-2.5 h-2.5" />
                                    {node.hexRing.label}
                                  </span>
                                ) : null}

                                {node.distance !== null ? (
                                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 font-bold">
                                    📍 {node.distance < 1 ? `${Math.round(node.distance * 1000)} m` : `${node.distance.toFixed(1)} km`}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800/60 px-2 py-0.5 rounded">
                                    ID: {node.id}
                                  </span>
                                )}

                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                  isDark ? 'text-neutral-400 bg-neutral-800/40 border-neutral-700/50' : 'text-gray-500 bg-gray-100 border-gray-200'
                                }`}>
                                  ⬡ {node.hexCell.slice(0, 9)}
                                </span>
                              </div>

                              <h4 className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {node.name}
                              </h4>

                              <p className={`text-[11px] truncate ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                                {node.address || `${node.latitude.toFixed(3)}° N, ${node.longitude.toFixed(3)}° E`}
                              </p>

                              <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                                <span className="font-semibold text-emerald-500">
                                  ₹{node.tariff_per_kwh.toFixed(2)} / kWh
                                </span>
                                <span className={isDark ? 'text-neutral-600' : 'text-gray-300'}>•</span>
                                <span className={isDark ? 'text-neutral-300' : 'text-gray-600'}>
                                  {node.max_power_kw} kW AC
                                </span>
                              </div>
                            </div>

                            <div className={`p-2 rounded-xl shrink-0 transition-colors ${
                              isDark ? 'bg-cyan-900/40 text-cyan-300' : 'bg-cyan-100 text-cyan-700 shadow-sm'
                            }`}>
                              <ArrowRight className="w-4 h-4 text-cyan-400" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tier 1 Secondary Choices Section (Outer Macro Hexagon Sectors) */}
                  {secondaryStations.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-neutral-700/40 dark:border-neutral-800">
                      <div className="flex items-center justify-between px-1">
                        <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                          isDark ? 'text-neutral-400' : 'text-gray-500'
                        }`}>
                          ⚡ Secondary Choices • Outer Hex Sectors ({secondaryStations.length})
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                          isDark ? 'text-neutral-400 bg-neutral-800/60 border-neutral-700/50' : 'text-gray-500 bg-gray-100 border-gray-200'
                        }`}>
                          Highway Backup
                        </span>
                      </div>

                      {secondaryStations.map((node) => {
                        const isAvailable = node.status === 'available';
                        const isBusy = node.status === 'busy';
                        return (
                          <div
                            key={node.id}
                            onClick={() => {
                              setSelectedNode(node);
                              setIsSearchOpen(false);
                            }}
                            className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                              isDark
                                ? 'bg-neutral-950/70 hover:bg-neutral-800/80 border-neutral-800/80 hover:border-neutral-700 active:scale-[0.99]'
                                : 'bg-gray-50 hover:bg-gray-100 border-gray-200 hover:border-gray-300 active:scale-[0.99]'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  isDark ? 'bg-neutral-800 text-neutral-400 border-neutral-700' : 'bg-gray-100 text-gray-500 border-gray-200'
                                }`}>
                                  ⚡ Secondary
                                </span>

                                {isAvailable ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Available
                                  </span>
                                ) : isBusy ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    Busy
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                    Offline Fault
                                  </span>
                                )}

                                {node.hexRing ? (
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${node.hexRing.badgeClass}`}>
                                    <Hexagon className="w-2.5 h-2.5" />
                                    {node.hexRing.label}
                                  </span>
                                ) : null}

                                {node.distance !== null ? (
                                  <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800/40 px-2 py-0.5 rounded-full border border-neutral-700/50">
                                    📍 {node.distance < 1 ? `${Math.round(node.distance * 1000)} m` : `${node.distance.toFixed(1)} km`}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800/60 px-2 py-0.5 rounded">
                                    ID: {node.id}
                                  </span>
                                )}

                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                  isDark ? 'text-neutral-400 bg-neutral-800/40 border-neutral-700/50' : 'text-gray-500 bg-gray-100 border-gray-200'
                                }`}>
                                  ⬡ {node.hexCell.slice(0, 9)}
                                </span>
                              </div>

                              <h4 className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {node.name}
                              </h4>

                              <p className={`text-[11px] truncate ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                                {node.address || `${node.latitude.toFixed(3)}° N, ${node.longitude.toFixed(3)}° E`}
                              </p>

                              <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                                <span className="font-semibold text-emerald-500">
                                  ₹{node.tariff_per_kwh.toFixed(2)} / kWh
                                </span>
                                <span className={isDark ? 'text-neutral-600' : 'text-gray-300'}>•</span>
                                <span className={isDark ? 'text-neutral-300' : 'text-gray-600'}>
                                  {node.max_power_kw} kW AC
                                </span>
                              </div>
                            </div>

                            <div className={`p-2 rounded-xl shrink-0 transition-colors ${
                              isDark ? 'bg-neutral-800 text-neutral-400' : 'bg-white text-gray-500 shadow-sm'
                            }`}>
                              <ArrowRight className="w-4 h-4 text-neutral-400" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Map View Area */}
      <main className="w-full h-full flex-1">
        <MapViewer
          nodes={filteredNodes}
          selectedNode={selectedNode}
          onSelectNode={(node) => setSelectedNode(node)}
          theme={theme}
          onLocationDetected={(coords) => setUserCoords(coords)}
        />
      </main>

      {/* Bottom Drawer Card */}
      <NodeCard
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onSelectStation={handleSelectStation}
        theme={theme}
      />

      {/* Handoff Modal (Interface to Person 2 Escrow & Person 3 WebBLE) */}
      {handoffPayload && (
        <div className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 transition-colors ${
            isDark
              ? 'bg-neutral-900 border-neutral-800 text-white'
              : 'bg-white border-gray-200 text-gray-900'
          }`}>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold mb-1">Station Selected</h3>
            <p className={`text-xs mb-4 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
              Ready to hand off node parameters to Cryptographic Escrow & WebBLE Handshake.
            </p>

            {/* Handoff Payload details */}
            <div className={`border rounded-2xl p-3.5 mb-5 font-mono text-xs space-y-1.5 ${
              isDark ? 'bg-neutral-950 border-neutral-800' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`flex justify-between ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                <span>Node ID:</span>
                <span className="text-emerald-500 font-bold">{handoffPayload.nodeId}</span>
              </div>
              <div className={`flex justify-between ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                <span>Station:</span>
                <span className={`truncate max-w-[200px] ${isDark ? 'text-neutral-200' : 'text-gray-800'}`}>{handoffPayload.name}</span>
              </div>
              <div className={`flex justify-between ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                <span>Tariff:</span>
                <span className={isDark ? 'text-neutral-200' : 'text-gray-800'}>₹{handoffPayload.tariffPerKwh.toFixed(2)} / kWh</span>
              </div>
              <div className={`flex justify-between ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                <span>Coordinates:</span>
                <span className={`text-[11px] ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>
                  {handoffPayload.latitude.toFixed(4)}, {handoffPayload.longitude.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Next steps pipeline */}
            <div className="space-y-2 mb-6">
              <div className={`flex items-center gap-2 text-xs p-2.5 rounded-xl border ${
                isDark ? 'text-neutral-300 bg-neutral-800/40 border-neutral-800' : 'text-gray-700 bg-gray-50 border-gray-200'
              }`}>
                <Wallet className="w-4 h-4 text-emerald-500 shrink-0" />
                <span><strong>Person 2 (Escrow):</strong> Lock ₹500 collateral & mint signed JWT</span>
              </div>
              <div className={`flex items-center gap-2 text-xs p-2.5 rounded-xl border ${
                isDark ? 'text-neutral-300 bg-neutral-800/40 border-neutral-800' : 'text-gray-700 bg-gray-50 border-gray-200'
              }`}>
                <Bluetooth className="w-4 h-4 text-sky-400 shrink-0" />
                <span><strong>Person 3 (WebBLE):</strong> Transmit token via BLE to ESP32 node</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setHandoffPayload(null)}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-medium transition-colors ${
                  isDark ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Back to Map
              </button>
              <button
                onClick={() => {
                  alert(`Handoff parameters saved for Node ${handoffPayload.nodeId}. Ready for Person 2 Escrow & Person 3 BLE.`);
                  setHandoffPayload(null);
                }}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-emerald-500/20"
              >
                Proceed to Escrow
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
