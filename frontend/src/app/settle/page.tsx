"use client";

import React, { useState } from "react";
import { 
  ShieldCheck, 
  Lock, 
  Unlock, 
  ArrowRight, 
  RotateCcw, 
  CheckCircle, 
  AlertTriangle,
  FileCheck,
  Wallet
} from "lucide-react";

export default function EscrowSettlementDemo() {
  const [wallet, setWallet] = useState<number>(1000.0);
  const [lockedHold, setLockedHold] = useState<number>(0.0);
  const [txId, setTxId] = useState<string>("");
  const [jwtToken, setJwtToken] = useState<string>("");
  const [step, setStep] = useState<number>(1);
  const [kwhDelivered, setKwhDelivered] = useState<number>(8.42);
  const [tariff, setTariff] = useState<number>(12.5);
  const [tamperSig, setTamperSig] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  // STEP 1: Lock Escrow (POST /api/charge/start)
  const handleLockEscrow = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${backendUrl}/api/charge/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "user_88",
          node_id: "node_esp32_01",
          escrow_amount: 200.0,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Escrow hold failed");
      }

      const data = await res.json();
      setTxId(data.tx_id);
      setJwtToken(data.session_token);
      setWallet((prev) => prev - 200);
      setLockedHold(200);
      setStep(2);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // STEP 2 & 3: Submit Offline Receipt to Settle (POST /api/charge/stop)
  const handleSettle = async () => {
    setLoading(true);
    setErrorMsg("");
    setResult(null);

    const offlineReceipt = {
      tx_id: txId,
      node_id: "node_esp32_01",
      kwh_delivered: Number(kwhDelivered),
      timestamp_end: Math.floor(Date.now() / 1000),
    };

    // If user clicked tamper, send a corrupt signature to test security trap
    const validSignature = "f0623d2ec08328bd620a07cb8f056dde86af6b39c80db242e32cc0c9cfd94b4e";
    const signature = tamperSig ? "hacker_tampered_fake_signature" : validSignature;

    try {
      const res = await fetch(`${backendUrl}/api/charge/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_id: txId,
          offline_receipt: offlineReceipt,
          signature: signature,
        }),
      });

      if (res.status === 403) {
        const err = await res.json();
        setErrorMsg(`🚨 SECURITY TRAP TRIGGERED: ${err.detail}`);
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Settlement failed");
      }

      const resData = await res.json();
      const settlement = resData.data;
      setResult(settlement);
      setLockedHold(0);
      setWallet(settlement.wallet_balance || wallet + settlement.refund_amount);
      setStep(3);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setWallet(1000.0);
    setLockedHold(0.0);
    setTxId("");
    setJwtToken("");
    setStep(1);
    setResult(null);
    setErrorMsg("");
    setTamperSig(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col items-center justify-center font-sans">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-extrabold text-white flex items-center gap-2">
              <ShieldCheck className="text-emerald-400 w-6 h-6" />
              Person 2: Escrow Settlement Inspector
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Visualizing how money locks, gets spent offline, and settles change.
            </p>
          </div>
          <button
            onClick={handleReset}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>

        {/* Live Wallet & Escrow Vault View */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-emerald-400" /> Driver Wallet (user_88)
            </span>
            <p className="text-2xl font-black text-emerald-300 mt-1">₹{wallet.toFixed(2)}</p>
            <span className="text-[10px] text-slate-500">Available to spend</span>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-amber-400" /> Locked Escrow Vault
            </span>
            <p className="text-2xl font-black text-amber-300 mt-1">₹{lockedHold.toFixed(2)}</p>
            <span className="text-[10px] text-slate-500">Held for offline session</span>
          </div>
        </div>

        {/* STEP 1: Lock Deposit */}
        {step === 1 && (
          <div className="bg-slate-800/40 border border-slate-800 p-5 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">1</span>
              Initiate Escrow Hold
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Before the driver arrives at the offline charger, the cloud locks <strong className="text-emerald-400">₹200.00</strong> from their wallet and issues a signed offline cryptographic token.
            </p>
            <button
              onClick={handleLockEscrow}
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] font-bold text-sm text-white rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition"
            >
              {loading ? "Locking..." : "Call POST /api/charge/start (Lock ₹200)"}
            </button>
          </div>
        )}

        {/* STEP 2: The Return - Settlement */}
        {step === 2 && (
          <div className="bg-slate-800/40 border border-slate-800 p-5 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <span className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs">2</span>
              Offline Receipt Handed to Cloud
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs space-y-1 text-slate-300">
              <p><span className="text-slate-500">Transaction ID:</span> {txId.slice(0, 18)}...</p>
              <p><span className="text-slate-500">Tariff Rate:</span> ₹{tariff.toFixed(2)} / kWh</p>
              <div className="flex items-center justify-between pt-2">
                <span className="text-slate-400">Units Consumed:</span>
                <input
                  type="number"
                  step="0.1"
                  value={kwhDelivered}
                  onChange={(e) => setKwhDelivered(parseFloat(e.target.value) || 0)}
                  className="bg-slate-800 text-sky-300 font-bold px-2 py-1 rounded border border-slate-700 w-24 text-right"
                />
              </div>
            </div>

            {/* Tamper Toggle Checkbox */}
            <div className="flex items-center gap-2 bg-rose-950/30 border border-rose-900/50 p-3 rounded-lg text-xs text-rose-300">
              <input
                type="checkbox"
                id="tamper"
                checked={tamperSig}
                onChange={(e) => setTamperSig(e.target.checked)}
                className="w-4 h-4 accent-rose-500 cursor-pointer"
              />
              <label htmlFor="tamper" className="cursor-pointer">
                <strong>Simulate Hacker Attack:</strong> Corrupt signature to test 403 Forbidden check.
              </label>
            </div>

            <button
              onClick={handleSettle}
              disabled={loading}
              className={`w-full py-3 font-bold text-sm text-white rounded-xl shadow-lg flex items-center justify-center gap-2 transition ${
                tamperSig
                  ? "bg-rose-600 hover:bg-rose-500"
                  : "bg-sky-600 hover:bg-sky-500 shadow-sky-900/30"
              }`}
            >
              {loading ? "Verifying..." : "Call POST /api/charge/stop (Settle & Refund)"}
            </button>
          </div>
        )}

        {/* STEP 3: Reconciled Result */}
        {step === 3 && result && (
          <div className="bg-emerald-950/30 border border-emerald-500/40 p-5 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
              <CheckCircle className="w-5 h-5" />
              Settlement Reconciled Atomically!
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs py-2 bg-slate-900/90 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-500 block text-[10px]">Power Used</span>
                <span className="font-bold text-white">{result.kwh_delivered} kWh</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Actual Bill</span>
                <span className="font-bold text-rose-300">₹{result.final_cost}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Change Refunded</span>
                <span className="font-bold text-emerald-400 text-sm">₹{result.refund_amount}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              ✅ The locked hold was lifted. The bill of ₹{result.final_cost} was deducted and the unused change of ₹{result.refund_amount} was credited straight back to the driver's wallet.
            </p>

            <button
              onClick={handleReset}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg transition"
            >
              Start Another Escrow Test
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="bg-rose-950/50 border border-rose-500/50 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="text-center text-[11px] text-slate-500">
          Viewing route: <code className="text-slate-400">/settle</code> • RelayEV Person 2 Visual Inspector
        </div>
      </div>
    </div>
  );
}
