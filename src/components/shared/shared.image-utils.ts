/** Compresses a browser File image to a compact WebP/JPEG data URL (max 800px) for package/logo previews. */
export async function compressImageFileToDataUrl(
  file: File,
  maxWidth = 800,
  quality = 0.82,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select a valid image file (PNG, JPG, WebP).");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Unable to read image file."));
      el.src = objectUrl;
    });

    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser does not support image processing.");

    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/webp", quality);
    if (dataUrl.length > 520_000) {
      return canvas.toDataURL("image/jpeg", 0.72);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
