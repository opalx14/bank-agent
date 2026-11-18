"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Landmark, Loader2, Mail, Sparkles } from "lucide-react";
import { BankAgentLogo } from "@/components/shared/BankAgentLogo";
import { HowWalletWorksSheet } from "./HowWalletWorksSheet";
import { RoleFanStage } from "./RoleFanStage";
import { useWalletAuth } from "./WalletAuthProvider";

const BANK_POSITIONS = [
  { id: "bank-mb", label: "MB Bank (970422)" },
  { id: "bank-vcb", label: "Vietcombank (970436)" },
  { id: "bank-tcb", label: "Techcombank (970407)" },
  { id: "bank-acb", label: "ACB (970416)" },
  { id: "bank-bidv", label: "BIDV (970418)" },
  { id: "bank-vpbank", label: "VPBank (970432)" },
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function BankAuditorLoginCard() {
  const router = useRouter();
  const { loading, loginWithRole } = useWalletAuth();
  const [bankPos, setBankPos] = useState<string>("bank-mb");
  const [emailInput, setEmailInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const selectedBank = BANK_POSITIONS.find((b) => b.id === bankPos) ?? BANK_POSITIONS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanedEmail = emailInput.trim();
    if (!EMAIL_PATTERN.test(cleanedEmail)) {
      setErrorMsg("Vui lòng nhập email kiểm toán viên hợp lệ.");
      emailRef.current?.focus();
      return;
    }
    const session = await loginWithRole({
      role: "BANK",
      provider: "EMAIL",
      email: cleanedEmail,
      displayName: cleanedEmail === `officer.${selectedBank.id}@opalx.vn` ? `Kiểm toán ${selectedBank.label}` : undefined,
      rolePositionId: bankPos,
    });
    if (!session) {
      setErrorMsg("Không thể khởi tạo phiên kiểm toán Ngân hàng. Vui lòng thử lại.");
      return;
    }
    router.push("/bank");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid w-full items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <section aria-labelledby="bank-gateway-title" className="mx-auto w-full max-w-[460px] lg:mx-0">
          <BankAgentLogo variant="full" className="h-[64px] w-auto sm:h-[74px]" priority />
          <h1 id="bank-gateway-title" className="mt-6 text-[clamp(30px,5vw,42px)] leading-[1.08] font-extrabold tracking-[-0.035em] text-[var(--ox-ink)]">
            Đối soát NAPAS 247.<span className="block text-[var(--ox-ok-ink)]">PolicyVault Fuji.</span>
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-[var(--ox-muted)]">
            Chọn ngân hàng kết nối và nhập email kiểm toán viên để vào cổng đối soát.
          </p>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
            <div>
              <label htmlFor="gateway-bank-select" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--ox-ink)]">
                <Landmark className="h-3.5 w-3.5 text-[var(--ox-avax)]" />
                <span>Ngân hàng đối tác NAPAS 247</span>
              </label>
              <select
                id="gateway-bank-select"
                value={bankPos}
                onChange={(e) => setBankPos(e.target.value)}
                className="ox-input h-[50px] w-full rounded-2xl px-4 text-sm font-medium"
              >
                {BANK_POSITIONS.map((bank) => <option key={bank.id} value={bank.id}>{bank.label}</option>)}
              </select>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="gateway-bank-email" className="text-xs font-semibold text-[var(--ox-ink)]">Email kiểm toán viên</label>
                <button
                  type="button"
                  onClick={() => { setErrorMsg(null); setEmailInput(`officer.${selectedBank.id}@opalx.vn`); emailRef.current?.focus(); }}
                  className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[var(--ox-muted)] transition-colors hover:text-[var(--ox-ink)]"
                >
                  <Sparkles className="h-3 w-3 text-[var(--ox-avax)]" />
                  <span>Dùng mẫu</span>
                </button>
              </div>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[var(--ox-muted)]" />
                <input
                  ref={emailRef}
                  id="gateway-bank-email"
                  type="email"
                  autoComplete="email"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); if (errorMsg) setErrorMsg(null); }}
                  placeholder={`officer.${bankPos}@opalx.vn`}
                  className="ox-input h-[52px] w-full rounded-2xl pr-4 pl-11 text-sm placeholder:text-[var(--ox-muted)]"
                />
              </div>
            </div>

            {errorMsg ? <p role="alert" className="ox-badge-avax rounded-2xl px-4 py-2.5 text-xs font-medium">{errorMsg}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="ox-start-btn w-full bg-[var(--ox-ink)] text-sm text-[var(--ox-bg)] shadow-[0_12px_28px_-12px_rgba(11,15,25,0.4)] disabled:opacity-60 sm:text-[15px]"
            >
              <span>Mở Cổng Kiểm Chứng Ngân Hàng</span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ox-ok)] text-white">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              </span>
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-[var(--ox-muted)]">
            <HowWalletWorksSheet triggerVariant="link" roleHint="bank" />
            <div className="flex items-center gap-3">
              <Link href="/" className="hover:text-[var(--ox-ink)] hover:underline">Cổng chính</Link>
              <span aria-hidden="true">·</span>
              <Link href="/roadmap" className="hover:text-[var(--ox-ink)] hover:underline">Kiến trúc</Link>
            </div>
          </div>
        </section>

        <div className="flex flex-col items-center">
          <RoleFanStage
            activeRole="BANK"
            onSelectRole={(role) => {
              if (role === "ENTERPRISE") router.push("/enterprise");
              else if (role === "CUSTOMER") router.push("/");
            }}
            bankLabel={selectedBank.label}
            holderLabel={emailInput.trim() || undefined}
          />
          <p className="mt-1 text-center font-mono text-[11px] text-[var(--ox-muted)]">
            Bấm vào thẻ để đổi vai trò · NAPAS 247 · 6 ngân hàng
          </p>
        </div>
      </div>
    </div>
  );
}