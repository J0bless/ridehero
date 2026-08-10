const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptMatches = Array.from(html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi));
const scriptMatch = scriptMatches.find((match) => !/\bsrc\s*=/.test(match[1]));
assert(scriptMatch, 'index.html must contain an inline script');
assert.doesNotMatch(html, /Preview route/, 'the Preview route badge must be removed');
assert.doesNotMatch(html, /route-start-status/, 'the old route status banner must be removed');
assert.doesNotMatch(html, /Balanced wait \+ walking-distance route/, 'the preview description must be removed');
assert.match(html, /mapSection\.appendChild\(panel\)/, 'manual and location controls must render below the map');

const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
const style = { setProperty() {}, removeProperty() {} };
const baseElement = {
  style,
  classList,
  dataset: {},
  value: '',
  innerHTML: '',
  textContent: '',
  addEventListener() {},
  appendChild() {},
  insertBefore() {},
  setAttribute() {},
  removeAttribute() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 844 }; }
};
const element = new Proxy(baseElement, {
  get(target, key) {
    if (key in target) return target[key];
    return function noop() {};
  }
});

const document = {
  body: element,
  documentElement: element,
  getElementById() { return element; },
  querySelector() { return element; },
  querySelectorAll() { return []; },
  createElement() { return element; },
  createElementNS() { return element; }
};

const context = vm.createContext({
  console,
  document,
  navigator: {},
  localStorage: { getItem() { return null; }, setItem() {} },
  alert() {},
  fetch: async () => { throw new Error('Network disabled in validation'); },
  setTimeout() { return 0; },
  clearTimeout() {},
  setInterval() { return 0; },
  clearInterval() {},
  requestAnimationFrame() { return 0; },
  cancelAnimationFrame() {},
  innerWidth: 390,
  innerHeight: 844
});
context.window = context;

vm.runInContext(scriptMatch[2], context, { filename: 'index.inline.js' });
const run = (source) => vm.runInContext(source, context);

run(`
  currentPark = 'mk';
  activeRidePark = 'mk';
  currentMode = 'quick';
  experienceFilter = 'both';
  rideSearchQuery = '';
  rides = [
    {id:'near', name:'Space Mountain', waitTime:25},
    {id:'far', name:'Big Thunder Mountain', waitTime:25},
    {id:'mid', name:'Seven Dwarfs Mine Train', waitTime:25},
    {id:'show', name:'Hall of Presidents', waitTime:5}
  ];
  selected = new Set(rides.map(function(ride) { return ride.id; }));
  routeStartMode = 'live';
  routeLivePosition = {lat:28.4198, lng:-81.5757, accuracy:10};
  routeManualStart = 'entrance_gate';
`);

assert.deepEqual(
  Array.from(run('quickRideCandidates().map(function(ride) { return ride.id; })')),
  ['near', 'far', 'mid'],
  'Quick Mode must remove attractions before scoring'
);
assert.equal(run(`selectedQuickRides().some(function(ride) { return classifyExperience(ride) === 'attraction'; })`), false,
  'stale attraction selections must not enter a Quick route');
assert.deepEqual(
  Array.from(run('filteredRides().map(function(ride) { return ride.id; })')),
  ['near', 'far', 'mid'],
  'Quick selectable and recommendation lists must contain rides only'
);
run(`renderRides('themeparks.wiki');`);
assert.match(element.innerHTML, /Rides only/, 'Quick Mode must show the rides-only label');
assert.doesNotMatch(element.innerHTML, /data-filter="attraction"/, 'Quick Mode must hide attraction filters');
assert.doesNotMatch(element.innerHTML, /Hall of Presidents/, 'Quick recommendations must exclude attractions');

const nearbyRoute = Array.from(run('computeLocalRoute(selectedQuickRides()).map(function(ride) { return ride.id; })'));
assert.equal(nearbyRoute[0], 'near', 'equal-wait rides should favor the user-nearby ride');
assert.equal(nearbyRoute.includes('show'), false, 'Quick routes must never include an attraction');

