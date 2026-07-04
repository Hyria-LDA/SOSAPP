import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

function authCallbackPathFromDeepLink(url: string) {
  try {
    const deepLink = new URL(url);
    const isAuthCallback =
      deepLink.protocol === "sosmarceneiros:" && deepLink.host === "auth-callback";

    if (!isAuthCallback) return null;

    return `/auth/callback${deepLink.search}${deepLink.hash}`;
  } catch (error) {
    console.warn("[deep-link] URL invalida recebida", { url, error });
    return null;
  }
}

function NotFoundComponent() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div>
        <div className="text-6xl font-black text-primary">404</div>
        <p className="mt-2 text-muted-foreground">Página não encontrada.</p>
        <a
          href="/"
          className="mt-6 inline-block rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground"
        >
          Voltar
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div>
        <h1 className="text-lg font-bold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { name: "theme-color", content: "#D97706" },
      { title: "SOS Marceneiros — Estoque compartilhado de sobras" },
      {
        name: "description",
        content: "Rede de marcenarias para anunciar, localizar e negociar sobras de MDF",
      },
      { property: "og:title", content: "SOS Marceneiros — Estoque compartilhado de sobras" },
      {
        property: "og:description",
        content: "Rede de marcenarias para anunciar, localizar e negociar sobras de MDF",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "SOS Marceneiros — Estoque compartilhado de sobras" },
      {
        name: "twitter:description",
        content: "Rede de marcenarias para anunciar, localizar e negociar sobras de MDF",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/25a36d39-5a4b-4c75-987c-a21c72a9da2b/id-preview-ca42ccfa--2ded2322-5956-41ac-8550-33cd82f00f13.lovable.app-1781281176409.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/25a36d39-5a4b-4c75-987c-a21c72a9da2b/id-preview-ca42ccfa--2ded2322-5956-41ac-8550-33cd82f00f13.lovable.app-1781281176409.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    let removeDeepLinkListener: (() => void) | undefined;
    let cancelled = false;

    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appUrlOpen", ({ url }) => {
          const callbackPath = authCallbackPathFromDeepLink(url);
          if (!callbackPath) return;
          import("@capacitor/browser")
            .then(({ Browser }) => Browser.close())
            .catch(() => {});
          window.location.replace(callbackPath);
        }),
      )
      .then((handle) => {
        if (cancelled) {
          handle.remove();
          return;
        }
        removeDeepLinkListener = () => handle.remove();
      })
      .catch((error) => {
        console.warn("[deep-link] listener nativo indisponivel", error);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });

    // Logger global de falhas de carregamento de imagens (web + WebView Android).
    const onImgError = async (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName !== "IMG") return;
      const img = t as HTMLImageElement;
      const url = img.currentSrc || img.src || "";
      let status: number | "n/a" = "n/a";
      if (url && /^https?:\/\//i.test(url)) {
        try {
          const r = await fetch(url, { method: "HEAD", cache: "no-store" });
          status = r.status;
        } catch {
          /* network/CORS */
        }
      }
      // eslint-disable-next-line no-console
      console.warn("[img-error] falha ao carregar imagem", {
        url: url || "(vazio)",
        httpStatus: status,
        alt: img.alt,
        naturalWidth: img.naturalWidth,
        ua: navigator.userAgent,
      });
    };
    window.addEventListener("error", onImgError, true);

    return () => {
      cancelled = true;
      removeDeepLinkListener?.();
      sub.subscription.unsubscribe();
      window.removeEventListener("error", onImgError, true);
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
