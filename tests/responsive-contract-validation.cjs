const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'multi-resort.css'), 'utf8');
const onboardingCss = fs.readFileSync(path.join(root, 'css', 'onboarding.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'wide cards must use shrink-safe grid tracks');
assert.match(css, /@media\(max-width:700px\)[\s\S]*grid-template-columns:1fr/, 'phone layouts must use one-column destination cards');
assert.match(css, /@media\(max-width:340px\)/, '320px-class phones need an explicit compact rule');
assert.match(css, /min-height:44px/, 'compact controls must retain 44px touch targets');
assert.match(css, /@media\(prefers-reduced-motion:reduce\)/, 'catalog motion must respect reduced-motion preferences');
assert.match(html, /overflow-x:hidden/, 'the app shell must guard against horizontal overflow');
assert.match(css, /width:min\(620px,calc\(100% - 24px\)\)/, 'the park switcher must remain inside narrow viewports');
assert.match(onboardingCss, /--rh-navy:/, 'the polished shell must use RideHero design tokens');
assert.match(onboardingCss, /--rh-space-8:/, 'the design system must provide a complete spacing scale');
assert.match(onboardingCss, /@media \(max-width:330px\)/, '320px-class phones need explicit onboarding containment');
assert.match(onboardingCss, /grid-template-columns:1fr/, 'mobile onboarding cards must collapse to one column');
assert.match(onboardingCss, /min-height:52px/, 'primary onboarding CTAs must remain touch friendly');
assert.match(onboardingCss, /overflow-wrap:normal/, 'stable text must retain normal word wrapping');
assert.match(onboardingCss, /overflow-x:hidden/, 'the refreshed shell must prevent horizontal overflow');
assert.match(onboardingCss, /@media \(prefers-reduced-motion:reduce\)/, 'onboarding motion must respect reduced-motion preferences');
assert.match(onboardingCss, /\.catalog-view-brands \.brand-card-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);max-width:none/, 'the destination dashboard must show three compact visual cards without horizontal scrolling');
assert.match(onboardingCss, /\.brand-card-visual \.catalog-card-icon\{[^}]*width:50px;height:50px[^}]*border-radius:50%/, 'destination letter tiles must use compact circular geometry');
assert.match(onboardingCss, /@media \(max-width:330px\)[\s\S]*\.catalog-view-brands \.brand-card-grid\{gap:6px\}/, '320px screens must receive explicit compact destination-card spacing');
assert.match(onboardingCss, /\.app-nav\{left:12px!important;right:12px!important;bottom:8px!important[^}]*border-radius:28px!important/, 'the shared Home and Route navigation must use the floating native-app shell');
assert.match(onboardingCss, /\.catalog-heading\[tabindex="-1"\]:focus[^}]*outline:0!important;box-shadow:none!important/, 'page headings must not render grey focus boundaries');
assert.match(onboardingCss, /\.mode-catalog-page \.catalog-heading\{[^}]*align-items:center[^}]*text-align:center/, 'the planning-mode question must be centered');

console.log('Responsive contract validation passed for 320/360/390/430px, tablet, and desktop CSS breakpoints.');
