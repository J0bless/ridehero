'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const intelligence = require(path.join(__dirname, '..', 'js', 'ride-intelligence.js'));
const now = Date.parse('2026-08-12T16:00:00.000Z');
const at = minutesAgo => new Date(now - minutesAgo * 60000).toISOString();

// Wait freshness is independent of whether a posted wait happens to exist.
let result = intelligence.waitFreshness({ waitMinutes: 25, fetchedAt: at(2), status: 'OPEN', source: 'themeparks.wiki' }, { now });
assert.equal(result.state, 'fresh');
assert.equal(result.ageMinutes, 2);
assert.equal(result.waitMinutes, 25);
assert.equal(result.source, 'themeparks.wiki');

result = intelligence.waitFreshness({ waitTime: 25, fetchedAt: at(7), status: 'OPEN' }, { now });
assert.equal(result.state, 'aging');
result = intelligence.waitFreshness({ waitTime: 25, fetchedAt: at(12), status: 'OPEN' }, { now });
assert.equal(result.state, 'stale');
result = intelligence.waitFreshness({ waitTime: 25, status: 'OPEN' }, { now });
assert.equal(result.state, 'unknown', 'a numeric wait without a timestamp must not be described as fresh/live');
result = intelligence.waitFreshness({ waitTime: null, status: 'OPEN', fetchedAt: at(1) }, { now });
assert.equal(result.state, 'unavailable');
assert.equal(result.freshness, 'fresh', 'status observation freshness may still be known when a wait is unavailable');
result = intelligence.waitFreshness({ waitTime: null, status: 'CLOSED', fetchedAt: at(1) }, { now });
assert.equal(result.state, 'not_applicable');
result = intelligence.waitFreshness({ waitTime: 10, fetchedAt: new Date(now + 10 * 60000).toISOString() }, { now });
assert.equal(result.freshness, 'unknown', 'future timestamps outside clock skew must not appear fresh');

// Quick keeps a strict ride-only policy; Full Day keeps its existing filter semantics.
assert.deepEqual(intelligence.planningPolicy('quick'), {
  planningMode: 'quick', requiredClassification: 'ride', preservesExperienceFilter: false, attractionsAllowed: false
});
assert.deepEqual(intelligence.planningPolicy('full'), {
  planningMode: 'full', requiredClassification: null, preservesExperienceFilter: true, attractionsAllowed: true
});
assert.equal(intelligence.candidateAllowed('quick', { classification: 'ride', status: 'OPEN' }), true);
assert.equal(intelligence.candidateAllowed('quick', { classification: 'attraction', status: 'OPEN' }), false);
assert.equal(intelligence.candidateAllowed('full', { classification: 'attraction', status: 'OPEN' }), true);
assert.equal(intelligence.candidateAllowed('full', { classification: 'ride', status: 'CLOSED' }), false);

// Explanations contain only observed inputs and never invent a distance or baseline.
result = intelligence.recommendationReason({
  planningMode: 'quick', routeStyle: 'balanced', startSource: 'live', now,
  candidate: {
    wait: { waitMinutes: 15, fetchedAt: at(1), status: 'OPEN' },
    distance: { metres: 300, minutes: 4, routingQuality: 'verified' }
  },
  comparison: {
    wait: { waitMinutes: 35, fetchedAt: at(1), status: 'OPEN' },
    distance: { metres: 250, minutes: 3, routingQuality: 'verified' }
  }
});
assert.equal(result.code, 'shorter_current_wait');
assert.equal(result.confidence, 'high');
assert.ok(result.factors.some(factor => factor.type === 'wait_comparison' && factor.advantageMinutes === 20));
assert.ok(result.factors.some(factor => factor.type === 'distance' && factor.metres === 300));
assert.ok(result.factors.some(factor => factor.type === 'distance_comparison' && factor.advantageMetres === -50));

result = intelligence.recommendationReason({
  planningMode: 'quick', now,
  candidate: { waitMinutes: null, status: 'OPEN' }, comparison: {}
});
assert.equal(result.code, 'insufficient_evidence');
assert.equal(result.message, null);
assert.equal(result.confidence, 'limited');
assert.equal(result.factors.some(factor => factor.type === 'distance'), false);
assert.equal(result.factors.some(factor => factor.type === 'wait_comparison'), false);

result = intelligence.recommendationReason({
  planningMode: 'quick', now,
  candidate: { classification: 'ride', waitMinutes: 15, status: 'OPEN', fetchedAt: at(1) },
  comparison: { waitMinutes: 35, status: 'OPEN', fetchedAt: at(25) }
});
assert.equal(result.factors.some(factor => factor.type === 'wait_comparison'), false, 'a stale comparison wait must not support a shorter-current-wait claim');

