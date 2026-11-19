import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/whatsapp";
import { parseMaterialPrice } from "@/lib/material-price";
export function EditMaterialPriceDialog({ material, onClose }: { material: { id: string; title: string; price: number }; onClose: () => void }) {
 const [value,setValue]=useState(material.price.toFixed(2).replace(".",","));
 const price=parseMaterialPrice(value);
 const qc=useQueryClient();
 const save=useMutation({mutationFn:async()=>{
  if(price===null)throw new Error("Informe um valor válido, como 80,00.");
  const {data,error}=await supabase.rpc("update_my_material_price",{_material:material.id,_price:price,_expected_price:material.price});
  if(error)throw error;
  if(data!==material.id)throw new Error("Não foi possível confirmar a alteração.");
 },onSuccess:()=>{
  for(const key of ["meu-estoque","buscar","material","empresa-materiais","sobras-perto-regiao","admin-recent-materials"])void qc.invalidateQueries({queryKey:[key]});
  toast.success("Preço atualizado!");onClose();
 },onError:()=>toast.error("Não foi possível alterar o preço. Atualize o estoque e tente novamente.")});
 return <Dialog open onOpenChange={open=>{if(!open&&!save.isPending)onClose();}}><DialogContent>
  <DialogTitle>Alterar preço</DialogTitle><DialogDescription>{material.title} · Preço atual: {formatBRL(material.price)}</DialogDescription>
  <form onSubmit={e=>{e.preventDefault();if(price!==null&&price!==material.price&&!save.isPending)save.mutate();}}>
   <label className="block text-sm font-semibold">Novo preço (R$)<input autoFocus inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} disabled={save.isPending} placeholder="80,00" className="mt-2 h-12 w-full rounded-xl border bg-background px-3"/></label>
   {price===null ? <p className="mt-2 text-sm text-destructive">Digite um valor válido, como 80,00 ou 1.200,50.</p> : <p className="mt-2 text-sm text-muted-foreground">{price<material.price ? `O preço anterior (${formatBRL(material.price)}) aparecerá riscado, ao lado do novo valor: ${formatBRL(price)}.` : "O preço anterior só aparece riscado quando há redução."}</p>}
   <div className="mt-4 flex gap-2"><button type="button" disabled={save.isPending} onClick={onClose} className="rounded-xl bg-secondary px-4 py-3">Cancelar</button><button disabled={save.isPending||price===null||price===material.price} className="rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">{save.isPending?"Salvando…":"Salvar preço"}</button></div>
  </form>
 </DialogContent></Dialog>;
}
