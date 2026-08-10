(function(global) {
  'use strict';

  function inputSignature(context) {
    var safe = context || {};
    var rides = (safe.rides || []).map(function(ride) {
      return [ride.id, ride.waitTime, ride.status || ride.operatingStatus, ride.latitude, ride.longitude];
    }).sort(function(a, b) { return String(a[0]).localeCompare(String(b[0])); });
    return JSON.stringify({
      park: safe.parkId || null,
      mode: safe.mode || null,
      style: safe.routeStyle || null,
      manualStart: safe.manualStart || null,
      live: safe.livePosition ? [Number(safe.livePosition.lat).toFixed(5), Number(safe.livePosition.lng).toFixed(5)] : null,
      rides: rides
    });
  }

  function permitsDrawnRoute(park) {
    return !!(park && park.map && park.map.routingQuality === 'verified');
  }

  global.RideHeroRouteEngine = {
    inputSignature: inputSignature,
    permitsDrawnRoute: permitsDrawnRoute
  };
})(window);
