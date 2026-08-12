const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'ride-intelligence.css'), 'utf8');

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const tail = html.slice(start + marker.length);
  const next = tail.search(/\nfunction\s+[A-Za-z_$][\w$]*\s*\(/);
  return html.slice(start, next === -1 ? html.length : start + marker.length + next);
}

function ordered(source, fragments, message) {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1);
    assert.notEqual(next, -1, `${message}: missing ${fragment}`);
    assert.ok(next > cursor, `${message}: ${fragment} is out of order`);
    cursor = next;
  }
}

function hasQuickHiddenRule(selectorNeedle) {
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rulePattern.exec(css))) {
    const selectors = match[1].split(',');
    const hides = /display\s*:\s*none(?:\s*!important)?/.test(match[2]);
    if (hides && selectors.some((selector) =>
      selector.includes('body') && selector.includes('.mode-quick') && selector.includes(selectorNeedle)
    )) return true;
  }
  return false;
}

function absentOrQuickHidden(markup, marker, selectorDescription, selectorNeedle) {
  if (!markup.includes(marker)) return;
  assert.ok(
    hasQuickHiddenRule(selectorNeedle),
    `${selectorDescription} must not be visible on the reference-style Quick Route page`
  );
}

function numericPropertyFor(selectorPattern, property) {
  const match = css.match(new RegExp(`${selectorPattern}\\s*\\{[^{}]*${property}\\s*:\\s*(\\d+)px`, 's'));
  return match ? Number(match[1]) : null;
}

const routeScreenStart = html.indexOf('<div class="screen" id="screen-route">');
const routeScreenEnd = html.indexOf('<!-- Lazy growth surfaces', routeScreenStart);
assert.ok(routeScreenStart >= 0 && routeScreenEnd > routeScreenStart, 'route screen markup must exist');
const routeScreen = html.slice(routeScreenStart, routeScreenEnd);
const routeTopBarEnd = routeScreen.indexOf('<section class="rh-route-context"');
const routeTopBar = routeScreen.slice(0, routeTopBarEnd);

const context = functionSource('renderRouteContext');
const page = functionSource('renderQuickRoutePage');
const lists = functionSource('renderQuickRouteLists');
const previewRow = functionSource('quickRoutePreviewRowMarkup');
const bindPage = functionSource('bindQuickRoutePageActions');
const queue = functionSource('renderRollingQueue');
const fullDay = functionSource('buildFullDayRoute');

// The reference has a centered RideHero wordmark and no visible header chrome.
assert.match(routeTopBar, /ridehero-wordmark\.png/, 'the route header must use the approved RideHero wordmark');
absentOrQuickHidden(routeTopBar, 'route-back-btn', 'the Back control', '.route-back-btn');
absentOrQuickHidden(routeTopBar, 'top-bar-actions', 'the Share / Friends header controls', '.top-bar-actions');
absentOrQuickHidden(routeScreen, 'route-growth-actions', 'the trailing Share Route / End Route panel', '.route-growth-actions');
assert.match(css, /body\.mode-quick[^{}]*#screen-route[^{}]*\.route-top-bar\s*\{[^{}]*(?:justify-content\s*:\s*center|grid-template-columns\s*:\s*(?:1fr|auto))/s,
  'the Quick Route header must center the wordmark instead of reserving side-action columns');

// Match the reference hierarchy: title, park, route/progress, then location.
ordered(context, [
  'rh-route-page-title',
  'rh-route-park',
  'rh-route-progress',
  'rh-route-location'
], 'route summary hierarchy');
assert.match(context, /PARK_META\[currentPark\]/, 'the park title must come from selected park data');
assert.match(context, /state\.completedCount[\s\S]*state\.totalCount/, 'route progress must come from session state');
assert.match(context, /routeLocationSourceCopy\(\)/, 'location source must use the truthful centralized copy');
absentOrQuickHidden(context, 'rh-route-context-actions', 'Change Mode / Change Park links', '.rh-route-context-actions');

