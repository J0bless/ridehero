(function(root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideHeroIntelligence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var MINUTE_MS = 60 * 1000;
  var DEFAULT_THRESHOLDS = Object.freeze({
    freshWaitMaxAgeMs: 5 * MINUTE_MS,
    agingWaitMaxAgeMs: 10 * MINUTE_MS,
    futureClockSkewMs: 2 * MINUTE_MS,
    waitSpikeMinutes: 15,
    waitSpikeRatio: 0.35,
    waitDropMinutes: 15,
    waitDropRatio: 0.30,
    movementLowerBoundMetres: 100,
    maxLocationAccuracyMetres: 100,
    reoptimizationCooldownMs: 60 * 1000,
    switchScoreImprovement: 12,
    switchCooldownMs: 2 * MINUTE_MS,
    switchCooldownMultiplier: 1.5,
    switchStabilityMs: 45 * 1000,
    significantWaitAdvantageMinutes: 10,
    significantDistanceAdvantageMetres: 150,
    significantDistanceAdvantageMinutes: 2
  });

  var TRIGGERS = Object.freeze({
    CLOSURE: 'closure',
    WAIT_SPIKE: 'wait_spike',
    WAIT_DROP: 'wait_drop',
    MOVEMENT: 'movement',
    COMPLETION: 'completion',
    SKIP: 'skip'
  });
  var CLOSED_STATUSES = Object.freeze(['CLOSED', 'TEMPORARILY_DOWN', 'SEASONAL']);
  var OPEN_STATUSES = Object.freeze(['OPEN', 'DELAYED']);
  var ROUTING_QUALITY = Object.freeze(['verified', 'map-calibrated', 'provider-gps', 'land-zone', 'neutral']);

  function finite(value, minimum, maximum) {
    if (value === null || value === undefined || value === '') return null;
    var number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return null;
    if (minimum !== undefined && number < minimum) return null;
    if (maximum !== undefined && number > maximum) return null;
    return number;
  }

  function timestamp(value) {
    if (value === null || value === undefined || value === '') return null;
    var time = typeof value === 'number' ? value : new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  }

  function cleanId(value) {
    if (value === null || value === undefined) return null;
    var id = String(value).replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, 128);
    return id || null;
  }

  function normalizeStatus(value) {
    var status = String(value || 'UNKNOWN').trim().toUpperCase();
    if (status === 'OPERATING') return 'OPEN';
    if (status === 'DOWN' || status === 'TEMPORARILY_CLOSED') return 'TEMPORARILY_DOWN';
    if (status === 'REFURBISHMENT') return 'SEASONAL';
    if (OPEN_STATUSES.indexOf(status) >= 0 || CLOSED_STATUSES.indexOf(status) >= 0) return status;
    return 'UNKNOWN';
  }

  function waitMinutes(value) {
    var source = value || {};
    var wait = source.waitMinutes;
    if (wait === null || wait === undefined) wait = source.waitTime;
    if (wait === null || wait === undefined) wait = source.postedWaitMinutes;
    return finite(wait, 0, 600);
  }

  function thresholds(overrides) {
    var input = overrides && typeof overrides === 'object' ? overrides : {};
    var result = {};
    Object.keys(DEFAULT_THRESHOLDS).forEach(function(key) {
      var value = finite(input[key], 0);
      result[key] = value === null ? DEFAULT_THRESHOLDS[key] : value;
    });
    return Object.freeze(result);
  }

  function waitFreshness(observation, options) {
    var input = observation || {};
    var settings = options || {};
    var limits = thresholds(settings.thresholds);
    var now = timestamp(settings.now);
    if (now === null) now = Date.now();
    var observedAt = timestamp(input.observedAt);
    if (observedAt === null) observedAt = timestamp(input.fetchedAt);
    if (observedAt === null) observedAt = timestamp(input.lastUpdated);
    if (observedAt === null) observedAt = timestamp(settings.fallbackObservedAt);
    var wait = waitMinutes(input);
    var status = normalizeStatus(input.status || input.operatingStatus);
    var availability = wait !== null ? 'available' : (CLOSED_STATUSES.indexOf(status) >= 0 ? 'not_applicable' : 'unavailable');
    var freshness = 'unknown';
    var ageMs = null;

    if (observedAt !== null) {
      ageMs = now - observedAt;
      if (ageMs < -limits.futureClockSkewMs) {
        ageMs = null;
      } else {
        ageMs = Math.max(0, ageMs);
        if (ageMs <= limits.freshWaitMaxAgeMs) freshness = 'fresh';
        else if (ageMs <= limits.agingWaitMaxAgeMs) freshness = 'aging';
        else freshness = 'stale';
      }
    }

    return Object.freeze({
      state: availability === 'available' ? freshness : availability,
      availability: availability,
      freshness: freshness,
      waitMinutes: wait,
      status: status,
      observedAt: observedAt === null ? null : new Date(observedAt).toISOString(),
      ageMs: ageMs,
      ageMinutes: ageMs === null ? null : Math.round(ageMs / MINUTE_MS * 10) / 10,
      source: input.source ? String(input.source).slice(0, 80) : null
    });
  }

  function planningPolicy(mode) {
    var normalized = mode === 'full' || mode === 'fullday' ? 'full' : 'quick';
    return Object.freeze({
      planningMode: normalized,
      requiredClassification: normalized === 'quick' ? 'ride' : null,
      preservesExperienceFilter: normalized === 'full',
      attractionsAllowed: normalized === 'full'
    });
  }

  function candidateAllowed(mode, candidate) {
    if (!candidate || typeof candidate !== 'object') return false;
    var policy = planningPolicy(mode);
    var classification = candidate.classification || candidate.experienceType;
    if (policy.requiredClassification && classification !== policy.requiredClassification) return false;
    return CLOSED_STATUSES.indexOf(normalizeStatus(candidate.status || candidate.operatingStatus)) < 0;
  }

  function comparableDistance(value) {
    if (!value || typeof value !== 'object') return null;
    var quality = String(value.routingQuality || value.quality || '');
    if (ROUTING_QUALITY.indexOf(quality) < 0 || quality === 'neutral') return null;
    var metres = finite(value.metres, 0, 1000000);
    var minutes = finite(value.minutes, 0, 1440);
    if (metres === null && minutes === null) return null;
    return Object.freeze({ metres: metres, minutes: minutes, routingQuality: quality, dataConfidence:String(value.dataConfidence || 'unknown') });
  }

  function recommendationReason(input) {
    var context = input || {};
    var limits = thresholds(context.thresholds);
    var candidate = context.candidate || {};
    var comparison = context.comparison || context.incumbent || {};
    var candidateFreshness = waitFreshness(candidate.wait || candidate, {
      now: context.now,
      fallbackObservedAt: context.observedAt,
      thresholds: limits
    });
    var comparisonFreshness = waitFreshness(comparison.wait || comparison, {
      now: context.now,
      fallbackObservedAt: context.observedAt,
      thresholds: limits
    });
    var candidateDistance = comparableDistance(candidate.distance);
    var comparisonDistance = comparableDistance(comparison.distance);
    var factors = [];
    var waitAdvantage = null;
    var distanceAdvantageMetres = null;
    var distanceAdvantageMinutes = null;

    if (candidateFreshness.waitMinutes !== null) {
      factors.push(Object.freeze({
        type: 'current_wait',
        minutes: candidateFreshness.waitMinutes,
        freshness: candidateFreshness.freshness,
        observedAt: candidateFreshness.observedAt
      }));
    }
    if (candidateFreshness.waitMinutes !== null && comparisonFreshness.waitMinutes !== null &&
      candidateFreshness.freshness === 'fresh' && comparisonFreshness.freshness === 'fresh') {
      waitAdvantage = comparisonFreshness.waitMinutes - candidateFreshness.waitMinutes;
      factors.push(Object.freeze({
        type: 'wait_comparison',
        candidateMinutes: candidateFreshness.waitMinutes,
        comparisonMinutes: comparisonFreshness.waitMinutes,
        advantageMinutes: waitAdvantage,
        freshness: candidateFreshness.freshness,
        comparisonFreshness: comparisonFreshness.freshness
      }));
    }
    if (candidateDistance) {
      factors.push(Object.freeze({
        type: 'distance',
        metres: candidateDistance.metres,
        minutes: candidateDistance.minutes,
        routingQuality: candidateDistance.routingQuality
      }));
    }
    if (candidateDistance && comparisonDistance) {
      if (candidateDistance.metres !== null && comparisonDistance.metres !== null) {
        distanceAdvantageMetres = comparisonDistance.metres - candidateDistance.metres;
      }
      if (candidateDistance.minutes !== null && comparisonDistance.minutes !== null) {
        distanceAdvantageMinutes = comparisonDistance.minutes - candidateDistance.minutes;
      }
      factors.push(Object.freeze({
        type: 'distance_comparison',
        candidateMetres: candidateDistance.metres,
        comparisonMetres: comparisonDistance.metres,
        advantageMetres: distanceAdvantageMetres,
        candidateMinutes: candidateDistance.minutes,
        comparisonMinutes: comparisonDistance.minutes,
        advantageMinutes: distanceAdvantageMinutes,
        candidateRoutingQuality: candidateDistance.routingQuality,
        comparisonRoutingQuality: comparisonDistance.routingQuality
      }));
    }
    if (candidate.isPriority === true || candidate.priority === 'must') {
      factors.push(Object.freeze({ type: 'priority', value: 'selected_priority' }));
    }
    var candidateZone = cleanId(candidate.zoneId);
    var previousZone = cleanId(context.previousStop && context.previousStop.zoneId);
    var sameZone = !!(candidateZone && previousZone && candidateZone === previousZone);
    if (sameZone) factors.push(Object.freeze({ type: 'same_zone', zoneId: candidateZone }));

    var code = 'insufficient_evidence';
    var message = null;
    if (candidate.isPriority === true || candidate.priority === 'must') {
      code = 'selected_priority';
      message = 'Matches a selected priority.';
    } else if (waitAdvantage !== null && waitAdvantage >= limits.significantWaitAdvantageMinutes && candidateFreshness.freshness === 'fresh') {
      code = 'shorter_current_wait';
      message = 'Has a meaningfully shorter current wait.';
    } else if ((distanceAdvantageMetres !== null && distanceAdvantageMetres >= limits.significantDistanceAdvantageMetres) ||
      (distanceAdvantageMinutes !== null && distanceAdvantageMinutes >= limits.significantDistanceAdvantageMinutes)) {
      code = 'closer_from_start';
      message = context.startSource === 'live' ? 'Is meaningfully closer to your current location.' : 'Is meaningfully closer to the selected start.';
    } else if (sameZone) {
      code = 'same_zone';
      message = 'Keeps the route in the same park area.';
    } else if (candidateFreshness.waitMinutes !== null && candidateFreshness.freshness === 'fresh') {
      code = 'current_wait_available';
      message = 'Uses a recently updated posted wait.';
    }

    var confidence = 'limited';
    if (candidateFreshness.freshness === 'fresh' && candidateDistance && (candidateDistance.routingQuality === 'verified' || candidateDistance.routingQuality === 'provider-gps' || (candidateDistance.routingQuality === 'map-calibrated' && candidateDistance.dataConfidence === 'verified'))) confidence = 'high';
    else if (candidateFreshness.freshness === 'fresh' || candidateFreshness.freshness === 'aging' || candidateDistance) confidence = 'medium';

    return Object.freeze({
      code: code,
      message: message,
      confidence: confidence,
      planningMode: planningPolicy(context.planningMode).planningMode,
      routeStyle: cleanId(context.routeStyle),
      startSource: ['live', 'manual', 'entrance'].indexOf(context.startSource) >= 0 ? context.startSource : null,
      factors: Object.freeze(factors)
    });
  }

  function buildRecommendationReasons(input) {
    var context = input || {};
    var limits = thresholds(context.thresholds);
    var primary = recommendationReason(input);
    var rawReasons = primary.factors.slice();
    var explanations = [];
    if (primary.code !== 'insufficient_evidence' && primary.message) {
      explanations.push(Object.freeze({ code: primary.code, text: primary.message }));
    }
    var waitComparison = rawReasons.find(function(reason) { return reason.type === 'wait_comparison'; });
    var distanceComparison = rawReasons.find(function(reason) { return reason.type === 'distance_comparison'; });
    var sameZone = rawReasons.some(function(reason) { return reason.type === 'same_zone'; });
    if (explanations.length < 2 && primary.code !== 'shorter_current_wait' && waitComparison &&
      waitComparison.freshness === 'fresh' && waitComparison.advantageMinutes >= limits.significantWaitAdvantageMinutes) {
      explanations.push(Object.freeze({ code: 'shorter_current_wait', text: 'Has a meaningfully shorter current wait.' }));
    }
    if (explanations.length < 2 && primary.code !== 'closer_from_start' && distanceComparison &&
      ((distanceComparison.advantageMetres !== null && distanceComparison.advantageMetres >= limits.significantDistanceAdvantageMetres) ||
       (distanceComparison.advantageMinutes !== null && distanceComparison.advantageMinutes >= limits.significantDistanceAdvantageMinutes))) {
      explanations.push(Object.freeze({
        code: 'closer_from_start',
        text: context.startSource === 'live' ? 'Is meaningfully closer to your current location.' : 'Is meaningfully closer to the selected start.'
      }));
    }
    if (explanations.length < 2 && primary.code !== 'same_zone' && sameZone) {
      explanations.push(Object.freeze({ code: 'same_zone', text: 'Keeps the route in the same park area.' }));
    }
    return Object.freeze({
      primaryCode: primary.code,
      confidence: primary.confidence,
      planningMode: primary.planningMode,
      routeStyle: primary.routeStyle,
      startSource: primary.startSource,
      rawReasons: Object.freeze(rawReasons),
      explanations: Object.freeze(explanations.slice(0, 2))
    });
  }

  function mapById(rows) {
    var mapped = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function(row) {
      var id = cleanId(row && (row.id || row.rideId));
      if (id) mapped[id] = row;
    });
    return mapped;
  }

  function idSet(values) {
    var result = Object.create(null);
    (Array.isArray(values) ? values : []).forEach(function(value) {
      var id = cleanId(value && typeof value === 'object' ? value.id || value.rideId : value);
      if (id) result[id] = true;
    });
    return result;
  }

  function ratio(delta, baseline) {
    return baseline > 0 ? delta / baseline : null;
  }

  function waitChangeQualifies(delta, baseline, minimum, minimumRatio) {
    if (delta < minimum) return false;
    var relative = ratio(delta, baseline);
    return relative === null || relative >= minimumRatio;
  }

  function validPosition(value, maximumAccuracy) {
    var position = value || {};
    var lat = finite(position.lat !== undefined ? position.lat : position.latitude, -90, 90);
    var lng = finite(position.lng !== undefined ? position.lng : position.longitude, -180, 180);
    var accuracy = finite(position.accuracyMetres !== undefined ? position.accuracyMetres : position.accuracy, 0, maximumAccuracy);
    if (lat === null || lng === null || accuracy === null) return null;
    return { lat: lat, lng: lng, accuracy: accuracy };
  }

  function displacementMetres(a, b) {
    var earthRadiusMetres = 6371000;
    var radians = Math.PI / 180;
    var lat1 = a.lat * radians;
    var lat2 = b.lat * radians;
    var deltaLat = (b.lat - a.lat) * radians;
    var deltaLng = (b.lng - a.lng) * radians;
    var h = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    return 2 * earthRadiusMetres * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function trigger(type, data, urgent) {
    var detail = { type: type, urgent: urgent === true };
    Object.keys(data || {}).forEach(function(key) {
      if (data[key] !== undefined) detail[key] = data[key];
    });
    return Object.freeze(detail);
  }

  function detectMeaningfulChanges(input) {
    var context = input || {};
    var limits = thresholds(context.thresholds);
    var now = timestamp(context.now);
    if (now === null) now = Date.now();
    var previous = mapById(context.previousRides);
    var current = mapById(context.currentRides);
    var routeIds = idSet(context.remainingRouteIds || context.routeIds);
    var candidateIds = idSet(context.candidateIds);
    var changes = [];

    Object.keys(routeIds).forEach(function(id) {
      var latest = current[id];
      if (!latest) return;
      var currentStatus = normalizeStatus(latest.status || latest.operatingStatus);
      var previousStatus = previous[id] ? normalizeStatus(previous[id].status || previous[id].operatingStatus) : 'UNKNOWN';
      if (CLOSED_STATUSES.indexOf(currentStatus) >= 0 && currentStatus !== previousStatus) {
        changes.push(trigger(TRIGGERS.CLOSURE, { rideId: id, previousStatus: previousStatus, currentStatus: currentStatus }, true));
      }
    });

    Object.keys(routeIds).forEach(function(id) {
      if (!previous[id] || !current[id]) return;
      var before = waitFreshness(previous[id], { now: now, fallbackObservedAt: context.previousObservedAt, thresholds: limits });
      var after = waitFreshness(current[id], { now: now, fallbackObservedAt: context.currentObservedAt, thresholds: limits });
      if (before.waitMinutes === null || after.waitMinutes === null || after.freshness !== 'fresh') return;
      var increase = after.waitMinutes - before.waitMinutes;
      if (waitChangeQualifies(increase, before.waitMinutes, limits.waitSpikeMinutes, limits.waitSpikeRatio)) {
        changes.push(trigger(TRIGGERS.WAIT_SPIKE, {
          rideId: id,
          previousWaitMinutes: before.waitMinutes,
          currentWaitMinutes: after.waitMinutes,
          deltaMinutes: increase,
          ratio: ratio(increase, before.waitMinutes),
          observedAt: after.observedAt
        }, false));
      }
    });

    Object.keys(candidateIds).forEach(function(id) {
      if (!previous[id] || !current[id]) return;
      var before = waitFreshness(previous[id], { now: now, fallbackObservedAt: context.previousObservedAt, thresholds: limits });
      var after = waitFreshness(current[id], { now: now, fallbackObservedAt: context.currentObservedAt, thresholds: limits });
      if (before.waitMinutes === null || after.waitMinutes === null || after.freshness !== 'fresh') return;
      if (CLOSED_STATUSES.indexOf(after.status) >= 0) return;
      var decrease = before.waitMinutes - after.waitMinutes;
      if (waitChangeQualifies(decrease, before.waitMinutes, limits.waitDropMinutes, limits.waitDropRatio)) {
        changes.push(trigger(TRIGGERS.WAIT_DROP, {
          rideId: id,
          previousWaitMinutes: before.waitMinutes,
          currentWaitMinutes: after.waitMinutes,
          deltaMinutes: -decrease,
          ratio: ratio(decrease, before.waitMinutes),
          observedAt: after.observedAt
        }, false));
      }
    });

    var priorPosition = validPosition(context.previousPosition, limits.maxLocationAccuracyMetres);
    var latestPosition = validPosition(context.currentPosition, limits.maxLocationAccuracyMetres);
    if (priorPosition && latestPosition) {
      var displacement = displacementMetres(priorPosition, latestPosition);
      var lowerBound = Math.max(0, displacement - priorPosition.accuracy - latestPosition.accuracy);
      if (lowerBound >= limits.movementLowerBoundMetres) {
        changes.push(trigger(TRIGGERS.MOVEMENT, {
          distanceType: 'gps_displacement',
          displacementMetres: Math.round(displacement),
          accuracyAdjustedLowerBoundMetres: Math.round(lowerBound)
        }, false));
      }
    }

    var event = context.event || {};
    var eventType = String(event.type || '').toLocaleLowerCase();
    var eventRideId = cleanId(event.rideId || event.id);
    if (eventType === 'complete' || eventType === 'completed' || eventType === 'completion') {
      changes.push(trigger(TRIGGERS.COMPLETION, { rideId: eventRideId }, true));
    } else if (eventType === 'skip' || eventType === 'skipped') {
      changes.push(trigger(TRIGGERS.SKIP, { rideId: eventRideId }, true));
    }

    var lastReoptimizedAt = timestamp(context.lastReoptimizedAt);
    if (lastReoptimizedAt !== null && lastReoptimizedAt > now + limits.futureClockSkewMs) lastReoptimizedAt = null;
    var cooldownRemainingMs = lastReoptimizedAt === null ? 0 : Math.max(0, limits.reoptimizationCooldownMs - (now - lastReoptimizedAt));
    var hasUrgent = changes.some(function(change) { return change.urgent; });
    var shouldReoptimize = changes.length > 0 && (hasUrgent || cooldownRemainingMs === 0);
    return Object.freeze({
      meaningful: changes.length > 0,
      shouldReoptimize: shouldReoptimize,
      deferredByCooldown: changes.length > 0 && !shouldReoptimize,
      cooldownRemainingMs: shouldReoptimize ? 0 : cooldownRemainingMs,
      primaryTrigger: changes[0] || null,
      triggers: Object.freeze(changes),
      evaluatedAt: new Date(now).toISOString()
    });
  }

  function decideRouteSwitch(input) {
    var context = input || {};
    var limits = thresholds(context.thresholds);
    var incumbent = context.incumbent || {};
    var challenger = context.challenger || {};
    var mode = planningPolicy(context.planningMode).planningMode;
    var incumbentId = cleanId(incumbent.id || incumbent.rideId);
    var challengerId = cleanId(challenger.id || challenger.rideId);
    var now = timestamp(context.now);
    if (now === null) now = Date.now();

    function decision(action, reason, extra) {
      var result = { action: action, shouldSwitch: action === 'switch', reason: reason, incumbentId: incumbentId, challengerId: challengerId };
      Object.keys(extra || {}).forEach(function(key) { result[key] = extra[key]; });
      return Object.freeze(result);
    }

    if (!challengerId || challengerId === incumbentId || !candidateAllowed(mode, challenger)) {
      return decision('keep', 'challenger_ineligible');
    }
    if (incumbentId && CLOSED_STATUSES.indexOf(normalizeStatus(incumbent.status || incumbent.operatingStatus)) >= 0) {
      return decision('switch', 'incumbent_unavailable', { stabilityBypassed: true });
    }

    var incumbentScore = finite(incumbent.score);
    var challengerScore = finite(challenger.score);
    if (incumbentScore === null || challengerScore === null) {
      return decision('keep', 'insufficient_comparable_score');
    }
    var improvement = incumbentScore - challengerScore;
    var lastSwitchAt = timestamp(context.lastSwitchAt);
    var inCooldown = lastSwitchAt !== null && now - lastSwitchAt >= 0 && now - lastSwitchAt < limits.switchCooldownMs;
    var requiredImprovement = limits.switchScoreImprovement * (inCooldown ? limits.switchCooldownMultiplier : 1);
    if (improvement < requiredImprovement) {
      return decision('keep', 'hysteresis_margin', {
        scoreImprovement: improvement,
        requiredImprovement: requiredImprovement,
        inSwitchCooldown: inCooldown
      });
    }

    var challengerSince = timestamp(context.challengerSince);
    if (challengerSince === null || challengerSince > now) {
      return decision('keep', 'awaiting_stability', {
        scoreImprovement: improvement,
        requiredImprovement: requiredImprovement,
        stableForMs: 0,
        requiredStableMs: limits.switchStabilityMs,
        inSwitchCooldown: inCooldown
      });
    }
    var stableForMs = now - challengerSince;
    if (stableForMs < limits.switchStabilityMs) {
      return decision('keep', 'awaiting_stability', {
        scoreImprovement: improvement,
        requiredImprovement: requiredImprovement,
        stableForMs: stableForMs,
        requiredStableMs: limits.switchStabilityMs,
        inSwitchCooldown: inCooldown
      });
    }
    return decision('switch', 'stable_meaningful_improvement', {
      scoreImprovement: improvement,
      requiredImprovement: requiredImprovement,
      stableForMs: stableForMs,
      requiredStableMs: limits.switchStabilityMs,
      inSwitchCooldown: inCooldown
    });
  }

  return Object.freeze({
    DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
    TRIGGERS: TRIGGERS,
    CLOSED_STATUSES: CLOSED_STATUSES,
    thresholds: thresholds,
    createConfig: thresholds,
    normalizeStatus: normalizeStatus,
    waitFreshness: waitFreshness,
    planningPolicy: planningPolicy,
    candidateAllowed: candidateAllowed,
    recommendationReason: recommendationReason,
    buildRecommendationReasons: buildRecommendationReasons,
    detectMeaningfulChanges: detectMeaningfulChanges,
    detectMeaningfulChange: detectMeaningfulChanges,
    decideRouteSwitch: decideRouteSwitch,
    shouldSwitchRoute: decideRouteSwitch
  });
});
