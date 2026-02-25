/**
 * Runtime feature flags for the local-first learning loop.
 * Defaults keep the new path enabled while allowing safe rollback.
 */

function envTrue(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function envTrueEither(primary: string, secondary: string, fallback: boolean): boolean {
  const hasPrimary = process.env[primary] !== undefined;
  if (hasPrimary) return envTrue(primary, fallback);
  return envTrue(secondary, fallback);
}

export const featureFlags = {
  localDeciderEnabled: envTrueEither(
    'EXPO_PUBLIC_LOCAL_DECIDER_V1',
    'EXPO_PUBLIC_LOCAL_DECIDER_ENABLED',
    true,
  ),
  hiddenContextEnabled: envTrue('EXPO_PUBLIC_HIDDEN_CONTEXT_ENABLED', true),
  learningSyncEnabled: envTrueEither(
    'EXPO_PUBLIC_LEARNING_SYNC_V1',
    'EXPO_PUBLIC_LEARNING_SYNC_ENABLED',
    true,
  ),
  weightUpdatesEnabled: envTrue('EXPO_PUBLIC_WEIGHT_UPDATES_V1', true),
} as const;
