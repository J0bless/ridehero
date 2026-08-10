const assert = require('node:assert/strict');
const { compare } = require('../scripts/audit-park-data.cjs');
const { build } = require('../scripts/build-walking-graph.cjs');

const report = compare(
  [{ name:'Old Coaster Name' }, { name:'Still Open' }, { name:'Removed Ride' }],
  [{ name:'New Coaster Name', status:'OPEN' }, { name:'Still Open', status:'OPEN' }, { name:'Brand New Ride', status:'OPEN' }, { name:'Closed Forever', status:'PERMANENTLY_CLOSED' }]
);
assert(report.newRides.includes('Brand New Ride'));
assert(report.permanentlyClosed.includes('Closed Forever'));
assert(report.missingFromOfficialListing.includes('Removed Ride'));

assert.throws(() => build({ features:[] }, { parkId:'x', sourceUrl:null, dataConfidence:'approximate' }), /Verified/);
const graph = build({ features:[{ type:'Feature', properties:{ pedestrian:true }, geometry:{ type:'LineString', coordinates:[[-81,28],[-81.001,28.001]] } }] }, { parkId:'x', sourceUrl:'https://trusted.example/paths', sourceName:'Trusted source', dataConfidence:'verified', lastVerified:'2026-08-10' });
assert.equal(graph.routingQuality, 'verified');
assert.equal(graph.edges.length, 1);
assert.equal(Object.keys(graph.nodes).length, 2);
console.log('Park data tooling validation passed.');
