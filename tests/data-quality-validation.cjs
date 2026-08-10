const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console, Number, window: {} });
context.window.window = context.window;
function run(file) { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file }); }
run('data/ride-aliases.js');
run('js/data-quality.js');
run('js/route-engine.js');
const quality = context.window.RideHeroDataQuality;

assert.deepEqual(Array.from(quality.levels), ['verified','provider','approximate','unknown']);
assert.equal(quality.location(null, null, 'verified').dataConfidence, 'unknown', 'missing coordinates cannot retain verified confidence');
assert.equal(quality.location(0, 0, 'provider').latitude, 0, 'valid zero coordinates must not be discarded');
const ride = quality.normalizeRide({ name: 'The Twilight Zone Tower of Terror', source: 'https://example.test', parkId: 'hs' }, { lastVerified: '2026-08-10' });
assert(ride.aliases.includes('Tower of Terror'));
assert.equal(ride.guestEntranceLocation.dataConfidence, 'unknown');
assert.equal(ride.minimumHeightInches, null);
assert.equal(ride.accessPrograms.lightningLane, false);
assert.equal(quality.normalizeRide({ name: 'Unknown', minimumHeightInches: null }, {}).minimumHeightInches, null, 'null restrictions must not become zero');
assert.equal(context.window.RideHeroRouteEngine.isRideEligible({ restrictionsVerified:true, minimumHeightInches:null }, { minimumRiderHeightInches:1 }), true, 'verified no-minimum rides must remain eligible');
assert.equal(context.window.RideHeroRouteEngine.isRideEligible({ restrictionsVerified:true, minimumHeightInches:40 }, { minimumRiderHeightInches:39 }), false, 'verified numeric minimums must filter shorter riders');
console.log('Data quality validation passed.');
