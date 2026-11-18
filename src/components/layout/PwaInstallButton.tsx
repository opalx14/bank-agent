"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Registers the pass-through Service Worker and exposes a 1-tap PWA install trigger. */
export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed || !deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <button
      type="button"
      onClick={() => void handleInstall()}
      aria-label="Cài ứng dụng OpalX GO"
      title="Cài App"
      className="ox-badge-verified ox-press inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold transition-opacity hover:opacity-90"
    >
      <Download className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden sm:inline">Cài App</span>
    </button>
  );
}
