import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');
const outFile = join(distDir, 'healthz.json');
const buildSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local';

const payload = {
  ok: true,
  buildSha,
  buildTime: new Date().toISOString(),
};

if (process.env.VERCEL_ENV) {
  payload.vercelEnv = process.env.VERCEL_ENV;
}

if (process.env.VERCEL_GIT_COMMIT_REF) {
  payload.gitRef = process.env.VERCEL_GIT_COMMIT_REF;
}

await mkdir(distDir, { recursive: true });
await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`wrote ${outFile}`);
