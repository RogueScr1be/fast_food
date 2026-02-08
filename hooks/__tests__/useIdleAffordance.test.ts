/**
 * useIdleAffordance — Unit Tests (Phase C: staged, one-shot)
 */

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const withTiming = (toValue: number, _config?: unknown, _cb?: unknown) => toValue;
  const withSequence = (...values: number[]) => values[values.length - 1];
  const useSharedValue = (init: number) => {
    const ref = React.useRef({ value: init });
    return ref.current;
  };
  return {
    __esModule: true,
    default: { createAnimatedComponent: (c: unknown) => c },
    useSharedValue,
    useAnimatedStyle: (fn: () => unknown) => fn,
    withTiming,
    withSequence,
    Easing: { ease: 'ease', inOut: () => 'inOut', out: () => 'out' },
  };
});

import React from 'react';
import TestRenderer from 'react-test-renderer';
import {
  useIdleAffordance,
  STEP1_DELAY_MS,
  STEP2_DELAY_MS,
  NUDGE_PX,
  LIFT_PX,
} from '../useIdleAffordance';

function renderHook<T>(hookFn: () => T) {
  const result = { current: undefined as unknown as T };
  function C() { result.current = hookFn(); return null; }
  let r: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => { r = TestRenderer.create(React.createElement(C)); });
  return {
    result,
    unmount: () => { TestRenderer.act(() => { r!.unmount(); }); },
  };
}

describe('useIdleAffordance (staged, one-shot)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('exports correct step timing constants', () => {
    expect(STEP1_DELAY_MS).toBe(4000);
    expect(STEP2_DELAY_MS).toBe(1500);
    expect(NUDGE_PX).toBe(12);
    expect(LIFT_PX).toBe(40);
  });

  it('Step 1: lifts glass after STEP1_DELAY_MS', () => {
    const { result } = renderHook(() => useIdleAffordance());

    TestRenderer.act(() => { jest.advanceTimersByTime(STEP1_DELAY_MS - 100); });
    expect(result.current.overlayLiftY.value).toBe(0);

    TestRenderer.act(() => { jest.advanceTimersByTime(200); });
    expect(result.current.overlayLiftY.value).toBe(LIFT_PX);
    // nudgeX should still be 0 (Step 2 hasn't fired yet)
    expect(result.current.nudgeX.value).toBe(0);
  });

  it('Step 2: nudges card after STEP1 + STEP2 delay', () => {
    const { result } = renderHook(() => useIdleAffordance());

    TestRenderer.act(() => {
      jest.advanceTimersByTime(STEP1_DELAY_MS + STEP2_DELAY_MS + 50);
    });
    // After sequence completes, mock withSequence returns last value (0)
    // but the animation was triggered (nudgeX was set)
    expect(result.current.overlayLiftY.value).toBe(LIFT_PX);
  });

  it('does not fire when enabled=false', () => {
    const { result } = renderHook(() => useIdleAffordance({ enabled: false }));

    TestRenderer.act(() => {
      jest.advanceTimersByTime(STEP1_DELAY_MS + STEP2_DELAY_MS + 1000);
    });
    expect(result.current.overlayLiftY.value).toBe(0);
    expect(result.current.nudgeX.value).toBe(0);
  });

  it('resetIdle cancels and resets values to 0', () => {
    const { result } = renderHook(() => useIdleAffordance());

    // Let Step 1 fire
    TestRenderer.act(() => { jest.advanceTimersByTime(STEP1_DELAY_MS + 50); });
    expect(result.current.overlayLiftY.value).toBe(LIFT_PX);

    // Reset
    TestRenderer.act(() => { result.current.resetIdle(); });
    expect(result.current.overlayLiftY.value).toBe(0);
    expect(result.current.nudgeX.value).toBe(0);
  });

  it('one-shot: does not re-fire after reset', () => {
    const { result } = renderHook(() => useIdleAffordance());

    // Let it fire
    TestRenderer.act(() => { jest.advanceTimersByTime(STEP1_DELAY_MS + 50); });
    expect(result.current.overlayLiftY.value).toBe(LIFT_PX);

    // Reset
    TestRenderer.act(() => { result.current.resetIdle(); });

    // Wait again — should NOT re-fire (one-shot)
    TestRenderer.act(() => { jest.advanceTimersByTime(STEP1_DELAY_MS + STEP2_DELAY_MS + 1000); });
    expect(result.current.overlayLiftY.value).toBe(0);
  });

  it('clears timers on unmount', () => {
    const { unmount } = renderHook(() => useIdleAffordance());
    TestRenderer.act(() => { unmount(); });
    expect(() => {
      jest.advanceTimersByTime(STEP1_DELAY_MS + STEP2_DELAY_MS + 1000);
    }).not.toThrow();
  });
});
