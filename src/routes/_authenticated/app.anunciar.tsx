import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera as NativeCamera,
  CameraDirection,
  EncodingType,
  MediaTypeSelection,
  type MediaResult,
} from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ImagePlus,
  Loader2,
  Search,
  Star,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { checkPlanLimit, usePlanStatus } from "@/hooks/use-plan-status";
import { UpgradeModal } from "@/components/upgrade-modal";
import { Sheet, SheetOptionButton } from "@/components/sheet";
import { sortByNome } from "@/lib/sort";

const MAX_PHOTOS = 3;
const MAX_FILE_MB = 20;
const MAX_COMPRIMENTO_CM = 275;
const MAX_LARGURA_CM = 185;
const DRAFT_STORAGE_KEY = "sos:anunciar-draft:v1";
const EMPTY_FORM = {
  comprimento_cm: "",
  largura_cm: "",
  quantidade: "1",
  preco: "",
  observacoes: "",
};
const PHOTO_SLOTS: { title: string; hint: string }[] = [
  { title: "Foto Principal", hint: "Visão geral da peça inteira" },
  { title: "Foto Opcional", hint: "Detalhes da superfície (cor, padrão, veio)" },
  { title: "Foto Opcional", hint: "Furos, recortes, bordas ou defeitos" },
];

type PhotoItem = { file: File; preview: string };

async function mediaResultToFile(result: MediaResult, prefix: string) {
  const rawFormat = result.metadata?.format?.toLowerCase() || "jpg";
  const extension = rawFormat === "jpeg" ? "jpg" : rawFormat;
  const mimeFormat = rawFormat === "jpg" ? "jpeg" : rawFormat;
  const mime = `image/${mimeFormat}`;
  let blob: Blob | null = null;

  if (Capacitor.isNativePlatform() && result.uri) {
    try {
      const nativeFile = await Filesystem.readFile({ path: result.uri });
      if (typeof nativeFile.data === "string") {
        const base64 = nativeFile.data.replace(/^data:[^;]+;base64,/, "");
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        blob = new Blob([bytes], { type: mime });
      } else {
        blob = nativeFile.data;
      }
    } catch (error) {
      console.warn("Leitura nativa da foto falhou; tentando endereco web.", error);
    }
  }

  if (!blob) {
    const source = result.webPath ?? (result.uri ? Capacitor.convertFileSrc(result.uri) : "");
    if (source) {
      try {
        const response = await fetch(source);
        if (response.ok) blob = await response.blob();
      } catch (error) {
        console.warn("Leitura web da foto falhou; tentando miniatura nativa.", error);
      }
    }
  }

  if (!blob && result.thumbnail) {
    const base64 = result.thumbnail.replace(/^data:[^;]+;base64,/, "");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    blob = new Blob([bytes], { type: mime });
  }

  if (!blob) throw new Error("Nao foi possivel ler a imagem capturada.");

  return new File([blob], `${prefix}-${Date.now()}.${extension}`, {
    type: blob.type || mime,
  });
}

function cameraActionWasCancelled(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel|cancelled|canceled|cancelado/i.test(message);
}

