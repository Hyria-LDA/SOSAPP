import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor — modo Wrapper.
 *
 * O app web vive em https://sosmarceneiros.com.br (TanStack Start + Nitro SSR),
 * portanto NÃO empacotamos arquivos estáticos. O Capacitor exige um `webDir`
 * apenas como pasta de fallback — usamos `capacitor-shell/` que contém um
 * index.html mínimo de redirecionamento. Em runtime, `server.url` faz o
 * WebView carregar o site online diretamente.
 *
 * Deep Links / OAuth Google:
 *  - `appId` (br.com.sosmarceneiros.app) é usado para Android App Links e
 *    iOS Universal Links posteriormente.
 *  - `scheme: "sosmarceneiros"` registra o esquema customizado consumido por
 *    /auth/callback (handoff `sosmarceneiros://auth-callback`).
 */
const config: CapacitorConfig = {
  appId: "br.com.sosmarceneiros.app",
  appName: "SOS Marceneiros",
  webDir: "capacitor-shell",
  server: {
    url: "https://sosmarceneiros.com.br",
    cleartext: false,
    allowNavigation: [
      "sosmarceneiros.com.br",
      "www.sosmarceneiros.com.br",
      "sosapp-murex.vercel.app",
      "*.supabase.co",
      "accounts.google.com",
      "*.googleusercontent.com",
    ],
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    scheme: "sosmarceneiros",
    contentInset: "always",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert", "banner", "list"],
    },
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
      logLevel: 1,
    },
  },
};

export default config;
