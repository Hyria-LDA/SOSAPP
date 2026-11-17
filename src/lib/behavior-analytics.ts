import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
export type BehaviorEvent = 'app_open'|'page_view'|'action'|'notification_open'|'publish_success'|'signup_complete'|'search_result';
export type BehaviorAction = ''|'buscar_material'|'anunciar_sobra'|'filtrar'|'contato'|'salvar'|'notificacoes'|'push'|'inbox'|'toast'|'com_resultados'|'sem_resultados';
type Event = {id:string;session:string;event:BehaviorEvent;screen:string;action:BehaviorAction;platform:string;at:string};
let owner:string|null=null, session='', queue:Event[]=[], pending:Promise<void>|null=null;
export function behaviorScreen(path:string) {
 if(path==='/app'||path==='/')return 'inicio';
 if(path.includes('/onboarding'))return 'cadastro';
 for(const screen of ['buscar','anunciar','material','pedidos','estoque','perfil','notificacoes'])
  if(path===`/app/${screen}`||path.startsWith(`/app/${screen}/`))return screen;
 return 'outros';
}
export function setBehaviorUser(id:string|null) {
 if(owner!==id){owner=id;queue=[];try{session=crypto.randomUUID();}catch{session='';}}
}
export function trackBehavior(event:BehaviorEvent,action:BehaviorAction='') {
 if(typeof window==='undefined'||!owner||!session||window.location.pathname.includes('/admin')||window.location.pathname.startsWith('/lojista'))return;
 if(queue.length>=120)queue.shift();
 try { queue.push({id:crypto.randomUUID(),session,event,action,screen:behaviorScreen(window.location.pathname),platform:Capacitor.getPlatform(),at:new Date().toISOString()}); } catch { /* Metrics must never interrupt an action. */ }
}
export function flushBehavior() {
 if(pending)return pending;
 const user=owner;
 if(!user||!queue.length)return Promise.resolve();
 const batch=queue.splice(0,30);
 pending=(async()=>{
  try {
   const {data}=await supabase.auth.getSession();
   if(owner!==user||data.session?.user.id!==user)return;
   const {error}=await (supabase as any).rpc('record_behavior_events',{_events:batch})
     .setHeader('Authorization', `Bearer ${data.session.access_token}`); 
   if(error&&owner===user)queue=[...batch,...queue].slice(-120);
  }catch{if(owner===user)queue=[...batch,...queue].slice(-120);}
  finally{pending=null;}
 })();
 return pending;
}
export function trackNotificationOpen(source:'push'|'inbox'|'toast') {
 trackBehavior('notification_open',source);
 return flushBehavior();
}
