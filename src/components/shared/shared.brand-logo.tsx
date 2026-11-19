import type { CSSProperties } from "react";

export type BankAgentLogoVariant = "mark" | "lockup" | "full";
export type BankAgentLogoTheme = "auto" | "light" | "dark";

export interface BankAgentLogoProps {
  variant?: BankAgentLogoVariant;
  theme?: BankAgentLogoTheme;
  className?: string;
  style?: CSSProperties;
  alt?: string;
  decorative?: boolean;
  priority?: boolean;
}

const VARIANT_META: Record<
  BankAgentLogoVariant,
  { lightSrc: string; darkSrc: string; width: number; height: number }
> = {
  mark: {
    lightSrc: "/brand/bank-agent-mark.png",
    darkSrc: "/brand/bank-agent-mark.png",
    width: 512,
    height: 512,
  },
  lockup: {
    lightSrc: "/brand/bank-agent-lockup.png",
    darkSrc: "/brand/bank-agent-lockup-dark.png",
    width: 903,
    height: 342,
  },
  full: {
    lightSrc: "/brand/bank-agent-logo.png",
    darkSrc: "/brand/bank-agent-logo-dark.png",
    width: 905,
    height: 398,
  },
};

export function BankAgentLogo({
  variant = "lockup",
  theme = "auto",
  className = "",
  style,
  alt = "Bank Agent",
  decorative = false,
  priority = false,
}: BankAgentLogoProps) {
  const meta = VARIANT_META[variant];
  const imgAlt = decorative ? "" : alt;
  const fetchPriority = priority ? "high" : undefined;

  if (variant === "mark" || theme !== "auto") {
    const src = theme === "dark" ? meta.darkSrc : meta.lightSrc;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={imgAlt}
        aria-hidden={decorative || undefined}
        width={meta.width}
        height={meta.height}
        decoding="async"
        fetchPriority={fetchPriority}
        style={style}
        className={`shrink-0 select-none object-contain ${className}`}
      />
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={meta.lightSrc}
        alt={imgAlt}
        aria-hidden={decorative || undefined}
        width={meta.width}
        height={meta.height}
        decoding="async"
        fetchPriority={fetchPriority}
        style={style}
        className={`shrink-0 select-none object-contain dark:hidden ${className}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={meta.darkSrc}
        alt={imgAlt}
        aria-hidden={decorative || undefined}
        width={meta.width}
        height={meta.height}
        decoding="async"
        fetchPriority={fetchPriority}
        style={style}
        className={`hidden shrink-0 select-none object-contain dark:block ${className}`}
      />
    </>
  );
}
