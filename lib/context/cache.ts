import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Mode, AllergenTag, ConstraintTag } from '../seeds/types';
import type { ContextSignature } from '../decision-core/types';
import { buildContextSignature } from './signature';
import { resolveGeoBucket } from './location';
import { fetchWeatherForCoords } from './weather';
import { featureFlags } from '../runtime/featureFlags';

const STORAGE_KEYS = {
  geo: 'ff:v1:hidden_context:geo',
  weather: 'ff:v1:hidden_context:weather',
} as const;

const WEATHER_TTL_MS = 30 * 60 * 1000;
const WEATHER_STALE_MAX_MS = 24 * 60 * 60 * 1000;

interface GeoCache {
  geoBucket: string;
  latitude?: number;
  longitude?: number;
  updatedAt: string;
}

interface WeatherCache {
  tempC: number | null;
  updatedAt: string;
}

let geoCache: GeoCache = {
  geoBucket: 'unknown',
  updatedAt: new Date(0).toISOString(),
};

let weatherCache: WeatherCache = {
  tempC: null,
  updatedAt: new Date(0).toISOString(),
};

let refreshPromise: Promise<void> | null = null;

function isFresh(iso: string, ttlMs: number): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t <= ttlMs;
}

function isStaleButUsable(iso: string): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t <= WEATHER_STALE_MAX_MS;
}

export function getCurrentContextSignatureSync(
  mode: Mode,
  excludeAllergens: AllergenTag[],
  includeConstraints: ConstraintTag[] = [],
): ContextSignature {
  const freshWeather = isFresh(weatherCache.updatedAt, WEATHER_TTL_MS);
  const staleWeather = !freshWeather && isStaleButUsable(weatherCache.updatedAt);
  const weatherSource = freshWeather ? 'cache' : staleWeather ? 'stale' : 'none';

  return buildContextSignature({
    mode,
    excludeAllergens,
    includeConstraints,
    geoBucket: geoCache.geoBucket,
    tempC: weatherSource === 'none' ? null : weatherCache.tempC,
    weatherSource,
    computedAtIso: new Date().toISOString(),
  });
}

export async function bootstrapHiddenContext(): Promise<void> {
  if (!featureFlags.hiddenContextEnabled) return;

  try {
    const [geoRaw, weatherRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.geo),
      AsyncStorage.getItem(STORAGE_KEYS.weather),
    ]);

    if (geoRaw) {
      const parsed = JSON.parse(geoRaw) as GeoCache;
      if (parsed?.geoBucket) geoCache = parsed;
    }

    if (weatherRaw) {
      const parsed = JSON.parse(weatherRaw) as WeatherCache;
      if (Object.prototype.hasOwnProperty.call(parsed ?? {}, 'tempC')) {
        weatherCache = parsed;
      }
    }
  } catch {
    // Ignore storage failures and keep fallbacks.
  }

  void refreshHiddenContext();
}

export async function refreshHiddenContext(): Promise<void> {
  if (!featureFlags.hiddenContextEnabled) return;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const geo = await resolveGeoBucket();
    geoCache = geo;

    try {
      await AsyncStorage.setItem(STORAGE_KEYS.geo, JSON.stringify(geoCache));
    } catch {
      // Best effort.
    }

    if (
      typeof geo.latitude === 'number' &&
      typeof geo.longitude === 'number' &&
      !isFresh(weatherCache.updatedAt, WEATHER_TTL_MS)
    ) {
      const weather = await fetchWeatherForCoords(geo.latitude, geo.longitude);
      weatherCache = weather;
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.weather, JSON.stringify(weatherCache));
      } catch {
        // Best effort.
      }
    }
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}
