#!/usr/bin/env node
'use strict';
const fs = require('node:fs');

function normalize(value) { return String(value || '').toLowerCase().normalize('NFKD').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function words(value) { return new Set(normalize(value).split('-').filter(Boolean)); }
function similarity(a, b) {
  const left = words(a), right = words(b);
  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function compare(currentRides, officialEntries) {
  const current = (currentRides || []).map((ride) => ({ name: ride.name, normalized: normalize(ride.name) }));
  const official = (officialEntries || []).map((entry) => typeof entry === 'string' ? { name: entry, status: 'OPEN' } : entry).map((entry) => ({ ...entry, normalized: normalize(entry.name) }));
  const exactCurrent = new Map(current.map((ride) => [ride.normalized, ride]));
  const exactOfficial = new Map(official.map((ride) => [ride.normalized, ride]));
  const unmatchedOfficial = official.filter((ride) => !exactCurrent.has(ride.normalized));
  const unmatchedCurrent = current.filter((ride) => !exactOfficial.has(ride.normalized));
  const renamed = [];
  unmatchedOfficial.forEach((entry) => {
    const candidate = unmatchedCurrent.map((ride) => ({ ride, score: similarity(entry.name, ride.name) })).sort((a, b) => b.score - a.score)[0];
    if (candidate && candidate.score >= 0.5) renamed.push({ current: candidate.ride.name, official: entry.name, similarity: Number(candidate.score.toFixed(2)) });
  });
  const renamedOfficial = new Set(renamed.map((item) => normalize(item.official)));
  const renamedCurrent = new Set(renamed.map((item) => normalize(item.current)));
  return {
    newRides: unmatchedOfficial.filter((ride) => !renamedOfficial.has(ride.normalized) && !/CLOSED|PERMANENTLY_CLOSED/.test(String(ride.status || '').toUpperCase())).map((ride) => ride.name),
    renamedRides: renamed,
    permanentlyClosed: official.filter((ride) => /CLOSED|PERMANENTLY_CLOSED/.test(String(ride.status || '').toUpperCase())).map((ride) => ride.name),
    missingFromOfficialListing: unmatchedCurrent.filter((ride) => !renamedCurrent.has(ride.normalized)).map((ride) => ride.name)
  };
}

function main(argv) {
  const currentPath = argv[2], officialPath = argv[3];
  if (!currentPath || !officialPath) {
    console.error('Usage: node scripts/audit-park-data.cjs current-rides.json official-operator-snapshot.json');
    process.exitCode = 2;
    return;
  }
  const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
  const official = JSON.parse(fs.readFileSync(officialPath, 'utf8'));
  console.log(JSON.stringify(compare(current.rides || current, official.rides || official), null, 2));
}

if (require.main === module) main(process.argv);
module.exports = { compare, normalize, similarity };
