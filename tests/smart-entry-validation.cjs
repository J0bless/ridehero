const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const smartEntry = require('../js/smart-entry.js');

function circlePark(id, latitude, longitude, radiusMeters = 500, confidence = 'verified') {
  return {
    id,
    supported: true,
    latitude: latitude + 40,
    longitude: longitude + 40,
    bounds: {
      center: { latitude, longitude },
      radiusMeters,
      dataConfidence: confidence,
      sourceName: 'Test provider'
    }
  };
}

const hollywoodStudios = circlePark('hs', 28.3584, -81.5587);
const magicKingdom = circlePark('mk', 28.4160, -81.5812);
const universalFlorida = circlePark('usf', 28.4780, -81.4684);
const parks = { hs: hollywoodStudios, mk: magicKingdom, usf: universalFlorida };

let result = smartEntry.detectCurrentPark(
  { latitude: 28.3584, longitude: -81.5587, accuracy: 15 },
  parks
);
assert.equal(result.parkId, 'hs', 'Hollywood Studios is detected from trusted bounds');
assert.equal(result.confidence, 'high');
assert.equal(result.distanceMeters, 0);
assert.equal(result.reason, 'inside_trusted_park_bounds');
assert.equal(result.reasonCode, result.reason, 'results expose a stable reason code');
assert.equal(result.requiresConfirmation, true, 'even high-confidence detection remains user-confirmed');

result = smartEntry.detectCurrentPark(
  { latitude: 28.4160, longitude: -81.5812, accuracy: 150 },
  parks
);
assert.equal(result.parkId, 'mk', 'Magic Kingdom can be suggested at medium confidence');
assert.equal(result.confidence, 'medium');

result = smartEntry.detectCurrentPark(
  { latitude: 28.4780, longitude: -81.4684, accuracy: 20 },
  parks
);
assert.equal(result.parkId, 'usf', 'Universal Orlando parks use the same brand-neutral detector');
assert.equal(result.confidence, 'high');

const entranceOnly = {
  id: 'entrance-only',
  entrance: { latitude: 35, longitude: -80, dataConfidence: 'provider' },
  entranceConfidence: 'provider'
};
result = smartEntry.detectCurrentPark(
  { latitude: 35.0005, longitude: -80, accuracy: 25 },
  [entranceOnly]
);
assert.equal(result.parkId, 'entrance-only');
assert.equal(result.confidence, 'medium', 'an entrance proximity is useful but does not claim the guest is inside');
assert.equal(result.reason, 'near_trusted_park_entrance');

const adjacent = [
  circlePark('left', 40, -75.001, 80),
  circlePark('right', 40, -74.999, 80)
];
result = smartEntry.detectCurrentPark({ latitude: 40, longitude: -75, accuracy: 20 }, adjacent);
assert.equal(result.parkId, null, 'a location near two parks must not be guessed');
assert.equal(result.confidence, 'low');
assert.equal(result.reason, 'ambiguous_nearby_parks');

result = smartEntry.detectCurrentPark(
  { latitude: 28.3584, longitude: -81.5587, accuracy: 900 },
  parks
);
assert.equal(result.parkId, null, 'very poor accuracy cannot select a park');
assert.equal(result.confidence, 'low');
assert.equal(result.reason, 'location_accuracy_too_low');

result = smartEntry.detectCurrentPark({ latitude: 0, longitude: 0, accuracy: 20 }, parks);
assert.equal(result.parkId, null, 'a guest outside all supported parks is not matched');
assert.equal(result.confidence, 'unknown');
assert.equal(result.reason, 'outside_supported_parks');

result = smartEntry.detectCurrentPark(null, parks, { failureReason: 'permission_denied' });
assert.deepEqual(
  { parkId: result.parkId, confidence: result.confidence, reason: result.reason },
  { parkId: null, confidence: 'unknown', reason: 'permission_denied' },
  'permission denial remains a non-blocking unknown result'
);
result = smartEntry.detectCurrentPark(null, parks, { failureReason: 'gps_unavailable' });
assert.equal(result.reason, 'gps_unavailable', 'no-GPS state remains explicit');

