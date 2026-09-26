# Notificações por cidades

1. Supabase → Edge Functions → criar função chamada `send-push-regional`.
2. Substituir todo o `index.ts` pelo conteúdo de `supabase/manual/send-push-regional.ts` e publicar. O arquivo é completo, incluindo os auxiliares. Não é SQL.
3. Usar as mesmas variáveis de ambiente Firebase da função `send-push` no mesmo projeto. A nova função exige sessão válida e papel admin em toda chamada. Se a verificação de JWT do gateway estiver desativada como na função anterior, a autenticação interna continua obrigatória.
4. Publicar os arquivos do site via Commit e Push origin.
5. Em Notificações, escolher Por cidades, UF, cidades separadas por vírgula. Usar Consultar alcance para conferir antes de enviar.

A prévia não envia mensagens. O envio recalcula o público; o alcance pode mudar. A origem é o endereço cadastrado da empresa, não o GPS. Apenas usuários com tokens ativos entram neste fluxo, como no envio manual anterior. Usuários sem cidade/UF não recebem o envio regional. As notificações dentro do app seguem o mesmo filtro dos pushes. A programação automática existente não foi alterada.

A função antiga foi preservada. O site atualizado usa exclusivamente a nova função: se ela não estiver publicada, o envio falha em vez de ignorar o filtro de cidades.

Validação: TypeScript e lint da tela passaram. Teste isolado da função cobre filtro de UF/cidades, acentos, 501 clientes, prévia sem escrita/envio, público vazio, todos e bloqueio de não administradores. Nenhuma mensagem real foi enviada. Executar `node --test tests/push-cities.test.mjs` na raiz para repetir.
