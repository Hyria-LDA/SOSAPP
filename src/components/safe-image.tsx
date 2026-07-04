import { ImgHTMLAttributes, useEffect, useRef, useState } from "react";
import { extractMateriaisPath, resignMateriaisPath } from "@/lib/material-photos";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  fallback?: React.ReactNode;
};

/**
 * Renders an <img> only when src is a valid non-empty string.
 * - Loga o HTTP status (via HEAD probe) e a URL completa quando o carregamento falha.
 * - Faz retry automático re-assinando a URL quando ela é uma signed URL expirada
 *   do bucket `materiais` (HTTP 400/401/403/410).
 */
export function SafeImage({ src, fallback = null, alt = "", onError, ...rest }: Props) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(
    typeof src === "string" && src.trim() ? src : null,
  );
  const [failed, setFailed] = useState(false);
  const retriedRef = useRef(false);

  useEffect(() => {
    retriedRef.current = false;
    setFailed(false);
    setCurrentSrc(typeof src === "string" && src.trim() ? src : null);
  }, [src]);

  if (!currentSrc || failed) return <>{fallback}</>;

  return (
    <img
      {...rest}
      src={currentSrc}
      alt={alt}
      onError={async (e) => {
        const failingUrl = currentSrc;
        let status: number | "n/a" = "n/a";
        try {
          const r = await fetch(failingUrl, { method: "HEAD", cache: "no-store" });
          status = r.status;
        } catch {
          /* network/CORS — keep n/a */
        }
        // eslint-disable-next-line no-console
        console.warn("[SafeImage] falha ao carregar imagem", {
          url: failingUrl,
          httpStatus: status,
          alt,
          ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
        });

        // Retry: se for signed URL do bucket materiais e parece expirada, re-assinar uma vez.
        const path = extractMateriaisPath(failingUrl);
        const expiredLike =
          status === 400 || status === 401 || status === 403 || status === 410;
        if (!retriedRef.current && path && (expiredLike || status === "n/a")) {
          retriedRef.current = true;
          const fresh = await resignMateriaisPath(path);
          if (fresh) {
            // eslint-disable-next-line no-console
            console.info("[SafeImage] retry com URL re-assinada", { path });
            setCurrentSrc(fresh);
            return;
          }
        }

        setFailed(true);
        onError?.(e);
      }}
    />
  );
}
