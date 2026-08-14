const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'smart-entry.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' must exist');
  let depth = 0;
  let opened = false;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') { depth += 1; opened = true; }
    if (source[index] === '}') depth -= 1;
    if (opened && depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('Could not parse ' + name);
}

const queuePreview = functionSource(navigation, 'smartEntryQueuePreview');
const parkCard = functionSource(navigation, 'smartEntryParkCard');

assert.match(parkCard, /\(isRecent\s*\|\|\s*resume\)\s*\?\s*smartEntryQueuePreview\(active,\s*remaining,\s*resume\)/,
  'recent parks and resumable matching routes must use the shared queue preview');
assert.match(parkCard, /active\.parkId\s*===\s*park\.id[\s\S]*active\.planningMode\s*===\s*appState\.planningMode/,
  'only an active route matching both park and planning mode may be resumable');
assert.match(parkCard, /active\.completed[\s\S]*active\.skipped/,
  'completed and skipped stops must be removed before selecting the next queue item');

assert.match(queuePreview, /remaining\.find\([\s\S]*!quick\s*\|\|\s*stop\.experienceType\s*===\s*['"]ride['"]/,
  'Quick must never expose a non-ride as its next queue item while Full Day remains eligible');
assert.match(queuePreview, /active\.stops\.findIndex\([\s\S]*stop\.rideId\s*===\s*next\.rideId[\s\S]*storedIndex\s*\+\s*1/,
  'the visible queue number must retain the saved route position after completed or skipped stops');
assert.match(queuePreview, /esc\(next\.name\)/,
  'the next stop name must be escaped before rendering');
assert.match(queuePreview, /Number\(next\.postedWaitMinutes\)\s*>\s*0[\s\S]*Saved wait[\s\S]*Unavailable/,
  'only a positive stored wait may render, and it must be labelled saved rather than live');
assert.match(queuePreview, /Live waits and walking guidance refresh when you resume/,
  'saved queue data must not be presented as current conditions');
assert.match(queuePreview, /No ['"]?\s*\+\s*noun\s*\+\s*['"]? queued yet[\s\S]*Continue to load current waits/,
  'a recent park without an active route must show an honest not-yet-queued state');
assert.match(queuePreview, /Current waits load next[\s\S]*Your park stays changeable/,
  'the no-queue state should explain the next step and preserve manual override expectations');

assert.doesNotMatch(queuePreview, /Magic Kingdom|Hollywood Studios|EPCOT|Animal Kingdom|Universal|Six Flags/,
  'the queue preview must never hard-code a park or ride');
assert.doesNotMatch(queuePreview, /latitude|longitude|accuracy|distanceMeters|<img|<svg/i,
  'the queue preview must not expose GPS or retain decorative image markup');
assert.doesNotMatch(queuePreview, /\+\s*['"]0(?:\s*min)?['"]/,
  'missing waits must never fall back to zero');

assert.match(css, /\.smart-entry-queue-preview\s*\{[^{}]*flex\s*:\s*1\s+1\s+180px[^{}]*display\s*:\s*grid/s,
  'the queue panel must fill the former image area without leaving normal flow');
assert.match(css, /body\.mode-quick\s+\.smart-entry-queue-preview\s*\{[^{}]*--smart-entry-queue-accent\s*:\s*var\(--rh-sixers-red/s,
  'Quick queue accents must use the approved RideHero red');
assert.match(css, /\.smart-entry-queue-copy>h3\s*\{[^{}]*word-break\s*:\s*normal[^{}]*overflow-wrap\s*:\s*break-word/s,
  'long ride names must wrap by words');
assert.match(css, /\.smart-entry-queue-meta\s*\{[^{}]*grid-template-columns\s*:\s*repeat\(2,minmax\(0,1fr\)\)/s,
  'saved wait and progress need a stable two-column layout');
assert.match(css, /@media\s*\(max-width:340px\)\s*and\s*\(max-height:620px\)[\s\S]*\.smart-entry-queue-copy>p\s*\{[^{}]*display\s*:\s*none[\s\S]*\.smart-entry-queue-status\s*\{[^{}]*display\s*:\s*none/s,
  '320x568-class screens must compact supporting copy while retaining the next-queue heading');
assert.doesNotMatch(css, /\.smart-entry-queue-preview\s*\{[^{}]*position\s*:\s*(?:absolute|fixed)/s,
  'the queue panel must remain in normal flow for zoom and long text');

assert.match(html, /css\/smart-entry\.css\?v=5/);
assert.match(html, /js\/navigation\.js\?v=16/);
assert.match(worker, /const CACHE_NAME = ['"]ridehero-shell-v40['"]/);
assert.match(worker, /\.\/css\/smart-entry\.css\?v=5/);
assert.match(worker, /\.\/js\/navigation\.js\?v=16/);

function renderQueue(planningMode, active, remaining, resume) {
  return vm.runInNewContext('(' + queuePreview + ')(active, remaining, resume)', {
    active,
    appState: { planningMode },
    esc(value) {
      return String(value).replace(/[&<>"']/g, function(character) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character];
      });
    },
    remaining,
    resume
  });
}

const emptyPreview = renderQueue('quick', null, [], false);
assert.match(emptyPreview, /Next in your queue[\s\S]*No ride queued yet/);
assert.doesNotMatch(emptyPreview, /<svg|Saved wait|0 min/i);

const savedActive = {
  completed: [{ rideId: 'done' }],
  stops: [
    { rideId: 'done', name: 'Done Ride', experienceType: 'ride', postedWaitMinutes: 15 },
    { rideId: 'show', name: 'Saved Show', experienceType: 'attraction', postedWaitMinutes: 5 },
    { rideId: 'next', name: 'Next & Best', experienceType: 'ride', postedWaitMinutes: 25 }
  ]
};
const quickPreview = renderQueue('quick', savedActive, savedActive.stops.slice(1), true);
assert.match(quickPreview, /smart-entry-queue-number[^>]*>3</,
  'Quick must retain the saved queue position while skipping non-ride records');
assert.match(quickPreview, /Next &amp; Best/);
assert.match(quickPreview, /Saved wait[\s\S]*25 min[\s\S]*1 of 3 complete/);
assert.doesNotMatch(quickPreview, /Saved Show/);

const fullPreview = renderQueue('full', savedActive, savedActive.stops.slice(1), true);
assert.match(fullPreview, /Saved Show/,
  'Full Day may retain eligible non-ride experiences in its saved queue');

const missingWaitPreview = renderQueue('quick', {
  completed: [],
  stops: [{ rideId: 'next', name: 'Next Ride', experienceType: 'ride', postedWaitMinutes: 0 }]
}, [{ rideId: 'next', name: 'Next Ride', experienceType: 'ride', postedWaitMinutes: 0 }], true);
assert.match(missingWaitPreview, /Saved wait[\s\S]*Unavailable/);
assert.doesNotMatch(missingWaitPreview, />0 min</);

console.log('Smart Entry next-queue validation passed.');
