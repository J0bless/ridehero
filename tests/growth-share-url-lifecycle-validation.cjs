'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'js', 'growth-loader.js'), 'utf8');
const growth = fs.readFileSync(path.join(root, 'js', 'growth-engine.js'), 'utf8');

// A direct /r/<share-id> request is rewritten to index.html. Relative asset URLs
// would otherwise resolve below /r/ and make a valid shared link cold-load blank.
const baseMatch = html.match(/<base\s+[^>]*href=["']([^"']+)["'][^>]*>/i);
const hasOriginRootBase = !!(baseMatch && new URL(baseMatch[1], 'https://ridehero.example/r/example').pathname === '/');
const loaderAssetPaths = Array.from(loader.matchAll(/loadScript\(['"]([^'"]+)['"]/g), match => match[1]);
const loaderStyleMatch = loader.match(/link\.href\s*=\s*['"]([^'"]*growth-engine\.css)/);
if (loaderStyleMatch) loaderAssetPaths.push(loaderStyleMatch[1]);
const htmlAssetPaths = Array.from(html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi), match => match[1])
  .filter(value => !/^(?:https?:|data:|mailto:|tel:|#)/i.test(value));
assert.ok(
  hasOriginRootBase || loaderAssetPaths.concat(htmlAssetPaths).every(value => value.startsWith('/')),
  'direct shared-route cold loads need <base href="/"> or origin-relative local asset paths'
);

function section(start, end) {
  const from = growth.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = end ? growth.indexOf(end, from + start.length) : growth.length;
  return growth.slice(from, to === -1 ? growth.length : to);
}

// Leaving a personal share must remove its payload/token from the address bar.
// This applies to every escape route, including error-state back/plan-own actions
// and successful import. Merely resetting metadata is not URL cleanup.
assert.match(
  growth,
  /function\s+clearSharedRouteUrl\s*\([^)]*\)\s*\{[\s\S]*?history\.replaceState\s*\(/,
  'sharing UI needs one explicit history.replaceState-based URL cleanup helper'
);
const failure = section('function renderSharedFailure', 'function confirmReplace');
assert.ok((failure.match(/clearSharedRouteUrl\s*\(/g) || []).length >= 2,
  'shared-route failure Back and Plan My Own Route must both clean the share URL');
assert.match(section('async function joinSharedRoute', 'function renderSharedLanding'), /clearSharedRouteUrl\s*\(/,
  'joining a route must clean the personal share URL after import');
assert.match(section('function renderSharedLanding', 'async function openSharedRouteFromUrl'), /clearSharedRouteUrl\s*\(/,
  'the shared landing Back action must clean the personal share URL');
assert.match(section('async function openSharedRouteFromUrl', 'global.RideHeroSeo'), /clearSharedRouteUrl\s*\(/,
  'the shared-route loading Back action must clean the personal share URL');

console.log('Shared-route cold-load and URL lifecycle contracts passed.');
