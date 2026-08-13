'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const smartEntryCss = read('css/smart-entry.css');
const navigationSource = read('js/navigation.js');

function functionSource(source, name) {
  const marker = `  function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.indexOf('\n  function ', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function shortPhoneMedia(source) {
  const marker = /@media\s*\(\s*max-width\s*:\s*430px\s*\)\s*and\s*\(\s*max-height\s*:\s*700px\s*\)|@media\s*\(\s*max-height\s*:\s*700px\s*\)\s*and\s*\(\s*max-width\s*:\s*430px\s*\)/i;
  const match = marker.exec(source);
  assert.ok(match, 'Smart Entry needs a dedicated 430px × 700px-or-shorter compact layout');
  const nextMedia = source.indexOf('@media', match.index + match[0].length);
  return source.slice(match.index, nextMedia === -1 ? source.length : nextMedia);
}

function phoneHeightMedia(source) {
  const marker = /@media\s*\(\s*max-width\s*:\s*700px\s*\)\s*and\s*\(\s*max-height\s*:\s*1000px\s*\)|@media\s*\(\s*max-height\s*:\s*1000px\s*\)\s*and\s*\(\s*max-width\s*:\s*700px\s*\)/i;
  const match = marker.exec(source);
  assert.ok(match, 'Smart Entry needs a phone-height layout that clears the fixed app navigation');
  const nextMedia = source.indexOf('@media', match.index + match[0].length);
  return source.slice(match.index, nextMedia === -1 ? source.length : nextMedia);
}

const compactCss = shortPhoneMedia(smartEntryCss);
const phoneHeightCss = phoneHeightMedia(smartEntryCss);
const parkCard = functionSource(navigationSource, 'smartEntryParkCard');

// The compact path must optimize the actual recent-park/resume state shown to
// returning users, not a separate mock surface.
assert.match(parkCard, /smart-entry-card[\s\S]*has-resume/,
  'the live Smart Entry card must expose its returning-route state to CSS');
assert.match(parkCard, /isRecent\s*\?\s*['"] is-recent['"]\s*:\s*['"]['"]/,
  'recent-only and resumable routes must share an explicit large-card layout hook');
assert.match(parkCard, /smartEntryQueuePreview[\s\S]*Resume Route[\s\S]*Start New Route[\s\S]*Change Park/,
  'the compact state must preserve the next-queue panel, resume, new-route, and manual park override actions');

// Width containment and normal word boundaries prevent one-letter columns at
// 320px while still allowing genuine long names to wrap.
assert.match(smartEntryCss, /\.smart-entry-shell\s*\{[^{}]*width\s*:\s*min\(100%,\s*760px\)[^{}]*max-width\s*:\s*100%/s,
  'the Smart Entry shell must stay within the viewport');
assert.match(smartEntryCss, /\.smart-entry-card\s*>\s*\*\s*\{[^{}]*min-width\s*:\s*0/s,
  'Smart Entry card children must be allowed to shrink safely');
assert.match(compactCss, /\.smart-entry-copy(?:\s*>\s*(?:h2|p|small)[^,{]*)?[^{}]*\{[^{}]*word-break\s*:\s*normal/s,
  'short-phone park copy must keep normal word boundaries');
assert.doesNotMatch(smartEntryCss, /word-break\s*:\s*break-all/i,
  'Smart Entry must never split normal labels into one-letter columns');
assert.doesNotMatch(smartEntryCss, /(?:^|[;{])\s*min-width\s*:\s*[4-9]\d\dpx/i,
  'Smart Entry must not impose a phone-breaking fixed minimum width');

// The recent card should fill the open area between the in-flow header and the
// fixed footer. The same flex chain serves recent-only and resumable states.
assert.match(compactCss, /\.catalog-view-smart-entry\s+\.catalog-header\s*\{[^{}]*(?:padding|min-height)/s,
  'short Smart Entry screens must compact the shared header');
assert.match(compactCss, /\.catalog-view-smart-entry\s+\.catalog-heading\s*\{[^{}]*padding/s,
  'short Smart Entry screens must compact heading spacing');
assert.match(phoneHeightCss, /\.catalog-view-smart-entry\s*\{[^{}]*display\s*:\s*flex[^{}]*flex-direction\s*:\s*column/s,
  'the phone-height page must keep the header and recent card in a vertical flex flow');
assert.match(phoneHeightCss, /\.catalog-view-smart-entry\s+\.catalog-content\s*\{[^{}]*display\s*:\s*flex[^{}]*flex\s*:\s*1[^{}]*min-height\s*:\s*0/s,
  'catalog content must pass remaining height beneath the header to Smart Entry');
assert.match(phoneHeightCss, /\.smart-entry-shell\s*\{[^{}]*display\s*:\s*flex[^{}]*flex\s*:\s*1[^{}]*min-height\s*:\s*0[^{}]*flex-direction\s*:\s*column/s,
  'the Smart Entry shell must stretch safely inside the catalog content');
assert.match(phoneHeightCss, /\.smart-entry-card\.is-recent\s*\{[^{}]*display\s*:\s*flex[^{}]*flex\s*:\s*1[^{}]*min-height\s*:\s*0[^{}]*flex-direction\s*:\s*column/s,
  'the recent card must remain visually large in both recent-only and resumable states');
assert.match(phoneHeightCss, /\.smart-entry-card\.is-recent\s+\.smart-entry-actions\s*\{[^{}]*margin-top\s*:\s*auto/s,
  'recent-card actions must anchor inside the card above the fixed footer');

// Compact does not mean inaccessible: every visible route choice remains a
// semantic, keyboard-operable button with a full touch target.
assert.match(parkCard, /<button class="smart-entry-primary" type="button"/,
  'the primary Smart Entry action must remain a semantic button');
assert.match(parkCard, /<button class="smart-entry-secondary" type="button"/,
  'the secondary Smart Entry action must remain a semantic button');
assert.match(parkCard, /<button class="smart-entry-link" type="button"/,
  'the manual park override must remain a semantic button');
assert.match(compactCss, /\.smart-entry-primary\s*,\s*\.smart-entry-secondary\s*,\s*\.smart-entry-link\s*\{[^{}]*min-height\s*:\s*44px/s,
  'all Smart Entry actions must retain at least 44px touch targets when compacted');

// The default state can fit a short viewport, but zoomed/large-text content
// must grow the document and scroll rather than being clipped behind the nav.
assert.match(compactCss, /\.catalog-view-smart-entry\s*\{[^{}]*height\s*:\s*auto[^{}]*min-height\s*:\s*100dvh/s,
  'the compact page must remain content-sized with a viewport-height floor');
assert.doesNotMatch(compactCss, /overflow(?:-y)?\s*:\s*hidden/i,
  'short Smart Entry pages must preserve a vertical scroll fallback for large text');
assert.doesNotMatch(phoneHeightCss, /\.smart-entry-card(?:\.is-recent)?\s*\{[^{}]*position\s*:\s*(?:fixed|absolute)/is,
  'the recent card must stay in document flow so it cannot overlap the header or footer');
assert.match(phoneHeightCss, /\.catalog-view-smart-entry\s*\{[^{}]*padding-bottom\s*:\s*calc\([^)]*env\(safe-area-inset-bottom\)/s,
  'the page must reserve safe-area space for the fixed bottom navigation');

console.log('Smart Entry responsive validation passed for large recent-card clearance and long-text scroll fallback.');
