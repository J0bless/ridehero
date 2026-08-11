const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'onboarding.css'), 'utf8');

assert.match(html, /var rideDuration = 822;/, 'the coaster rail run must be about 15% slower than the previous 715ms timing');
assert.match(html, /var pullAwayDuration = 215;/, 'the page pull must remain synchronized at about 15% slower than the previous 187ms timing');
assert.match(html, /var totalDuration = rideDuration \+ pullAwayDuration;/);
assert.match(html, /setTimeout\(function\(\)\{ finishSplash\(false\); \}, 1037\);/, 'the fallback must match the slowed shared timeline');
assert.match(html, /var pullStartT = 0\.68;/, 'the page pull must begin before the coaster fully exits');
assert.match(html, /<path id="coaster-motion-path"/, 'the rail must expose one canonical SVG path');
assert.match(html, /<use href="#coaster-motion-path" class="track-rail/, 'the visible rail must use the canonical path');
assert.match(html, /document\.getElementById\('coaster-motion-path'\)/, 'the train must use the exact canonical rail path');
assert.match(html, /anchorX = car\.offsetWidth \/ 2/, 'each coaster car must be centered using its actual width');
assert.match(html, /anchorY = car\.offsetHeight \/ 2/, 'each coaster car must be centered using its actual height');
assert.match(html, /window\.requestAnimationFrame\(animateSplashTrain\)/, 'the intro must start on an animation frame without a delayed class chain');
assert.match(html, /prefers-reduced-motion: reduce/, 'the intro must detect reduced motion');
assert.match(css, /\.splash-page\{animation:none!important/, 'legacy CSS animation timelines must be disabled');
assert.doesNotMatch(html, /var rideDuration = 6600/, 'the old 7.6 second timeline must not return');
assert.doesNotMatch(html, /split-mode-picker|mode-spinner-widget|SWIPE LEFT|SWIPE RIGHT/, 'obsolete mode interaction UI must remain removed');

console.log('Synchronized intro animation validation passed at 1037ms (15% slower than the prior timing).');
