jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('../../state/persist', () => ({
  getHapticsEnabled: jest.fn(),
}));

import * as ExpoHaptics from 'expo-haptics';
import { getHapticsEnabled } from '../../state/persist';
import {
  hapticSelection,
  hapticImpactLight,
  hapticImpactMedium,
  hapticSuccess,
  __resetHapticsCacheForTest,
} from '../haptics';

const mockedGetHapticsEnabled = getHapticsEnabled as jest.MockedFunction<typeof getHapticsEnabled>;

describe('lib/ui/haptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetHapticsCacheForTest();
    mockedGetHapticsEnabled.mockResolvedValue(true);
  });

  it('no-ops when haptics are disabled', async () => {
    mockedGetHapticsEnabled.mockResolvedValue(false);

    await hapticSelection();
    await hapticImpactLight();
    await hapticImpactMedium();
    await hapticSuccess();

    expect(ExpoHaptics.selectionAsync).not.toHaveBeenCalled();
    expect(ExpoHaptics.impactAsync).not.toHaveBeenCalled();
    expect(ExpoHaptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('maps subtle profile methods to expo-haptics APIs', async () => {
    await hapticSelection();
    await hapticImpactLight();
    await hapticImpactMedium();
    await hapticSuccess();

    expect(ExpoHaptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(ExpoHaptics.impactAsync).toHaveBeenNthCalledWith(
      1,
      (ExpoHaptics as any).ImpactFeedbackStyle.Light,
    );
    expect(ExpoHaptics.impactAsync).toHaveBeenNthCalledWith(
      2,
      (ExpoHaptics as any).ImpactFeedbackStyle.Medium,
    );
    expect(ExpoHaptics.notificationAsync).toHaveBeenCalledWith(
      (ExpoHaptics as any).NotificationFeedbackType.Success,
    );
  });
});
