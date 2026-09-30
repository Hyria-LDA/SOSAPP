# Portal do Lojista — instalação e uso

Implementação local, sem executar alterações no Supabase de produção. O portal usa a autenticação atual do SOS Marceneiros.

## Ativação, nesta ordem

1. No **Supabase → SQL Editor**, execute somente `supabase/migrations/20260930100000_store_partner_role.sql`. Espere aparecer sucesso.
2. Em uma **nova execução**, rode `supabase/migrations/20260930101000_store_portal.sql`. Não junte os dois arquivos: o novo tipo de usuário precisa estar confirmado antes da segunda etapa. A segunda migração é transacional e deve ser executada uma única vez após sucesso. Se houver erro, pare e confira a mensagem antes de publicar o site.
3. Em **Edge Functions**, crie uma função chamada **store-admin**. O arquivo `supabase/functions/store-admin/index.ts` é autocontido: pode ser colado inteiro no editor. Publique a função. Ela usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, fornecidos pelo ambiente do Supabase, apenas no servidor. A opção de verificação JWT do gateway fica desabilitada; a função verifica o token com `auth.getUser()` e confirma a role `admin` no banco antes de qualquer operação. Pelo CLI: `supabase functions deploy store-admin --no-verify-jwt`.
4. Envie os arquivos do projeto ao GitHub e aguarde a implantação do site. **SQL e função não são publicados somente com o envio ao GitHub.** Inclua `package.json` e `package-lock.json`, pois o QR Code usa uma dependência nova.
5. Abra **Admin → Lojistas**, crie uma loja de teste, complete o perfil e crie um contrato ativo. Valide o fluxo abaixo antes de entregar os acessos às lojas reais.

Acesso do lojista: `/lojista`. O login continua em `/auth`. Ao entrar com uma conta `store_partner`, o aplicativo encaminha para o portal. O lojista não passa pelo cadastro de marcenaria nem pela sincronização automática de assinatura pessoal.

## Primeiro teste após a instalação

- Criar uma loja com login exclusivo, senha de pelo menos 12 caracteres e código de divulgação único. Pode vincular uma empresa anunciante já existente, mantendo seu identificador e seus banners antigos.
- Completar os dados em **Minha Empresa** e escolher os campos liberados para edição. Se o login for um e-mail sem caixa postal, a redefinição de senha é feita pelo administrador.
- Criar contrato com início hoje e término futuro. Cidades: `Belo Horizonte/MG; Contagem/MG`. Estados inteiros: `MG; SP`. Campos de cidades e estados vazios significam todo o Brasil. O texto “região” serve como descrição; cidades/estados controlam o público.
- Entrar em **Acessar visão da empresa**: a faixa identifica a loja, mas a sessão administrativa permanece a mesma.
- Em outro navegador ou janela privativa, entrar com o login da loja. Conferir os campos bloqueados, o link, o QR Code e as semanas.
- Enviar uma imagem, verificar a pendência no administrador, reprovar com motivo e reenviar na mesma vaga. Aprovar e verificar a exibição com uma conta do público gratuito na cidade correta.
- Tentar outro envio na mesma semana já preenchida: deve ser bloqueado. Uma segunda loja não deve acessar dados nem arquivos privados da primeira.
- Suspender a loja e conferir bloqueio do portal e interrupção da publicação. Reativar depois do teste.

## Regras implementadas

