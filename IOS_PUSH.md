# Notificacoes no iPhone

O iOS usa `@capacitor-firebase/messaging` para registrar um token FCM. Antes de gerar uma nova
versao:

1. Cadastre no Firebase um app iOS com o Bundle ID `br.com.sosmarceneiros.app`.
2. Baixe `GoogleService-Info.plist` e coloque em `ios/App/App/GoogleService-Info.plist`.
3. No Firebase, em **Configuracoes do projeto > Cloud Messaging**, envie a chave APNs `.p8` da
   conta Apple e informe o Key ID e o Team ID.
4. No Xcode, abra o target **App > Signing & Capabilities** e adicione **Push Notifications**.
5. Em **Background Modes**, marque **Remote notifications**.
6. Rode `npm install`, `npm run build` e `npx cap sync ios` antes de criar o Archive. O ultimo
   comando tambem configura os callbacks APNs obrigatorios no `AppDelegate.swift`.

Teste em um iPhone fisico. Depois de entrar na conta e permitir notificacoes, deve existir uma
linha ativa com plataforma `ios` na tabela `public.push_tokens`.
