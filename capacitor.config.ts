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
  webDir: ".output/public",
  server: {
  url: "http://10.0.2.2:8080",
  cleartext: true,
  androidScheme: "http",
  allowNavigation: [
    "10.0.2.2",
    "localhost",
    "127.0.0.1",
    "*.supabase.co",
    "accounts.google.com",
    "*.googleusercontent.com",
  ],
},
android: {
  allowMixedContent: true,
},
  ios: {
    scheme: "sosmarceneiros",
    contentInset: "always",
  },
};

export default config;
