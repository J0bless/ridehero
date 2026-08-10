const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const graphs = { test: { parkId:'test', routingQuality:'verified', nodes:{ a:{}, b:{}, c:{} }, edges:[{from:'a',to:'b',metres:80},{from:'b',to:'c',metres:80},{from:'a',to:'c',metres:300}], rideEntrances:{ 'ride-a':{routingNode:'a'}, 'ride-c':{routingNode:'c'} } } };
const context = vm.createContext({ console, Number, Math, window: { RIDEHERO_WALKING_GRAPHS: graphs } });
context.window.window = context.window;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'walking-network.js'), 'utf8'), context, { filename:'walking-network.js' });
const network = context.window.RideHeroWalkingNetwork;

assert.equal(network.shortestMetres('test', 'a', 'c'), 160);
assert.equal(network.estimate('test', { routingNode:'a' }, { routingNode:'c' }).routingQuality, 'verified');
assert.equal(network.estimate('test', { id:'ride-a' }, { id:'ride-c' }).metres, 160, 'graph entrance mappings must drive verified distances');
assert.equal(network.graphHealth('test', [{id:'ride-a'},{id:'ride-c'}, {id:'unmapped'}]).completionPercent, 67);
assert.equal(network.estimate('missing', { guestEntranceLocation:{ latitude:1, longitude:1, dataConfidence:'provider' } }, { guestEntranceLocation:{ latitude:1.001, longitude:1.001, dataConfidence:'provider' } }).routingQuality, 'provider-gps');
assert.equal(network.estimate('missing', { landId:'x' }, { landId:'x' }).routingQuality, 'land-zone');
assert.equal(network.estimate('missing', {}, {}).routingQuality, 'neutral');
assert(network.estimate('missing', {}, {}).trustWeight < network.estimate('missing', { landId:'x' }, { landId:'x' }).trustWeight);
console.log('Walking network validation passed.');
