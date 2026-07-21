/**
 * 修复 model_pricing 表：将已设置别名的价格记录从原始 model_id 迁移到别名 key
 *
 * 背景：旧版保存价格时用的是原始上游 model_id（如 oc/deepseek-v4-flash-free），
 * 新版改为优先使用别名（如 deepseek-v4-flash）作为 pricing key。
 * 但已存的数据不会自动迁移，导致计费查询按别名找不到价格 → return 0。
 *
 * 运行：cd project-root && node scripts/fix-pricing-keys.js
 */

const { getDb } = require('./src/lib/db');

function main() {
  const db = getDb();

  // 获取所有 model_aliases（带上游 model_id）
  const aliases = db.prepare(`
    SELECT ma.alias_name, cm.model_id as upstream_model_id
    FROM model_aliases ma
    JOIN channel_models cm ON cm.id = ma.channel_model_id
    WHERE ma.is_active = 1
  `).all();

  if (aliases.length === 0) {
    console.log('没有找到别名，无需修复');
    return;
  }

  console.log(`找到 ${aliases.length} 个别名映射：`);
  aliases.forEach(a => console.log(`  ${a.upstream_model_id} → ${a.alias_name}`));

  let fixed = 0;
  let skipped = 0;

  for (const alias of aliases) {
    // 检查是否已有以别名为 key 的价格记录
    const existingByAlias = db.prepare('SELECT * FROM model_pricing WHERE model_id = ?').get(alias.alias_name);
    if (existingByAlias) {
      console.log(`  跳过 ${alias.upstream_model_id}：别名 ${alias.alias_name} 已有价格记录`);
      skipped++;
      continue;
    }

    // 查找以原始上游 ID 为 key 的价格记录
    const oldPricing = db.prepare('SELECT * FROM model_pricing WHERE model_id = ?').get(alias.upstream_model_id);
    if (!oldPricing) {
      console.log(`  跳过 ${alias.upstream_model_id}：无价格记录`);
      skipped++;
      continue;
    }

    // 迁移：删除旧记录，插入新记录
    db.transaction(() => {
      db.prepare('DELETE FROM model_pricing WHERE model_id = ?').run(alias.upstream_model_id);
      db.prepare(`
        INSERT INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)
        VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))
      `).run(alias.alias_name, oldPricing.prompt_price, oldPricing.completion_price, oldPricing.cached_prompt_price);
    })();

    console.log(`  ✅ ${alias.upstream_model_id} → ${alias.alias_name}（价格 ${oldPricing.prompt_price}/${oldPricing.completion_price}）`);
    fixed++;
  }

  console.log(`\n完成：修复 ${fixed} 条，跳过 ${skipped} 条`);
}

main();
