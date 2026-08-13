const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'ride-intelligence.css'), 'utf8');

function functionSource(name) {
  const marker = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const found = marker.exec(html);
  assert.ok(found, `${name} must exist`);
  const start = found.index;
  const tail = html.slice(start + found[0].length);
  const next = tail.search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/);
  return html.slice(start, next === -1 ? html.length : start + found[0].length + next);
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

function ruleBody(selectorPattern) {
  const match = css.match(new RegExp(`${selectorPattern}\\s*\\{([^{}]*)\\}`, 's'));
  assert.ok(match, `missing CSS rule: ${selectorPattern}`);
  return match[1];
}

function numericProperty(selectorPattern, property) {
  const body = ruleBody(selectorPattern);
  const match = body.match(new RegExp(`${property}\\s*:\\s*(\\d+)px`));
  return match ? Number(match[1]) : null;
}

const routeScreenStart = html.indexOf('<div class="screen" id="screen-route">');
const routeScreenEnd = html.indexOf('<!-- Lazy growth surfaces', routeScreenStart);
assert.ok(routeScreenStart >= 0 && routeScreenEnd > routeScreenStart,
  'route screen markup must exist');
const routeScreen = html.slice(routeScreenStart, routeScreenEnd);
const context = functionSource('renderRouteContext');
const page = functionSource('renderRoutePage');
const lists = functionSource('renderRoutePageLists');
const previewRow = functionSource('routePagePreviewRowMarkup');
const walkCopy = functionSource('routePageWalkCopy');
const queue = functionSource('renderRollingQueue');
const bindPage = functionSource('bindRoutePageActions');
const loading = functionSource('setRouteReoptimizeLoading');
const reoptimizeActive = functionSource('reoptimizeActiveRoute');
const reoptimize = functionSource('reoptimize');
const fullDay = functionSource('buildFullDayRoute');
const contextMarkup = context.slice(context.indexOf('context.innerHTML'));

// Approved vertical hierarchy. The map thumbnail is part of the single
// Upcoming card shown in the supplied reference, not another dashboard.
ordered(routeScreen, [
  'route-top-bar',
  'route-context',
  'rolling-route-queue',
  'route-body'
], 'top-level route screen');
ordered(contextMarkup, [
  'rh-route-page-title',
  'rh-route-park',
  'statusMarkup'
], 'route identity and status hierarchy');
ordered(page, [
  'rh-upcoming-card',
  'map-container',
  'rh-up-next',
  'rh-route-full-itinerary',
  'rh-completed-card',
  'rh-route-utility-actions'
], 'secondary route-content hierarchy');
ordered(queue, [
  'rh-next-kicker',
  'rh-next-title',
  'rh-next-stats',
  'rh-next-reason',
  'rh-next-actions'
], 'primary Next Up card hierarchy');

// Header chrome follows the reference for both Quick and Full Day routes.
assert.match(routeScreen, /route-wordmark-button[\s\S]*ridehero-wordmark\.png/,
  'the approved RideHero wordmark must remain centered at the top');
assert.match(css, /body\.route-screen-active #screen-route \.route-top-bar\s*\{[^{}]*grid-template-columns\s*:\s*1fr[^{}]*justify-content\s*:\s*center/s,
  'the shared route header must center the wordmark');
assert.match(css, /body\.route-screen-active #screen-route \.route-top-bar>\.route-back-btn,[\s\S]*body\.route-screen-active #screen-route \.route-top-bar>\.top-bar-actions,[\s\S]*body\.route-screen-active #screen-route \.route-growth-actions\s*\{\s*display\s*:\s*none!important\s*\}/,
  'secondary header/growth controls must not clutter either mode');
assert.match(css, /body\.route-screen-active \.app-nav,[\s\S]*body\.route-screen-active \.catalog-context-action\s*\{\s*display\s*:\s*none!important\s*\}/,
  'the normal app footer must not compete with route actions');

// One compact bar owns mode, progress, and freshness. It may wrap only at
// controlled segment boundaries on narrow phones.
assert.match(context, /class="rh-route-status"[^>]*>[\s\S]*class="rh-route-mode"[\s\S]*class="rh-route-progress"[\s\S]*class="rh-route-wait-status/,
  'route status content must stay in one visual bar');
assert.match(context, /currentMode\s*===\s*['"]quick['"]\s*\?\s*['"]Quick Route['"]\s*:\s*['"]Maximize My Day['"]/,
  'the compact bar must be mode-aware');
