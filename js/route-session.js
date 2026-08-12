(function(root, factory) {
  'use strict';
  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideHeroRouteSession = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function(root) {
  'use strict';

  var STORAGE_KEY = 'rideheroRouteSession';
  var STORAGE_VERSION = 1;
  var MAX_STOPS = 100;
  var MAX_EVENTS = 100;
  var MAX_REOPTIMIZATIONS = 9999;
  // A park-day route may survive refreshes, but must never be revived days later.
  var ACTIVE_RESUME_WINDOW_MS = 18 * 60 * 60 * 1000;
  var MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
  var state = loadState();

  function storage() {
    try { return root && root.localStorage ? root.localStorage : null; } catch (error) { return null; }
  }

  function cleanText(value, limit) {
    if (value == null) return null;
    var text = String(value)
      .replace(/<[^>]*>/g, '')
      .replace(/[<>\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.slice(0, limit || 120) : null;
  }

  function cleanId(value) {
    var text = cleanText(value, 96);
    return text && /^[A-Za-z0-9._:-]+$/.test(text) ? text : null;
  }

  function cleanPlanningMode(value) {
    return value === 'quick' ? 'quick' : value === 'full' ? 'full' : null;
  }

  function finiteNumber(value, maximum) {
    if (value == null || value === '') return null;
    var number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    if (maximum != null && number > maximum) return null;
    return number;
  }

  function cleanTimestamp(value, fallback) {
    var date = value == null ? new Date(fallback == null ? Date.now() : fallback) : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(fallback == null ? Date.now() : fallback).toISOString();
  }

  function strictTimestamp(value) {
    if (value == null || value === '') return null;
    var time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  function isActiveResumable(active, now) {
    if (!active || !active.lastUpdated) return false;
    var updatedMs = new Date(active.lastUpdated).getTime();
    var currentMs = now == null ? Date.now() : now;
    if (!Number.isFinite(updatedMs) || !Number.isFinite(currentMs)) return false;
    var age = currentMs - updatedMs;
    return age >= -MAX_CLOCK_SKEW_MS && age <= ACTIVE_RESUME_WINDOW_MS;
  }

  function cleanExperienceType(value) {
    return value === 'ride' || value === 'attraction' ? value : 'other';
  }

  function cleanSource(value) {
    return value === 'location' || value === 'imported' ? value : 'manual';
  }

  function cleanStop(stop) {
    var rideId = cleanId(stop && (stop.rideId || stop.id));
    if (!rideId) return null;
    return {
      rideId: rideId,
      name: cleanText(stop.name, 120) || 'RideHero stop',
      experienceType: cleanExperienceType(stop.experienceType || stop.classification),
      postedWaitMinutes: finiteNumber(stop.postedWaitMinutes != null ? stop.postedWaitMinutes : stop.waitTime, 600)
    };
  }

  function cleanStops(stops) {
    var seen = Object.create(null);
    return (Array.isArray(stops) ? stops : []).slice(0, MAX_STOPS).map(cleanStop).filter(function(stop) {
      if (!stop || seen[stop.rideId]) return false;
      seen[stop.rideId] = true;
      return true;
    });
  }

  function cleanLeg(leg, stopIds) {
    var toRideId = cleanId(leg && leg.toRideId);
    var fromRideId = leg && leg.fromRideId != null ? cleanId(leg.fromRideId) : null;
    var metres = finiteNumber(leg && leg.metres, 1000000);
    var routingQuality = cleanText(leg && leg.routingQuality, 40);
    if (!toRideId || !stopIds[toRideId] || metres == null || !routingQuality) return null;
    if (fromRideId && !stopIds[fromRideId]) return null;
    return { fromRideId: fromRideId, toRideId: toRideId, metres: metres, routingQuality: routingQuality };
  }

  function cleanLegs(legs, stops) {
    var ids = Object.create(null);
    stops.forEach(function(stop) { ids[stop.rideId] = true; });
    var seenTo = Object.create(null);
    return (Array.isArray(legs) ? legs : []).slice(0, MAX_STOPS).map(function(leg) {
      return cleanLeg(leg, ids);
    }).filter(function(leg) {
      if (!leg || seenTo[leg.toRideId]) return false;
      seenTo[leg.toRideId] = true;
      return true;
    });
  }

  function cleanEvent(event, stopIds) {
    var rideId = cleanId(event && event.rideId);
    if (!rideId || !stopIds[rideId]) return null;
    return {
      rideId: rideId,
      source: cleanSource(event.source),
      postedWaitMinutes: finiteNumber(event.postedWaitMinutes, 600),
      completedAt: cleanTimestamp(event.completedAt)
    };
  }

  function cleanSkipEvent(event, stopIds) {
    var rideId = cleanId(event && event.rideId);
    if (!rideId || !stopIds[rideId]) return null;
    var reason = cleanText(event && event.reason, 24);
    return {
      rideId: rideId,
      reason: reason === 'unavailable' || reason === 'not-now' ? reason : 'user',
      skippedAt: cleanTimestamp(event && event.skippedAt)
    };
  }

  function randomId() {
    try {
      if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
      if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        root.crypto.getRandomValues(bytes);
        return Array.prototype.map.call(bytes, function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
      }
    } catch (error) {}
    return 'rs-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
  }

  function cleanRouteInput(input) {
    var safe = input || {};
    var parkId = cleanId(safe.parkId);
    var planningMode = cleanPlanningMode(safe.planningMode);
    var stops = cleanStops(safe.stops || safe.orderedStops);
    if (!parkId || !planningMode || !stops.length) return null;
    return {
      parkId: parkId,
      planningMode: planningMode,
      routeStyle: cleanText(safe.routeStyle, 40),
      stops: stops,
      legs: cleanLegs(safe.legs, stops)
    };
  }

  function cleanActive(raw) {
    var route = cleanRouteInput(raw);
    if (!route) return null;
    var stopIds = Object.create(null);
    route.stops.forEach(function(stop) { stopIds[stop.rideId] = true; });
    var seen = Object.create(null);
    var completed = (Array.isArray(raw.completed) ? raw.completed : []).slice(0, MAX_EVENTS).map(function(event) {
      return cleanEvent(event, stopIds);
    }).filter(function(event) {
      if (!event || seen[event.rideId]) return false;
      seen[event.rideId] = true;
      return true;
    });
    var skippedSeen = Object.create(null);
    var skipped = (Array.isArray(raw.skipped) ? raw.skipped : []).slice(0, MAX_EVENTS).map(function(event) {
      return cleanSkipEvent(event, stopIds);
    }).filter(function(event) {
      if (!event || seen[event.rideId] || skippedSeen[event.rideId]) return false;
      skippedSeen[event.rideId] = true;
      return true;
    });
    return {
      sessionId: cleanId(raw.sessionId) || randomId(),
      parkId: route.parkId,
      planningMode: route.planningMode,
      routeStyle: route.routeStyle,
      startedAt: cleanTimestamp(raw.startedAt),
      lastUpdated: strictTimestamp(raw.lastUpdated),
      stops: route.stops,
      legs: route.legs,
      completed: completed,
      skipped: skipped,
      reoptimizations: Math.min(MAX_REOPTIMIZATIONS, Math.floor(finiteNumber(raw.reoptimizations, MAX_REOPTIMIZATIONS) || 0)),
      status: 'active'
    };
  }

  function cleanSummary(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var parkId = cleanId(raw.parkId);
    var planningMode = cleanPlanningMode(raw.planningMode);
    if (!parkId || !planningMode) return null;
    var stops = cleanStops(raw.stops);
    var known = Object.create(null);
    stops.forEach(function(stop) { known[stop.rideId] = true; });
    var completedRideIds = (Array.isArray(raw.completedRideIds) ? raw.completedRideIds : []).map(cleanId).filter(function(id, index, list) {
      return id && known[id] && list.indexOf(id) === index;
    });
    var skippedRideIds = (Array.isArray(raw.skippedRideIds) ? raw.skippedRideIds : []).map(cleanId).filter(function(id, index, list) {
      return id && known[id] && completedRideIds.indexOf(id) < 0 && list.indexOf(id) === index;
    });
    return {
      sessionId: cleanId(raw.sessionId),
      parkId: parkId,
      planningMode: planningMode,
      routeStyle: cleanText(raw.routeStyle, 40),
      startedAt: cleanTimestamp(raw.startedAt),
      endedAt: cleanTimestamp(raw.endedAt),
      durationMinutes: finiteNumber(raw.durationMinutes, 525600),
      routeStopCount: Math.min(MAX_STOPS, Math.floor(finiteNumber(raw.routeStopCount, MAX_STOPS) || 0)),
      stops: stops,
      completedRideIds: completedRideIds,
      skippedRideIds: skippedRideIds,
      completedStops: Math.min(MAX_STOPS, Math.floor(finiteNumber(raw.completedStops, MAX_STOPS) || 0)),
      skippedStops: Math.min(MAX_STOPS, Math.floor(finiteNumber(raw.skippedStops, MAX_STOPS) || 0)),
      completedRides: Math.min(MAX_STOPS, Math.floor(finiteNumber(raw.completedRides, MAX_STOPS) || 0)),
      recordedWaitCount: Math.min(MAX_STOPS, Math.floor(finiteNumber(raw.recordedWaitCount, MAX_STOPS) || 0)),
      longestPostedWaitMinutes: finiteNumber(raw.longestPostedWaitMinutes, 600),
      averagePostedWaitMinutes: finiteNumber(raw.averagePostedWaitMinutes, 600),
      walkingMetres: finiteNumber(raw.walkingMetres, 1000000),
      walkingApproximate: raw.walkingMetres == null ? null : raw.walkingApproximate === true,
      routingQuality: cleanText(raw.routingQuality, 40),
      reoptimizations: Math.min(MAX_REOPTIMIZATIONS, Math.floor(finiteNumber(raw.reoptimizations, MAX_REOPTIMIZATIONS) || 0)),
      meaningfulProgress: raw.meaningfulProgress === true,
      reason: cleanText(raw.reason, 24) || 'manual'
    };
  }

  function emptyState() { return { version: STORAGE_VERSION, active: null, latestSummary: null }; }

  function loadState() {
    var store = storage();
    if (!store) return emptyState();
    try {
      var parsed = JSON.parse(store.getItem(STORAGE_KEY) || 'null');
      if (!parsed || parsed.version !== STORAGE_VERSION) return emptyState();
      var active = cleanActive(parsed.active);
      var loaded = {
        version: STORAGE_VERSION,
        active: isActiveResumable(active) ? active : null,
        latestSummary: cleanSummary(parsed.latestSummary)
      };
      if (active && !loaded.active) {
        try { store.setItem(STORAGE_KEY, JSON.stringify(loaded)); } catch (writeError) {}
      }
      return loaded;
    } catch (error) {
      return emptyState();
    }
  }

  function persist() {
    var store = storage();
    if (!store) return;
    try { store.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) {}
  }

  function clone(value) {
    return value == null ? null : JSON.parse(JSON.stringify(value));
  }

  function touchActive() {
    if (state.active) state.active.lastUpdated = cleanTimestamp();
  }

  function requireResumableActive() {
    if (!state.active) return null;
    if (isActiveResumable(state.active)) return state.active;
    state.active = null;
    persist();
    return null;
  }

  function start(input) {
    var route = cleanRouteInput(input);
    if (!route) return null;
    state.active = {
      sessionId: randomId(),
      parkId: route.parkId,
      planningMode: route.planningMode,
      routeStyle: route.routeStyle,
      startedAt: cleanTimestamp(input && input.startedAt),
      lastUpdated: cleanTimestamp(),
      stops: route.stops,
      legs: route.legs,
      completed: [],
      skipped: [],
      reoptimizations: 0,
      status: 'active'
    };
    persist();
    return clone(state.active);
  }

  function updateRoute(input, options) {
    if (!requireResumableActive()) return start(input);
    var route = cleanRouteInput(input);
    if (!route) return clone(state.active);
    var routeIds = Object.create(null);
    route.stops.forEach(function(stop) { routeIds[stop.rideId] = true; });
    var completedIds = Object.create(null);
    state.active.completed.forEach(function(event) { completedIds[event.rideId] = true; });
    var skippedIds = Object.create(null);
    state.active.skipped.forEach(function(event) { skippedIds[event.rideId] = true; });
    var retainedIds = Object.create(null);
    (options && Array.isArray(options.retainRideIds) ? options.retainRideIds : []).map(cleanId).forEach(function(id) {
      if (id) retainedIds[id] = true;
    });
    var resolvedHistory = state.active.stops.filter(function(stop) {
      return (completedIds[stop.rideId] || skippedIds[stop.rideId] || retainedIds[stop.rideId]) && !routeIds[stop.rideId];
    });
    var historicalLegs = state.active.legs.filter(function(leg) {
      return (completedIds[leg.toRideId] || skippedIds[leg.toRideId] || retainedIds[leg.toRideId]) && !routeIds[leg.toRideId];
    });
    state.active.parkId = route.parkId;
    state.active.planningMode = route.planningMode;
    state.active.routeStyle = route.routeStyle;
    state.active.stops = resolvedHistory.concat(route.stops).slice(0, MAX_STOPS);
    state.active.legs = historicalLegs.concat(route.legs).slice(0, MAX_STOPS);
    if (options && options.reoptimization === true) {
      state.active.reoptimizations = Math.min(MAX_REOPTIMIZATIONS, state.active.reoptimizations + 1);
    }
    touchActive();
    persist();
    return clone(state.active);
  }

  function summaryFor(active, reason, endedAt) {
    var stopById = Object.create(null);
    active.stops.forEach(function(stop) { stopById[stop.rideId] = stop; });
    var waits = active.completed.map(function(event) { return event.postedWaitMinutes; }).filter(function(wait) { return wait != null && Number.isFinite(wait); });
    var completedRides = active.completed.filter(function(event) {
      return event.source === 'manual' && stopById[event.rideId] && stopById[event.rideId].experienceType === 'ride';
    }).length;
    var legByStop = Object.create(null);
    active.legs.forEach(function(leg) { legByStop[leg.toRideId] = leg; });
    var completedLegs = active.completed.map(function(event) { return legByStop[event.rideId] || null; });
    var allDistancesKnown = completedLegs.length > 0 && completedLegs.every(function(leg) {
      return leg && Number.isFinite(leg.metres);
    });
    var qualities = allDistancesKnown ? completedLegs.map(function(leg) { return leg.routingQuality; }) : [];
    var uniqueQualities = qualities.filter(function(value, index) { return qualities.indexOf(value) === index; });
    var endIso = cleanTimestamp(endedAt);
    var duration = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(active.startedAt).getTime()) / 60000));
    return {
      sessionId: active.sessionId,
      parkId: active.parkId,
      planningMode: active.planningMode,
      routeStyle: active.routeStyle,
      startedAt: active.startedAt,
      endedAt: endIso,
      durationMinutes: duration,
      routeStopCount: active.stops.length,
      stops: clone(active.stops),
      completedRideIds: active.completed.map(function(event) { return event.rideId; }),
      skippedRideIds: active.skipped.map(function(event) { return event.rideId; }),
      completedStops: active.completed.length,
      skippedStops: active.skipped.length,
      completedRides: completedRides,
      recordedWaitCount: waits.length,
      longestPostedWaitMinutes: waits.length ? Math.max.apply(Math, waits) : null,
      averagePostedWaitMinutes: waits.length ? Math.round(waits.reduce(function(total, wait) { return total + wait; }, 0) / waits.length * 10) / 10 : null,
      walkingMetres: allDistancesKnown ? Math.round(completedLegs.reduce(function(total, leg) { return total + leg.metres; }, 0)) : null,
      walkingApproximate: allDistancesKnown ? qualities.some(function(quality) { return quality !== 'verified' && quality !== 'map-calibrated'; }) : null,
      routingQuality: allDistancesKnown ? (uniqueQualities.length === 1 ? uniqueQualities[0] : 'mixed') : null,
      reoptimizations: active.reoptimizations,
      meaningfulProgress: active.completed.length >= 1,
      reason: cleanText(reason, 24) || 'manual'
    };
  }

  function finish(reason, endedAt, requireProgress) {
    if (!requireResumableActive()) return null;
    if (requireProgress && state.active.completed.length < 1) {
      state.active = null;
      persist();
      return null;
    }
    var summary = summaryFor(state.active, reason, endedAt);
    state.latestSummary = summary;
    state.active = null;
    persist();
    return clone(summary);
  }

  function completeStop(rideId, options) {
    if (!requireResumableActive()) return null;
    var id = cleanId(rideId);
    var stop = state.active.stops.find(function(item) { return item.rideId === id; });
    if (!stop) return null;
    var existing = state.active.completed.find(function(event) { return event.rideId === id; });
    if (existing) return clone(existing);
    options = options || {};
    var hasExplicitWait = Object.prototype.hasOwnProperty.call(options, 'postedWaitMinutes');
    var explicitWait = finiteNumber(options.postedWaitMinutes, 600);
    var event = {
      rideId: id,
      source: cleanSource(options.source),
      postedWaitMinutes: hasExplicitWait ? explicitWait : stop.postedWaitMinutes,
      completedAt: cleanTimestamp(options.completedAt)
    };
    state.active.completed.push(event);
    if (state.active.completed.length + state.active.skipped.length >= state.active.stops.length) {
      finish('completed', event.completedAt, false);
    } else {
      touchActive();
      persist();
    }
    return clone(event);
  }

  function skipStop(rideId, options) {
    if (!requireResumableActive()) return null;
    var id = cleanId(rideId);
    var stop = state.active.stops.find(function(item) { return item.rideId === id; });
    if (!stop || state.active.completed.some(function(event) { return event.rideId === id; })) return null;
    var existing = state.active.skipped.find(function(event) { return event.rideId === id; });
    if (existing) return clone(existing);
    options = options || {};
    var reason = cleanText(options.reason, 24);
    var event = {
      rideId: id,
      reason: reason === 'unavailable' || reason === 'not-now' ? reason : 'user',
      skippedAt: cleanTimestamp(options.skippedAt)
    };
    state.active.skipped.push(event);
    if (state.active.completed.length + state.active.skipped.length >= state.active.stops.length) {
      finish('completed', event.skippedAt, false);
    } else {
      touchActive();
      persist();
    }
    return clone(event);
  }

  function end(reason) {
    return finish(cleanText(reason, 24) || 'manual', null, false);
  }

  function abandon() {
    return finish('abandoned', null, true);
  }

  function clearForTests() {
    state = emptyState();
    var store = storage();
    if (store) {
      try {
        if (typeof store.removeItem === 'function') store.removeItem(STORAGE_KEY);
        else store.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {}
    }
  }

  return {
    storageKey: STORAGE_KEY,
    storageVersion: STORAGE_VERSION,
    activeResumeWindowMs: ACTIVE_RESUME_WINDOW_MS,
    start: start,
    updateRoute: updateRoute,
    completeStop: completeStop,
    skipStop: skipStop,
    end: end,
    abandon: abandon,
    getActive: function() { return clone(requireResumableActive()); },
    getLatestSummary: function() { return clone(state.latestSummary); },
    hasActive: function() { return !!requireResumableActive(); },
    clearForTests: clearForTests
  };
});
