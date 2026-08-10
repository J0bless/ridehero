(function(global) {
  'use strict';
  var KEY = 'rideheroState';
  var VERSION = 2;
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (error) { return null; } }
  function migrate() {
    var old = read() || {};
    var state = {
      version: VERSION,
      recent: old.recent || { brandId: null, destinationId: null, parkId: old.parkId || null, planningMode: null },
      preferencesByPark: old.preferencesByPark || {}
    };
    try {
      var legacyMode = localStorage.getItem('rideheroGuidanceMode');
      if (!state.recent.planningMode && (legacyMode === 'quick' || legacyMode === 'strategic')) state.recent.planningMode = legacyMode;
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {}
    return state;
  }
  var state = migrate();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (error) {} }
  global.RideHeroState = {
    get: function() { return state; },
    rememberContext: function(context) { state.recent = Object.assign({}, state.recent, context || {}); save(); },
    getParkPreferences: function(parkId) { return state.preferencesByPark[parkId] || {}; },
    setParkPreferences: function(parkId, preferences) { state.preferencesByPark[parkId] = Object.assign({}, state.preferencesByPark[parkId] || {}, preferences || {}); save(); },
    migrationVersion: VERSION
  };
})(window);
