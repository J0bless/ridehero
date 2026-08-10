(function(global) {
  'use strict';
  var catalog = global.RIDEHERO_CATALOG;
  var loadedFiles = Object.create(null);
  var datasets = Object.create(null);
  var loadedMaps = Object.create(null);

  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFKD').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function register(bundle) {
    Object.keys((bundle && bundle.parks) || {}).forEach(function(parkId) {
      datasets[parkId] = validateDataset(parkId, bundle.parks[parkId]);
    });
  }

  function loadParkDataset(parkId) {
    var park = catalog.parks[parkId];
    if (!park) return Promise.reject(new Error('Unknown park: ' + parkId));
    if (datasets[parkId]) return Promise.resolve(datasets[parkId]);
    if (loadedFiles[park.dataFile]) return loadedFiles[park.dataFile].then(function() { return datasets[parkId]; });
    loadedFiles[park.dataFile] = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'data/parks/' + park.dataFile + '.js';
      script.async = true;
      script.onload = function() {
        if (!datasets[parkId]) return reject(new Error('Dataset did not register park ' + parkId));
        resolve();
      };
      script.onerror = function() { reject(new Error('Could not load park data for ' + park.shortName)); };
      document.head.appendChild(script);
    });
    return loadedFiles[park.dataFile].then(function() { return datasets[parkId]; });
  }

  function validateDataset(parkId, dataset) {
    var safe = dataset || {};
    safe.lands = Array.isArray(safe.lands) ? safe.lands : [];
    safe.rides = Array.isArray(safe.rides) ? safe.rides : [];
    var landIds = Object.create(null);
    safe.lands = safe.lands.filter(function(land) {
      if (!land || !land.id || land.parkId !== parkId || landIds[land.id]) {
        console.error('RideHero park data error', { parkId: parkId, field: 'lands', reason: 'invalid or duplicate land record' });
        return false;
      }
      land.slug = land.slug || normalize(land.name);
      landIds[land.id] = true;
      return true;
    });
    var rideIds = Object.create(null);
    safe.rides = safe.rides.filter(function(ride) {
      var validLand = ride && (!ride.landId || landIds[ride.landId]);
      if (!ride || !ride.id || ride.parkId !== parkId || rideIds[ride.id] || !validLand) {
        console.error('RideHero park data error', { parkId: parkId, field: 'rides', reason: 'invalid ride, duplicate id, or mismatched land' });
        return false;
      }
      ride.normalizedName = ride.normalizedName || normalize(ride.name);
      ride.classification = ride.classification || 'other';
      rideIds[ride.id] = true;
      return true;
    });
    return safe;
  }

  function findParkByRoute(brandSlug, destinationSlug, parkSlug) {
    var brand = Object.keys(catalog.brands).map(function(id){ return catalog.brands[id]; }).find(function(item){ return item.slug === brandSlug; });
    var destination = Object.keys(catalog.destinations).map(function(id){ return catalog.destinations[id]; }).find(function(item){ return item.slug === destinationSlug && (!brand || item.brandId === brand.id); });
    var park = Object.keys(catalog.parks).map(function(id){ return catalog.parks[id]; }).find(function(item){ return item.slug === parkSlug && (!destination || item.destinationId === destination.id); });
    return { brand: brand || null, destination: destination || null, park: park || null };
  }

  function lazyLoadParkMap(parkId) {
    var park = catalog.parks[parkId];
    if (!park) return Promise.reject(new Error('Unknown park: ' + parkId));
    if (!park.map || !park.map.asset) return Promise.resolve(null);
    if (loadedMaps[parkId]) return loadedMaps[parkId];
    loadedMaps[parkId] = new Promise(function(resolve, reject) {
      var image = new Image();
      image.decoding = 'async';
      image.onload = function() { resolve(park.map); };
      image.onerror = function() { reject(new Error('Could not load map for ' + park.shortName)); };
      image.src = park.map.asset;
    });
    return loadedMaps[parkId];
  }

  global.RideHeroParkData = {
    register: register,
    load: loadParkDataset,
    get: function(parkId) { return datasets[parkId] || null; },
    normalize: normalize,
    findParkByRoute: findParkByRoute,
    lazyLoadParkMap: lazyLoadParkMap
  };
  global.lazyLoadParkMap = lazyLoadParkMap;
})(window);
