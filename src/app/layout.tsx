import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import { WalletAuthProvider } from "@/components/auth/WalletAuthProvider";
import { AccountModeProvider } from "@/components/layout/AccountModeProvider";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "@/styles/tailwind.css";

const beVietnamPro = Be_Vietnam_Pro({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  variable: "--font-be-vietnam",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("opalx-theme")==="dark"?"dark":"light";var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}})();`;

export const metadata: Metadata = {
  title: "OpalX GO — Thanh Toán VietQR & Bảo Chứng Avalanche Fuji",
  description:
    "Nền tảng Web3 liên kết trực tiếp NAPAS 247 & Avalanche Fuji: Doanh nghiệp khởi tạo Smart Contract & gói dịch vụ, Người dùng thanh toán VietQR nhận Thẻ Bảo Chứng.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#090c12" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${beVietnamPro.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="ox-mesh-bg min-h-screen overflow-x-hidden font-sans text-[var(--ox-ink)] antialiased selection:bg-[var(--ox-avax)] selection:text-white">
        <ThemeProvider>
          <AccountModeProvider>
            <WalletAuthProvider>
              <AppNavbar />
              <div className="pb-24 md:pb-12">{children}</div>
              <MobileBottomNav />
            </WalletAuthProvider>
          </AccountModeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
