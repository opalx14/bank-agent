"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import { PortalSheet } from "@/components/shared/shared.portal-sheet";
import type { WalletExportPayload } from "@/types";

interface ExportWalletModalProps {
  walletAddress: `0x${string}`;
  triggerClassName?: string;
}

export function ExportWalletModal({ walletAddress, triggerClassName = "" }: ExportWalletModalProps) {
  const [open, setOpen] = useState(false);
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exported, setExported] = useState<WalletExportPayload | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copiedField, setCopiedField] = useState<"address" | "key" | null>(null);
  const [keystoreMsg, setKeystoreMsg] = useState<string | null>(null);

  const handleClose = () => {
    setOpen(false);
    setExported(null);
    setRevealed(false);
    setPassphrase("");
    setAcknowledgedRisk(false);
    setErrorMsg(null);
    setCopiedField(null);
    setKeystoreMsg(null);
  };

  const requestExport = async (customPassphrase?: string) => {
    setErrorMsg(null);
    setKeystoreMsg(null);
    const cleanedPass = (customPassphrase ?? passphrase).trim();
    if (cleanedPass.length > 0 && cleanedPass.length < 8) {
      setErrorMsg("Keystore encryption passphrase must be at least 8 characters.");
      return null;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/wallet-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          acknowledgedRisk: true,
          ...(cleanedPass.length >= 8 ? { keystorePassphrase: cleanedPass } : {}),
        }),
      });
      const data = (await res.json()) as WalletExportPayload & { error?: string; message?: string };
      if (!res.ok || !data.privateKey) {
        setErrorMsg(data.message || data.error || "Unable to export wallet key.");
        return null;
      }
      setExported(data);
      return data;
    } catch {
      setErrorMsg("Network error while exporting wallet.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const copyValue = async (field: "address" | "key", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 2000);
    } catch {
      setErrorMsg("Clipboard permission denied. Select and copy manually.");
    }
  };

  const triggerKeystoreDownload = async () => {
    let payload = exported;
    if (!payload?.keystoreV3) {
      if (passphrase.trim().length < 8) {
        setErrorMsg("Enter a passphrase (at least 8 characters) to encrypt the Keystore V3 file.");
        return;
      }
      payload = await requestExport(passphrase);
    }
    if (!payload?.keystoreV3) return;

    const blob = new Blob([JSON.stringify(payload.keystoreV3, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opalx-wallet-${payload.walletAddress.slice(2, 10).toLowerCase()}-keystore-v3.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setKeystoreMsg("Downloaded encrypted Web3 Keystore V3 JSON (MetaMask / Core compatible).");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`ox-btn-ghost ox-press inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--ox-line)] px-3 py-1.5 text-xs font-semibold text-[var(--ox-ink)] hover:border-[var(--ox-ink)]/35 ${triggerClassName}`.trim()}
      >
        <KeyRound className="h-3.5 w-3.5 text-[var(--ox-avax)]" />
        <span>Export Private Key / Backup</span>
      </button>

      <PortalSheet open={open} onClose={handleClose} title="Export Decentralized Wallet">
        <button
          type="button"
          aria-label="Close"
          onClick={handleClose}
          className="ox-btn-ghost absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="-mt-1 mb-4 text-xs text-[var(--ox-muted)]">
          Self-custody export for <span className="font-mono font-semibold text-[var(--ox-ink)]">{walletAddress}</span>
        </p>

        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-[var(--ox-avax)]/30 bg-[var(--ox-avax-tint)] px-3.5 py-3 text-xs text-[var(--ox-avax-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">Never share your private key with anyone.</p>
            <p className="leading-relaxed opacity-90">
              Your Bank Agent embedded wallet is a standard EVM secp256k1 wallet. Import it into
              MetaMask, Core Wallet (Avalanche), or Rabby to take full independent custody anytime.
            </p>
          </div>
        </div>

        {!exported ? (
          <div className="space-y-3.5">
            <label className="ox-subcard flex cursor-pointer items-start gap-2.5 rounded-2xl p-3 text-xs">
              <input
                type="checkbox"
                checked={acknowledgedRisk}
                onChange={(e) => {
                  setAcknowledgedRisk(e.target.checked);
                  if (errorMsg) setErrorMsg(null);
                }}
                className="mt-0.5 h-4 w-4 accent-[var(--ox-avax)]"
              />
              <span className="leading-relaxed text-[var(--ox-ink)]">
                I understand that anyone holding this private key controls this wallet and its
                Avalanche Fuji assets &amp; on-chain guarantees.
              </span>
            </label>

            <div>
              <label htmlFor="export-keystore-pass" className="block text-xs font-semibold text-[var(--ox-ink)]">
                Keystore V3 Passphrase <span className="font-normal text-[var(--ox-muted)]">(optional, ≥8 chars for encrypted .json)</span>
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--ox-muted)]" />
                <input
                  id="export-keystore-pass"
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(e) => {
                    setPassphrase(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Optional encryption password for JSON backup"
                  className="ox-input min-h-[42px] w-full rounded-xl pr-3.5 pl-10 text-xs placeholder:text-[var(--ox-muted)]"
                />
              </div>
            </div>

            {errorMsg ? (
              <p role="alert" className="ox-badge-avax rounded-xl px-3.5 py-2 text-xs font-medium">
                {errorMsg}
              </p>
            ) : null}

            <button
              type="button"
              disabled={!acknowledgedRisk || busy}
              onClick={() => void requestExport()}
              className="ox-btn-avax inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              <span>Reveal Private Key</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="ox-subcard space-y-1.5 rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--ox-muted)]">EVM Wallet Address (Fuji 43113)</span>
                <button
                  type="button"
                  onClick={() => void copyValue("address", exported.walletAddress)}
                  className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[var(--ox-ink)] hover:underline"
                >
                  {copiedField === "address" ? <Check className="h-3 w-3 text-[var(--ox-ok)]" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedField === "address" ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <p className="break-all font-mono text-xs font-semibold text-[var(--ox-ink)]">
                {exported.walletAddress}
              </p>
            </div>

            <div className="ox-subcard space-y-2 rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--ox-muted)]">Private Key (secp256k1)</span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRevealed((prev) => !prev)}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[var(--ox-ink)] hover:underline"
                  >
                    {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{revealed ? "Hide" : "Show"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyValue("key", exported.privateKey)}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[var(--ox-avax-ink)] hover:underline"
                  >
                    {copiedField === "key" ? <Check className="h-3 w-3 text-[var(--ox-ok)]" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedField === "key" ? "Copied Key" : "Copy Key"}</span>
                  </button>
                </div>
              </div>
              <p
                data-testid="exported-private-key"
                className="break-all rounded-xl border border-[var(--ox-line)] bg-[var(--ox-surface)] px-3 py-2 font-mono text-xs font-semibold text-[var(--ox-ink)] select-all"
              >
                {revealed
                  ? exported.privateKey
                  : "0x••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
              </p>
            </div>

            <div className="ox-subcard space-y-2 rounded-2xl p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ox-ink)]">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--ox-ok)]" />
                <span>Encrypted Web3 Keystore V3 (.json)</span>
              </div>
              {!exported.keystoreV3 ? (
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(e) => {
                    setPassphrase(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Enter ≥8 char passphrase to encrypt JSON backup"
                  className="ox-input min-h-[38px] w-full rounded-xl px-3 text-xs placeholder:text-[var(--ox-muted)]"
                />
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void triggerKeystoreDownload()}
                className="ox-btn-primary inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                <span>Download Keystore V3 JSON</span>
              </button>
              {keystoreMsg ? <p className="text-[11px] font-medium text-[var(--ox-ok-ink)]">{keystoreMsg}</p> : null}
            </div>

            {errorMsg ? (
              <p role="alert" className="ox-badge-avax rounded-xl px-3.5 py-2 text-xs font-medium">
                {errorMsg}
              </p>
            ) : null}

            <p className="text-[11px] leading-relaxed text-[var(--ox-muted)]">
              Import directly into <strong>MetaMask</strong> (Account → Add account → Import account),{" "}
              <strong>Core Wallet</strong> (Avalanche), or <strong>Rabby</strong>.
            </p>
          </div>
        )}
      </PortalSheet>
    </>
  );
}