- Contratos de até 731 dias inclusivos, entre 1 e 20 banners por semana. As semanas são blocos de sete dias contados do início do contrato; a última termina junto com o contrato.
- Aguardando início/ativo/encerrado são calculados pelas datas no fuso **America/Sao_Paulo**. Suspenso e cancelado prevalecem. Não existe tarefa agendada nova.
- Upload permitido somente com contrato ativo e semana ainda não encerrada. Pode enviar para semanas futuras do contrato já ativo.
- A vaga é reservada no banco sob bloqueio do contrato. Dois pedidos simultâneos não ultrapassam a cota. Um envio interrompido pode ser retomado em **Continuar envio**. Reenvio ocupa a mesma vaga e exige nova aprovação.
- Depois de haver reservas/envios, não se alteram datas nem limite do contrato. Crie outro contrato para mudar essas condições. Segmento, região, observações e suspensão continuam editáveis.
- As datas de publicação ficam dentro da semana escolhida. O administrador pode restringir o público do banner, mas ele também deve respeitar o público do contrato.
- Imagens JPG, PNG ou WebP de até 10 MB em bucket privado `store-media`. Versões antigas ficam na biblioteca. Os títulos são internos e não aparecem sobre a arte no aplicativo.
- Horizontal aparece na página inicial; vertical na abertura. O portal mantém a publicidade voltada ao plano gratuito. Os banners antigos continuam usando suas próprias configurações.
- O aplicativo consulta os banners do portal a cada minuto enquanto a página inicial está aberta. A expiração por data é também verificada na tela. Suspensões e novas aprovações podem levar até um minuto para refletir em uma página já aberta. URLs de imagens já assinadas duram até cinco minutos; uma imagem já baixada não pode ser recolhida do dispositivo.
- A biblioteca é privada. Apenas a arte aprovada e vigente é disponibilizada ao público do aplicativo; perfil, contratos, propostas reprovadas e estatísticas não são públicos.

## Métricas e histórico

O código de divulgação reutiliza `/r/CODIGO`, `vendedores_parceiros`, `vendedor_cliques`, `cadastro_origens` e `indicacoes`. A criação do parceiro de loja usa comissão zero. Não disponibiliza nomes ou dados pessoais dos clientes indicados ao lojista.

Cliques do link seguem a deduplicação existente por visitante/dia. Cadastros são contados uma vez mesmo quando aparecem nas duas tabelas de origem. Cadastros concluídos e usuários que publicaram refletem a situação atual dos cadastros atribuídos. Assinaturas usam a primeira conversão registrada pelo fluxo existente, não uma contagem nova de cobranças.

Campanhas anteriores mostram banners, visualizações e cliques próprios; cadastros são agregados pelo link da loja durante o período. Contratos simultâneos podem compartilhar esses mesmos cadastros, portanto não se deve somar os períodos como se fossem clientes diferentes. As contagens de visualização/clique de banners são indicadores de interação, não auditoria antifraude de faturamento.

## Estrutura e proteção

- Amplia `banner_empresas` com usuário, parceiro de divulgação, perfil, status e campos editáveis. Pode reaproveitar uma pasta de anunciante existente.
- Novas tabelas: `store_contracts`, `store_banners`, `store_banner_history`.
- RLS restringe leitura à própria loja ativa ou ao administrador. Escritas de contrato/banner/perfil passam por funções que verificam identidade, permissão, datas e limites no servidor.
- A criação de usuários acontece exclusivamente em `store-admin`. Se a vinculação falha, somente o usuário recém-criado naquela tentativa é removido; contas existentes não são sobrescritas.
- A visão administrativa por `store_id` é validada na rota e no banco. Alterar o endereço não concede acesso a outra empresa.
- `store_live_banners()` entrega somente a projeção pública das artes elegíveis. Mantém os banners atuais separados das propostas privadas.
- A suspensão não depende de expirar o token da sessão: os acessos do portal são conferidos novamente no banco.

## Verificações locais

`npm ci`, `npx tsc --noEmit`, `npm run build` e `node --test tests/*.test.mjs`.

O teste `store-portal.test.mjs` executa as duas migrações em PostgreSQL/PGlite com tabelas representativas das dependências existentes e roles reais para exercitar RLS. Não substitui a validação no Supabase instalado: Auth e armazenamento físico são serviços externos. Testa isolamento, provisão, campos autorizados, cotas, reenvio, aprovação, datas, região, suspensão, expiração e métricas.

O teste `store-admin.test.mjs` executa a função de credenciais com serviços simulados: autenticação, autorização, validação, criação, compensação e redefinição de senha.

Também foi feita navegação local em Chrome, com APIs simuladas e dados fictícios, para desktop/celular, formulários, QR Code, métricas, reenvio, revisão e visão administrativa. Nenhuma conta ou arquivo de produção foi criado nesses testes.

## Reversão sem apagar histórico

Para interromper uma campanha, suspenda o contrato ou inative a loja. Para retirar a interface, reverta os arquivos desta implementação no Git e publique a versão anterior. Mantenha as tabelas e os arquivos privados até decidir sobre a retenção: não remova o bucket nem os usuários para desfazer uma atualização de interface. A nova role do PostgreSQL não deve ser removida manualmente se estiver em uso.
