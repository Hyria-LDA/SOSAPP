import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export type DenunciaTarget =
  | { type: "anuncio"; materialId: string; empresaId: string }
  | { type: "empresa"; empresaId: string };

const MOTIVOS_ANUNCIO = [
  { v: "foto_nao_corresponde", label: "📷 Foto não corresponde ao material" },
  { v: "indisponivel", label: "📦 Material já não está disponível" },
  { v: "preco_enganoso", label: "💰 Preço enganoso" },
  { v: "medidas_incorretas", label: "📏 Medidas incorretas" },
  { v: "proibido", label: "🚫 Material proibido" },
  { v: "inadequado", label: "🔞 Conteúdo inadequado" },
  { v: "spam", label: "🤖 Spam ou anúncio repetido" },
  { v: "empresa_falsa", label: "🏢 Empresa falsa" },
  { v: "contato_invalido", label: "📞 Contato inválido" },
  { v: "outro", label: "❓ Outro motivo" },
];

const MOTIVOS_EMPRESA = [
  { v: "contato_falso", label: "📞 Contato falso" },
  { v: "golpe", label: "💰 Golpe" },
  { v: "material_inexistente", label: "🚫 Material inexistente" },
  { v: "nao_entrega", label: "📦 Não entrega material anunciado" },
  { v: "empresa_falsa", label: "🏢 Empresa falsa" },
  { v: "spam", label: "🤖 Spam" },
  { v: "outro", label: "❓ Outro motivo" },
];

export function DenunciaButton({
  target,
  className,
  variant = "icon",
}: {
  target: DenunciaTarget;
  className?: string;
  variant?: "icon" | "text";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          (variant === "icon"
            ? "grid h-10 w-10 place-items-center rounded-xl bg-card/90 backdrop-blur shadow-card"
            : "inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold")
        }
        aria-label="Denunciar"
        title="Denunciar"
      >
        <Flag className="h-4 w-4 text-destructive" />
        {variant === "text" && <span>Denunciar</span>}
      </button>
      <DenunciaModal open={open} onOpenChange={setOpen} target={target} />
    </>
  );
}

export function DenunciaModal({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: DenunciaTarget;
}) {
  const [categoria, setCategoria] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const motivos = target.type === "anuncio" ? MOTIVOS_ANUNCIO : MOTIVOS_EMPRESA;

  const submit = async () => {
    if (!categoria) {
      toast.error("Selecione um motivo");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      toast.error("Faça login para denunciar");
      setSaving(false);
      return;
    }
    const payload: any = {
      denunciante_id: u.user.id,
      target_type: target.type,
      target_id: target.type === "anuncio" ? target.materialId : target.empresaId,
      material_id: target.type === "anuncio" ? target.materialId : null,
      empresa_id: target.empresaId,
      categoria,
      observacao: observacao.trim() || null,
    };
    const { error } = await (supabase.from as any)("denuncias").insert(payload);
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Você já denunciou este item.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Denúncia enviada. Obrigado por nos ajudar!");
    setCategoria("");
    setObservacao("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🚩 Denunciar {target.type === "anuncio" ? "Anúncio" : "Empresa"}
          </DialogTitle>
          <DialogDescription>Qual o motivo da denúncia?</DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {motivos.map((m) => (
            <button
              key={m.v}
              type="button"
              onClick={() => setCategoria(m.v)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                categoria === m.v
                  ? "border-primary bg-primary/5 font-semibold"
                  : "border-border bg-card hover:bg-secondary"
              }`}
            >
              <span>{m.label}</span>
              {categoria === m.v && <span className="text-primary">✓</span>}
            </button>
          ))}
        </div>

        <div className="mt-2">
          <label className="text-xs font-semibold text-muted-foreground">
            Observação (opcional)
          </label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="Ex: o material anunciado não corresponde à foto."
            className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
            {observacao.length}/500
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !categoria}
            className="rounded-xl bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground disabled:opacity-60"
          >
            {saving ? "Enviando…" : "Enviar denúncia"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
