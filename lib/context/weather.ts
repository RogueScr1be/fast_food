export interface WeatherSnapshot {
  tempC: number | null;
  updatedAt: string;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchWeatherForCoords(
  latitude: number,
  longitude: number,
  timeoutMs = 2500,
): Promise<WeatherSnapshot> {
  const updatedAt = new Date().toISOString();

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`;
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) {
      return { tempC: null, updatedAt };
    }

    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
      };
    };

    const tempC = typeof data.current?.temperature_2m === 'number'
      ? data.current.temperature_2m
      : null;

    return { tempC, updatedAt };
  } catch {
    return { tempC: null, updatedAt };
  }
}
