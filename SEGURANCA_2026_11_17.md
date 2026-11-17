# Correções locais de segurança — 17/11/2026

Nada foi publicado, nenhum SQL foi executado em produção e nenhum registro real foi alterado.

## Alterações

- Capacitor core/CLI/Android/iOS: mínimo 8.4.3, com correção da vulnerabilidade crítica conhecida. DOMPurify atualizado e atualizações compatíveis adicionais aplicadas no lockfile. Não foi usado `npm audit fix --force`.
- Sincronização RevenueCat: compras de teste ou de ambiente desconhecido são rejeitadas antes de qualquer escrita. A API continua validando o usuário e consultando o RevenueCat no servidor.
- Nova RPC privada, executável somente por service_role: plano e registro da assinatura são gravados na mesma transação, com bloqueio da empresa para evitar concorrência com alterações administrativas. Falha na gravação da assinatura desfaz a alteração do plano.
- Campo plano_origem: concessões manuais válidas são preservadas. Alterações administrativas de plano/prazo passam a marcar a concessão como manual. Usuários comuns não podem mudar a origem. Plano free manual não impede compra válida.
- Migração inicial: plano pago com assinatura real ativa e vencimento correspondente é classificado como RevenueCat; outros planos pagos ficam manuais. Casos antigos ambíguos devem ser conferidos por administrador. Essa inferência não comprova a origem histórica.
- Geocodificação: estados normalizados, país/cidade/estado conferidos nos dois fornecedores; resultados incompatíveis não são aceitos como alternativa. Dados antigos já salvos não são alterados.
- Cache: limpo ao sair/trocar de usuário, inclusive eventos de autenticação sem usar o botão de logout.
- SQL de notificações restaurado do histórico (estava salvo apenas como `d`) e compatibilizado com as duas versões conhecidas do gatilho. Não altera filtros de medidas, rotação, fabricante ou distância. Não reenvia avisos antigos.
- Códigos de parceiros: sublinhados deixam de funcionar como curingas na busca SQL.

## Publicação, somente após revisão

1. Fazer backup e testar em homologação antes da produção.
2. No SQL Editor do Supabase, executar o CONTEÚDO completo de `supabase/migrations/20261117120000_secure_subscription_sync.sql`, não apenas o nome do arquivo. O script é transacional e pode ser reaplicado. Não continuar se houver erro.
3. Publicar a Edge Function `sync-revenuecat-subscription` somente DEPOIS do SQL. Publicar também `record-partner-install` e `track-partner-click` para o ajuste dos códigos. Git/Vercel não publica automaticamente essas funções.
4. Publicar o código web pelo fluxo habitual de Git/Vercel.
5. Reconstruir/sincronizar, assinar, testar em aparelho e publicar os aplicativos Android/iOS para distribuir a correção nativa do Capacitor. Atualizar somente a Vercel não corrige binários instalados. Não existe projeto iOS nesta cópia do repositório.
6. O SQL histórico de notificações foi recuperado para manter o repositório íntegro. Se essa correção já está aplicada e as notificações funcionam, não é necessário reaplicá-lo apenas porque o arquivo foi recuperado.

Compras sandbox, inclusive TestFlight, não concedem planos por esta função em produção. Para testes de compra, usar ambiente isolado; não foi introduzida uma chave que libere sandbox para todos os usuários reais.

## Validação

Testes locais com PGlite e respostas simuladas; nenhum provedor externo foi atacado. Testes cobrem rejeição de sandbox, permissões da RPC, transação, concessão manual, expiração, geocodificação, cache, códigos e notificações. TypeScript e build de produção também verificados. Não substituem teste em aparelho nem a conferência das políticas efetivamente publicadas.

## Limitações conhecidas

- O último npm audit após atualizações compatíveis ainda reportou 24 entradas de severidade alta, sem críticas/moderadas. Incluem cadeias transitivas; não são 24 explorações comprovadas. Restam picomatch, gRPC e Zod e seus dependentes. Não forçar downgrades de Vite/Firebase sugeridos automaticamente; precisam de análise de compatibilidade e alcance.
- Instalações reportadas pelo cliente ainda não são comprovantes antifraude. Corrigimos a correspondência do código, mas impedir instalações inventadas exige validação confiável de atribuição/aparelho e configuração do serviço correspondente. Não tratar esse contador como prova financeira.
- Não houve teste em dispositivos reais, publicação nas lojas, execução das migrações no Supabase ou validação ativa em produção.
- Continuam 15 avisos preexistentes do analisador de código.
