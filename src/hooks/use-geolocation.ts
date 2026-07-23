import { useEffect, useState } from "react";

const KEY = "sos:lastLocation";

export type Coords = { lat: number; lng: number };

function normalizeCoords(value: unknown): Coords | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as { lat?: unknown; lng?: unknown };
  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

export function getCachedLocation(): Coords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const coords = normalizeCoords(JSON.parse(raw));
    if (!coords) localStorage.removeItem(KEY);
    return coords;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

export function useGeolocation() {
  const [coords, setCoords] = useState<Coords | null>(() => getCachedLocation());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const request = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocalização não suportada");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        try {
          localStorage.setItem(KEY, JSON.stringify(c));
        } catch {
          // A localizacao atual continua valida mesmo se o cache estiver indisponivel.
        }
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  };

  useEffect(() => {
    if (!coords) request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { coords, error, loading, request };
}
