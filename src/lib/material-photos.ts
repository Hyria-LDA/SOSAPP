import { supabase } from "@/integrations/supabase/client";

// fotos_materiais.url historically stored 10-year signed URLs (security risk).
// New rows store only the storage path. These helpers transparently sign paths
// on demand with a short TTL while still rendering legacy full URLs as-is.

const SIGNED_TTL_SECONDS = 60 * 60 * 24; // 24 horas: melhora o reaproveitamento pelo cache

export type FotoRow =
  | { url: string; thumbnail_url?: string | null; ordem: number }
  | null
  | undefined;

function isFullUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

/** Extrai o storage path interno de uma signed URL do bucket `materiais`. */
export function extractMateriaisPath(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(
      /\/storage\/v1\/(?:object|render\/image)\/(?:sign|public)\/materiais\/(.+)$/,
    );
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** Gera uma nova signed URL para um path. Usado em retry quando a anterior expirou. */
export async function resignMateriaisPath(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("materiais")
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    // eslint-disable-next-line no-console
    console.warn("[material-photos] resign failed", { path, error });
    return null;
  }
  return data.signedUrl;
}

export async function signMateriaisPaths(values: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(values.filter(Boolean)));
  const result: Record<string, string> = {};
  const toSign: string[] = [];
  for (const v of unique) {
    if (isFullUrl(v)) result[v] = v;
    else toSign.push(v);
  }
  if (toSign.length > 0) {
    const { data, error } = await supabase.storage
      .from("materiais")
      .createSignedUrls(toSign, SIGNED_TTL_SECONDS);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[material-photos] createSignedUrls failed", { error, toSign });
    }
    (data ?? []).forEach((d: any) => {
      if (d?.path && d?.signedUrl) result[d.path] = d.signedUrl;
      else if (d?.error) {
        // eslint-disable-next-line no-console
        console.warn("[material-photos] sign failed for path", { path: d?.path, error: d.error });
      }
    });
    // Note: paths that failed to sign are intentionally NOT mapped to ""
    // so callers can detect missing entries and render a fallback instead
    // of emitting <img src="">.
  }
  return result;
}

function firstFotoSource(rows: any): { value: string; isThumbnail: boolean } | null {
  const arr = (rows ?? []) as { url: string; thumbnail_url?: string | null; ordem: number }[];
  if (!arr.length) return null;
  const first = [...arr].sort((a, b) => a.ordem - b.ordem)[0];
  if (first?.thumbnail_url) return { value: first.thumbnail_url, isThumbnail: true };
  return first?.url ? { value: first.url, isThumbnail: false } : null;
}

async function signListingFallback(value: string): Promise<string | null> {
  const path = isFullUrl(value) ? extractMateriaisPath(value) : value;
  if (!path) return value;

  const { data, error } = await supabase.storage
    .from("materiais")
    .createSignedUrl(path, SIGNED_TTL_SECONDS, {
      transform: { width: 480, height: 480, resize: "cover", quality: 70 },
    });
  if (!error && data?.signedUrl) return data.signedUrl;

  return resignMateriaisPath(path);
}

/** Attach a `foto` field (signed short-lived URL) to each row from its fotos_materiais. */
export async function attachFirstFoto<T extends { fotos_materiais?: any }>(
  rows: T[] | null | undefined,
): Promise<(T & { foto: string | null })[]> {
  const list = rows ?? [];
  const sources = list.map((r) => firstFotoSource(r.fotos_materiais));
  const thumbnails = sources.filter((source) => source?.isThumbnail).map((source) => source!.value);
  const map = await signMateriaisPaths(thumbnails);

  const fallbackValues = Array.from(
    new Set(
      sources.filter((source) => source && !source.isThumbnail).map((source) => source!.value),
    ),
  );
  await Promise.all(
    fallbackValues.map(async (value) => {
      const signed = await signListingFallback(value);
      if (signed) map[value] = signed;
    }),
  );

  return list.map((r) => {
    const source = firstFotoSource(r.fotos_materiais);
    return { ...r, foto: source ? (map[source.value] ?? null) : null };
  });
}

/** Sign every photo in a single material (preserves order). */
export async function signAllFotos(
  rows: { url: string; ordem: number }[] | null | undefined,
): Promise<{ url: string; ordem: number }[]> {
  const arr = (rows ?? []).slice().sort((a, b) => a.ordem - b.ordem);
  if (!arr.length) return [];
  const map = await signMateriaisPaths(arr.map((r) => r.url));
  return arr
    .map((r) => ({ ordem: r.ordem, url: map[r.url] ?? "" }))
    .filter((r) => r.url.length > 0);
}
