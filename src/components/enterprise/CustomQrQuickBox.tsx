"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";

interface CustomQrQuickBoxProps {
  enabled: boolean;
  qrImageDataUrl: string;
  onToggle: (next: boolean) => void;
  onChangeImage: (dataUrl: string) => void;
  persistToServer?: boolean;
  hideToggleRow?: boolean;
}

function resizeQrImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("FILE_READ_ERROR"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("IMAGE_DECODE_ERROR"));
      img.onload = () => {
        const maxSide = 520;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(64, Math.round(img.width * scale));
        const h = Math.max(64, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result || ""));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export function CustomQrQuickBox({
  enabled,
  qrImageDataUrl,
  onToggle,
  onChangeImage,
  persistToServer = true,
  hideToggleRow = false,
}: CustomQrQuickBoxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const saveServerConfig = async (useCustom: boolean, dataUrl: string) => {
    if (!persistToServer) return;
    await fetch("/api/bank/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useCustomQrImage: useCustom, customQrImageDataUrl: dataUrl }),
    }).catch(() => undefined);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const dataUrl = await resizeQrImageToDataUrl(file);
      onChangeImage(dataUrl);
      onToggle(true);
      await saveServerConfig(true, dataUrl);
      setStatusMsg("Đã lưu ảnh QR cá nhân để dùng khi tạo đơn.");
    } catch {
      setStatusMsg("Không đọc được ảnh này. Hãy chọn file PNG hoặc JPG.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    onChangeImage("");
    onToggle(false);
    await saveServerConfig(false, "");
    setStatusMsg("Đã xóa ảnh QR cá nhân.");
  };

  return (
    <div className="ox-subcard space-y-3 rounded-xl p-3.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!hideToggleRow ? (
          <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-[var(--ox-ink)]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                const next = e.target.checked;
                onToggle(next);
                if (qrImageDataUrl) void saveServerConfig(next, qrImageDataUrl);
              }}
              className="h-4 w-4 accent-[var(--ox-ok)]"
            />
            <span>Hiển thị ảnh QR cá nhân của bạn</span>
          </label>
        ) : (
          <span className="font-semibold text-[var(--ox-ink)]">Ảnh Mã QR thanh toán cá nhân</span>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="ox-btn-ghost inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 font-semibold text-[var(--ox-ink)] disabled:opacity-60"
        >
          {qrImageDataUrl ? <Upload className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
          <span>{busy ? "Đang tải..." : qrImageDataUrl ? "Đổi ảnh QR" : "Chọn ảnh QR từ máy"}</span>
        </button>
      </div>

      {qrImageDataUrl ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ox-line)] bg-[var(--ox-surface)] p-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-lg border border-[var(--ox-line)] bg-white p-1 shadow-sm">
              <img src={qrImageDataUrl} alt="Mã QR cá nhân của bạn" className="h-14 w-14 rounded object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--ox-ink)]">Đã sẵn sàng Mã QR của bạn</p>
              <p className="text-[11px] text-[var(--ox-muted)]">
                {enabled ? "Mã này sẽ hiện ngay khi tạo thanh toán." : "Bật công tắc để hiển thị mã này."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleRemove()}
            aria-label="Xóa ảnh QR cá nhân"
            className="rounded-lg p-2 text-[var(--ox-muted)] transition-colors hover:bg-[var(--ox-avax-tint)] hover:text-[var(--ox-avax-ink)]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-[var(--ox-muted)]">
          Chọn ảnh chụp mã QR ngân hàng của bạn (MB, VCB, MoMo...) để khách quét thử ngay khi demo.
        </p>
      )}

      {statusMsg && <p className="text-[11px] font-medium text-[var(--ox-ok-ink)]">{statusMsg}</p>}
    </div>
  );
}
