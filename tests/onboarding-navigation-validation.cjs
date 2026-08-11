const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = {
  innerHTML: '',
  classList: { add() {}, remove() {} },
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const created = {};
const document = {
  body: { classList: { add() {}, remove() {} }, appendChild(element) { if (element.id) created[element.id] = element; } },
  getElementById(id) { return id === 'screen-setup' ? root : created[id] || null; },
  querySelectorAll() { return []; },
  createElement() { return { id: '', className: '', hidden: false, onclick: null, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; }
};
const catalog = {
  brands: {
    disney: { id: 'disney', slug: 'disney', name: 'Disney', accent: '#2f56b3' },
    universal: { id: 'universal', slug: 'universal', name: 'Universal', accent: '#142a66' },
    'six-flags': { id: 'six-flags', slug: 'six-flags', name: 'Six Flags', accent: '#e5394a' }
  },
  destinations: {
    wdw: { id: 'wdw', slug: 'walt-disney-world', brandId: 'disney', name: 'Walt Disney World Resort', location: 'Florida', parkIds: ['mk'] },
    uor: { id: 'uor', slug: 'universal-orlando', brandId: 'universal', name: 'Universal Orlando Resort', location: 'Florida', parkIds: ['epic'] },
    sf: { id: 'sf', slug: 'great-adventure', brandId: 'six-flags', name: 'Six Flags Great Adventure', location: 'New Jersey', parkIds: ['sfga'] }
  },
  parks: {
    mk: { id: 'mk', slug: 'magic-kingdom', brandId: 'disney', destinationId: 'wdw', shortName: 'Magic Kingdom', officialName: 'Magic Kingdom Park', liveWaitTimesAvailable: true, map: { routingQuality: 'verified' }, waitTimeProviderId: 'mk-provider' },
    epic: { id: 'epic', slug: 'epic-universe', brandId: 'universal', destinationId: 'uor', shortName: 'Epic Universe', officialName: 'Universal Epic Universe', liveWaitTimesAvailable: true, map: { routingQuality: 'approximate' }, waitTimeProviderId: 'epic-provider' },
    sfga: { id: 'sfga', slug: 'great-adventure', brandId: 'six-flags', destinationId: 'sf', shortName: 'Great Adventure', officialName: 'Six Flags Great Adventure', liveWaitTimesAvailable: false, map: { routingQuality: 'approximate' }, waitTimeProviderId: null }
  }
};
let recent = { planningMode: null, brandId: null, destinationId: null, parkId: null };
let quickCalls = 0;
let fullCalls = 0;
const location = { hash: '', replace(next) { this.hash = next; } };
const context = vm.createContext({
  console,
  document,
  location,
  history: { length: 2, back() {} },
  currentPark: 'mk',
  parkHasBeenSelected: false,
  PARK_META: {},
  TP_IDS: {},
  HERO_COLORS: {},
  resetParkRuntimeState() {},
  activeScreenId() { return 'setup'; },
  showScreen() {},
  openPlanFlow() { fullCalls += 1; },
  goQuickRouteForPark() { quickCalls += 1; },
  applyGuidanceMode(mode) { context.lastGuidanceMode = mode; },
  setTimeout(callback) { callback(); return 0; },
  matchMedia() { return { matches: true }; },
  scrollTo() {},
  addEventListener() {},
  RIDEHERO_CATALOG: catalog,
  RideHeroState: { get() { return { recent }; }, rememberContext(next) { recent = Object.assign({}, recent, next); } },
  RideHeroLocationService: { setSelectedPark() {} },
  RideHeroParkData: {
    load: async function() { return { rides: [] }; },
    findParkByRoute(brandSlug, destinationSlug, parkSlug) {
      const brand = Object.values(catalog.brands).find((item) => item.slug === brandSlug);
      const destination = brand && Object.values(catalog.destinations).find((item) => item.brandId === brand.id && item.slug === destinationSlug);
      const park = destination && Object.values(catalog.parks).find((item) => item.destinationId === destination.id && item.slug === parkSlug);
      return { brand, destination, park };
    }
  }
});
context.window = context;

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'navigation.js'), 'utf8'), context, { filename: 'js/navigation.js' });
const navigation = context.RideHeroMultiResort;

assert.equal(location.hash, '#/mode', 'a fresh visit must start at planning mode');
navigation.render();
assert.match(root.innerHTML, /How should we guide your day\?/);
assert.match(root.innerHTML, /Plan a Quick Route/);
assert.match(root.innerHTML, /Maximize My Day/);
assert.doesNotMatch(root.innerHTML, /data-brand=/, 'brands must not appear before mode selection');

navigation.selectPlanningMode('quick');
assert.equal(navigation.getState().planningMode, 'quick');
assert.equal(location.hash, '#/brands');
assert.equal(context.lastGuidanceMode, 'quick');
navigation.render();
assert.match(root.innerHTML, /Where are you going\?/);
assert.match(root.innerHTML, /data-brand="disney"/);
assert.match(root.innerHTML, /data-brand="universal"/);
assert.match(root.innerHTML, /data-brand="six-flags"/);

location.hash = '#/parks/disney';
navigation.render();
assert.match(root.innerHTML, /Choose a Disney destination/);
assert.match(root.innerHTML, /Walt Disney World Resort/);
location.hash = '#/parks/disney/walt-disney-world';
navigation.render();
assert.match(root.innerHTML, /Choose your park/);
assert.match(root.innerHTML, /Magic Kingdom/);

(async function() {
  await navigation.choosePark('mk');
  assert.equal(quickCalls, 1, 'Quick selection must open the existing Quick route flow');
  assert.equal(fullCalls, 0);
  assert.equal(recent.planningMode, 'quick');

  navigation.selectPlanningMode('full');
  assert.equal(navigation.getState().planningMode, 'full');
  assert.equal(context.lastGuidanceMode, 'strategic');
  location.hash = '#/parks/universal';
  navigation.render();
  assert.match(root.innerHTML, /Choose a Universal destination/);
  assert.match(root.innerHTML, /Universal Orlando Resort/);
  location.hash = '#/parks/universal/universal-orlando';
  navigation.render();
  assert.match(root.innerHTML, /Epic Universe/);
  await navigation.choosePark('epic');
  assert.equal(fullCalls, 1, 'Maximize selection must open the existing Full Day flow');
  assert.equal(quickCalls, 1);
  assert.equal(recent.planningMode, 'full');

  location.hash = '#/parks/six-flags';
  navigation.render();
  assert.match(root.innerHTML, /Six Flags Great Adventure/, 'Six Flags destinations must remain available');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'navigation.js'), 'utf8'), /heading\.focus\(\{ preventScroll: true \}\)/, 'navigation must move focus to each new screen heading');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'navigation.js'), 'utf8'), /history\.back\(\)/, 'browser back must use native history when available');
  assert.doesNotMatch(root.innerHTML, /role="listitem"/, 'interactive cards must keep native button semantics');
  console.log('Planning-first onboarding navigation validation passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
