#!/usr/bin/env node
'use strict';
const fs = require('node:fs');

function distance(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function build(geojson, metadata) {
  if (!metadata || !metadata.parkId || !metadata.sourceUrl || metadata.dataConfidence !== 'verified') throw new Error('Verified parkId, sourceUrl, and dataConfidence are required.');
  const nodes = {}, edges = [], entranceFeatures = [], rideEntrances = {};
  const maxEntranceSnapMetres = Number.isFinite(Number(metadata.maxEntranceSnapMetres)) ? Number(metadata.maxEntranceSnapMetres) : 75;
  if (maxEntranceSnapMetres <= 0 || maxEntranceSnapMetres > 100) throw new Error('maxEntranceSnapMetres must be greater than 0 and no more than 100 metres.');
  function nodeId(coordinate) { return `${coordinate[1].toFixed(7)},${coordinate[0].toFixed(7)}`; }
  for (const feature of geojson.features || []) {
    if (feature.geometry?.type === 'Point' && feature.properties?.type === 'guest-entrance') {
      if (!feature.properties.rideId) throw new Error('Every guest-entrance point requires a rideId.');
      entranceFeatures.push(feature);
      continue;
    }
    if (!feature.geometry || feature.geometry.type !== 'LineString' || feature.properties?.pedestrian !== true) continue;
    const coordinates = feature.geometry.coordinates || [];
    coordinates.forEach((coordinate) => { const id = nodeId(coordinate); nodes[id] ||= { id, latitude: coordinate[1], longitude: coordinate[0], type: 'walkway' }; });
    for (let i = 1; i < coordinates.length; i++) {
      const from = nodeId(coordinates[i - 1]), to = nodeId(coordinates[i]);
      edges.push({ from, to, metres: Math.round(distance(coordinates[i - 1], coordinates[i]) * 10) / 10, accessible: feature.properties?.accessible !== false });
    }
  }
  for (const feature of entranceFeatures) {
    const rideId = String(feature.properties.rideId), coordinate = feature.geometry.coordinates;
    if (rideEntrances[rideId]) throw new Error(`Duplicate guest entrance for ${rideId}.`);
    let nearest = null, nearestMetres = Infinity;
    for (const node of Object.values(nodes)) {
      const metres = distance(coordinate, [node.longitude, node.latitude]);
      if (metres < nearestMetres) { nearest = node.id; nearestMetres = metres; }
    }
    if (!nearest || nearestMetres > maxEntranceSnapMetres) throw new Error(`Guest entrance ${rideId} is ${Math.round(nearestMetres)}m from the nearest walkway node.`);
    rideEntrances[rideId] = { routingNode: nearest, snapMetres: Math.round(nearestMetres * 10) / 10, dataConfidence: 'verified' };
  }
  return { parkId: metadata.parkId, schemaVersion: 2, routingQuality: 'verified', dataConfidence: 'verified', sourceName: metadata.sourceName || null, sourceUrl: metadata.sourceUrl, lastVerified: metadata.lastVerified || null, nodes, edges, rideEntrances };
}

function main(argv) {
  if (!argv[2] || !argv[3]) { console.error('Usage: node scripts/build-walking-graph.cjs paths.geojson metadata.json'); process.exitCode = 2; return; }
  console.log(JSON.stringify(build(JSON.parse(fs.readFileSync(argv[2], 'utf8')), JSON.parse(fs.readFileSync(argv[3], 'utf8'))), null, 2));
}
if (require.main === module) main(process.argv);
module.exports = { build, distance };
