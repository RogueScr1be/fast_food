import { validateDecisionResponse } from '../invariants';

describe('validateDecisionResponse', () => {
  it('passes without autopilot', () => {
    const response = {
      drmRecommended: true,
      decision: { action: 'cook' },
    };
    const result = validateDecisionResponse(response);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes with autopilot:true', () => {
    const response = {
      drmRecommended: false,
      decision: null,
      autopilot: true,
    };
    const result = validateDecisionResponse(response);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes with autopilot:false', () => {
    const response = {
      drmRecommended: true,
      decision: { action: 'order' },
      autopilot: false,
    };
    const result = validateDecisionResponse(response);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails with autopilot:"yes"', () => {
    const response = {
      drmRecommended: true,
      decision: null,
      autopilot: 'yes',
    };
    const result = validateDecisionResponse(response);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'autopilot')).toBe(true);
  });

  it('fails with autopilot:1', () => {
    const response = {
      drmRecommended: true,
      decision: null,
      autopilot: 1,
    };
    const result = validateDecisionResponse(response);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'autopilot')).toBe(true);
  });

  it('fails when drmRecommended is missing', () => {
    const response = { decision: null };
    const result = validateDecisionResponse(response);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'drmRecommended')).toBe(true);
  });

  it('fails when decision is an array', () => {
    const response = {
      drmRecommended: true,
      decision: [{ action: 'cook' }],
    };
    const result = validateDecisionResponse(response);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'decision')).toBe(true);
  });
});
