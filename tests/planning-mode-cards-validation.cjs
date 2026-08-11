const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const navigation = fs.readFileSync(path.join(__dirname, '..', 'js', 'navigation.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'onboarding.css'), 'utf8');

assert.match(navigation, /class="mode-card-grid"/, 'planning modes must render together in the restored card grid');
assert.match(navigation, /mode-card-quick[\s\S]*mode-card-full/, 'Quick Route and Maximize My Day cards must both be present');
assert.match(navigation, /Rides only/, 'Quick Route must clearly remain rides only');
assert.match(navigation, /Nearby[\s\S]*Live[\s\S]*Priority[\s\S]*Balanced/, 'cards must expose concise planning context');
assert.doesNotMatch(navigation, /data-mode-swipe|modeTextOpacities|ResizeObserver/, 'the width-compressing carousel must remain removed');
assert.match(navigation, /is-burning'[\s\S]*}, 420\)/, 'the opening question must enter its burn phase after a short readable hold');
assert.match(navigation, /setTimeout\(revealOptions, 800\)/, 'the opening question must reveal the options page on one concise timeline');
assert.match(navigation, /options\.inert = true[\s\S]*options\.inert = false/, 'hidden options must remain inaccessible until revealed');
assert.match(navigation, /pointerdown[\s\S]*pointermove[\s\S]*pointerup[\s\S]*pointercancel/, 'the full options page must support a complete reversible pull gesture');
assert.match(navigation, /page\.style\.opacity = \(1 - \(Math\.abs\(dx\) \/ width\) \* 0\.72\)/, 'page opacity must follow pull distance continuously');

assert.match(css, /\.mode-catalog-page\{[^}]*linear-gradient/, 'planning mode should use the reference-inspired soft backdrop');
assert.match(css, /\.mode-card-grid\{[^}]*repeat\(2,minmax\(0,1fr\)\)/, 'wide layouts must show two balanced mode cards');
assert.match(css, /@media \(max-width:700px\)[\s\S]*\.mode-card-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'mobile layouts must keep both planning options visible');
assert.match(css, /\.mode-card\{[^}]*border-radius:34px[^}]*background:rgba\(255,255,255,.96\)/, 'mode cards must use clean white rounded surfaces');
assert.match(css, /\.mode-card-preview\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'card information groups must use shrink-safe layout');
assert.doesNotMatch(css, /mode-swipe-stage|mode-swipe-track|mode-progress-rail|mode-progress-cart|mode-switch-actions/, 'swipe-specific visual UI must remain removed');
assert.doesNotMatch(css, /mode-card-copy[^}]*white-space:\s*nowrap|mode-card-copy[^}]*scaleX/, 'mode copy must use normal unsquashed wrapping');
assert.match(navigation, /mode-choice-quick'[\s\S]*mode-choice-full'/, 'selection must set a directional page-swipe class');
assert.match(css, /body\.mode-choice-made \.mode-card-top[\s\S]*opacity:0/, 'mode text and content must fade during selection');
assert.match(css, /\.mode-choice-stage\{[^}]*flex:1[^}]*min-height:clamp\(420px,52dvh,620px\)/, 'planning options must fill the usable screen');
assert.match(css, /\.mode-screen-divider\{[^}]*left:50%/, 'the decorative RideHero divider must split the two visible options');
assert.match(css, /\.mode-screen-divider path\{[^}]*stroke:#fff/, 'the divider must render as the sketched wavy white rail');
assert.match(css, /\.mode-screen-cart\{[^}]*top:52%/, 'the decorative cart must stay centered on the rail');
assert.match(css, /\.mode-catalog-page\.is-burning \.catalog-heading\{[^}]*opacity:0[^}]*filter:blur\(6px\)/, 'the opening question must burn and fade away without changing width');
assert.match(css, /\.mode-catalog-page\.is-options-ready \.catalog-content\{opacity:1;visibility:visible/, 'the options page must appear only after the opening effect');
assert.match(css, /mode-choice-quick \.mode-catalog-page\{opacity:0;transform:translate3d\(-100vw,0,0\)\}/, 'Quick selection must fade and swipe the full page left');
assert.match(css, /mode-choice-full \.mode-catalog-page\{opacity:0;transform:translate3d\(100vw,0,0\)\}/, 'Full selection must fade and swipe the full page right');
assert.doesNotMatch(css, /mode-choice-made[^}]*width|mode-choice-made[^}]*scaleX/, 'the effect must not alter page or text width');

console.log('Restored planning mode card UI validation passed.');
