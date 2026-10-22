# Portal da loja parceira — publicação

Alterações prontas no código; nada foi aplicado ao Supabase ou publicado automaticamente.

## Publicar na ordem

1. No Supabase → SQL Editor → New query, cole **todo o conteúdo** de `supabase/migrations/20261018120000_simplify_store_portal.sql` e clique Run. Não cole apenas o nome do arquivo. Essa migração depende das migrações existentes do portal e dos múltiplos links.
2. No Supabase → Edge Functions → `store-admin`, atualize o código com o conteúdo completo de `supabase/functions/store-admin/index.ts` e faça Deploy. Pelo terminal, na pasta do projeto já vinculado, a alternativa é `supabase functions deploy store-admin`.
3. Envie as alterações ao GitHub e aguarde o deploy da Vercel.
4. Entre em Administração → Lojistas → abra cada loja → Minha Empresa → **WhatsApp dos banners**. Cole a parte inicial do link com o número real daquela loja e a mensagem inicial. Escolha a posição (página inicial ou abertura) e salve. O número usado no exemplo não é aplicado automaticamente a nenhuma loja.
5. Na mesma página, vincule os códigos de indicação existentes em **Links de indicação**, se necessário. Os vínculos já cadastrados continuam funcionando; não é preciso vinculá-los novamente.
6. Use **Acessar visão da empresa** para conferir a tela simplificada.

## Como funciona

- O lojista vê uma página com banner atual, botão para adicionar outro, histórico com imagens e números, e resultados dos links com gráfico. Contratos, semanas, permissões e dados administrativos ficam na visão de administração.
- O lojista escolhe a imagem e escreve apenas a continuação da mensagem. O exemplo “e quero aproveitar essa promoção X” é uma dica, não é enviado se o campo estiver vazio.
- O número, a mensagem inicial e a posição vêm da configuração do administrador. O servidor monta e valida o link, incluindo acentos, espaços, emoji e caracteres como `&`.
- Para uma campanha com uma vaga na semana, adicionar outro substitui o banner dessa vaga. Com várias vagas, uma vaga livre é utilizada primeiro; **Trocar banner** permite escolher um banner específico. Os limites do contrato continuam válidos.
- A substituição retira a versão antiga de exibição quando o envio é iniciado. Ela aparece no histórico com imagem, link, visualizações e cliques preservados. A nova versão começa com contadores zerados e depende de aprovação. Se o upload falhar, o lojista pode continuar o envio; o histórico permanece.
- Banners existentes mantêm seus links. A configuração de WhatsApp vale para os próximos envios. Sem essa configuração, novos envios ficam bloqueados com orientação para falar com o administrador.
- Conversão do banner significa CTR: cliques divididos por visualizações. Os cadastros e assinaturas pertencem aos links de indicação, e não são atribuídos artificialmente a um banner específico.
- Os números de versões antigas já registradas antes desta atualização são preservados como estavam; não são recalculados.

## Excluir usuário

Administração → Lojistas → loja → Minha Empresa → **Excluir usuário da loja**. É necessário digitar o login exato e confirmar. Isso remove a conta exclusiva de lojista e desativa a loja e sua publicidade no portal; mantém contratos, imagens e resultados para consulta administrativa. Não exclui a própria conta, administradores ou contas que também possuam uma empresa normal do aplicativo.

A propriedade das imagens privadas daquela loja é transferida ao administrador que confirma a exclusão, sem mover ou apagar os arquivos. O Supabase impede excluir contas proprietárias de arquivos; a transferência segue a [orientação de gerenciamento de usuários](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users). Contas com arquivos em outros locais são bloqueadas para revisão. Se o Auth não concluir a exclusão, o acesso permanece desativado e a tela informa que é necessário tentar novamente.

A exclusão é definitiva. Nenhum usuário real foi excluído durante a implementação ou os testes.

## Validação local

- TypeScript, lint direcionado e compilação para Vercel.
- Banco PostgreSQL/PGlite isolado: permissões, vínculos, troca de banner, histórico, contadores, codificação de mensagem e exclusão com preservação de arquivos.
- Testes da função administrativa: autenticação, criação, redefinição de senha e exclusão protegida.
- Chrome com APIs simuladas: tela do cliente, envio, histórico, gráfico, prévia do WhatsApp, configuração administrativa, confirmação de exclusão e largura de celular.
