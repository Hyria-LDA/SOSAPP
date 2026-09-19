# Etapa 3 — proteção da moderação

Preparada em 19/09/2026. Alterações locais; a aplicação no Supabase e a publicação das telas ainda são necessárias.

## O que esta etapa protege

- O proprietário não pode reativar, vender ou editar um anúncio suspenso ou em revisão para contornar a moderação.
- Empresas suspensas ou bloqueadas não podem publicar anúncios ativos nem usar a renovação oficial para voltar à exposição.
- O proprietário não pode remover bloqueios ou alterar pontos de penalidade, advertências e data de suspensão.
- Fotos novas continuam entrando como pendentes, mesmo quando o cliente envia campos de aprovação falsos.
- Somente administradores e processos internos autorizados podem mudar a decisão de moderação ou substituir os caminhos de uma foto existente. A ordem das fotos continua editável pelo proprietário.
- Uma foto rejeitada não pode ser apagada diretamente pelo proprietário para zerar sua decisão. A exclusão do anúncio pelo aplicativo continua disponível pela função de servidor já protegida na etapa anterior.
- Fotos rejeitadas são retiradas das novas consultas de outros usuários. Dono e administrador ainda podem consultá-las para acompanhamento.
- Novas leituras de arquivos rejeitados e suas miniaturas são bloqueadas no Storage para terceiros, inclusive se existir uma permissão antiga mais ampla.
- O administrador pode visualizar arquivos de anúncios suspensos para analisá-los.

As fotos pendentes e aprovadas mantêm o comportamento de publicação existente. Esta etapa não ativa aprovação manual obrigatória de todo upload.

## Arquivos

- Instalação: `supabase/migrations/20260919220000_protect_moderation.sql`.
- Reversão, somente se necessária: `supabase/manual/20260919_rollback_moderation.sql`.
- Testes de banco: `tests/moderation.test.mjs`.
- Interface: painel de moderação e tela de estoque.

O painel agora consulta a empresa por meio do anúncio, usando as relações existentes no esquema. Também mostra falhas de carregamento e só informa sucesso quando a função de moderação confirma a operação. A tela de estoque passa a mostrar o erro quando o banco recusa marcar um anúncio como vendido.

## Como aplicar

1. Enviar as duas alterações de interface ao GitHub e aguardar a publicação da hospedagem. Essas telas continuam compatíveis com o banco anterior.
2. No Supabase, abrir **SQL Editor → New query**.
3. Copiar TODO o conteúdo de `20260919220000_protect_moderation.sql`, de `BEGIN` até `COMMIT` (os comentários também podem ser copiados), e clicar em **Run**.
4. Aguardar a mensagem de sucesso. Se houver erro, guardar o texto para análise. Não executar outros arquivos de migração para tentar contorná-lo.
5. Validar com um anúncio descartável: publicar com foto, marcar como vendido, rejeitar/aprovar foto no painel e abrir uma sessão separada como outro usuário. Confirmar que a foto rejeitada não aparece em uma consulta nova dessa outra conta.

O arquivo é transacional e não apaga dados. Ele verifica as colunas necessárias, o RLS e se o bucket `materiais` é privado. Se esse bucket for público, o SQL interrompe a aplicação sem alterar essa configuração. Não mude a visibilidade do bucket às cegas: isso poderia afetar URLs antigas.

Os gatilhos de denúncias e as funções administrativas existentes são preservados. O contexto de execução de funções internas continua autorizado, sem liberar gravações diretas de usuários comuns.

## Verificações realizadas

45 cenários passaram em PostgreSQL 18.3 via PGlite 0.5.8, executando o SQL real e as funções existentes de moderação/renovação. Foram usados dados descartáveis e papéis separados de proprietário, outro usuário, administrador, visitante e serviço.

A estrutura base e as principais políticas/funções vieram das migrações do projeto. Auth e Storage foram representados por esquemas locais; a quota usada no teste de renovação é fixa para isolar a compatibilidade da moderação. Isso não substitui a validação da configuração real do Supabase, das URLs HTTP/CDN e das telas em um aparelho.

Os cenários cobrem publicação, venda, pausa, renovação, bloqueios, aprovação indevida, fotos rejeitadas, miniaturas, denúncias automáticas, exclusão via serviço, reaplicação do SQL, reversão sem perda de dados e compatibilidade com a proteção anterior de planos. O teste dessa proteção anterior é opcional quando a migração antiga não está presente no checkout; nesta cópia, ele foi executado e passou.

A verificação de tipos e o lint das duas telas também passaram. A compilação completa e a validação visual em dispositivo não foram realizadas nesta etapa.

Para repetir os testes, na raiz do projeto:

```sh
npm install --prefix /private/tmp/sos-moderacao-validation --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.8
PGLITE_MODULE=/private/tmp/sos-moderacao-validation/node_modules/@electric-sql/pglite/dist/index.js node --test tests/moderation.test.mjs
```

O banco de testes é local e descartável; o comando não se conecta ao Supabase.

## Limites importantes

A restrição impede novas leituras/autorização. Ela não retira imagens que já foram baixadas nem invalida imediatamente URLs assinadas já emitidas. Essas URLs e cópias em cache podem continuar disponíveis conforme a validade e o cache. O código atual usa URLs novas de 24 horas e ainda aceita URLs legadas longas. Revogação imediata e quarentena de arquivos exigiriam outra etapa. Consulte a [documentação de URLs assinadas](https://supabase.com/docs/guides/storage/serving/downloads) e de [cache do Storage](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

O proprietário continua podendo enviar novas fotos pendentes conforme o fluxo atual. Bloquear a repetição do mesmo conteúdo após uma nova publicação exigiria análise de conteúdo ou aprovação prévia, que não foi ativada aqui.

A aplicação no Supabase não foi executada por este trabalho, e nenhuma conta real foi utilizada nos testes. O comportamento em produção depende das políticas e funções efetivamente instaladas.

## Reversão

Se for necessário desfazer esta etapa, executar somente `20260919_rollback_moderation.sql`. Ele remove os três gatilhos, as três políticas e as funções auxiliares criadas aqui, sem apagar registros e sem remover a moderação anterior. A reversão reabre as brechas que esta etapa corrige.

A referência técnica para a combinação restritiva de permissões está na [documentação do PostgreSQL](https://www.postgresql.org/docs/16/sql-createpolicy.html).
