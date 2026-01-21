/**
 * Runtime Flags and Metrics Tests
 * 
 * Tests:
 * - DB flags override behavior
 * - Flag cache behavior
 * - Fail-closed in production
 * - Metrics counters
 */

import {
  resolveFlags,
  clearFlagCache,
  getFlags,
  type FlagDbClient,
  type RuntimeFlagRow,
} from '../config/flags';

import {
  record,
  reset,
  getSnapshot,
  getMetric,
  type MetricName,
} from '../monitoring/metrics';

describe('Runtime Flags Resolution', () => {
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    // Reset flags cache and env
    clearFlagCache();
    delete process.env.RUNTIME_FLAGS_ENABLED;
    delete process.env.DECISION_OS_ENABLED;
    delete process.env.DECISION_AUTOPILOT_ENABLED;
    delete process.env.DECISION_OCR_ENABLED;
    delete process.env.DECISION_DRM_ENABLED;
    process.env.NODE_ENV = 'development';
  });
  
  afterEach(() => {
    process.env = { ...originalEnv };
    clearFlagCache();
  });
  
  /**
   * Mock DB client for testing
   */
  class MockFlagDbClient implements FlagDbClient {
    private flags: Map<string, boolean>;
    public queryCount = 0;
    public shouldFail = false;
    
    constructor(flags: Record<string, boolean> = {}) {
      this.flags = new Map(Object.entries(flags));
    }
    
    async query<T = unknown>(sql: string): Promise<{ rows: T[] }> {
      this.queryCount++;
      
      if (this.shouldFail) {
        throw new Error('Mock DB failure');
      }
      
      if (sql.includes('runtime_flags')) {
        const rows: RuntimeFlagRow[] = [];
        for (const [key, enabled] of this.flags) {
          rows.push({ key, enabled, updated_at: new Date().toISOString() });
        }
        return { rows: rows as T[] };
      }
      
      return { rows: [] };
    }
  }
  
  describe('DB flags override', () => {
    it('uses env-only when RUNTIME_FLAGS_ENABLED is false', async () => {
      process.env.DECISION_OS_ENABLED = 'true';
      process.env.RUNTIME_FLAGS_ENABLED = 'false';
      
      const client = new MockFlagDbClient({
        decision_os_enabled: false, // DB says disabled
      });
      
      const flags = await resolveFlags({ db: client });
      
      expect(flags.decisionOsEnabled).toBe(true); // ENV wins, DB not consulted
      expect(flags.source).toBe('env');
      expect(flags.dbLoaded).toBe(false);
      expect(client.queryCount).toBe(0); // DB not queried
    });
    
    it('ANDs env and DB flags when RUNTIME_FLAGS_ENABLED is true', async () => {
      process.env.DECISION_OS_ENABLED = 'true';
      process.env.DECISION_AUTOPILOT_ENABLED = 'true';
      process.env.RUNTIME_FLAGS_ENABLED = 'true';
      
      const client = new MockFlagDbClient({
        decision_os_enabled: true,
        decision_autopilot_enabled: false, // DB disables autopilot
        decision_ocr_enabled: true,
        decision_drm_enabled: true,
      });
      
      const flags = await resolveFlags({ db: client });
      
      expect(flags.decisionOsEnabled).toBe(true); // Both true
      expect(flags.autopilotEnabled).toBe(false); // DB disabled
      expect(flags.source).toBe('env+db');
      expect(flags.dbLoaded).toBe(true);
    });
    
    it('requires BOTH env AND DB to be true', async () => {
      process.env.DECISION_OS_ENABLED = 'false'; // ENV disabled
      process.env.RUNTIME_FLAGS_ENABLED = 'true';
      
      const client = new MockFlagDbClient({
        decision_os_enabled: true, // DB enabled
      });
      
      const flags = await resolveFlags({ db: client });
      
      // ENV false AND DB true = false
      expect(flags.decisionOsEnabled).toBe(false);
    });
  });
  
  describe('Flag cache', () => {
    it('caches DB flags and reuses within TTL', async () => {
      process.env.DECISION_OS_ENABLED = 'true';
      process.env.RUNTIME_FLAGS_ENABLED = 'true';
      
      const client = new MockFlagDbClient({
        decision_os_enabled: true,
      });
      
      // First call - should query DB
      await resolveFlags({ db: client, useCache: true });
      expect(client.queryCount).toBe(1);
      
      // Second call - should use cache
      await resolveFlags({ db: client, useCache: true });
      expect(client.queryCount).toBe(1); // Still 1, cache used
      
      // Third call - should still use cache
      await resolveFlags({ db: client, useCache: true });
      expect(client.queryCount).toBe(1);
    });
    
    it('bypasses cache when useCache is false', async () => {
      process.env.DECISION_OS_ENABLED = 'true';
      process.env.RUNTIME_FLAGS_ENABLED = 'true';
      
      const client = new MockFlagDbClient({
        decision_os_enabled: true,
      });
      
      await resolveFlags({ db: client, useCache: false });
      expect(client.queryCount).toBe(1);
      
      await resolveFlags({ db: client, useCache: false });
      expect(client.queryCount).toBe(2); // Each call queries DB
    });
    
    it('clearFlagCache forces fresh DB query', async () => {
      process.env.DECISION_OS_ENABLED = 'true';
      process.env.RUNTIME_FLAGS_ENABLED = 'true';
      
      const client = new MockFlagDbClient({
        decision_os_enabled: true,
      });
      
      await resolveFlags({ db: client, useCache: true });
      expect(client.queryCount).toBe(1);
      
      clearFlagCache();
      
      await resolveFlags({ db: client, useCache: true });
      expect(client.queryCount).toBe(2); // Fresh query after cache clear
    });
  });
  
  describe('Fail-closed behavior in production', () => {
    it('returns all false when DB query fails in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DECISION_OS_ENABLED = 'true';
      process.env.DECISION_AUTOPILOT_ENABLED = 'true';
      process.env.DECISION_DRM_ENABLED = 'true';
      process.env.RUNTIME_FLAGS_ENABLED = 'true';
      
      const client = new MockFlagDbClient({});
      client.shouldFail = true;
      
      const flags = await resolveFlags({ db: client });
      
      // All false (fail-closed)
      expect(flags.decisionOsEnabled).toBe(false);
      expect(flags.autopilotEnabled).toBe(false);
      expect(flags.ocrEnabled).toBe(false);
      expect(flags.drmEnabled).toBe(false);
      expect(flags.dbLoaded).toBe(false);
    });
    
    it('falls back to env flags when DB fails in development', async () => {
      process.env.NODE_ENV = 'development';
      process.env.DECISION_OS_ENABLED = 'true';
      process.env.DECISION_AUTOPILOT_ENABLED = 'true';
      process.env.RUNTIME_FLAGS_ENABLED = 'true';
      
      const client = new MockFlagDbClient({});
      client.shouldFail = true;
      
      const flags = await resolveFlags({ db: client });
      
      // Falls back to env in dev
      expect(flags.decisionOsEnabled).toBe(true);
      expect(flags.autopilotEnabled).toBe(true);
      expect(flags.source).toBe('env');
      expect(flags.dbLoaded).toBe(false);
    });
    
    it('treats missing DB flags as false', async () => {
      process.env.DECISION_OS_ENABLED = 'true';
      process.env.DECISION_AUTOPILOT_ENABLED = 'true';
      process.env.RUNTIME_FLAGS_ENABLED = 'true';
      
      // DB only has decision_os_enabled, missing autopilot
      const client = new MockFlagDbClient({
        decision_os_enabled: true,
        // decision_autopilot_enabled is missing
      });
      
      const flags = await resolveFlags({ db: client });
      
      expect(flags.decisionOsEnabled).toBe(true);
      expect(flags.autopilotEnabled).toBe(false); // Missing in DB = false
    });
  });
  
  describe('Runtime flags table in migrations', () => {
    // Note: These tests use require() since dynamic import is not supported in Jest without --experimental-vm-modules
    it('REQUIRED_TABLES includes runtime_flags', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { REQUIRED_TABLES } = require('../../../db/migrate');
      expect(REQUIRED_TABLES).toContain('runtime_flags');
    });
    
    it('REQUIRED_COLUMNS includes runtime_flags columns', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { REQUIRED_COLUMNS } = require('../../../db/migrate');
      expect(REQUIRED_COLUMNS.has('runtime_flags')).toBe(true);
      expect(REQUIRED_COLUMNS.get('runtime_flags')).toContain('key');
      expect(REQUIRED_COLUMNS.get('runtime_flags')).toContain('enabled');
      expect(REQUIRED_COLUMNS.get('runtime_flags')).toContain('updated_at');
    });
  });
});

