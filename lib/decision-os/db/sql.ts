/**
 * SQL Helper Functions for Tenant-Safe Dialect
 * 
 * These helpers ensure consistent SQL patterns that pass the SQL Style Contract.
 * Use them when writing SQL queries involving tenant tables.
 * 
 * Contract: $1 is ALWAYS household_key for tenant-scoped queries.
 */

/**
 * Generate WHERE clause for tenant predicate.
 * 
 * @param alias - Table alias (e.g., 'de' for decision_events)
 * @returns SQL fragment: `<alias>.household_key = $1`
 * 
 * @example
 * // Single table query
 * `SELECT * FROM decision_events de WHERE ${tenantWhere('de')}`
 * // Produces: SELECT * FROM decision_events de WHERE de.household_key = $1
 */
export function tenantWhere(alias: string): string {
  return `${alias}.household_key = $1`;
}

/**
 * Generate AND clause for tenant predicate (for JOINs).
 * 
 * @param alias - Table alias (e.g., 'ri' for receipt_imports)
 * @returns SQL fragment: `AND <alias>.household_key = $1`
 * 
 * @example
 * // Join query
 * `SELECT * FROM decision_events de 
 *  JOIN receipt_imports ri ON ri.id = de.receipt_id
 *  WHERE ${tenantWhere('de')} ${tenantAnd('ri')}`
 * // Produces: ... WHERE de.household_key = $1 AND ri.household_key = $1
 */
export function tenantAnd(alias: string): string {
  return `AND ${alias}.household_key = $1`;
}

/**
 * Generate ON CONFLICT clause with household_key.
 * 
 * @param additionalColumns - Other columns in the conflict target
 * @returns SQL fragment: `ON CONFLICT (household_key, ...columns)`
 * 
 * @example
 * `INSERT INTO inventory_items (household_key, item_name, ...)
 *  VALUES ($1, $2, ...)
 *  ${tenantConflict('item_name')} DO UPDATE SET ...`
 * // Produces: ON CONFLICT (household_key, item_name) DO UPDATE SET ...
 */
export function tenantConflict(...additionalColumns: string[]): string {
  const columns = ['household_key', ...additionalColumns].join(', ');
  return `ON CONFLICT (${columns})`;
}

/**
 * Generate UPDATE WHERE clause with household_key first.
 * 
 * @param alias - Table name or alias (optional for simple updates)
 * @returns SQL fragment starter for WHERE clause
 * 
 * @example
 * `UPDATE receipt_imports SET status = $2 ${tenantUpdateWhere()} AND id = $3`
 * // Produces: UPDATE receipt_imports SET status = $2 WHERE household_key = $1 AND id = $3
 */
export function tenantUpdateWhere(alias?: string): string {
  if (alias) {
    return `WHERE ${alias}.household_key = $1`;
  }
  return 'WHERE household_key = $1';
}

/**
 * Standard table aliases for tenant tables.
 * Use these consistently across the codebase.
 */
export const TABLE_ALIASES = {
  decision_events: 'de',
  receipt_imports: 'ri',
  inventory_items: 'ii',
  taste_signals: 'ts',
  taste_meal_scores: 'tms',
} as const;

/**
 * Type for table alias keys
 */
export type TenantTableName = keyof typeof TABLE_ALIASES;
