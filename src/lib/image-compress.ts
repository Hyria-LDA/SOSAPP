// Redimensiona e comprime para WEBP (fallback JPEG) no client.
export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<{ blob: Blob; ext: string; mime: string }> {
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.82;

  const bitmap = await loadBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp && webp.size > 0) return { blob: webp, ext: "webp", mime: "image/webp" };

  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  if (!jpeg) throw new Error("Falha ao comprimir imagem");
  return { blob: jpeg, ext: "jpg", mime: "image/jpeg" };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fallback */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Imagem inválida"));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}