describe('Metrics', () => {
  beforeEach(() => {
    reset();
  });
  
  afterEach(() => {
    reset();
  });
  
  describe('record()', () => {
    it('increments counter on each call', () => {
      expect(getMetric('decision_called')).toBe(0);
      
      record('decision_called');
      expect(getMetric('decision_called')).toBe(1);
      
      record('decision_called');
      expect(getMetric('decision_called')).toBe(2);
      
      record('decision_called');
      expect(getMetric('decision_called')).toBe(3);
    });
    
    it('tracks multiple metrics independently', () => {
      record('decision_called');
      record('decision_called');
      record('receipt_called');
      record('feedback_called');
      record('feedback_called');
      record('feedback_called');
      
      expect(getMetric('decision_called')).toBe(2);
      expect(getMetric('receipt_called')).toBe(1);
      expect(getMetric('feedback_called')).toBe(3);
      expect(getMetric('drm_called')).toBe(0); // Not recorded
    });
  });
  
  describe('getSnapshot()', () => {
    it('returns all recorded metrics', () => {
      record('healthz_hit');
      record('decision_called');
      record('autopilot_inserted');
      
      const snapshot = getSnapshot();
      
      expect(snapshot.healthz_hit).toBe(1);
      expect(snapshot.decision_called).toBe(1);
      expect(snapshot.autopilot_inserted).toBe(1);
    });
    
    it('returns empty object when no metrics recorded', () => {
      const snapshot = getSnapshot();
      expect(Object.keys(snapshot)).toHaveLength(0);
    });
  });
  
  describe('reset()', () => {
    it('clears all metrics', () => {
      record('decision_called');
      record('receipt_called');
      record('feedback_called');
      
      expect(getMetric('decision_called')).toBe(1);
      
      reset();
      
      expect(getMetric('decision_called')).toBe(0);
      expect(getMetric('receipt_called')).toBe(0);
      expect(getMetric('feedback_called')).toBe(0);
      
      const snapshot = getSnapshot();
      expect(Object.keys(snapshot)).toHaveLength(0);
    });
  });
  
  describe('getMetric()', () => {
    it('returns 0 for unrecorded metrics', () => {
      expect(getMetric('decision_unauthorized')).toBe(0);
      expect(getMetric('ocr_provider_failed')).toBe(0);
    });
    
    it('returns correct count for recorded metrics', () => {
      record('undo_received');
      record('undo_received');
      
      expect(getMetric('undo_received')).toBe(2);
    });
  });
  
  describe('metric names', () => {
    it('tracks all expected metrics', () => {
      const expectedMetrics: MetricName[] = [
        'healthz_hit',
        'decision_called',
        'decision_unauthorized',
        'receipt_called',
        'feedback_called',
        'drm_called',
        'autopilot_inserted',
        'undo_received',
        'ocr_provider_failed',
        'db_flags_loaded',
        'db_flags_cache_hit',
        'db_flags_error',
        'metrics_db_failed',
        'readonly_hit',
      ];
      
      // Record each metric
      for (const name of expectedMetrics) {
        record(name);
      }
      
      const snapshot = getSnapshot();
      
      // All should be 1
      for (const name of expectedMetrics) {
        expect(snapshot[name]).toBe(1);
      }
    });
  });

  describe('DB-backed metrics', () => {
    it('includes metrics_db_failed metric', () => {
      record('metrics_db_failed');
      expect(getMetric('metrics_db_failed')).toBe(1);
      
      record('metrics_db_failed');
      expect(getMetric('metrics_db_failed')).toBe(2);
    });

    it('includes readonly_hit metric', () => {
      record('readonly_hit');
      expect(getMetric('readonly_hit')).toBe(1);
    });
  });
});

