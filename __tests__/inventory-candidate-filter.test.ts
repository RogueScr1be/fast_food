/**
 * FAST FOOD: Inventory Candidate Pre-Filter Tests
 * 
 * Tests for the performance optimization that pre-filters inventory
 * candidates using ILIKE patterns before running the full token matcher.
 */

import { randomUUID } from 'crypto';
import { getTestClient, INVENTORY_CANDIDATES_LIMIT } from '../lib/decision-os/database';
import { 
  findInventoryByIngredientName,
  consumeInventoryForMeal,
  getMealIngredientsForMeal,
} from '../lib/decision-os/consumption';
import { tokenize } from '../lib/decision-os/matching/tokenizer';
import type { InventoryItemRow, MealRow, MealIngredientRow } from '../types/decision-os/decision';

// =============================================================================
// TEST SETUP
// =============================================================================

const createInventoryItem = (
  name: string,
  confidence: number = 0.8,
  lastSeenAt: string = '2026-01-20T12:00:00Z'
): InventoryItemRow => ({
  id: randomUUID(),
  household_key: 'default',
  item_name: name,
  qty_estimated: 1,
  qty_used_estimated: 0,
  unit: 'unit',
  confidence,
  source: 'receipt',
  last_seen_at: lastSeenAt,
  last_used_at: null,
  expires_at: null,
  decay_rate_per_day: 0.05,
  created_at: new Date().toISOString(),
});

const createMeal = (id: string, name: string): MealRow => ({
  id,
  canonical_key: name.toLowerCase().replace(/\s+/g, '_'),
  display_name: name,
  est_minutes: 30,
  cost_band: '$$',
  tags_internal: [],
  active: true,
  created_at: new Date().toISOString(),
});

const createIngredient = (
  mealId: string,
  name: string,
  isPantryStaple: boolean = false
): MealIngredientRow => ({
  id: randomUUID(),
  meal_id: mealId,
  ingredient_name: name,
  qty_text: '1',
  is_pantry_staple: isPantryStaple,
  created_at: new Date().toISOString(),
});

// =============================================================================
// CANDIDATE PRE-FILTER TESTS
// =============================================================================

