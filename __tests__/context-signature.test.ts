import {
  buildContextSignature,
  getHourBlock,
  getSeason,
  getTempBucket,
} from '../lib/context/signature';

describe('context signature', () => {
  test('derives stable buckets from date and temp', () => {
    const d = new Date('2026-01-14T19:30:00.000Z');
    const sig = buildContextSignature({
      now: d,
      mode: 'easy',
      excludeAllergens: ['nuts'],
      includeConstraints: ['15_min'],
      geoBucket: 'US-Metro:Houston',
      tempC: 4,
    });

    expect(sig.v).toBe(1);
    expect(sig.weekday).toBe(d.getDay());
    expect(sig.hour_block).toBe(getHourBlock(d));
    expect(sig.season).toBe(getSeason(d));
    expect(sig.temp_bucket).toBe('cold');
    expect(sig.geo_bucket).toBe('us-metro:houston');
    expect(sig.energy).toBe('unknown');
    expect(sig.weather_source).toBe('none');
    expect(sig.computed_at).toBe(d.toISOString());
    expect(sig.constraints.exclude_allergens).toEqual(['nuts']);
    expect(sig.constraints.include_constraints).toEqual(['15_min']);
  });

  test('falls back to unknown temp bucket when weather is unavailable', () => {
    expect(getTempBucket(null)).toBe('unknown');
    expect(getTempBucket(undefined)).toBe('unknown');
    expect(getTempBucket(Number.NaN)).toBe('unknown');
  });
});
