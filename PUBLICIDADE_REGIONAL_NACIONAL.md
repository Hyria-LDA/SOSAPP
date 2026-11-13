# Central de publicidade regional e nacional

Implementação local aprovada em 08/11. Não foi aplicada ao Supabase nem publicada no GitHub/Vercel por esta sessão.

## Conferência do banco publicado

Execute o conteúdo de `supabase/manual/20261108_conferir_publicidade.sql` no SQL Editor e guarde/exporte o resultado antes da migração. Ele consulta quantidades, regras de acesso, buckets e funções. Como já houve divergências entre o banco publicado e os arquivos locais, o resultado precisa ser conferido antes de aplicar a migração. Não execute a migração se a consulta der erro. Não envia notificações e não altera dados.

## Aplicação e ativação

1. Confira o resultado acima e mantenha um backup recuperável do banco.
2. Execute uma única vez o conteúdo inteiro de `supabase/migrations/20261108120000_advertising_central.sql`. É uma transação: qualquer erro deve interromper a aplicação. Não execute pedaços isolados. Não há exclusão de tabelas, registros, imagens ou contas.
3. Publique os arquivos do aplicativo pelo fluxo habitual GitHub/Vercel. Não há nova Edge Function nesta entrega.
4. Abra Administração → Banners → Campanhas. Confira clientes, campanhas, regiões, datas e posições.
5. A classificação antiga é preservada como `legacy`: o sistema interpreta estado/cidade como regional e abrangência nacional, incluindo exceções, como global. No portal, listas regionais continuam limitando o público. Nada amplia automaticamente regiões autorizadas.
6. Escolha o fallback nacional: ocultar ou usar um banner antigo classificado como institucional. Só banners horizontais, ativos e elegíveis podem preencher essa posição.
7. Ative “4 regionais + 1 nacional” apenas após revisar. A configuração nasce DESATIVADA: a mudança do conjunto exibido não ocorre automaticamente ao aplicar o SQL.

## Comportamento

São até quatro anúncios regionais distintos e um nacional dentro do carrossel atual, sorteados a cada atualização do conjunto. Não são cinco blocos novos na página. Com menos regionais, não repete anúncios nem preenche suas posições com nacionais. Sem localização, apenas nacionais sem restrições compatíveis aparecem. Planos, datas, banners verticais/de abertura e exclusões atuais são preservados.

Banners institucionais ficam reservados ao fallback. Ao desativar a nova distribuição, a seleção volta ao carrossel geral de anúncios elegíveis, sem colocar o institucional como campanha normal. Isso não remove campos, histórico ou permissões adicionadas.

## Administração

A aba Campanhas reúne as duas origens existentes, com filtros por cliente, texto de região/UF, abrangência, situação e período. Mostra posição, imagem e métricas. A classificação no portal vale para o contrato; a pausa é individual por banner. O botão de editar abre o cadastro existente para datas, regiões e aprovação, sem duplicar anúncios.

A aba Banners existentes mantém os cadastros antigos e permite editar o nome do anunciante dentro da pasta. Clientes e contratos abre a administração de lojistas existente, que permite vincular um anunciante já cadastrado em vez de criar outro.

O histórico administrativo guarda estado anterior/novo e responsável para anúncios, contratos, cadastros e solicitações. A interface mostra os 50 eventos mais recentes; o banco mantém os demais. Eventos só de contadores não geram auditoria.

## Anunciante

O portal mantém upload simples e relatórios dos links, acrescentando regiões/datas autorizadas e solicitações de nova campanha ou de alteração regional. Aceitar uma solicitação registra a decisão: o administrador precisa efetivar a configuração no contrato. O anunciante não altera suas próprias regiões.

Na substituição, a versão aprovada continua publicada até a nova aprovação, pausa ou vencimento. A imagem pendente permanece privada. Os cliques e visualizações continuam atribuídos à versão exibida e ao histórico; não são transferidos para a nova arte. Rejeitar a nova arte mantém a anterior elegível.

## Verificações

Testes locais em PostgreSQL/PGlite cobrem RLS entre lojas, proibição de publicação direta, solicitações, função administrativa, tipo de campanha, pausa, fallback, seleção 4+1, ausência de repetição, armazenamento privado e preservação da arte/contadores durante substituição. Também executadas as suítes existentes de portal, banners e administração. Entrega em produção e comparação com os dados reais dependem da conferência acima.
