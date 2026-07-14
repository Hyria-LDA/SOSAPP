type Props = {
  plano_slug?: string | null;
  plano_vigente?: boolean | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
};

export function isBrilhante(plano_slug?: string | null, plano_vigente?: boolean | null) {
  return plano_slug === "premium" && plano_vigente !== false;
}

function effectiveSlug(plano_slug?: string | null, plano_vigente?: boolean | null) {
  return plano_vigente === false ? "free" : (plano_slug ?? "free");
}

export function CrownBadge({ plano_slug, plano_vigente, size = "md", className = "" }: Props) {
  if (!isBrilhante(plano_slug, plano_vigente)) return null;
  const sz = size === "sm" ? "text-sm" : size === "lg" ? "text-lg" : "text-base";
  return (
    <span
      aria-label="Empresa Brilhante"
      title="Empresa Brilhante — Parceiro Premium SOS Marceneiros"
      className={`inline-flex shrink-0 leading-none ${sz} ${className}`}
    >
      👑
    </span>
  );
}

export function BrilhanteSelo({ plano_slug, plano_vigente, className = "" }: Props) {
  if (!isBrilhante(plano_slug, plano_vigente)) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-900 ring-1 ring-yellow-300 ${className}`}
    >
      <span aria-hidden>👑</span>
      Brilhante
    </span>
  );
}

const planStyles: Record<string, string> = {
  premium:
    "bg-yellow-100 text-yellow-900 ring-yellow-300",
  ultra:
    "bg-purple-100 text-purple-900 ring-purple-300",
  tx:
    "bg-blue-100 text-blue-900 ring-blue-300",
  free:
    "bg-emerald-100 text-emerald-900 ring-emerald-300",
};

const planLabels: Record<string, string> = {
  premium: "Brilhante",
  ultra: "Ultra",
  tx: "TX",
  free: "Free",
};

export function PlanoBadge({ plano_slug, plano_vigente, className = "" }: Props) {
  const slug = effectiveSlug(plano_slug, plano_vigente);
  const label = planLabels[slug] ?? "Free";
  const styles = planStyles[slug] ?? planStyles.free;
  const icon = slug === "premium" ? "👑" : null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${styles} ${className}`}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {label}
    </span>
  );
}
