'use client';

import React from 'react';
import { ChargingNode, Theme } from '@/types/node';
import { Zap, MapPin, IndianRupee, ShieldCheck, AlertTriangle, XCircle, ArrowRight, X, Hexagon } from 'lucide-react';

interface NodeCardProps {
  node: ChargingNode | null;
  onClose: () => void;
  onSelectStation: (node: ChargingNode) => void;
  theme?: Theme;
}

export default function NodeCard({ node, onClose, onSelectStation, theme = 'light' }: NodeCardProps) {
  if (!node) return null;

  const isDark = theme === 'dark';

  const getStatusBadge = (status: ChargingNode['status']) => {
    switch (status) {
      case 'available':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Available Now
          </span>
        );
      case 'busy':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Currently Busy
          </span>
        );
      case 'offline_fault':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Offline / Fault
          </span>
        );
    }
  };

  const isAvailable = node.status === 'available';

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1000] p-3 sm:p-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className={`max-w-md mx-auto pointer-events-auto backdrop-blur-md border rounded-3xl shadow-2xl p-4 sm:p-5 transition-all transform animate-in slide-in-from-bottom duration-300 ${
        isDark
          ? 'bg-neutral-900/95 border-neutral-800 text-white'
          : 'bg-white/95 border-gray-200 text-gray-900'
      }`}>
        {/* Mobile bottom sheet drag handle */}
        <div className={`w-10 h-1 rounded-full mx-auto mb-3 sm:hidden ${
          isDark ? 'bg-neutral-700' : 'bg-gray-300'
        }`} />
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              {getStatusBadge(node.status)}
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                isDark ? 'text-neutral-400 bg-neutral-800/80' : 'text-gray-500 bg-gray-100'
              }`}>
                ID: {node.id}
              </span>
            </div>
            <h2 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>{node.name}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close station details"
            className={`p-1.5 rounded-full transition-colors ${
              isDark ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Location & Address */}
        {node.address && (
          <div className={`flex items-start gap-2 text-xs mb-4 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
            <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-500 mt-0.5" />
            <p className="line-clamp-2">{node.address}</p>
          </div>
        )}

        {/* Specs Grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className={`border rounded-2xl p-3 ${isDark ? 'bg-neutral-800/60 border-neutral-700/50' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`flex items-center gap-1.5 text-xs mb-1 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
              <IndianRupee className="w-3.5 h-3.5 text-emerald-500" />
              Tariff Rate
            </div>
            <div className="text-lg font-bold text-emerald-500">
              ₹{node.tariff_per_kwh.toFixed(2)}{' '}
              <span className={`text-xs font-normal ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>/ kWh</span>
            </div>
          </div>

          <div className={`border rounded-2xl p-3 ${isDark ? 'bg-neutral-800/60 border-neutral-700/50' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`flex items-center gap-1.5 text-xs mb-1 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Power Rating
            </div>
            <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {node.max_power_kw}{' '}
              <span className={`text-xs font-normal ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>kW AC</span>
            </div>
          </div>
        </div>

        {/* Hex Spatial Grid Info */}
        <div className={`flex items-center justify-between text-[11px] font-mono px-3 py-1.5 rounded-xl border mb-3 ${
          isDark ? 'bg-neutral-950/70 border-neutral-800 text-neutral-400' : 'bg-gray-50 border-gray-200 text-gray-600'
        }`}>
          <div className="flex items-center gap-1.5">
            <Hexagon className="w-3.5 h-3.5 text-emerald-500" />
            <span>Hex Cell:</span>
            <span className="text-emerald-500 font-bold">{node.hexCellId || '87602816BFFFFFF'}</span>
          </div>
          <span className="text-[10px] text-neutral-500">
            {node.coverageRadiusKm || 2.4} km Hex Grid
          </span>
        </div>

        {/* Description / Host note */}
        {node.description && (
          <p className={`text-xs border rounded-xl p-2.5 mb-4 ${
            isDark ? 'text-neutral-300 bg-neutral-950/50 border-neutral-800/80' : 'text-gray-600 bg-gray-50 border-gray-200'
          }`}>
            {node.description}
          </p>
        )}

        {/* Security / Mesh note */}
        <div className={`flex items-center gap-2 text-[11px] mb-4 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Offline Escrow & BLE Auto-Sync Enabled</span>
        </div>

        {/* Action Button */}
        <button
          onClick={() => onSelectStation(node)}
          disabled={!isAvailable}
          className={`w-full py-3.5 px-4 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm transition-all shadow-lg ${
            isAvailable
              ? 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-emerald-500/20 active:scale-[0.98]'
              : isDark
                ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-300'
          }`}
        >
          {isAvailable ? (
            <>
              Select Station & Charge
              <ArrowRight className="w-4 h-4" />
            </>
          ) : node.status === 'busy' ? (
            'Station Currently Occupied'
          ) : (
            'Station Offline for Service'
          )}
        </button>

      </div>
    </div>
  );
}
