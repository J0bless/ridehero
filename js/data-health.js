(function(global) {
  'use strict';
  var catalog = global.RIDEHERO_CATALOG;

  function hasLocation(location) { return !!(location && location.latitude != null && location.longitude != null); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]; }); }

  async function buildReport() {
    return Promise.all(Object.keys(catalog.parks).map(async function(parkId) {
      var park = catalog.parks[parkId];
      var dataset = await global.RideHeroParkData.load(parkId);
      var rides = dataset.rides || [];
      var entranceCount = rides.filter(function(ride) { return hasLocation(ride.guestEntranceLocation); }).length;
      var restrictionCount = rides.filter(function(ride) { return ride.restrictionsVerified; }).length;
      var graph = global.RideHeroWalkingNetwork.graphHealth(parkId, rides);
      return {
        parkId: parkId,
        name: park.shortName,
        rides: rides.length,
        parkEntranceVerified: !!(park.entrance && park.entrance.dataConfidence === 'verified'),
        parkEntranceConfidence: park.entrance ? park.entrance.dataConfidence : 'unknown',
        verifiedRideEntrances: entranceCount,
        restrictionsVerified: restrictionCount,
        liveWaits: park.liveWaitTimesAvailable,
        walkingGraph: graph,
        lastAudit: dataset.lastVerified || park.lastVerified,
        missingCoordinates: rides.filter(function(ride) { return !hasLocation(ride.guestEntranceLocation); }).map(function(ride) { return ride.name; })
      };
    }));
  }

  function renderRows(report) {
    return report.map(function(item) {
      var missing = item.missingCoordinates.length ? '<details><summary>Missing guest entrances (' + item.missingCoordinates.length + ')</summary><ul>' + item.missingCoordinates.map(function(name) { return '<li>' + esc(name) + '</li>'; }).join('') + '</ul></details>' : '<p class="health-complete">All curated ride entrances present</p>';
      return '<article class="data-health-card"><div class="data-health-title"><h2>' + esc(item.name) + '</h2><span class="confidence confidence-' + esc(item.parkEntranceConfidence) + '">Entrance: ' + esc(item.parkEntranceConfidence) + '</span></div>' +
        '<dl><div><dt>Curated rides</dt><dd>' + item.rides + '</dd></div><div><dt>Guest entrances</dt><dd>' + item.verifiedRideEntrances + '/' + item.rides + '</dd></div><div><dt>Live waits</dt><dd>' + (item.liveWaits ? 'Supported' : 'Static') + '</dd></div><div><dt>Walking graph</dt><dd>' + item.walkingGraph.completionPercent + '% · ' + esc(item.walkingGraph.routingQuality) + '</dd></div><div><dt>Restrictions</dt><dd>' + item.restrictionsVerified + '/' + item.rides + '</dd></div><div><dt>Last audit</dt><dd>' + esc(item.lastAudit || 'Unknown') + '</dd></div></dl>' + missing + '</article>';
    }).join('');
  }

  async function render(container) {
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Auditing park data…</p></div>';
    try {
      var report = await buildReport();
      container.innerHTML = '<div class="data-health-summary" role="status"><strong>Data quality is explicit.</strong><span>Unknown coordinates remain missing; RideHero never substitutes a guessed point.</span></div><div class="data-health-grid">' + renderRows(report) + '</div>';
    } catch (error) {
      console.error('RideHero data health error', error);
      container.innerHTML = '<div class="catalog-error" role="alert">The data health report could not load.</div>';
    }
  }

  global.RideHeroDataHealth = { buildReport: buildReport, render: render };
})(window);
