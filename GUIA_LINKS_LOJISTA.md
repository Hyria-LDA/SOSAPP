# Vários links de indicação no Portal do Lojista

## Ativar

1. Supabase → SQL Editor → nova consulta: colar o conteúdo de `supabase/migrations/20261001100000_store_multiple_referrals.sql` e executar uma vez. O Portal do Lojista anterior precisa já estar instalado. Não repetir os SQLs anteriores.
2. Publicar pelo GitHub os arquivos desta atualização. Não é necessário atualizar Edge Functions para esta funcionalidade.

## Vincular os três links

Admin → Lojistas → Abrir empresa → Divulgação (também disponível em Minha Empresa).

O link principal já aparece. Em **Adicionar link existente**, cole o código ou a URL de cada link adicional e clique **Vincular link**. Os links devem existir em Vendedores Parceiros. Não é preciso recriar os parceiros nem as indicações.

O usuário da loja poderá escolher **Todos os links — consolidado** ou selecionar um código específico. O relatório individual traz seu link e QR Code. A visão geral e as métricas da loja também passam a considerar todos os links vinculados.

A vinculação libera o histórico completo do link, inclusive anterior à data do vínculo. Só o administrador pode vincular/desvincular. Cada link pode pertencer a apenas uma loja do portal. O principal não pode ser desvinculado por essa tela. Desvincular um link adicional remove o acesso da loja ao relatório, sem apagar o parceiro, seus cliques ou cadastros.

## Contagem

- Cliques: soma dos cliques de cada link, mantendo a deduplicação existente por visitante/dia em cada código. Uma pessoa que clicou em dois links pode gerar dois cliques.
- Cadastros, concluídos e publicadores: cada empresa conta uma vez no consolidado, mesmo que apareça nas duas fontes de indicação ou em códigos diferentes.
- Assinaturas: empresas com primeira conversão registrada, sem duplicação entre os links.
- Campanhas: mesmos limites de datas existentes, agora considerando o conjunto de links; no consolidado a data de origem da empresa é a primeira encontrada nesse conjunto. Campanhas simultâneas podem compartilhar cadastros.

## Validação local

Teste PostgreSQL/PGlite executando a migração nova com a base do Portal: três links, métricas individuais e totais, cadastros repetidos, tentativa de acesso por outra loja/visitante, tentativa de vínculo pelo lojista, conflito de vínculo e desvínculo sem exclusão do histórico. TypeScript e lint dos componentes também verificados. Instalação no Supabase e publicação dependem das etapas acima.
