(function(root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideHeroSmartEntry = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function() {
  'use strict';

  /*
   * Detection is intentionally limited to park geometry whose provenance is
   * verified or provider supplied. A bare catalog center or an approximate
   * radius is never enough to claim that a guest is at a park; an explicitly
   * provider-sourced parkCenter may only produce a medium-confidence prompt.
   */
  var TRUSTED_CONFIDENCE = { verified: true, provider: true };
  var DEFAULT_THRESHOLDS = {
    HIGH_ACCURACY_METERS: 75,
    MEDIUM_ACCURACY_METERS: 250,
    MAX_USABLE_ACCURACY_METERS: 750,
    ENTRANCE_NEARBY_METERS: 300,
    BOUNDS_NEARBY_METERS: 350,
    PROVIDER_CENTER_NEARBY_METERS: 1000,
    LOW_CONFIDENCE_NEARBY_METERS: 1200,
    CLEAR_MATCH_GAP_METERS: 250,
    CLEAR_MATCH_DISTANCE_RATIO: 1.75,
    RECENT_PARK_MAX_AGE_MS: 12 * 60 * 60 * 1000
  };

  function finite(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function coordinate(value) {
    if (!value) return null;
    if (value.coords) value = value.coords;
    var latitude = finite(value.latitude != null ? value.latitude : value.lat);
    var longitude = finite(value.longitude != null ? value.longitude : (value.lng != null ? value.lng : value.lon));
    if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return { latitude: latitude, longitude: longitude };
  }

  function normalizePosition(position) {
    var point = coordinate(position);
    if (!point) return null;
    var source = position && position.coords ? position.coords : position;
    var accuracy = finite(source && source.accuracy);
    point.accuracy = accuracy != null && accuracy >= 0 ? accuracy : null;
    return point;
  }

  function confidenceOf(value, fallback) {
    return String(value && (value.dataConfidence || value.confidence) || fallback || 'unknown').toLowerCase();
  }

  function trusted(value, fallback) {
    return TRUSTED_CONFIDENCE[confidenceOf(value, fallback)] === true;
  }

  function thresholds(overrides) {
    var result = {};
    Object.keys(DEFAULT_THRESHOLDS).forEach(function(key) {
      var override = overrides && finite(overrides[key]);
      result[key] = override != null && override >= 0 ? override : DEFAULT_THRESHOLDS[key];
    });
    return result;
  }

  function parksArray(parks) {
    if (Array.isArray(parks)) return parks.filter(Boolean);
    if (parks && parks.parks) parks = parks.parks;
    if (!parks || typeof parks !== 'object') return [];
    return Object.keys(parks).map(function(id) { return parks[id]; }).filter(Boolean);
  }

  function haversine(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b.latitude - a.latitude) * rad;
    var dLng = (b.longitude - a.longitude) * rad;
    var value = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
  }

  function rectangle(bounds) {
    var north = finite(bounds.north);
    var south = finite(bounds.south);
    var east = finite(bounds.east);
    var west = finite(bounds.west);
    var northEast = coordinate(bounds.northEast || bounds.northeast);
    var southWest = coordinate(bounds.southWest || bounds.southwest);
    if (northEast && southWest) {
      north = northEast.latitude;
      east = northEast.longitude;
      south = southWest.latitude;
      west = southWest.longitude;
    }
    if ([north, south, east, west].some(function(value) { return value == null; }) || north < south || east < west) return null;
    return { north: north, south: south, east: east, west: west };
  }

  function polygonPoints(value) {
    var source = value && (value.polygon || value.points);
    if (!source && value && String(value.type || '').toLowerCase() === 'polygon') source = value.coordinates;
    if (Array.isArray(source) && source.length === 1 && Array.isArray(source[0])) source = source[0];
    if (!Array.isArray(source)) return null;
    var points = source.map(function(item) {
      if (Array.isArray(item) && item.length >= 2) return coordinate({ longitude: item[0], latitude: item[1] });
      return coordinate(item);
    }).filter(Boolean);
    return points.length >= 3 ? points : null;
  }

  function pointInPolygon(point, polygon) {
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var yi = polygon[i].latitude;
      var yj = polygon[j].latitude;
      var xi = polygon[i].longitude;
      var xj = polygon[j].longitude;
      var crosses = ((yi > point.latitude) !== (yj > point.latitude)) &&
        (point.longitude < (xj - xi) * (point.latitude - yi) / (yj - yi) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function segmentDistance(point, a, b) {
    var rad = Math.PI / 180;
    var scaleX = 6371000 * Math.cos(point.latitude * rad) * rad;
    var scaleY = 6371000 * rad;
    var ax = (a.longitude - point.longitude) * scaleX;
    var ay = (a.latitude - point.latitude) * scaleY;
    var bx = (b.longitude - point.longitude) * scaleX;
    var by = (b.latitude - point.latitude) * scaleY;
    var dx = bx - ax;
    var dy = by - ay;
    var lengthSquared = dx * dx + dy * dy;
    var fraction = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    var x = ax + fraction * dx;
    var y = ay + fraction * dy;
    return Math.sqrt(x * x + y * y);
  }

  function distanceToPolygon(point, polygon) {
    if (pointInPolygon(point, polygon)) return { distanceMeters: 0, inside: true };
    var closest = Infinity;
    for (var i = 0; i < polygon.length; i += 1) {
      closest = Math.min(closest, segmentDistance(point, polygon[i], polygon[(i + 1) % polygon.length]));
    }
    return { distanceMeters: closest, inside: false };
  }

  function distanceToRectangle(point, bounds) {
    var inside = point.latitude <= bounds.north && point.latitude >= bounds.south && point.longitude <= bounds.east && point.longitude >= bounds.west;
    if (inside) return { distanceMeters: 0, inside: true };
    return {
      distanceMeters: haversine(point, {
        latitude: Math.max(bounds.south, Math.min(bounds.north, point.latitude)),
        longitude: Math.max(bounds.west, Math.min(bounds.east, point.longitude))
      }),
      inside: false
    };
  }

  function distanceToCircle(point, bounds) {
    var center = coordinate(bounds.center || bounds);
    var radiusMeters = finite(bounds.radiusMeters);
    if (radiusMeters == null) {
      var radiusKm = finite(bounds.radiusKm);
      radiusMeters = radiusKm == null ? null : radiusKm * 1000;
    }
    if (!center || radiusMeters == null || radiusMeters <= 0) return null;
    var centerDistance = haversine(point, center);
    return {
      distanceMeters: Math.max(0, centerDistance - radiusMeters),
      anchorDistanceMeters: centerDistance,
      inside: centerDistance <= radiusMeters
    };
  }

  function boundsDistance(point, bounds) {
    var polygon = polygonPoints(bounds);
    var result;
    if (polygon) result = distanceToPolygon(point, polygon);
    else {
      var box = rectangle(bounds);
      result = box ? distanceToRectangle(point, box) : distanceToCircle(point, bounds);
    }
    if (!result) return null;
    if (result.anchorDistanceMeters == null) {
      var anchor = coordinate(bounds.center);
      result.anchorDistanceMeters = anchor ? haversine(point, anchor) : result.distanceMeters;
    }
    return result;
  }

  function evidenceForPark(point, park) {
    if (!park || park.supported === false) return [];
    var evidence = [];
    ['bounds', 'geofence', 'fence'].forEach(function(field) {
      var value = park[field];
      if (!value || !trusted(value)) return;
      var measured = boundsDistance(point, value);
      if (measured) evidence.push({
        type: field === 'bounds' ? 'bounds' : 'fence',
        confidence: confidenceOf(value),
        distanceMeters: measured.distanceMeters,
        anchorDistanceMeters: measured.anchorDistanceMeters,
        inside: measured.inside
      });
    });
    var entrances = Array.isArray(park.entrances) ? park.entrances : (park.entrance ? [park.entrance] : []);
    entrances.forEach(function(entrance) {
      var pointValue = coordinate(entrance);
      var fallback = park.entranceConfidence;
      if (!pointValue || !trusted(entrance, fallback)) return;
      var distance = haversine(point, pointValue);
      evidence.push({
        type: 'entrance',
        confidence: confidenceOf(entrance, fallback),
        distanceMeters: distance,
        anchorDistanceMeters: distance,
        inside: false
      });
    });
    /* A provider park center can support a cautious nearby suggestion, but it
       is not a fence and therefore can never produce high confidence. */
    if (park.parkCenter && trusted(park.parkCenter)) {
      var parkCenter = coordinate(park.parkCenter);
      if (parkCenter) {
        var centerDistance = haversine(point, parkCenter);
        evidence.push({
          type: 'park-center',
          confidence: confidenceOf(park.parkCenter),
          distanceMeters: centerDistance,
          anchorDistanceMeters: centerDistance,
          inside: false
        });
      }
    }
    return evidence;
  }

  function candidateForPark(point, park) {
    var evidence = evidenceForPark(point, park);
    if (!evidence.length) return null;
    evidence.sort(function(a, b) {
      if (a.inside !== b.inside) return a.inside ? -1 : 1;
      return a.distanceMeters - b.distanceMeters || a.anchorDistanceMeters - b.anchorDistanceMeters;
    });
    var best = evidence[0];
    return {
      parkId: park.id || park.slug || null,
      park: park,
      distanceMeters: Math.round(best.distanceMeters),
      anchorDistanceMeters: Math.round(best.anchorDistanceMeters),
      insideBounds: best.inside,
      evidenceType: best.type,
      evidenceConfidence: best.confidence
    };
  }

  function candidateRank(candidate) {
    return candidate.insideBounds ? 0 : candidate.distanceMeters;
  }

  function findNearbySupportedParks(position, parks, options) {
    var point = normalizePosition(position);
    if (!point) return [];
    var config = thresholds(options && options.thresholds);
    return parksArray(parks).map(function(park) { return candidateForPark(point, park); }).filter(function(candidate) {
      return candidate && (candidate.insideBounds || candidate.distanceMeters <= config.LOW_CONFIDENCE_NEARBY_METERS);
    }).sort(function(a, b) {
      return candidateRank(a) - candidateRank(b) || a.anchorDistanceMeters - b.anchorDistanceMeters || String(a.parkId).localeCompare(String(b.parkId));
    });
  }

  function getDistanceToPark(position, park) {
    var point = normalizePosition(position);
    var candidate = point ? candidateForPark(point, park) : null;
    return candidate ? candidate.distanceMeters : null;
  }

  function result(parkId, confidence, distanceMeters, accuracyMeters, reason, extra) {
    var value = {
      parkId: parkId || null,
      confidence: confidence,
      distanceMeters: distanceMeters == null ? null : distanceMeters,
      accuracyMeters: accuracyMeters == null ? null : accuracyMeters,
      reason: reason,
      reasonCode: reason,
      requiresConfirmation: confidence === 'high' || confidence === 'medium'
    };
    Object.keys(extra || {}).forEach(function(key) { value[key] = extra[key]; });
    return value;
  }

  function detectCurrentPark(position, parks, options) {
    options = options || {};
    var point = normalizePosition(position);
    if (!point) return result(null, 'unknown', null, null, options.failureReason || 'location_unavailable');
    var config = thresholds(options.thresholds);
    var allCandidates = parksArray(parks).map(function(park) { return candidateForPark(point, park); }).filter(Boolean).sort(function(a, b) {
      return candidateRank(a) - candidateRank(b) || a.anchorDistanceMeters - b.anchorDistanceMeters;
    });
    if (!allCandidates.length) return result(null, 'unknown', null, point.accuracy, 'no_trusted_park_geometry');

    var nearby = allCandidates.filter(function(candidate) {
      return candidate.insideBounds || candidate.distanceMeters <= config.LOW_CONFIDENCE_NEARBY_METERS;
    });
    if (!nearby.length) return result(null, 'unknown', allCandidates[0].distanceMeters, point.accuracy, 'outside_supported_parks');

    var first = nearby[0];
    var firstRank = first.insideBounds ? first.anchorDistanceMeters : first.distanceMeters;
    var comparable = nearby.filter(function(candidate) { return candidate.insideBounds === first.insideBounds; });
    var second = comparable.length > 1 ? comparable[1] : null;
    var secondRank = second ? (second.insideBounds ? second.anchorDistanceMeters : second.distanceMeters) : Infinity;
    var gap = secondRank - firstRank;
    /* A zero-distance provider center is not automatically decisive when an
       adjacent park is also close; in that case the absolute gap must win. */
    var ratio = firstRank <= 0 ? 1 : secondRank / firstRank;
    var clear = !second || gap >= config.CLEAR_MATCH_GAP_METERS || ratio >= config.CLEAR_MATCH_DISTANCE_RATIO;
    var details = { evidenceType: first.evidenceType, evidenceConfidence: first.evidenceConfidence };

    if (!clear) return result(null, 'low', first.distanceMeters, point.accuracy, 'ambiguous_nearby_parks', details);
    if (point.accuracy == null || point.accuracy > config.MAX_USABLE_ACCURACY_METERS) {
      return result(null, 'low', first.distanceMeters, point.accuracy, 'location_accuracy_too_low', details);
    }
    if (first.insideBounds && point.accuracy <= config.HIGH_ACCURACY_METERS) {
      return result(first.parkId, 'high', 0, point.accuracy, 'inside_trusted_park_bounds', details);
    }
    if (first.insideBounds && point.accuracy <= config.MEDIUM_ACCURACY_METERS) {
      return result(first.parkId, 'medium', 0, point.accuracy, 'inside_trusted_park_bounds_with_uncertainty', details);
    }
    var nearbyLimit = first.evidenceType === 'entrance' ? config.ENTRANCE_NEARBY_METERS :
      (first.evidenceType === 'park-center' ? config.PROVIDER_CENTER_NEARBY_METERS : config.BOUNDS_NEARBY_METERS);
    if (!first.insideBounds && first.distanceMeters <= nearbyLimit && point.accuracy <= config.MEDIUM_ACCURACY_METERS) {
      return result(first.parkId, 'medium', first.distanceMeters, point.accuracy,
        first.evidenceType === 'entrance' ? 'near_trusted_park_entrance' :
          (first.evidenceType === 'park-center' ? 'near_provider_park_center' : 'near_trusted_park_bounds'), details);
    }
    return result(null, 'low', first.distanceMeters, point.accuracy,
      point.accuracy > config.MEDIUM_ACCURACY_METERS ? 'location_accuracy_too_low' : 'park_match_not_confident', details);
  }

  function getRecentParkSuggestion(recentPark, parks, options) {
    options = options || {};
    if (!recentPark || typeof recentPark !== 'object') return null;
    var parkId = String(recentPark.parkId || '');
    var selectedAt = finite(recentPark.selectedAt);
    var now = finite(options.now);
    if (now == null) now = Date.now();
    var config = thresholds(options.thresholds);
    if (!parkId || selectedAt == null || selectedAt > now || now - selectedAt > config.RECENT_PARK_MAX_AGE_MS) return null;
    var park = parksArray(parks).find(function(item) { return String(item.id || item.slug || '') === parkId && item.supported !== false; });
    if (!park) return null;
    return {
      parkId: parkId,
      park: park,
      source: 'recent',
      confidence: 'unknown',
      reason: 'recent_park_requires_confirmation',
      selectedAt: selectedAt,
      requiresConfirmation: true
    };
  }

  function resolveSmartEntry(input) {
    input = input || {};
    var detection = detectCurrentPark(input.position, input.parks, {
      failureReason: input.locationFailure,
      thresholds: input.thresholds
    });
    var suggestion = null;
    if (detection.parkId && (detection.confidence === 'high' || detection.confidence === 'medium')) {
      suggestion = {
        parkId: detection.parkId,
        source: 'location',
        confidence: detection.confidence,
        reason: detection.reason,
        requiresConfirmation: true
      };
    } else {
      suggestion = getRecentParkSuggestion(input.recentPark, input.parks, { now: input.now, thresholds: input.thresholds });
    }
    return { detection: detection, suggestion: suggestion };
  }

  var api = {
    THRESHOLDS: Object.freeze ? Object.freeze(Object.assign({}, DEFAULT_THRESHOLDS)) : DEFAULT_THRESHOLDS,
    detectCurrentPark: detectCurrentPark,
    findNearbySupportedParks: findNearbySupportedParks,
    getDistanceToPark: getDistanceToPark,
    getRecentParkSuggestion: getRecentParkSuggestion,
    resolveSmartEntry: resolveSmartEntry
  };
  return Object.freeze ? Object.freeze(api) : api;
});
