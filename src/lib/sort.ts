export function sortByNome<T extends { nome?: string | null }>(items: T[] | null | undefined): T[] {
  return [...(items ?? [])].sort((a, b) =>
    (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR", {
      sensitivity: "base",
      numeric: true,
    }),
  );
}
