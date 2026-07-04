import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  MessageCircle,
  MoreVertical,
  RefreshCw,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/app/estoque")({
  validateSearch: (s) =>
    z
      .object({ tab: z.enum(["ativo", "vendido", "expirado"]).optional() })
      .parse(s),
  component: Estoque,
});

type Tab = "ativo" | "vendido" | "expirado";

function Estoque() {
  const sp = Route.useSearch();
  const [tab, setTab] = useState<Tab>((sp.tab as Tab) ?? "ativo");
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [sellModal, setSellModal] = useState<{ id: string; preco: number } | null>(null);
  const [sellValue, setSellValue] = useState("");

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const { data } = useQuery({
    queryKey: ["meu-estoque", tab],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: emp } = await supabase
        .from("empresas")
        .select("id")
        .eq("owner_id", u.user!.id)
        .single();
      if (!emp) return [];
      // Fetch ativo + vendido. "Expirado" derives from ativo > 30 dias.
      const statusFilter = tab === "vendido" ? "vendido" : "ativo";
      const { data, error } = await supabase
        .from("materiais")
        .select(
          "id, padrao, fabricante, espessura_mm, preco, area_m2, status, views, contatos, valor_vendido, created_at, fotos_materiais(url, ordem)",
        )
        .eq("empresa_id", emp.id)
        .eq("status", statusFilter)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const now = Date.now();
      const filtered = (data ?? []).filter((m: any) => {
        if (tab === "vendido") return true;
        const idade = now - new Date(m.created_at).getTime();
        const expirado = idade >= THIRTY_DAYS_MS;
        return tab === "expirado" ? expirado : !expirado;
      });
      const { attachFirstFoto } = await import("@/lib/material-photos");
      return await attachFirstFoto(filtered as any[]);
    },
  });

  const mut = useMutation({
    mutationFn: async ({
      id,
      action,
      valor,
    }: {
      id: string;
      action: "vender" | "excluir" | "renovar";
      valor?: number;
    }) => {
      if (action === "excluir") return supabase.from("materiais").delete().eq("id", id);
      if (action === "vender") {
        return supabase
          .from("materiais")
          .update({ status: "vendido", valor_vendido: valor ?? null })
          .eq("id", id);
      }
      // renovar: empurra created_at para agora (resetando os 30 dias)
      return supabase
        .from("materiais")
        .update({ status: "ativo", created_at: new Date().toISOString() })
        .eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meu-estoque"] });
      qc.invalidateQueries({ queryKey: ["perfil"] });
      toast.success("Atualizado");
      setOpen(null);
      setSellModal(null);
      setSellValue("");
    },
    onError: (e: any) => toast.error(e?.message || "Erro"),
  });

  const openSellModal = (id: string, preco: number) => {
    setSellModal({ id, preco });
    setSellValue(String(preco ?? ""));
  };

  const confirmSell = () => {
    if (!sellModal) return;
    const v = Number(String(sellValue).replace(",", "."));
    if (!v || v <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    mut.mutate({ id: sellModal.id, action: "vender", valor: v });
  };

  return (
    <div className="safe-top px-5 pt-4">
      <header className="flex items-center gap-2">
        <Link to="/app" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-black">Meu estoque</h1>
      </header>

      <div className="mt-5 flex gap-2 rounded-2xl bg-secondary p-1">
        {(["ativo", "vendido", "expirado"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold capitalize transition ${tab === t ? "bg-card shadow-card text-foreground" : "text-muted-foreground"}`}
          >
            {t === "ativo" ? "Ativos" : t === "vendido" ? "Vendidos" : "Expirados"}
          </button>
        ))}
      </div>


      <div className="mt-4 space-y-2 pb-10">
        {(data ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum anúncio aqui.
          </div>
        )}
        {(data ?? []).map((m: any) => {
          const foto = m.foto;
          return (
            <div
              key={m.id}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
            >
              <div className="flex">
                <Link to="/app/material/$id" params={{ id: m.id }} className="flex flex-1 gap-3">
                  <div className="h-24 w-24 shrink-0 bg-secondary">
                    {foto && <img src={foto} className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1 py-2">
                    <div className="truncate font-bold">{m.padrao}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.fabricante} · {Number(m.espessura_mm)}mm
                    </div>
                    <div className="mt-1 text-sm font-bold text-primary">
                      {formatBRL(Number(m.preco))}
                    </div>
                    <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {m.views ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        {m.contatos ?? 0}
                      </span>
                    </div>
                  </div>
                </Link>
                <button onClick={() => setOpen(open === m.id ? null : m.id)} className="px-2">
                  <MoreVertical className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
              {open === m.id && (
                <div className="grid grid-cols-3 border-t border-border">
                  {tab === "expirado" && (
                    <Action
                      icon={RefreshCw}
                      label="Renovar"
                      onClick={() => mut.mutate({ id: m.id, action: "renovar" })}
                    />
                  )}
                  {tab !== "vendido" && (
                    <Action
                      icon={CheckCircle2}
                      label="Vendido"
                      onClick={() => openSellModal(m.id, Number(m.preco))}
                    />
                  )}
                  <Action
                    icon={Trash2}
                    label="Excluir"
                    onClick={() =>
                      confirm("Excluir anúncio?") && mut.mutate({ id: m.id, action: "excluir" })
                    }
                    danger
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sellModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5"
          onClick={() => setSellModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-lg font-black">Marcar como vendido</div>
            <p className="text-sm text-muted-foreground">Por qual valor esta peça foi vendida?</p>
            <label className="mt-4 block text-[11px] font-bold uppercase text-muted-foreground">
              Valor vendido (R$)
            </label>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={sellValue}
              onChange={(e) => setSellValue(e.target.value)}
              placeholder="120,00"
              className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-lg font-bold outline-none focus:border-primary"
            />
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setSellModal(null)}
                className="h-11 flex-1 rounded-xl bg-secondary text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={confirmSell}
                disabled={mut.isPending}
                className="h-11 flex-[2] rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-pop disabled:opacity-60"
              >
                Confirmar venda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition active:bg-secondary ${danger ? "text-destructive" : "text-foreground"}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
