import fs from 'node:fs';
import path from 'node:path';

function read(filePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf-8');
}

describe('tier1 local runtime boundary', () => {
  it('mobile runtime does not call decision-os decision endpoint', () => {
    const tonight = read('app/tonight.tsx');
    const deal = read('app/deal.tsx');
    const joined = `${tonight}\n${deal}`;

    expect(joined.includes('/api/decision-os/decision')).toBe(false);
    expect(joined.includes('decision+api')).toBe(false);
  });

  it('boundary doc exists', () => {
    const docPath = path.resolve(process.cwd(), 'docs/tier1-local-runtime-boundary.md');
    expect(fs.existsSync(docPath)).toBe(true);
  });
});
