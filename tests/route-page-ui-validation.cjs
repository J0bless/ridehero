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

function hasQuickHiddenRule(selectorNeedle) {
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rulePattern.exec(css))) {
    const selectors = match[1].split(',');
    if (/display\s*:\s*none(?:\s*!important)?/.test(match[2]) && selectors.some((selector) =>
      selector.includes('body') && selector.includes('.mode-quick') && selector.includes(selectorNeedle)
    )) return true;
  }
  return false;
}

function absentOrQuickHidden(source, marker, selectorNeedle, message) {
  if (!source.includes(marker)) return;
  assert.ok(hasQuickHiddenRule(selectorNeedle), message);
}

const context = functionSource('renderRouteContext');
const viewState = functionSource('quickRouteViewState');
const page = functionSource('renderQuickRoutePage');
const lists = functionSource('renderQuickRouteLists');
const previewRow = functionSource('quickRoutePreviewRowMarkup');
const bindPage = functionSource('bindQuickRoutePageActions');
const queue = functionSource('renderRollingQueue');
const routeOptions = functionSource('openQuickRouteOptions');
const emptyRouteOptions = functionSource('openQuickEmptyRouteOptions');
const optimize = functionSource('optimizeRoute');
const fullDay = functionSource('buildFullDayRoute');
const startWalking = functionSource('startWalkingToCurrentRide');
const insight = functionSource('recommendationInsightForRide');
const quickQueueMarkup = queue.slice(queue.indexOf("wrap.innerHTML = quickOnly ?"), queue.indexOf("    '</article>' :") + "    '</article>'".length);

assert.match(html, /class="top-bar route-top-bar"[\s\S]*class="route-wordmark-button"[\s\S]*ridehero-wordmark\.png/, 'the active route needs a compact RideHero wordmark header');
assert.match(html, /id="route-share-top"[^>]*openRouteShare/);
assert.match(html, /openRideHeroFriends\(\)/);
assert.match(html, /id="route-growth-actions"[\s\S]*Share Route[\s\S]*End Route/);
absentOrQuickHidden(html, 'route-back-btn', '.route-back-btn', 'Quick Route must hide the Back control in its exact resting view');
absentOrQuickHidden(html, 'top-bar-actions', '.top-bar-actions', 'Quick Route must hide top Share/Friends controls in its exact resting view');
absentOrQuickHidden(html, 'route-growth-actions', '.route-growth-actions', 'Quick Route must hide trailing Share/End actions in its exact resting view');

assert.match(context, /<h1 id="rh-route-page-title" tabindex="-1">Your Route<\/h1>/, 'Quick Route needs one semantic page heading');
assert.match(context, /id="rh-route-park-name"/);
assert.match(context, /id="rh-route-progress"/);
assert.match(viewState, /RideHeroRouteSession[\s\S]*completedCount/, 'progress must come from route-session state');
assert.doesNotMatch(context, /2 of 6 complete/, 'example progress must never be hard-coded');
assert.match(context, /routeLocationSourceCopy\(\)/, 'the page header must use the truthful centralized location copy');
assert.match(context, /focus\(\{\s*preventScroll\s*:\s*true\s*\}\)/, 'focus must move to the new route heading');
assert.doesNotMatch(context, /data-rh-change-mode|data-rh-change-park/, 'Change Mode/Park must not clutter the exact resting view');

assert.match(queue, /<article class="rh-next-card ride-intelligence-card" aria-labelledby="rh-next-title"/);
assert.match(queue, /freshness\.waitMinutes == null[\s\S]*Unavailable/, 'missing waits must remain unavailable');
assert.match(queue, /recommendationInsightForRide\(current\)/);
assert.match(queue, /insight\.walkMetricValue[\s\S]*insight\.walkMetricLabel/, 'walking value and unit must render without duplicated copy');
assert.match(insight, /walkMetricValue:[\s\S]*walkMetricLabel:[\s\S]*walkText:/, 'walking metrics must preserve exact, approximate, and unavailable copy');
assert.doesNotMatch(queue, /insight\.walkText[\s\S]*<small>walk<\/small>/, 'the compact stat must not read "6 min walk / walk"');
assert.match(queue, /data-rh-start-walking/);
assert.doesNotMatch(quickQueueMarkup, /data-rh-complete|data-rh-skip|rh-why-details|rh-next-freshness-line/, 'secondary intelligence/actions belong in route options, not the exact resting card');
assert.doesNotMatch(queue, /data-rh-reoptimize/, 'the next-card must not duplicate the stable Re-optimize utility');
assert.match(queue, /<button class="rh-next-star"[^>]*data-rh-route-options[^>]*aria-label=/, 'the reference star must be a labeled semantic route-options button');
assert.match(queue, /optionsButton\.onclick\s*=\s*openQuickRouteOptions/, 'the star must open real route options');
assert.doesNotMatch(queue, /data-rh-favorite/i, 'the star must not imply an unimplemented favorite feature');
assert.match(startWalking, /prefers-reduced-motion:\s*reduce/);

