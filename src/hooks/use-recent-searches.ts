import { useCallback, useEffect, useState } from "react";

export type RecentSearch = {
  label: string;
  params: {
    q?: string;
    padrao_id?: string;
    fabricante_id?: string;
    espessuras?: string;
  };
  ts: number;
};

const KEY = "sos:recent-searches";
const MAX = 6;

function read(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function useRecentSearches() {
  const [items, setItems] = useState<RecentSearch[]>([]);

  useEffect(() => {
    setItems(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setItems(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(KEY);
    setItems([]);
  }, []);

  return { items, clear };
}

export function pushRecentSearch(entry: Omit<RecentSearch, "ts">) {
  if (!entry.label?.trim()) return;
  const label = entry.label.trim();
  const current = read().filter((s) => s.label.toLowerCase() !== label.toLowerCase());
  const next: RecentSearch[] = [{ ...entry, label, ts: Date.now() }, ...current].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
