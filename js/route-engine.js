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

  function isRideEligible(ride, partyProfile) {
    if (!ride || !partyProfile) return true;
    var minimumPartyHeight = Number(partyProfile.minimumRiderHeightInches);
    var requiredHeight = Number(ride.minimumHeightInches);
    if (ride.restrictionsVerified && Number.isFinite(requiredHeight) && Number.isFinite(minimumPartyHeight) && minimumPartyHeight < requiredHeight) return false;
    return true;
  }

  function activeAccessPrograms(ride, userPrograms) {
    var available = ride && ride.accessPrograms || {};
    var selected = userPrograms || {};
    return Object.keys(available).filter(function(program) { return available[program] === true && selected[program] === true; });
  }

  global.RideHeroRouteEngine = {
    inputSignature: inputSignature,
    permitsDrawnRoute: permitsDrawnRoute,
    isRideEligible: isRideEligible,
    activeAccessPrograms: activeAccessPrograms
  };
})(window);
