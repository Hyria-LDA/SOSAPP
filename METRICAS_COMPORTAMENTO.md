# Comportamento por região

## Publicação

1. Ative a extensão pg_cron no Supabase, caso ainda não esteja ativa. O SQL exige essa extensão para garantir a limpeza diária dos registros antigos.
2. Execute no SQL Editor o CONTEÚDO completo de `supabase/migrations/20261117230000_behavior_analytics.sql` e confirme sucesso. A migração é transacional, não altera empresas nem envia notificações.
3. Publique o site pelo GitHub/Vercel. Abra Administração → Comportamento por região.
4. Para medir os toques nas notificações do Android pelo caminho nativo personalizado, gere e publique a nova versão Android. A mudança está em MainActivity.java. Não existe projeto iOS nesta cópia. O listener FirebaseMessaging do iOS já foi instrumentado no código web; validar a abertura em um iPhone real antes de considerar a cobertura completa.

Nenhuma nova Edge Function é necessária. Não precisa republicar as funções de envio por causa destas métricas.

## O que aparece

- Pessoas ativas, aberturas/retornos do app e páginas visitadas.
- Cliques em Buscar material, Anunciar sobra, ajustes de filtros e contato por WhatsApp.
- Resultados exibidos na busca: com ou sem resultados. Reflete a listagem apresentada, não uma contagem completa do estoque do banco.
- Cadastro concluído e anúncio publicado com sucesso. Visitas à página de cadastro/anúncio permitem comparação, mas não representam um funil individual completo.
- Toques em notificações do celular, no aviso dentro do app e no botão de anúncio da caixa de notificações.
- Filtros por estado, cidade e últimos 7/30/90 dias; gráfico por hora e pessoas por dia. Horários de Brasília para comparação consistente.

Região vem do cadastro no servidor no instante da coleta, não do GPS nem de um campo enviado pelo cliente. Pessoas ainda sem cidade aparecem como sem cidade/UF. Contas admin, vendedor e store_partner são excluídas das métricas de clientes. Usuários sem login não são acompanhados.

## Significado e limites

Abertura de notificação significa toque observado. Marcar todas como lidas, receber a mensagem e abrir o aplicativo por conta própria NÃO são contados como abertura da notificação. Não inferimos entrega pelo sistema operacional. Repetir um toque pode contar novamente; também mostramos pessoas distintas.

O painel não separa campanhas por título, não mede faturamento nem atribui compras a notificações. Não registra termos livres, senhas, conteúdo de mensagens, URLs completas, localização GPS ou gravação de tela. Não envia notificações automaticamente.

Eventos são enviados em lotes de até 30 a cada 15 segundos e ao sair do primeiro plano. A fila é limitada e fica apenas na memória; fechar o aplicativo imediatamente ou ficar offline pode perder eventos. Dados começam após esta atualização e não são recuperados retroativamente. Aberturas/retornos repetidos em menos de 30 segundos são agrupados.

## Proteção e conservação

- RLS ativa; usuários não podem consultar/escrever diretamente na tabela de eventos.
- RPC de coleta autenticada, usuário e região definidos no servidor, campos permitidos e limite de 120 eventos por usuário/minuto.
- IDs estáveis na repetição de envios evitam duplicatas; token do usuário capturado no envio evita trocar a autoria ao trocar de conta.
- Somente admin consulta os resultados agregados; a resposta não contém IDs de usuários.
- Exclusão da conta elimina seus eventos via chave estrangeira.
- Job `purge-behavior-events`: limpeza diária dos eventos com mais de 90 dias. O painel consulta no máximo os últimos 90 dias.

## Conferência após publicar

Use uma conta de cliente de teste com cidade cadastrada: abra o app, busque um material, publique um anúncio de teste se apropriado e toque em uma notificação já recebida. Aguarde 15 segundos. Com a conta admin, atualize o painel e confira os totais e filtros. Repita em outra região. Abrir apenas a caixa de notificações não deve aumentar o total de toques.

Os testes locais cobrem permissões, região derivada no servidor, repetição, limites, expiração, filtros administrativos e isolamento de contas. pg_cron e notificações reais precisam de confirmação no ambiente publicado/aparelhos. Não houve publicação nem envio real durante a implementação.
