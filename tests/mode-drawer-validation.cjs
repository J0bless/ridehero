const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(html, /id="mode-drawer"/, 'the mode control must use an edge drawer');
assert.match(html, /id="mode-drawer-tab"[\s\S]*aria-expanded="false"/, 'the edge tab must expose drawer state');
assert.match(html, /id="mode-drawer-panel"[\s\S]*aria-hidden="true"[\s\S]*inert/, 'the closed panel must not expose focusable controls');
assert.match(html, /data-mode="quick"[\s\S]*Quick Route/, 'the drawer must retain Quick Route selection');
assert.match(html, /data-mode="strategic"[\s\S]*Plan My Day/, 'the drawer must expose Plan My Day selection');
assert.match(html, /event\.clientX >= window\.innerWidth - 26/, 'a swipe from the right screen edge must open the drawer');
assert.match(html, /!openedAtStart && dx < 0[\s\S]*setModeDrawerOpen\(true, false\)/, 'a left swipe must open the drawer');
assert.match(html, /openedAtStart && dx > 0[\s\S]*setModeDrawerOpen\(false, false\)/, 'a right swipe must close the drawer');
assert.match(html, /event\.key === 'Escape'/, 'Escape must close the drawer');
assert.match(html, /@media \(prefers-reduced-motion:reduce\)/, 'drawer motion must respect reduced-motion preferences');
assert.match(html, /width:min\(304px,calc\(100vw - 58px\)\)/, 'the drawer must stay within narrow viewports');
assert.doesNotMatch(html, /id="mode-spinner-widget"/, 'the floating spinner widget must be removed');

console.log('Mode drawer validation passed for edge swipe, accessibility, and responsive containment.');
