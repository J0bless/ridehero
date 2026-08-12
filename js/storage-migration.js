(function(global) {
  'use strict';
  var KEY = 'rideheroState';
  var VERSION = 5;
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (error) { return null; } }
  function migrate() {
    var old = read() || {};
    var recent = old.recent || { brandId: null, destinationId: null, parkId: old.parkId || null, planningMode: null, parkSelectedAt: null };
    if (recent.planningMode === 'strategic') recent.planningMode = 'full';
    if (!Number.isFinite(Number(recent.parkSelectedAt)) || Number(recent.parkSelectedAt) < 0) recent.parkSelectedAt = null;
    var state = {
      version: VERSION,
      recent: recent,
      preferencesByPark: old.preferencesByPark || {}
    };
    Object.keys(state.preferencesByPark).forEach(function(parkId) {
      var preferences = state.preferencesByPark[parkId] || {};
      preferences.partyProfile = preferences.partyProfile || null;
      preferences.accessPrograms = Object.assign({ lightningLane:false, expressPass:false, fastLane:false }, preferences.accessPrograms || {});
      state.preferencesByPark[parkId] = preferences;
    });
    try {
      var legacyMode = localStorage.getItem('rideheroGuidanceMode');
      if (!state.recent.planningMode && (legacyMode === 'quick' || legacyMode === 'strategic')) state.recent.planningMode = legacyMode === 'strategic' ? 'full' : 'quick';
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
