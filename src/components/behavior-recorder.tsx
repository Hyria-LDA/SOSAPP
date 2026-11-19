import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { setBehaviorUser,trackBehavior,flushBehavior,type BehaviorAction } from '@/lib/behavior-analytics';
export function BehaviorRecorder(){
 const path=useRouterState({select:s=>s.location.pathname});
 useEffect(()=>{
  let user:string|null=null,disposed=false,lastOpen=0;
  const opened=()=>{if(!user||document.visibilityState==='hidden'||Date.now()-lastOpen<30000)return;lastOpen=Date.now();trackBehavior('app_open');};
  const applyUser=(id:string|null)=>{
   if(disposed||id===user)return;user=id;setBehaviorUser(id);lastOpen=0;
   if(id){
    const url=new URL(window.location.href);
    if(url.searchParams.has('_sos_push')){trackBehavior('notification_open','push');url.searchParams.delete('_sos_push');window.history.replaceState(window.history.state,'',url);}
    opened();trackBehavior('page_view');
   }
  };
  const {data:auth}=supabase.auth.onAuthStateChange((_e,s)=>applyUser(s?.user.id??null));
  void supabase.auth.getSession().then(({data})=>applyUser(data.session?.user.id??null));
  const visibility=()=>{if(document.visibilityState==='visible')opened();else void flushBehavior();};
  const click=(event:MouseEvent)=>{
   const element=event.target instanceof Element?event.target.closest('button,a'):null;
   if(!element||element.hasAttribute('disabled'))return;
   const text=(element.textContent??'').trim().toLocaleLowerCase('pt-BR');
   let action:BehaviorAction|undefined;
   if(/buscar\s*material/.test(text))action='buscar_material';
   else if(/anunciar\s*sobra/.test(text))action='anunciar_sobra';
   else if(text==='aplicar filtros'||text==='filtrar'||text==='buscar')action='filtrar';
   else if(text.includes('whatsapp'))action='contato';
   if(action)trackBehavior('action',action);
  };
  document.addEventListener('visibilitychange',visibility);document.addEventListener('click',click);
  let nativeHandle:PluginListenerHandle|undefined;
  if(Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('App')) {
   void App.addListener('appStateChange',({isActive})=>{if(isActive)opened();else void flushBehavior();})
    .then(handle=>{if(disposed)void handle.remove();else nativeHandle=handle;}).catch(()=>{});
  }
  const timer=window.setInterval(()=>void flushBehavior(),15000);
  return()=>{disposed=true;void nativeHandle?.remove();auth.subscription.unsubscribe();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('click',click);clearInterval(timer);void flushBehavior();};
 },[]);
 useEffect(()=>{trackBehavior('page_view');},[path]);
 return null;
}
