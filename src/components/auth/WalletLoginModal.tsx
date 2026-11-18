"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Landmark, Loader2, Mail, Sparkles, User, X } from "lucide-react";
import { PortalSheet } from "@/components/shared/ui-kit";
import type { PortalRole } from "@/types";
import { HowWalletWorksSheet } from "./HowWalletWorksSheet";
import { useWalletAuth } from "./WalletAuthProvider";

interface WalletLoginModalProps {
  open: boolean;
  defaultLayout?: PortalRole;
  onClose: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_OPTIONS: ReadonlyArray<{
  role: PortalRole;
  label: string;
  desc: string;
  route: string;
  icon: typeof User;
}> = [
  { role: "CUSTOMER", label: "Cá nhân", desc: "Thanh toán & Thẻ", route: "/", icon: User },
  { role: "ENTERPRISE", label: "Doanh nghiệp", desc: "Gói DV & VietQR", route: "/enterprise", icon: Building2 },
  { role: "BANK", label: "Ngân hàng", desc: "Đối soát Fuji", route: "/bank", icon: Landmark },
];

export function WalletLoginModal({ open, defaultLayout = "CUSTOMER", onClose }: WalletLoginModalProps) {
  const router = useRouter();
  const { loading, loginWithRole } = useWalletAuth();
  const [role, setRole] = useState<PortalRole>(defaultLayout);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRole(defaultLayout);
    setErrorMsg(null);
  }, [open, defaultLayout]);

  const activeMeta = ROLE_OPTIONS.find((item) => item.role === role) ?? ROLE_OPTIONS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanedEmail = email.trim();
    if (!EMAIL_PATTERN.test(cleanedEmail)) {
      setErrorMsg("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }

    const rolePositionId =
      role === "ENTERPRISE" && cleanedEmail.toLowerCase() === "kyb.california-fitness@opalx.vn"
        ? "california-fitness"
        : role === "BANK"
          ? "bank-mb"
          : undefined;

    const session = await loginWithRole({
      role,
      provider: "EMAIL",
      email: cleanedEmail,
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      ...(rolePositionId ? { rolePositionId } : {}),
    });
    if (!session) {
      setErrorMsg("Không thể kết nối ví cho email này. Vui lòng thử lại.");
      return;
    }
    onClose();
    router.push(activeMeta.route);
  };

  const applySample = () => {
    setErrorMsg(null);
    if (role === "ENTERPRISE") {
      setEmail("kyb.california-fitness@opalx.vn");
      setDisplayName("California Fitness & Yoga");
    } else if (role === "BANK") {
      setEmail("officer.bank-mb@opalx.vn");
      setDisplayName("Kiểm toán MB Bank (970422)");
    } else {
      setEmail("member.cali@gmail.com");
      setDisplayName("Hội viên California");
    }
  };

  return (
    <PortalSheet open={open} onClose={onClose} title="Đăng nhập Ví">
      <button type="button" aria-label="Đóng" onClick={onClose} className="ox-btn-ghost absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full">
        <X className="h-4 w-4" />
      </button>
      <p className="mb-4 text-xs text-[var(--ox-muted)]">Chọn vai trò và kết nối ví nhúng 0-popup trên Avalanche Fuji.</p>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Chọn vai trò đăng nhập">
        {ROLE_OPTIONS.map((item) => {
          const Icon = item.icon;
          const active = role === item.role;
          return (
            <button
              key={item.role}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setRole(item.role);
                setErrorMsg(null);
              }}
              className={`ox-press flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition-all ${
                active ? "border-[var(--ox-ink)] bg-[var(--ox-surface)] shadow-sm ring-1 ring-[var(--ox-ink)]/15" : "ox-subcard hover:border-[var(--ox-ink)]/30"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? "ox-pill-active" : "bg-[var(--ox-surface)] text-[var(--ox-muted)]"}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {active ? <Check className="h-3.5 w-3.5 text-[var(--ox-ok)]" /> : null}
              </div>
              <div>
                <p className="text-xs font-bold text-[var(--ox-ink)]">{item.label}</p>
                <p className="text-[10px] leading-tight text-[var(--ox-muted)]">{item.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
        <div>
          <label htmlFor="modal-wallet-email" className="block text-xs font-semibold text-[var(--ox-ink)]">Email tài khoản</label>
          <div className="relative mt-1.5">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--ox-muted)]" />
            <input
              id="modal-wallet-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={role === "ENTERPRISE" ? "founder@company.vn" : role === "BANK" ? "officer.bank-mb@opalx.vn" : "name@gmail.com"}
              className="ox-input min-h-[44px] w-full rounded-xl pr-3.5 pl-10 text-sm placeholder:text-[var(--ox-muted)]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="modal-wallet-name" className="block text-xs font-semibold text-[var(--ox-ink)]">
            Tên hiển thị <span className="font-normal text-[var(--ox-muted)]">(tùy chọn)</span>
          </label>
          <input
            id="modal-wallet-name"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={role === "ENTERPRISE" ? "Tên doanh nghiệp" : "Tên hiển thị"}
            className="ox-input mt-1.5 min-h-[42px] w-full rounded-xl px-3.5 text-sm placeholder:text-[var(--ox-muted)]"
          />
        </div>

        <button type="button" onClick={applySample} className="ox-btn-ghost ox-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-[var(--ox-avax)]" />
          <span>Điền nhanh tài khoản mẫu</span>
        </button>

        {errorMsg ? <p role="alert" className="ox-badge-avax rounded-xl px-3.5 py-2 text-xs font-medium">{errorMsg}</p> : null}

        <button type="submit" disabled={loading} className={`${role === "ENTERPRISE" ? "ox-btn-avax" : "ox-btn-primary"} inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-60`}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span>Đăng nhập · Mở {activeMeta.label}</span>
        </button>

        <div className="flex justify-center pt-0.5">
          <HowWalletWorksSheet triggerVariant="link" roleHint="customer" />
        </div>
      </form>
    </PortalSheet>
  );
}
