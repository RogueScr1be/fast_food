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
});
