(function(global) {
  'use strict';
  var LEVELS = ['verified', 'provider', 'approximate', 'unknown'];

  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFKD').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function confidence(value, fallback) {
    return LEVELS.indexOf(value) >= 0 ? value : (fallback || 'unknown');
  }

  function location(latitude, longitude, dataConfidence, sourceName, sourceUrl) {
    var lat = latitude == null ? null : Number(latitude);
    var lng = longitude == null ? null : Number(longitude);
    var valid = Number.isFinite(lat) && Number.isFinite(lng);
    return {
      latitude: valid ? lat : null,
      longitude: valid ? lng : null,
      dataConfidence: valid ? confidence(dataConfidence) : 'unknown',
      sourceName: valid ? (sourceName || null) : null,
      sourceUrl: valid ? (sourceUrl || null) : null
    };
  }

  function aliasesFor(name) {
    var table = global.RIDEHERO_RIDE_ALIASES || {};
    var aliases = [name].concat(table[name] || []);
    return aliases.filter(Boolean).filter(function(value, index, all) { return all.indexOf(value) === index; });
  }

  function normalizeRide(ride, dataset) {
    ride.dataConfidence = confidence(ride.dataConfidence, ride.source ? 'verified' : 'unknown');
    ride.sourceUrl = ride.sourceUrl || ride.source || (dataset && dataset.sourceUrl) || (dataset && dataset.source) || null;
    ride.sourceName = ride.sourceName || (dataset && dataset.sourceName) || (ride.sourceUrl ? 'Official operator listing' : null);
    ride.lastVerified = ride.lastVerified || (dataset && dataset.lastVerified) || null;
    ride.aliases = aliasesFor(ride.name);
    ride.attractionLocation = ride.attractionLocation || location(ride.latitude, ride.longitude, ride.locationConfidence || 'unknown', ride.locationSourceName, ride.locationSourceUrl);
    ride.guestEntranceLocation = ride.guestEntranceLocation || location(null, null, 'unknown');
    ride.exitLocation = ride.exitLocation || location(null, null, 'unknown');
    ride.routingNode = ride.routingNode || null;
    ride.routingQuality = confidence(ride.routingQuality, ride.routingNode ? 'verified' : 'unknown');
    ride.accessPrograms = Object.assign({ lightningLane: false, expressPass: false, fastLane: false, singleRider: false, childSwap: false }, ride.accessPrograms || {});
    if (ride.singleRider === true) ride.accessPrograms.singleRider = true;
    if (ride.childSwap === true) ride.accessPrograms.childSwap = true;
    ride.minimumHeightInches = Number.isFinite(Number(ride.minimumHeightInches)) ? Number(ride.minimumHeightInches) : null;
    ride.minimumHeightCm = Number.isFinite(Number(ride.minimumHeightCm)) ? Number(ride.minimumHeightCm) : (ride.minimumHeightInches == null ? null : Math.round(ride.minimumHeightInches * 2.54));
    ride.restrictionsVerified = ride.restrictionsVerified === true;
    return ride;
  }

  function providerAliasMap(dataset) {
    var map = Object.create(null);
    (dataset.rides || []).forEach(function(ride) {
      normalizeRide(ride, dataset).aliases.forEach(function(alias) { map[normalize(alias)] = ride; });
    });
    return map;
  }

  global.RideHeroDataQuality = {
    levels: LEVELS.slice(),
    confidence: confidence,
    location: location,
    aliasesFor: aliasesFor,
    providerAliasMap: providerAliasMap,
    normalizeRide: normalizeRide
  };
})(window);
