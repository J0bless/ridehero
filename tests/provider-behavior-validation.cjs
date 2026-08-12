const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rides = [
  { id: 'alpha', parkId: 'test', landId: 'land', name: 'Alpha Ride', normalizedName: 'alpha-ride', classification: 'ride', type: 'ride', source: 'official', lastVerified: '2026-08-10' },
  { id: 'beta', parkId: 'test', landId: 'land', name: 'Beta Ride', normalizedName: 'beta-ride', classification: 'ride', type: 'ride', source: 'official', lastVerified: '2026-08-10' }
];
const context = vm.createContext({ console, AbortController, Date, Number, Promise, fetch: null, window: {} });
context.window.window = context.window;
context.window.RIDEHERO_CATALOG = { lastVerified: '2026-08-10', parks: {
  test: { liveWaitTimesAvailable: true, waitTimeProviderId: 'provider-test' },
  mk: { liveWaitTimesAvailable: true, waitTimeProviderId: 'provider-mk' },
  static: { liveWaitTimesAvailable: false, waitTimeProviderId: null }
} };
context.window.classifyExperience = (ride) => /coaster/i.test(ride.name) ? 'ride' : 'attraction';
context.window.RideHeroParkData = {
  normalize(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); },
  async load(parkId) {
    const parkRides = rides.map((ride) => Object.assign({}, ride, { parkId }));
    return { parkId, lands: [{ id: 'land', parkId }], rides: parkRides };
  }
};
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'wait-provider.js'), 'utf8'), context, { filename: 'wait-provider.js' });
const provider = context.window.RideHeroWaitProvider;

function response(body, ok = true) { return { ok, async json() { return body; } }; }

(async () => {
  let calls = 0;
  context.fetch = async (url) => {
    calls += 1;
    if (url.endsWith('/children')) return response({ children: [{ id: 'p-alpha', location: { latitude: 1, longitude: 2 } }] });
    return response({ liveData: [{ id: 'p-alpha', entityType: 'ATTRACTION', name: 'Alpha Ride', status: 'OPERATING', queue: { STANDBY: { waitTime: 25 } } }] });
  };
  let result = await provider.getRideWaitTimes('test', { force: true });
  assert.equal(calls, 2, 'only the selected park children and live endpoints should load');
  assert.equal(result.source, 'themeparks.wiki');
  assert.equal(result.rides.find((ride) => ride.id === 'alpha').waitTime, 25);
  assert.equal(result.rides.find((ride) => ride.id === 'beta').waitTime, null, 'partial responses retain static information without invented waits');

  const beforeUnsupported = calls;
  result = await provider.getRideWaitTimes('static', { force: true });
  assert.equal(result.supported, false);
  assert.equal(result.source, 'static');
  assert.equal(calls, beforeUnsupported, 'unsupported parks must not fetch live data');

  context.fetch = async (url) => url.endsWith('/children')
    ? response({ children: [] })
    : response({ liveData: [{ id: 'wdw-coaster', entityType: 'ATTRACTION', name: 'Legacy Coaster', status: 'OPERATING', queue: { STANDBY: { waitTime: 15 } } }] });
  result = await provider.getRideWaitTimes('mk', { force: true });
  assert.equal(result.rides.find((ride) => ride.providerId === 'wdw-coaster').classification, 'ride', 'existing Walt Disney World classification remains compatible');

  context.fetch = async (url) => {
    if (url.includes('/waittimes?')) return response([{ id: 'alpha', name: 'Alpha Ride', waitTime: 12 }]);
    throw new Error('primary provider unavailable');
  };
  result = await provider.getRideWaitTimes('mk', { force: true, proxyUrl: 'https://ridehero-proxy.example' });
  assert.equal(result.source, 'ridehero-proxy');
  assert.equal(result.completeOperatingSet, true, 'the legacy proxy must identify its response as the complete operating set');
  assert.equal(result.snapshotSemantics, 'operating-set');

  context.fetch = async (url) => url.endsWith('/children') ? response({ children: [] }) : response({ liveData: 'malformed' });
  result = await provider.getRideWaitTimes('test', { force: true });
  assert.equal(result.source, 'static');
  assert.equal(result.message, 'Live wait times are temporarily unavailable.');
  assert(result.rides.every((ride) => ride.waitTime === null));

  context.fetch = async () => { throw new Error('offline'); };
  result = await provider.getRideWaitTimes('test', { force: true });
  assert.equal(result.source, 'static');
  assert.equal(result.rides.length, 2);
  console.log('Provider behavior validation passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
