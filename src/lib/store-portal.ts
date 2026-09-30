import { supabase } from "@/integrations/supabase/client";
export type Store = {
  id: string;
  nome: string;
  login: string;
  status: string;
  created_at: string;
  editable_fields: string[];
  profile: Record<string, string>;
};
export type Metrics = {
  clicks: number;
  today: number;
  last7: number;
  last30: number;
  registrations: number;
  completed: number;
  publishers: number;
  subscriptions: number;
  daily: { date: string; clicks: number; registrations: number }[];
};
export type Week = {
  number: number;
  start_date: string;
  end_date: string;
  used: number;
};
export type Contract = {
  id: string;
  store_id: string;
  name: string;
  start_date: string;
  end_date: string;
  segment: string;
  region: string;
  cities: string[];
  states: string[];
  banners_per_week: number;
  status: string;
  effective_status: string;
  notes: string;
  weeks: Week[];
  metrics: Metrics;
};
export type StoreBanner = {
  id: string;
  contract_id: string;
  week_number: number;
  title: string;
  destination_url: string;
  image_path: string;
  start_date: string;
  end_date: string;
  segment: string;
  region: string;
  cities: string[];
  states: string[];
  format: string;
  approval: string;
  submitted: boolean;
  effective_status: string;
  rejection_reason: string | null;
  views: number;
  clicks: number;
  approved_at: string | null;
};
export type Snapshot = {
  store: Store;
  today: string;
  admin: boolean;
  code: string;
  metrics: Metrics;
  contracts: Contract[];
  banners: StoreBanner[];
  history: {
    id: string;
    action: string;
    created_at: string;
    snapshot: StoreBanner;
  }[];
};
export type StoreListItem = Store & {
  metrics: Metrics;
  contract: Contract | null;
  banner_count: number;
};
// RPCs da migração nova: manter tipagem na fronteira até regenerar os tipos do Supabase.
export async function storeRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}
export async function storeAdminAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("store-admin", {
    body,
  });
  if (error) {
    let message = error.message;
    try {
      message = (await error.context.json()).error || message;
    } catch {
      /* erro sem corpo */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as { store_id: string };
}
export async function requireStoreRole(adminOnly = false) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { user: null, allowed: false, admin: false };
  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (roleError)
    throw new Error("Não foi possível verificar seu acesso. Tente novamente.");
  const values = (roles ?? []).map((r) => String(r.role));
  const admin = values.includes("admin");
  return {
    user: data.user,
    admin,
    allowed: admin || (!adminOnly && values.includes("store_partner")),
  };
}
export const profileFields: Record<string, string> = {
  legal_name: "Razão social",
  cnpj: "CNPJ",
  responsible_name: "Responsável",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  city: "Cidade",
  state: "Estado (UF)",
  website: "Site",
  instagram: "Instagram",
  logo_path: "Logo",
};
export const statusNames: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  waiting: "Aguardando início",
  ended: "Encerrado",
  suspended: "Suspenso",
  cancelled: "Cancelado",
  enabled: "Automático pelas datas",
  draft: "Envio incompleto",
  pending: "Aguardando aprovação",
  approved: "Aprovado",
  scheduled: "Programado",
  published: "Publicado",
  rejected: "Reprovado",
  expired: "Expirado",
};
export const dateLabel = (s: string) =>
  s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
export const splitPlaces = (s: string) =>
  s
    .split(/[;\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
export function imageExtension(file: File) {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("A imagem deve ter até 10 MB.");
  const ext = (
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<
      string,
      string
    >
  )[file.type];
  if (!ext) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  return ext;
}
