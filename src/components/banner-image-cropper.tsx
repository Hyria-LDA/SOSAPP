import { useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Smartphone, Monitor } from "lucide-react";

// Proporção alvo do banner: 16:9 (mesma do carrossel da home)
export const BANNER_ASPECT = 16 / 9;
// Resolução final exportada (cobre desktop retina)
export const BANNER_OUT_W = 1600;
export const BANNER_OUT_H = Math.round(BANNER_OUT_W / BANNER_ASPECT); // 900

type Props = {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob, mime: string, ext: string) => void;
};

/**
 * Cropper visual com viewport 16:9. O usuário arrasta e dá zoom; ao confirmar,
 * geramos um PNG/WEBP recortado em 1600×900, centralizado, sem distorção.
 * Imagens menores são ampliadas; maiores são reduzidas — sempre `cover`.
 */
export function BannerImageCropper({ file, onCancel, onConfirm }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 }); // tamanho real do viewport em px
  const [minScale, setMinScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // offset do centro da imagem em relação ao centro do viewport
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Carrega a imagem
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      const ratio = i.width / i.height;
      if (Math.abs(ratio - BANNER_ASPECT) / BANNER_ASPECT > 0.6) {
        setWarn(
          "Esta imagem possui proporções muito diferentes. Ajuste o enquadramento antes de publicar.",
        );
      }
    };
    i.onerror = () => setWarn("Não foi possível ler esta imagem.");
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Mede viewport e calcula minScale (cover)
  useEffect(() => {
    if (!img) return;
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setVp({ w, h });
      const ms = Math.max(w / img.width, h / img.height);
      setMinScale(ms);
      setScale(ms);
      setPos({ x: 0, y: 0 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  // Mantém imagem cobrindo o viewport ao ajustar zoom/posição
  function clamp(nextScale: number, nextPos: { x: number; y: number }) {
    const s = Math.max(minScale, Math.min(minScale * 4, nextScale));
    if (!img) return { scale: s, pos: nextPos };
    const imgW = img.width * s;
    const imgH = img.height * s;
    const maxX = Math.max(0, (imgW - vp.w) / 2);
    const maxY = Math.max(0, (imgH - vp.h) / 2);
    return {
      scale: s,
      pos: {
        x: Math.max(-maxX, Math.min(maxX, nextPos.x)),
        y: Math.max(-maxY, Math.min(maxY, nextPos.y)),
      },
    };
  }


  function applyScale(next: number) {
    const c = clamp(next, pos);
    setScale(c.scale);
    setPos(c.pos);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    const c = clamp(scale, { x: dragRef.current.px + dx, y: dragRef.current.py + dy });
    setPos(c.pos);
  }
  function onPointerUp() {
    dragRef.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    applyScale(scale * (e.deltaY < 0 ? 1.08 : 0.92));
  }

  async function confirm() {
    if (!img) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = BANNER_OUT_W;
      canvas.height = BANNER_OUT_H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Mapeia a transformação do viewport para a saída
      const k = BANNER_OUT_W / vp.w; // mesma proporção em y por causa do aspect
      const drawW = img.width * scale * k;
      const drawH = img.height * scale * k;
      const cx = BANNER_OUT_W / 2 + pos.x * k;
      const cy = BANNER_OUT_H / 2 + pos.y * k;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/webp", 0.86),
      );
      if (blob && blob.size > 0) {
        onConfirm(blob, "image/webp", "webp");
        return;
      }
      const jpg: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", 0.88),
      );
      if (!jpg) throw new Error("Falha ao gerar imagem");
      onConfirm(jpg, "image/jpeg", "jpg");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-foreground/60" onClick={onCancel}>
      <div
        className="mt-auto max-h-[95vh] overflow-y-auto rounded-t-3xl bg-background pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-border" />
        <div className="flex items-center justify-between px-5 pb-2">
          <h3 className="text-base font-black">✂️ Ajustar Imagem do Banner</h3>
          <button
            onClick={onCancel}
            className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-6">
          <p className="mb-2 text-xs text-muted-foreground">
            Arraste para reposicionar · use o zoom para ajustar. Mantenha textos e logos na{" "}
            <strong>região central</strong>.
          </p>

          {/* Viewport de crop 16:9 */}
          <div
            ref={viewportRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            className="relative w-full touch-none select-none overflow-hidden rounded-2xl bg-black"
            style={{ aspectRatio: "16 / 9", cursor: dragRef.current ? "grabbing" : "grab" }}
          >
            {img && vp.w > 0 && (
              <img
                src={img.src}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: img.width * scale,
                  height: img.height * scale,
                  transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                  maxWidth: "none",
                }}
              />
            )}
            {/* Overlay de área segura */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[10%] right-[10%] top-[15%] bottom-[15%] rounded-md border border-dashed border-white/70" />
              <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white">
                Área segura (textos / logos)
              </span>
            </div>
          </div>

          {/* Controles */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => applyScale(scale * 0.9)}
              className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={minScale}
              max={minScale * 4}
              step={0.01}
              value={scale}
              onChange={(e) => applyScale(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <button
              onClick={() => applyScale(scale * 1.1)}
              className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setScale(minScale);
                setPos({ x: 0, y: 0 });
              }}
              className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
              title="Reposicionar"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          {warn && (
            <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-50 p-2 text-[11px] text-amber-800">
              ⚠️ {warn}
            </div>
          )}

          {/* Previews */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pré-visualização
              </span>
              <div className="flex rounded-lg bg-secondary p-0.5 text-[11px] font-semibold">
                <button
                  onClick={() => setDevice("mobile")}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 ${device === "mobile" ? "bg-background shadow-sm" : ""}`}
                >
                  <Smartphone className="h-3 w-3" /> Mobile
                </button>
                <button
                  onClick={() => setDevice("desktop")}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 ${device === "desktop" ? "bg-background shadow-sm" : ""}`}
                >
                  <Monitor className="h-3 w-3" /> Desktop
                </button>
              </div>
            </div>

            <LivePreview
              img={img}
              scale={scale}
              pos={pos}
              vp={vp}
              maxWidth={device === "mobile" ? 360 : 720}
            />
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={onCancel}
              className="h-12 flex-1 rounded-xl bg-secondary text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              onClick={confirm}
              disabled={saving || !img || vp.w === 0}
              className="h-12 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Processando…" : "Usar esta imagem"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LivePreview({
  img,
  scale,
  pos,
  vp,
  maxWidth,
}: {
  img: HTMLImageElement | null;
  scale: number;
  pos: { x: number; y: number };
  vp: { w: number; h: number };
  maxWidth: number;
}) {
  if (!img || vp.w === 0) {
    return (
      <div
        className="rounded-2xl bg-muted"
        style={{ maxWidth, aspectRatio: "16 / 9", width: "100%" }}
      />
    );
  }
  // Escala o crop para o tamanho do preview
  const k = maxWidth / vp.w;
  return (
    <div className="mx-auto" style={{ maxWidth, width: "100%" }}>
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-black shadow-card"
        style={{ aspectRatio: "16 / 9" }}
      >
        <img
          src={img.src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: img.width * scale * k,
            height: img.height * scale * k,
            transform: `translate(calc(-50% + ${pos.x * k}px), calc(-50% + ${pos.y * k}px))`,
            maxWidth: "none",
          }}
        />
      </div>
    </div>
  );
}
