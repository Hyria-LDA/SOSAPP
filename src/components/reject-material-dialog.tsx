import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
export function RejectMaterialDialog({
  material,
  onClose,
}: {
  material: { id: string; title: string } | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const reject = useMutation({
    mutationFn: async () => {
      if (!material) throw new Error("Anúncio não selecionado");
      const { data, error } = await supabase.functions.invoke("delete-material", {
        body: { material_id: material.id, action: "reject", reason: reason.trim() },
      });
      if (error || !data?.ok)
        throw new Error(
          data?.error || "Não foi possível excluir o anúncio e registrar o aviso. Tente novamente.",
        );
      return data;
    },
    onSuccess: (data) => {
      for (const key of [
        "admin-recent-materials",
        "admin-recent-materials-total",
        "admin-moderacao-fotos",
        "admin-moderacao-fotos-counts",
        "admin-empresas-full",
        "admin-company-material-counts",
        "admin-empresa",
        "meu-estoque",
        "buscar",
        "home-materials",
      ])
        void qc.invalidateQueries({ queryKey: [key] });
      toast.success(
        "Anúncio excluído. O motivo foi enviado à caixa de notificações do anunciante.",
      );
      if (data.cleanup_pending)
        toast.warning("A limpeza dos arquivos ficou pendente; o anúncio já foi excluído.");
      setReason("");
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Dialog
      open={!!material}
      onOpenChange={(open) => {
        if (!open && !reject.isPending) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogTitle>Excluir anúncio e avisar</DialogTitle>
        <DialogDescription>
          O anúncio inteiro e suas fotos serão removidos. Escreva o motivo que será enviado ao
          anunciante. Essa ação não pode ser desfeita.
        </DialogDescription>
        <p className="font-bold">{material?.title}</p>
        <label className="text-sm">
          Motivo da exclusão
          <textarea
            autoFocus
            className="mt-2 min-h-28 w-full rounded-xl border bg-background p-3"
            maxLength={1000}
            value={reason}
            disabled={reject.isPending}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: A foto não mostra a sobra anunciada. Publique novamente com uma foto nítida do material."
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {reason.trim().length}/1000 caracteres · mínimo 3
        </p>
        <div className="rounded-xl bg-secondary p-3 text-sm">
          <strong>Mensagem para o anunciante</strong>
          <p>
            Seu anúncio &quot;{material?.title}&quot; foi excluído pela administração. Motivo:{" "}
            {reason.trim() || "Digite o motivo acima."}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          O motivo fica nas notificações do app. O aviso no celular depende de notificações
          habilitadas e do serviço de envio.
        </p>
        <div className="flex gap-2">
          <button
            className="rounded-xl border px-4 py-2"
            disabled={reject.isPending}
            onClick={() => {
              setReason("");
              onClose();
            }}
          >
            Cancelar
          </button>
          <button
            className="rounded-xl bg-destructive px-4 py-2 text-destructive-foreground disabled:opacity-50"
            disabled={reject.isPending || reason.trim().length < 3}
            onClick={() => reject.mutate()}
          >
            {reject.isPending ? "Excluindo…" : "Confirmar exclusão e avisar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
