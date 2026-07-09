# SOS Marceneiros — App nativo (Capacitor Wrapper)

Este projeto é um web app TanStack Start + Nitro (SSR) servido em
`https://sosmarceneiros.com.br`. O Capacitor empacota apenas a casca nativa:
o WebView abre o site publicado diretamente (`server.url`). Não há `dist/`
nem `www/` — esse é o modo **wrapper**, projetado para que toda atualização
do site reflita imediatamente no app sem precisar republicar nas lojas.

> ⚠️ Os comandos abaixo **precisam ser executados localmente**. Capacitor
> exige Android Studio (Android) e Xcode em macOS (iOS). Não dá para rodar
> dentro do ambiente web de ediÃ§Ã£o.

---

## Pré-requisitos

- Node 20+ e npm
- **Android**: Android Studio Hedgehog+ com SDK 34 e JDK 21
- **iOS**: macOS + Xcode 15+ + CocoaPods (`sudo gem install cocoapods`)

---

## Setup inicial (uma vez)

```bash
npm install

# Cria as pastas nativas android/ e ios/
npx cap add android
npx cap add ios

# Sincroniza capacitor.config.ts -> projetos nativos
npx cap sync
```

> O `webDir` aponta para `capacitor-shell/` (apenas um HTML de fallback).
> Em produção o `server.url` faz o WebView ir direto para o site online.

---

## Rodar / abrir os projetos

```bash
# Android Studio (gerar APK/AAB para a Play Store)
npx cap open android

# Xcode (gerar IPA para a App Store) — apenas em macOS
npx cap open ios
```

A cada mudança em `capacitor.config.ts` ou em plugins do Capacitor, rode:

```bash
npx cap sync
```

---

## Corrigir erros comuns de Gradle

1. **`SDK location not found`** → crie `android/local.properties` com:
   ```
   sdk.dir=/Users/<voce>/Library/Android/sdk
   ```
2. **`Unsupported class file major version 65`** → a versão do JDK do
   Android Studio precisa ser 21 (Settings → Build Tools → Gradle → Gradle JDK).
3. **Falha de download de dependências** → rode dentro de `android/`:
   ```bash
   ./gradlew clean
   ./gradlew --refresh-dependencies assembleDebug
   ```
4. **Cache corrompido** → apague `~/.gradle/caches/` e refaça o build.
5. **Após qualquer alteração em `capacitor.config.ts`** → sempre `npx cap sync`
   antes de tentar buildar de novo.

---

## Deep Links + Google OAuth (já preparado no app)

O frontend já implementa o handoff `sosmarceneiros://auth-callback` em
`src/routes/auth.callback.tsx`. Para o sistema operacional entregar essa URL
ao app nativo, é preciso registrar o esquema:

### Android — `android/app/src/main/AndroidManifest.xml`

Dentro da `<activity android:name=".MainActivity" ...>` adicione, após a
`<intent-filter>` `MAIN/LAUNCHER` existente:

```xml
<intent-filter android:autoVerify="false">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="sosmarceneiros" android:host="auth-callback" />
</intent-filter>

<!-- Android App Links (HTTPS) — usado quando associarmos assetlinks.json -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https"
          android:host="sosmarceneiros.com.br"
          android:pathPrefix="/auth/callback" />
</intent-filter>
```

### iOS — `ios/App/App/Info.plist`

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>br.com.sosmarceneiros.app</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>sosmarceneiros</string>
    </array>
  </dict>
</array>
```

Para Universal Links (HTTPS) no iOS, adicione `Associated Domains` em
**Signing & Capabilities** com `applinks:sosmarceneiros.com.br` e suba o
arquivo `.well-known/apple-app-site-association` no domínio.

### Google OAuth

O fluxo atual em `src/routes/auth.tsx` já detecta WebView nativa (Capacitor,
DreamFlow/Flutter) e abre o provedor no navegador externo, evitando o erro
`403 disallowed_useragent` do Google. Após o login, o redirect cai em
`https://sosmarceneiros.com.br/auth/callback?native=1`, que dispara o
deep link `sosmarceneiros://auth-callback#access_token=...` de volta ao app.

### Capturando o deep link dentro do app (Capacitor)

Para que o WebView receba os tokens e finalize a sessão, registre um listener
de `appUrlOpen` que reencaminha o fragmento para a rota `/auth/callback` já
existente no site. Sem isso, o usuário volta ao app mas continua deslogado.

1. Instale o plugin:

   ```bash
   bun add @capacitor/app
   npx cap sync
   ```

2. Em `capacitor-shell/index.html` (ou crie `capacitor-shell/bridge.ts` e
   importe no shell), adicione:

   ```html
   <script type="module">
     import { App } from 'https://cdn.jsdelivr.net/npm/@capacitor/app/+esm';
     App.addListener('appUrlOpen', ({ url }) => {
       try {
         const u = new URL(url);
         // sosmarceneiros://auth-callback#access_token=...&refresh_token=...
         if (u.protocol.startsWith('sosmarceneiros') || u.host === 'auth-callback') {
           const target = 'https://sosmarceneiros.com.br/auth/callback'
             + (u.search || '')
             + (u.hash || '');
           window.location.replace(target);
         }
       } catch (e) { console.error('[deep-link]', e); }
     });
   </script>
   ```

   Como o WebView fica em `https://sosmarceneiros.com.br`, basta navegar para
   `/auth/callback#...` que o `setSession` do callback é executado e a sessão
   fica persistida no `localStorage` do domínio.

3. Se quiser instalar o plugin no projeto (recomendado para typings), use no
   `src/router.tsx` ou em um efeito no `__root.tsx`:

   ```ts
   import { App } from '@capacitor/app';
   App.addListener('appUrlOpen', ({ url }) => {
     const i = url.indexOf('#');
     const hash = i >= 0 ? url.slice(i) : '';
     const q = url.includes('?') ? url.slice(url.indexOf('?'), i >= 0 ? i : undefined) : '';
     window.location.replace('/auth/callback' + q + hash);
   });
   ```

Nenhuma configuração adicional de SDK Google é necessária para essa
estratégia funcionar.

---

## Versão & publicação

- **Android**: edite `android/app/build.gradle` (`versionCode`, `versionName`)
  e gere o `.aab` em *Build → Generate Signed Bundle*.
- **iOS**: ajuste *Version* e *Build* no target App do Xcode e use
  *Product → Archive*.

Como estamos em modo wrapper, atualizações de conteúdo do site **não exigem**
nova submissão à loja. Republique apenas quando mudar `capacitor.config.ts`,
plugins nativos, permissões ou ícones.
