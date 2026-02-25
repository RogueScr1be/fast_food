import fs from 'node:fs';
import path from 'node:path';

const SCREEN_FILES = [
  'app/tonight.tsx',
  'app/deal.tsx',
  'app/checklist/[recipeId].tsx',
  'app/rescue/[mealId].tsx',
];

const FORBIDDEN_USER_VISIBLE_TERMS = /(weather|geo_bucket|temp_bucket|hour_block|season)/i;

describe('UI magic contract', () => {
  test('decision flow screens do not expose hidden context labels', () => {
    for (const relativeFile of SCREEN_FILES) {
      const fullPath = path.join(process.cwd(), relativeFile);
      const source = fs.readFileSync(fullPath, 'utf8');
      const stringLiterals = source.match(/(['"`])(?:\\.|(?!\1).)*\1/g) ?? [];

      const leakedLiteral = stringLiterals.find((literal) =>
        FORBIDDEN_USER_VISIBLE_TERMS.test(literal),
      );

      expect(leakedLiteral).toBeUndefined();
    }
  });
});
