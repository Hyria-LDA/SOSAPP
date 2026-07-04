import { grainArrow, type Grain } from "@/lib/grain";

/** Selo compacto usado nos cards de busca: 🌲 ↕ 18mm */
export function GrainBadge({ grain, espessura }: { grain: Grain; espessura?: number | string }) {
  if (!grain) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">
      <span aria-hidden>🌲</span>
      <span aria-hidden>{grainArrow(grain)}</span>
      {espessura != null && <span>{Number(espessura)}mm</span>}
    </span>
  );
}

/** Representação técnica da chapa, usada apenas na tela de detalhes */
export function GrainBoard({ grain }: { grain: Grain }) {
  if (!grain) return null;
  const vertical = grain === "vertical";
  const arrows = vertical ? "↑" : "→";
  const rows = 4;
  const cols = 8;
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div
        className="grid gap-1 rounded-xl bg-secondary p-3 text-center text-xs font-bold text-accent"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows * cols }).map((_, i) => (
          <span key={i} className="leading-none">
            {arrows}
          </span>
        ))}
      </div>
    </div>
  );
}
