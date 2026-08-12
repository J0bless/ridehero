'use strict';

const assert = require('node:assert/strict');
const ShareModel = require('../js/share-model.js');

const NOW = Date.UTC(2026, 7, 11, 16, 0, 0);
const KNOWN_PARKS = new Set(['hs', 'mk']);
const KNOWN_RIDES = {
  hs: new Set(['hs-tower-of-terror', 'hs-runaway-railway', 'hs-slinky-dog-dash']),
  mk: new Set(['mk-space-mountain'])
};

function options(overrides = {}) {
  return {
    now: NOW,
    allowedParkIds: KNOWN_PARKS,
    allowedRideIds: KNOWN_RIDES,
    ...overrides
  };
}

function baseInput(overrides = {}) {
  return {
    parkId: 'hs',
    planningMode: 'quick',
    routeStyle: 'balanced',
    rideIds: ['hs-tower-of-terror', 'hs-runaway-railway'],
    ownerDisplayName: 'Eric',
    progressSharingEnabled: true,
    progress: {
      completedRideIds: ['hs-tower-of-terror'],
      completedCount: 1,
      totalStops: 2,
      updatedAt: NOW
    },
    ...overrides
  };
}

function throwsCode(fn, expectedCode) {
  assert.throws(fn, error => {
    assert.equal(error && error.code, expectedCode);
    return true;
  });
}

const quick = ShareModel.createSharePayload(baseInput(), options());
assert.equal(quick.shareSchemaVersion, 1);
assert.equal(quick.planningMode, 'quick');
assert.equal(quick.routeSnapshot.planningMode, 'quick');
assert.deepEqual(quick.routeSnapshot.rideIds, [
  'hs-tower-of-terror',
  'hs-runaway-railway'
]);
assert.equal(quick.progress.completedCount, 1);
assert.equal(quick.progress.totalStops, 2);
assert.equal(quick.joinEnabled, true);
assert.equal(quick.status, 'active');
assert.match(quick.shareId, /^[0-9a-f-]{36}$/i);

const full = ShareModel.createSharePayload(baseInput({
  parkId: 'mk',
  planningMode: 'full',
  rideIds: ['mk-space-mountain'],
  progressSharingEnabled: false,
  progress: undefined,
  status: 'completed'
}), options());
assert.equal(full.planningMode, 'full');
assert.equal(full.routeSnapshot.planningMode, 'full');
assert.equal(full.status, 'completed');
assert.equal(Object.hasOwn(full, 'progress'), false);

const alternateFullLabel = ShareModel.createSharePayload(baseInput({
  planningMode: 'full-day',
  progressSharingEnabled: false,
  progress: undefined
}), options());
assert.equal(alternateFullLabel.planningMode, 'full');

const malicious = ShareModel.createSharePayload(baseInput({
  ownerDisplayName: '  <img src=x onerror=alert(1)> Eric <script>alert(2)</script>  ',
  email: 'private@example.com',
  accountId: 'account-secret',
  gpsHistory: [{ latitude: 28.357, longitude: -81.56 }],
  providerToken: 'provider-secret',
  routeSnapshot: {
    parkId: 'hs',
    planningMode: 'quick',
    routeStyle: 'balanced',
    rideIds: ['hs-tower-of-terror'],
    latitude: 28.357,
    longitude: -81.56,
    sessionSecret: 'nested-secret'
  },
  progressSharingEnabled: false,
  progress: undefined
}), options());
const maliciousJson = JSON.stringify(malicious);
assert.equal(/[<>]/.test(malicious.ownerDisplayName), false);
assert.equal(malicious.ownerDisplayName.includes('script'), false);
assert.equal(maliciousJson.includes('private@example.com'), false);
assert.equal(maliciousJson.includes('account-secret'), false);
assert.equal(maliciousJson.includes('provider-secret'), false);
assert.equal(maliciousJson.includes('nested-secret'), false);
assert.equal(maliciousJson.includes('latitude'), false);
assert.equal(maliciousJson.includes('longitude'), false);

const longName = ShareModel.createSharePayload(baseInput({
  ownerDisplayName: 'A'.repeat(ShareModel.LIMITS.maxOwnerDisplayNameLength + 20)
}), options());
assert.equal(Array.from(longName.ownerDisplayName).length, ShareModel.LIMITS.maxOwnerDisplayNameLength);

