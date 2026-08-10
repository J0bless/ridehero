(function(global) {
  'use strict';
  var selectedParkId = null;
  var cachedPosition = null;
  var cachedAt = 0;
  var pending = null;
  var CACHE_MS = 60000;

  function haversine(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b.latitude - a.latitude) * rad;
    var dLng = (b.longitude - a.longitude) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function getCurrentPosition(options) {
    options = options || {};
    if (!options.force && cachedPosition && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(cachedPosition);
    if (pending) return pending;
    if (!navigator.geolocation) return Promise.reject(new Error('Location is not supported on this device.'));
    pending = new Promise(function(resolve, reject) {
      navigator.geolocation.getCurrentPosition(function(position) {
        cachedPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, source: 'live' };
        cachedAt = Date.now(); pending = null; resolve(cachedPosition);
      }, function(error) { pending = null; reject(error); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    });
    return pending;
  }

  function isInsideParkBounds(position, parkId) {
    var park = global.RIDEHERO_CATALOG.parks[parkId || selectedParkId];
    if (!park || !park.bounds || !position) return null;
    var distance = haversine(position, park.bounds.center);
    var tolerance = (park.bounds.radiusKm * 1000) + Math.min(Number(position.accuracy) || 0, 1000);
    return distance <= tolerance;
  }

  function getFallbackStartPoint(parkId, manualStart) {
    var park = global.RIDEHERO_CATALOG.parks[parkId || selectedParkId];
    if (manualStart) return { source: 'manual', label: manualStart.label || manualStart.name || 'Selected starting point', latitude: manualStart.latitude != null ? manualStart.latitude : null, longitude: manualStart.longitude != null ? manualStart.longitude : null };
    if (park && park.entrance) return { source: 'entrance', label: 'Starting from Main Entrance', latitude: park.entrance.latitude, longitude: park.entrance.longitude };
    return { source: 'park-center', label: 'Using approximate park start', latitude: park ? park.latitude : null, longitude: park ? park.longitude : null };
  }

  global.RideHeroLocationService = {
    getCurrentPosition: getCurrentPosition,
    getSelectedPark: function() { return global.RIDEHERO_CATALOG.parks[selectedParkId] || null; },
    setSelectedPark: function(parkId) { selectedParkId = parkId; },
    isInsideParkBounds: isInsideParkBounds,
    distanceToRide: function(position, ride) { if (!position || ride.latitude == null || ride.longitude == null) return null; return haversine(position, { latitude: Number(ride.latitude), longitude: Number(ride.longitude) }); },
    getFallbackStartPoint: getFallbackStartPoint,
    clearCache: function() { cachedPosition = null; cachedAt = 0; pending = null; }
  };
})(window);
