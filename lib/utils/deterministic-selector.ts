import seedrandom from 'seedrandom';

/**
 * Generate a seeded random number from a string key.
 * Same key always produces same sequence.
 */
export function getDailySeed(userId: string, dateYYYYMMDD: string): number {
  const seed = `${userId}:${dateYYYYMMDD}`;
  const rng = seedrandom(seed);
  return rng();
}

/**
 * Select a deterministic item from an array based on seed key.
 * Same key always returns same item.
 * If array is empty, returns null.
 */
export function selectDeterministicItem<T>(
  items: T[],
  seedKey: string
): T | null {
  if (items.length === 0) return null;

  const rng = seedrandom(seedKey);
  const randomValue = rng();
  const index = Math.floor(randomValue * items.length);

  return items[index] ?? null;
}

/**
 * Hash a string to a number for use as a seed.
 * Simple but deterministic.
 */
export function hashToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get deterministic index in array based on seed.
 * Same seed always returns same index.
 */
export function getDeterministicIndex(
  arrayLength: number,
  seedKey: string
): number {
  if (arrayLength === 0) return -1;
  const rng = seedrandom(seedKey);
  return Math.floor(rng() * arrayLength);
}

/**
 * Get deterministic string from array based on seed.
 * Useful for "why" copy selection.
 */
export function getDeterministicString(
  strings: string[],
  seedKey: string
): string | null {
  const index = getDeterministicIndex(strings.length, seedKey);
  return index >= 0 ? strings[index] : null;
}