throwsCode(() => ShareModel.createSharePayload(baseInput({ parkId: 'unknown-park' }), options()), 'UNKNOWN_PARK');
throwsCode(() => ShareModel.createSharePayload(baseInput(), { now: NOW }), 'PARK_VALIDATOR_REQUIRED');
throwsCode(() => ShareModel.createSharePayload(baseInput({
  rideIds: Array.from({ length: ShareModel.LIMITS.maxRideCount + 1 }, (_, index) => `hs-ride-${index}`)
}), options()), 'TOO_MANY_RIDES');
throwsCode(() => ShareModel.createSharePayload(baseInput({ rideIds: [] }), options()), 'EMPTY_ROUTE');
throwsCode(() => ShareModel.createSharePayload(baseInput({ routeStyle: 'fastest-at-all-costs' }), options()), 'INVALID_ROUTE_STYLE');
throwsCode(() => ShareModel.createSharePayload(baseInput({ rideIds: ['hs-tower-of-terror', 'hs-tower-of-terror'] }), options()), 'DUPLICATE_RIDE');
throwsCode(() => ShareModel.createSharePayload(baseInput({
  progress: {
    completedRideIds: ['hs-tower-of-terror', 'hs-tower-of-terror'],
    completedCount: 2,
    totalStops: 2,
    updatedAt: NOW
  }
}), options()), 'DUPLICATE_RIDE');
throwsCode(() => ShareModel.createSharePayload(baseInput({
  progress: {
    completedRideIds: ['hs-tower-of-terror'],
    completedCount: 2,
    totalStops: 2,
    updatedAt: NOW
  }
}), options()), 'INVALID_PROGRESS');
throwsCode(() => ShareModel.createSharePayload(baseInput({
  progress: {
    completedRideIds: ['hs-tower-of-terror'],
    completedCount: 0,
    totalStops: 2,
    updatedAt: NOW
  }
}), options()), 'INVALID_PROGRESS');
throwsCode(() => ShareModel.createSharePayload(baseInput({
  expiresAt: NOW + ShareModel.LIMITS.maxExpiryMs + 1
}), options()), 'EXPIRY_TOO_LONG');

const unknownRide = ShareModel.createSharePayload(baseInput({
  rideIds: ['hs-tower-of-terror', 'hs-retired-ride'],
  progressSharingEnabled: false,
  progress: undefined
}), options());
const unknownRideValidation = ShareModel.validateSharePayload(unknownRide, options());
assert.equal(unknownRideValidation.valid, true);
assert.deepEqual(unknownRideValidation.unavailableRideIds, ['hs-retired-ride']);
const importResult = ShareModel.createRouteImport(unknownRide, options({ hasActiveRoute: true }));
assert.equal(importResult.valid, true);
assert.deepEqual(importResult.importPlan.rideIds, ['hs-tower-of-terror']);
assert.deepEqual(importResult.importPlan.originalRideIds, ['hs-tower-of-terror', 'hs-retired-ride']);
assert.deepEqual(importResult.importPlan.unavailableRideIds, ['hs-retired-ride']);
assert.equal(importResult.importPlan.requiresActiveRouteConfirmation, true);
assert.equal(importResult.importPlan.replacesActiveRoute, false);
assert.equal(importResult.importPlan.syncMode, 'local-copy');
assert.equal(importResult.groupRouteCapabilities.realTimeSync, false);

const encoded = ShareModel.encodeSharePayload(quick, options());
assert.match(encoded, /^[A-Za-z0-9_-]+$/);
const decoded = ShareModel.decodeSharePayload(encoded, options());
assert.equal(decoded.valid, true);
assert.deepEqual(decoded.payload, quick);

const url = ShareModel.buildShareUrl('https://ridehero.example/app', quick, options());
assert.match(url, new RegExp(`/r/${quick.shareId.replace(/-/g, '\\-')}\\?r=share#share=`));
const parsedUrl = ShareModel.parseShareUrl(url, options());
assert.equal(parsedUrl.valid, true);
assert.equal(parsedUrl.shareId, quick.shareId);
assert.equal(parsedUrl.referralSource, 'share');
assert.deepEqual(parsedUrl.payload.routeSnapshot.rideIds, quick.routeSnapshot.rideIds);

