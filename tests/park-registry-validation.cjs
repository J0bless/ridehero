const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({ console, window: {}, document: { head: { appendChild() {} }, createElement() { return {}; } } });
context.window.window = context.window;

function run(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

run('data/park-catalog.js');
context.window.RIDEHERO_CATALOG = context.window.RIDEHERO_CATALOG;
run('data/ride-aliases.js');
run('js/data-quality.js');
run('js/park-catalog.js');

for (const file of fs.readdirSync(path.join(root, 'data', 'parks')).filter((name) => name.endsWith('.js'))) {
  run(path.join('data', 'parks', file));
}

const catalog = context.window.RIDEHERO_CATALOG;
const api = context.window.RideHeroParkData;
assert.equal(Object.keys(catalog.brands).length, 3, 'three operator brands are required');
assert.equal(Object.keys(catalog.parks).length, 15, 'four existing and eleven expansion parks are required');

const parkIds = new Set();
const providerIds = new Set();
for (const park of Object.values(catalog.parks)) {
  assert(!parkIds.has(park.id), `duplicate park id ${park.id}`);
  parkIds.add(park.id);
  assert(catalog.brands[park.brandId], `${park.id} must reference a brand`);
  const destination = catalog.destinations[park.destinationId];
  assert(destination, `${park.id} must reference a destination`);
  assert(destination.parkIds.includes(park.id), `${park.id} must belong to its destination`);
  assert.equal(typeof park.timezone, 'string');
  assert.equal(typeof park.officialName, 'string');
  ['slug','brandId','destinationId','shortName','city','country','latitude','longitude','operatingStatus','officialSource','lastVerified','mapRoutingAvailable','liveWaitTimesAvailable'].forEach((field) => {
    assert(Object.prototype.hasOwnProperty.call(park, field), `${park.id} is missing ${field}`);
  });
  assert(['verified','provider','approximate','unknown'].includes(park.dataConfidence));
  assert(['verified','provider','approximate','unknown'].includes(park.entranceConfidence));
  assert.equal(typeof park.sourceUrl, 'string');
  assert(['verified', 'approximate', 'unavailable'].includes(park.map.routingQuality));
  assert(!providerIds.has(park.waitTimeProviderId), `duplicate provider park id ${park.waitTimeProviderId}`);
  providerIds.add(park.waitTimeProviderId);

  const dataset = api.get(park.id);
  assert(dataset, `${park.id} dataset must register`);
  const landIds = new Set(dataset.lands.map((land) => land.id));
  const rideIds = new Set();
  const rideProviderIds = new Set();
  for (const land of dataset.lands) assert.equal(land.parkId, park.id);
  for (const ride of dataset.rides) {
    assert.equal(ride.parkId, park.id);
    assert(!rideIds.has(ride.id), `duplicate ride id ${ride.id}`);
    rideIds.add(ride.id);
    if (ride.landId) assert(landIds.has(ride.landId), `${ride.id} has an invalid land`);
    if (ride.providerId) {
      assert(!rideProviderIds.has(ride.providerId), `duplicate provider ride id ${ride.providerId}`);
      rideProviderIds.add(ride.providerId);
    }
    assert.equal(ride.classification, 'ride', `${ride.id} must use the normalized ride classification`);
    ['name','normalizedName','type','operatingStatus','source','lastVerified'].forEach((field) => {
      assert(Object.prototype.hasOwnProperty.call(ride, field), `${ride.id} is missing ${field}`);
    });
    assert(['verified','provider','approximate','unknown'].includes(ride.dataConfidence));
    assert.equal(typeof ride.sourceUrl, 'string');
    assert.equal(typeof ride.sourceName, 'string');
    assert(ride.guestEntranceLocation && Object.prototype.hasOwnProperty.call(ride.guestEntranceLocation, 'dataConfidence'));
    assert(ride.attractionLocation && Object.prototype.hasOwnProperty.call(ride.attractionLocation, 'dataConfidence'));
    assert(ride.accessPrograms && typeof ride.accessPrograms === 'object');
    assert(Object.prototype.hasOwnProperty.call(ride, 'minimumHeightInches'));
    assert(Object.prototype.hasOwnProperty.call(ride, 'minimumHeightCm'));
  }
}

const required = ['mk','ep','hs','ak','dl','dca','usf','ioa','epic','vb','ush','usj','sfga','sfmm','sfgam'];
required.forEach((parkId) => assert(parkIds.has(parkId), `${parkId} must load`));
assert.equal(catalog.parks.mk.map.routingQuality, 'verified');
assert.equal(catalog.parks.dl.map.routingQuality, 'approximate');
assert.equal(catalog.parks.sfga.map.routingQuality, 'approximate');

const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');
assert.match(navigation, /hashchange/, 'browser back and forward must be handled');
assert.match(navigation, /location\.hash/, 'deep links must use reload-safe hash routing');
assert.match(navigation, /Choose planning mode/, 'park selection must precede mode selection');
assert.match(navigation, /catalog-park-switcher/, 'selected parks must expose a compact switcher');
assert.match(navigation, /history\.back\(\)/, 'back navigation must use browser history');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.doesNotMatch(html, /<script[^>]+data\/parks\//i, 'park datasets must not load during initial startup');
assert.match(html, /lazyLoadParkMap/, 'route maps must load only when selected');
assert.match(html, /routingQuality !== 'verified'/, 'unverified maps must not draw route lines');

console.log('Park registry validation passed.');
