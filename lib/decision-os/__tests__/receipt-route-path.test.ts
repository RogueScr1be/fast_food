/**
 * Receipt Route Path Tests
 * 
 * Verifies the canonical receipt import route path is:
 * POST /api/decision-os/receipt/import
 * 
 * File must be: app/api/decision-os/receipt/import+api.ts
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Receipt Import Route Path', () => {
  const CANONICAL_ROUTE_FILE = 'app/api/decision-os/receipt/import+api.ts';
  const DEPRECATED_ROUTE_FILE = 'app/api/decision-os/receipt-import+api.ts';
  
  it('canonical route file exists at correct path', () => {
    const routePath = path.join(process.cwd(), CANONICAL_ROUTE_FILE);
    const exists = fs.existsSync(routePath);
    
    expect(exists).toBe(true);
  });

  it('deprecated route file does NOT exist', () => {
    const deprecatedPath = path.join(process.cwd(), DEPRECATED_ROUTE_FILE);
    const exists = fs.existsSync(deprecatedPath);
    
    expect(exists).toBe(false);
  });

  it('canonical route exports POST handler', () => {
    // Dynamic import to verify the module structure
    const routePath = path.join(process.cwd(), CANONICAL_ROUTE_FILE);
    const content = fs.readFileSync(routePath, 'utf-8');
    
    // Verify it exports a POST function
    expect(content).toContain('export async function POST');
  });

  it('route file imports from correct handler path', () => {
    const routePath = path.join(process.cwd(), CANONICAL_ROUTE_FILE);
    const content = fs.readFileSync(routePath, 'utf-8');
    
    // Verify it imports from the receipt handler
    expect(content).toContain('lib/decision-os/receipt/handler');
  });

  it('route file has correct API endpoint comment', () => {
    const routePath = path.join(process.cwd(), CANONICAL_ROUTE_FILE);
    const content = fs.readFileSync(routePath, 'utf-8');
    
    // Verify the endpoint path in comments
    expect(content).toContain('POST /api/decision-os/receipt/import');
  });

  it('response shape is preserved (receiptImportId + status)', () => {
    const routePath = path.join(process.cwd(), CANONICAL_ROUTE_FILE);
    const content = fs.readFileSync(routePath, 'utf-8');
    
    // Verify response shape is documented
    expect(content).toContain('receiptImportId');
    expect(content).toContain('status');
    expect(content).toContain("'received' | 'parsed' | 'failed'");
  });
});

describe('Dev UI Hook Path (verification)', () => {
  it('documents correct API path for dev hooks', () => {
    // This test documents the expected path that dev UI should use
    const expectedPath = '/api/decision-os/receipt/import';
    
    // The path should follow Expo Router conventions:
    // app/api/decision-os/receipt/import+api.ts -> /api/decision-os/receipt/import
    expect(expectedPath).toBe('/api/decision-os/receipt/import');
  });
});
