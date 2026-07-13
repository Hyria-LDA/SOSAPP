import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bell, MapPin, PackageSearch, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type CapacitorWindow = Window &
  typeof globalThis & {
    Capacitor?: {
      getPlatform?: () => string;
      isNativePlatform?: () => boolean;
    };
  };

function isNativeApp() {
  if (typeof window === "undefined") return false;
  const w = window as CapacitorWindow;
  const platform = w.Capacitor?.getPlatform?.();
  return !!w.Capacitor?.isNativePlatform?.() || (!!platform && ["android", "ios"].includes(platform));
}

function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (isNativeApp()) navigate({ to: "/app", replace: true });
  }, [navigate]);

  return (
    <main className="min-h-screen bg-[#f6f2e9] text-[#111827]">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 py-6">
        <header className="flex items-center justify-between gap-3">
          <Logo className="h-16 w-auto" />
          <Link
            to="/auth"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Entrar
          </Link>
        </header>

        <div className="grid flex-1 content-center gap-8 py-10 md:grid-cols-[1.05fr_0.95fr] md:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-primary">
              Rede para marcenarias
            </p>
            <h1 className="mt-3 max-w-2xl text-4xl font-black leading-tight md:text-6xl">
              Transforme sobras de MDF em oportunidades.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#4b5563] md:text-lg">
              O SOS Marceneiros conecta marcenarias que têm sobras de chapas com quem está
              procurando materiais perto de sua região. Anuncie sobras, busque padrões por
              fabricante, receba alertas automáticos e negocie direto com outras empresas.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-pop"
              >
                Acessar o app <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/privacidade"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#d8d1c2] bg-white px-5 py-3 text-sm font-bold"
              >
                Política de Privacidade
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-4 shadow-card">
            <div className="rounded-[1.5rem] bg-[#1f2937] p-5 text-white">
              <div className="grid grid-cols-2 gap-3">
                <Feature icon={PackageSearch} title="Anunciar sobras" text="Publique MDF parado no estoque." />
                <Feature icon={MapPin} title="Buscar perto" text="Veja materiais próximos de você." />
                <Feature icon={Bell} title="Alertas" text="Receba aviso quando aparecer match." />
                <Feature icon={ShieldCheck} title="Empresas" text="Perfil de marcenaria com dados comerciais." />
              </div>
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2daca] py-5 text-xs text-[#6b7280]">
          <span>SOS Marceneiros - Onde sobras viram oportunidades</span>
          <div className="flex gap-4">
            <Link to="/privacidade" className="font-semibold underline">
              Política de Privacidade
            </Link>
            <a href="mailto:sosmarceneiroapp@gmail.com" className="font-semibold underline">
              Contato
            </a>
          </div>
        </footer>
      </section>
    </main>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <Icon className="h-6 w-6 text-primary" />
      <div className="mt-3 text-sm font-black">{title}</div>
      <p className="mt-1 text-xs leading-5 text-white/75">{text}</p>
    </div>
  );
}
