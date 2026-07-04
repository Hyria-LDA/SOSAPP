import { supabase } from "@/integrations/supabase/client";

// banners.imagem_url historically stored long-lived signed URLs (security risk).
// New rows store only the storage path. These helpers transparently sign paths
// on demand with a short TTL and pass through legacy full URLs unchanged for
// backwards compatibility until the migration normalizes all rows.

const SIGNED_TTL_SECONDS = 60 * 60; // 1 hour

function isFullUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

/** Extract the storage path from a legacy signed URL, or return the value unchanged if it's already a path. */
export function bannerPath(v: string): string {
  if (!v) return v;
  if (!isFullUrl(v)) return v;
  // Match Supabase signed URL pattern: /storage/v1/object/sign/banners/<path>?token=...
  const m = v.match(/\/storage\/v1\/object\/(?:sign|public)\/banners\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : v;
}

export async function signBannerPaths(values: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(values.filter(Boolean)));
  const result: Record<string, string> = {};
  const toSign: string[] = [];
  for (const v of unique) {
    if (isFullUrl(v)) {
      // Legacy long-lived signed URL: re-sign by path to enforce short TTL.
      const path = bannerPath(v);
      if (path && path !== v) toSign.push(path);
      else result[v] = v; // unrecognized external URL, leave as-is
      // Map original value to the (eventually signed) path result below.
      if (path && path !== v) result[v] = ""; // placeholder, filled after sign
    } else {
      toSign.push(v);
    }
  }
  if (toSign.length > 0) {
    const { data } = await supabase.storage
      .from("banners")
      .createSignedUrls(toSign, SIGNED_TTL_SECONDS);
    const pathToSigned: Record<string, string> = {};
    (data ?? []).forEach((d: any) => {
      if (d?.path && d?.signedUrl) pathToSigned[d.path] = d.signedUrl;
    });
    for (const v of unique) {
      if (isFullUrl(v)) {
        const path = bannerPath(v);
        if (path && path !== v) result[v] = pathToSigned[path] ?? "";
      } else {
        result[v] = pathToSigned[v] ?? "";
      }
    }
  }
  return result;
}

/** Resolve a single banner image value (path or legacy URL) to a short-lived signed URL. */
export async function signBannerImage(value: string): Promise<string> {
  if (!value) return "";
  const map = await signBannerPaths([value]);
  return map[value] ?? "";
}
