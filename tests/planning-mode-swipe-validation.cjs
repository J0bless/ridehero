const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const navigationSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'navigation.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'onboarding.css'), 'utf8');
const root = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } };
const document = {
  body: { classList: { add() {}, remove() {} }, appendChild() {} },
  getElementById(id) { return id === 'screen-setup' ? root : null; },
  querySelectorAll() { return []; },
  createElement() { return { setAttribute() {} }; }
};
const context = vm.createContext({
  document,
  location: { hash: '#/mode', replace(next) { this.hash = next; } },
  history: { length: 1, back() {} },
  matchMedia() { return { matches: false }; },
  setTimeout(callback) { callback(); },
  scrollTo() {},
  addEventListener() {},
  RIDEHERO_CATALOG: { brands: {}, destinations: {}, parks: {} },
  RideHeroState: { get() { return { recent: {} }; }, rememberContext() {} },
  RideHeroParkData: { findParkByRoute() { return {}; } }
});
context.window = context;
vm.runInContext(navigationSource, context, { filename: 'js/navigation.js' });

const opacity = context.RideHeroMultiResort.getModeTextOpacities;
assert.deepEqual({ ...opacity(0) }, { quick: 1, full: 0 });
assert.equal(opacity(0.14).quick, 1);
assert.equal(opacity(0.42).quick, 0);
assert.equal(opacity(0.58).full, 0);
assert.equal(opacity(0.86).full, 1);
assert.deepEqual({ ...opacity(1) }, { quick: 0, full: 1 });
assert.equal(opacity(0.5).quick + opacity(0.5).full, 0, 'copy blocks must not overlap at the narrow midpoint');
assert(Math.abs(opacity(0.25).quick - opacity(0.75).full) < 1e-12, 'inverse swipes must use symmetric fade curves');

assert.match(navigationSource, /applyProgress\(startProgress - \(dx \/ width\), false\)/, 'pointer movement must update normalized progress continuously');
assert.match(navigationSource, /track\.style\.transform = 'translate3d\('/, 'panel pull must be transform driven');
assert.match(navigationSource, /rail\.style\.transform = 'translate3d\('[\s\S]*\(1 - progress\)/, 'rail must use the same progress update and a compositor transform');
assert.match(navigationSource, /quickInner\.style\.opacity = quickOpacity/, 'Quick copy must be progress faded');
assert.match(navigationSource, /fullInner\.style\.opacity = fullOpacity/, 'Full copy must be progress faded');
assert.match(navigationSource, /ArrowLeft'[\s\S]*ArrowRight'/, 'keyboard mode comparison must support both directions');
assert.match(navigationSource, /pointerdown[\s\S]*pointermove[\s\S]*pointerup[\s\S]*pointercancel/, 'pointer drag lifecycle must be complete');
assert.match(navigationSource, /setFocusable\(quickPanel, false\)[\s\S]*setFocusable\(fullPanel, false\)/, 'moving panels must not expose hidden focus targets');

assert.match(css, /\.mode-swipe-stage\{[^}]*overflow:hidden/, 'the viewport must clip panels instead of compressing copy');
assert.match(css, /\.mode-swipe-track\{[^}]*width:200%/, 'the track must preserve two full-width internal panels');
assert.match(css, /\.mode-card\{[^}]*flex:0 0 50%[^}]*width:50%/, 'each panel must keep a stable viewport-width layout');
assert.doesNotMatch(css, /mode-card-copy[^}]*scaleX|mode-card-inner[^}]*scaleX/, 'mode text must never be horizontally scaled');
assert.doesNotMatch(css, /mode-card-copy[^}]*white-space:\s*nowrap/, 'mode copy must retain normal wrapping');
assert.doesNotMatch(css, /mode-card-copy[^}]*transition:[^}]*width/, 'mode copy width must never animate');

console.log('Planning mode swipe and progress-fade validation passed.');
