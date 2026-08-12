'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function section(start, end) {
  const from = html.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = end ? html.indexOf(end, from + start.length) : html.length;
  return html.slice(from, to === -1 ? html.length : to);
}

const chooseNext = section('function chooseNextStopFromRemaining', 'function initRollingQueue');
assert.match(chooseNext, /currentUserLocation|routeLivePosition/,
  'ordinary rolling routes must continue using the current user location when choosing the next stop');
assert.match(chooseNext, /\.sort\s*\([\s\S]*distMetres[\s\S]*getStopLocation/,
  'ordinary rolling routes must retain proximity-aware next-stop ordering');
assert.match(chooseNext, /preserveImportedRouteOrder/,
  'proximity sorting must be gated so an imported shared snapshot can preserve its original order');

const syncSession = section('function syncRouteSession', 'function normalizeRideNameForRoute');
assert.match(syncSession, /preserveImportedRouteOrder\s*=\s*options\.preserveImportedRouteOrder\s*===\s*true/,
  'route-session setup must explicitly distinguish imported snapshots from ordinary optimized routes');

const imported = section('function renderImportedSharedRoute', 'async function growthImportSharedRoute');
assert.match(imported, /syncRouteSession\s*\([^;]+\{\s*reoptimization\s*:\s*false\s*,\s*preserveImportedRouteOrder\s*:\s*true\s*\}\s*\)/,
  'joined routes must lock their saved order until the user explicitly re-optimizes');

const importRoute = section('async function growthImportSharedRoute', 'window.RideHeroGrowthBridge');
assert.match(importRoute, /routeStyleMode\s*=\s*payload\.routeSnapshot\.routeStyle/,
  'joining a shared route must restore its saved balanced/priority/walking route style');

const fullDay = section('function buildFullDayRoute', 'function growthCatalogPark');
assert.match(fullDay, /isReoptimization\s*=\s*routeReoptimizationPending\s*===\s*true[\s\S]*syncRouteSession\s*\([\s\S]*?reoptimization\s*:\s*isReoptimization/,
  'Full Day route rebuilds must report a pending explicit re-optimization to the session model');
assert.ok((fullDay.match(/routeReoptimizationPending\s*=\s*false/g) || []).length >= 2,
  'Full Day must consume the re-optimization flag on both success and failure paths');

console.log('Imported route style/order and ordinary proximity/re-optimization contracts passed.');
