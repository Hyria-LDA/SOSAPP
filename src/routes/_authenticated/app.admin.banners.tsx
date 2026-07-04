import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  Plus,
  Eye,
  MousePointerClick,
  Image as ImageIcon,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BannerImageCropper } from "@/components/banner-image-cropper";


type Banner = {
  id: string;
  titulo: string | null;
  subtitulo: string | null;
  imagem_url: string;
  link: string | null;
  botao_texto: string | null;
  ativo: boolean;
  ordem: number;
  data_inicio: string | null;
  data_fim: string | null;
  views: number;
  clicks: number;
  exibir_abertura: boolean;
  duracao_segundos: number;
  delay_segundos: number;
  intervalo_minutos: number;
  planos_alvo: string[] | null;
};

const PLANOS_DISPONIVEIS: { slug: string; nome: string }[] = [
  { slug: "free", nome: "Free" },
  { slug: "plus", nome: "Plus" },
  { slug: "standard", nome: "Standard" },
  { slug: "premium", nome: "Premium" },
];


export const Route = createFileRoute("/_authenticated/app/admin/banners")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
  },
  component: AdminBanners,
});

function AdminBanners() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: banners } = useQuery({
    queryKey: ["admin-banners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banners" as any)
        .select("*")
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Banner[];
    },
  });

  const { data: imagemUrlMap } = useQuery({
    queryKey: ["admin-banners-thumbs", (banners ?? []).map((b) => b.imagem_url).join("|")],
    enabled: !!banners && banners.length > 0,
    queryFn: async () => {
      const { signBannerPaths } = await import("@/lib/banner-images");
      return signBannerPaths((banners ?? []).map((b) => b.imagem_url));
    },
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("banners" as any)
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-banners"] }),
  });

  const reorder = useMutation({
    mutationFn: async ({ id, ordem }: { id: string; ordem: number }) => {
      const { error } = await supabase
        .from("banners" as any)
        .update({ ordem })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-banners"] }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("banners" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-banners"] });
      toast.success("Banner removido");
    },
  });

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link to="/app/admin" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-black">🖼️ Banners</h1>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Novo
        </button>
      </header>

      <p className="mt-2 text-xs text-muted-foreground">
        Banners ativos dentro da janela de datas aparecem no carrossel da home.
      </p>

      <div className="mt-5 space-y-3">
        {(banners ?? []).map((b, idx) => {
          const total = banners?.length ?? 0;
          const ctr = b.views > 0 ? ((b.clicks / b.views) * 100).toFixed(1) + "%" : "—";
          return (
            <div key={b.id} className="rounded-2xl border border-border bg-card p-3 shadow-card">
              <div className="flex gap-3">
                <div className="h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {b.imagem_url && imagemUrlMap?.[b.imagem_url] ? (
                    <img
                      src={imagemUrlMap[b.imagem_url]}
                      alt={b.titulo ?? ""}
                      className="h-full w-full object-cover"
                      onError={() =>
                        console.warn("[admin-banners] thumb failed", {
                          src: imagemUrlMap?.[b.imagem_url],
                        })
                      }
                    />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {b.titulo && (
                        <div className="truncate font-bold">{b.titulo}</div>
                      )}
                      {b.subtitulo && (
                        <div className="truncate text-xs text-muted-foreground">{b.subtitulo}</div>
                      )}
                    </div>
                    <button
                      onClick={() => toggleAtivo.mutate({ id: b.id, ativo: !b.ativo })}
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${b.ativo ? "bg-accent text-accent-foreground" : "bg-destructive text-destructive-foreground"}`}
                    >
                      {b.ativo ? "🟢 Ativo" : "🔴 Inativo"}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {b.views}
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="h-3 w-3" />
                      {b.clicks}
                    </span>
                    <span>CTR {ctr}</span>
                    <span>Ordem {b.ordem}</span>
                  </div>
                  {(b.data_inicio || b.data_fim) && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {b.data_inicio ? fmtDate(b.data_inicio) : "—"} →{" "}
                      {b.data_fim ? fmtDate(b.data_fim) : "—"}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <button
                  disabled={idx === 0}
                  onClick={() => reorder.mutate({ id: b.id, ordem: Math.max(0, b.ordem - 1) })}
                  className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1.5 font-semibold disabled:opacity-40"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  disabled={idx === total - 1}
                  onClick={() => reorder.mutate({ id: b.id, ordem: b.ordem + 1 })}
                  className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1.5 font-semibold disabled:opacity-40"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setEditing(b)}
                  className="rounded-lg bg-secondary px-3 py-1.5 font-semibold"
                >
                  Editar
                </button>
                <button
                  onClick={() => {
                    if (confirm("Remover este banner?")) remover.mutate(b.id);
                  }}
                  className="flex items-center gap-1 rounded-lg bg-destructive/10 px-3 py-1.5 font-semibold text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
        {banners && banners.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum banner cadastrado. Crie o primeiro para exibir no app.
          </div>
        )}
      </div>

      {(creating || editing) && (
        <BannerForm
          banner={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-banners"] });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function fmtDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString("pt-BR");
}

function BannerForm({
  banner,
  onClose,
  onSaved,
}: {
  banner: Banner | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState(banner?.titulo ?? "");
  const [subtitulo, setSubtitulo] = useState(banner?.subtitulo ?? "");
  const [link, setLink] = useState(banner?.link ?? "");
  const [botaoTexto, setBotaoTexto] = useState(banner?.botao_texto ?? "");
  const [ativo, setAtivo] = useState(banner?.ativo ?? true);
  const [ordem, setOrdem] = useState(banner?.ordem ?? 0);
  const [dataInicio, setDataInicio] = useState(
    banner?.data_inicio ? toLocalDate(banner.data_inicio) : "",
  );
  const [dataFim, setDataFim] = useState(banner?.data_fim ? toLocalDate(banner.data_fim) : "");
  const [imagemUrl, setImagemUrl] = useState(banner?.imagem_url ?? "");
  const [imagemPreview, setImagemPreview] = useState<string>("");
  const [exibirAbertura, setExibirAbertura] = useState(banner?.exibir_abertura ?? false);
  const [duracaoSegundos, setDuracaoSegundos] = useState(banner?.duracao_segundos ?? 10);
  const [delaySegundos, setDelaySegundos] = useState(banner?.delay_segundos ?? 0);
  const [intervaloMinutos, setIntervaloMinutos] = useState(banner?.intervalo_minutos ?? 0);
  const [planosAlvo, setPlanosAlvo] = useState<string[]>(
    Array.isArray(banner?.planos_alvo) ? (banner!.planos_alvo as string[]) : [],
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  async function uploadBlob(blob: Blob, mime: string, ext: string) {
    setUploading(true);
    try {
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("banners")
        .upload(path, blob, { contentType: mime, upsert: false });
      if (upErr) throw upErr;
      // Persist only the storage path. Short-lived signed URLs are generated at read time.
      setImagemUrl(path);
      const { signBannerImage } = await import("@/lib/banner-images");
      setImagemPreview(await signBannerImage(path));
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error(e.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  // Sign existing stored value (path or legacy URL) for the in-form preview.
  useEffect(() => {
    let alive = true;
    if (!imagemUrl) {
      setImagemPreview("");
      return;
    }
    (async () => {
      const { signBannerImage } = await import("@/lib/banner-images");
      const url = await signBannerImage(imagemUrl);
      if (alive) setImagemPreview(url);
    })();
    return () => {
      alive = false;
    };
  }, [imagemUrl]);

  function pickFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem");
      return;
    }
    setCropFile(file);
  }


  async function save() {
    if (!imagemUrl) {
      toast.error("Adicione uma imagem");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        titulo: titulo.trim() || null,
        subtitulo: subtitulo.trim() || null,
        imagem_url: imagemUrl,
        link: link.trim() || null,
        botao_texto: botaoTexto.trim() || null,
        ativo,
        ordem,
        data_inicio: dataInicio ? new Date(dataInicio).toISOString() : null,
        data_fim: dataFim ? new Date(dataFim).toISOString() : null,
        exibir_abertura: exibirAbertura,
        duracao_segundos: Math.max(1, Math.min(60, Number(duracaoSegundos) || 10)),
        delay_segundos: Math.max(0, Math.min(600, Number(delaySegundos) || 0)),
        intervalo_minutos: Math.max(0, Math.min(1440, Number(intervaloMinutos) || 0)),
        planos_alvo: planosAlvo,

      };
      if (banner) {
        const { error } = await supabase
          .from("banners" as any)
          .update(payload)
          .eq("id", banner.id);
        if (error) throw error;
        toast.success("Banner atualizado");
      } else {
        const { error } = await supabase.from("banners" as any).insert(payload);
        if (error) throw error;
        toast.success("Banner criado");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-background pt-2 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-border" />
        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-base font-black">{banner ? "Editar Banner" : "Novo Banner"}</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 pb-6">
          {/* Upload */}
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Imagem *
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) pickFile(f);
              }}
              onClick={() => fileRef.current?.click()}
              className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-4 transition ${dragOver ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              {imagemUrl && imagemPreview ? (
                <div className="w-full">
                  <img
                    src={imagemPreview}
                    alt="preview"
                    className="mx-auto max-h-44 rounded-xl object-cover"
                    onError={() => console.warn("[admin-banners] preview failed", { src: imagemPreview })}
                  />
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Clique para trocar
                  </p>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-2 text-sm font-semibold">Arraste ou clique para enviar</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP</p>
                </div>
              )}
              {uploading && <p className="mt-2 text-xs text-primary">Enviando…</p>}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <Field label="Título">
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={inputCls}
              placeholder="Ex: Promoção Setembro (opcional)"
            />
          </Field>

          <Field label="Subtítulo">
            <input
              value={subtitulo}
              onChange={(e) => setSubtitulo(e.target.value)}
              className={inputCls}
              placeholder="Texto secundário (opcional)"
            />
          </Field>

          <Field label="Link (opcional)">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className={inputCls}
              placeholder="/app/buscar ou https://..."
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Se vazio, o banner não terá ação ao tocar.
            </p>
          </Field>

          <Field label="Texto do botão (opcional)">
            <input
              value={botaoTexto}
              onChange={(e) => setBotaoTexto(e.target.value)}
              className={inputCls}
              placeholder="Ex: 🔍 Buscar Material"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Deixe vazio para banner informativo (sem botão).
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Ordem">
              <input
                type="number"
                value={ordem}
                onChange={(e) => setOrdem(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </Field>
            <Field label="Status">
              <button
                type="button"
                onClick={() => setAtivo(!ativo)}
                className={`h-10 w-full rounded-xl px-3 text-sm font-bold ${ativo ? "bg-accent text-accent-foreground" : "bg-destructive text-destructive-foreground"}`}
              >
                {ativo ? "🟢 Ativo" : "🔴 Inativo"}
              </button>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data início">
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Data fim">
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Tempo de exibição (segundos)">
            <div className="flex flex-wrap gap-2">
              {[5, 10, 15, 20].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDuracaoSegundos(s)}
                  className={`h-9 rounded-xl px-3 text-xs font-bold ${
                    Number(duracaoSegundos) === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {s}s
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={60}
                value={duracaoSegundos}
                onChange={(e) => setDuracaoSegundos(Number(e.target.value) || 10)}
                className="h-9 w-20 rounded-xl border border-border bg-card px-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tempo em segundos antes de trocar para o próximo banner. Padrão: 10s.
            </p>
          </Field>

          <Field label="Exibir para">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPlanosAlvo([])}
                className={`h-9 rounded-xl px-3 text-xs font-bold ${
                  planosAlvo.length === 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                Todos
              </button>
              {PLANOS_DISPONIVEIS.map((p) => {
                const selected = planosAlvo.includes(p.slug);
                return (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => {
                      setPlanosAlvo((prev) =>
                        prev.includes(p.slug)
                          ? prev.filter((s) => s !== p.slug)
                          : [...prev, p.slug],
                      );
                    }}
                    className={`h-9 rounded-xl px-3 text-xs font-bold ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {p.nome}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              "Todos" exibe para qualquer plano. Selecione planos específicos para segmentar.
            </p>
          </Field>

          <div className="rounded-2xl border border-border bg-card p-3">
            <Field label="Banner de abertura (tela cheia)">
              <button
                type="button"
                onClick={() => setExibirAbertura(!exibirAbertura)}
                className={`h-10 w-full rounded-xl px-3 text-sm font-bold ${exibirAbertura ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}
              >
                {exibirAbertura ? "✅ Exibir na abertura do app" : "❌ Não exibir na abertura"}
              </button>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Quando ativo, aparece em tela cheia ao abrir o app (respeitando a segmentação por plano acima — ideal para banner de upgrade para usuários Free). O usuário não pode fechar antes do tempo de exibição terminar.
              </p>
            </Field>

            {exibirAbertura && (
              <div className="mt-3">
                <Field label="Aparecer após (segundos no app)">
                  <div className="flex flex-wrap gap-2">
                    {[0, 5, 10, 30, 60].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setDelaySegundos(s)}
                        className={`h-9 rounded-xl px-3 text-xs font-bold ${
                          Number(delaySegundos) === s
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {s === 0 ? "Imediato" : `${s}s`}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={delaySegundos}
                      onChange={(e) => setDelaySegundos(Number(e.target.value) || 0)}
                      className="h-9 w-20 rounded-xl border border-border bg-card px-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Tempo que o usuário precisa ficar no app antes do banner aparecer. 0 = aparece imediatamente.
                  </p>
                </Field>

                <div className="mt-3">
                  <Field label="Repetir a cada (minutos)">
                    <div className="flex flex-wrap gap-2">
                      {[0, 5, 10, 15, 30, 60].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setIntervaloMinutos(m)}
                          className={`h-9 rounded-xl px-3 text-xs font-bold ${
                            Number(intervaloMinutos) === m
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          {m === 0 ? "Só 1x" : `${m} min`}
                        </button>
                      ))}
                      <input
                        type="number"
                        min={0}
                        max={1440}
                        value={intervaloMinutos}
                        onChange={(e) => setIntervaloMinutos(Number(e.target.value) || 0)}
                        className="h-9 w-20 rounded-xl border border-border bg-card px-2 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Reexibir o banner enquanto o usuário estiver no app. 0 = aparece apenas uma vez por sessão.
                    </p>
                  </Field>
                </div>
              </div>
            )}
          </div>


          {/* Pré-visualização */}
          {imagemUrl && imagemPreview && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pré-visualização
              </label>
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                <img
                  src={imagemPreview}
                  alt=""
                  className="w-full object-cover"
                  style={{ aspectRatio: "16 / 9" }}
                  onError={() => console.warn("[admin-banners] preview2 failed", { src: imagemPreview })}
                />
                <div className="p-4">
                  <div className="font-black">{titulo || "Título"}</div>
                  {subtitulo && (
                    <div className="mt-0.5 text-sm text-muted-foreground">{subtitulo}</div>
                  )}
                  {botaoTexto && (
                    <button className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                      {botaoTexto}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {cropFile && (
            <BannerImageCropper
              file={cropFile}
              onCancel={() => setCropFile(null)}
              onConfirm={async (blob, mime, ext) => {
                setCropFile(null);
                await uploadBlob(blob, mime, ext);
              }}
            />
          )}

          <div className="flex gap-2 pt-2">

            <button
              onClick={onClose}
              className="h-12 flex-1 rounded-xl bg-secondary text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || uploading}
              className="h-12 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary";

function toLocalDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
