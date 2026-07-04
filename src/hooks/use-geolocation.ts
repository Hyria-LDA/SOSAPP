import { useEffect, useState } from "react";

const KEY = "sos:lastLocation";

export type Coords = { lat: number; lng: number };

export function getCachedLocation(): Coords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Coords) : null;
  } catch {
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
        localStorage.setItem(KEY, JSON.stringify(c));
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
