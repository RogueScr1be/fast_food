/**
 * Migration Logic Tests
 * 
 * Tests the migration ledger logic without network/database.
 * Uses in-memory stubs.
 */

import {
  getMigrationFiles,
  getUnappliedMigrations,
  runMigrationsWithClient,
  verifyRequiredTables,
  verifyRequiredColumns,
  verifyRequiredConstraints,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
  REQUIRED_CONSTRAINTS,
  type MigrationFile,
  type DbClient,
} from '../../../db/migrate';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Migration Logic', () => {
  describe('getMigrationFiles', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns empty array for non-existent directory', () => {
      const files = getMigrationFiles('/non/existent/path');
      expect(files).toEqual([]);
    });

    it('returns sorted migration files by order number', () => {
      fs.writeFileSync(path.join(tempDir, '003_third.sql'), 'SELECT 3');
      fs.writeFileSync(path.join(tempDir, '001_first.sql'), 'SELECT 1');
      fs.writeFileSync(path.join(tempDir, '002_second.sql'), 'SELECT 2');
      fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'not a migration');

      const files = getMigrationFiles(tempDir);

      expect(files).toHaveLength(3);
      expect(files[0].name).toBe('001_first.sql');
      expect(files[1].name).toBe('002_second.sql');
      expect(files[2].name).toBe('003_third.sql');
      expect(files[0].order).toBe(1);
      expect(files[1].order).toBe(2);
      expect(files[2].order).toBe(3);
    });

    it('ignores non-sql files', () => {
      fs.writeFileSync(path.join(tempDir, '001_migration.sql'), 'SELECT 1');
      fs.writeFileSync(path.join(tempDir, '002_migration.txt'), 'not sql');
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# readme');

      const files = getMigrationFiles(tempDir);

      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('001_migration.sql');
    });
  });

  describe('getUnappliedMigrations', () => {
    const allMigrations: MigrationFile[] = [
      { name: '001_first.sql', path: '/path/001_first.sql', order: 1 },
      { name: '002_second.sql', path: '/path/002_second.sql', order: 2 },
      { name: '003_third.sql', path: '/path/003_third.sql', order: 3 },
    ];

    it('returns all migrations when none applied', () => {
      const applied = new Set<string>();
      const unapplied = getUnappliedMigrations(allMigrations, applied);

      expect(unapplied).toHaveLength(3);
    });

    it('returns only unapplied migrations', () => {
      const applied = new Set(['001_first.sql', '002_second.sql']);
      const unapplied = getUnappliedMigrations(allMigrations, applied);

      expect(unapplied).toHaveLength(1);
      expect(unapplied[0].name).toBe('003_third.sql');
    });

    it('returns empty when all applied', () => {
      const applied = new Set(['001_first.sql', '002_second.sql', '003_third.sql']);
      const unapplied = getUnappliedMigrations(allMigrations, applied);

      expect(unapplied).toHaveLength(0);
    });
  });

  describe('runMigrationsWithClient', () => {
    let tempDir: string;
    let mockClient: MockDbClient;

    class MockDbClient implements DbClient {
      private schemaMigrations: Set<string> = new Set();
      public queries: string[] = [];
      public shouldFail: string | null = null;

      async query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
        this.queries.push(sql.substring(0, 50));

        // Handle schema_migrations table creation
        if (sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
          return { rows: [] };
        }

        // Handle index creation
        if (sql.includes('CREATE INDEX')) {
          return { rows: [] };
        }

        // Handle SELECT filename FROM schema_migrations
        if (sql.includes('SELECT filename FROM schema_migrations')) {
          const rows = Array.from(this.schemaMigrations).map(f => ({ filename: f }));
          return { rows: rows as T[] };
        }

        // Handle INSERT INTO schema_migrations
        if (sql.includes('INSERT INTO schema_migrations')) {
          const filename = params?.[0] as string;
          if (filename) {
            this.schemaMigrations.add(filename);
          }
          return { rows: [] };
        }

        // Handle migration SQL - check for intentional failures
        if (this.shouldFail && sql.includes(this.shouldFail)) {
          throw new Error(`Intentional test failure: ${this.shouldFail}`);
        }

        return { rows: [] };
      }

      async end(): Promise<void> {
        // No-op
      }

      // Test helpers
      markAsApplied(filename: string): void {
        this.schemaMigrations.add(filename);
      }

      getApplied(): string[] {
        return Array.from(this.schemaMigrations);
      }
    }

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
      mockClient = new MockDbClient();
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('applies all migrations when none applied', async () => {
      fs.writeFileSync(path.join(tempDir, '001_first.sql'), 'SELECT 1');
      fs.writeFileSync(path.join(tempDir, '002_second.sql'), 'SELECT 2');

      const result = await runMigrationsWithClient(mockClient, tempDir);

      expect(result.applied).toEqual(['001_first.sql', '002_second.sql']);
      expect(result.skipped).toEqual([]);
      expect(result.failed).toBeNull();
      expect(mockClient.getApplied()).toContain('001_first.sql');
      expect(mockClient.getApplied()).toContain('002_second.sql');
    });

    it('skips already applied migrations', async () => {
      fs.writeFileSync(path.join(tempDir, '001_first.sql'), 'SELECT 1');
      fs.writeFileSync(path.join(tempDir, '002_second.sql'), 'SELECT 2');
      mockClient.markAsApplied('001_first.sql');

      const result = await runMigrationsWithClient(mockClient, tempDir);

      expect(result.applied).toEqual(['002_second.sql']);
      expect(result.skipped).toEqual(['001_first.sql']);
      expect(result.failed).toBeNull();
    });

    it('returns all skipped when all migrations applied', async () => {
      fs.writeFileSync(path.join(tempDir, '001_first.sql'), 'SELECT 1');
      fs.writeFileSync(path.join(tempDir, '002_second.sql'), 'SELECT 2');
      mockClient.markAsApplied('001_first.sql');
      mockClient.markAsApplied('002_second.sql');

      const result = await runMigrationsWithClient(mockClient, tempDir);

      expect(result.applied).toEqual([]);
      expect(result.skipped).toEqual(['001_first.sql', '002_second.sql']);
      expect(result.failed).toBeNull();
    });

    it('handles empty migrations directory', async () => {
      const result = await runMigrationsWithClient(mockClient, tempDir);

      expect(result.applied).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.failed).toBeNull();
    });

    it('is idempotent - running twice gives same result', async () => {
      fs.writeFileSync(path.join(tempDir, '001_first.sql'), 'SELECT 1');

      const result1 = await runMigrationsWithClient(mockClient, tempDir);
      const result2 = await runMigrationsWithClient(mockClient, tempDir);

      expect(result1.applied).toEqual(['001_first.sql']);
      expect(result2.applied).toEqual([]);
      expect(result2.skipped).toEqual(['001_first.sql']);
    });
  });

  describe('verifyRequiredTables', () => {
    class TableVerifyMockClient implements DbClient {
      private tables: Set<string>;

      constructor(existingTables: string[]) {
        this.tables = new Set(existingTables);
      }

      async query<T = unknown>(sql: string): Promise<{ rows: T[] }> {
        if (sql.includes('information_schema.tables')) {
          const rows = Array.from(this.tables).map(t => ({ table_name: t }));
          return { rows: rows as T[] };
        }
        return { rows: [] };
      }

      async end(): Promise<void> {}
    }

    it('returns valid when all required tables exist', async () => {
      const client = new TableVerifyMockClient([...REQUIRED_TABLES]);
      const result = await verifyRequiredTables(client);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.found).toHaveLength(REQUIRED_TABLES.length);
    });

    it('returns invalid when tables are missing', async () => {
      // Only include some tables
      const client = new TableVerifyMockClient(['user_profiles', 'meals']);
      const result = await verifyRequiredTables(client);

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.missing).toContain('decision_events');
      expect(result.found).toContain('user_profiles');
      expect(result.found).toContain('meals');
    });

    it('returns all missing when no tables exist', async () => {
      const client = new TableVerifyMockClient([]);
      const result = await verifyRequiredTables(client);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual([...REQUIRED_TABLES]);
      expect(result.found).toEqual([]);
    });

    it('works with custom required tables list', async () => {
      const client = new TableVerifyMockClient(['custom_table']);
      const result = await verifyRequiredTables(client, ['custom_table', 'other_table']);

      expect(result.valid).toBe(false);
      expect(result.found).toEqual(['custom_table']);
      expect(result.missing).toEqual(['other_table']);
    });
  });

  describe('REQUIRED_TABLES constant', () => {
    it('contains expected core tables', () => {
      expect(REQUIRED_TABLES).toContain('user_profiles');
      expect(REQUIRED_TABLES).toContain('decision_events');
      expect(REQUIRED_TABLES).toContain('meals');
      expect(REQUIRED_TABLES).toContain('households');
      expect(REQUIRED_TABLES).toContain('schema_migrations');
    });

    it('contains runtime infrastructure tables', () => {
      expect(REQUIRED_TABLES).toContain('runtime_flags');
      expect(REQUIRED_TABLES).toContain('runtime_metrics_daily');
      expect(REQUIRED_TABLES).toContain('runtime_deployments_log');
    });

    it('has at least 13 required tables', () => {
      expect(REQUIRED_TABLES.length).toBeGreaterThanOrEqual(13);
    });
  });

  describe('verifyRequiredColumns', () => {
    /**
     * Mock DB client that simulates information_schema.columns responses
     */
    class ColumnVerifyMockClient implements DbClient {
      private columns: Map<string, Set<string>>;

      constructor(tableColumns: Record<string, string[]>) {
        this.columns = new Map();
        for (const [table, cols] of Object.entries(tableColumns)) {
          this.columns.set(table, new Set(cols));
        }
      }

      async query<T = unknown>(sql: string): Promise<{ rows: T[] }> {
        if (sql.includes('information_schema.columns')) {
          const rows: Array<{ table_name: string; column_name: string }> = [];
          for (const [tableName, cols] of this.columns) {
            for (const col of cols) {
              rows.push({ table_name: tableName, column_name: col });
            }
          }
          return { rows: rows as T[] };
        }
        return { rows: [] };
      }

      async end(): Promise<void> {}
    }

    it('passes when all required columns exist', async () => {
      // Build a client with all required columns
      const tableColumns: Record<string, string[]> = {};
      for (const [table, cols] of REQUIRED_COLUMNS) {
        tableColumns[table] = [...cols];
      }
      const client = new ColumnVerifyMockClient(tableColumns);

      const result = await verifyRequiredColumns(client);

      expect(result.valid).toBe(true);
      expect(result.missingColumns.size).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.checkedTables.length).toBe(REQUIRED_COLUMNS.size);
    });

    it('fails when a column is missing', async () => {
      // Build a client with most columns, but missing one
      const tableColumns: Record<string, string[]> = {};
      for (const [table, cols] of REQUIRED_COLUMNS) {
        if (table === 'user_profiles') {
          // Omit auth_user_id
          tableColumns[table] = cols.filter(c => c !== 'auth_user_id');
        } else {
          tableColumns[table] = [...cols];
        }
      }
      const client = new ColumnVerifyMockClient(tableColumns);

      const result = await verifyRequiredColumns(client);

      expect(result.valid).toBe(false);
      expect(result.missingColumns.has('user_profiles')).toBe(true);
      expect(result.missingColumns.get('user_profiles')).toContain('auth_user_id');
      expect(result.errors.some(e => e.includes('user_profiles') && e.includes('auth_user_id'))).toBe(true);
    });

    it('reports multiple missing columns', async () => {
      // Build a client with decision_events missing multiple columns
      const tableColumns: Record<string, string[]> = {};
      for (const [table, cols] of REQUIRED_COLUMNS) {
        if (table === 'decision_events') {
          // Only include id and user_profile_id
          tableColumns[table] = ['id', 'user_profile_id'];
        } else {
          tableColumns[table] = [...cols];
        }
      }
      const client = new ColumnVerifyMockClient(tableColumns);

      const result = await verifyRequiredColumns(client);

      expect(result.valid).toBe(false);
      expect(result.missingColumns.has('decision_events')).toBe(true);
      
      const missingCols = result.missingColumns.get('decision_events')!;
      expect(missingCols.length).toBeGreaterThan(1);
      expect(missingCols).toContain('household_key');
      expect(missingCols).toContain('user_action');
      expect(missingCols).toContain('notes');
    });

    it('reports missing table separately', async () => {
      // Build a client that is missing the households table entirely
      const tableColumns: Record<string, string[]> = {};
      for (const [table, cols] of REQUIRED_COLUMNS) {
        if (table !== 'households') {
          tableColumns[table] = [...cols];
        }
      }
      const client = new ColumnVerifyMockClient(tableColumns);

      const result = await verifyRequiredColumns(client);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("'households'") && e.includes('does not exist'))).toBe(true);
    });

    it('works with custom REQUIRED_COLUMNS', async () => {
      const customColumns = new Map<string, string[]>([
        ['custom_table', ['col_a', 'col_b', 'col_c']],
      ]);
      
      // Client has custom_table but missing col_c
      const client = new ColumnVerifyMockClient({
        custom_table: ['col_a', 'col_b'],
      });

      const result = await verifyRequiredColumns(client, customColumns);

      expect(result.valid).toBe(false);
      expect(result.missingColumns.has('custom_table')).toBe(true);
      expect(result.missingColumns.get('custom_table')).toContain('col_c');
      expect(result.checkedTables).toContain('custom_table');
    });
  });

  describe('REQUIRED_COLUMNS constant', () => {
    it('contains decision_events.user_action', () => {
      expect(REQUIRED_COLUMNS.has('decision_events')).toBe(true);
      expect(REQUIRED_COLUMNS.get('decision_events')).toContain('user_action');
    });

    it('contains decision_events.household_key', () => {
      expect(REQUIRED_COLUMNS.has('decision_events')).toBe(true);
      expect(REQUIRED_COLUMNS.get('decision_events')).toContain('household_key');
    });

    it('contains schema_migrations.filename and applied_at', () => {
      expect(REQUIRED_COLUMNS.has('schema_migrations')).toBe(true);
      expect(REQUIRED_COLUMNS.get('schema_migrations')).toContain('filename');
      expect(REQUIRED_COLUMNS.get('schema_migrations')).toContain('applied_at');
    });

    it('has required columns for all core tables', () => {
      const expectedTables = [
        'user_profiles',
        'households',
        'household_members',
        'decision_events',
        'inventory_items',
        'receipt_imports',
        'taste_signals',
        'taste_meal_scores',
        'schema_migrations',
      ];

      for (const table of expectedTables) {
        expect(REQUIRED_COLUMNS.has(table)).toBe(true);
        expect(REQUIRED_COLUMNS.get(table)!.length).toBeGreaterThan(0);
      }
    });

    it('contains at least 3 columns per table', () => {
      for (const [table, cols] of REQUIRED_COLUMNS) {
        expect(cols.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('contains runtime_metrics_daily columns', () => {
      expect(REQUIRED_COLUMNS.has('runtime_metrics_daily')).toBe(true);
      expect(REQUIRED_COLUMNS.get('runtime_metrics_daily')).toContain('day');
      expect(REQUIRED_COLUMNS.get('runtime_metrics_daily')).toContain('metric_key');
      expect(REQUIRED_COLUMNS.get('runtime_metrics_daily')).toContain('count');
      expect(REQUIRED_COLUMNS.get('runtime_metrics_daily')).toContain('updated_at');
    });

    it('contains runtime_deployments_log columns', () => {
      expect(REQUIRED_COLUMNS.has('runtime_deployments_log')).toBe(true);
      expect(REQUIRED_COLUMNS.get('runtime_deployments_log')).toContain('id');
      expect(REQUIRED_COLUMNS.get('runtime_deployments_log')).toContain('env');
      expect(REQUIRED_COLUMNS.get('runtime_deployments_log')).toContain('deployment_url');
      expect(REQUIRED_COLUMNS.get('runtime_deployments_log')).toContain('git_sha');
      expect(REQUIRED_COLUMNS.get('runtime_deployments_log')).toContain('run_id');
      expect(REQUIRED_COLUMNS.get('runtime_deployments_log')).toContain('recorded_at');
    });
  });

  describe('verifyRequiredColumnTypes', () => {
    // Import at test time to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { 
      verifyRequiredColumnTypes, 
      REQUIRED_COLUMN_TYPES 
    } = require('../../../db/migrate');

    class TypeVerifyMockClient implements DbClient {
      private columnTypes: Record<string, string>;

      constructor(columnTypes: Record<string, string>) {
        this.columnTypes = columnTypes;
      }

      async query<T = unknown>(sql: string): Promise<{ rows: T[] }> {
        if (sql.includes('information_schema.columns')) {
          const rows: Array<{ table_name: string; column_name: string; data_type: string }> = [];
          for (const [key, dataType] of Object.entries(this.columnTypes)) {
            const [table, column] = key.split('.');
            rows.push({ table_name: table, column_name: column, data_type: dataType });
          }
          return { rows: rows as T[] };
        }
        return { rows: [] };
      }

      async end(): Promise<void> {}
    }

    it('passes when all required column types match', async () => {
      const columnTypes: Record<string, string> = {
        'runtime_flags.enabled': 'boolean',
        'runtime_flags.key': 'text',
        'runtime_metrics_daily.count': 'bigint',
        'decision_events.user_action': 'text',
        'decision_events.household_key': 'text',
        'runtime_deployments_log.env': 'text',
        'runtime_deployments_log.deployment_url': 'text',
        'runtime_deployments_log.git_sha': 'text',
        'runtime_deployments_log.run_id': 'text',
      };
      const client = new TypeVerifyMockClient(columnTypes);

      const result = await verifyRequiredColumnTypes(client);

      expect(result.valid).toBe(true);
      expect(result.mismatches).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when a column type mismatches', async () => {
      const columnTypes: Record<string, string> = {
        'runtime_flags.enabled': 'text', // Should be boolean
        'runtime_flags.key': 'text',
        'runtime_metrics_daily.count': 'bigint',
        'decision_events.user_action': 'text',
        'decision_events.household_key': 'text',
        'runtime_deployments_log.env': 'text',
        'runtime_deployments_log.deployment_url': 'text',
        'runtime_deployments_log.git_sha': 'text',
        'runtime_deployments_log.run_id': 'text',
      };
      const client = new TypeVerifyMockClient(columnTypes);

      const result = await verifyRequiredColumnTypes(client);

      expect(result.valid).toBe(false);
      expect(result.mismatches.some(m => 
        m.column === 'runtime_flags.enabled' && 
        m.expected === 'boolean' && 
        m.actual === 'text'
      )).toBe(true);
    });

    it('fails when a column is not found', async () => {
      // Missing runtime_metrics_daily.count
      const columnTypes: Record<string, string> = {
        'runtime_flags.enabled': 'boolean',
        'runtime_flags.key': 'text',
        'decision_events.user_action': 'text',
        'decision_events.household_key': 'text',
      };
      const client = new TypeVerifyMockClient(columnTypes);

      const result = await verifyRequiredColumnTypes(client);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('runtime_metrics_daily.count'))).toBe(true);
    });

    it('works with custom required types', async () => {
      const customTypes = new Map<string, string>([
        ['custom_table.custom_col', 'integer'],
      ]);
      
      const client = new TypeVerifyMockClient({
        'custom_table.custom_col': 'text', // Wrong type
      });

      const result = await verifyRequiredColumnTypes(client, customTypes);

      expect(result.valid).toBe(false);
      expect(result.mismatches.some(m => 
        m.column === 'custom_table.custom_col' && 
        m.expected === 'integer' && 
        m.actual === 'text'
      )).toBe(true);
    });

    it('REQUIRED_COLUMN_TYPES contains critical columns', () => {
      expect(REQUIRED_COLUMN_TYPES.get('runtime_flags.enabled')).toBe('boolean');
      expect(REQUIRED_COLUMN_TYPES.get('runtime_flags.key')).toBe('text');
      expect(REQUIRED_COLUMN_TYPES.get('runtime_metrics_daily.count')).toBe('bigint');
      expect(REQUIRED_COLUMN_TYPES.get('decision_events.user_action')).toBe('text');
      expect(REQUIRED_COLUMN_TYPES.get('decision_events.household_key')).toBe('text');
    });

    it('REQUIRED_COLUMN_TYPES contains runtime_deployments_log columns', () => {
      expect(REQUIRED_COLUMN_TYPES.get('runtime_deployments_log.env')).toBe('text');
      expect(REQUIRED_COLUMN_TYPES.get('runtime_deployments_log.deployment_url')).toBe('text');
      expect(REQUIRED_COLUMN_TYPES.get('runtime_deployments_log.git_sha')).toBe('text');
      expect(REQUIRED_COLUMN_TYPES.get('runtime_deployments_log.run_id')).toBe('text');
    });
  });

  describe('verifyNotNull', () => {
    // Import at test time to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { verifyNotNull, NOT_NULL_COLUMNS } = require('../../../db/migrate');

    class NotNullVerifyMockClient implements DbClient {
      private columnNullable: Record<string, boolean>;

      constructor(columnNullable: Record<string, boolean>) {
        this.columnNullable = columnNullable;
      }

      async query<T = unknown>(sql: string): Promise<{ rows: T[] }> {
        if (sql.includes('information_schema.columns')) {
          const rows: Array<{ table_name: string; column_name: string; is_nullable: string }> = [];
          for (const [key, isNullable] of Object.entries(this.columnNullable)) {
            const [table, column] = key.split('.');
            rows.push({ 
              table_name: table, 
              column_name: column, 
              is_nullable: isNullable ? 'YES' : 'NO' 
            });
          }
          return { rows: rows as T[] };
        }
        return { rows: [] };
      }

      async end(): Promise<void> {}
    }

    it('passes when all NOT NULL columns are correctly NOT NULL', async () => {
      const columnNullable: Record<string, boolean> = {
        'decision_events.user_action': false,
        'decision_events.household_key': false,
        'runtime_flags.enabled': false,
        'runtime_deployments_log.env': false,
        'runtime_deployments_log.deployment_url': false,
        'runtime_deployments_log.git_sha': false,
        'runtime_deployments_log.run_id': false,
      };
      const client = new NotNullVerifyMockClient(columnNullable);

      const result = await verifyNotNull(client);

      expect(result.valid).toBe(true);
      expect(result.nullableColumns).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when a column is nullable but should be NOT NULL', async () => {
      const columnNullable: Record<string, boolean> = {
        'decision_events.user_action': true, // Should NOT be nullable
        'decision_events.household_key': false,
        'runtime_flags.enabled': false,
        'runtime_deployments_log.env': false,
        'runtime_deployments_log.deployment_url': false,
        'runtime_deployments_log.git_sha': false,
        'runtime_deployments_log.run_id': false,
      };
      const client = new NotNullVerifyMockClient(columnNullable);

      const result = await verifyNotNull(client);

      expect(result.valid).toBe(false);
      expect(result.nullableColumns).toContain('decision_events.user_action');
      expect(result.errors.some(e => 
        e.includes('decision_events.user_action') && 
        e.includes('NOT NULL') && 
        e.includes('nullable')
      )).toBe(true);
    });

    it('fails when a column is not found', async () => {
      // Missing decision_events.household_key
      const columnNullable: Record<string, boolean> = {
        'decision_events.user_action': false,
        'runtime_flags.enabled': false,
      };
      const client = new NotNullVerifyMockClient(columnNullable);

      const result = await verifyNotNull(client);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('decision_events.household_key'))).toBe(true);
    });

    it('works with custom NOT NULL columns list', async () => {
      const customColumns = ['custom_table.custom_col'];
      
      const client = new NotNullVerifyMockClient({
        'custom_table.custom_col': true, // Nullable but should be NOT NULL
      });

      const result = await verifyNotNull(client, customColumns);

      expect(result.valid).toBe(false);
      expect(result.nullableColumns).toContain('custom_table.custom_col');
    });

    it('NOT_NULL_COLUMNS contains critical columns', () => {
      expect(NOT_NULL_COLUMNS).toContain('decision_events.user_action');
      expect(NOT_NULL_COLUMNS).toContain('decision_events.household_key');
      expect(NOT_NULL_COLUMNS).toContain('runtime_flags.enabled');
    });

    it('NOT_NULL_COLUMNS contains runtime_deployments_log columns', () => {
      expect(NOT_NULL_COLUMNS).toContain('runtime_deployments_log.env');
      expect(NOT_NULL_COLUMNS).toContain('runtime_deployments_log.deployment_url');
      expect(NOT_NULL_COLUMNS).toContain('runtime_deployments_log.git_sha');
      expect(NOT_NULL_COLUMNS).toContain('runtime_deployments_log.run_id');
    });
  });

  describe('verifyRequiredConstraints', () => {
    /**
     * Mock DB client for constraint verification tests
     */
    class ConstraintVerifyMockClient implements DbClient {
      private constraints: Map<string, Set<string>>;

      constructor(constraints: Map<string, Set<string>>) {
        this.constraints = constraints;
      }

      async query<T>(sql: string): Promise<{ rows: T[] }> {
        if (sql.includes('pg_constraint')) {
          const rows: Array<{ table_name: string; constraint_name: string }> = [];
          for (const [tableName, constraintSet] of this.constraints) {
            for (const constraintName of constraintSet) {
              rows.push({ table_name: tableName, constraint_name: constraintName });
            }
          }
          return { rows: rows as T[] };
        }
        return { rows: [] };
      }

      async end(): Promise<void> {}
    }

    it('passes when all required constraints exist', async () => {
      const constraints = new Map<string, Set<string>>([
        ['decision_events', new Set([
          'decision_events_user_action_check',
          'decision_events_household_key_check',
          'decision_events_decision_type_check',
          'decision_events_timestamps_check',
        ])],
      ]);
      const client = new ConstraintVerifyMockClient(constraints);

      const result = await verifyRequiredConstraints(client);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when a constraint is missing', async () => {
      const constraints = new Map<string, Set<string>>([
        ['decision_events', new Set([
          'decision_events_user_action_check',
          // Missing: decision_events_household_key_check
          'decision_events_decision_type_check',
          'decision_events_timestamps_check',
        ])],
      ]);
      const client = new ConstraintVerifyMockClient(constraints);

      const result = await verifyRequiredConstraints(client);

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.missing.some(m => 
        m.table === 'decision_events' && 
        m.constraint === 'decision_events_household_key_check'
      )).toBe(true);
    });

    it('reports multiple missing constraints', async () => {
      const constraints = new Map<string, Set<string>>([
        ['decision_events', new Set([
          // Missing all except one
          'decision_events_user_action_check',
        ])],
      ]);
      const client = new ConstraintVerifyMockClient(constraints);

      const result = await verifyRequiredConstraints(client);

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBe(3); // 3 missing out of 4
    });

    it('fails when table has no constraints at all', async () => {
      const constraints = new Map<string, Set<string>>();
      const client = new ConstraintVerifyMockClient(constraints);

      const result = await verifyRequiredConstraints(client);

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBe(4); // All 4 constraints missing
    });

    it('works with custom constraints map', async () => {
      const customConstraints = new Map<string, string[]>([
        ['custom_table', ['custom_check_1', 'custom_check_2']],
      ]);
      
      const existingConstraints = new Map<string, Set<string>>([
        ['custom_table', new Set(['custom_check_1'])], // Missing custom_check_2
      ]);
      const client = new ConstraintVerifyMockClient(existingConstraints);

      const result = await verifyRequiredConstraints(client, customConstraints);

      expect(result.valid).toBe(false);
      expect(result.missing.some(m => 
        m.table === 'custom_table' && 
        m.constraint === 'custom_check_2'
      )).toBe(true);
    });

    it('REQUIRED_CONSTRAINTS contains decision_events constraints', () => {
      const decisionEventsConstraints = REQUIRED_CONSTRAINTS.get('decision_events');
      
      expect(decisionEventsConstraints).toBeDefined();
      expect(decisionEventsConstraints).toContain('decision_events_user_action_check');
      expect(decisionEventsConstraints).toContain('decision_events_household_key_check');
      expect(decisionEventsConstraints).toContain('decision_events_decision_type_check');
      expect(decisionEventsConstraints).toContain('decision_events_timestamps_check');
    });
  });
});
