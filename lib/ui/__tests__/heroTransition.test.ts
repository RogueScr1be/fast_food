/**
 * heroTransition singleton — unit tests
 */

import {
  setPendingHeroTransition,
  consumePendingHeroTransition,
  clearPendingHeroTransition,
  __resetForTest,
} from '../heroTransition';

const MOCK_SOURCE = { x: 0, y: 0, width: 390, height: 844 };
const MOCK_IMAGE = 1; // RN require() returns a number

beforeEach(() => {
  __resetForTest();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('heroTransition singleton', () => {
  it('returns payload on matching destKey', () => {
    setPendingHeroTransition({
      sourceRect: MOCK_SOURCE,
      imageSource: MOCK_IMAGE,
      destKey: 'checklist:fancy-1',
    });

    const result = consumePendingHeroTransition('checklist:fancy-1');
    expect(result).not.toBeNull();
    expect(result!.destKey).toBe('checklist:fancy-1');
    expect(result!.sourceRect).toEqual(MOCK_SOURCE);
  });

  it('returns null on mismatched destKey and does NOT clear', () => {
    setPendingHeroTransition({
      sourceRect: MOCK_SOURCE,
      imageSource: MOCK_IMAGE,
      destKey: 'checklist:fancy-1',
    });

    // Wrong key
    const wrong = consumePendingHeroTransition('rescue:drm-3');
    expect(wrong).toBeNull();

    // Correct key still works (not cleared by mismatch)
    const right = consumePendingHeroTransition('checklist:fancy-1');
    expect(right).not.toBeNull();
  });

  it('double consume returns payload once then null', () => {
    setPendingHeroTransition({
      sourceRect: MOCK_SOURCE,
      imageSource: MOCK_IMAGE,
      destKey: 'checklist:fancy-1',
    });

    const first = consumePendingHeroTransition('checklist:fancy-1');
    expect(first).not.toBeNull();

    const second = consumePendingHeroTransition('checklist:fancy-1');
    expect(second).toBeNull();
  });

  it('returns null after expiry', () => {
    setPendingHeroTransition({
      sourceRect: MOCK_SOURCE,
      imageSource: MOCK_IMAGE,
      destKey: 'checklist:fancy-1',
    });

    // Advance past expiry (2000ms)
    jest.advanceTimersByTime(2100);

    const result = consumePendingHeroTransition('checklist:fancy-1');
    expect(result).toBeNull();
  });

  it('clearPendingHeroTransition prevents consumption', () => {
    setPendingHeroTransition({
      sourceRect: MOCK_SOURCE,
      imageSource: MOCK_IMAGE,
      destKey: 'checklist:fancy-1',
    });

    clearPendingHeroTransition();

    const result = consumePendingHeroTransition('checklist:fancy-1');
    expect(result).toBeNull();
  });

  it('second set overwrites first', () => {
    setPendingHeroTransition({
      sourceRect: MOCK_SOURCE,
      imageSource: MOCK_IMAGE,
      destKey: 'checklist:fancy-1',
    });
    setPendingHeroTransition({
      sourceRect: MOCK_SOURCE,
      imageSource: MOCK_IMAGE,
      destKey: 'rescue:drm-3',
    });

    const first = consumePendingHeroTransition('checklist:fancy-1');
    expect(first).toBeNull();

    const second = consumePendingHeroTransition('rescue:drm-3');
    expect(second).not.toBeNull();
  });

  it('preserves optional targetKey and transitionKind fields', () => {
    setPendingHeroTransition({
      sourceRect: MOCK_SOURCE,
      imageSource: MOCK_IMAGE,
      destKey: 'tonight',
      targetKey: 'tonight:fancy',
      transitionKind: 'deal_to_tonight',
    });

    const result = consumePendingHeroTransition('tonight');
    expect(result).not.toBeNull();
    expect(result!.targetKey).toBe('tonight:fancy');
    expect(result!.transitionKind).toBe('deal_to_tonight');
  });
});
