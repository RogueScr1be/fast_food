export interface GeoResolution {
  geoBucket: string;
  latitude?: number;
  longitude?: number;
  updatedAt: string;
}

const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function toGeohash(latitude: number, longitude: number, precision = 4): string {
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let bit = 0;
  let ch = 0;
  let evenBit = true;
  let hash = '';

  while (hash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (longitude >= lonMid) {
        ch = (ch << 1) + 1;
        lonMin = lonMid;
      } else {
        ch = ch << 1;
        lonMax = lonMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (latitude >= latMid) {
        ch = (ch << 1) + 1;
        latMin = latMid;
      } else {
        ch = ch << 1;
        latMax = latMid;
      }
    }

    evenBit = !evenBit;

    if (bit < 4) {
      bit += 1;
    } else {
      hash += GEOHASH_BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

function toGeoBucket(latitude: number, longitude: number): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'unknown';
  }
  return `geo:${toGeohash(latitude, longitude, 4)}`;
}

export async function resolveGeoBucket(): Promise<GeoResolution> {
  const now = new Date().toISOString();

  try {
    const Location = await import('expo-location');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return { geoBucket: 'unknown', updatedAt: now };
    }

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,
    });

    const { latitude, longitude } = pos.coords;
    const geoBucket = toGeoBucket(latitude, longitude);

    return {
      geoBucket,
      latitude,
      longitude,
      updatedAt: now,
    };
  } catch {
    return { geoBucket: 'unknown', updatedAt: now };
  }
}
