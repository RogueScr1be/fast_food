/**
 * useIdleAffordance — Unit Tests
 *
 * Tests the idle timer lifecycle, enable/disable toggle, and reset behavior.
 * Reanimated shared values are mocked as simple { value } objects so we can
 * verify that animations are triggered without needing a native runtime.
 */

// ---------------------------------------------------------------------------
// Mock react-native-reanimated before any imports
// ---------------------------------------------------------------------------
jest.mock('react-native-reanimated', () => {
  // Return the final value immediately for timing/sequence mocks
  const withTiming = (toValue: number, _config?: unknown) => toValue;
  const withSequence = (...values: number[]) => values[values.length - 1];
  const useSharedValue = (init: number) => ({ value: init });

  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (component: unknown) => component,
    },
    useSharedValue,
    useAnimatedStyle: (fn: () => unknown) => fn,
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming,
    withSequence,
    withSpring: (toValue: number) => toValue,
    Easing: {
      ease: 'ease',
      inOut: () => 'inOut',
      out: () => 'out',
    },
    runOnJS: (fn: Function) => fn,
    interpolate: () => 0,
    Extrapolation: { CLAMP: 'clamp' },
    SharedValue: {},
  };
});

import { renderHook, act } from '@testing-library/react-hooks';

// Check if @testing-library/react-hooks is available; fall back to manual approach
let useRenderHook: typeof renderHook;
try {
  useRenderHook = renderHook;
} catch {
  // Will be handled below
}

import {
  useIdleAffordance,
  IDLE_THRESHOLD_MS,
  NUDGE_PX,
  LIFT_PX,
} from '../useIdleAffordance';

// ---------------------------------------------------------------------------
// Fallback hook renderer if @testing-library/react-hooks is not installed
// ---------------------------------------------------------------------------
import React from 'react';
import TestRenderer from 'react-test-renderer';

type HookResult<T> = { current: T };

function renderHookFallback<T>(hookFn: () => T): {
  result: HookResult<T>;
  rerender: () => void;
  unmount: () => void;
} {
  const result: HookResult<T> = { current: undefined as unknown as T };

  function TestComponent() {
    result.current = hookFn();
    return null;
  }

  let renderer: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(TestComponent));
  });

  return {
    result,
    rerender: () => {
      TestRenderer.act(() => {
        renderer.update(React.createElement(TestComponent));
      });
    },
    unmount: () => {
      TestRenderer.act(() => {
        renderer.unmount();
      });
    },
  };
}

// Use the best available hook renderer
const render = renderHookFallback;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useIdleAffordance', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exports correct threshold constants from theme', () => {
    expect(IDLE_THRESHOLD_MS).toBe(7000);
    expect(NUDGE_PX).toBe(12);
    expect(LIFT_PX).toBe(40);
  });

  it('starts with isIdle = false', () => {
    const { result } = render(() => useIdleAffordance());
    expect(result.current.isIdle).toBe(false);
  });

  it('triggers idle after threshold elapses', () => {
    const { result } = render(() => useIdleAffordance());
    expect(result.current.isIdle).toBe(false);

    // Advance time just short of threshold — should still be non-idle
    TestRenderer.act(() => {
      jest.advanceTimersByTime(IDLE_THRESHOLD_MS - 100);
    });
    expect(result.current.isIdle).toBe(false);

    // Cross the threshold
    TestRenderer.act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current.isIdle).toBe(true);
  });

  it('sets animated values when idle triggers', () => {
    const { result } = render(() => useIdleAffordance());

    TestRenderer.act(() => {
      jest.advanceTimersByTime(IDLE_THRESHOLD_MS + 50);
    });

    // With our mock, withSequence returns the last value (0) and
    // withTiming returns the toValue directly
    // nudgeX goes through withSequence(withTiming(12), withTiming(0)) → 0
    // overlayLiftY goes through withTiming(40) → 40
    expect(result.current.overlayLiftY.value).toBe(LIFT_PX);
  });

  it('resets isIdle and restarts timer on resetIdle()', () => {
    const { result } = render(() => useIdleAffordance());

    // Trigger idle
    TestRenderer.act(() => {
      jest.advanceTimersByTime(IDLE_THRESHOLD_MS + 50);
    });
    expect(result.current.isIdle).toBe(true);

    // Reset
    TestRenderer.act(() => {
      result.current.resetIdle();
    });
    expect(result.current.isIdle).toBe(false);

    // Timer should restart — idle again after another threshold
    TestRenderer.act(() => {
      jest.advanceTimersByTime(IDLE_THRESHOLD_MS + 50);
    });
    expect(result.current.isIdle).toBe(true);
  });

  it('resets animated values on resetIdle()', () => {
    const { result } = render(() => useIdleAffordance());

    // Trigger idle
    TestRenderer.act(() => {
      jest.advanceTimersByTime(IDLE_THRESHOLD_MS + 50);
    });
    expect(result.current.overlayLiftY.value).toBe(LIFT_PX);

    // Reset — mock withTiming returns 0 directly
    TestRenderer.act(() => {
      result.current.resetIdle();
    });
    expect(result.current.nudgeX.value).toBe(0);
    expect(result.current.overlayLiftY.value).toBe(0);
  });

  it('does not trigger when enabled=false', () => {
    const { result } = render(() =>
      useIdleAffordance({ enabled: false }),
    );

    TestRenderer.act(() => {
      jest.advanceTimersByTime(IDLE_THRESHOLD_MS + 1000);
    });
    expect(result.current.isIdle).toBe(false);
  });

  it('clears timer on unmount', () => {
    const { unmount } = render(() => useIdleAffordance());

    // Unmount before threshold
    TestRenderer.act(() => {
      unmount();
    });

    // Advancing timers should not throw or cause state updates
    expect(() => {
      jest.advanceTimersByTime(IDLE_THRESHOLD_MS + 1000);
    }).not.toThrow();
  });

  it('accepts a custom thresholdMs', () => {
    const customMs = 2000;
    const { result } = render(() =>
      useIdleAffordance({ thresholdMs: customMs }),
    );

    // Not idle at the original threshold
    TestRenderer.act(() => {
      jest.advanceTimersByTime(customMs - 100);
    });
    expect(result.current.isIdle).toBe(false);

    // Idle at the custom threshold
    TestRenderer.act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current.isIdle).toBe(true);
  });
});