const secondId = ShareModel.generateShareId();
const mismatchedUrl = url.replace(`/r/${quick.shareId}`, `/r/${secondId}`);
const mismatchResult = ShareModel.parseShareUrl(mismatchedUrl, options());
assert.equal(mismatchResult.valid, false);
assert.equal(mismatchResult.code, 'SHARE_ID_MISMATCH');

const firstId = ShareModel.generateShareId();
const generatedIds = [firstId, secondId, ShareModel.generateShareId()];
assert.equal(new Set(generatedIds).size, generatedIds.length);
generatedIds.forEach(id => {
  assert.equal(ShareModel.isShareId(id), true);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});
assert.notEqual(generatedIds[0].slice(0, 8), generatedIds[1].slice(0, 8));

const expired = JSON.parse(JSON.stringify(quick));
expired.createdAt = new Date(NOW - (2 * 24 * 60 * 60 * 1000)).toISOString();
expired.expiresAt = new Date(NOW - 1000).toISOString();
expired.routeSnapshot.createdAt = expired.createdAt;
const expiredValidation = ShareModel.validateSharePayload(expired, options());
assert.equal(expiredValidation.valid, false);
assert.equal(expiredValidation.code, 'EXPIRED');
assert.equal(expiredValidation.expired, true);

const unexpectedRootField = { ...quick, email: 'private@example.com' };
const unexpectedResult = ShareModel.validateSharePayload(unexpectedRootField, options());
assert.equal(unexpectedResult.valid, false);
assert.equal(unexpectedResult.code, 'UNEXPECTED_FIELD');

const unexpectedSnapshotField = JSON.parse(JSON.stringify(quick));
unexpectedSnapshotField.routeSnapshot.gpsHistory = [{ lat: 1, lng: 2 }];
const nestedUnexpectedResult = ShareModel.validateSharePayload(unexpectedSnapshotField, options());
assert.equal(nestedUnexpectedResult.valid, false);
assert.equal(nestedUnexpectedResult.code, 'UNEXPECTED_FIELD');

const duplicateSnapshotRide = JSON.parse(JSON.stringify(quick));
duplicateSnapshotRide.routeSnapshot.rideIds = ['hs-tower-of-terror', 'hs-tower-of-terror'];
duplicateSnapshotRide.progress.totalStops = 2;
const duplicateSnapshotResult = ShareModel.validateSharePayload(duplicateSnapshotRide, options());
assert.equal(duplicateSnapshotResult.valid, false);
assert.equal(duplicateSnapshotResult.code, 'DUPLICATE_RIDE');

const duplicateProgressRide = JSON.parse(JSON.stringify(quick));
duplicateProgressRide.progress.completedRideIds = ['hs-tower-of-terror', 'hs-tower-of-terror'];
duplicateProgressRide.progress.completedCount = 2;
const duplicateProgressResult = ShareModel.validateSharePayload(duplicateProgressRide, options());
assert.equal(duplicateProgressResult.valid, false);
assert.equal(duplicateProgressResult.code, 'DUPLICATE_RIDE');

const malformedResults = [
  ShareModel.decodeSharePayload('not*base64', options()),
  ShareModel.decodeSharePayload('A'.repeat(ShareModel.LIMITS.maxEncodedPayloadLength + 1), options()),
  ShareModel.parseShareUrl('https://ridehero.example/r/not-a-share-id#share=nope', options()),
  ShareModel.parseShareUrl(`https://ridehero.example/r/${quick.shareId}?r=share`, options())
];
malformedResults.forEach(result => assert.equal(result.valid, false));

assert.deepEqual(ShareModel.GROUP_ROUTE_V1, {
  schemaVersion: 1,
  importMode: 'local-copy',
  realTimeSync: false,
  capabilities: {
    preview: true,
    joinByImport: true,
    sharedLiveProgress: false,
    sharedLocation: false,
    voting: false,
    coordinatedReoptimization: false
  }
});

console.log('share-model validation: passed');
