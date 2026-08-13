const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'ride-intelligence.css'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

function functionSource(name) {
  const marker = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const found = marker.exec(html);
  assert.ok(found, `${name} must exist`);
  const start = found.index;
  const tail = html.slice(start + found[0].length);
  const next = tail.search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/);
  return html.slice(start, next === -1 ? html.length : start + found[0].length + next);
}

function ruleBody(source, selectorPattern) {
  const match = source.match(new RegExp(`${selectorPattern}\\s*\\{([^{}]*)\\}`, 's'));
  assert.ok(match, `missing CSS rule: ${selectorPattern}`);
  return match[1];
}

const startWalking = functionSource('startWalkingToCurrentRide');
const guidance = functionSource('announceRouteGuidance');
const waitCopy = functionSource('waitFreshnessCopy');
const queue = functionSource('renderRollingQueue');
const lists = functionSource('renderRoutePageLists');
const page = functionSource('renderRoutePage');
const bindPage = functionSource('bindRoutePageActions');
const classify = functionSource('classifyExperience');
const quickCandidates = functionSource('quickRideCandidates');
const resume = functionSource('resumePersistedRideHeroRoute');

// Start Walking reveals only the compact map preview and announces the change
// without inserting the large inline notice that caused the live mismatch.
assert.match(startWalking, /getElementById\(['"]rh-route-map-card['"]\)[\s\S]*classList\.add\(['"]is-walking-preview['"]\)/,
  'Start Walking must reveal the compact preview on the existing route map card');
assert.match(startWalking, /activeParkMapController\.setCompact\(true\)/,
  'Start Walking must keep the real map controller in compact mode');
assert.match(startWalking, /classList\.remove\(['"]is-map-active['"]\)[\s\S]*aria-expanded['"],\s*['"]false['"][\s\S]*mapLabel\.textContent\s*=\s*['"]Map['"]/,
  'Start Walking must normalize an already-open inspector before showing the compact preview');
assert.match(startWalking, /announceRouteGuidance\(['"]Walking to ['"]?\s*\+/,
  'Start Walking must announce its state through the dedicated live region');
assert.doesNotMatch(startWalking, /setRouteIntelligenceNotice|\.click\(\)|classList\.add\(['"]is-map-active['"]\)/,
  'Start Walking must not open the detailed inspector or add a large inline notice');
assert.match(html, /class="rh-route-guidance-status" id="route-guidance-status" role="status" aria-live="polite" aria-atomic="true"/,
  'walking guidance needs a dedicated polite status region');
assert.match(guidance, /status\.textContent\s*=\s*['"][^'"]*['"][\s\S]*setTimeout[\s\S]*status\.textContent\s*=\s*String\(message/,
  'the walking announcement must reliably retrigger assistive technology');
assert.match(css, /\.rh-route-guidance-status\s*\{[^{}]*position:absolute[^{}]*width:1px[^{}]*height:1px[^{}]*clip-path:inset\(50%\)/s,
  'the live announcement must not consume route-page space');

// The real compact map is now the resting secondary panel at every supported
// height; the detailed inspector remains a separate explicit state.
assert.match(css, /body\.route-screen-active #screen-route \.rh-route-map-card:not\(\.is-map-active\)>\.map-wrap\{display:block!important\}/,
  'the default route view must always show the real compact map preview');
assert.match(css, /body\.route-screen-active #screen-route \.rh-route-map-card:not\(\.is-map-active\)>\.rh-map-walk-chip:not\(\[hidden\]\)\{display:inline-flex!important\}/,
  'the compact preview must retain its truthful walking chip');
assert.match(css, /body\.route-screen-active #screen-route \.rh-route-map-card:not\(\.is-map-active\) \.rh-park-map-viewport\{height:clamp\(108px,30vw,142px\)\}/,
  'the resting map must remain bounded and compact');
assert.match(css, /\.rh-route-map-card\.is-walking-preview:not\(\.is-map-active\)>\.map-wrap\{display:block!important\}[\s\S]*\.is-walking-preview:not\(\.is-map-active\)>\.rh-map-walk-chip:not\(\[hidden\]\)\{display:inline-flex!important\}/,
  'Start Walking must reveal the compact preview at shorter heights');
assert.match(css, /\.rh-route-map-card\.is-map-active>\.rh-map-walk-chip\{display:none!important\}/,
  'the compact walk chip must not duplicate information in the detailed inspector');

// Detailed Map has an explicit, accessible close path with synchronized state,
// controller density, labels, and focus restoration.
assert.match(page, /id="rh-route-map-title" tabindex="-1">Route map<\/h2><button class="rh-route-map-close" type="button" data-rh-close-map aria-label="Close detailed route map">Close<\/button>/,
  'the detailed map needs a labeled close control and focusable heading');
assert.match(bindPage, /function setMapInspectorOpen[\s\S]*classList\.toggle\(['"]is-map-active['"],\s*expanded\)[\s\S]*aria-expanded[\s\S]*Close Map[\s\S]*activeParkMapController\.setCompact\(!expanded\)/,
  'map expansion must synchronize class, ARIA, visible label, and controller mode');
assert.match(bindPage, /if \(expanded\)[\s\S]*rh-route-map-title[\s\S]*heading\.focus\(\{\s*preventScroll:true\s*\}\)[\s\S]*returnFocus[\s\S]*mapButton\.focus/,
  'opening must focus the map heading and closing must restore focus to Map');
assert.match(bindPage, /data-rh-close-map[\s\S]*setMapInspectorOpen\(document\.getElementById\(['"]rh-route-map-card['"]\),\s*false,\s*true\)/,
  'the explicit Close control must collapse the inspector and request focus restoration');
assert.match(css, /\.rh-route-map-close\s*\{[^{}]*min-height:44px/s,
  'the detailed map Close button must retain a touch-friendly target');
assert.match(css, /\.rh-route-map-close:focus-visible\{[^{}]*outline:/s,
  'the detailed map Close button must expose keyboard focus');

// Missing waits and one-stop routes must stay truthful and compact. A usable
// walk estimate may still offer Start Walking when the live wait is unavailable.
assert.match(waitCopy, /return ['"]Live waits unavailable['"]/,
  'unavailable wait copy must be concise');
assert.doesNotMatch(waitCopy, /temporarily unavailable/i,
  'the compact freshness line must not use the old oversized-notice wording');
assert.match(queue, /freshness\.waitMinutes\s*==\s*null\s*\?\s*['"]<strong>Unavailable<\/strong>/,
  'a missing wait must render Unavailable, never zero');
assert.match(queue, /insight\.walkMinutes\s*==\s*null[\s\S]*data-rh-open-map-primary[\s\S]*data-rh-start-walking/,
  'a real walk estimate must preserve Start Walking even when wait data is absent');
assert.doesNotMatch(page, /id="rh-up-next-list"/,
  'Upcoming rows must not appear beside the resting map');
assert.match(page, /id="rh-route-full-itinerary"[^>]*hidden[\s\S]*id="rh-route-full-list"/,
  'the complete route must remain available behind View full route');

// Tree of Life is a park landmark/walkthrough, not a Quick Route ride. The
// classification must protect both new optimization and restored old sessions.
const classifyContext = {};
vm.runInNewContext(`${classify}\nresult = classifyExperience({ name:'Tree of Life' });`, classifyContext);
assert.equal(classifyContext.result, 'attraction',
  'Tree of Life must classify as an attraction');
assert.match(quickCandidates, /classifyExperience\(r\)\s*===\s*['"]ride['"]/,
  'new Quick Route candidate pools must accept rides only');
assert.match(resume, /invalidQuickType\s*=\s*currentMode\s*===\s*['"]quick['"][\s\S]*classifyExperience\(ride\)\s*!==\s*['"]ride['"][\s\S]*unavailable\s*=\s*!ride\s*\|\|\s*invalidQuickType/,
  'resumed Quick routes must mark saved non-rides unavailable');
assert.match(resume, /routeRides\s*=\s*rows\.filter\(function\(row\)\{\s*return row\.ride && !row\.unavailable;/,
  'resumed Quick routes must exclude invalid non-rides before rendering');

// Option 1 keeps useful icon accents while removing the large colored metric
// blocks, decorative map rail, and colored utility buttons seen in production.
const optionMarker = css.lastIndexOf('/* Option 1');
assert.notEqual(optionMarker, -1, 'the Option 1 color layer must remain identifiable');
const optionLayer = css.slice(optionMarker);
assert.match(optionLayer, /body\.mode-quick\.route-screen-active\{[\s\S]*--rh-route-accent:#d62828;[\s\S]*--rh-route-detail:#f26b38;/,
  'Quick Route must retain the red/coral Option 1 identity');
assert.match(optionLayer, /body\.mode-strategic\.route-screen-active\{[\s\S]*--rh-route-accent:#334e68;[\s\S]*--rh-route-detail:#5a98d9;/,
  'Maximize My Day must retain the navy/blue Option 1 identity');
assert.match(ruleBody(optionLayer, '\\.rh-next-stat:first-child'), /background:transparent/,
  'the wait metric surface must remain neutral');
assert.match(ruleBody(optionLayer, '\\.rh-next-stat:last-child'), /background:transparent/,
  'the walk metric surface must remain neutral');
assert.match(optionLayer, /\.rh-next-stat-icon\.is-wait\{[^{}]*background:var\(--rh-route-accent/s,
  'the wait icon may retain the active mode accent');
assert.match(optionLayer, /\.rh-next-stat-icon\.is-walk\{[^{}]*color:var\(--rh-green/s,
  'the walking icon may retain its semantic green accent');
const mapCardRule = ruleBody(optionLayer, 'body\\.route-screen-active #screen-route \\.rh-route-map-card');
assert.match(mapCardRule, /border-color:rgba\(13,27,76,\.06\)!important/,
  'the map card border must remain neutral');
assert.match(mapCardRule, /box-shadow:0 8px 28px rgba\(13,27,76,\.07\)!important/,
  'the map card must use a soft neutral shadow');
assert.doesNotMatch(mapCardRule, /inset|--rh-route-detail/,
  'the map card must not restore the decorative colored rail');
assert.match(optionLayer, /\.rh-route-utility-actions button:first-child\{\s*color:#334e68;\s*\}[\s\S]*button:last-child\{\s*color:#334e68;/,
  'both utility actions must use the same quiet navy treatment');
assert.match(optionLayer, /button:first-child svg\{\s*background:transparent;\s*\}[\s\S]*button:last-child svg\{\s*background:transparent;/,
  'utility icons must not restore colored circular fills');

// A fresh app-shell key is required so installed/live clients receive the fix.
assert.match(html, /css\/ride-intelligence\.css\?v=8/,
  'the page must request route intelligence CSS v8');
assert.match(worker, /const CACHE_NAME = ['"]ridehero-shell-v33['"]/,
  'the service worker must use shell cache v33');
assert.match(worker, /\.\/css\/ride-intelligence\.css\?v=8/,
  'the service worker must precache route intelligence CSS v8');

console.log('Live route visual-regression contracts passed.');
