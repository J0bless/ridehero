const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'route-session.js'), 'utf8');

function load(initial) {
  let saved = initial == null ? null : initial;
  const localStorage = {
    getItem(key) { return key === 'rideheroRouteSession' ? saved : null; },
    setItem(key, value) { if (key === 'rideheroRouteSession') saved = value; },
    removeItem(key) { if (key === 'rideheroRouteSession') saved = null; }
  };
  const window = { localStorage };
  window.window = window;
  const context = vm.createContext({ window, console, Date, Math, Number, JSON, Uint8Array });
  vm.runInContext(source, context, { filename: 'js/route-session.js' });
  return { api: context.window.RideHeroRouteSession, context, getSaved: () => saved };
}

function route(overrides) {
  return Object.assign({
    parkId: 'hs',
    planningMode: 'quick',
    routeStyle: 'balanced',
    startedAt: '2026-08-11T13:00:00.000Z',
    stops: [
      { rideId: 'tower', name: 'Tower of Terror', experienceType: 'ride', postedWaitMinutes: 28 },
      { rideId: 'show', name: 'Stage Show', experienceType: 'attraction', postedWaitMinutes: null }
    ],
    legs: [
      { fromRideId: null, toRideId: 'tower', metres: 800, routingQuality: 'verified' },
      { fromRideId: 'tower', toRideId: 'show', metres: 400, routingQuality: 'provider-gps' }
    ]
  }, overrides || {});
}

{
  const loaded = load('{ definitely not json');
  assert.equal(loaded.api.storageVersion, 1);
  assert.equal(loaded.api.hasActive(), false, 'corrupted state must fail closed');
  assert.equal(loaded.api.getLatestSummary(), null);
}

{
  const loaded = load();
  const api = loaded.api;
  api.start(route({
    preciseGps: { latitude: 28.1, longitude: -81.1 },
    email: 'secret@example.test',
    providerToken: 'secret',
    stops: [{ rideId: 'tower', name: '<script>alert(1)</script>Tower', experienceType: 'ride', postedWaitMinutes: 28, latitude: 28.1 }]
  }));
  const serialized = loaded.getSaved();
  assert.doesNotMatch(serialized, /latitude|longitude|secret@example|providerToken|<script>/i, 'private and arbitrary fields must never persist');
  assert.equal(api.getActive().stops[0].name, 'alert(1)Tower', 'stored text must contain no HTML');
  api.completeStop('tower', { source: 'manual', postedWaitMinutes: null, completedAt: '2026-08-11T13:20:00.000Z', gps: { lat: 1 } });
  const summary = api.getLatestSummary();
  assert.equal(summary.recordedWaitCount, 0, 'an explicit null current wait must not fall back to a stale route-build wait');
  assert.equal(summary.longestPostedWaitMinutes, null, 'unknown waits must remain null, never synthetic 90');
  assert.equal(summary.averagePostedWaitMinutes, null);
  assert.equal(summary.completedStops, 1);
  assert.equal(summary.completedRides, 1);
}

{
  const loaded = load();
  const api = loaded.api;
  api.start(route({ startedAt: new Date(Date.now() - 30 * 60000).toISOString() }));
  api.completeStop('tower', { source: 'location', postedWaitMinutes: 30, completedAt: new Date().toISOString() });
  let active = api.getActive();
  assert.equal(active.completed.length, 1);
  assert.equal(active.completed[0].source, 'location');
  assert.equal(api.getLatestSummary(), null, 'partial progress must remain an active session');
  const partial = api.end('manual');
  assert.equal(partial.completedStops, 1);
  assert.equal(partial.completedRides, 0, 'proximity arrival must not be presented as proof a ride was completed');
  assert.equal(partial.longestPostedWaitMinutes, 30);
  assert(partial.durationMinutes >= 29 && partial.durationMinutes <= 31, 'duration must come from real session timestamps');
  assert.equal(partial.walkingMetres, 800);
  assert.equal(partial.walkingApproximate, false);
  assert.equal(partial.meaningfulProgress, true);
}

{
  const loaded = load();
  const api = loaded.api;
  api.start(route());
  api.completeStop('tower', { source: 'manual', postedWaitMinutes: 28 });
  api.completeStop('show', { source: 'imported', postedWaitMinutes: null });
  const summary = api.getLatestSummary();
  assert.equal(summary.walkingMetres, 1200);
  assert.equal(summary.walkingApproximate, true, 'provider-GPS legs must mark a walking total approximate');
  assert.equal(summary.routingQuality, 'mixed');
}

