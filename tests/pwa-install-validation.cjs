const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const install = fs.readFileSync(path.join(root, 'js', 'pwa-install.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'onboarding.css'), 'utf8');
const multiResortCss = fs.readFileSync(path.join(root, 'css', 'multi-resort.css'), 'utf8');
const appThemeSource = html + css + multiResortCss;

assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="icons\/ridehero-180\.png"/);
assert.match(html, /name="theme-color" content="#0D1B4C"/);
assert.match(html, /id="pwa-install-button"[^>]*hidden/);
assert.match(html, /src="js\/pwa-install\.js\?v=1"/);
assert.equal(manifest.name, 'RideHero');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, './');
assert.equal(manifest.background_color, '#F8FAFC');
assert.equal(manifest.theme_color, '#0D1B4C');
assert.ok(manifest.icons.some(function(icon) { return icon.sizes === '192x192' && icon.type === 'image/png'; }));
assert.ok(manifest.icons.some(function(icon) { return icon.sizes === '512x512' && icon.type === 'image/png'; }));
manifest.icons.forEach(function(icon) {
  const file = path.join(root, icon.src);
  assert.ok(fs.existsSync(file), 'missing manifest icon ' + icon.src);
  const png = fs.readFileSync(file);
  const size = Number(icon.sizes.split('x')[0]);
  assert.equal(png.readUInt32BE(16), size, 'incorrect icon width for ' + icon.src);
  assert.equal(png.readUInt32BE(20), size, 'incorrect icon height for ' + icon.src);
});
const appleTouchIcon = fs.readFileSync(path.join(root, 'icons', 'ridehero-180.png'));
assert.equal(appleTouchIcon.readUInt32BE(16), 180, 'incorrect Apple touch icon width');
assert.equal(appleTouchIcon.readUInt32BE(20), 180, 'incorrect Apple touch icon height');
assert.match(worker, /const CACHE_NAME = 'ridehero-shell-v8'/);
assert.match(html, /css\/onboarding\.css\?v=2/, 'the onboarding stylesheet must use the current cache-busting version');
assert.match(html, /js\/navigation\.js\?v=2/, 'the navigation script must use the current cache-busting version');
assert.match(worker, /\.\/css\/onboarding\.css\?v=2/, 'the service worker must precache the current onboarding stylesheet');
assert.match(worker, /\.\/js\/navigation\.js\?v=2/, 'the service worker must precache the current navigation script');
assert.match(worker, /\.\/icons\/ridehero-180\.png/);
assert.match(worker, /request\.mode === 'navigate'[\s\S]*networkFirst/);
assert.match(worker, /css\|js\|webmanifest[\s\S]*networkFirst/, 'version-sensitive app code must update from the network before using cache');
assert.match(worker, /\/api\/[\s\S]*\/waittimes/, 'live operational endpoints must bypass the static cache');
assert.match(install, /serviceWorker\.register\('\.\/service-worker\.js'/);
assert.match(install, /beforeinstallprompt/);
assert.match(install, /appinstalled/);
assert.match(install, /Add to Home Screen/);
['#F8FAFC', '#0D1B4C', '#334E68', '#D62828', '#F26B38', '#4E7A4E', '#5A98D9', '#E6392F', '#FB7A3C', '#5BA86B', '#3B82F6'].forEach(function(color) {
  assert.ok(css.includes(color), 'missing updated RideHero palette color ' + color);
});
['#DDDCE7', '#1C203B', '#40466B', '#9F364C', '#C3755D', '#5B7B62', '#5F709A'].forEach(function(color) {
  assert.ok(!appThemeSource.toUpperCase().includes(color), 'superseded palette color remains ' + color);
});
['#185FA5', '#14517A', '#245DF5', '#0B3D91', '#0B7AD1', '#D8242A', '#FF3B30'].forEach(function(color) {
  assert.ok(!appThemeSource.toUpperCase().includes(color), 'legacy bright red/blue color remains ' + color);
});
assert.match(css, /body\.mode-quick\{[\s\S]*--mode-primary:var\(--rh-sixers-red\)!important;[\s\S]*--mode-accent:var\(--rh-retro-orange\)!important/, 'Quick Route must prioritize red with orange accents');
assert.match(css, /body\.mode-strategic\{[\s\S]*--mode-primary:var\(--rh-vintage-blue\)!important;[\s\S]*--mode-accent:var\(--rh-retro-green\)!important/, 'Full Day must prioritize blue with green accents');
assert.match(css, /body\.mode-quick \.route-hero\{background:var\(--rh-sixers-red\)!important\}/, 'Quick Route output must use the red swatch');
assert.match(css, /body\.mode-strategic \.route-hero\{background:var\(--rh-deep-navy\)!important\}/, 'Full Day output must use the navy swatch');

const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');
assert.match(navigation, /parts\[0\] === 'mode'[\s\S]*classList\.remove\('mode-quick', 'mode-strategic'\)/, 'mode choice must stay neutral');
assert.match(navigation, /appState\.planningMode[\s\S]*applyGuidanceMode\(legacyGuidanceMode\(\)\)/, 'reload-safe navigation must restore the chosen app theme');

console.log('Installable PWA and updated RideHero palette validation passed.');