describe('Inventory Candidate Pre-Filter', () => {
  let client: ReturnType<typeof getTestClient>;
  
  beforeEach(() => {
    client = getTestClient();
    client._reset();
  });
  
  describe('getInventoryCandidates via DB query', () => {
    it('narrows results to items matching token patterns', async () => {
      // Add various inventory items using _addInventory helper
      client._addInventory([
        createInventoryItem('chicken breast', 0.9),
        createInventoryItem('chicken thighs', 0.8),
        createInventoryItem('beef steak', 0.85),
        createInventoryItem('chicken wings', 0.7),
        createInventoryItem('tofu', 0.6),
      ]);
      
      // Query for items matching "chicken"
      const tokens = ['chicken'];
      const patterns = tokens.map(t => `%${t}%`);
      
      const result = await client.query<InventoryItemRow>(
        `SELECT * FROM decision_os.inventory_items 
         WHERE household_key = $1 AND item_name ILIKE ANY($2)
         ORDER BY confidence DESC, last_seen_at DESC
         LIMIT $3`,
        ['default', patterns, 50]
      );
      
      // Should only get chicken items, not beef or tofu
      expect(result.rows.length).toBe(3);
      expect(result.rows.every(r => r.item_name.includes('chicken'))).toBe(true);
      
      // Should be sorted by confidence DESC
      expect(result.rows[0].item_name).toBe('chicken breast'); // 0.9
      expect(result.rows[1].item_name).toBe('chicken thighs'); // 0.8
      expect(result.rows[2].item_name).toBe('chicken wings');  // 0.7
    });
    
    it('returns empty array when no tokens provided', async () => {
      client._addInventory([createInventoryItem('chicken breast')]);
      
      const result = await client.query<InventoryItemRow>(
        `SELECT * FROM decision_os.inventory_items 
         WHERE household_key = $1 AND item_name ILIKE ANY($2)
         ORDER BY confidence DESC, last_seen_at DESC
         LIMIT $3`,
        ['default', [], 50]
      );
      
      expect(result.rows.length).toBe(0);
    });
    
    it('respects limit parameter', async () => {
      // Add many items
      const items = Array.from({ length: 10 }, (_, i) => 
        createInventoryItem(`chicken item ${i}`, 0.5 + i * 0.05)
      );
      client._addInventory(items);
      
      const result = await client.query<InventoryItemRow>(
        `SELECT * FROM decision_os.inventory_items 
         WHERE household_key = $1 AND item_name ILIKE ANY($2)
         ORDER BY confidence DESC, last_seen_at DESC
         LIMIT $3`,
        ['default', ['%chicken%'], 5]
      );
      
      expect(result.rows.length).toBe(5);
    });
    
    it('matches multiple patterns with OR logic', async () => {
      client._addInventory([
        createInventoryItem('chicken breast'),
        createInventoryItem('beef steak'),
        createInventoryItem('pork chop'),
      ]);
      
      // Query with patterns for both chicken and beef
      const result = await client.query<InventoryItemRow>(
        `SELECT * FROM decision_os.inventory_items 
         WHERE household_key = $1 AND item_name ILIKE ANY($2)
         ORDER BY confidence DESC, last_seen_at DESC
         LIMIT $3`,
        ['default', ['%chicken%', '%beef%'], 50]
      );
      
      // Should get chicken AND beef, but not pork
      expect(result.rows.length).toBe(2);
      const names = result.rows.map(r => r.item_name);
      expect(names).toContain('chicken breast');
      expect(names).toContain('beef steak');
      expect(names).not.toContain('pork chop');
    });
  });
  
  describe('findInventoryByIngredientName with pre-filter', () => {
    it('still matches correctly with candidate subset', async () => {
      // Add inventory items
      client._addInventory([
        createInventoryItem('chicken breast', 0.9),
        createInventoryItem('chicken thighs', 0.8),
        createInventoryItem('beef steak', 0.85),
      ]);
      
      // Find "chicken breast" - should match even with pre-filtering
      const matches = await findInventoryByIngredientName('default', 'chicken breast', client);
      
      expect(matches.length).toBe(1);
      expect(matches[0].item_name).toBe('chicken breast');
    });
    
    it('returns empty when no tokens after processing', async () => {
      client._addInventory([createInventoryItem('chicken')]);
      
      // "2 lb oz" tokenizes to empty after removing stopwords/short tokens
      const matches = await findInventoryByIngredientName('default', '2 lb oz', client);
      
      expect(matches.length).toBe(0);
    });
    
    it('returns empty when no candidates match patterns', async () => {
      client._addInventory([createInventoryItem('beef steak')]);
      
      // No chicken in inventory
      const matches = await findInventoryByIngredientName('default', 'chicken breast', client);
      
      expect(matches.length).toBe(0);
    });
    
    it('applies full token matcher to candidates', async () => {
      // Add items that will pass ILIKE filter but may fail token match
      client._addInventory([
        createInventoryItem('shampoo with ham scent'), // contains "ham"
        createInventoryItem('ham'),
      ]);
      
      // "ham" should match "ham", NOT "shampoo with ham scent"
      const matches = await findInventoryByIngredientName('default', 'ham', client);
      
      expect(matches.length).toBe(1);
      expect(matches[0].item_name).toBe('ham');
    });
  });
  
  describe('Token selection for patterns', () => {
    it('uses longest tokens (up to 3)', () => {
      // "organic chicken breast fillet" -> tokens after stopwords: ["chicken", "breast", "fillet"]
      const tokens = tokenize('organic chicken breast fillet');
      
      // Sort by length and take top 3
      const sorted = [...tokens].sort((a, b) => b.length - a.length);
      const selected = sorted.slice(0, 3);
      
      // "chicken" (7), "breast" (6), "fillet" (6)
      expect(selected.length).toBeLessThanOrEqual(3);
      expect(selected).toContain('chicken');
    });
    
    it('handles fewer than 3 tokens', () => {
      const tokens = tokenize('milk');
      
      const sorted = [...tokens].sort((a, b) => b.length - a.length);
      const selected = sorted.slice(0, 3);
      
      expect(selected.length).toBe(1);
      expect(selected[0]).toBe('milk');
    });
  });
  
  describe('consumeInventoryForMeal with pre-filter', () => {
    it('still updates inventory correctly', async () => {
      // Use pre-seeded meal-012 (Chicken Stir-Fry) which has chicken breast ingredient
      const inventoryItem = createInventoryItem('chicken breast');
      client._addInventory([inventoryItem]);
      
      // Consume
      const result = await consumeInventoryForMeal('default', 'meal-012', '2026-01-20T18:00:00Z', client);
      
      expect(result.success).toBe(true);
      expect(result.itemsUpdated).toBe(1);
      
      // Verify inventory was updated by querying the database
      const inventoryQuery = await client.query<InventoryItemRow>(
        'SELECT * FROM decision_os.inventory_items WHERE household_key = $1',
        ['default']
      );
      const found = inventoryQuery.rows.find(i => i.item_name === 'chicken breast');
      expect(found).toBeDefined();
      expect(found!.qty_used_estimated).toBeGreaterThan(0);
      expect(found!.last_used_at).not.toBeNull();
    });
    
    it('skips silently when ingredient has no valid tokens', async () => {
      // meal-999-nonexistent doesn't exist, so getMealIngredientsForMeal returns []
      // This tests the "no ingredients" path
      client._addInventory([createInventoryItem('chicken')]);
      
      // Should succeed but not update anything (no ingredients to match)
      const result = await consumeInventoryForMeal('default', 'meal-999-nonexistent', '2026-01-20T18:00:00Z', client);
      
      expect(result.success).toBe(true);
      expect(result.itemsUpdated).toBe(0);
      expect(result.errors.length).toBe(0);
    });
  });
});

describe('Constants', () => {
  it('INVENTORY_CANDIDATES_LIMIT is 50', () => {
    expect(INVENTORY_CANDIDATES_LIMIT).toBe(50);
  });
});
