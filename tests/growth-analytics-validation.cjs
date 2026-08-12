const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'growth-analytics.js'), 'utf8');
assert.doesNotMatch(source, /\bfetch\s*\(/, 'analytics must not send network requests');
assert.doesNotMatch(source, /XMLHttpRequest|sendBeacon|createElement\s*\(\s*['"]script/i, 'analytics must not load or call a third-party transport');
assert.doesNotMatch(source, /localStorage|sessionStorage/, 'analytics events must remain in memory only');

const dispatched = [];
class CustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options && options.detail;
  }
}
const window = {
  CustomEvent,
  dispatchEvent(event) { dispatched.push(event); }
};
const context = vm.createContext({ window, globalThis: window, Date, module: { exports: {} }, exports: {} });
vm.runInContext(source, context, { filename: 'js/growth-analytics.js' });
const analytics = context.module.exports;

assert.equal(window.RideHeroAnalytics, analytics, 'the analytics API must be exposed globally and through CommonJS');
assert.deepEqual(Object.keys(analytics).sort(), ['clear', 'getRecent', 'track']);

const exactEvents = [
  'route_share_opened',
  'route_share_created',
  'route_share_copied',
  'route_share_native',
  'shared_route_viewed',
  'shared_route_joined',
  'day_summary_viewed',
  'day_summary_shared',
  'route_completed'
];
exactEvents.forEach((name) => {
  assert.equal(analytics.track(name, { parkId: 'hs' }).name, name, `${name} must be accepted`);
});
assert.equal(analytics.track('page_view', {}), null, 'events outside the growth allowlist must be ignored');

analytics.clear();
const event = analytics.track('shared_route_joined', {
  shareId: 'R4ndom_share-id_2026',
  parkId: 'hs',
  planningMode: 'quick',
  status: 'completed\u202E',
  routeCount: 6.9,
  completedCount: 2,
  method: 'copy-link',
  referral: 'share',
  latitude: 28.35,
  lat: 28.35,
  longitude: -81.56,
  lng: -81.56,
  accuracy: 4,
  email: 'private@example.com',
  displayName: '<script>Eric</script>',
  ownerDisplayName: 'Eric',
  userId: 'user-123',
  accountId: 'account-123',
  sessionId: 'session-123',
  token: 'secret'
});
assert.deepEqual(JSON.parse(JSON.stringify(event.properties)), {
  shareId: 'R4ndom_share-id_2026',
  parkId: 'hs',
  planningMode: 'quick',
  status: 'completed',
  method: 'copy-link',
  routeCount: 6,
  completedCount: 2,
  referral: 'share'
}, 'only capped, sanitized, non-sensitive properties may be retained');
assert.equal(dispatched.at(-1).type, 'ridehero:analytics');
assert.equal(dispatched.at(-1).detail, event, 'a local custom event must expose the sanitized event to optional listeners');

const invalid = analytics.track('route_share_opened', {
  shareId: 'bad token with spaces',
  parkId: '../private',
  planningMode: 'strategic',
  routeCount: -3,
  completedCount: Number.POSITIVE_INFINITY,
  referral: 'personal-user-token'
});
assert.deepEqual(JSON.parse(JSON.stringify(invalid.properties)), {}, 'invalid identifiers, modes, counts, and personal referrals must be dropped');

analytics.clear();
for (let index = 0; index < 65; index += 1) {
  analytics.track('route_share_created', { routeCount: index });
}
const recent = analytics.getRecent();
assert.equal(recent.length, 50, 'the in-memory debug queue must be capped at 50 events');
assert.equal(recent[0].properties.routeCount, 15, 'the queue must discard the oldest events first');
recent[0].properties.routeCount = 999;
assert.equal(analytics.getRecent()[0].properties.routeCount, 15, 'getRecent must return defensive copies');
analytics.clear();
assert.equal(analytics.getRecent().length, 0, 'clear must empty the in-memory queue');

console.log('Growth analytics privacy validation passed.');
