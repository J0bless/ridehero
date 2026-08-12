const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let saved = JSON.stringify({ version: 3, recent: { planningMode: 'strategic', parkId: 'mk' }, preferencesByPark: {} });
const localStorage = {
  getItem(key) { return key === 'rideheroState' ? saved : key === 'rideheroGuidanceMode' ? 'strategic' : null; },
  setItem(key, value) { if (key === 'rideheroState') saved = value; }
};
const context = vm.createContext({ localStorage, window: {} });
context.window.window = context.window;
context.window.localStorage = localStorage;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'storage-migration.js'), 'utf8'), context, { filename: 'js/storage-migration.js' });

assert.equal(context.window.RideHeroState.migrationVersion, 5);
assert.equal(context.window.RideHeroState.get().recent.planningMode, 'full', 'legacy strategic mode must migrate to the new full planning state');
assert.equal(context.window.RideHeroState.get().recent.parkId, 'mk', 'mode migration must preserve the recent park');
assert.equal(context.window.RideHeroState.get().recent.parkSelectedAt, null, 'older state must safely default the recent park timestamp');

console.log('Planning mode storage migration validation passed.');
