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

const viewState = functionSource('routePageViewState');
const context = functionSource('renderRouteContext');
const previewRow = functionSource('routePagePreviewRowMarkup');
const walkCopy = functionSource('routePageWalkCopy');
const lists = functionSource('renderRoutePageLists');
const fullRoute = functionSource('setQuickFullRouteOpen');
const loading = functionSource('setRouteReoptimizeLoading');
const reoptimizeActive = functionSource('reoptimizeActiveRoute');
const bindPage = functionSource('bindRoutePageActions');
const page = functionSource('renderRoutePage');
const quickPage = functionSource('renderQuickRoutePage');
const refreshPage = functionSource('refreshQuickRoutePage');
const queue = functionSource('renderRollingQueue');
const routeOptions = functionSource('openQuickRouteOptions');
const reoptimize = functionSource('reoptimize');
const resume = functionSource('resumePersistedRideHeroRoute');
const buildFullDay = functionSource('buildFullDayRoute');
const imported = functionSource('renderImportedSharedRoute');
const contextMarkup = context.slice(context.indexOf('context.innerHTML'));

// One shared page renderer owns the approved hierarchy for both planning modes.
assert.match(quickPage, /return\s+renderRoutePage\(routeStops,\s*options\)/,
  'the legacy Quick entry point must delegate to the shared route page');