const approximateOnly = circlePark('approx', 10, 20, 500, 'approximate');
approximateOnly.entrance = { latitude: 10, longitude: 20, dataConfidence: 'unknown' };
result = smartEntry.detectCurrentPark({ latitude: 10, longitude: 20, accuracy: 5 }, [approximateOnly]);
assert.equal(result.parkId, null, 'approximate bounds and unknown entrances are never detection evidence');
assert.equal(result.confidence, 'unknown');
assert.equal(result.reason, 'no_trusted_park_geometry');
assert.equal(smartEntry.getDistanceToPark({ latitude: 10, longitude: 20 }, approximateOnly), null, 'distance is not invented from untrusted geometry');

const centerOnly = {
  id: 'provider-center',
  parkCenter: { latitude: 12, longitude: 13, dataConfidence: 'provider', sourceName: 'Test provider' }
};
result = smartEntry.detectCurrentPark({ latitude: 12, longitude: 13, accuracy: 20 }, [centerOnly]);
assert.equal(result.parkId, 'provider-center');
assert.equal(result.confidence, 'medium', 'a unique provider center can only support a cautious suggestion');
assert.equal(result.reason, 'near_provider_park_center');

const now = 1_800_000_000_000;
const recent = smartEntry.getRecentParkSuggestion({ parkId: 'hs', selectedAt: now - 60_000 }, parks, { now });
assert.equal(recent.parkId, 'hs');
assert.equal(recent.source, 'recent');
assert.equal(recent.confidence, 'unknown');
assert.equal(recent.requiresConfirmation, true, 'recent parks are explicit suggestions, never silent selections');
assert.equal(smartEntry.getRecentParkSuggestion({ parkId: 'hs', selectedAt: now - smartEntry.THRESHOLDS.RECENT_PARK_MAX_AGE_MS - 1 }, parks, { now }), null, 'expired recent parks are ignored');
assert.equal(smartEntry.getRecentParkSuggestion({ parkId: 'missing', selectedAt: now - 1 }, parks, { now }), null, 'unsupported recent parks are ignored');

const resolved = smartEntry.resolveSmartEntry({
  position: null,
  locationFailure: 'permission_denied',
  recentPark: { parkId: 'hs', selectedAt: now - 1000 },
  parks,
  now
});
assert.equal(resolved.detection.confidence, 'unknown');
assert.equal(resolved.suggestion.source, 'recent', 'recent fallback is surfaced only as a confirmation card');
assert.equal(resolved.suggestion.requiresConfirmation, true);

const nearby = smartEntry.findNearbySupportedParks({ latitude: 28.3584, longitude: -81.5587, accuracy: 10 }, parks);
assert.equal(nearby[0].parkId, 'hs');
assert.equal(smartEntry.getDistanceToPark({ latitude: 28.3584, longitude: -81.5587 }, hollywoodStudios), 0);

const catalogContext = vm.createContext({ window: {} });
catalogContext.window.window = catalogContext.window;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'park-catalog.js'), 'utf8'), catalogContext);
const productionCatalog = catalogContext.window.RIDEHERO_CATALOG;
result = smartEntry.detectCurrentPark(
  { latitude: productionCatalog.parks.hs.latitude, longitude: productionCatalog.parks.hs.longitude, accuracy: 5 },
  productionCatalog
);
assert.equal(result.parkId, 'hs', 'the sourced provider park boundary supports a production in-park match');
assert.equal(result.confidence, 'high', 'a precise fix inside a sourced provider geofence can reach high confidence');
assert.equal(result.evidenceType, 'fence');
assert.equal(productionCatalog.parks.hs.geofence.dataConfidence, 'provider');
assert.match(productionCatalog.parks.hs.geofence.sourceUrl, /^https:\/\/www\.openstreetmap\.org\/way\//, 'trusted geofences must retain provider provenance');
result = smartEntry.detectCurrentPark(
  { latitude: productionCatalog.parks.dl.latitude, longitude: productionCatalog.parks.dl.longitude, accuracy: 5 },
  productionCatalog
);
assert.equal(result.parkId, null, 'adjacent Disneyland Resort provider centers are not guessed without trustworthy fences');
assert.equal(result.confidence, 'low');
assert.equal(result.reason, 'ambiguous_nearby_parks');

const browserContext = vm.createContext({ window: {}, globalThis: {} });
browserContext.window.window = browserContext.window;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'smart-entry.js'), 'utf8'), browserContext);
assert.equal(typeof browserContext.window.RideHeroSmartEntry.detectCurrentPark, 'function', 'browser UMD export is available');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'smart-entry.js'), 'utf8');
assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i, 'the pure detector must not persist GPS or park history');

console.log('Smart Entry validation passed.');
