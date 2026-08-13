const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

const preview = functionSource(navigation, 'smartEntryPlanPreview');
const parkCard = functionSource(navigation, 'smartEntryParkCard');

assert.match(parkCard, /isRecent\s*&&\s*!resume\s*\?\s*smartEntryPlanPreview\(park\)/,
  'the visual preview must fill only the recent card without a resumable route');
assert.match(preview, /appState\.planningMode\s*===\s*['"]quick['"]/,
  'the preview must adapt to the selected planning mode');
assert.match(preview, /Operating rides only[\s\S]*Eligible experiences/,
  'Quick must remain rides-only while Full Day avoids promising a filter that has not been chosen yet');
assert.match(preview, /RideHero will plan with/,
  'the preview heading must read naturally in both planning modes');
assert.match(preview, /park\.liveWaitTimesAvailable\s*===\s*true[\s\S]*Live waits when available/,
  'wait copy must describe capability conditionally rather than claim current availability');
assert.match(preview, /park\.mapRoutingAvailable[\s\S]*routingQuality\s*===\s*['"]verified['"][\s\S]*Walking-aware order[\s\S]*Nearby-area guidance/,
  'walking copy must respect routing quality');
assert.match(preview, /aria-hidden=['"]true['"][\s\S]*<svg[\s\S]*focusable=['"]false['"]/, 'the abstract route artwork must remain decorative and out of the accessibility tree');
assert.match(preview, /aria-labelledby=['"]smart-entry-plan-preview-title['"][\s\S]*id=['"]smart-entry-plan-preview-title['"]/, 'the useful preview facts must have a programmatic label');

assert.doesNotMatch(preview, /Magic Kingdom|Hollywood Studios|EPCOT|Animal Kingdom|Universal|Six Flags/,
  'the preview must never hard-code a particular park');
assert.doesNotMatch(preview, /latitude|longitude|accuracy|distanceMeters|waitTime|lastUpdated/,
  'the preview must not expose or invent live location, wait, or distance values');
assert.doesNotMatch(preview, /<img|\.asset|\.webp|\.png|\.jpe?g/i,
  'the preview must not add a park-specific image download or unequal fallback');

assert.match(css, /\.smart-entry-plan-preview\s*\{[^{}]*flex\s*:\s*1\s+1\s+190px[^{}]*justify-content\s*:\s*center/s,
  'the preview should use the existing blank card space without changing page geometry');
assert.match(css, /body\.mode-quick\s+\.smart-entry-plan-preview\s*\{[^{}]*--smart-entry-plan-accent\s*:\s*var\(--rh-sixers-red/s,
  'Quick preview accents must use the approved RideHero red');
assert.match(css, /\.smart-entry-plan-art\s*\{[^{}]*height\s*:\s*clamp\([^)]*\)[^{}]*overflow\s*:\s*hidden/s,
  'the artwork must scale responsively inside its card');
assert.match(css, /\.smart-entry-plan-copy li\s*\{[^{}]*word-break\s*:\s*normal[^{}]*overflow-wrap\s*:\s*break-word/s,
  'preview facts must wrap by words instead of collapsing into letter columns');
assert.match(css, /@media\s*\(max-width:430px\)\s*and\s*\(max-height:700px\)[\s\S]*\.smart-entry-plan-art\s*\{[^{}]*height\s*:\s*clamp\(86px,16vh,118px\)/,
  'short phones need a compact artwork height that preserves footer clearance');
assert.match(css, /@media\s*\(max-width:340px\)\s*and\s*\(max-height:620px\)[\s\S]*\.smart-entry-plan-art\s*\{[^{}]*height\s*:\s*clamp\(70px,13vh,82px\)[\s\S]*\.smart-entry-plan-copy>ul\s*\{[^{}]*display\s*:\s*none/s,
  '320x568-class screens must keep the illustration and label but remove wrapping fact chips to preserve one-screen fit');
assert.doesNotMatch(css, /\.smart-entry-plan-preview\s*\{[^{}]*position\s*:\s*(?:absolute|fixed)/s,
  'the preview must stay in normal flow for text zoom and long names');

assert.match(html, /css\/smart-entry\.css\?v=4/);
assert.match(html, /js\/navigation\.js\?v=13/);
assert.match(worker, /const CACHE_NAME = ['"]ridehero-shell-v33['"]/);
assert.match(worker, /\.\/css\/smart-entry\.css\?v=4/);
assert.match(worker, /\.\/js\/navigation\.js\?v=13/);

console.log('Smart Entry plan preview validation passed.');
