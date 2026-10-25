# Avisos de buscas automáticas

Foram reproduzidos e corrigidos dois problemas nas funções SQL locais:

- O plano Brilhante atual usa `ultra`, mas a função de prioridade reconhecia apenas `premium`. Assim, usuários Brilhante eram enviados para a fila de 30 minutos, em vez de receber imediatamente.
- O gatilho de anúncios não acompanhava mudanças de status. Uma sobra que passava de revisão para ativo não gerava correspondências. A correção mantém o aviso por renovação e não repete avisos por edições comuns.

Isso não comprova que esses sejam os únicos problemas do ambiente publicado. Não houve acesso aos registros de execução do Supabase nem teste de entrega pelo Firebase em aparelhos reais.

## Aplicar

1. Abra `supabase/migrations/20261024120000_fix_material_match_notifications.sql`.
2. Copie TODO o conteúdo para uma nova consulta no SQL Editor do Supabase do aplicativo e clique em Run. Não cole apenas o nome/caminho do arquivo.
3. A alteração é transacional. Se aparecer “Versao inesperada”, interrompa e compartilhe o erro: o banco está com outra versão da função e precisa ser conferido.
4. Registre os arquivos no GitHub para manter o histórico. Só publicar no GitHub/Vercel não aplica esse SQL ao Supabase. Não é necessária uma nova versão do aplicativo para esta correção.

A migração não reenvia avisos antigos e não altera o agendamento da fila.

## Conferir

Use duas contas diferentes: uma cria uma busca automática e a outra publica uma sobra nova. Mantenha padrão, fabricante e espessura iguais, as duas dimensões iguais ou maiores e a localização dentro do raio da busca. Medidas invertidas só correspondem se a busca aceitar giro. O dono não recebe aviso da própria sobra.

- Brilhante válido: o registro deve aparecer na área de notificações assim que houver correspondência.
- Demais planos: há uma espera de 30 minutos, mais o tempo até a próxima execução do agendador (configurado originalmente para cada minuto).
- Se o registro aparecer no aplicativo e não no celular, investigar o webhook `push-notification-created`, os tokens ativos e o resultado do Firebase. Este SQL não corrige a entrega de push ou o envio manual.
- Se nada aparecer, execute a primeira consulta de `supabase/manual/20261023_diagnostico_notificacoes.sql` e envie o resultado. Execute separadamente a segunda consulta, que verifica o agendador. Resultado vazio nessa segunda consulta indica que o job não existe; `active=false` indica que está desativado. Não altere a fila antes de conferir esses resultados.

O diagnóstico não retorna tokens, chaves ou conteúdo de mensagens. Ele também mostra o resultado dos últimos envios manuais para investigar a outra falha relatada.

## Validação local

`node --test tests/material-match-notifications.test.mjs`: 11 testes passaram em PostgreSQL local (PGlite), com reprodução das duas falhas antes da correção. Inclui dimensões iguais/maiores/menores, giro, aprovação, renovação, vencimento de plano, fila de 30 minutos, busca nova, raio, exclusão do próprio anunciante e permissões das funções. O agendador pg_cron e o Firebase não são executados nesse ambiente de teste.

## Compatibilidade com o banco publicado

O CSV enviado em 25/10 confirmou que a função publicada ainda usa a proteção anterior à migração de renovação. O arquivo de correção agora aceita ambas as versões conhecidas. O teste adicional executa a função exata exportada, aplica a correção e valida ativação, medidas, ausência de repetição em edição e fila de 30 minutos. A versão publicada já compara medidas iguais ou maiores; a definição isolada não comprova o estado dos gatilhos, da fila nem da entrega push.
