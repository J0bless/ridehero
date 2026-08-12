(function(global) {
  'use strict';
  var selectedParkId = null;
  var cachedPosition = null;
  var cachedAt = 0;
  var pending = null;
  var watchId = null;
  var watchSubscribers = Object.create(null);
  var CACHE_MS = 60000;

  function clonePosition(position) {
    return position ? {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      capturedAt: position.capturedAt,
      source: position.source
    } : null;
  }

  function haversine(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b.latitude - a.latitude) * rad;
    var dLng = (b.longitude - a.longitude) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function getCurrentPosition(options) {
    options = options || {};
    if (!options.force && cachedPosition && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(clonePosition(cachedPosition));
    if (pending) return pending;
    if (!navigator.geolocation) return Promise.reject(new Error('Location is not supported on this device.'));
    pending = new Promise(function(resolve, reject) {
      navigator.geolocation.getCurrentPosition(function(position) {
        cachedAt = Date.now();
        cachedPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date(cachedAt).toISOString(), source: 'live' };
        pending = null; resolve(clonePosition(cachedPosition));
      }, function(error) { pending = null; reject(error); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    });
    return pending;
  }

  function normalizeWatchKey(key) {
    return String(key || '').replace(/[^a-z0-9_-]+/gi, '').slice(0, 40);
  }

  function cacheGeolocationPosition(position) {
    cachedAt = Date.now();
    cachedPosition = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      capturedAt: new Date(cachedAt).toISOString(),
      source: 'live'
    };
    return clonePosition(cachedPosition);
  }

  function notifyWatchers(kind, value) {
    Object.keys(watchSubscribers).forEach(function(key) {
      var handler = watchSubscribers[key] && watchSubscribers[key][kind];
      if (typeof handler === 'function') {
        try { handler(kind === 'onPosition' ? clonePosition(value) : value); } catch (error) {}
      }
    });
  }

  function ensureSharedWatch() {
    if (watchId != null || !Object.keys(watchSubscribers).length || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(function(position) {
      notifyWatchers('onPosition', cacheGeolocationPosition(position));
    }, function(error) {
      notifyWatchers('onError', error);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  }

  function startWatch(key, handlers) {
    var normalizedKey = normalizeWatchKey(key);
    if (!normalizedKey || !navigator.geolocation) return null;
    watchSubscribers[normalizedKey] = {
      onPosition: handlers && handlers.onPosition,
      onError: handlers && handlers.onError
    };
    ensureSharedWatch();
    return normalizedKey;
  }

  function stopWatch(key) {
    var normalizedKey = normalizeWatchKey(key);
    if (normalizedKey) delete watchSubscribers[normalizedKey];
    if (watchId != null && !Object.keys(watchSubscribers).length && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(watchId); } catch (error) {}
      watchId = null;
    }
  }

  function isInsideParkBounds(position, parkId) {
    var id = parkId || selectedParkId;
    var park = global.RIDEHERO_CATALOG.parks[id];
    if (!park || !position) return null;
    var boundary = park.geofence || park.fence || park.bounds;
    if (!boundary) return null;
    var confidence = String(boundary.dataConfidence || boundary.confidence || 'unknown').toLowerCase();
    if (confidence !== 'verified' && confidence !== 'provider') return null;
    if (!global.RideHeroSmartEntry) return null;
    var detection = global.RideHeroSmartEntry.detectCurrentPark(position, global.RIDEHERO_CATALOG);
    return detection && detection.parkId === id &&
      (detection.confidence === 'high' || detection.confidence === 'medium') &&
      Number(detection.distanceMeters) === 0;
  }

  function getFallbackStartPoint(parkId, manualStart) {
    var park = global.RIDEHERO_CATALOG.parks[parkId || selectedParkId];
    if (manualStart) return { source: 'manual', label: manualStart.label || manualStart.name || 'Selected starting point', latitude: manualStart.latitude != null ? manualStart.latitude : null, longitude: manualStart.longitude != null ? manualStart.longitude : null };
    if (park && park.entrance) return { source: 'entrance', label: 'Starting from Main Entrance', latitude: park.entrance.latitude, longitude: park.entrance.longitude };
    return { source: 'park-center', label: 'Using approximate park start', latitude: park ? park.latitude : null, longitude: park ? park.longitude : null };
  }

  global.RideHeroLocationService = {
    getCurrentPosition: getCurrentPosition,
    startWatch: startWatch,
    stopWatch: stopWatch,
    getCachedPosition: function() { return cachedPosition && Date.now() - cachedAt < CACHE_MS ? clonePosition(cachedPosition) : null; },
    getAccuracy: function(position) { var value = position || cachedPosition; return value && Number.isFinite(Number(value.accuracy)) ? Number(value.accuracy) : null; },
    getSelectedPark: function() { return global.RIDEHERO_CATALOG.parks[selectedParkId] || null; },
    setSelectedPark: function(parkId) { selectedParkId = parkId; },
    isInsideParkBounds: isInsideParkBounds,
    findNearbySupportedParks: function(position, options) {
      if (!global.RideHeroSmartEntry) return [];
      return global.RideHeroSmartEntry.findNearbySupportedParks(position || cachedPosition, global.RIDEHERO_CATALOG, options);
    },
    detectCurrentPark: function(position, options) {
      if (!global.RideHeroSmartEntry) return { parkId:null, confidence:'unknown', reason:'detector_unavailable' };
      return global.RideHeroSmartEntry.detectCurrentPark(position || cachedPosition, global.RIDEHERO_CATALOG, options);
    },
    getDistanceToPark: function(position, parkId) {
      if (!global.RideHeroSmartEntry) return null;
      var park = global.RIDEHERO_CATALOG.parks[parkId || selectedParkId];
      return global.RideHeroSmartEntry.getDistanceToPark(position || cachedPosition, park);
    },
    distanceToRide: function(position, ride) { if (!position || ride.latitude == null || ride.longitude == null) return null; return haversine(position, { latitude: Number(ride.latitude), longitude: Number(ride.longitude) }); },
    getFallbackStartPoint: getFallbackStartPoint,
    clearCache: function() { cachedPosition = null; cachedAt = 0; pending = null; }
  };
})(window);
