import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Read until an empty page: the server may enforce a smaller limit than requested.
export async function loadCompanyMaterialCounts(client: SupabaseClient<Database>, signal?: AbortSignal) {
  const counts: Record<string, { ativos: number; total: number }> = {};
  let cursor: string | undefined;
  for (;;) {
    let query = client.from("materiais").select("id,empresa_id,status").order("id").limit(500);
    if (cursor) query = query.gt("id", cursor);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    for (const material of data) {
      const count = (counts[material.empresa_id] ??= { ativos: 0, total: 0 });
      count.total++;
      if (material.status === "ativo") count.ativos++;
    }
    cursor = data[data.length - 1].id;
  }
  return counts;
}
