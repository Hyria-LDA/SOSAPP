# RevenueCat - configuracao das assinaturas

## Produtos e acessos

| Plano | Product ID da App Store | Entitlement | Package da oferta |
| --- | --- | --- | --- |
| TX | `br.com.sosmarceneiros.tx.monthly` | `tx` | `tx` |
| Ultra | `br.com.sosmarceneiros.ultra.monthly` | `ultra` | `ultra` |
| Brilhante | `br.com.sosmarceneiros.brilhante.monthly` | `premium` | `premium` |

A oferta atual do RevenueCat deve conter os tres packages acima. O identificador
da oferta pode ser `planos`; ela precisa estar marcada como **Current**.

## Vercel

Adicionar em Production e Preview:

```text
VITE_REVENUECAT_IOS_API_KEY=appl_CHAVE_PUBLICA_DO_REVENUECAT
```

Quando o aplicativo Android for conectado ao RevenueCat, adicionar tambem:

```text
VITE_REVENUECAT_ANDROID_API_KEY=goog_CHAVE_PUBLICA_DO_REVENUECAT
```

Essas sao chaves publicas do SDK. Nunca colocar uma chave secreta em uma
variavel que comece com `VITE_`.

## Supabase

1. Executar a migration `20260811230000_revenuecat_subscriptions.sql`.
2. Salvar a chave secreta do RevenueCat:

```powershell
npx supabase secrets set REVENUECAT_SECRET_API_KEY="SUA_CHAVE_SECRETA" --project-ref yzbfjqeltqgqpqecmwdv
```

3. Publicar a funcao de validacao:

```powershell
npx supabase functions deploy sync-revenuecat-subscription --project-ref yzbfjqeltqgqpqecmwdv
```

## iOS

Depois de baixar as alteracoes no Mac:

```bash
npm install
npx cap sync ios
```

Abrir `ios/App/App.xcworkspace`, aumentar o build, gerar um Archive e enviar ao
TestFlight. A compra deve ser testada em um build do TestFlight com uma conta
Sandbox da App Store.

## Seguranca do fluxo

O aplicativo inicia a compra pelo RevenueCat, mas nao libera o plano diretamente.
A Edge Function consulta o RevenueCat com a chave secreta, confirma o entitlement
e somente entao atualiza o plano da empresa no Supabase.