run(`
  rides = [
    {id:'near-high', name:'Space Mountain', waitTime:65},
    {id:'near-mid', name:'TRON Lightcycle Run', waitTime:45},
    {id:'mid', name:'Seven Dwarfs Mine Train', waitTime:35},
    {id:'far-low', name:'Big Thunder Mountain', waitTime:5}
  ];
  selected = new Set(rides.map(function(ride) { return ride.id; }));
`);
const waitBalancedRoute = Array.from(run('computeLocalRoute(selectedQuickRides()).map(function(ride) { return ride.id; })'));
assert(waitBalancedRoute.includes('far-low'), 'a significantly shorter wait must remain competitive despite distance');

run(`rides = [{id:'only', name:'Space Mountain', waitTime:20}]; selected = new Set(['only']);`);
assert.equal(run('computeLocalRoute(selectedQuickRides()).length'), 1,
  'Quick Mode must return fewer than three rides when fewer are available');

run(`routeStartMode = 'preview'; routeLivePosition = null; currentPark = 'ak'; routeManualStart = 'africa_bridge_land';`);
assert.equal(run('quickRouteStartPoint().name'), 'Africa', 'selected manual start must remain the fallback');
run(`currentPark = 'ep'; routeManualStart = 'entrance_gate';`);
assert.equal(run('quickRouteStartPoint().name'), 'EPCOT Entrance', 'park entrance must be the default fallback');

run(`
  currentMode = 'fullday';
  currentPark = 'mk';
  activeRidePark = 'mk';
  experienceFilter = 'both';
  rides = [
    {id:'ride', name:'Space Mountain', waitTime:20},
    {id:'show', name:'Hall of Presidents', waitTime:5}
  ];
`);
assert.equal(run('filteredRides().length'), 2, 'Full Day Both filter must remain unchanged');
assert.equal(run('quickRideCandidates().length'), 0, 'Quick-only helpers must be inert outside Quick Mode');
run(`experienceFilter = 'attraction';`);
assert.deepEqual(Array.from(run('filteredRides().map(function(ride) { return ride.id; })')), ['show'],
  'Full Day attraction filtering must remain unchanged');
run(`renderRides('themeparks.wiki');`);
assert.match(element.innerHTML, /data-filter="attraction"/, 'Full Day must retain the attraction filter');
assert.match(element.innerHTML, /data-filter="both"/, 'Full Day must retain the Both filter');

assert.equal(run(`isLocationInPark('mk', 28.4198, -81.5757)`), true, 'valid live park location should be accepted');
assert.equal(run(`isLocationInPark('mk', 28.3558, -81.5631)`), false, 'location outside the selected park should use fallback');

async function validateLocationPreparation() {
  run(`currentMode = 'quick'; currentPark = 'mk'; routeManualStart = 'entrance_gate';`);
  context.navigator.geolocation = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 28.4198, longitude: -81.5757, accuracy: 12 } });
    }
  };
  assert.equal(await run('prepareQuickRouteStart()'), true, 'valid live location should be used');
  assert.equal(run(`routeStartMode`), 'live');
  assert.equal(run(`quickRouteStartPoint().isLiveLocation`), true);

  run(`currentPark = 'ak'; routeManualStart = 'africa_bridge_land';`);
  context.navigator.geolocation = { getCurrentPosition(success, failure) { failure({ code: 1 }); } };
  assert.equal(await run('prepareQuickRouteStart()'), false, 'denied location should use fallback');
  assert.match(run(`routeLiveMessage`), /Africa fallback/, 'selected start should be shown as the fallback');

  run(`currentPark = 'ep'; routeManualStart = 'entrance_gate';`);
  assert.equal(await run('prepareQuickRouteStart()'), false, 'unavailable location should use entrance fallback');
  assert.match(run(`routeLiveMessage`), /EPCOT entrance fallback/, 'park entrance fallback should be shown');
}

validateLocationPreparation()
  .then(() => console.log('Quick Mode validation cases passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
