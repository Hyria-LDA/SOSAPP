type StorageScope = { supabaseUrl: string } & (
  | { bucket: "materiais"; companyId: string; materialId: string }
  | { bucket: "logos"; ownerId: string }
);

// Scope IDs must come from authorized database records, never from photo metadata.
export function ownedStoragePath(value: unknown, scope: StorageScope): string | null {
  if (typeof value !== "string" || !value) return null;
  let path = value;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.origin !== new URL(scope.supabaseUrl).origin || url.username || url.password) {
        return null;
      }
      const prefixes = [
        `/storage/v1/object/public/${scope.bucket}/`,
        `/storage/v1/object/sign/${scope.bucket}/`,
        `/storage/v1/render/image/public/${scope.bucket}/`,
        `/storage/v1/render/image/sign/${scope.bucket}/`,
      ];
      const prefix = prefixes.find((candidate) => url.pathname.startsWith(candidate));
      if (!prefix) return null;
      path = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch {
      return null;
    }
  }

  // Reject ambiguous paths instead of normalizing them before privileged deletion.
  if (/[\\%?#:]/.test(path)) return null;
  if (
    [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    return null;
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;

  if (scope.bucket === "materiais") {
    if (parts.length !== 3 || parts[0] !== scope.companyId || parts[1] !== scope.materialId) {
      return null;
    }
  } else if (parts.length !== 2 || parts[0] !== scope.ownerId) {
    return null;
  }

  return path;
}

export function collectOwnedStoragePaths(values: unknown[], scope: StorageScope) {
  const paths = new Set<string>();
  let skipped = 0;
  for (const value of values) {
    if (value == null || value === "") continue;
    const path = ownedStoragePath(value, scope);
    if (path) paths.add(path);
    else skipped += 1;
  }
  return { paths: [...paths], skipped };
}
