// ============================================================
// Admin Pricing API — GET (list) + POST (upsert)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { listAllPricing, upsertModelPricing } from '@/lib/model-pricing';

export async function GET(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  return NextResponse.json({ pricing: listAllPricing() });
}

export async function POST(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const body = await request.json();
    const pricing = upsertModelPricing({
      model_id: body.model_id,
      prompt_price: Number(body.prompt_price) || 0,
      completion_price: Number(body.completion_price) || 0,
      cached_prompt_price: Number(body.cached_prompt_price) || 0,
    });
    return NextResponse.json({ pricing });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
