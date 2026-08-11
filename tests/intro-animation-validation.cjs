const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'onboarding.css'), 'utf8');

assert.match(html, /var rideDuration = 1981;/, 'the coaster rail run must occupy its proportional share of the 2.5-second timeline');
assert.match(html, /var pullAwayDuration = 519;/, 'the synchronized page pull must complete the 2.5-second timeline');
assert.match(html, /var totalDuration = rideDuration \+ pullAwayDuration;/);
assert.match(html, /setTimeout\(function\(\)\{ finishSplash\(false\); \}, 2500\);/, 'the fallback must match the 2.5-second shared timeline');
assert.match(html, /var pullStartT = 0\.68;/, 'the page pull must begin before the coaster fully exits');
assert.match(html, /<path id="coaster-motion-path"/, 'the rail must expose one canonical SVG path');
assert.match(html, /<use href="#coaster-motion-path" class="track-rail/, 'the visible rail must use the canonical path');
assert.match(html, /document\.getElementById\('coaster-motion-path'\)/, 'the train must use the exact canonical rail path');
assert.match(html, /carAnchors = cars\.map[\s\S]*car\.offsetWidth \/ 2[\s\S]*car\.offsetHeight \/ 2/, 'each car anchor must be measured once from its actual size');
assert.match(html, /svgScale = Math\.min\(stageWidth \/ viewWidth, stageHeight \/ viewHeight\)/, 'the rail-to-stage geometry must be calculated once');
assert.match(html, /translate3d\('[\s\S]*rotate\('/, 'cars must use subpixel compositor transforms');
assert.match(html, /return easeInOutSine\(clamp\(t,0,1\)\)/, 'the train must use one continuous easing curve');
assert.doesNotMatch(html, /getScreenCTM|getBoundingClientRect\(\)/, 'the animation loop must not force per-frame layout measurements');
assert.match(html, /window\.requestAnimationFrame\(animateSplashTrain\)/, 'the intro must start on an animation frame without a delayed class chain');
assert.match(html, /prefers-reduced-motion: reduce/, 'the intro must detect reduced motion');
assert.match(css, /\.splash-page\{animation:none!important/, 'legacy CSS animation timelines must be disabled');
assert.match(css, /\.coaster-stage\{width:min\(520px,112vw\)!important;height:320px!important/, 'the coaster loop must use the larger responsive stage');
assert.match(css, /\.coaster-train\.rebuilt-train \.train-car,[\s\S]*width:38px!important;[\s\S]*border-radius:16px 17px 9px 9px!important/, 'coaster cars must use the larger rounded artwork');
assert.match(css, /\.train-car em\{display:block!important[\s\S]*width:10px!important;height:10px!important/, 'each coaster car must visibly carry two riders');
assert.match(html, /var carGap = 40;/, 'the larger coaster cars must keep appropriate spacing on the rail');
assert.match(html, /class="sky-kites"[\s\S]*class="festival-scene"[\s\S]*class="festival-wheel"[\s\S]*class="festival-bunting"[\s\S]*class="ground-details"/, 'the intro must include colorful coaster and festival scenery');
assert.doesNotMatch(css, /background:linear-gradient\(180deg,rgba\(91,122,98,\.2\)/, 'the grey translucent horizon treatment must not return');
assert.match(css, /\.splash-sky:before\{[^}]*background:#A9DF80/, 'the distant horizon must use a clean solid palette color');
assert.match(css, /backface-visibility:hidden;[\s\S]*contain:layout paint style;/, 'each car must be isolated for smooth compositor animation');
assert.match(css, /\.coaster-stage \.track-shadow\{stroke-width:18!important[\s\S]*\.coaster-stage \.track-rail\{stroke-width:3\.5!important/, 'the rail artwork must use the cleaner reduced visual weight');
assert.doesNotMatch(html, /var rideDuration = 6600/, 'the old 7.6 second timeline must not return');
assert.doesNotMatch(html, /split-mode-picker|mode-spinner-widget|SWIPE LEFT|SWIPE RIGHT/, 'obsolete mode interaction UI must remain removed');

console.log('Synchronized intro animation validation passed at 2500ms.');
