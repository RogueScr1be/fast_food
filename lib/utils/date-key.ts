/**
 * Get today's date as YYYY-MM-DD string.
 * Always uses device local date (no timezone conversion).
 */
export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Create a deterministic seed key from user ID and date.
 * Same userId + date always produces same key.
 * Different dates produce different keys (allows rotation).
 */
export function createDailySeedKey(userId: string, dateYYYYMMDD: string): string {
  return `${userId}:${dateYYYYMMDD}`;
}

/**
 * Get seed key for today using provided userId.
 */
export function getTodaySeedKey(userId: string): string {
  return createDailySeedKey(userId, getTodayDateKey());
}

/**
 * Parse date string back to components.
 * Returns { year, month, day } or null if invalid.
 */
export function parseDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10),
  };
}

/**
 * Check if date is today.
 */
export function isToday(dateYYYYMMDD: string): boolean {
  return dateYYYYMMDD === getTodayDateKey();
}

/**
 * Get date N days ago.
 */
export function getDateNDaysAgo(daysAgo: number): string {
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get all dates in a range (inclusive).
 * E.g., last 7 days from today.
 */
export function getDateRange(daysBack: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < daysBack; i++) {
    dates.push(getDateNDaysAgo(i));
  }
  return dates;
}
