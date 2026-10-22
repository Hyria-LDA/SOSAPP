# Envio manual para cadastro não finalizado

No painel: Administração → Notificações Push → **Enviar notificação manual** → Quem vai receber → **Cadastro não finalizado**.

1. Clique em **Consultar alcance**. A prévia não envia mensagem.
2. Preencha título e mensagem.
3. Clique em **Enviar para cadastros não finalizados**.

A mensagem é enviada naquele momento, sem alterar os horários programados. O destino é a tela de finalizar cadastro. O servidor consulta novamente o público ao enviar: se a conta tiver concluído o cadastro após a prévia, ela deixa de receber.

Inclui contas sem empresa e empresas com `onboarded` diferente de `true`, desde que tenham token push ativo. Exclui administradores, vendedores e lojistas. Não envia e-mail, SMS ou WhatsApp. O número de clientes é distinto do número de aparelhos; uma conta pode ter vários dispositivos.

## Publicar

Não precisa executar SQL.

1. Atualize a Edge Function **send-push-regional**, incluindo o arquivo compartilhado **_shared/push-audience.ts**. Na pasta do projeto vinculado ao Supabase, execute:

```sh
supabase functions deploy send-push-regional
```

O deploy pela CLI inclui os arquivos compartilhados importados. Se usar o editor do painel Supabase, mantenha também o arquivo `_shared/push-audience.ts` atualizado; substituir apenas `index.ts` não basta para aceitar o novo público.

2. Envie as alterações ao GitHub e aguarde a Vercel publicar.
3. Atualize a página de notificações e consulte o alcance antes de enviar.

A função existente de Firebase é reutilizada. Nenhuma mensagem real foi enviada nos testes. Foram testados autorização administrativa, filtro de público, exclusão de perfis especiais e cadastros concluídos, prévia sem envio, várias páginas de resultados, múltiplos aparelhos e os envios anteriores por cidade/todos.
