import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel, inputClass, buttonClass } from "./ui";
type Request = {
  id: string;
  store_id: string;
  kind: string;
  message: string;
  status: string;
  response: string;
  created_at: string;
};
export function CampaignRequests({
  storeId,
  admin = false,
}: {
  storeId?: string;
  admin?: boolean;
}) {
  const [kind, setKind] = useState("campaign"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["advertising-requests", storeId, admin],
    queryFn: async () => {
      let q = supabase
        .from("advertising_requests" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Request[];
    },
  });
  async function submit() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("advertising_requests" as never)
        .insert({ store_id: storeId, kind, message: message.trim() } as never);
      if (error) throw error;
      setMessage("");
      await query.refetch();
      toast.success("Solicitação enviada ao administrador.");
    } catch {
      toast.error("Não foi possível enviar a solicitação.");
    } finally {
      setBusy(false);
    }
  }
  async function review(id: string, status: string) {
    const response = window.prompt("Resposta ao anunciante:");
    if (response === null) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("advertising_requests" as never)
        .update({
          status,
          response,
          reviewed_at: new Date().toISOString(),
          reviewer: auth.user?.id,
        } as never)
        .eq("id", id);
      if (error) throw error;
      await query.refetch();
      toast.success(
        "Resposta registrada. Configure a campanha/região no cadastro da loja para efetivar a mudança.",
      );
    } catch {
      toast.error("Não foi possível responder.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Solicitações de campanhas e regiões">
      {!admin && (
        <div className="space-y-3">
          <label className="block">
            Tipo de solicitação
            <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="campaign">Nova campanha</option>
              <option value="region">Alteração de região</option>
            </select>
          </label>
          <label className="block">
            Descreva o que deseja
            <textarea
              className={inputClass}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex.: gostaria de anunciar também em Contagem/MG."
            />
          </label>
          <p className="text-sm text-muted-foreground">
            A publicação e as regiões dependem da aprovação e configuração do administrador.
          </p>
          <button
            className={buttonClass}
            disabled={busy || message.trim().length < 5}
            onClick={() => void submit()}
          >
            Enviar solicitação
          </button>
        </div>
      )}
      {query.error && <p role="alert">Não foi possível consultar as solicitações.</p>}
      {query.data?.map((x) => (
        <article key={x.id} className="mt-3 rounded-xl border p-3">
          <p className="font-bold">
            {x.kind === "region" ? "Alteração de região" : "Nova campanha"} ·{" "}
            {
              (
                { pending: "Pendente", accepted: "Aceita", rejected: "Rejeitada" } as Record<
                  string,
                  string
                >
              )[x.status]
            }
          </p>
          <p className="whitespace-pre-wrap break-words">{x.message}</p>
          {x.response && <p className="mt-2">Resposta: {x.response}</p>}
          {admin && (
            <a className="text-primary underline" href={`/app/admin/lojistas?store=${x.store_id}`}>
              Abrir anunciante
            </a>
          )}
          {admin && x.status === "pending" && (
            <div className="mt-2 flex gap-2">
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() => void review(x.id, "accepted")}
              >
                Aceitar
              </button>
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() => void review(x.id, "rejected")}
              >
                Rejeitar
              </button>
            </div>
          )}
        </article>
      ))}
    </Panel>
  );
}
