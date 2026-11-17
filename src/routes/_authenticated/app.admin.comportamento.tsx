import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
export const Route=createFileRoute('/_authenticated/app/admin/comportamento')({component:BehaviorPage});
type Report={users:number;sessions:number;opens:number;notification_opens:number;notification_users:number;
 events:{event:string;screen:string;action:string;total:number;users:number}[];
 hours:{hour:number;total:number}[];daily:{day:string;users:number}[];
 regions:{estado:string;cidade:string;users:number;notification_opens:number}[];
 options:{estado:string;cidade:string}[]};
const labels:Record<string,string>={search_result:'Resultado exibido na busca',com_resultados:'Com resultados',sem_resultados:'Sem resultados',app_open:'Abertura/retorno ao app',page_view:'Página visitada',action:'Clique',notification_open:'Notificação aberta',publish_success:'Anúncio publicado',signup_complete:'Cadastro concluído',buscar_material:'Buscar material',anunciar_sobra:'Anunciar sobra',filtrar:'Aplicar busca/filtros',contato:'Contato por WhatsApp',push:'Notificação do celular',inbox:'Botão na caixa de notificações',toast:'Aviso dentro do app',inicio:'Início',buscar:'Buscar material',anunciar:'Anunciar sobra',material:'Detalhe do material',pedidos:'Buscas automáticas',estoque:'Estoque',perfil:'Perfil',notificacoes:'Notificações',cadastro:'Cadastro',outros:'Outras páginas'};
function BehaviorPage(){
 const [days,setDays]=useState(30),[state,setState]=useState(''),[city,setCity]=useState('');
 const report=useQuery({queryKey:['admin-behavior',days,state,city],queryFn:async()=>{
  const {data,error}=await (supabase as any).rpc('admin_behavior_report',{_days:days,_state:state,_city:city});
  if(error)throw new Error('Não foi possível carregar as métricas. Confira se o SQL de comportamento foi aplicado.');
  return data as Report;
 }});
 const data=report.data;
 const states=[...new Set(data?.options.map(r=>r.estado).filter(Boolean)??[])].sort();
 const cities=[...new Set(data?.options.filter(r=>!state||r.estado===state).map(r=>r.cidade).filter(Boolean)??[])].sort();
 const max=Math.max(1,...(data?.hours.map(h=>h.total)??[]));
 return <div className="mx-auto max-w-5xl space-y-5 px-4 pb-28 pt-6">
  <Link to="/app/admin" className="text-sm underline">← Administração</Link>
  <h1 className="text-2xl font-black">Comportamento por região</h1>
  <p className="text-sm text-muted-foreground">Entenda o uso para escolher manualmente o assunto e o horário das notificações. Região do cadastro no momento da ação; horários de Brasília.</p>
  <div className="grid gap-3 rounded-2xl bg-card p-4 sm:grid-cols-3">
   <label className="text-sm">Período<select className="mt-1 w-full rounded-xl border bg-background p-3" value={days} onChange={e=>setDays(Number(e.target.value))}>{[7,30,90].map(n=><option key={n} value={n}>Últimos {n} dias</option>)}</select></label>
   <label className="text-sm">Estado<select className="mt-1 w-full rounded-xl border bg-background p-3" value={state} onChange={e=>{setState(e.target.value);setCity('');}}><option value="">Todos os estados</option>{states.map(s=><option key={s}>{s}</option>)}</select></label>
   <label className="text-sm">Cidade<select className="mt-1 w-full rounded-xl border bg-background p-3" value={city} onChange={e=>setCity(e.target.value)}><option value="">Todas as cidades</option>{cities.map(c=><option key={c}>{c}</option>)}</select></label>
  </div>
  <button className="rounded-xl bg-secondary px-4 py-2 text-sm" onClick={()=>void report.refetch()} disabled={report.isFetching}>{report.isFetching?'Atualizando…':'Atualizar métricas'}</button>
  {report.isError&&<p role="alert" className="rounded-xl bg-destructive/10 p-4 text-destructive">{report.error.message}</p>}
  {report.isLoading&&<p>Carregando métricas…</p>}
  {data&&<>
   <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['Pessoas ativas',data.users],['Aberturas/retornos',data.opens],['Toques em notificações',data.notification_opens],['Pessoas que abriram notificações',data.notification_users]].map(([label,value])=><div key={label} className="rounded-2xl bg-card p-4 shadow-card"><div className="text-2xl font-black">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>)}</div>
   {!data.users&&<p className="rounded-xl border border-dashed p-6">Ainda não há ações registradas nesta região e período. Os dados começam a aparecer após a atualização; contas administrativas, vendedores e lojistas são excluídos.</p>}
   <section className="rounded-2xl bg-card p-4"><h2 className="font-bold">Horários de abertura</h2><p className="mb-4 text-xs text-muted-foreground">Aberturas e retornos ao primeiro plano, não notificações entregues.</p><div className="flex h-36 items-end gap-1" role="img" aria-label="Gráfico de aberturas por hora">{Array.from({length:24},(_,hour)=>{const total=data.hours.find(h=>h.hour===hour)?.total??0;return <div key={hour} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center" title={`${hour}h: ${total} aberturas`}><div className="rounded-t bg-primary" style={{height:`${Math.max(total?3:0,total/max*100)}%`}}/><span className="mt-1 text-[9px]">{hour}</span></div>;})}</div><div className="mt-3 flex flex-wrap gap-x-3 text-xs text-muted-foreground">{data.hours.map(h=><span key={h.hour}>{h.hour}h: {h.total}</span>)}</div></section>
   <section className="rounded-2xl bg-card p-4"><h2 className="mb-3 font-bold">Pessoas ativas por dia</h2><div className="flex gap-3 overflow-x-auto pb-2">{data.daily.map(d=><div key={d.day} className="min-w-20 rounded-xl bg-secondary p-3 text-center"><strong>{d.users}</strong><div className="text-xs">{d.day.split('-').reverse().join('/')}</div></div>)}</div></section>
   <section className="overflow-x-auto rounded-2xl bg-card p-4"><h2 className="mb-3 font-bold">Páginas e ações</h2><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Ação</th><th className="p-2">Local</th><th className="p-2">Vezes</th><th className="p-2">Pessoas</th></tr></thead><tbody>{data.events.map((e,i)=><tr key={i} className="border-t"><td className="p-2">{labels[e.event]}{e.action?` · ${labels[e.action]??e.action}`:''}</td><td className="p-2">{labels[e.screen]}</td><td className="p-2">{e.total}</td><td className="p-2">{e.users}</td></tr>)}</tbody></table></section>
   <section className="overflow-x-auto rounded-2xl bg-card p-4"><h2 className="mb-3 font-bold">Resumo por região</h2><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Cidade / UF</th><th className="p-2">Pessoas</th><th className="p-2">Toques em notificações</th></tr></thead><tbody>{data.regions.map(r=><tr key={`${r.estado}:${r.cidade}`} className="border-t"><td className="p-2">{r.cidade||'Sem cidade'} / {r.estado||'Sem UF'}</td><td className="p-2">{r.users}</td><td className="p-2">{r.notification_opens}</td></tr>)}</tbody></table></section>
  </>}
  <p className="text-xs text-muted-foreground">Métricas dos últimos 90 dias, de usuários autenticados. Não representam gravação de tela nem leitura de textos digitados. Abrir a caixa e marcar mensagens como lidas não conta como toque. Eventos podem não chegar se o aparelho estiver sem conexão ou for encerrado imediatamente. Não há envio automático de mensagens.</p>
 </div>;
}