result = intelligence.buildRecommendationReasons({
  planningMode: 'quick', now,
  candidate: { waitMinutes: null, status: 'OPEN' }, comparison: {}
});
assert.equal(result.primaryCode, 'insufficient_evidence');
assert.deepEqual(result.explanations, [], 'no UI recommendation claim may appear without evidence');
assert.deepEqual(result.rawReasons, []);

result = intelligence.buildRecommendationReasons({
  planningMode: 'quick', now,
  candidate: { waitMinutes: 10, status: 'OPEN', fetchedAt: at(1), distance: { metres: 100, routingQuality: 'verified' } },
  comparison: { waitMinutes: 30, status: 'OPEN', fetchedAt: at(1), distance: { metres: 400, routingQuality: 'verified' } }
});
assert.ok(result.rawReasons.length >= 2, 'raw reason metadata must retain the observed input factors');
assert.ok(result.explanations.length > 0 && result.explanations.length <= 2, 'UI explanations must be evidence-backed and capped at two');

result = intelligence.recommendationReason({
  planningMode: 'quick', startSource: 'manual', now,
  candidate: { distance: { metres: 100, routingQuality: 'provider-gps' } },
  comparison: { distance: { metres: 400, routingQuality: 'provider-gps' } }
});
assert.equal(result.code, 'closer_from_start');
assert.match(result.message, /selected start/i);

const previousRides = [
  { id: 'next', status: 'OPEN', waitMinutes: 20, fetchedAt: at(6) },
  { id: 'candidate', status: 'OPEN', waitMinutes: 50, fetchedAt: at(6) },
  { id: 'small-change', status: 'OPEN', waitMinutes: 30, fetchedAt: at(6) }
];
const currentRides = [
  { id: 'next', status: 'OPEN', waitMinutes: 45, fetchedAt: at(1) },
  { id: 'candidate', status: 'OPEN', waitMinutes: 20, fetchedAt: at(1) },
  { id: 'small-change', status: 'OPEN', waitMinutes: 35, fetchedAt: at(1) }
];

result = intelligence.detectMeaningfulChanges({
  now, previousRides, currentRides,
  remainingRouteIds: ['next', 'small-change'], candidateIds: ['candidate']
});
assert.equal(result.shouldReoptimize, true);
assert.ok(result.triggers.some(change => change.type === 'wait_spike' && change.rideId === 'next'));
assert.ok(result.triggers.some(change => change.type === 'wait_drop' && change.rideId === 'candidate'));
assert.equal(result.triggers.some(change => change.rideId === 'small-change'), false, 'small wait changes must not churn a route');

// A stale new wait cannot trigger intelligence even if the raw numeric change is large.
result = intelligence.detectMeaningfulChanges({
  now,
  previousRides: [{ id: 'next', status: 'OPEN', waitMinutes: 10, fetchedAt: at(20) }],
  currentRides: [{ id: 'next', status: 'OPEN', waitMinutes: 60, fetchedAt: at(12) }],
  remainingRouteIds: ['next']
});
assert.equal(result.meaningful, false);

result = intelligence.detectMeaningfulChange({
  now,
  previousRides: [{ id: 'next', status: 'OPEN', waitMinutes: 100, fetchedAt: at(6) }],
  currentRides: [{ id: 'next', status: 'OPEN', waitMinutes: 116, fetchedAt: at(1) }],
  remainingRouteIds: ['next']
});
assert.equal(result.meaningful, false, 'an absolute change that misses the relative threshold must not churn a high-wait route');

// A real route closure is urgent and bypasses cooldown.
result = intelligence.detectMeaningfulChanges({
  now,
  previousRides: [{ id: 'next', status: 'OPEN' }],
  currentRides: [{ id: 'next', status: 'TEMPORARILY_DOWN' }],
  remainingRouteIds: ['next'],
  lastReoptimizedAt: new Date(now - 1000).toISOString()
});
assert.equal(result.shouldReoptimize, true);
assert.equal(result.primaryTrigger.type, 'closure');
assert.equal(result.primaryTrigger.urgent, true);

// Non-urgent changes respect a central cooldown.
result = intelligence.detectMeaningfulChanges({
  now, previousRides, currentRides,
  remainingRouteIds: ['next'], candidateIds: [],
  lastReoptimizedAt: new Date(now - 1000).toISOString()
});
assert.equal(result.meaningful, true);
assert.equal(result.shouldReoptimize, false);
assert.equal(result.deferredByCooldown, true);
assert.ok(result.cooldownRemainingMs > 0);

