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
const graph = build({ features:[
  { type:'Feature', properties:{ pedestrian:true }, geometry:{ type:'LineString', coordinates:[[-81,28],[-81.001,28.001]] } },
  { type:'Feature', properties:{ type:'guest-entrance', rideId:'x-coaster' }, geometry:{ type:'Point', coordinates:[-81.00001,28.00001] } }
] }, { parkId:'x', sourceUrl:'https://trusted.example/paths', sourceName:'Trusted source', dataConfidence:'verified', lastVerified:'2026-08-10' });
assert.equal(graph.routingQuality, 'verified');
assert.equal(graph.schemaVersion, 2);
assert.equal(graph.edges.length, 1);
assert.equal(Object.keys(graph.nodes).length, 2);
assert.equal(graph.rideEntrances['x-coaster'].dataConfidence, 'verified');
assert.throws(() => build({ features:[
  { type:'Feature', properties:{ pedestrian:true }, geometry:{ type:'LineString', coordinates:[[-81,28],[-81.001,28.001]] } },
  { type:'Feature', properties:{ type:'guest-entrance', rideId:'far-ride' }, geometry:{ type:'Point', coordinates:[-82,29] } }
] }, { parkId:'x', sourceUrl:'https://trusted.example/paths', dataConfidence:'verified' }), /nearest walkway node/);
console.log('Park data tooling validation passed.');
