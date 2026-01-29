/**
 * Jest Global Setup
 * 
 * Configures global mocks for React Native modules that require
 * a native environment (like AsyncStorage).
 */

// Mock AsyncStorage globally to prevent "window is not defined" errors
// in tests that import modules that use AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
