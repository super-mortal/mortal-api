/**
 * Download Lucide SVGs locally for offline use.
 * Run: node scripts/download-lucide-icons.mjs
 *
 * ## How to add a new icon
 * 1. Find the icon name at https://lucide.dev/icons
 * 2. Add it to the `neededIcons` array below
 * 3. Run: node scripts/download-lucide-icons.js
 * 4. Use it: <InlineIcon name="icon-name" />
 *
 * ## Rules
 * - ALL icons MUST be Lucide Icons (https://lucide.dev/icons)
 * - NEVER use CDN / external icon URLs
 * - Always download locally before using
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');

const neededIcons = [
  'layout-dashboard', 'key-round', 'plug', 'list', 'log-out', 'check', 'x',
  'trash-2', 'plus', 'pencil', 'copy', 'refresh-cw', 'search', 'calendar', 'filter',
  'chevron-down', 'chevron-left', 'chevron-right', 'chevron-up',
  'check-check', 'sparkles', 'zap', 'arrow-right', 'arrow-left',
  'loader-circle', 'bot', 'server', 'database', 'shield', 'clock',
  'trending-up', 'chart-line', 'chart-pie', 'chart-area', 'gauge',
  'activity', 'circle', 'circle-check', 'circle-x', 'circle-alert',
  'triangle-alert', 'info', 'toggle-left', 'toggle-right',
  'external-link', 'menu', 'home', 'hard-drive', 'cpu', 'globe',
  'settings', 'ellipsis-vertical', 'ban', 'funnel-x',
];

fs.mkdirSync(ICONS_DIR, { recursive: true });

(async () => {
  console.log(`Downloading ${neededIcons.length} icons to ${ICONS_DIR}...`);
  let success = 0;
  for (const name of neededIcons) {
    try {
      await new Promise((resolve, reject) => {
        const url = `https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/${name}.svg`;
        https.get(url, (res) => {
          if (res.statusCode !== 200) { console.warn(`  ⚠ ${name}: HTTP ${res.statusCode}`); resolve(false); return; }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            fs.writeFileSync(path.join(ICONS_DIR, `${name}.svg`), data);
            resolve(true);
          });
        }).on('error', reject);
      });
      success++;
      process.stdout.write(`\r  ${success}/${neededIcons.length}`);
    } catch (e) {
      console.error(`\n  ✗ ${name}: ${e.message}`);
    }
  }
  console.log(`\n✅ Done. ${success}/${neededIcons.length} icons downloaded.`);
})();