{
  const loaded = load();
  const api = loaded.api;
  api.start(route({ legs: [{ fromRideId: null, toRideId: 'tower', metres: 800, routingQuality: 'verified' }] }));
  api.completeStop('tower', { source: 'manual', postedWaitMinutes: 28 });
  api.completeStop('show', { source: 'imported', postedWaitMinutes: null });
  const summary = api.getLatestSummary();
  assert.equal(api.hasActive(), false, 'the last completed stop must finalize the route');
  assert.equal(summary.completedStops, 2);
  assert.equal(summary.completedRides, 1, 'attractions must not be counted as rides');
  assert.deepEqual(Array.from(summary.completedRideIds), ['tower', 'show'], 'the finalized summary must retain only route stop IDs for sharing');
  assert.equal(summary.stops.length, 2, 'the finalized summary must retain its privacy-safe route snapshot');
  assert.equal(summary.walkingMetres, null, 'walking must be omitted unless every completed leg has metres');
  assert.equal(summary.walkingApproximate, null);
}

{
  const loaded = load();
  const api = loaded.api;
  api.start(route());
  api.completeStop('tower', { source: 'manual', completedAt: '2026-08-11T13:10:00.000Z' });
  api.updateRoute(route({
    stops: [
      { rideId: 'tower', name: 'Tower of Terror', experienceType: 'ride', postedWaitMinutes: 25 },
      { rideId: 'coaster', name: 'Rock n Roller Coaster', experienceType: 'ride', postedWaitMinutes: 20 }
    ],
    legs: [{ fromRideId: null, toRideId: 'tower', metres: 800, routingQuality: 'verified' }]
  }), { reoptimization: true });
  const active = api.getActive();
  assert.equal(active.completed.length, 1, 'completed events for retained stop IDs must survive reoptimization');
  assert.equal(active.completed[0].rideId, 'tower');
  assert.equal(active.reoptimizations, 1);
  assert.deepEqual(Array.from(active.stops, stop => stop.rideId), ['tower', 'coaster']);
}

{
  const loaded = load();
  const api = loaded.api;
  api.start(route());
  api.updateRoute(route({
    stops: [{ rideId: 'tower', name: 'Tower of Terror', experienceType: 'ride', postedWaitMinutes: 25 }],
    legs: []
  }), { reoptimization: true, retainRideIds: ['show'] });
  assert.deepEqual(Array.from(api.getActive().stops, stop => stop.rideId), ['show', 'tower'], 'temporarily unavailable stops must remain resumable when explicitly retained');
}

{
  const loaded = load();
  const api = loaded.api;
  api.start(route());
  const skipped = api.skipStop('tower', { reason: 'user' });
  assert.equal(skipped.rideId, 'tower', 'an explicit skip must be recorded separately from completion');
  assert.equal(api.getActive().completed.length, 0, 'skipping must never count as completing a ride');
  assert.deepEqual(Array.from(api.getActive().skipped, event => event.rideId), ['tower']);
  api.updateRoute(route({
    stops: [{ rideId: 'coaster', name: 'Rock n Roller Coaster', experienceType: 'ride', postedWaitMinutes: 20 }],
    legs: []
  }), { reoptimization: true });
  const active = api.getActive();
  assert.deepEqual(Array.from(active.skipped, event => event.rideId), ['tower'], 'intentional skips must survive re-optimization');
  assert.deepEqual(Array.from(active.stops, stop => stop.rideId), ['tower', 'coaster'], 'skipped history must survive while the new route excludes that ride');
  const summary = api.end('manual');
  assert.equal(summary.completedStops, 0);
  assert.equal(summary.skippedStops, 1);
  assert.deepEqual(Array.from(summary.skippedRideIds), ['tower']);
}

{
  const loaded = load();
  const api = loaded.api;
  api.start(route());
  api.skipStop('tower', { reason: 'user' });
  api.completeStop('show', { source: 'manual', postedWaitMinutes: 20 });
  assert.equal(api.hasActive(), false, 'completing every non-skipped stop must finish the route');
  const summary = api.getLatestSummary();
  assert.equal(summary.reason, 'completed');
  assert.equal(summary.completedStops, 1);
  assert.equal(summary.skippedStops, 1);
}

{
  const loaded = load();
  const api = loaded.api;
  api.start(route());
  api.completeStop('tower', { source: 'manual', postedWaitMinutes: 28 });
  api.updateRoute(route({
    stops: [{ rideId: 'coaster', name: 'Rock n Roller Coaster', experienceType: 'ride', postedWaitMinutes: 20 }],
    legs: [{ fromRideId: null, toRideId: 'coaster', metres: 500, routingQuality: 'provider-gps' }]
  }), { reoptimization: true });
  const active = api.getActive();
  assert.deepEqual(Array.from(active.stops, stop => stop.rideId), ['tower', 'coaster'], 'completed day history must survive reoptimization even when it leaves the active queue');
  assert.equal(active.completed.length, 1);
}

