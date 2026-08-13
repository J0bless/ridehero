const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'ride-intelligence.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const marker = '/* Option 1 — Balanced Brand';
const start = css.indexOf(marker);

assert.notEqual(start, -1, 'the approved Balanced Brand color layer must be identifiable');
const layer = css.slice(start);

assert.match(layer, /body\.mode-quick\.route-screen-active\{[\s\S]*--rh-route-accent:#d62828;[\s\S]*--rh-route-detail:#f26b38;/,
  'Quick Route must remain RideHero red with coral detail');
assert.match(layer, /body\.mode-strategic\.route-screen-active\{[\s\S]*--rh-route-accent:#334e68;[\s\S]*--rh-route-detail:#5a98d9;/,
  'Maximize My Day must use the approved navy and updated blue');
assert.match(layer, /\.rh-next-stat-icon\.is-walk\{[\s\S]*color:var\(--rh-green,#4e7a4e\);[\s\S]*background:#e4f1e5;/,
  'walking details must retain a labeled, semantic green treatment');
assert.match(layer, /\.rh-completed-toggle\{\s*background:#f0f7f1;/,
  'completed-route disclosure may use a restrained green surface');
assert.match(layer, /\.rh-up-next-wait\{\s*color:var\(--rh-vintage-blue,#334e68\);/,
  'ordinary upcoming waits must remain neutral instead of implying every wait is favorable');
assert.doesNotMatch(layer, /gradient|purple|pink/i,
  'the approved option must not introduce gradients, purple, or pink');
assert.doesNotMatch(layer, /(?:^|\n)\s*(?:width|min-width|max-width|height|min-height|max-height|margin|padding|gap|display|position|transform|overflow|font-size|line-height|grid-template-columns)\s*:/m,
  'the color layer must not change the validated one-screen geometry');

assert.match(html, /css\/ride-intelligence\.css\?v=8/,
  'the document must request the new route color stylesheet version');
assert.match(worker, /const CACHE_NAME = 'ridehero-shell-v31'/,
  'the app shell cache must advance for the live visual update');
assert.match(worker, /\.\/css\/ride-intelligence\.css\?v=8/,
  'the new route color stylesheet must be available offline');

console.log('Balanced Brand Quick Route and Maximize My Day color contracts passed.');
