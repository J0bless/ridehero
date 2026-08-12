(function(root, factory) {
  'use strict';
  var analytics = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = analytics;
  if (root) root.RideHeroAnalytics = analytics;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function(root) {
  'use strict';

  var MAX_EVENTS = 50;
  var EVENTS = {
    route_share_opened: true,
    route_share_created: true,
    route_share_copied: true,
    route_share_native: true,
    shared_route_viewed: true,
    shared_route_joined: true,
    day_summary_viewed: true,
    day_summary_shared: true,
    route_completed: true,
    planning_mode_selected: true,
    park_auto_detected: true,
    park_detection_confirmed: true,
    park_detection_changed: true,
    quick_route_generated: true,
    ride_recommended: true,
    ride_completed: true,
    ride_skipped: true,
    route_reoptimized: true,
    route_auto_updated: true,
    recommendation_reason_viewed: true
  };
  var recent = [];
  var recommendationEpoch = 0;
  var lastRecommendationKey = null;

  function cleanString(value, limit) {
    if (typeof value !== 'string') return null;
    var cleaned = value
      .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
      .trim()
      .slice(0, limit);
    return cleaned || null;
  }

  function cleanIdentifier(value) {
    var cleaned = cleanString(value, 64);
    return cleaned && /^[A-Za-z0-9_-]+$/.test(cleaned) ? cleaned : null;
  }

  function cleanCount(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    return Math.min(1000, Math.floor(number));
  }

  function sanitizeProperties(properties) {
    var source = properties && typeof properties === 'object' ? properties : {};
    var safe = {};
    var identifierKeys = ['shareId', 'parkId', 'reasonCode', 'triggerType'];
    identifierKeys.forEach(function(key) {
      var value = cleanIdentifier(source[key]);
      if (value !== null) safe[key] = value;
    });

    if (source.planningMode === 'quick' || source.planningMode === 'full') {
      safe.planningMode = source.planningMode;
    }

    ['status', 'method'].forEach(function(key) {
      var value = cleanIdentifier(source[key]);
      if (value !== null) safe[key] = value;
    });

    ['routeCount', 'completedCount'].forEach(function(key) {
      var value = cleanCount(source[key]);
      if (value !== null) safe[key] = value;
    });

    // Only the non-personal campaign marker is retained. Referral tokens and
    // user identifiers must never become analytics properties.
    if (source.referral === 'share') safe.referral = 'share';
    return safe;
  }

  function resetsRecommendation(name) {
    return name === 'planning_mode_selected' ||
      name === 'park_detection_confirmed' ||
      name === 'quick_route_generated' ||
      name === 'ride_completed' ||
      name === 'ride_skipped' ||
      name === 'route_reoptimized' ||
      name === 'route_auto_updated' ||
      name === 'route_completed';
  }

  function recommendationKey(properties) {
    return [
      recommendationEpoch,
      properties.parkId || '',
      properties.planningMode || '',
      properties.reasonCode || '',
      properties.routeCount == null ? '' : properties.routeCount
    ].join('|');
  }

  function dispatch(event) {
    if (!root || typeof root.dispatchEvent !== 'function' || typeof root.CustomEvent !== 'function') return;
    try {
      root.dispatchEvent(new root.CustomEvent('ridehero:analytics', { detail: event }));
    } catch (error) {
      // Analytics must never interrupt route planning or sharing.
    }
  }

  function track(name, properties) {
    if (!EVENTS[name]) return null;
    var safeProperties = sanitizeProperties(properties);
    if (name === 'ride_recommended') {
      var key = recommendationKey(safeProperties);
      if (key === lastRecommendationKey) return null;
      lastRecommendationKey = key;
    } else if (resetsRecommendation(name)) {
      recommendationEpoch += 1;
      lastRecommendationKey = null;
    }
    var event = {
      name: name,
      properties: safeProperties,
      timestamp: new Date().toISOString()
    };
    recent.push(event);
    if (recent.length > MAX_EVENTS) recent.splice(0, recent.length - MAX_EVENTS);
    dispatch(event);
    return event;
  }

  function getRecent() {
    return recent.map(function(event) {
      return {
        name: event.name,
        properties: Object.assign({}, event.properties),
        timestamp: event.timestamp
      };
    });
  }

  function clear() {
    recent.length = 0;
    recommendationEpoch = 0;
    lastRecommendationKey = null;
  }

  return {
    track: track,
    getRecent: getRecent,
    clear: clear
  };
});