{
  const first = load();
  first.api.start(route());
  assert.match(first.api.getActive().lastUpdated, /^\d{4}-\d{2}-\d{2}T/, 'active sessions must persist their last activity time');
  first.api.completeStop('tower', { source: 'manual', postedWaitMinutes: 28 });
  const second = load(first.getSaved());
  assert.equal(second.api.hasActive(), true, 'a recent active route must survive a same-day module reload');
  assert.equal(second.api.getActive().completed.length, 1);
  assert.equal(second.api.abandon().reason, 'abandoned');
  assert.equal(second.api.hasActive(), false);
}

{
  const first = load();
  const original = first.api.start(route());
  first.api.completeStop('tower', { source: 'manual', postedWaitMinutes: 28 });
  const staleState = JSON.parse(first.getSaved());
  staleState.active.lastUpdated = new Date(Date.now() - first.api.activeResumeWindowMs - 1).toISOString();
  const stale = load(JSON.stringify(staleState));
  assert.equal(stale.api.hasActive(), false, 'an active route outside the bounded park-day window must not resume');
  assert.equal(JSON.parse(stale.getSaved()).active, null, 'stale active state must be removed from persisted storage');
  const replacement = stale.api.updateRoute(route({
    stops: [{ rideId: 'coaster', name: 'Rock n Roller Coaster', experienceType: 'ride', postedWaitMinutes: 20 }],
    legs: []
  }));
  assert.notEqual(replacement.sessionId, original.sessionId, 'updating after expiry must start a new session instead of merging stale progress');
  assert.equal(replacement.completed.length, 0);
  assert.deepEqual(Array.from(replacement.stops, stop => stop.rideId), ['coaster']);
}

{
  const first = load();
  first.api.start(route());
  const persisted = JSON.parse(first.getSaved());
  const earlier = Date.now() - 60 * 60 * 1000;
  persisted.active.lastUpdated = new Date(earlier).toISOString();
  const resumed = load(JSON.stringify(persisted));
  resumed.api.updateRoute(route(), { reoptimization: true });
  assert(new Date(resumed.api.getActive().lastUpdated).getTime() > earlier, 'route updates must refresh the resumability timestamp');
}

{
  const loaded = load();
  const stops = Array.from({ length: 6 }, (_, index) => ({
    rideId: `ride-${index + 1}`,
    name: `Ride ${index + 1}`,
    experienceType: 'ride',
    postedWaitMinutes: 10 + index
  }));
  const legs = stops.map((stop, index) => ({
    fromRideId: index ? stops[index - 1].rideId : null,
    toRideId: stop.rideId,
    metres: 100,
    routingQuality: 'verified'
  }));
  loaded.api.start(route({ stops, legs }));
  stops.forEach((stop, index) => {
    loaded.api.completeStop(stop.rideId, {
      source: 'manual',
      postedWaitMinutes: 10 + index
    });
  });
  const summary = loaded.api.getLatestSummary();
  assert.equal(summary.completedStops, 6);
  assert.equal(summary.completedRides, 6, 'six manually confirmed ride stops must report six completed rides');
  assert.equal(summary.recordedWaitCount, 6);
  assert.equal(summary.walkingMetres, 600);
}

{
  const loaded = load();
  loaded.api.start(route());
  const summary = loaded.api.end('manual');
  assert.equal(summary.completedStops, 0, 'manual end must truthfully support a zero-completion recap');
  assert.equal(summary.completedRides, 0);
  assert.equal(summary.meaningfulProgress, false);
  assert.equal(summary.longestPostedWaitMinutes, null);
  assert.equal(summary.walkingMetres, null);
}

{
  const loaded = load();
  loaded.api.start(route());
  assert.equal(loaded.api.abandon(), null, 'abandonment without meaningful progress must not create a summary');
  assert.equal(loaded.api.hasActive(), false);
  assert.equal(loaded.api.getLatestSummary(), null);
  loaded.api.clearForTests();
  assert.equal(loaded.getSaved(), null);
}

{
  const loaded = load();
  loaded.api.start(route());
  loaded.api.completeStop('tower', { source: 'manual', postedWaitMinutes: 18 });
  loaded.api.skipStop('show', { reason: 'user' });
  assert.equal(loaded.api.hasActive(), false, 'skipping the final unresolved stop must finish the route');
  const summary = loaded.api.getLatestSummary();
  assert.equal(summary.completedStops, 1);
  assert.equal(summary.skippedStops, 1);
}

{
  const modulePath = path.join(__dirname, '..', 'js', 'route-session.js');
  delete require.cache[require.resolve(modulePath)];
  const previousStorage = global.localStorage;
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const commonJsApi = require(modulePath);
  assert.equal(typeof commonJsApi.start, 'function', 'the module must provide a CommonJS export');
  if (previousStorage === undefined) delete global.localStorage;
  else global.localStorage = previousStorage;
}

console.log('Route session validation passed.');