// Match the reference card order while retaining only meaningful, data-backed output.
ordered(queue, [
  'rh-next-kicker',
  'rh-next-title',
  'rh-next-stats',
  'rh-next-reason',
  'rh-next-primary'
], 'Next Up card hierarchy');
assert.match(queue, /freshness\.waitMinutes/, 'wait display must use the current freshness model');
assert.match(queue, /insight\.walkMetricValue[\s\S]*insight\.walkMetricLabel/, 'walk display must use the routing insight');
assert.match(queue, /reasonText/, 'recommendation copy must come from evidence-backed reasoning');
assert.match(queue, /data-rh-start-walking/, 'Start Walking must remain the single prominent card CTA');
assert.doesNotMatch(queue, /Tower of Terror|Hollywood Studios|22 min|6 min walk|2 of 6/, 'reference examples must never become fabricated runtime values');
if (/rh-next-star/.test(queue)) {
  assert.match(queue, /<button class="rh-next-star"[^>]*data-rh-route-options[^>]*aria-label=/,
    'a reference-style star must be a labeled, semantic route-options control—not decoration');
  assert.match(queue, /optionsButton\.onclick\s*=\s*openQuickRouteOptions/,
    'the star must open real route options');
  assert.match(html, /function openQuickRouteOptions\s*\(/,
    'the star handler must be implemented');
}
assert.doesNotMatch(queue, /data-rh-favorite/i, 'do not imply a favorite feature that RideHero does not implement');
absentOrQuickHidden(queue, 'rh-next-freshness-line', 'the extra wait-freshness row', '.rh-next-freshness-line');
absentOrQuickHidden(queue, 'rh-why-details', 'the expanded Why panel', '.rh-why-details');
absentOrQuickHidden(queue, 'rh-next-secondary-actions', 'the secondary Complete / Skip row', '.rh-next-secondary-actions');

// The real map, then a maximum of two truthful upcoming rows, then the utility bar.
ordered(page, [
  'rh-route-map-card',
  'id="map-container"',
  'rh-up-next',
  'rh-route-utility-actions'
], 'route body hierarchy');
assert.match(page, /renderRouteMapSafely\(routeOrder\)/, 'the map must use RideHero route data');
assert.doesNotMatch(page, /Tower of Terror|Hollywood Studios|Rock ['’]n['’] Roller|Mickey/, 'the route view must not hard-code the mockup itinerary');
assert.match(lists, /slice\(0, 2\)/, 'the compact Up Next block must contain no more than two rows');
assert.match(lists, /classifyExperience\(ride\) === 'ride'/, 'Quick Route Up Next must remain rides-only');
assert.match(previewRow, /waitLabel\(ride, true\)/, 'upcoming waits must use the existing truthful formatter');
if (/rh-up-next-arrow|data-rh-preview-route/.test(html)) {
  assert.match(html, /<button class="rh-up-next-row rh-up-next-button"[^>]*data-rh-preview-route[^>]*aria-label=/,
    'reference chevrons are allowed only on semantic, labeled preview controls');
  assert.match(lists, /\[data-rh-preview-route\][\s\S]*setQuickFullRouteOpen\(true\)/,
    'tapping an upcoming row must open the real full route after every list refresh');
}
assert.doesNotMatch(lists, /♟/, 'do not use an unrelated chess pawn as the walking icon');
absentOrQuickHidden(page, 'rh-route-map-heading', 'the extra map-title strip', '.rh-route-map-heading');

// Keep the visual density of the supplied portrait reference rather than a tall map/dashboard.
const mapMax = (() => {
  const match = css.match(/\.rh-park-map-viewport\s*\{[^{}]*height\s*:\s*clamp\([^,]+,[^,]+,\s*(\d+)px\)/s);
  return match ? Number(match[1]) : numericPropertyFor('body\\.mode-quick[^{}]*\\.rh-park-map-viewport', 'height');
})();
assert.ok(mapMax !== null && mapMax <= 190, 'the reference map is a shallow route strip (maximum 190px), not a tall map panel');
const ctaHeight = numericPropertyFor('body\\.mode-quick[^{}]*\\.rh-next-primary', 'min-height');
assert.ok(ctaHeight !== null && ctaHeight >= 52 && ctaHeight <= 60, 'Start Walking should retain the reference-sized 52–60px touch target');
assert.match(css, /\.rh-route-utility-actions\s*\{[^{}]*grid-template-columns\s*:\s*repeat\(2,minmax\(0,1fr\)\)/s,
  'Map and Re-optimize must remain a balanced two-column utility bar');

// Explicit mobile rails prevent clipping at every requested target width.
for (const width of [430, 390, 360]) {
  assert.match(css, new RegExp(`@media \\(max-width:${width}px\\)`), `${width}px needs an explicit route layout contract`);
}
assert.match(css, /body\.mode-quick #screen-route (?:\.rolling-route-queue|#route-body)[^{}]*\{[^{}]*(?:padding-left|padding)\s*:\s*(?:1[2-9]|2[0-4])px/s,
  'Quick Route needs safe 12–24px mobile gutters');
assert.match(css, /\.rh-up-next-row\s*\{[^{}]*grid-template-columns\s*:\s*\d+px minmax\(0,1fr\) auto/s,
  'Up Next names need a shrink-safe middle column at 320–430px');

// The redesign is scoped: Full Day still owns its strategic filter/timeline/map flow.
assert.match(fullDay, /filteredRides\(\)/, 'Full Day must retain ride/attraction/both filtering');
assert.match(fullDay, /class="route-hero"/);
assert.match(fullDay, /class="route-stats"/);
assert.match(fullDay, /id="map-container"/);
assert.doesNotMatch(fullDay, /rh-route-dashboard|rh-next-card|rh-up-next/, 'reference dashboard markup must remain Quick-only');

console.log('Exact-reference Quick Route UI contracts passed.');
