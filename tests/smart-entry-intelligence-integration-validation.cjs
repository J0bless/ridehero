'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const html = read('index.html');
const navigationSource = read('js/navigation.js');
const locationSource = read('js/location-service.js');
const routeSessionSource = read('js/route-session.js');
const analyticsSource = read('js/growth-analytics.js');
const allJavaScript = fs.readdirSync(path.join(root, 'js'))
  .filter(file => file.endsWith('.js'))
  .map(file => read(path.join('js', file)))
  .join('\n');
const intelligence = require(path.join(root, 'js', 'ride-intelligence.js'));
const analytics = require(path.join(root, 'js', 'growth-analytics.js'));
const css = fs.readdirSync(path.join(root, 'css'))
  .filter(file => file.endsWith('.css'))
  .map(file => read(path.join('css', file)))
  .join('\n');

function topLevelFunction(source, name, indent = '') {
  const marker = `${indent}function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextPattern = new RegExp(`\\n${indent.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}function\\s+[A-Za-z_$][\\w$]*\\s*\\(`, 'g');
  nextPattern.lastIndex = start + marker.length;
  const match = nextPattern.exec(source);
  return source.slice(start, match ? match.index : source.length);
}

function scriptPosition(src) {
  const position = html.indexOf(`src="${src}`);
  assert.notEqual(position, -1, `${src} must be loaded by index.html`);
  return position;
}

function loadRouteSession() {
  let saved = null;
  const localStorage = {
    getItem(key) { return key === 'rideheroRouteSession' ? saved : null; },
    setItem(key, value) { if (key === 'rideheroRouteSession') saved = value; },
    removeItem(key) { if (key === 'rideheroRouteSession') saved = null; }
  };
  const window = { localStorage };
  window.window = window;
  const context = vm.createContext({ window, console, Date, Math, Number, JSON, Uint8Array });
  vm.runInContext(routeSessionSource, context, { filename: 'js/route-session.js' });
  return context.window.RideHeroRouteSession;
}

// The pure policy modules must be available before the services and UI that
// consume them. This keeps the core planner independent of DOM timing.
const smartEntryScript = scriptPosition('js/smart-entry.js');
const locationScript = scriptPosition('js/location-service.js');
const intelligenceScript = scriptPosition('js/ride-intelligence.js');
const navigationScript = scriptPosition('js/navigation.js');
assert.ok(smartEntryScript < locationScript, 'Smart Entry policy must load before the shared location service');
assert.ok(locationScript < navigationScript, 'the shared location service must load before onboarding navigation');
assert.ok(intelligenceScript < navigationScript, 'RideHero Intelligence must load before application navigation');

// Planning mode remains the first planning decision, then Smart Entry owns
// detection. Park selection must not jump directly back to the brand catalog.
const selectPlanningMode = topLevelFunction(navigationSource, 'selectPlanningMode', '  ');
assert.match(selectPlanningMode, /go\(\['smart-entry'\]\)/, 'Planning Mode must route to Smart Entry');
assert.doesNotMatch(selectPlanningMode, /go\(\['brands'\]\)/, 'Planning Mode must not skip Smart Entry');
const renderNavigation = topLevelFunction(navigationSource, 'render', '  ');
assert.match(renderNavigation, /parts\[0\]\s*===\s*['"]smart-entry['"][\s\S]*renderSmartEntry/, 'the router must render #/smart-entry');

const renderSmartEntry = topLevelFunction(navigationSource, 'renderSmartEntry', '  ');
const startSmartEntryDetection = topLevelFunction(navigationSource, 'startSmartEntryDetection', '  ');
const smartEntryParkCard = topLevelFunction(navigationSource, 'smartEntryParkCard', '  ');
const smartEntryFailure = topLevelFunction(navigationSource, 'smartEntryFailure', '  ');
const smartEntryMarkup = [renderSmartEntry, smartEntryParkCard, smartEntryFailure].join('\n');
assert.match(startSmartEntryDetection, /RideHeroLocationService[\s\S]*getCurrentPosition/, 'Smart Entry must use the shared location service');
assert.match(startSmartEntryDetection, /detectCurrentPark/, 'Smart Entry must use confidence-aware park detection');
assert.doesNotMatch(startSmartEntryDetection, /navigator\.geolocation/, 'Smart Entry must not duplicate browser GPS calls');
assert.match(smartEntryParkCard, /(?:Looks like|You're at|near)[\s\S]*(?:Continue|Use )/i, 'detected parks must be shown as explicit suggestions');
assert.match(smartEntryParkCard, /Change Park|Choose another park/i, 'detected parks must retain a manual override');
assert.match(smartEntryFailure, /Retry Location/i, 'location failure must offer a retry');
assert.match(smartEntryFailure, /couldn\\?['’]t confirm|unable to confirm/i, 'unknown location must have a non-blocking fallback state');
assert.match(smartEntryMarkup, /<button[^>]*type="button"/i, 'Smart Entry actions must use semantic buttons');
assert.match(renderSmartEntry, /aria-live="polite"|role="status"/i, 'Smart Entry status changes must be announced accessibly');

const bindSmartEntry = topLevelFunction(navigationSource, 'bindSmartEntry', '  ');
assert.match(bindSmartEntry, /activatePark/, 'confirming a Smart Entry suggestion must use the established park activation path');
assert.match(bindSmartEntry, /smart-entry|data-smart|detected-park|confirm-park/i, 'Smart Entry confirmation and fallback controls must be bound');
assert.match(navigationSource, /RideHeroRouteSession[\s\S]*getActive\(\)[\s\S]*Resume|Resume[\s\S]*RideHeroRouteSession[\s\S]*getActive\(\)/i, 'Smart Entry must surface a real resumable route without fabricating progress');
assert.match(html + allJavaScript, /RideHeroRouteResume\s*=/, 'the Resume Route action must have a concrete bridge implementation');
assert.match(smartEntryParkCard, /Waits updated|Wait data may be outdated|Live waits temporarily unavailable|Wait freshness/i, 'a resume card must describe wait freshness truthfully');
assert.match(smartEntryParkCard, /data-smart-source/i, 'Smart Entry confirmation must carry whether its suggestion came from live or recent context');
assert.match(bindSmartEntry, /smartSource/i, 'Smart Entry must not label a recent-park fallback as live location');

async function validateNavigationRuntime() {
  let rootHtml = '';
  let hostHtml = '';
  const buttons = new Map();
  const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  const heading = { setAttribute() {}, focus() {} };
  const smartHost = {
    get innerHTML() { return hostHtml; },
    set innerHTML(value) { hostHtml = String(value); buttons.clear(); },
    setAttribute() {},
    querySelector(selector) { return selector === 'h2' && /<h2\b/i.test(hostHtml) ? heading : null; }
  };
  function dataButtons(selector) {
    const parsed = /^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (!parsed) return [];
    const attribute = parsed[1];
    const required = parsed[2];
    const datasetKey = attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const found = [];
    const expression = new RegExp(`data-${attribute}(?:="([^"]*)")?`, 'g');
    let match;
    while ((match = expression.exec(hostHtml))) {
      const value = match[1] || '';
      if (required !== undefined && value !== required) continue;
      const key = `${datasetKey}:${value}`;
      if (!buttons.has(key)) buttons.set(key, { dataset: { [datasetKey]: value }, onclick: null, classList, setAttribute() {}, addEventListener() {} });
      found.push(buttons.get(key));
    }
    return found;
  }
  const rootElement = {
    classList,
    get innerHTML() { return rootHtml; },
    set innerHTML(value) { rootHtml = String(value); hostHtml = ''; buttons.clear(); },
    querySelector(selector) {
      if (selector === '[data-smart-entry-root]' && /data-smart-entry-root/.test(rootHtml)) return smartHost;
      if (selector === '.catalog-heading' && /catalog-heading/.test(rootHtml)) return heading;
      return null;
    },
    querySelectorAll(selector) { return dataButtons(selector); }
  };
  const created = Object.create(null);
  const document = {
    activeElement: null,
    body: {
      classList,
      appendChild(element) { if (element.id) created[element.id] = element; }
    },
    getElementById(id) { return id === 'screen-setup' ? rootElement : created[id] || null; },
    querySelectorAll() { return []; },
    createElement() { return { id: '', hidden: false, className: '', textContent: '', type: '', onclick: null, classList, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; }
  };
  const catalog = {
    brands: { disney: { id: 'disney', slug: 'disney', name: 'Disney', accent: '#123' } },
    destinations: { wdw: { id: 'wdw', slug: 'wdw', brandId: 'disney', name: 'Walt Disney World Resort', location: 'Florida', parkIds: ['hs'] } },
    parks: { hs: { id: 'hs', slug: 'hollywood-studios', brandId: 'disney', destinationId: 'wdw', shortName: 'Hollywood Studios', officialName: 'Disney Hollywood Studios', liveWaitTimesAvailable: true, waitTimeProviderId: 'hs', map: { routingQuality: 'verified' } } }
  };
  let recent = {};
  let rejectLocation = true;
  let quickRouteCalls = 0;
  let resetCalls = 0;
  let activeSession = null;
  const forceCalls = [];
  const location = { hash: '#/mode', replace(next) { this.hash = next; } };
  const context = vm.createContext({
    console,
    document,
    location,
    history: { length: 2, back() {} },
    performance: { now() { return 0; } },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    currentPark: 'mk',
    parkHasBeenSelected: false,
    PARK_META: {},
    TP_IDS: {},
    HERO_COLORS: {},
    resetParkRuntimeState() { resetCalls += 1; activeSession = null; },
    activeScreenId() { return 'setup'; },
    showScreen() {},
    openPlanFlow() {},
    goQuickRouteForPark() { quickRouteCalls += 1; },
    applyGuidanceMode() {},
    setTimeout(callback) { callback(); return 0; },
    clearTimeout() {},
    matchMedia() { return { matches: true }; },
    scrollTo() {},
    addEventListener() {},
    RideHeroAnalytics: { track() {} },
    RideHeroRouteSession: {
      getActive() { return activeSession; },
      abandon() { activeSession = null; return null; }
    },
    RideHeroSmartEntry: { getRecentParkSuggestion() { return null; } },
    RideHeroLocationService: {
      getCurrentPosition(options) {
        forceCalls.push(options && options.force === true);
        return rejectLocation ? Promise.reject({ code: 1 }) : Promise.resolve({ latitude: 28.35, longitude: -81.55, accuracy: 15 });
      },
      detectCurrentPark() { return { parkId: 'hs', confidence: 'high', reason: 'inside_trusted_park_bounds' }; },
      setSelectedPark() {}
    },
    RideHeroParkData: {
      load() { return Promise.resolve({ rides: [] }); },
      findParkByRoute() { return {}; }
    },
    RideHeroState: {
      get() { return { recent }; },
      rememberContext(value) { recent = Object.assign({}, recent, value); }
    },
    RIDEHERO_CATALOG: catalog
  });
  context.window = context;
  vm.runInContext(navigationSource, context, { filename: 'js/navigation.js' });
  const navigation = context.RideHeroMultiResort;

  navigation.selectPlanningMode('quick');
  assert.equal(location.hash, '#/smart-entry', 'runtime Planning Mode selection must open Smart Entry');
  navigation.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(hostHtml, /couldn['’]t confirm which park/i, 'denied location must render a manual fallback instead of blocking');
  assert.match(hostHtml, /Choose Park/i);
  assert.match(hostHtml, /Retry Location/i);
  assert.equal(typeof buttons.get('smartChange:').onclick, 'function', 'manual Change Park must be operable');
  assert.equal(typeof buttons.get('smartRetry:').onclick, 'function', 'Retry Location must be operable');

  rejectLocation = false;
  buttons.get('smartRetry:').onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(hostHtml, /You(?:'|&#39;)re at[\s\S]*Hollywood Studios/i, 'high-confidence detection must remain an explicit park confirmation');
  const confirm = buttons.get('smartPark:hs');
  assert.equal(typeof confirm.onclick, 'function', 'detected park confirmation must be operable');
  confirm.onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(quickRouteCalls, 1, 'Smart Entry confirmation must enter the existing Quick route flow');
  assert.equal(context.currentPark, 'hs');
  assert.equal(resetCalls, 1, 'changing parks must reset prior runtime state');
  assert.deepEqual(forceCalls, [false, true], 'Smart Entry must use cached location first and force only an explicit retry');

  activeSession = {
    parkId: 'hs', planningMode: 'quick', completed: [{ rideId: 'one' }], skipped: [],
    stops: [{ rideId: 'one', name: 'Ride One' }, { rideId: 'two', name: 'Ride Two' }]
  };
  location.hash = '#/smart-entry';
  navigation.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(hostHtml, /Resume Route[\s\S]*Start New Route/i, 'a matching unfinished route must expose explicit resume and start-new choices');
  const startNew = buttons.get('smartNew:hs');
  assert.equal(typeof startNew.onclick, 'function');
  startNew.onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(activeSession, null, 'Start New Route must clear the active same-park session before rebuilding');
  assert.equal(resetCalls, 2, 'Start New Route must reset runtime state even when the park did not change');
}

// Internal Park Data Health remains available for the admin route, but neither
// Smart Entry nor the destination landing page can surface it to consumers.
const renderBrands = topLevelFunction(navigationSource, 'renderBrands', '  ');
assert.doesNotMatch(renderBrands, /healthCard\(|Park data health|Coverage snapshot/i, 'destination UI must not expose Park Data Health');
assert.doesNotMatch(renderSmartEntry, /healthCard\(|Park data health|Coverage snapshot/i, 'Smart Entry must not expose Park Data Health');
assert.match(renderNavigation, /admin[\s\S]*data-health/, 'internal data health must remain reachable through its admin route');

// The existing pre-score filter remains the authoritative Quick rides-only
// boundary after Smart Entry has selected a park.
const quickRideCandidates = topLevelFunction(html, 'quickRideCandidates');
assert.match(quickRideCandidates, /classifyExperience\([^)]*\)\s*===\s*['"]ride['"]/, 'Quick candidates must be rides before scoring');
assert.equal(intelligence.candidateAllowed('quick', { classification: 'attraction', status: 'OPEN' }), false, 'Quick intelligence must reject attractions');
assert.equal(intelligence.candidateAllowed('quick', { classification: 'ride', status: 'OPEN' }), true, 'Quick intelligence must retain operating rides');
assert.equal(intelligence.candidateAllowed('full', { classification: 'attraction', status: 'OPEN' }), true, 'Full Day must preserve attraction support');

// Route actions must keep skip and completion as separate state transitions.
assert.match(html, />\s*Skip\s*</i, 'the next-ride card must expose Skip');
assert.match(html, /Why this ride\?/i, 'the next-ride card must expose an explanation interaction');
assert.match(html, /Re-optimize/i, 'the route must retain an explicit Re-optimize action');
assert.match(html, /role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/i, 'route update messages must use a polite live region');
assert.match(html, /RideHeroRouteSession\.skipStop\(/, 'Skip must record a skipped stop');
assert.match(html, /RideHeroRouteSession\.completeStop\(/, 'completion must retain its separate session action');
assert.match(html, /skippedRideIds|\.skipped\b/, 'route rebuilding must read persisted skipped rides');
assert.match(html, /skippedRideIds|skippedStops|skipStop[\s\S]*reoptimize/i, 're-optimization must preserve skipped state rather than completing it');
assert.match(routeSessionSource, /function skipStop\([\s\S]*state\.active\.skipped\.push/, 'route sessions must model skip independently');
assert.match(routeSessionSource, /function completeStop\([\s\S]*state\.active\.completed\.push/, 'route sessions must model completion independently');
const optimizeRouteSource = topLevelFunction(html, 'optimizeRoute');
const reoptimizeSource = topLevelFunction(html, 'reoptimize');
assert.match(optimizeRouteSource, /clearedStops|completedRideIds|\.completed/, 'route optimization must exclude already completed rides before scoring');
assert.match(optimizeRouteSource, /skippedStops|skippedRideIds|\.skipped/, 'route optimization must exclude intentionally skipped rides before scoring');
assert.match(reoptimizeSource, /function reoptimize\(options\)|arguments\[0\]/, 'Re-optimize must consume its trigger/automatic/preserve-notice options');
assert.doesNotMatch(reoptimizeSource, /if\s*\(routeOrder\.length\s*>\s*0\)\s*selected\.delete\(routeOrder\[0\]\)/, 'Re-optimize must not silently discard the first route stop');
const reoptimizationLifecycleSource = reoptimizeSource + '\n' + optimizeRouteSource;
assert.match(reoptimizationLifecycleSource, /lastRouteReoptimizedAt/, 'every completed re-optimization must update the central cooldown timestamp');
assert.match(reoptimizationLifecycleSource, /route_reoptimized|route_auto_updated/, 'manual and automatic route updates must emit privacy-safe analytics');
assert.match(reoptimizationLifecycleSource, /setRouteIntelligenceNotice|pendingRouteUpdate/, 'closure, skip, and route-change explanations must survive the rebuild');
const routeSession = loadRouteSession();
const routeBase = {
  parkId: 'hs', planningMode: 'quick', routeStyle: 'balanced',
  startedAt: new Date(Date.now() - 5 * 60000).toISOString(),
  stops: [
    { rideId: 'one', name: 'Ride One', experienceType: 'ride', postedWaitMinutes: 15 },
    { rideId: 'two', name: 'Ride Two', experienceType: 'ride', postedWaitMinutes: 30 },
    { rideId: 'three', name: 'Ride Three', experienceType: 'ride', postedWaitMinutes: 20 }
  ],
  legs: []
};
routeSession.start(routeBase);
routeSession.completeStop('one', { source: 'manual', postedWaitMinutes: 15 });
routeSession.skipStop('two', { reason: 'not-now' });
routeSession.updateRoute(Object.assign({}, routeBase, {
  stops: [
    { rideId: 'three', name: 'Ride Three', experienceType: 'ride', postedWaitMinutes: 20 },
    { rideId: 'four', name: 'Ride Four', experienceType: 'ride', postedWaitMinutes: 10 }
  ]
}), { reoptimization: true });
const reoptimizedSession = routeSession.getActive();
assert.deepEqual(Array.from(reoptimizedSession.completed, event => event.rideId), ['one'], 're-optimization must preserve completion history');
assert.deepEqual(Array.from(reoptimizedSession.skipped, event => event.rideId), ['two'], 're-optimization must preserve skip history separately');
assert.equal(reoptimizedSession.reoptimizations, 1);

// UI freshness and explanations must come from the centralized intelligence
// policy; raw waits without timestamps must never be called fresh.
assert.match(html, /RideHeroIntelligence[\s\S]*waitFreshness\(/, 'route UI must use centralized wait freshness');
assert.match(html, /RideHeroIntelligence[\s\S]*(?:buildRecommendationReasons|recommendationReason)\(/, 'route UI must render evidence-backed recommendation reasons');
assert.match(html, /Waits updated|Wait data may be outdated|Live waits temporarily unavailable/i, 'route UI must communicate wait freshness and failure states');
const recommendationInsightSource = topLevelFunction(html, 'recommendationInsightForRide');
assert.match(recommendationInsightSource, /quality\s*===\s*['"]neutral['"][\s\S]{0,180}\?\s*null|quality\s*!==\s*['"]neutral['"][\s\S]{0,180}:\s*null/, 'unknown/neutral distance must not render a synthetic walking duration');
assert.match(optimizeRouteSource, /map-calibrated['"]?\s*&&\s*(?:walkEstimate|legQuality)\.dataConfidence\s*===\s*['"]verified['"]/, 'map-calibrated walking copy must be exact only when its underlying data is verified');
assert.match(optimizeRouteSource, /allWaitsKnown|knownWaits|waitTotalLabel|totalWaitLabel/, 'route totals must distinguish known posted waits from missing waits');
const routeReasonSource = topLevelFunction(html, 'routeReasonForStop');
assert.doesNotMatch(routeReasonSource, /Best first ride[^'"\n]*wait \+ walking distance/i, 'legacy route copy must not claim evidence that may be missing');
const now = Date.parse('2026-08-12T16:00:00.000Z');
let freshness = intelligence.waitFreshness({ waitMinutes: 22, fetchedAt: new Date(now - 2 * 60000).toISOString(), status: 'OPEN' }, { now });
assert.equal(freshness.state, 'fresh');
freshness = intelligence.waitFreshness({ waitMinutes: 22, status: 'OPEN' }, { now });
assert.equal(freshness.state, 'unknown', 'a wait without an observation timestamp must not appear fresh');

// Meaningful updates and anti-thrashing thresholds live in one immutable
// policy module instead of magic numbers scattered through UI handlers.
for (const key of ['waitSpikeMinutes', 'waitSpikeRatio', 'movementLowerBoundMetres', 'reoptimizationCooldownMs', 'switchScoreImprovement', 'switchStabilityMs']) {
  assert.ok(Object.hasOwn(intelligence.DEFAULT_THRESHOLDS, key), `${key} must be centralized`);
}
assert.match(html, /RideHeroIntelligence[\s\S]*(?:detectMeaningfulChanges|decideRouteSwitch)/, 'route integration must evaluate centralized change/stability policy');
const showScreenSource = topLevelFunction(html, 'showScreen');
assert.match(showScreenSource, /stopProximityClearing/, 'leaving the active route must stop its GPS watcher');
assert.match(html + allJavaScript, /visibilitychange|pagehide/, 'route GPS/network work must pause when the page becomes inactive');
assert.match(optimizeRouteSource, /temporarilyUnavailableIds\.size[\s\S]*startRouteConditionRefresh/, 'an all-closed route must remain active and monitor for reopenings');
assert.match(topLevelFunction(html, 'renderRollingQueue'), /monitoring temporarily unavailable rides/i, 'an unavailable retained ride must not be announced as a completed route');
const conditionRefreshSource = topLevelFunction(html, 'refreshActiveRouteConditions');
assert.match(conditionRefreshSource, /completeOperatingSet[\s\S]*routeProxyOmissionCounts[\s\S]*<\s*2[\s\S]*TEMPORARILY_DOWN/, 'two complete proxy snapshots must convert an omitted routed ride into a temporary closure');
assert.match(conditionRefreshSource, /liveById\[id\][\s\S]*delete routeProxyOmissionCounts\[id\]/, 'a returned proxy ride must clear omission state and support reopening');
const conditionChangesSource = topLevelFunction(html, 'evaluateRouteConditionChanges');
assert.match(conditionChangesSource, /TEMPORARILY_DOWN[\s\S]*temporarilyUnavailableIds\.add/, 'only a reopenable temporary closure may enter the monitoring set');
assert.match(conditionChangesSource, /CLOSED[\s\S]*SEASONAL[\s\S]*skipStop/, 'closed and seasonal rides must be resolved rather than polled indefinitely');
const minorChange = intelligence.detectMeaningfulChanges({
  now,
  previousRides: [{ id: 'ride', status: 'OPEN', waitMinutes: 22, fetchedAt: new Date(now - 6 * 60000).toISOString() }],
  currentRides: [{ id: 'ride', status: 'OPEN', waitMinutes: 23, fetchedAt: new Date(now - 1 * 60000).toISOString() }],
  remainingRouteIds: ['ride']
});
assert.equal(minorChange.meaningful, false, 'a one-minute wait change must not churn the route');

// Analytics may record the coarse park/reason outcome, never location values.
analytics.clear();
const event = analytics.track('park_auto_detected', {
  parkId: 'hs',
  confidence: 'high',
  latitude: 28.35,
  longitude: -81.55,
  accuracy: 12,
  gps: { latitude: 28.35, longitude: -81.55 }
});
assert.equal(event.properties.parkId, 'hs');
for (const key of ['latitude', 'longitude', 'accuracy', 'gps']) {
  assert.equal(Object.hasOwn(event.properties, key), false, `analytics must discard ${key}`);
}
assert.doesNotMatch(analyticsSource, /identifierKeys\s*=\s*\[[^\]]*(?:latitude|longitude|accuracy|gps)/i, 'analytics allowlists must never include precise location');

// Mobile hooks cover both new surfaces and retain minimum touch targets,
// reduced motion, and explicit 320px-class containment.
assert.match(css, /\.smart-entry[-\w\s,.#:[\]()>+~*]*\{/i, 'Smart Entry must have a dedicated responsive style hook');
assert.match(css, /\.(?:next-ride|recommendation|ride-intelligence)[-\w\s,.#:[\]()>+~*]*\{/i, 'the intelligence card must have a dedicated style hook');
assert.match(css, /@media\s*\(max-width:\s*(?:340|350)px\)/i, '320px-class layouts need explicit containment');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i, 'new UI motion must respect reduced-motion preferences');
assert.match(css, /min-height:\s*(?:44|4[5-9]|5\d)px/i, 'new interactive controls must retain at least 44px touch targets');

validateNavigationRuntime()
  .then(() => console.log('Smart Entry + RideHero Intelligence integration contracts passed.'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