assert.match(routeOptions, /(?:<dialog|role=["']dialog|showModal\s*\()/, 'route options must use an accessible dialog/sheet surface');
assert.match(routeOptions, /manualClearCurrentStop/, 'route options must preserve Mark complete');
assert.match(routeOptions, /skipCurrentRide/, 'route options must preserve Skip');
assert.match(routeOptions, /openRouteShare/, 'route options must preserve Share Route');
assert.match(routeOptions, /openRideHeroFriends/, 'route options must preserve Friends');
assert.match(routeOptions, /changeMode/, 'route options must preserve Change Mode');
assert.match(routeOptions, /changePark/, 'route options must preserve Change Park');
assert.match(routeOptions, /endRideHeroRoute/, 'route options must preserve End Route');
assert.match(routeOptions, /waitFreshnessCopy|freshness/, 'route options must preserve truthful wait freshness');
assert.match(routeOptions, /whyRecommendationMarkup|explanations|reasonText/, 'route options must preserve Why this ride intelligence');
assert.match(routeOptions, /openedRideId[\s\S]*stopKey\(rollingQueue\[0\]\) === openedRideId/, 'an open options sheet must never complete or skip a newly changed ride');
assert.match(queue, /data-rh-empty-route-options[\s\S]*openQuickEmptyRouteOptions/, 'empty and temporarily unavailable Quick routes must retain an exit/options path');
assert.match(emptyRouteOptions, /changeMode[\s\S]*changePark[\s\S]*endRideHeroRoute/, 'empty route options must retain mode, park, and end-route exits');

assert.match(page, /class="rh-route-map-card map-section"[\s\S]*id="map-container"/, 'the reference-style card must keep the real map host');
assert.match(page, /class="rh-up-next"/);
assert.match(page, /class="rh-route-utility-actions" aria-label="Route actions"/);
assert.match(page, /data-rh-open-map/);
assert.match(page, /data-rh-reoptimize-route/);
assert.match(page, /ensureRouteStartControls\(\)/);
assert.match(page, /renderRouteMapSafely\(routeOrder\)/);
assert.match(lists, /slice\(0, 2\)/, 'Up Next must show at most two compact upcoming rides');
assert.match(lists, /classifyExperience\(ride\) === 'ride'/, 'Quick Route previews must remain rides-only');
assert.match(previewRow, /waitLabel\(ride, true\)/, 'preview waits must use the truthful existing formatter');
assert.match(html, /<button class="rh-up-next-row rh-up-next-button"[^>]*data-rh-preview-route[^>]*aria-label=/, 'reference preview rows must be labeled semantic buttons');
assert.match(lists, /\[data-rh-preview-route\][\s\S]*setQuickFullRouteOpen\(true\)/, 'preview rows must open the real itinerary after every list refresh');
assert.match(html, /activeRouteStops = routeRides;[\s\S]*initRollingQueue\(routeRides\);[\s\S]*refreshQuickRoutePage\(routeRides\);/, 'resumed routes must refresh after rebuilding their queue');
assert.match(html, /refreshActiveRouteConditions[\s\S]*renderRollingQueue\(\);[\s\S]*refreshQuickRoutePage\(activeRouteStops\);/, 'live wait refreshes must also update upcoming rows');
assert.match(optimize, /renderQuickRoutePage\(top3/);
assert.doesNotMatch(optimize, /More rides available|Your next rides|class="route-stats"/, 'legacy duplicate Quick Route sections must stay removed');

assert.match(fullDay, /filteredRides\(\)/, 'Full Day must retain its separate ride/attraction filter path');
assert.match(fullDay, /class="route-hero"/);
assert.match(fullDay, /class="route-stats"/);
assert.match(fullDay, /id="map-container"/);
assert.doesNotMatch(fullDay, /rh-route-dashboard|rh-up-next/, 'the new dashboard must remain Quick-only');

assert.match(css, /body\.mode-quick #screen-route/);
assert.match(css, /body\.route-screen-active\.mode-quick \.app-nav/);
assert.ok(hasQuickHiddenRule('.route-back-btn'));
assert.ok(hasQuickHiddenRule('.top-bar-actions'));
assert.ok(hasQuickHiddenRule('.route-growth-actions'));
assert.match(css, /\.rh-route-dashboard\{min-width:0/);
assert.match(css, /\.rh-up-next-row\{[\s\S]*min-width:0/);
assert.match(css, /\.rh-route-utility-actions\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /\.rh-route-utility-actions button\{[\s\S]*min-height:56px/);
for (const width of [430, 390, 360, 340]) {
  assert.match(css, new RegExp(`@media \\(max-width:${width}px\\)`), `${width}px needs an explicit route layout contract`);
}
assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);

console.log('Reference-led active route page UI contracts passed.');