describe('Readonly Flag', () => {
  const savedEnv = { ...process.env };
  
  /**
   * Mock DB client for testing
   */
  class ReadonlyMockFlagDbClient implements FlagDbClient {
    private flags: Map<string, boolean>;
    
    constructor(flags: Record<string, boolean> = {}) {
      this.flags = new Map(Object.entries(flags));
    }
    
    async query<T = unknown>(): Promise<{ rows: T[] }> {
      const rows: RuntimeFlagRow[] = [];
      for (const [key, enabled] of this.flags) {
        rows.push({ key, enabled, updated_at: new Date().toISOString() });
      }
      return { rows: rows as T[] };
    }
  }
  
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...savedEnv };
    clearFlagCache();
    process.env.NODE_ENV = 'development';
    delete process.env.DECISION_OS_ENABLED;
    delete process.env.RUNTIME_FLAGS_ENABLED;
  });
  
  afterEach(() => {
    process.env = { ...savedEnv };
    clearFlagCache();
  });
  
  it('getFlags returns readonlyMode false by default', () => {
    const flags = getFlags();
    expect(flags.readonlyMode).toBe(false);
  });
  
  it('resolveFlags includes readonlyMode from DB', async () => {
    process.env.DECISION_OS_ENABLED = 'true';
    process.env.RUNTIME_FLAGS_ENABLED = 'true';
    
    const client = new ReadonlyMockFlagDbClient({
      decision_os_enabled: true,
      decision_os_readonly: true,
    });
    
    const flags = await resolveFlags({ db: client });
    
    expect(flags.readonlyMode).toBe(true);
  });
  
  it('readonly requires master enabled (AND logic)', async () => {
    process.env.DECISION_OS_ENABLED = 'true';
    process.env.RUNTIME_FLAGS_ENABLED = 'true';
    
    const client = new ReadonlyMockFlagDbClient({
      decision_os_enabled: false, // Master disabled
      decision_os_readonly: true,
    });
    
    const flags = await resolveFlags({ db: client });
    
    // Readonly should be false because master is off
    expect(flags.decisionOsEnabled).toBe(false);
    expect(flags.readonlyMode).toBe(false);
  });
  
  it('readonly defaults to false when not in DB', async () => {
    process.env.DECISION_OS_ENABLED = 'true';
    process.env.RUNTIME_FLAGS_ENABLED = 'true';
    
    const client = new ReadonlyMockFlagDbClient({
      decision_os_enabled: true,
      // decision_os_readonly is missing
    });
    
    const flags = await resolveFlags({ db: client });
    
    expect(flags.readonlyMode).toBe(false);
  });
});
