import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  storeRpc,
  storeAdminAction,
  dateLabel,
  type StoreListItem,
} from "@/lib/store-portal";
import {
  Panel,
  Field,
  Badge,
  inputClass,
  buttonClass,
  secondaryClass,
} from "./ui";
export function StoreAdminList() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    code: "",
    existing_store_id: "",
  });
  const list = useQuery({
    queryKey: ["store-admin-list"],
    queryFn: () => storeRpc<StoreListItem[]>("store_admin_list"),
  });
  const existing = useQuery({
    queryKey: ["store-unlinked"],
    enabled: show,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banner_empresas" as never)
        .select("id,nome")
        .is("user_id", null);
      if (error) throw error;
      return data as unknown as { id: string; nome: string }[];
    },
  });
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await storeAdminAction({ action: "create", ...form });
      setForm({ ...form, password: "" });
      await qc.invalidateQueries({ queryKey: ["store-admin-list"] });
      window.location.assign(`/app/admin/lojistas?store=${result.store_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar loja.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-24">
      <a href="/app/admin" className="text-sm underline">
        ← Administração
      </a>
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Lojistas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Empresas, contratos de publicidade e aprovação de banners.
          </p>
        </div>
        <button className={buttonClass} onClick={() => setShow(!show)}>
          Criar nova loja
        </button>
      </header>
      {show && (
        <Panel title="Criar acesso exclusivo">
          <form onSubmit={create} className="space-y-4">
            <Field label="Empresa anunciante existente (opcional)">
              <select
                className={inputClass}
                value={form.existing_store_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    existing_store_id: e.target.value,
                    name:
                      existing.data?.find((s) => s.id === e.target.value)
                        ?.nome || form.name,
                  })
                }
              >
                <option value="">Criar nova empresa</option>
                {existing.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["name", "Nome da loja"],
                ["email", "E-mail usado como login"],
                ["password", "Senha inicial (mínimo 12 caracteres)"],
                ["code", "Código exclusivo do link (ex.: LOJA001)"],
              ].map(([k, label]) => (
                <Field key={k} label={label}>
                  <input
                    required
                    className={inputClass}
                    type={
                      k === "password"
                        ? "password"
                        : k === "email"
                          ? "email"
                          : "text"
                    }
                    autoComplete={k === "password" ? "new-password" : "off"}
                    minLength={k === "password" ? 12 : undefined}
                    value={form[k as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              O login pode ser um e-mail interno sem caixa postal. Nesse caso, a
              recuperação de senha é feita pelo administrador. Após criar,
              complete o perfil e o contrato.
            </p>
            <button disabled={busy} className={buttonClass}>
              {busy ? "Criando…" : "Criar acesso"}
            </button>
          </form>
        </Panel>
      )}
      <input
        aria-label="Buscar loja"
        placeholder="Buscar loja, responsável ou cidade…"
        className={inputClass}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {list.isPending && <p>Carregando lojas…</p>}
      {list.error && (
        <Panel>
          <p>{list.error.message}</p>
          <button
            className={secondaryClass}
            onClick={() => void list.refetch()}
          >
            Tentar novamente
          </button>
        </Panel>
      )}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary">
            <tr>
              {[
                "Loja / responsável",
                "Cidade / UF",
                "Contrato / segmento",
                "Período",
                "Banners",
                "Cliques",
                "Status",
                "",
              ].map((v, i) => (
                <th key={i} className="p-3">
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.data
              ?.filter((s) =>
                `${s.nome} ${s.profile.responsible_name || ""} ${s.profile.city || ""}`
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()),
              )
              .map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="p-3">
                    <strong>{s.nome}</strong>
                    <p className="text-xs text-muted-foreground">
                      {s.profile.responsible_name || "—"}
                    </p>
                  </td>
                  <td className="p-3">
                    {s.profile.city || "—"} / {s.profile.state || "—"}
                  </td>
                  <td className="p-3">
                    {s.contract?.name || "Sem contrato"}
                    <p className="text-xs">{s.contract?.segment}</p>
                    {s.contract && (
                      <Badge status={s.contract.effective_status} />
                    )}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {s.contract
                      ? `${dateLabel(s.contract.start_date)} — ${dateLabel(s.contract.end_date)}`
                      : "—"}
                  </td>
                  <td className="p-3">{s.banner_count}</td>
                  <td className="p-3">{s.metrics.clicks}</td>
                  <td className="p-3">
                    <Badge status={s.status} />
                  </td>
                  <td className="p-3">
                    <a
                      href={`/app/admin/lojistas?store=${s.id}`}
                      className="font-bold text-primary underline"
                    >
                      Abrir empresa
                    </a>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {list.data?.length === 0 && (
          <p className="p-6 text-muted-foreground">
            Nenhuma loja com acesso ao portal. Crie a primeira acima.
          </p>
        )}
      </div>
    </main>
  );
}