assert.match(buildFullDay, /renderRoutePage\(fullRoute\.map/,
  'Maximize My Day must render through the shared approved route page');
assert.match(resume, /renderRoutePage\(routeRides,\s*\{\s*focusHeading:true\s*\}\)/,
  'saved Quick and Full Day routes must resume into the shared route page');
assert.match(imported, /renderRoutePage\(routeRides,\s*\{\s*focusHeading:true\s*\}\)/,
  'imported Quick and Full Day routes must use the shared route page');
assert.match(buildFullDay, /filteredRides\(\)/,
  'Full Day must retain its ride/attraction/both candidate policy');
assert.match(reoptimize, /currentMode\s*===\s*['"]fullday['"]\s*\?\s*buildFullDayRoute\(\)\s*:\s*optimizeRoute\(\)/,
  'Re-optimize must dispatch to the correct route engine for the current mode');

// Header: logo, one heading, park, then one combined progress/freshness bar.
assert.match(html, /class="top-bar route-top-bar"[\s\S]*class="route-wordmark-button"[\s\S]*ridehero-wordmark\.png/,
  'the route screen needs the centered RideHero wordmark');
ordered(contextMarkup, ['rh-route-page-title', 'rh-route-park', 'statusMarkup'],
  'route header hierarchy');
assert.match(context, /<h1 id="rh-route-page-title" tabindex="-1">Your Route<\/h1>/,
  'the page must expose one semantic Your Route heading');
assert.match(context, /PARK_META\[currentPark\]/,
  'the visible park name must come from current application state');
assert.match(viewState, /publicPlanningMode\(\)/,
  'route state must distinguish Quick from Full Day sessions');
assert.match(viewState, /completedIds\.size[\s\S]*savedStops\.length\s*\|\|\s*routeStops\.length/,
  'route progress must be calculated from real session data');
assert.match(context, /currentMode\s*===\s*['"]quick['"]\s*\?\s*['"]Quick Route['"]\s*:\s*['"]Maximize My Day['"]/,
  'the same status bar must label both supported planning modes');
assert.match(context, /currentWaitFreshness\(currentRide\)[\s\S]*waitFreshnessCopy\(freshness\)/,
  'the combined bar must use centralized wait freshness');
assert.match(context, /freshness\.freshness\s*===\s*['"]fresh['"][\s\S]*is-fresh[\s\S]*is-stale[\s\S]*is-unavailable/,
  'fresh, aging/stale, and unavailable status-dot states must be explicit');
assert.match(context, /class="rh-route-status"[\s\S]*rh-route-mode[\s\S]*rh-route-progress[\s\S]*rh-route-wait-status/,
  'mode, progress, and freshness must share one compact status bar');
assert.match(context, /statusMarkup\s*=\s*state\.totalCount\s*>\s*0\s*\?[\s\S]*:\s*['"]['"]/,
  'an empty route must not display a misleading zero-of-zero status bar');
assert.doesNotMatch(context, /routeLocationSourceCopy\(|rh-route-location|route data confidence|Park Data Health/i,
  'location/debug details must not create another main-header row');
assert.match(context, /focus\(\{\s*preventScroll\s*:\s*true\s*\}\)/,
  'entering a newly rendered route must move focus to the page heading');

// The shared page contains one integrated Upcoming card, a collapsed completed
// section, then the balanced Map / Re-optimize utility bar.
ordered(page, ['rh-upcoming-card', 'rh-up-next', 'rh-route-full-itinerary', 'rh-completed-card', 'rh-route-utility-actions'],
  'shared route-page sections');
assert.match(page, /class="rh-route-map-card rh-upcoming-card map-section"[\s\S]*id="map-container"/,
  'the compact Upcoming card must preserve the existing real map host');
assert.match(page, /<h2 id="rh-up-next-title">Upcoming<\/h2>/,
  'the secondary card must use the approved Upcoming heading');
assert.match(page, /data-rh-view-full-route[^>]*aria-expanded="false"[^>]*aria-controls="rh-route-full-itinerary"/,
  'View full route must be a semantic disclosure control');
assert.match(page, /id="rh-route-full-itinerary"[^>]*tabindex="-1"[^>]*hidden/,
  'the full itinerary must be hidden by default and focusable when opened');
assert.match(fullRoute, /itinerary\.hidden\s*=\s*!open[\s\S]*aria-expanded[\s\S]*itinerary\.focus/,
  'the full-route disclosure must synchronize visibility, ARIA, and focus');

// Upcoming rows show no more than two state-backed stops with both truthful
// wait and walking information. Quick still enforces rides-only; Full Day does not.
assert.match(lists, /remaining\.slice\(0,\s*2\)/,
  'the primary page must show only two upcoming stops');
assert.match(lists, /!state\.completedIds\.has\(id\)[\s\S]*!state\.skippedIds\.has\(id\)/,
  'completed and intentionally skipped stops must not reappear in Upcoming');
assert.match(lists, /currentMode\s*!==\s*['"]quick['"]\s*\|\|\s*classifyExperience\(ride\)\s*===\s*['"]ride['"]/,
  'Quick must remain rides-only without applying that restriction to Full Day');
assert.match(previewRow, /waitLabel\(ride,\s*true\)[\s\S]*routePageWalkCopy\(fromRide,\s*ride\)/,
  'each upcoming row must derive both wait and walk copy from real route inputs');
assert.match(previewRow, /<button class="rh-up-next-row rh-up-next-button"[^>]*data-rh-preview-route[^>]*aria-label=/,
  'the entire upcoming row must be a labeled semantic button');
assert.match(previewRow, /rh-up-next-name[\s\S]*rh-up-next-details[\s\S]*rh-up-next-wait[\s\S]*rh-up-next-walk[\s\S]*rh-up-next-arrow/,
  'upcoming rows must preserve name, wait, walk, and chevron hierarchy');
assert.match(walkCopy, /quality\s*!==\s*['"]neutral['"][\s\S]*Walk unavailable/,
  'unknown routing quality must never invent a walking estimate');
assert.match(walkCopy, /quality\s*===\s*['"]verified['"][\s\S]*map-calibrated[\s\S]*dataConfidence\s*===\s*['"]verified['"]/,
  'only verified routing may use exact walking copy');
assert.match(walkCopy, /About ['"]?\s*\+\s*minutes\s*\+\s*['"] min walk/,
  'non-verified estimates must be visibly approximate');
assert.match(lists, /\[data-rh-preview-route\][\s\S]*setQuickFullRouteOpen\(true\)/,
  'an upcoming-row tap must reveal the actual full route');

// Completed stops are secondary, truthful, and collapsed by default.
assert.match(page, /<button class="rh-completed-toggle"[^>]*data-rh-completed-toggle[^>]*aria-expanded="false"[^>]*aria-controls="rh-completed-list"/,
  'completed stops must use a collapsed semantic disclosure');
assert.match(page, /id="rh-completed-list"[^>]*tabindex="-1"[^>]*hidden/,
  'completed details must not consume initial page space');
assert.match(lists, /state\.completedIds\.has\(id\)/,
  'only completed session IDs may enter the completed list');
assert.match(lists, /displayCompletedIds\s*=\s*currentMode\s*===\s*['"]quick['"]\s*\?\s*state\.completedRideIds\s*:\s*state\.completedIds[\s\S]*completedStops\.length\s*\+\s*['"] ['"][\s\S]*currentMode\s*===\s*['"]quick['"]\s*\?\s*['"]rides['"]\s*:\s*['"]stops['"]/,
  'the completed label must be mode-aware and count only data-backed completed rides/stops');
assert.match(lists, /completionEventById\s*=\s*new Map\(state\.completedEvents[\s\S]*recordedWaitMinutes\s*:\s*completionEvent[\s\S]*ride\.recordedWaitMinutes/,
  'completed rows must use only the wait captured by the completion event, never the current live ride wait');
assert.doesNotMatch(lists, /recorded wait['"]\s*:\s*['"][\s\S]*ride\.waitTime/,
  'current live wait values must never be relabeled as recorded completion waits');
assert.match(lists, /completedToggle\.disabled\s*=\s*completedStops\.length\s*===\s*0/,
  'an empty completed disclosure must not behave like an active control');
assert.match(bindPage, /completedToggle\.setAttribute\(['"]aria-expanded['"][\s\S]*list\.focus\(\{\s*preventScroll\s*:\s*true\s*\}\)/,
  'completed expansion must synchronize ARIA and focus');

// Next Up is shared by Quick and Full Day and adapts honestly to missing or
// unavailable routing instead of presenting a fake Start Walking action.
ordered(queue, ['rh-next-kicker', 'rh-next-title', 'rh-next-stats', 'rh-next-reason', 'rh-next-actions'],
  'Next Up card hierarchy');
assert.match(queue, /freshness\.waitMinutes\s*==\s*null\s*\?\s*['"]<strong>Unavailable<\/strong>/,
  'missing waits must render unavailable, never zero');
assert.match(queue, /insight\.walkMinutes\s*==\s*null\s*\?\s*['"]<strong>Unavailable<\/strong>/,
  'missing walking data must render unavailable');
assert.match(queue, /insight\.walkApproximate\s*\?\s*['"]<i>About<\/i>/,
  'approximate walking metrics must be labeled');
assert.match(queue, /insight\.title[\s\S]*insight\.explanations/,
  'the concise recommendation must come from recommendation evidence');
assert.match(queue, /Temporarily unavailable[\s\S]*data-rh-reoptimize-route/,
  'a closed next stop must replace Start Walking with Re-optimize');
assert.match(queue, /insight\.walkMinutes\s*==\s*null[\s\S]*data-rh-open-map-primary[\s\S]*data-rh-start-walking/,
  'missing navigation must offer the map instead of pretending guidance exists');
assert.match(queue, /data-rh-start-walking[\s\S]*startWalkingToCurrentRide/,
  'available walking guidance must retain its real existing handler');
assert.match(queue, /<article class="rh-next-card ride-intelligence-card" aria-labelledby="rh-next-title"/,
  'Next Up must remain a labeled semantic card');
assert.doesNotMatch(queue, /Tower of Terror|Hollywood Studios|22 min|6 min walk|2 of 6/,
  'approved-reference example data must never be hard-coded');

// Re-optimization is mode-aware, stays on this page, and exposes one honest
// loading lifecycle through both utility and closure CTAs.
assert.match(page, /data-rh-reoptimize-route/,
  'the stable bottom action bar must expose Re-optimize');
assert.match(loading, /button\.disabled\s*=\s*loading[\s\S]*aria-busy[\s\S]*Updating route/,
  'Re-optimize must expose a disabled, accessible loading state');
assert.match(reoptimizeActive, /setRouteReoptimizeLoading\(true\)[\s\S]*Updating route[\s\S]*preserving completed and skipped stops[\s\S]*Promise\.resolve\(reoptimize[\s\S]*\.finally\(function\(\)\{\s*setRouteReoptimizeLoading\(false\)/,
  'loading must always clear after a successful or failed re-optimization');
assert.match(bindPage, /data-rh-reoptimize-route[\s\S]*reoptimizeActiveRoute\(['"]manual['"]\)/,
  'the utility action must re-optimize in place');
assert.match(queue, /reoptimizeActiveRoute\(['"]closure['"]\)/,
  'an unavailable current stop must use the same loading-safe re-optimization path');
assert.match(html, /role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
  'route update/loading messages must be announced politely');

// Required non-happy states remain usable instead of showing broken cards.
assert.match(queue, /No active route[\s\S]*data-rh-plan-day[\s\S]*Plan My Day/,
  'no-route state must provide a direct planning action');
assert.match(queue, /No available next ride[\s\S]*data-rh-empty-reoptimize[\s\S]*Re-optimize/,
  'temporarily unavailable routes must retain a recovery action');
assert.match(queue, /Route Complete[\s\S]*data-rh-day-summary[\s\S]*View Day Summary[\s\S]*data-rh-share-day[\s\S]*Share My Day/,
  'completed routes must show the approved summary/share actions');
assert.match(queue, /completedCount[\s\S]*completedStops[\s\S]*completedRides/,
  'completion copy must come from real route-session counts');
assert.match(queue, /matchingLatest\s*=\s*latest\s*&&\s*latest\.parkId\s*===\s*currentPark\s*&&\s*latest\.planningMode\s*===\s*publicPlanningMode\(\)[\s\S]*completedCount\s*=\s*matchingLatest[\s\S]*completedRoute\s*=\s*allDone\s*\|\|\s*!!\(matchingLatest/,
  'a completion card must never reuse a summary from another park or planning mode');
assert.match(queue, /RideHeroGrowthLoader\.openDaySummary\(['"]completed['"]\)/,
  'completion actions must open the existing day-summary workflow');

// Map and live refreshes reuse existing route machinery.
assert.match(page, /ensureRouteStartControls\(\)[\s\S]*renderRouteMapSafely\(routeOrder\)/,
  'the shared page must preserve real route-start and map behavior');
assert.match(bindPage, /function setMapInspectorOpen[\s\S]*classList\.toggle\(['"]is-map-active['"],\s*expanded\)[\s\S]*aria-expanded[\s\S]*activeParkMapController\.setCompact\(!expanded\)/,
  'Map must expand and collapse the existing map controller through the shared inspector helper');
assert.match(refreshPage, /renderRouteContext[\s\S]*renderRoutePageLists[\s\S]*activeParkMapController\.setStops/,
  'live updates must refresh status, upcoming/completed lists, and the existing map in place');

// Secondary intelligence and lifecycle tools remain one interaction deeper.
assert.match(routeOptions, /manualClearCurrentStop/,
  'Mark complete must remain available behind route options');
assert.match(routeOptions, /skipCurrentRide/,
  'Skip must remain available behind route options');
assert.match(routeOptions, /routeLocationSourceCopy/,
  'location source remains available one level deeper');
assert.match(routeOptions, /openRouteShare[\s\S]*openRideHeroFriends[\s\S]*changeMode[\s\S]*changePark[\s\S]*endRideHeroRoute/,
  'sharing and lifecycle actions must remain available without cluttering the main page');

// Shared route CSS, not a Quick-only override, must own the page shell.
assert.match(css, /body\.route-screen-active #screen-route \.rh-route-context[\s\S]*body\.route-screen-active #screen-route \.rolling-route-queue[\s\S]*body\.route-screen-active #screen-route #route-body/,
  'both modes must use the shared bounded route shell');
assert.match(css, /body\.mode-strategic #screen-route \.rh-next-kicker[\s\S]*body\.mode-strategic #screen-route \.rh-next-primary/,
  'Full Day may keep its approved blue mode accents without changing structure');

console.log('Approved shared Your Route runtime/source contracts passed.');
