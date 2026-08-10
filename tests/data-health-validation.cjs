const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console, Promise, window: {} });
context.window.RIDEHERO_CATALOG = {
  parks: {
    test: {
      shortName: 'Test Park',
      entrance: { dataConfidence: 'verified' },
      accessPrograms: { fastLane: { available: true } },
      liveWaitTimesAvailable: false,
      lastVerified: '2026-08-10'
    }
  }
};
context.window.RideHeroParkData = {
  load: async function() {
    return {
      rides: [
        { name: 'Eligible Ride', accessPrograms: { fastLane: true }, accessProgramConfidence: { fastLane: 'verified' } },
        { name: 'Verified Ineligible Ride', accessPrograms: { fastLane: false }, accessProgramConfidence: { fastLane: 'verified' } },
        { name: 'Unknown Ride', accessPrograms: { fastLane: false }, accessProgramConfidence: { fastLane: 'unknown' } }
      ]
    };
  }
};
context.window.RideHeroWalkingNetwork = { graphHealth: function() { return { completionPercent: 0, routingQuality: 'unknown' }; } };

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data-health.js'), 'utf8'), context, { filename: 'js/data-health.js' });

(async function() {
  const report = await context.window.RideHeroDataHealth.buildReport();
  assert.equal(report[0].accessCoverage.length, 1);
  assert.equal(report[0].accessCoverage[0].label, 'Fast Lane');
  assert.equal(report[0].accessCoverage[0].verified, 2, 'unknown eligibility must not count as verified');
  assert.equal(report[0].accessCoverage[0].eligible, 1, 'only verified eligible rides should count');
  console.log('Data health validation passed.');
})().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
