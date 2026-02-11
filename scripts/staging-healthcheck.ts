#!/usr/bin/env node
/**
 * Staging Healthcheck Script (static web deploy)
 *
 * Verifies the deployed build exposes /healthz.json and that
 * the payload reports ok:true.
 *
 * Usage:
 *   STAGING_URL=https://your-app.vercel.app npm run staging:healthcheck
 */

interface HealthzPayload {
  ok?: boolean;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const baseUrl = process.env.STAGING_URL;

  if (!baseUrl) {
    console.error('ERROR: STAGING_URL environment variable not set');
    process.exit(1);
  }

  const normalized = baseUrl.replace(/\/+$/, '');
  const healthzUrl = `${normalized}/healthz.json`;

  console.log(`Checking ${healthzUrl}`);

  let response: Response;
  try {
    response = await fetch(healthzUrl);
  } catch (error) {
    console.error(`FAIL healthz_request_error: ${(error as Error).message}`);
    process.exit(1);
  }

  if (response.status !== 200) {
    console.error(`FAIL healthz_status: expected 200, got ${response.status}`);
    process.exit(1);
  }

  let payload: HealthzPayload;
  try {
    payload = (await response.json()) as HealthzPayload;
  } catch {
    console.error('FAIL healthz_json_invalid');
    process.exit(1);
  }

  if (payload.ok !== true) {
    console.error('FAIL healthz_ok_false');
    process.exit(1);
  }

  console.log('PASS healthz_ok_true');
  console.log(JSON.stringify(payload));
}

main().catch((error) => {
  console.error(`FAIL healthz_unhandled: ${(error as Error).message}`);
  process.exit(1);
});
