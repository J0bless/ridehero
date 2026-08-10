const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(geolocation) {
  const context = vm.createContext({ console, Date, Math, Number, Promise, navigator: { geolocation }, window: {} });
  context.window.window = context.window;
  context.window.RIDEHERO_CATALOG = { parks: { park: {
    latitude: 10, longitude: 20,
    bounds: { center: { latitude: 10, longitude: 20 }, radiusKm: 1 },
    entrance: { latitude: 10.001, longitude: 20.001 }
  }, noentrance: { latitude: 30, longitude: 40, bounds: { center: { latitude: 30, longitude: 40 }, radiusKm: 1 }, entrance: null } } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'location-service.js'), 'utf8'), context, { filename: 'location-service.js' });
  return context.window.RideHeroLocationService;
}

(async () => {
  let service = load({ getCurrentPosition(success) { success({ coords: { latitude: 10, longitude: 20, accuracy: 5 } }); } });
  service.setSelectedPark('park');
  const position = await service.getCurrentPosition();
  assert.equal(position.source, 'live');
  assert.equal(service.isInsideParkBounds(position), true, 'in-park location is accepted');
  assert.equal(service.isInsideParkBounds({ latitude: 11, longitude: 21, accuracy: 5 }), false, 'outside location is rejected');
  assert.equal(service.getFallbackStartPoint('park', { name: 'Carousel', latitude: 10.2, longitude: 20.2 }).source, 'manual');
  assert.equal(service.getFallbackStartPoint('park').source, 'entrance');
  assert.equal(service.getFallbackStartPoint('noentrance').source, 'park-center');

  service = load({ getCurrentPosition(success, failure) { failure(new Error('denied')); } });
  await assert.rejects(service.getCurrentPosition({ force: true }), /denied/);
  console.log('Location service validation passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
