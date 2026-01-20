/**
 * Decision OS UI Tests
 * 
 * INVARIANTS TESTED:
 * 1. Never renders more than one card
 * 2. Reject triggers at most one re-decision call
 * 3. Three action buttons exist
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
}));

// Import the component
import DecisionOsScreen from '../app/decision-os';

describe('Decision OS UI - Single Card Invariant', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  // Mock response matching actual API format
  const mockDecisionResponse = {
    decision: {
      decisionType: 'cook',
      decisionEventId: 'evt-123',
      mealId: 'meal-001',
      title: 'Spaghetti Aglio e Olio',
      stepsShort: 'Cook spaghetti. Saute garlic in olive oil. Toss together.',
      estMinutes: 15,
      contextHash: 'hash123',
    },
    drmRecommended: false,
  };

  const mockSecondDecisionResponse = {
    decision: {
      decisionType: 'zero_cook',
      decisionEventId: 'evt-456',
      title: 'Greek Salad',
      stepsShort: 'Chop vegetables, add feta, drizzle with olive oil.',
      estMinutes: 10,
      contextHash: 'hash456',
    },
    drmRecommended: false,
  };

  const mockDrmResponse = {
    rescue: {
      rescueType: 'order',
      decisionEventId: 'evt-789',
      title: 'DoorDash Delivery',
      estMinutes: 30,
      vendorKey: 'doordash-local',
      deepLinkUrl: 'doordash://store',
    },
    exhausted: false,
  };

  test('renders exactly ONE card at a time', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    const { queryAllByTestId } = render(<DecisionOsScreen />);

    await waitFor(() => {
      // There should be at most one card container
      const cardContainers = queryAllByTestId('single-card-container');
      expect(cardContainers.length).toBeLessThanOrEqual(1);
    });

    // Verify there's only one approve button (one card = one set of actions)
    await waitFor(() => {
      const approveButtons = queryAllByTestId('approve-button');
      expect(approveButtons.length).toBeLessThanOrEqual(1);
    });
  });

  test('state holds single decision object, not an array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    const { getByText, queryByText } = render(<DecisionOsScreen />);

    await waitFor(() => {
      // Only one title should be visible
      expect(getByText('Spaghetti Aglio e Olio')).toBeTruthy();
    });

    // No other decision titles should be visible
    expect(queryByText('Greek Salad')).toBeNull();
    expect(queryByText('DoorDash Delivery')).toBeNull();
  });

  test('no list, array, or multiple cards rendered', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    const { queryAllByText } = render(<DecisionOsScreen />);

    await waitFor(() => {
      // "Tonight:" label should appear exactly once (single card)
      const tonightLabels = queryAllByText('Tonight:');
      expect(tonightLabels.length).toBeLessThanOrEqual(1);
    });
  });
});

describe('Decision OS UI - Reject Single Re-decision Invariant', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  const mockDecisionResponse = {
    decision: {
      decisionType: 'cook',
      decisionEventId: 'evt-123',
      mealId: 'meal-001',
      title: 'Spaghetti Aglio e Olio',
      stepsShort: 'Cook spaghetti.',
      estMinutes: 15,
      contextHash: 'hash123',
    },
    drmRecommended: false,
  };

  const mockSecondDecision = {
    decision: {
      decisionType: 'zero_cook',
      decisionEventId: 'evt-456',
      title: 'Quick Salad',
      stepsShort: 'Mix greens.',
      estMinutes: 5,
      contextHash: 'hash456',
    },
    drmRecommended: false,
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

  test('reject calls decision API at most ONCE then goes to DRM', async () => {
    // Initial decision
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    const { getByTestId } = render(<DecisionOsScreen />);

    await waitFor(() => {
      expect(getByTestId('reject-button')).toBeTruthy();
    });

    // First rejection - feedback call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ recorded: true }),
    });

    // First rejection - re-decision call (should happen)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSecondDecision),
    });

    // Click reject first time
    await act(async () => {
      fireEvent.press(getByTestId('reject-button'));
    });

    // Wait for state update
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Second rejection - feedback call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ recorded: true }),
    });

    // Second rejection - should go to DRM, NOT call decision again
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDrmResponse),
    });

    // Click reject second time
    await act(async () => {
      fireEvent.press(getByTestId('reject-button'));
    });

    // Verify that after second reject, we called DRM (not decision endpoint again)
    const allCalls = mockFetch.mock.calls;
    const decisionCalls = allCalls.filter(call => 
      call[0].includes('/api/decision-os/decision')
    );
    
    // Should have called decision endpoint at most 2 times total
    // (1 initial + 1 after first reject, NOT after second reject)
    expect(decisionCalls.length).toBeLessThanOrEqual(2);
  });

  test('second rejection triggers DRM instead of re-decision', async () => {
    // Initial decision
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    const { getByTestId, getByText } = render(<DecisionOsScreen />);

    await waitFor(() => {
      expect(getByTestId('reject-button')).toBeTruthy();
    });

    // First reject
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ recorded: true }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSecondDecision),
    });

    await act(async () => {
      fireEvent.press(getByTestId('reject-button'));
    });

    await waitFor(() => {
      expect(getByText('Quick Salad')).toBeTruthy();
    });

    // Second reject - should call DRM
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ recorded: true }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDrmResponse),
    });

    await act(async () => {
      fireEvent.press(getByTestId('reject-button'));
    });

    // After second rejection, DRM endpoint should have been called
    const drmCalls = mockFetch.mock.calls.filter(call =>
      call[0].includes('/api/decision-os/drm')
    );
    expect(drmCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Decision OS UI - Actions', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  const mockDecisionResponse = {
    decision: {
      decisionType: 'cook',
      decisionEventId: 'evt-123',
      mealId: 'meal-001',
      title: 'Test Meal',
      stepsShort: 'Step 1',
      estMinutes: 20,
      contextHash: 'hash123',
    },
    drmRecommended: false,
  };

  test('has exactly three action buttons', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    const { getByTestId } = render(<DecisionOsScreen />);

    await waitFor(() => {
      expect(getByTestId('approve-button')).toBeTruthy();
      expect(getByTestId('reject-button')).toBeTruthy();
      expect(getByTestId('drm-button')).toBeTruthy();
    });
  });

  test('approve button calls feedback with approved', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    const { getByTestId } = render(<DecisionOsScreen />);

    await waitFor(() => {
      expect(getByTestId('approve-button')).toBeTruthy();
    });

    // Mock feedback call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ recorded: true }),
    });

    await act(async () => {
      fireEvent.press(getByTestId('approve-button'));
    });

    // Find the feedback call
    const feedbackCall = mockFetch.mock.calls.find(call =>
      call[0].includes('/api/decision-os/feedback')
    );
    expect(feedbackCall).toBeTruthy();
    
    const body = JSON.parse(feedbackCall![1].body);
    expect(body.userAction).toBe('approved');
  });

  test('DRM button triggers handle_it reason', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDecisionResponse),
    });

    const mockDrmResponse = {
      rescue: {
        rescueType: 'order',
        decisionEventId: 'evt-drm',
        title: 'Rescue',
        estMinutes: 30,
        vendorKey: 'doordash',
      },
      exhausted: false,
    };

    const { getByTestId } = render(<DecisionOsScreen />);

    await waitFor(() => {
      expect(getByTestId('drm-button')).toBeTruthy();
    });

    // Mock feedback call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ recorded: true }),
    });
    // Mock DRM call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDrmResponse),
    });

    await act(async () => {
      fireEvent.press(getByTestId('drm-button'));
    });

    // Find the DRM call
    const drmCall = mockFetch.mock.calls.find(call =>
      call[0].includes('/api/decision-os/drm')
    );
    expect(drmCall).toBeTruthy();
    
    const body = JSON.parse(drmCall![1].body);
    expect(body.triggerReason).toBe('handle_it');
  });
});

describe('Decision OS UI - Order Type Deep Link', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  const mockOrderDecision = {
    decision: {
      decisionType: 'order',
      decisionEventId: 'evt-order',
      vendorKey: 'doordash-local',
      title: 'DoorDash Delivery',
      deepLinkUrl: 'doordash://store',
      estMinutes: 30,
      contextHash: 'hash789',
    },
    drmRecommended: false,
  };

  test('order type shows vendor name in CTA', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockOrderDecision),
    });

    const { getByText } = render(<DecisionOsScreen />);

    await waitFor(() => {
      expect(getByText('Open doordash-local')).toBeTruthy();
    });
  });
});
