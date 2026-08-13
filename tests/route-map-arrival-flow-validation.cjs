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

const page = functionSource('renderRoutePage');
const lists = functionSource('renderRoutePageLists');
const fullRoute = functionSource('setQuickFullRouteOpen');
const bindPage = functionSource('bindRoutePageActions');
const startWalking = functionSource('startWalkingToCurrentRide');
const routeStopUnavailable = functionSource('routeStopIsUnavailable');
const confirmArrival = functionSource('confirmArrivalAtCurrentRide');
const proximity = functionSource('maybeClearCurrentStopByLocation');
const clearStop = functionSource('clearQueuedStop');
const skip = functionSource('skipCurrentRide');
const initQueue = functionSource('initRollingQueue');
const queue = functionSource('renderRollingQueue');

// The normal secondary panel is the real compact map. Route rows are not
// rendered until the user asks for the full itinerary.
ordered(page, [
  'rh-route-map-card',
  'rh-map-walk-chip',
  'map-container',
  'rh-route-map-preview-title',
  'data-rh-view-full-route',
  'rh-route-full-itinerary',
  'rh-completed-card',
  'rh-route-utility-actions'
], 'map-first route-page hierarchy');
assert.match(page, /id="rh-route-map-card"[\s\S]*id="rh-map-walk-chip"[\s\S]*class="map-wrap" id="map-container"/,
  'the resting preview must reuse the existing map host and walking chip');
assert.match(page, /id="rh-route-map-preview-title"[^>]*>Park map<\/h2>/,
  'the compact map needs a visible semantic heading');
assert.match(page, /data-rh-view-full-route[^>]*aria-expanded="false"[^>]*aria-controls="rh-route-full-itinerary"/,
  'View full route must expose disclosure state and its controlled region');
assert.match(page, /id="rh-route-full-itinerary"[^>]*tabindex="-1"[^>]*hidden[\s\S]*Upcoming/,
  'Upcoming stops must begin hidden inside the focusable full itinerary');
assert.doesNotMatch(page, /id="rh-up-next-list"/,
  'the resting map panel must not retain a visible Upcoming row list');
