import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type SplashBannerData = {
  id: string;
  titulo: string | null;
  subtitulo: string | null;
  imagem_url: string;
  link: string | null;
  botao_texto: string | null;
  duracao_segundos: number;
  delay_segundos: number;
  intervalo_minutos: number;
};

const SESSION_KEY = "splash_banner_shown";

export function SplashBannerGate() {
  const [banner, setBanner] = useState<SplashBannerData | null>(null);
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(10);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let cancelled = false;

    const clearTimers = () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };

    const showBanner = (b: SplashBannerData) => {
      if (cancelled) return;
      setBanner(b);
      setRemaining(b.duracao_segundos ?? 10);
      setOpen(true);
      supabase.rpc("increment_banner_view" as any, { _banner_id: b.id }).then(() => {});
      // agendar próxima exibição se houver intervalo configurado
      const intervaloMs = Math.max(0, Number(b.intervalo_minutos) || 0) * 60 * 1000;
      if (intervaloMs > 0) {
        const dur = (b.duracao_segundos ?? 10) * 1000;
        const next = setTimeout(() => showBanner(b), intervaloMs + dur);
        timersRef.current.push(next);
      }
    };

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: status } = await supabase.rpc("get_user_plan_status" as any, {
        _user_id: u.user.id,
      });
      const slug = ((status as any)?.plano?.slug as string) ?? "free";

      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("banners" as any)
        .select(
          "id, titulo, subtitulo, imagem_url, link, botao_texto, duracao_segundos, delay_segundos, intervalo_minutos, planos_alvo, data_inicio, data_fim",
        )
        .eq("ativo", true)
        .eq("exibir_abertura", true)
        .order("ordem", { ascending: true })
        .limit(10);
      const list = (data ?? []).filter((b: any) => {
        if (b.data_inicio && b.data_inicio > nowIso) return false;
        if (b.data_fim && b.data_fim < nowIso) return false;
        const alvo: string[] = Array.isArray(b.planos_alvo) ? b.planos_alvo : [];
        if (alvo.length === 0) return true;
        return alvo.includes(slug);
      });
      if (cancelled || list.length === 0) return;
      const raw = list[0] as any;
      const { signBannerImage } = await import("@/lib/banner-images");
      const signed = await signBannerImage(raw.imagem_url);
      const b = { ...raw, imagem_url: signed || raw.imagem_url } as SplashBannerData;
      const alreadyShown = sessionStorage.getItem(SESSION_KEY) === "1";
      const intervaloMs = Math.max(0, Number(b.intervalo_minutos) || 0) * 60 * 1000;
      // se já foi mostrado nesta sessão e não há intervalo recorrente, não exibe de novo
      if (alreadyShown && intervaloMs === 0) return;
      sessionStorage.setItem(SESSION_KEY, "1");
      const delayMs = alreadyShown
        ? intervaloMs
        : Math.max(0, Number(b.delay_segundos) || 0) * 1000;
      const t = setTimeout(() => showBanner(b), delayMs);
      timersRef.current.push(t);
    })();

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (remaining <= 0) {
      setOpen(false);
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [open, remaining]);

  if (!open || !banner) return null;

  const trackClick = () => {
    supabase.rpc("increment_banner_click" as any, { _banner_id: banner.id }).then(() => {});
  };
  const isExternal = banner.link?.startsWith("http");

  const image = (
    <img
      src={banner.imagem_url}
      alt={banner.titulo ?? ""}
      className="w-full object-cover"
      style={{ aspectRatio: "16 / 9" }}
    />
  );

  const wrappedImage =
    banner.link && !banner.botao_texto ? (
      isExternal ? (
        <a href={banner.link!} target="_blank" rel="noopener noreferrer" onClick={trackClick}>
          {image}
        </a>
      ) : (
        <Link to={banner.link as any} onClick={() => { trackClick(); setOpen(false); }}>
          {image}
        </Link>
      )
    ) : (
      image
    );

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-5 backdrop-blur-sm">
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-card shadow-pop">
        <div className="absolute left-3 top-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white">
          {remaining}s
        </div>
        {wrappedImage}
        {(banner.titulo || banner.subtitulo || banner.botao_texto) && (
          <div className="p-4">
            {banner.titulo && (
              <div className="text-base font-black">{banner.titulo}</div>
            )}
            {banner.subtitulo && (
              <div className="mt-0.5 text-sm text-muted-foreground">{banner.subtitulo}</div>
            )}
            {banner.botao_texto && banner.link && (
              isExternal ? (
                <a
                  href={banner.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={trackClick}
                  className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                >
                  {banner.botao_texto}
                </a>
              ) : (
                <Link
                  to={banner.link as any}
                  onClick={() => { trackClick(); setOpen(false); }}
                  className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                >
                  {banner.botao_texto}
                </Link>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
