import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { statusNames } from "@/lib/store-portal";
export const inputClass =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm disabled:opacity-60";
export const buttonClass =
  "rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50";
export const secondaryClass =
  "rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
export function Panel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      {title && <h2 className="mb-4 text-lg font-bold">{title}</h2>}
      {children}
    </section>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${["active", "published", "approved"].includes(status) ? "bg-emerald-100 text-emerald-900" : ["rejected", "inactive", "suspended", "cancelled"].includes(status) ? "bg-red-100 text-red-900" : "bg-secondary text-secondary-foreground"}`}
    >
      {statusNames[status] || status}
    </span>
  );
}
export function Stats({ items }: { items: [string, string | number][] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-border bg-card p-4"
        >
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-2xl font-black">{value}</p>
        </div>
      ))}
    </div>
  );
}
export function StoreImage({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    setUrl("");
    if (path)
      supabase.storage
        .from("store-media")
        .createSignedUrl(path, 300)
        .then(({ data }) => {
          if (live) setUrl(data?.signedUrl || "");
        });
    return () => {
      live = false;
    };
  }, [path]);
  return url ? (
    <img
      src={url}
      alt="Arte enviada pela empresa"
      className="max-h-64 w-full rounded-xl bg-secondary object-contain"
    />
  ) : (
    <div className="rounded-xl bg-secondary p-6 text-center text-sm text-muted-foreground">
      Imagem indisponível
    </div>
  );
}
