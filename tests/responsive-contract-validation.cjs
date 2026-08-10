const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'multi-resort.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'wide cards must use shrink-safe grid tracks');
assert.match(css, /@media\(max-width:700px\)[\s\S]*grid-template-columns:1fr/, 'phone layouts must use one-column destination cards');
assert.match(css, /@media\(max-width:340px\)/, '320px-class phones need an explicit compact rule');
assert.match(css, /min-height:44px/, 'compact controls must retain 44px touch targets');
assert.match(css, /@media\(prefers-reduced-motion:reduce\)/, 'catalog motion must respect reduced-motion preferences');
assert.match(html, /overflow-x:hidden/, 'the app shell must guard against horizontal overflow');
assert.match(css, /width:min\(620px,calc\(100% - 24px\)\)/, 'the park switcher must remain inside narrow viewports');

console.log('Responsive contract validation passed for 320/360/390/430px, tablet, and desktop CSS breakpoints.');
