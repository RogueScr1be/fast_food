import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  AUDIO_MUTED: 'ff_audio_muted',
  AUDIO_THEME: 'ff_audio_theme',
  USER_PREFERENCES: 'ff_user_preferences',
};

export async function getAudioMutedState(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEYS.AUDIO_MUTED);
    return value === 'true';
  } catch (error) {
    console.error('Error reading muted state:', error);
    return false;
  }
}

export async function setAudioMutedState(muted: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.AUDIO_MUTED, String(muted));
  } catch (error) {
    console.error('Error saving muted state:', error);
  }
}

export async function getAudioTheme(): Promise<string> {
  try {
    const value = await AsyncStorage.getItem(KEYS.AUDIO_THEME);
    return value || 'calm-piano';
  } catch (error) {
    console.error('Error reading audio theme:', error);
    return 'calm-piano';
  }
}

export async function setAudioTheme(theme: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.AUDIO_THEME, theme);
  } catch (error) {
    console.error('Error saving audio theme:', error);
  }
}

export async function getUserPreferences(): Promise<{
  allergens: string[];
  constraints: string[];
}> {
  try {
    const value = await AsyncStorage.getItem(KEYS.USER_PREFERENCES);
    return value
      ? JSON.parse(value)
      : { allergens: [], constraints: [] };
  } catch (error) {
    console.error('Error reading user preferences:', error);
    return { allergens: [], constraints: [] };
  }
}

export async function setUserPreferences(prefs: {
  allergens: string[];
  constraints: string[];
}): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.USER_PREFERENCES, JSON.stringify(prefs));
  } catch (error) {
    console.error('Error saving user preferences:', error);
  }
}
