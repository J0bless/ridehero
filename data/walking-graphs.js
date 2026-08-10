(function(global) {
  'use strict';
  var parkIds = ['mk','ep','hs','ak','dl','dca','usf','ioa','epic','vb','ush','usj','sfga','sfmm','sfgam'];
  var graphs = {};
  parkIds.forEach(function(parkId) {
    graphs[parkId] = {
      parkId: parkId,
      schemaVersion: 1,
      routingQuality: 'unavailable',
      dataConfidence: 'unknown',
      sourceName: null,
      sourceUrl: null,
      lastVerified: null,
      nodes: {},
      edges: []
    };
  });
  global.RIDEHERO_WALKING_GRAPHS = graphs;
})(window);