// Movement is GPS displacement, accuracy-adjusted, and never called walking distance.
result = intelligence.detectMeaningfulChanges({
  now,
  previousPosition: { lat: 28.4187, lng: -81.5812, accuracy: 10 },
  currentPosition: { lat: 28.4202, lng: -81.5812, accuracy: 10 }
});
assert.equal(result.primaryTrigger.type, 'movement');
assert.equal(result.primaryTrigger.distanceType, 'gps_displacement');
assert.ok(result.primaryTrigger.accuracyAdjustedLowerBoundMetres >= intelligence.DEFAULT_THRESHOLDS.movementLowerBoundMetres);
assert.equal('walkingMetres' in result.primaryTrigger, false);

result = intelligence.detectMeaningfulChanges({
  now,
  previousPosition: { lat: 28.4187, lng: -81.5812, accuracy: 250 },
  currentPosition: { lat: 28.4250, lng: -81.5812, accuracy: 250 }
});
assert.equal(result.meaningful, false, 'low-accuracy locations must not trigger movement reoptimization');

for (const event of [{ type: 'completion', rideId: 'one' }, { type: 'skip', rideId: 'two' }]) {
  result = intelligence.detectMeaningfulChanges({ now, event, lastReoptimizedAt: now - 1000 });
  assert.equal(result.shouldReoptimize, true);
  assert.equal(result.primaryTrigger.type, event.type);
  assert.equal(result.primaryTrigger.urgent, true);
}

// Switching needs a sustained, meaningful improvement. A recent switch raises the bar.
result = intelligence.decideRouteSwitch({
  planningMode: 'quick', now,
  incumbent: { id: 'one', classification: 'ride', status: 'OPEN', score: 60 },
  challenger: { id: 'two', classification: 'ride', status: 'OPEN', score: 40 },
  challengerSince: now - 10 * 1000
});
assert.equal(result.shouldSwitch, false);
assert.equal(result.reason, 'awaiting_stability');

result = intelligence.decideRouteSwitch({
  planningMode: 'quick', now,
  incumbent: { id: 'one', classification: 'ride', status: 'OPEN', score: 60 },
  challenger: { id: 'two', classification: 'ride', status: 'OPEN', score: 40 },
  challengerSince: now - 60 * 1000
});
assert.equal(result.shouldSwitch, true);
assert.equal(result.reason, 'stable_meaningful_improvement');

result = intelligence.decideRouteSwitch({
  planningMode: 'quick', now, lastSwitchAt: now - 30 * 1000,
  incumbent: { id: 'one', classification: 'ride', status: 'OPEN', score: 60 },
  challenger: { id: 'two', classification: 'ride', status: 'OPEN', score: 45 },
  challengerSince: now - 60 * 1000
});
assert.equal(result.shouldSwitch, false);
assert.equal(result.reason, 'hysteresis_margin');
assert.equal(result.requiredImprovement, 18);

result = intelligence.decideRouteSwitch({
  planningMode: 'quick', now,
  incumbent: { id: 'one', classification: 'ride', status: 'CLOSED' },
  challenger: { id: 'two', classification: 'ride', status: 'OPEN' }
});
assert.equal(result.shouldSwitch, true);
assert.equal(result.reason, 'incumbent_unavailable');

result = intelligence.decideRouteSwitch({
  planningMode: 'quick', now,
  incumbent: { id: 'one', classification: 'ride', status: 'OPEN', score: 60 },
  challenger: { id: 'show', classification: 'attraction', status: 'OPEN', score: 1 },
  challengerSince: now - 60000
});
assert.equal(result.shouldSwitch, false, 'Quick intelligence must never switch to an attraction');
assert.equal(result.reason, 'challenger_ineligible');

result = intelligence.decideRouteSwitch({
  planningMode: 'full', now,
  incumbent: { id: 'one', classification: 'ride', status: 'OPEN' },
  challenger: { id: 'show', classification: 'attraction', status: 'OPEN' },
  challengerSince: now - 60000
});
assert.equal(result.reason, 'insufficient_comparable_score', 'Full Day attractions remain eligible but require real comparable scores');

assert.equal(intelligence.detectMeaningfulChange, intelligence.detectMeaningfulChanges);
assert.equal(intelligence.shouldSwitchRoute, intelligence.decideRouteSwitch);

console.log('Ride intelligence freshness, reasons, triggers, mode policy, and switching stability contracts passed.');