assert.doesNotMatch(lists, /getElementById\(['"]rh-up-next-list['"]\)|remaining\.slice\(0,\s*2\)/,
  'route refreshes must not repopulate an Upcoming preview outside the disclosure');
assert.match(lists, /getElementById\(['"]rh-route-full-list['"]\)[\s\S]*state\.savedStops/,
  'the hidden itinerary must continue to render state-backed route stops');
assert.match(fullRoute, /itinerary\.hidden\s*=\s*!open[\s\S]*aria-expanded[\s\S]*if \(open\)[\s\S]*itinerary\.focus/,
  'opening the full route must synchronize visibility, ARIA, and focus');
assert.match(bindPage, /data-rh-view-full-route[\s\S]*setQuickFullRouteOpen\(itinerary\.hidden\)/,
  'the View full route control must operate the existing disclosure in place');

// Start Walking establishes intent for one concrete current ride and rerenders
// the card. It must never count as arrival or completion by itself.
assert.match(html, /\b(?:let|var)\s+walkingToRideId\s*=\s*null\s*;/,
  'walking intent must have one explicit route-level state value');
assert.match(startWalking, /!rollingQueue\s*\|\|\s*!rollingQueue\.length[\s\S]*currentId\s*=\s*stopKey\(current\)[\s\S]*walkingToRideId\s*=\s*currentId;[\s\S]*renderRollingQueue\(\)/,
  'Start Walking must bind walking state to the current ride and rerender its CTA');
assert.doesNotMatch(startWalking, /clearQueuedStop|manualClearCurrentStop|completeStop/,
  'Start Walking must not complete or advance the route');
assert.match(queue, /walkingToCurrent\s*=\s*walkingToRideId\s*===\s*currentId/,
  'periodic queue renders must derive walking UI from the current ride identity');
assert.match(queue, /walkingToCurrent\s*\?[\s\S]*data-rh-confirm-arrival[\s\S]*I\\?['\u2019]ve Arrived[\s\S]*data-rh-start-walking/,
  'an active walking card must replace Start Walking with an I\u2019ve Arrived action');
assert.match(queue, /data-rh-confirm-arrival[\s\S]*confirmArrivalAtCurrentRide/,
  'the arrival CTA must invoke the guarded arrival handler');

// Arrival is idempotent: it can only complete the ride whose walking state is
// still current, and state is cleared before the queue advances. A repeated or
// stale activation therefore cannot complete the newly displayed next ride.
assert.match(confirmArrival, /!rollingQueue\s*\|\|\s*!rollingQueue\.length[\s\S]*resolveRouteStop\(rollingQueue\[0\]\)[\s\S]*currentId\s*=\s*stopKey\(current\)/,
  'arrival confirmation must capture the current queue identity');
assert.match(confirmArrival, /currentId\s*!==\s*walkingToRideId[\s\S]*return false/,
  'arrival confirmation must reject a stale or repeated activation');
const clearWalkingAt = confirmArrival.search(/walkingToRideId\s*=\s*null/);
const completeAt = confirmArrival.search(/(?:clearQueuedStop|manualClearCurrentStop)\s*\(/);
assert.ok(clearWalkingAt !== -1 && completeAt !== -1 && clearWalkingAt < completeAt,
  'walking state must clear before the completion call can advance the queue');
assert.match(confirmArrival, /routeStopIsUnavailable\(current\)[\s\S]*return false/,
  'arrival confirmation must reject a ride that became unavailable while walking');
assert.match(routeStopUnavailable, /temporarilyUnavailableIds[\s\S]*CLOSED[\s\S]*TEMPORARILY_DOWN[\s\S]*SEASONAL/,
  'arrival availability must use the same durable closure states as the Next Up card');
assert.match(confirmArrival, /clearQueuedStop\(current,\s*['"]arrival['"]\)/,
  'confirmed arrival must advance the route without claiming that the ride was completed');
assert.match(clearStop, /arrivedOnly[\s\S]*source:arrivedOnly\s*\?\s*['"]location['"]\s*:\s*['"]manual['"]/,
  'arrival must persist with the existing non-ride-completion location source');
assert.match(clearStop, /if\s*\(!arrivedOnly\)\s*routeAnalytics\(['"]ride_completed['"]/,
  'arrival must not emit the ride-completed analytics event');
assert.match(confirmArrival, /(?:announceRouteGuidance|focus)[\s\S]*(?:next|Next|route)/,
  'arrival must announce or focus the newly rendered route state');
assert.match(clearStop, /walkingToRideId\s*=\s*null/,
  'all completion paths must reset walking intent');
assert.match(skip, /walkingToRideId\s*=\s*null/,
  'skipping the target must reset walking intent');
assert.match(initQueue, /walkingToRideId\s*=\s*null/,
  'starting or restoring a route must not inherit another ride\u2019s walking state');

// GPS proximity may inform the user, but the requested explicit confirmation
// owns advancement. This prevents a background location tick racing the CTA.
assert.doesNotMatch(proximity, /clearQueuedStop|manualClearCurrentStop|completeStop/,
  'proximity alone must never advance to the next ride');
assert.match(proximity, /ROUTE_CLEAR_RADIUS_FT[\s\S]*(?:announceRouteGuidance|renderRollingQueue|walkingToRideId)/,
  'nearby location may update or announce the explicit-arrival state');

// Closure and missing-route states remain truthful and cannot expose arrival.
assert.match(queue, /unavailable\s*\?[\s\S]*data-rh-reoptimize-route[\s\S]*insight\.walkMinutes\s*==\s*null[\s\S]*data-rh-open-map-primary/,
  'closed rides must offer Re-optimize and missing walking routes must offer Map');
assert.match(queue, /unavailable\s*\?[\s\S]*data-rh-reoptimize-route[\s\S]*walkingToCurrent\s*\?[\s\S]*data-rh-confirm-arrival/,
  'the unavailable branch must take precedence over the arrival action');
assert.match(queue, /completedStopCount[\s\S]*Route Complete[\s\S]*View Day Summary/,
  'confirming the final ride must fall through to the existing completion state');
assert.match(queue, /completedStopCount[\s\S]*completedRideCount[\s\S]*route stops reached/,
  'arrival-only route completion must describe reached stops rather than completed rides');

// Mobile and accessibility contracts for the new resting map/action state.
assert.match(css, /\.rh-route-map-card:not\(\.is-map-active\)>\.map-wrap\s*\{[^{}]*display:block!important/s,
  'the compact map preview must remain visible by default at every viewport height');
assert.match(css, /\.rh-route-map-card:not\(\.is-map-active\)[\s\S]*\.rh-park-map-viewport\s*\{[^{}]*height:clamp\((?:10[8-9]|1[1-5]\d)px,[^,]+,(?:1[2-6]\d)px\)/s,
  'the resting real map needs a bounded compact viewport');
assert.match(css, /\.rh-next-primary\s*\{[^{}]*min-height:(?:5[2-9]|[6-9]\d)px/s,
  'Start Walking and I\u2019ve Arrived must share the accessible primary touch target');
assert.match(css, /\.rh-next-primary:focus-visible[^{]*\{[^{}]*(?:outline|box-shadow):/s,
  'the changing primary CTA must keep visible keyboard focus');
assert.match(css, /@media \(max-width:340px\)/,
  '320px-class screens must retain an explicit containment contract');
assert.match(css, /@media \(prefers-reduced-motion:reduce\)[\s\S]*transition:none!important/,
  'map and route state transitions must respect reduced motion');
assert.doesNotMatch(css, /route-screen-active[^{}]*overflow\s*:\s*hidden/,
  'expanded itinerary or enlarged text must never be trapped by the one-screen layout');

console.log('Map-first route and explicit arrival-flow contracts passed.');
