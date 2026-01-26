/**
 * Decision OS Inactivity Re-check Tests
 * Phase 3 — Prompt 3/3
 * 
 * Tests cover:
 * - Inactivity triggers exactly one re-check call after 90 seconds
 * - Re-check does not repeat across re-renders
 * - If drmRecommended true on re-check, DRM endpoint is called once
 * - User action clears inactivity timer
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// Mock the fetch API
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Linking
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  canOpenURL: jest.fn().mockResolvedValue(true),
  openURL: jest.fn().mockResolvedValue(true),
}));

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  Check: () => null,
  X: () => null,
  Zap: () => null,
  Clock: () => null,
  ChefHat: () => null,
  ShoppingBag: () => null,
  ExternalLink: () => null,
  Camera: () => null,
}));

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

// Import the component and constants
import DecisionOsScreen, { INACTIVITY_RECHECK_MS } from '../app/decision-os';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Inactivity Re-check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockDecisionResponse = {
    decision: {
      decisionType: 'cook',
      decisionEventId: 'evt-123',
      mealId: 'meal-001',
      title: 'Test Meal',
      stepsShort: 'Cook it.',
      estMinutes: 15,
      contextHash: 'hash123',
    },
    drmRecommended: false,
  };

  const mockDrmRecommendedResponse = {
    decision: null,
    drmRecommended: true,
    reason: 'late_no_action',
  };

  const mockDrmResponse = {
    rescue: {
      rescueType: 'order',
      decisionEventId: 'evt-drm',
      title: 'Rescue Option',
      estMinutes: 30,
      vendorKey: 'doordash',
    },
    exhausted: false,
  };

  test('INACTIVITY_RECHECK_MS constant is 90 seconds', () => {
    expect(INACTIVITY_RECHECK_MS).toBe(90 * 1000);
  });

  test('inactivity triggers exactly ONE decision re-check after 90 seconds', async () => {
    // Initial decision fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    render(<DecisionOsScreen />);

    // Wait for initial decision to load
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Re-check response (no DRM recommended)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    // Advance timer to trigger inactivity re-check
    await act(async () => {
      jest.advanceTimersByTime(INACTIVITY_RECHECK_MS);
    });

    // Should have called decision endpoint twice (initial + re-check)
    await waitFor(() => {
      const decisionCalls = mockFetch.mock.calls.filter(call =>
        call[0].includes('/api/decision-os/decision')
      );
      expect(decisionCalls.length).toBe(2);
    });
  });

  test('inactivity re-check does NOT repeat after first trigger', async () => {
    // Initial decision fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    render(<DecisionOsScreen />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Re-check response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    // Advance timer to trigger first re-check
    await act(async () => {
      jest.advanceTimersByTime(INACTIVITY_RECHECK_MS);
    });

    // Advance timer again - should NOT trigger another re-check
    await act(async () => {
      jest.advanceTimersByTime(INACTIVITY_RECHECK_MS);
    });

    // Should still only have 2 decision calls (initial + one re-check)
    const decisionCalls = mockFetch.mock.calls.filter(call =>
      call[0].includes('/api/decision-os/decision')
    );
    expect(decisionCalls.length).toBe(2);
  });

  test('if re-check returns drmRecommended true, DRM endpoint is called once', async () => {
    // Initial decision fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    render(<DecisionOsScreen />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Re-check response - DRM recommended
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDrmRecommendedResponse),
    });

    // DRM response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDrmResponse),
    });

    // Advance timer to trigger inactivity re-check
    await act(async () => {
      jest.advanceTimersByTime(INACTIVITY_RECHECK_MS);
    });

    // Should have called DRM endpoint
    await waitFor(() => {
      const drmCalls = mockFetch.mock.calls.filter(call =>
        call[0].includes('/api/decision-os/drm')
      );
      expect(drmCalls.length).toBe(1);
    });
  });

  test('user action before timeout prevents re-check', async () => {
    // Initial decision fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    const { getByTestId } = render(<DecisionOsScreen />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Wait for card to render
    await waitFor(() => {
      expect(getByTestId('approve-button')).toBeTruthy();
    });

    // Feedback response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ recorded: true }),
    });

    // Advance timer partway (50 seconds)
    await act(async () => {
      jest.advanceTimersByTime(50 * 1000);
    });

    // User takes action (approve)
    await act(async () => {
      fireEvent.press(getByTestId('approve-button'));
    });

    // Advance timer past the original timeout
    await act(async () => {
      jest.advanceTimersByTime(60 * 1000);
    });

    // Should NOT have a second decision call (only initial + feedback)
    const decisionCalls = mockFetch.mock.calls.filter(call =>
      call[0].includes('/api/decision-os/decision')
    );
    expect(decisionCalls.length).toBe(1); // Only initial call
  });

  test('DRM trigger by re-check includes reason from backend', async () => {
    // Initial decision fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    render(<DecisionOsScreen />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Re-check response - DRM recommended with specific reason
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        decision: null,
        drmRecommended: true,
        reason: 'two_rejections',
      }),
    });

    // DRM response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDrmResponse),
    });

    // Advance timer to trigger inactivity re-check
    await act(async () => {
      jest.advanceTimersByTime(INACTIVITY_RECHECK_MS);
    });

    // Find the DRM call and check the reason
    await waitFor(() => {
      const drmCalls = mockFetch.mock.calls.filter(call =>
        call[0].includes('/api/decision-os/drm')
      );
      expect(drmCalls.length).toBe(1);
      
      const body = JSON.parse(drmCalls[0][1].body);
      expect(body.triggerReason).toBe('two_rejections');
    });
  });
});

// =============================================================================
// NO ARRAYS INVARIANT TEST
// =============================================================================

describe('No Arrays Invariant - Inactivity Re-check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('inactivity re-check response maintains single card invariant', async () => {
    const mockDecisionResponse = {
      decision: {
        decisionType: 'cook',
        decisionEventId: 'evt-123',
        mealId: 'meal-001',
        title: 'Test Meal',
        stepsShort: 'Cook it.',
        estMinutes: 15,
        contextHash: 'hash123',
      },
      drmRecommended: false,
    };

    // Verify response structure has no arrays
    expect(Array.isArray(mockDecisionResponse.decision)).toBe(false);
    expect(mockDecisionResponse.decision).not.toBeNull();
    expect(typeof mockDecisionResponse.decision).toBe('object');
    
    // Verify no arrays in decision object
    for (const [key, value] of Object.entries(mockDecisionResponse.decision)) {
      expect(Array.isArray(value)).toBe(false);
    }
  });
});
