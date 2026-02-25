import type { AllergenTag, ConstraintTag, Mode } from '../seeds/types';
import type {
  ContextSignature,
  EnergyState,
  HourBlock,
  Season,
  TempBucket,
  WeatherSource,
} from '../decision-core/types';

export function getHourBlock(date: Date): HourBlock {
  const hour = date.getHours();
  if (hour < 11) return 'morning';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'late';
}

export function getSeason(date: Date): Season {
  const month = date.getMonth() + 1;
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'fall';
}

export function getTempBucket(tempC: number | null | undefined): TempBucket {
  if (tempC === null || tempC === undefined || Number.isNaN(tempC)) return 'unknown';
  if (tempC < 10) return 'cold';
  if (tempC <= 27) return 'mild';
  return 'hot';
}

function sanitizeGeoBucket(raw: string | null | undefined): string {
  if (!raw) return 'unknown';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

export interface BuildContextSignatureInput {
  now?: Date;
  mode: Mode;
  excludeAllergens: AllergenTag[];
  includeConstraints?: ConstraintTag[];
  geoBucket?: string | null;
  tempC?: number | null;
  energy?: EnergyState;
  weatherSource?: WeatherSource;
  computedAtIso?: string;
}

export function buildContextSignature(input: BuildContextSignatureInput): ContextSignature {
  const now = input.now ?? new Date();
  const weekday = now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  return {
    v: 1,
    weekday,
    hour_block: getHourBlock(now),
    season: getSeason(now),
    temp_bucket: getTempBucket(input.tempC),
    geo_bucket: sanitizeGeoBucket(input.geoBucket),
    energy: input.energy ?? 'unknown',
    weather_source: input.weatherSource ?? 'none',
    computed_at: input.computedAtIso ?? now.toISOString(),
    mode: input.mode,
    constraints: {
      exclude_allergens: [...input.excludeAllergens],
      include_constraints: [...(input.includeConstraints ?? [])],
    },
  };
}
