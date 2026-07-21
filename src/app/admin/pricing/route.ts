// ============================================================
// Admin Pricing API — GET (list) + POST (upsert)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { listAllPricing, upsertModelPricing } from '@/lib/model-pricing';
import { findChannelsWithSamePricingKey } from '@/lib/channels';

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

    // 确定 pricing key：优先使用 pricing_key 字段，否则用 model_id
    const pricingKey = body.pricing_key || body.model_id;

    const pricing = upsertModelPricing({
      model_id: pricingKey,
      prompt_price: Number(body.prompt_price) || 0,
      completion_price: Number(body.completion_price) || 0,
      cached_prompt_price: Number(body.cached_prompt_price) || 0,
    });

    // 如果传了 channel_model_id，查询同步信息
    let syncedChannels: Array<{ channel_id: string; channel_name: string }> = [];
    if (body.channel_model_id) {
      const result = findChannelsWithSamePricingKey(body.channel_model_id);
      syncedChannels = result.channels;
    }

    return NextResponse.json({ pricing, syncedChannels, syncedCount: syncedChannels.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
