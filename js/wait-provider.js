(function(global) {
  'use strict';
  var API_ROOT = 'https://api.themeparks.wiki/v1/entity/';
  var TTL_MS = 120000;
  var cache = Object.create(null);
  var activeRequest = null;
  var activeParkId = null;

  function normalizeStatus(status) {
    var value = String(status || '').toUpperCase();
    if (value === 'OPERATING' || value === 'OPEN') return 'OPEN';
    if (value === 'DOWN' || value === 'TEMPORARILY_CLOSED') return 'TEMPORARILY_DOWN';
    if (value === 'DELAYED') return 'DELAYED';
    if (value === 'CLOSED') return 'CLOSED';
    if (value === 'REFURBISHMENT' || value === 'SEASONAL') return 'SEASONAL';
    return 'UNKNOWN';
  }

  function waitMinutes(entity) {
    var standby = entity && entity.queue && entity.queue.STANDBY;
    return standby && standby.waitTime != null && Number.isFinite(Number(standby.waitTime)) ? Number(standby.waitTime) : null;
  }

  function normalizeProviderRide(entity, staticRide, child) {
    var location = (child && child.location) || null;
    var legacyWdwPark = ['mk', 'ep', 'hs', 'ak'].indexOf(activeParkId) >= 0;
    var legacyClassification = legacyWdwPark && typeof global.classifyExperience === 'function'
      ? global.classifyExperience(entity)
      : 'other';
    return {
      id: staticRide ? staticRide.id : entity.id,
      providerId: entity.id,
      providerNamespace: 'themeparks-wiki',
      parkId: staticRide ? staticRide.parkId : activeParkId,
      landId: staticRide ? staticRide.landId : null,
      name: (staticRide && staticRide.name) || entity.name,
      normalizedName: global.RideHeroParkData.normalize((staticRide && staticRide.name) || entity.name),
      type: (staticRide && staticRide.type) || 'attraction',
      classification: (staticRide && staticRide.classification) || legacyClassification,
      status: normalizeStatus(entity.status),
      operatingStatus: normalizeStatus(entity.status),
      waitMinutes: waitMinutes(entity),
      waitTime: waitMinutes(entity),
      latitude: location && Number.isFinite(Number(location.latitude)) ? Number(location.latitude) : null,
      longitude: location && Number.isFinite(Number(location.longitude)) ? Number(location.longitude) : null,
      minimumHeight: staticRide ? staticRide.minimumHeight : null,
      singleRider: staticRide ? staticRide.singleRider : null,
      childSwap: staticRide ? staticRide.childSwap : null,
      expressEligibility: staticRide ? staticRide.expressEligibility : null,
      source: (staticRide && staticRide.source) || 'https://api.themeparks.wiki/',
      lastVerified: (staticRide && staticRide.lastVerified) || global.RIDEHERO_CATALOG.lastVerified,
      lastUpdated: entity.lastUpdated || null
    };
  }

  function staticInformation(dataset) {
    return dataset.rides.map(function(ride) {
      var copy = Object.assign({}, ride);
      copy.status = 'UNKNOWN';
      copy.waitMinutes = null;
      copy.waitTime = null;
      return copy;
    });
  }

  async function fetchLegacyProxy(proxyUrl, parkId, signal) {
    if (!proxyUrl || ['mk', 'ep', 'hs', 'ak'].indexOf(parkId) < 0) return null;
    var response = await fetch(proxyUrl.replace(/\/$/, '') + '/waittimes?park=' + encodeURIComponent(parkId) + '&source=auto', { signal: signal });
    if (!response.ok) throw new Error('RideHero proxy returned an unavailable response');
    var payload = await response.json();
    var rides = Array.isArray(payload) ? payload : (payload.rides || payload.data || []);
    if (!Array.isArray(rides)) throw new Error('RideHero proxy returned malformed ride data');
    return rides;
  }

  async function getRideWaitTimes(parkId, options) {
    options = options || {};
    var park = global.RIDEHERO_CATALOG.parks[parkId];
    if (!park) throw new Error('Unknown park: ' + parkId);
    var dataset = await global.RideHeroParkData.load(parkId);
    var cached = cache[parkId];
    if (!options.force && cached && Date.now() - cached.at < TTL_MS) return cached.value;
    if (!park.liveWaitTimesAvailable || !park.waitTimeProviderId) {
      return { parkId: parkId, supported: false, source: 'static', rides: staticInformation(dataset), message: 'Live waits unavailable' };
    }

    if (activeRequest && activeParkId !== parkId) activeRequest.abort();
    activeRequest = new AbortController();
    activeParkId = parkId;
    var signal = activeRequest.signal;
    try {
      var base = API_ROOT + encodeURIComponent(park.waitTimeProviderId);
      var responses = await Promise.all([fetch(base + '/children', { signal: signal }), fetch(base + '/live', { signal: signal })]);
      if (!responses[0].ok || !responses[1].ok) throw new Error('Provider returned an unavailable response');
      var childrenPayload = await responses[0].json();
      var livePayload = await responses[1].json();
      var childById = Object.create(null);
      (childrenPayload.children || []).forEach(function(child) { childById[child.id] = child; });
      var staticByName = Object.create(null);
      dataset.rides.forEach(function(ride) { staticByName[global.RideHeroParkData.normalize(ride.name)] = ride; });
      var normalized = (livePayload.liveData || []).filter(function(entity) { return entity.entityType === 'ATTRACTION'; }).map(function(entity) {
        return normalizeProviderRide(entity, staticByName[global.RideHeroParkData.normalize(entity.name)] || null, childById[entity.id]);
      });
      var providerNames = Object.create(null);
      normalized.forEach(function(ride) { providerNames[ride.normalizedName] = true; });
      staticInformation(dataset).forEach(function(ride) { if (!providerNames[ride.normalizedName]) normalized.push(ride); });
      var value = { parkId: parkId, supported: true, source: 'themeparks.wiki', rides: normalized, message: null, fetchedAt: new Date().toISOString() };
      cache[parkId] = { at: Date.now(), value: value };
      return value;
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      try {
        var proxyRides = await fetchLegacyProxy(options.proxyUrl, parkId, signal);
        if (proxyRides) {
          var staticNames = Object.create(null);
          dataset.rides.forEach(function(ride) { staticNames[global.RideHeroParkData.normalize(ride.name)] = ride; });
          var normalizedProxy = proxyRides.map(function(ride) {
            var entity = {
              id: ride.id || ride.entityId || global.RideHeroParkData.normalize(ride.name),
              name: ride.name,
              // The existing RideHero proxy returns its rides collection as the
              // currently operating set, and historically omitted a status field.
              status: ride.status || ride.operatingStatus || 'OPERATING',
              queue: { STANDBY: { waitTime: ride.waitTime != null ? ride.waitTime : ride.waitMinutes } },
              lastUpdated: ride.lastUpdated || null
            };
            return normalizeProviderRide(entity, staticNames[global.RideHeroParkData.normalize(ride.name)] || null, ride);
          });
          var proxyValue = { parkId: parkId, supported: true, source: 'ridehero-proxy', rides: normalizedProxy, message: null, fetchedAt: new Date().toISOString() };
          cache[parkId] = { at: Date.now(), value: proxyValue };
          return proxyValue;
        }
      } catch (proxyError) {
        if (proxyError && proxyError.name === 'AbortError') throw proxyError;
      }
      return { parkId: parkId, supported: true, source: 'static', rides: staticInformation(dataset), message: 'Live wait times are temporarily unavailable.', error: error };
    } finally {
      if (activeParkId === parkId) { activeRequest = null; activeParkId = null; }
    }
  }

  global.RideHeroWaitProvider = {
    getParkStatus: async function(parkId) { var result = await getRideWaitTimes(parkId); return { parkId: parkId, live: result.supported && result.source !== 'static', message: result.message }; },
    getRideWaitTimes: getRideWaitTimes,
    getRideStatus: async function(parkId, rideId) { var result = await getRideWaitTimes(parkId); return result.rides.find(function(ride){ return ride.id === rideId || ride.providerId === rideId; }) || null; },
    normalizeProviderRide: normalizeProviderRide,
    normalizeProviderStatus: normalizeStatus,
    cancel: function() { if (activeRequest) activeRequest.abort(); },
    clearCache: function(parkId) { if (parkId) delete cache[parkId]; else cache = Object.create(null); }
  };
})(window);
