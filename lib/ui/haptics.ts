import * as Haptics from 'expo-haptics';
import { getHapticsEnabled } from '../state/persist';

let hapticsEnabledCache: boolean | null = null;
let hapticsEnabledPromise: Promise<boolean> | null = null;

async function isHapticsEnabled(): Promise<boolean> {
  if (hapticsEnabledCache !== null) return hapticsEnabledCache;
  if (hapticsEnabledPromise) return hapticsEnabledPromise;

  hapticsEnabledPromise = getHapticsEnabled()
    .then((enabled) => {
      hapticsEnabledCache = enabled;
      return enabled;
    })
    .catch(() => {
      hapticsEnabledCache = true;
      return true;
    })
    .finally(() => {
      hapticsEnabledPromise = null;
    });

  return hapticsEnabledPromise;
}

async function runHaptic(fn: () => Promise<void>): Promise<void> {
  try {
    const enabled = await isHapticsEnabled();
    if (!enabled) return;
    await fn();
  } catch {
    // Safe no-op on unsupported platforms or runtime errors.
  }
}

export async function hapticSelection(): Promise<void> {
  await runHaptic(() => Haptics.selectionAsync());
}

export async function hapticImpactLight(): Promise<void> {
  await runHaptic(() =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  );
}

export async function hapticImpactMedium(): Promise<void> {
  await runHaptic(() =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  );
}

export async function hapticSuccess(): Promise<void> {
  await runHaptic(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

export function __resetHapticsCacheForTest(): void {
  hapticsEnabledCache = null;
  hapticsEnabledPromise = null;
}