function isLikelyImage(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

function clampDimensionInput(value: string, max: number) {
  if (value === "") return "";
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return value;
  if (numericValue > max) return String(max);
  if (numericValue < 0) return "0";
  return value;
}

function normalizePriceInput(value: string) {
  const cleaned = value.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const [integerPart, ...decimalParts] = cleaned.split(",");
  const decimals = decimalParts.join("").slice(0, 2);
  return decimalParts.length > 0 ? `${integerPart},${decimals}` : integerPart;
}

function parsePriceInput(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const price = Number(normalized);
  return Number.isFinite(price) ? price : 0;
}

function formatPriceInput(value: string) {
  if (!value.trim()) return "";
  return parsePriceInput(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const Route = createFileRoute("/_authenticated/app/anunciar")({
  component: Anunciar,
});

type Fab = { id: string; nome: string };
type Pad = { id: string; nome: string; categoria: string; fabricante_id: string };
type Esp = { id: string; valor_mm: number };
type AnunciarDraft = {
  fabricanteId: string;
  padraoId: string;
  espessuraMm: string;
  espessuraOutra: boolean;
  form: typeof EMPTY_FORM;
};

function loadAnunciarDraft(): AnunciarDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<AnunciarDraft>;
    return {
      fabricanteId: typeof draft.fabricanteId === "string" ? draft.fabricanteId : "",
      padraoId: typeof draft.padraoId === "string" ? draft.padraoId : "",
      espessuraMm: typeof draft.espessuraMm === "string" ? draft.espessuraMm : "",
      espessuraOutra: draft.espessuraOutra === true,
      form: {
        ...EMPTY_FORM,
        ...(draft.form && typeof draft.form === "object" ? draft.form : {}),
        preco: formatPriceInput(typeof draft.form?.preco === "string" ? draft.form.preco : ""),
      },
    };
  } catch {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }
}

function Anunciar() {
  const navigate = useNavigate();
  const [initialDraft] = useState(loadAnunciarDraft);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string>("");
  const { data: planStatus } = usePlanStatus();

  const [fabricanteId, setFabricanteId] = useState<string>(initialDraft?.fabricanteId ?? "");
  const [padraoId, setPadraoId] = useState<string>(initialDraft?.padraoId ?? "");
  const [espessuraMm, setEspessuraMm] = useState<string>(initialDraft?.espessuraMm ?? "");
  const [espessuraOutra, setEspessuraOutra] = useState(initialDraft?.espessuraOutra ?? false);
  const [showFabPicker, setShowFabPicker] = useState(false);

  const [f, setF] = useState(initialDraft?.form ?? EMPTY_FORM);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const finalizePrice = () => {
    setF((current) => ({ ...current, preco: formatPriceInput(current.preco) }));
  };
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((s) => ({ ...s, [k]: e.target.value }));

  const [photoSlots, setPhotoSlots] = useState<Array<PhotoItem | null>>(() =>
    Array.from({ length: MAX_PHOTOS }, () => null),
  );
  const photos = photoSlots.filter((photo): photo is PhotoItem => photo !== null);
  const photoSlotsRef = useRef(photoSlots);
  useEffect(() => {
    photoSlotsRef.current = photoSlots;
  }, [photoSlots]);
  useEffect(() => {
    return () => {
      photoSlotsRef.current.forEach((photo) => {
        if (photo) URL.revokeObjectURL(photo.preview);
      });
    };
  }, []);

  const addPhoto = (index: number, file: File) => {
    if (!isLikelyImage(file)) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Imagem maior que ${MAX_FILE_MB} MB. Escolha outra.`);
      return;
    }
    setPhotoSlots((previousSlots) => {
      const selectedCount = previousSlots.filter(Boolean).length;
      if (!previousSlots[index] && selectedCount >= MAX_PHOTOS) {
        toast.error(`Máximo de ${MAX_PHOTOS} fotos por anúncio.`);
        return previousSlots;
      }

      const nextSlots = [...previousSlots];
      const targetIndex = selectedCount === 0 ? 0 : index;
      const previousPhoto = nextSlots[targetIndex];
      if (previousPhoto) URL.revokeObjectURL(previousPhoto.preview);
      nextSlots[targetIndex] = { file, preview: URL.createObjectURL(file) };
      return nextSlots;
    });
  };
  const removePhoto = (idx: number) => {
    setPhotoSlots((previousSlots) => {
      const nextSlots = [...previousSlots];
      const photo = nextSlots[idx];
      if (photo) URL.revokeObjectURL(photo.preview);
      nextSlots[idx] = null;

      if (idx === 0) {
        const nextPhotoIndex = nextSlots.findIndex((item, itemIndex) => itemIndex > 0 && item);
        if (nextPhotoIndex > 0) {
          nextSlots[0] = nextSlots[nextPhotoIndex];
          nextSlots[nextPhotoIndex] = null;
        }
      }

      return nextSlots;
    });
  };
  const makeMain = (idx: number) => {
    setPhotoSlots((previousSlots) => {
      if (idx <= 0 || !previousSlots[idx]) return previousSlots;
      const nextSlots = [...previousSlots];
      [nextSlots[0], nextSlots[idx]] = [nextSlots[idx], nextSlots[0]];
      return nextSlots;
    });
  };

  const { data: fabricantes } = useQuery({
    queryKey: ["fabricantes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fabricantes")
        .select("id, nome")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return sortByNome(data as Fab[]);
    },
  });

  const { data: padroes } = useQuery({
    queryKey: ["padroes-fab", fabricanteId],
    enabled: !!fabricanteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("padroes")
        .select("id, nome, categoria, fabricante_id")
        .eq("fabricante_id", fabricanteId)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return sortByNome(data as Pad[]);
    },
  });

  const { data: espessuras } = useQuery({
    queryKey: ["espessuras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("espessuras")
        .select("id, valor_mm")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as Esp[];
    },
  });

  const previousFabricanteId = useRef(fabricanteId);
  useEffect(() => {
    if (previousFabricanteId.current === fabricanteId) return;
    previousFabricanteId.current = fabricanteId;
    setPadraoId("");
  }, [fabricanteId]);

  useEffect(() => {
    const draft: AnunciarDraft = {
      fabricanteId,
      padraoId,
      espessuraMm,
      espessuraOutra,
      form: f,
    };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [espessuraMm, espessuraOutra, f, fabricanteId, padraoId]);
  const padraoSelected = useMemo(
    () => padroes?.find((p) => p.id === padraoId),
    [padroes, padraoId],
  );
  const fabSelected = useMemo(
    () => fabricantes?.find((p) => p.id === fabricanteId),
    [fabricantes, fabricanteId],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fabricanteId || !padraoId || !espessuraMm) {
      toast.error("Selecione fabricante, padrão e espessura.");
      return;
    }
    if (photos.length === 0) {
      toast.error("É necessário adicionar pelo menos uma foto da sobra para publicar o anúncio.");
      return;
    }
    const comprimento = Number(f.comprimento_cm);
    const largura = Number(f.largura_cm);
    if (comprimento > MAX_COMPRIMENTO_CM || largura > MAX_LARGURA_CM) {
      toast.error(`As medidas maximas da chapa sao ${MAX_COMPRIMENTO_CM} x ${MAX_LARGURA_CM} cm.`);
      return;
    }
    // Verificação de limite do plano
    if (submittingRef.current) return;
    submittingRef.current = true;
    let materialId: string | null = null;
    const uploadedPaths: string[] = [];
    try {
      const lim = await checkPlanLimit("anuncios");
      if (!lim.allowed) {
        setUpgradeReason(
          `Você atingiu o limite do plano ${lim.plano} (${lim.atual}/${lim.limite} anúncios ativos). Faça upgrade para publicar mais.`,
        );
        setShowUpgrade(true);
        submittingRef.current = false;
        return;
      }
      setSaving(true);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { data: emp } = await supabase
        .from("empresas")
        .select("id, cidade, estado, latitude, longitude")
        .eq("owner_id", u.user.id)
        .single();
      if (!emp) throw new Error("Cadastre sua empresa primeiro");

      const { data: mat, error } = await supabase
        .from("materiais")
        .insert({
          empresa_id: emp.id,
          fabricante_id: fabricanteId,
          padrao_id: padraoId,
          fabricante: fabSelected?.nome ?? null,
          padrao: padraoSelected?.nome ?? "",
          espessura_mm: Number(espessuraMm),
          comprimento_cm: Number(f.comprimento_cm),
          largura_cm: Number(f.largura_cm),
          quantidade: Number(f.quantidade),
          preco: parsePriceInput(f.preco),
          observacoes: f.observacoes || null,
          cidade: emp.cidade,
          estado: emp.estado,
          latitude: emp.latitude,
          longitude: emp.longitude,
          grain_direction: null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      materialId = mat.id;

      // Upload de fotos (comprimidas) → armazena somente o PATH em fotos_materiais.
      // URLs assinadas curtas são geradas sob demanda na leitura (ver src/lib/material-photos.ts).
      // Estrutura: {empresa_id}/{anuncio_id}/foto-{n}.{ext}
      const rows: {
        material_id: string;
        empresa_id: string;
        url: string;
        ordem: number;
        needs_ai_analysis: boolean;
        ai_status: "pending";
      }[] = [];
      for (let i = 0; i < photos.length; i++) {
        const { blob, ext, mime } = await compressImage(photos[i].file);
        const path = `${emp.id}/${mat.id}/foto-${i + 1}-${Date.now()}.${ext}`;
        const up = await supabase.storage
          .from("materiais")
          .upload(path, blob, { contentType: mime, upsert: false });
        if (up.error) throw up.error;
        uploadedPaths.push(path);
        rows.push({
          material_id: mat.id,
          empresa_id: emp.id,
          url: path,
          ordem: i,
          needs_ai_analysis: true,
          ai_status: "pending",
        });
      }
      if (rows.length === 0) throw new Error("Nenhuma foto foi enviada.");
      const ins = await supabase.from("fotos_materiais").insert(rows as any);
      if (ins.error) throw ins.error;

      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      toast.success("Anúncio publicado!");
      navigate({ to: "/app/estoque" });
    } catch (err: any) {
      if (materialId) {
        if (uploadedPaths.length > 0) {
          await supabase.storage.from("materiais").remove(uploadedPaths);
        }
        await supabase.from("materiais").delete().eq("id", materialId);
      }
      const msg = err?.message || "Erro ao publicar";
      toast.error(
        msg.toLowerCase().includes("imagem") || msg.includes("comprimir")
          ? "Nao foi possivel ler essa imagem. Tente tirar uma foto pela camera ou escolha outra imagem."
          : msg,
      );
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const limiteAnuncios = planStatus?.plano.max_anuncios ?? -1;
  const usoAnuncios = planStatus?.uso.anuncios ?? 0;
  const limiteAtingido = limiteAnuncios !== -1 && usoAnuncios >= limiteAnuncios;

  if (limiteAtingido) {
    return (
      <div className="safe-top px-5 pt-4 pb-10">
        <header className="flex items-center gap-2">
          <Link to="/app" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-black">Anunciar sobra</h1>
          <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
            📦 {usoAnuncios} / {limiteAnuncios}
          </span>
        </header>

        <div className="mt-8 rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-5 text-center shadow-card">
          <div className="text-4xl">🚫</div>
          <h2 className="mt-2 text-base font-black">Limite de anúncios atingido</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Você atingiu o limite do plano <strong>{planStatus?.plano.nome}</strong> ({usoAnuncios}/
            {limiteAnuncios} anúncios ativos). Faça upgrade para publicar mais sobras.
          </p>
          <button
            onClick={() => {
              setUpgradeReason(
                `Você atingiu o limite do plano ${planStatus?.plano.nome} (${usoAnuncios}/${limiteAnuncios} anúncios ativos).`,
              );
              setShowUpgrade(true);
            }}
            className="mt-4 h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground"
          >
            ⬆️ Fazer Upgrade
          </button>
          <Link
            to="/app/estoque"
            className="mt-2 inline-block text-xs font-semibold text-muted-foreground underline"
          >
            Ver meus anúncios
          </Link>
        </div>

        <UpgradeModal
          open={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          currentSlug={planStatus?.plano.slug}
          reason={upgradeReason}
        />
      </div>
    );
  }

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link to="/app" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-black">Anunciar sobra</h1>
        {planStatus && (
          <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
            📦 {planStatus.uso.anuncios}
            {planStatus.plano.max_anuncios === -1 ? " / ∞" : ` / ${planStatus.plano.max_anuncios}`}
          </span>
        )}
      </header>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentSlug={planStatus?.plano.slug}
        reason={upgradeReason}
      />

      <form
        onSubmit={submit}
        onPointerDownCapture={(event) => {
          if (
            priceInputRef.current &&
            document.activeElement === priceInputRef.current &&
            event.target !== priceInputRef.current
          ) {
            finalizePrice();
          }
        }}
        className="mt-5 space-y-5"
      >
        {/* ============ BLOCO: MATERIAL ============ */}
        <Section title="Material">
          {/* Fabricante */}
          <FieldLabel label="Fabricante">
            <button
              type="button"
              onClick={() => setShowFabPicker(true)}
              className={`group flex h-12 w-full items-center justify-between gap-2 rounded-2xl border-2 bg-white px-4 text-sm font-semibold shadow-sm transition hover:border-primary focus:border-primary focus:outline-none active:border-primary ${
                fabSelected ? "border-primary/60 text-foreground" : "border-border text-foreground"
              }`}
            >
              <span className="truncate">
                {fabSelected?.nome ?? (
                  <span className="font-medium text-muted-foreground">Selecione o fabricante</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {fabSelected && (
                  <X
                    className="h-4 w-4 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFabricanteId("");
                    }}
                  />
                )}
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary transition group-hover:bg-primary/10">
                  <ChevronDown className="h-4 w-4 text-foreground" />
                </span>
              </span>
            </button>
          </FieldLabel>

          {/* Padrão */}
          <FieldLabel label="Cor / Padrão">
            <PadraoPicker
              padroes={padroes ?? []}
              value={padraoId}
              onChange={setPadraoId}
              fabricanteNome={fabSelected?.nome ?? ""}
              disabled={!fabricanteId}
            />
          </FieldLabel>

          {/* Espessura */}
          {padraoId && (
            <FieldLabel label="Espessura">
              <div className="grid grid-cols-4 gap-2">
                {(espessuras ?? [])
                  .filter((e) => Number(e.valor_mm) < 30)
                  .map((e) => {
                    const v = Number(e.valor_mm);
                    const active = !espessuraOutra && Number(espessuraMm) === v;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          setEspessuraOutra(false);
                          setEspessuraMm(String(v));
                        }}
                        className={`rounded-xl py-2.5 text-xs font-bold transition ${
                          active
                            ? "bg-primary text-primary-foreground shadow-card"
                            : "bg-card text-foreground ring-1 ring-border"
                        }`}
                      >
                        {v}mm
                      </button>
                    );
                  })}
                <button
                  type="button"
                  onClick={() => {
                    setEspessuraOutra(true);
                    setEspessuraMm("");
                  }}
                  className={`rounded-xl py-2.5 text-xs font-bold transition ${
                    espessuraOutra
                      ? "bg-primary text-primary-foreground shadow-card"
                      : "bg-card text-foreground ring-1 ring-border"
                  }`}
                >
                  Outra
                </button>
              </div>
              {espessuraOutra && (
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  value={espessuraMm}
                  onChange={(e) => setEspessuraMm(e.target.value)}
                  placeholder="Espessura em mm"
                  className={`mt-2 ${inputCls}`}
                />
              )}
            </FieldLabel>
          )}
        </Section>

        {/* ============ BLOCO: DIMENSÕES ============ */}
        {espessuraMm && (
          <Section title="Dimensões">
            <div className="grid grid-cols-2 gap-3">
              <FieldLabel label="Comprimento (cm)">
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_COMPRIMENTO_CM}
                  placeholder={`ex: ${MAX_COMPRIMENTO_CM}`}
                  className={inputCls}
                  value={f.comprimento_cm}
                  onChange={(e) =>
                    setF((s) => ({
                      ...s,
                      comprimento_cm: clampDimensionInput(e.target.value, MAX_COMPRIMENTO_CM),
                    }))
                  }
                />
                <span className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-1 text-[11px] font-black uppercase leading-tight text-primary">
                  Comprimento = sentido do veio
                </span>
              </FieldLabel>
              <FieldLabel label="Largura (cm)">
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_LARGURA_CM}
                  placeholder={`ex: ${MAX_LARGURA_CM}`}
                  className={inputCls}
                  value={f.largura_cm}
                  onChange={(e) =>
                    setF((s) => ({
                      ...s,
                      largura_cm: clampDimensionInput(e.target.value, MAX_LARGURA_CM),
                    }))
                  }
                />
              </FieldLabel>
            </div>
          </Section>
        )}

        {/* ============ BLOCO: VENDA ============ */}
        {espessuraMm && (
          <Section title="Informações da venda">
            <div className="grid grid-cols-2 gap-3">
              <FieldLabel label="Quantidade">
                <input
                  required
                  type="number"
                  min="1"
                  placeholder="1"
                  className={inputCls}
                  value={f.quantidade}
                  onChange={set("quantidade")}
                />
              </FieldLabel>
              <FieldLabel label="Preço total (R$)">
                <input
                  ref={priceInputRef}
                  required
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder="0,00"
                  className={inputCls}
                  value={f.preco}
                  onChange={(e) =>
                    setF((s) => ({ ...s, preco: normalizePriceInput(e.target.value) }))
                  }
                  onBlur={finalizePrice}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
              </FieldLabel>
            </div>
            <FieldLabel label="Observações">
              <textarea
                className={inputCls + " h-24 py-2"}
                value={f.observacoes}
                onChange={set("observacoes")}
                placeholder="Detalhes, defeitos, retirada…"
              />
            </FieldLabel>
          </Section>
        )}

        {/* ============ BLOCO: FOTOS ============ */}
        {espessuraMm && (
          <Section title={`Fotos da sobra · ${photos.length}/${MAX_PHOTOS}`}>
            <p className="-mt-1 text-xs text-muted-foreground">
              Utilize fotos claras e bem iluminadas. Mostre a peça inteira sempre que possível.
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {Array.from({ length: MAX_PHOTOS }).map((_, i) => (
                <PhotoSlot
                  key={i}
                  index={i}
                  item={photoSlots[i] ?? undefined}
                  meta={PHOTO_SLOTS[i]}
                  onAdd={(file) => addPhoto(i, file)}
                  onRemove={() => removePhoto(i)}
                  onMakeMain={() => makeMain(i)}
                />
              ))}
            </div>
            {photos.length === 0 && (
              <p className="text-xs font-semibold text-destructive">
                ⚠ Adicione pelo menos 1 foto para publicar.
              </p>
            )}
          </Section>
        )}

        <button
          disabled={saving || photos.length === 0}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-pop disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Publicar anúncio"}
        </button>
      </form>

      {showFabPicker && (
        <FabricantePicker
          fabricantes={fabricantes ?? []}
          selected={fabricanteId}
          onClose={() => setShowFabPicker(false)}
          onSelect={(id) => {
            setFabricanteId(id);
            setShowFabPicker(false);
          }}
        />
      )}
    </div>
  );
}

function PadraoPicker({
  padroes,
  value,
  onChange,
  fabricanteNome,
  disabled,
}: {
  padroes: Pad[];
  value: string;
  onChange: (id: string) => void;
  fabricanteNome: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = padroes.find((p) => p.id === value);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return padroes;
    return sortByNome(padroes.filter((p) => p.nome.toLowerCase().includes(term)));
  }, [q, padroes]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
        className={`group flex h-14 w-full items-center justify-between gap-2 rounded-2xl border-2 px-4 text-base font-semibold shadow-sm transition hover:border-primary focus:border-primary focus:outline-none active:border-primary ${
          disabled
            ? "cursor-not-allowed border-dashed border-border bg-secondary/40 text-muted-foreground hover:border-border"
            : selected
              ? "border-primary/60 bg-white text-foreground"
              : "border-border bg-white text-foreground"
        }`}
      >
        <span className="truncate">
          {disabled ? (
            "Escolha o fabricante primeiro"
          ) : selected ? (
            <span className="font-semibold">{selected.nome}</span>
          ) : (
            <span className="font-medium text-muted-foreground">Selecionar padrão</span>
          )}
        </span>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${!disabled ? "bg-primary/10 group-hover:bg-primary" : "bg-secondary"}`}
        >
          <ChevronDown
            className={`h-4 w-4 transition ${!disabled ? "text-primary group-hover:text-primary-foreground" : "text-muted-foreground"}`}
          />
        </span>
      </button>

      {open && (
        <Sheet title="Selecionar Cor / Padrão" onClose={() => setOpen(false)}>
          <div className="px-4 pb-2">
            <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Buscar padrão ${fabricanteNome}`}
                className="h-full flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <div
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain pb-2"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum padrão encontrado.
              </p>
            )}
            <div className="space-y-1 px-4">
              {filtered.map((p) => {
                const select = () => {
                  onChange(p.id);
                  setQ("");
                  setOpen(false);
                  toast.success(`Padrão selecionado: ${p.nome}`, { duration: 1000 });
                };
                return (
                  <SheetOptionButton
                    key={p.id}
                    onSelect={select}
                    className={`flex w-full touch-pan-y select-none items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition active:bg-secondary ${
                      value === p.id ? "bg-primary/10 font-bold text-primary" : "hover:bg-secondary"
                    }`}
                  >
                    <span>{p.nome}</span>
                    {value === p.id && <Check className="h-4 w-4" />}
                  </SheetOptionButton>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-12 w-full rounded-xl bg-secondary text-sm font-bold"
            >
              Cancelar
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function FabricantePicker({
  fabricantes,
  selected,
  onClose,
  onSelect,
}: {
  fabricantes: { id: string; nome: string }[];
  selected: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = sortByNome(
    fabricantes.filter((f) => f.nome.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <Sheet title="Selecionar Fabricante" onClose={onClose}>
      <div className="px-4 pb-2">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar fabricante…"
            className="h-full flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>
      <div
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain pb-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {filtered.map((f) => (
          <SheetOptionButton
            key={f.id}
            onSelect={() => onSelect(f.id)}
            className="flex min-h-[56px] w-full touch-pan-y select-none items-center justify-between px-4 py-3 text-left text-sm hover:bg-secondary active:bg-secondary"
          >
            <span className="font-semibold">{f.nome}</span>
            {selected === f.id && <Check className="h-4 w-4 text-primary" />}
          </SheetOptionButton>
        ))}
      </div>
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-xl bg-secondary text-sm font-bold"
        >
          Cancelar
        </button>
      </div>
    </Sheet>
  );
}

const inputCls =
  "h-12 w-full rounded-2xl border-2 border-border bg-white px-4 text-sm font-semibold shadow-sm outline-none transition focus:border-primary";

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-card p-4 ring-1 ring-border">
      <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-primary">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function PhotoSlot({
  index,
  item,
  meta,
  onAdd,
  onRemove,
  onMakeMain,
}: {
  index: number;
  item?: PhotoItem;
  meta: { title: string; hint: string };
  onAdd: (file: File) => void;
  onRemove: () => void;
  onMakeMain: () => void;
}) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [openingMedia, setOpeningMedia] = useState(false);
  const isMain = index === 0;
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const selectedFile = input.files?.[0];
    if (!selectedFile) return;

    setOpeningMedia(true);
    try {
      if (!isLikelyImage(selectedFile)) {
        throw new Error("O arquivo selecionado nao e uma imagem compativel.");
      }
      if (selectedFile.size === 0) {
        throw new Error("A foto ainda nao foi baixada pelo aparelho. Tente selecionar novamente.");
      }
      if (selectedFile.size > MAX_FILE_MB * 1024 * 1024) {
        throw new Error(`Imagem maior que ${MAX_FILE_MB} MB. Escolha outra.`);
      }

      // Alguns WebViews Android entregam um File ligado temporariamente ao content URI.
      // Copiar os bytes antes de limpar o input evita previews vazios em certos aparelhos.
      const bytes = await selectedFile.arrayBuffer();
      const stableFile = new File([bytes], selectedFile.name || `foto-${Date.now()}.jpg`, {
        type: selectedFile.type || "image/jpeg",
        lastModified: selectedFile.lastModified || Date.now(),
      });
      const normalized = await compressImage(stableFile, { maxDim: 2048, quality: 0.9 });
      onAdd(
        new File([normalized.blob], `foto-${Date.now()}.${normalized.ext}`, {
          type: normalized.mime,
          lastModified: Date.now(),
        }),
      );
    } catch (error) {
      console.error("Falha ao preparar imagem selecionada", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Nao foi possivel ler essa foto. Escolha outra imagem.",
      );
    } finally {
      input.value = "";
      setShowSourcePicker(false);
      setOpeningMedia(false);
    }
  };

  const takeNativePhoto = async () => {
    setOpeningMedia(true);
    try {
      const permission = await NativeCamera.requestPermissions({ permissions: ["camera"] });
      if (permission.camera === "denied" || permission.camera === "restricted") {
        toast.error("Permita o acesso a camera nos Ajustes do iPhone para tirar fotos.");
        return;
      }

      const result = await NativeCamera.takePhoto({
        quality: 90,
        targetWidth: 2048,
        targetHeight: 2048,
        correctOrientation: true,
        encodingType: EncodingType.JPEG,
        saveToGallery: false,
        cameraDirection: CameraDirection.Rear,
        presentationStyle: "fullscreen",
        includeMetadata: true,
      });
      onAdd(await mediaResultToFile(result, "camera"));
    } catch (error) {
      if (!cameraActionWasCancelled(error)) {
        console.error("Falha ao capturar foto", error);
        toast.error("Nao foi possivel usar a camera. Verifique a permissao e tente novamente.");
      }
    } finally {
      setOpeningMedia(false);
    }
  };

  const chooseNativePhoto = async () => {
    setOpeningMedia(true);
    try {
      const { results } = await NativeCamera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        limit: 1,
        quality: 90,
        targetWidth: 2048,
        targetHeight: 2048,
        correctOrientation: true,
        presentationStyle: "fullscreen",
        includeMetadata: true,
      });
      const result = results[0];
      if (result) onAdd(await mediaResultToFile(result, "galeria"));
    } catch (error) {
      if (!cameraActionWasCancelled(error)) {
        console.error("Falha ao escolher foto", error);
        toast.error("Nao foi possivel abrir a galeria. Verifique a permissao e tente novamente.");
      }
    } finally {
      setOpeningMedia(false);
    }
  };

  const openCamera = () => {
    setShowSourcePicker(false);
    if (Capacitor.getPlatform() === "ios") {
      void takeNativePhoto();
      return;
    }
    cameraInputRef.current?.click();
  };

  const openGallery = () => {
    setShowSourcePicker(false);
    if (Capacitor.getPlatform() === "ios") {
      void chooseNativePhoto();
      return;
    }
    galleryInputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`relative aspect-square overflow-hidden rounded-2xl border-2 ${
          item ? "border-primary/60" : "border-dashed border-border bg-secondary/40"
        }`}
      >
        {item ? (
          <>
            <img src={item.preview} alt={meta.title} className="h-full w-full object-cover" />
            {isMain && (
              <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
                <Star className="h-3 w-3 fill-current" /> Principal
              </span>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-foreground/70 text-background"
              aria-label="Remover foto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {!isMain && (
              <button
                type="button"
                onClick={onMakeMain}
                className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-lg bg-background/90 px-1.5 py-1 text-[10px] font-bold text-foreground shadow"
              >
                <Star className="h-3 w-3" /> Tornar principal
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => !openingMedia && setShowSourcePicker(true)}
            disabled={openingMedia}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground"
          >
            {openingMedia ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : isMain ? (
              <Camera className="h-6 w-6" />
            ) : (
              <ImagePlus className="h-6 w-6" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {isMain ? "Adicionar" : "Opcional"}
            </span>
          </button>
        )}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
        {showSourcePicker && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/95 p-2">
            <div className="grid w-full gap-2">
              <button
                type="button"
                onClick={openCamera}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground"
              >
                <Camera className="h-4 w-4" /> Camera
              </button>
              <button
                type="button"
                onClick={openGallery}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-secondary text-xs font-bold text-foreground"
              >
                <ImagePlus className="h-4 w-4" /> Galeria
              </button>
              <button
                type="button"
                onClick={() => setShowSourcePicker(false)}
                className="h-8 rounded-lg text-[11px] font-semibold text-muted-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="px-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">
          {meta.title}
        </p>
        <p className="text-[10px] leading-tight text-muted-foreground">{meta.hint}</p>
      </div>
    </div>
  );
}
