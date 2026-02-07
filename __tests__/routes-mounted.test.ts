/**
 * MVP Route Existence Tests
 * 
 * Ensures all required route files exist at build time.
 * Prevents "static export success but runtime navigation failure" surprises.
 */

import fs from 'fs';
import path from 'path';

describe('MVP routes exist', () => {
  const mustExist = [
    'app/index.tsx',
    'app/deal.tsx',
    'app/checklist/[recipeId].tsx',
    'app/rescue/[mealId].tsx',
    'app/tonight.tsx',
    'app/profile.tsx',
    'app/_layout.tsx',
  ];

  for (const routePath of mustExist) {
    it(`exists: ${routePath}`, () => {
      const fullPath = path.resolve(process.cwd(), routePath);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  }
});

describe('Root layout registers MVP routes', () => {
  it('_layout.tsx contains deal route registration', () => {
    const layoutPath = path.resolve(process.cwd(), 'app/_layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('name="deal"');
  });

  it('_layout.tsx contains checklist route registration', () => {
    const layoutPath = path.resolve(process.cwd(), 'app/_layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('name="checklist/[recipeId]"');
  });

  it('_layout.tsx contains index route registration', () => {
    const layoutPath = path.resolve(process.cwd(), 'app/_layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('name="index"');
  });

  it('_layout.tsx contains rescue route registration', () => {
    const layoutPath = path.resolve(process.cwd(), 'app/_layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('name="rescue/[mealId]"');
  });
});
