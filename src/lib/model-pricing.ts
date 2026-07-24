// ============================================================
// Model Pricing — CRUD + Cost Calculation
// NOTE: model_id column's SEMANTIC is now "public_name" (alias if set, else upstream model_id)
// See db.ts v6 migration.
// ============================================================
import { getDb } from './db';
import { ModelPricing } from './types';

export function getModelPricing(modelId: string): ModelPricing | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM model_pricing WHERE model_id = ?').get(modelId) as ModelPricing | undefined;
}

export function listAllPricing(): ModelPricing[] {
  const db = getDb();
  return db.prepare('SELECT * FROM model_pricing ORDER BY model_id').all() as ModelPricing[];
}

export function upsertModelPricing(data: {
  model_id: string;
  prompt_price: number;
  completion_price: number;
  cached_prompt_price: number;
}): ModelPricing {
  const db = getDb();
  db.prepare(`
    INSERT INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)
    VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))
    ON CONFLICT(model_id) DO UPDATE SET
      prompt_price = excluded.prompt_price,
      completion_price = excluded.completion_price,
      cached_prompt_price = excluded.cached_prompt_price,
      updated_at = datetime('now', '+8 hours')
  `).run(data.model_id, data.prompt_price, data.completion_price, data.cached_prompt_price);
  return getModelPricing(data.model_id)!;
}

/** Calculate cost for a request. `modelId` must be the public_name (alias if set, else upstream id). */
export function calculateCost(
  modelId: string,  // public_name
  promptTokens: number,
  completionTokens: number,
  cachedInputTokens: number
): number {
  const pricing = getModelPricing(modelId);
  if (!pricing) return 0;
  const uncachedInput = Math.max(0, promptTokens - cachedInputTokens);
  const cost =
    (uncachedInput / 1_000_000) * pricing.prompt_price +
    (cachedInputTokens / 1_000_000) * pricing.cached_prompt_price +
    (completionTokens / 1_000_000) * pricing.completion_price;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
