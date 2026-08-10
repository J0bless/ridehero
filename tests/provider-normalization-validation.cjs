const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({
  console,
  window: {
    RIDEHERO_CATALOG: { lastVerified: '2026-08-10', parks: {} },
    RideHeroParkData: { normalize(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); } }
  },
  fetch: async () => { throw new Error('network disabled'); },
  AbortController,
  Date,
  Number,
  Promise
});
context.window.window = context.window;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'wait-provider.js'), 'utf8'), context, { filename: 'wait-provider.js' });
const provider = context.window.RideHeroWaitProvider;

assert.equal(provider.normalizeProviderStatus('OPERATING'), 'OPEN');
assert.equal(provider.normalizeProviderStatus('DOWN'), 'TEMPORARILY_DOWN');
assert.equal(provider.normalizeProviderStatus('REFURBISHMENT'), 'SEASONAL');
assert.equal(provider.normalizeProviderStatus('not-a-status'), 'UNKNOWN');

const normalized = provider.normalizeProviderRide({
  id: 'provider-1', name: 'Verified Ride', status: 'OPERATING', lastUpdated: '2026-08-10T00:00:00Z',
  queue: { STANDBY: { waitTime: null } }
}, { id: 'ride-1', parkId: 'park-1', landId: 'land-1', name: 'Verified Ride', classification: 'ride', type: 'ride', minimumHeight: null, source: 'official', lastVerified: '2026-08-10' }, null);

assert.equal(normalized.classification, 'ride');
assert.equal(normalized.status, 'OPEN');
assert.equal(normalized.waitMinutes, null, 'missing waits must stay null');
assert.equal(normalized.waitTime, null, 'missing waits must never become zero');

console.log('Provider normalization validation passed.');