assert.match(context, /currentWaitFreshness\(currentRide\)[\s\S]*waitFreshnessCopy\(freshness\)/,
  'freshness must be derived from the active stop');
assert.match(context, /statusMarkup\s*=\s*state\.totalCount\s*>\s*0\s*\?/,
  'the compact status bar must only appear for a real route');
assert.match(css, /\.rh-route-status\s*\{[^{}]*display\s*:\s*flex[^{}]*flex-wrap\s*:\s*wrap[^{}]*max-width\s*:\s*100%/s,
  'the status bar must wrap safely without squeezing text');
assert.match(css, /\.rh-route-mode\s*\{[^{}]*white-space\s*:\s*nowrap/s,
  'the mode label must never collapse into character columns');
assert.match(css, /\.rh-route-progress\s*\{[^{}]*white-space\s*:\s*nowrap/s,
  'route progress must remain a readable phrase');
assert.match(css, /\.rh-route-wait-status\s*\{[^{}]*min-width\s*:\s*0[^{}]*overflow-wrap\s*:\s*break-word/s,
  'freshness copy must wrap by words inside the bar');
assert.match(css, /\.rh-route-wait-status\.is-fresh>i[\s\S]*\.rh-route-wait-status\.is-stale>i[\s\S]*\.rh-route-wait-status\.is-unavailable>i/,
  'fresh, stale, and unavailable statuses need distinct visual indicators');

// Main card proportions and truthful action states.
assert.match(queue, /<article class="rh-next-card ride-intelligence-card" aria-labelledby="rh-next-title"/,
  'Next Up must be one semantic dominant card');
assert.match(queue, /freshness\.waitMinutes\s*==\s*null[\s\S]*Unavailable/,
  'a missing wait must not become a fabricated zero');
assert.match(queue, /insight\.walkMinutes\s*==\s*null[\s\S]*Unavailable/,
  'a missing walking estimate must remain unavailable');
assert.match(queue, /insight\.walkApproximate[\s\S]*About/,
  'approximate walking must be visibly qualified');
assert.match(queue, /unavailable\s*\?[\s\S]*data-rh-reoptimize-route[\s\S]*insight\.walkMinutes\s*==\s*null[\s\S]*data-rh-open-map-primary[\s\S]*data-rh-start-walking/,
  'the primary CTA must switch between Re-optimize, Open Map, and Start Walking truthfully');
assert.match(queue, /class="rh-next-star"[^>]*data-rh-route-options[^>]*aria-label=/,
  'the quiet star/options affordance must remain a labeled button');
assert.doesNotMatch(queue, /data-rh-favorite/i,
  'the star must not imply an unimplemented favorite state');
assert.doesNotMatch(queue, /Tower of Terror|Hollywood Studios|22 min|6 min walk|2 of 6/,
  'no supplied-reference example values may enter production markup');

const nextCardRule = ruleBody('body\\.route-screen-active #screen-route \\.rh-next-card');
assert.match(nextCardRule, /border-radius\s*:\s*24px/,
  'the primary card must use the approved large corner radius');
assert.match(nextCardRule, /box-shadow\s*:\s*0 8px 28px rgba\(13,27,76,\.075\)/,
  'the primary card shadow must remain soft and restrained');
assert.match(ruleBody('body\\.route-screen-active #screen-route \\.rh-next-stats'), /grid-template-columns\s*:\s*repeat\(2,minmax\(0,1fr\)\)/,
  'wait and walk must remain two equal shrink-safe metrics');
const ctaHeight = numericProperty('body\\.route-screen-active #screen-route \\.rh-next-primary', 'min-height');
assert.ok(ctaHeight !== null && ctaHeight >= 52 && ctaHeight <= 60,
  'the primary CTA must retain the approved 52–60px touch target');

// Upcoming has only two rows in the main view, with one shrink-safe name
// column and a compact truthful wait/walk stack.
assert.match(lists, /remaining\.slice\(0,\s*2\)/,
  'the main Upcoming card must contain at most two stops');
assert.match(previewRow, /rh-up-next-name[\s\S]*rh-up-next-details[\s\S]*rh-up-next-wait[\s\S]*rh-up-next-walk[\s\S]*rh-up-next-arrow/,
  'upcoming rows must match the approved information density');
assert.match(previewRow, /waitLabel\(ride,\s*true\)[\s\S]*routePageWalkCopy\(fromRide,\s*ride\)/,
  'upcoming metrics must be generated from existing route data');
assert.match(walkCopy, /Walk unavailable[\s\S]*verified[\s\S]*About/,
  'upcoming walk copy must handle unavailable, verified, and approximate data');
assert.match(css, /\.rh-up-next-row\s*\{[^{}]*grid-template-columns\s*:\s*30px minmax\(0,1fr\) minmax\(76px,auto\) 18px/s,
  'the normal upcoming row needs a shrink-safe ride-name track');
assert.match(css, /\.rh-up-next-name strong\s*\{[^{}]*overflow-wrap\s*:\s*break-word[^{}]*word-break\s*:\s*normal/s,
  'long ride names must wrap naturally, never by character');
assert.match(css, /\.rh-up-next-details\s*\{[^{}]*flex-direction\s*:\s*column[^{}]*align-items\s*:\s*flex-end/s,
  'wait and walk must remain a clean right-aligned stack');
assert.match(css, /\.rh-up-next-button:focus-visible\s*\{[^{}]*outline\s*:/s,
  'the fully tappable upcoming row needs a visible keyboard focus state');

// Completed rides are collapsed by default and visually secondary.
assert.match(page, /<section class="rh-completed-card"[\s\S]*<button class="rh-completed-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="rh-completed-list"[\s\S]*id="rh-completed-list"[^>]*hidden/,
  'completed stops must start collapsed behind one accessible row');
assert.match(lists, /state\.completedIds\.has\(id\)[\s\S]*completedStops[\s\S]*completedToggle\.disabled/,
  'the disclosure must be driven only by real completed stops');
assert.match(bindPage, /completedToggle\.onclick[\s\S]*list\.hidden[\s\S]*aria-expanded[\s\S]*list\.focus/,
  'completed disclosure must update visibility, ARIA, and focus together');
const completedHeight = numericProperty('\\.rh-completed-toggle', 'min-height');
assert.ok(completedHeight >= 44,
  'the completed disclosure must retain a touch-friendly target');

// Bottom utility card remains one balanced action surface. Re-optimization
// exposes an accessible mode-aware loading lifecycle.
assert.match(page, /<nav class="rh-route-utility-actions" aria-label="Route actions">[\s\S]*data-rh-open-map[\s\S]*data-rh-reoptimize-route/,
  'Map and Re-optimize must be grouped in one labeled action bar');
assert.match(ruleBody('\\.rh-route-utility-actions'), /grid-template-columns\s*:\s*repeat\(2,minmax\(0,1fr\)\)/,
  'bottom actions must remain equal columns');
const utilityHeight = numericProperty('body\\.route-screen-active #screen-route \\.rh-route-utility-actions button', 'min-height');
assert.ok(utilityHeight >= 44,
  'each bottom action must be fully touch friendly');
assert.match(css, /\.rh-route-utility-actions button\+button\s*\{[^{}]*border-left\s*:\s*1px solid #e8ebef/,
  'the two bottom actions must retain the subtle central divider');
assert.match(bindPage, /data-rh-open-map[\s\S]*classList\.toggle\(['"]is-map-active['"]\)[\s\S]*activeParkMapController\.setCompact/,
  'Map must expand the existing map controller');
assert.match(loading, /disabled\s*=\s*loading[\s\S]*aria-busy[\s\S]*Updating route/,
  'Re-optimize must expose a visible and accessible loading state');
assert.match(reoptimizeActive, /Promise\.resolve\(reoptimize[\s\S]*\.finally[\s\S]*setRouteReoptimizeLoading\(false\)/,
  'loading must clear on both success and failure');
assert.match(reoptimize, /currentMode\s*===\s*['"]fullday['"]\s*\?\s*buildFullDayRoute\(\)\s*:\s*optimizeRoute\(\)/,
  'the shared action must keep Quick and Full Day engines separate');

// Empty, unavailable, and completed states use the same calm card language.
assert.match(queue, /No active route[\s\S]*data-rh-plan-day[\s\S]*Plan My Day/,
  'no-route state needs a clean planning CTA');
assert.match(queue, /No available next ride[\s\S]*data-rh-empty-reoptimize[\s\S]*Re-optimize/,
  'unavailable routes need an immediate recovery CTA');
assert.match(queue, /Route Complete[\s\S]*View Day Summary[\s\S]*Share My Day/,
  'completion state must replace Next Up with the approved celebration actions');
assert.match(css, /\.rh-route-empty-state\s*\{[^{}]*border-radius\s*:\s*24px[^{}]*box-shadow\s*:/s,
  'all non-happy states must use the same polished card treatment');
assert.match(css, /\.rh-route-empty-actions button\s*\{[^{}]*min-height\s*:\s*48px/s,
  'empty/completion actions must remain accessible touch targets');

// Main-screen information density: no old dashboard, duplicate freshness, or
// developer/provider details. Full Day keeps logic, not its old visual shell.
for (const source of [context, page, queue]) {
  assert.doesNotMatch(source, /Park Data Health|provider health|coverage snapshot|data confidence percentage|internal ID/i,
    'consumer route rendering must not expose internal data-health terminology');
}
assert.doesNotMatch(context, /routeLocationSourceCopy|Using your location|Starting from/,
  'the exact header must not add a second location-status row');
assert.doesNotMatch(queue, /rh-next-freshness-line|Waits updated .*rh-next/i,
  'wait freshness belongs only in the compact header bar');
assert.doesNotMatch(fullDay, /route-hero|route-stats|steps-section|Saved route order/,
  'Full Day must not reintroduce the removed dashboard hierarchy');
assert.match(fullDay, /filteredRides\(\)[\s\S]*renderRoutePage\(fullRoute\.map/,
  'Full Day must preserve its candidate logic while sharing the approved UI');

// Responsive containment for the requested 320/360/390/430 widths. A max-340
// contract deliberately covers 320px-class phones.
for (const width of [430, 390, 360, 340]) {
  assert.match(css, new RegExp(`@media \\(max-width:${width}px\\)`),
    `${width === 340 ? '320px-class' : width + 'px'} phones need an explicit CSS contract`);
}
assert.match(css, /@media \(max-width:430px\)\{[\s\S]*body\.route-screen-active #screen-route \.rolling-route-queue,[\s\S]*padding-left:18px;padding-right:18px/,
  '430px phones need stable shared route gutters');
assert.match(css, /@media \(max-width:360px\)\{[\s\S]*body\.route-screen-active #screen-route \.rolling-route-queue,[\s\S]*padding-left:12px;padding-right:12px/,
  '360px and narrower phones need compact but safe gutters');
assert.match(css, /@media \(max-width:360px\)\{[\s\S]*\.rh-route-status\{width:100%[\s\S]*\.rh-route-wait-status\{flex-basis:100%/,
  'the status bar must use a controlled freshness-row wrap on narrow phones');
assert.match(css, /@media \(max-width:340px\)\{[\s\S]*\.rh-up-next-row\{grid-template-columns:25px minmax\(0,1fr\) minmax\(62px,auto\) 14px/,
  '320px-class upcoming rows must retain useful name and metric columns');
assert.match(css, /body\.route-screen-active #screen-route \.rh-route-context,[\s\S]*max-width:610px/,
  'tablet and desktop route content must stay calm and readable');
assert.match(css, /@media \(prefers-reduced-motion:reduce\)[\s\S]*\.rh-route-context \*[\s\S]*transition:none!important/,
  'route interactions must respect reduced-motion preferences');
assert.match(css, /body\.route-screen-active #screen-route \.rh-route-map-card:not\(\.is-map-active\)>\.map-wrap,[\s\S]*\.rh-map-walk-chip[\s\S]*display:none!important/,
  'the resting route view must collapse the map preview without deleting the real map host');
assert.match(css, /@media \(max-width:430px\) and \(max-height:700px\)[\s\S]*\.route-top-bar\{min-height:44px[\s\S]*\.rh-next-card\{border-radius:17px[\s\S]*\.rh-route-utility-actions button\{min-height:44px/,
  '320x568-class phones need a compact single-screen hierarchy with accessible controls');
assert.match(css, /@media \(max-width:340px\) and \(max-height:620px\)[\s\S]*#rh-up-next-list>\.rh-up-next-row:nth-child\(n\+2\)\{display:none\}/,
  'short 320px-class screens must keep one upcoming ride and leave all others behind View full route');
assert.doesNotMatch(css, /route-screen-active[^{}]*overflow\s*:\s*hidden/,
  'single-screen compaction must not trap enlarged text or expanded route content');

console.log('Approved-reference shared Your Route visual contracts passed.');
