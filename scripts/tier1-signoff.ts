#!/usr/bin/env node
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

type Status = 'PASS' | 'FAIL' | 'SKIP';

interface Gate {
  name: string;
  command: string;
  requiredEnv?: string[];
  requiredEnvAny?: string[][];
  blocking: boolean;
}

interface Result {
  gate: Gate;
  status: Status;
  detail: string;
}

const gates: Gate[] = [
  { name: 'tier1_test', command: 'npm run test:tier1', blocking: true },
  { name: 'tier1_lint', command: 'npm run lint:tier1', blocking: true },
  { name: 'tier1_typecheck', command: 'npm run typecheck:tier1', blocking: true },
  { name: 'build_sanity', command: 'npm run build:sanity', blocking: true },
  {
    name: 'staging_healthcheck',
    command: 'npm run staging:healthcheck',
    requiredEnvAny: [['STAGING_WEB_URL'], ['STAGING_URL']],
    blocking: true,
  },
  {
    name: 'auth_require_401',
    command: 'npm run auth:sanity:require401',
    requiredEnvAny: [['STAGING_API_URL'], ['STAGING_URL']],
    blocking: true,
  },
  {
    name: 'auth_require_200',
    command: 'npm run auth:sanity:require200',
    requiredEnv: ['STAGING_AUTH_TOKEN'],
    requiredEnvAny: [['STAGING_API_URL'], ['STAGING_URL']],
    blocking: true,
  },
  {
    name: 'tier1_smoke_staging',
    command: 'npm run smoke:tier1:staging',
    requiredEnv: ['STAGING_AUTH_TOKEN'],
    requiredEnvAny: [['STAGING_API_URL'], ['STAGING_URL']],
    blocking: true,
  },
  {
    name: 'legacy_smoke_non_blocking',
    command: 'npm run smoke:staging',
    requiredEnv: ['STAGING_URL', 'STAGING_AUTH_TOKEN'],
    blocking: false,
  },
];

function hasRequiredEnv(requiredEnv?: string[]): { ok: boolean; missing: string[] } {
  if (!requiredEnv || requiredEnv.length === 0) return { ok: true, missing: [] };
  const missing = requiredEnv.filter((key) => !process.env[key]);
  return { ok: missing.length === 0, missing };
}

function hasAnyRequiredEnv(requiredEnvAny?: string[][]): { ok: boolean; missing: string[] } {
  if (!requiredEnvAny || requiredEnvAny.length === 0) return { ok: true, missing: [] };
  const ok = requiredEnvAny.some((group) => group.every((key) => Boolean(process.env[key])));
  return { ok, missing: requiredEnvAny.flat() };
}

function runGate(gate: Gate): Result {
  const envCheck = hasRequiredEnv(gate.requiredEnv);
  if (!envCheck.ok) {
    return {
      gate,
      status: 'SKIP',
      detail: `missing_env=${envCheck.missing.join(',')}`,
    };
  }

  const anyEnvCheck = hasAnyRequiredEnv(gate.requiredEnvAny);
  if (!anyEnvCheck.ok) {
    return {
      gate,
      status: 'SKIP',
      detail: `missing_any_env=${anyEnvCheck.missing.join('|')}`,
    };
  }

  try {
    execSync(gate.command, {
      stdio: 'pipe',
      env: process.env,
      maxBuffer: 1024 * 1024 * 8,
    });
    return { gate, status: 'PASS', detail: 'ok' };
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'status' in error
        ? `exit_status=${String((error as { status?: number }).status ?? '1')}`
        : 'command_failed';
    return { gate, status: 'FAIL', detail };
  }
}

function writeReport(results: Result[]): string {
  const now = new Date();
  const iso = now.toISOString();
  const slug = iso.replace(/[:.]/g, '-');
  const reportsDir = path.resolve(process.cwd(), 'docs/reports/tier1-signoff');
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `${slug}.md`);

  const lines: string[] = [];
  lines.push('# Tier 1 Signoff Evidence');
  lines.push('');
  lines.push(`- Generated at: ${iso}`);
  lines.push(`- Workspace: ${process.cwd()}`);
  lines.push('');
  lines.push('| Gate | Blocking | Status | Detail |');
  lines.push('|---|---|---|---|');
  for (const result of results) {
    lines.push(
      `| ${result.gate.name} | ${result.gate.blocking ? 'yes' : 'no'} | ${result.status} | ${result.detail} |`,
    );
  }
  lines.push('');
  lines.push('## Summary');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const skipCount = results.filter((r) => r.status === 'SKIP').length;
  lines.push(`- PASS: ${passCount}`);
  lines.push(`- FAIL: ${failCount}`);
  lines.push(`- SKIP: ${skipCount}`);
  lines.push('');
  lines.push('## Notes');
  lines.push('- SKIP means required staging environment variables were not available at execution time.');
  lines.push('- Promotion requires all blocking gates to PASS in staging.');

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf-8');
  return reportPath;
}

function main(): void {
  const results = gates.map(runGate);
  const reportPath = writeReport(results);
  console.log(`PASS signoff_report_written path=${reportPath}`);

  const failBlocking = results.some((result) => result.gate.blocking && result.status === 'FAIL');
  const requireStaging = process.env.TIER1_SIGNOFF_REQUIRE_STAGING === 'true';
  const skippedBlocking = results.some((result) => result.gate.blocking && result.status === 'SKIP');

  if (failBlocking) {
    process.exit(1);
  }

  if (requireStaging && skippedBlocking) {
    console.error('FAIL blocking_staging_gates_skipped');
    process.exit(1);
  }
}

main();
