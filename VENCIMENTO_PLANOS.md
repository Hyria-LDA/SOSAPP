# Vencimento automático de planos

Executar `supabase/migrations/20260928230000_expire_company_plans.sql` no SQL Editor do Supabase com a conta administrativa do projeto. O SQL é transacional, instala uma rotina do pg_cron a cada minuto e já processa os vencidos existentes. Depois enviar os arquivos ao GitHub para guardar a versão.

A rotina usa a data e hora `plano_vencimento` da empresa. Quando vencida, troca `plano_id` e `plano` para Free. Preserva as datas como referência e registra em `empresa_historico`. Não altera status da empresa, anúncios, autenticação nem compras nas lojas. Pode levar até o próximo ciclo de um minuto para atualizar o cadastro; telas abertas precisam recarregar. A consulta de limites já aplica Free para vencidos.

Sem data de vencimento, não há redução automática. Assinatura RevenueCat registrada como ativa e ainda válida (ou sem expiração) impede a redução por esta rotina: ela continua sob responsabilidade da sincronização RevenueCat. Esta proteção depende do último estado sincronizado; não consulta a loja em tempo real.

Como a atualização não apaga a data passada, o painel pode continuar indicando Vencido para mostrar o histórico, embora o plano selecionado seja Free. Para conceder novamente um plano manual, escolha o plano pago e renove o prazo. Os botões +30/+90 dias existentes só mudam a data; sozinhos não restauram o plano pago depois de ele voltar ao Free.

Teste local: banco PGlite com agendador simulado. Verificados vencidos, futuros, sem data, assinatura da loja válida e vencida, histórico sem duplicação, preservação de suspensão, reaplicação e bloqueio de chamada por usuário comum. O agendamento real precisa ser conferido em Supabase Cron após aplicar.

Para verificar sem alterar dados:
```sql
select jobname, schedule, active from cron.job where jobname = 'sos-expire-company-plans';
select jobid, status, return_message, start_time from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'sos-expire-company-plans')
order by start_time desc limit 5;
```

Nenhuma alteração foi aplicada em produção automaticamente.
