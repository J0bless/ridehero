(function(global) {
  'use strict';
  var graphs = global.RIDEHERO_WALKING_GRAPHS || {};
  var METRES_PER_MINUTE = 80;

  function haversine(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b.latitude - a.latitude) * rad;
    var dLng = (b.longitude - a.longitude) * rad;
    var x = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function usableLocation(record) {
    if (!record) return null;
    var candidates = [record.guestEntranceLocation, record.attractionLocation, record];
    for (var i = 0; i < candidates.length; i++) {
      var item = candidates[i];
      if (!item) continue;
      var latitude = item.latitude != null ? Number(item.latitude) : item.lat != null ? Number(item.lat) : null;
      var longitude = item.longitude != null ? Number(item.longitude) : item.lng != null ? Number(item.lng) : null;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude: latitude, longitude: longitude, dataConfidence: item.dataConfidence || record.locationConfidence || 'provider' };
    }
    return null;
  }

  function shortestMetres(parkId, fromNode, toNode) {
    var graph = graphs[parkId];
    if (!graph || graph.routingQuality !== 'verified' || !graph.nodes[fromNode] || !graph.nodes[toNode]) return null;
    var distances = {}, open = {};
    Object.keys(graph.nodes).forEach(function(id) { distances[id] = Infinity; open[id] = true; });
    distances[fromNode] = 0;
    while (true) {
      var current = null, best = Infinity;
      Object.keys(open).forEach(function(id) { if (open[id] && distances[id] < best) { current = id; best = distances[id]; } });
      if (!current || current === toNode) break;
      delete open[current];
      graph.edges.forEach(function(edge) {
        var next = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
        if (!next || !open[next]) return;
        var weight = Number(edge.metres);
        if (!Number.isFinite(weight) || weight < 0) return;
        if (distances[current] + weight < distances[next]) distances[next] = distances[current] + weight;
      });
    }
    return Number.isFinite(distances[toNode]) ? distances[toNode] : null;
  }

  function routingNodeFor(graph, record) {
    if (!record) return null;
    if (record.routingNode) return record.routingNode;
    var mapped = graph && graph.rideEntrances && graph.rideEntrances[record.id];
    return mapped && mapped.routingNode || null;
  }

  function estimate(parkId, from, to) {
    var graph = graphs[parkId];
    var fromNode = routingNodeFor(graph, from), toNode = routingNodeFor(graph, to);
    var exact = fromNode && toNode ? shortestMetres(parkId, fromNode, toNode) : null;
    if (exact != null) return { minutes: exact / METRES_PER_MINUTE, metres: exact, routingQuality: 'verified', dataConfidence: 'verified', trustWeight: 1 };
    var a = usableLocation(from), b = usableLocation(to);
    if (a && b) {
      var metres = haversine(a, b);
      var confidence = a.dataConfidence === 'verified' && b.dataConfidence === 'verified' ? 'verified' : 'provider';
      return { minutes: metres / METRES_PER_MINUTE, metres: metres, routingQuality: 'provider-gps', dataConfidence: confidence, trustWeight: confidence === 'verified' ? 0.9 : 0.72 };
    }
    if (from && to && from.landId && to.landId) {
      var sameLand = from.landId === to.landId;
      return { minutes: sameLand ? 4 : 9, metres: null, routingQuality: 'land-zone', dataConfidence: 'approximate', trustWeight: 0.42 };
    }
    return { minutes: 8, metres: null, routingQuality: 'neutral', dataConfidence: 'unknown', trustWeight: 0.15 };
  }

  function graphHealth(parkId, rides) {
    var graph = graphs[parkId] || { nodes: {}, edges: [], routingQuality: 'unavailable' };
    var total = (rides || []).length;
    var routed = (rides || []).filter(function(ride) { var node = routingNodeFor(graph, ride); return node && graph.nodes[node]; }).length;
    return { routingQuality: graph.routingQuality, nodes: Object.keys(graph.nodes).length, edges: graph.edges.length, routedRides: routed, totalRides: total, completionPercent: total ? Math.round(routed / total * 100) : 0 };
  }

  global.RideHeroWalkingNetwork = { estimate: estimate, shortestMetres: shortestMetres, graphHealth: graphHealth, usableLocation: usableLocation, routingNodeFor: routingNodeFor };
})(window);
