import type { CapacitorConfig } from "@capacitor/cli";

const sharedNativePlugins = [
  "@capacitor/app",
  "@capacitor/browser",
  "@capacitor/camera",
  "@capacitor/filesystem",
  "@capawesome/capacitor-badge",
  "@capgo/capacitor-social-login",
  "@revenuecat/purchases-capacitor",
  "capacitor-branch-deep-links",
];

/**
 * Capacitor — modo Wrapper.
 *
 * O app web vive em https://www.sosmarceneiros.com.br (TanStack Start + Nitro SSR),
 * portanto NÃO empacotamos arquivos estáticos. O Capacitor exige um `webDir`
 * apenas como pasta de fallback — usamos `capacitor-shell/` que contém um
 * index.html mínimo de redirecionamento. Em runtime, `server.url` faz o
 * WebView carregar o site online diretamente.
 *
 * Deep Links / OAuth Google e Apple:
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
    // Use the canonical origin. Capacitor injects native plugins only into this
    // exact origin, and production redirects the bare domain to www.
    url: "https://www.sosmarceneiros.com.br",
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
    includePlugins: [...sharedNativePlugins, "@capacitor/push-notifications"],
  },
  ios: {
    scheme: "sosmarceneiros",
    contentInset: "always",
    includePlugins: [...sharedNativePlugins, "@capacitor-firebase/messaging"],
  },
  plugins: {
    Badge: {
      persist: false,
      autoClear: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert", "banner", "list"],
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: true,
        twitter: false,
      },
      logLevel: 1,
    },
  },
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          "@capacitor-firebase/messaging": {
            symlink: true,
          },
        },
      },
    },
  },
};

export default config;
