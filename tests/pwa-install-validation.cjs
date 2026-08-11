const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const install = fs.readFileSync(path.join(root, 'js', 'pwa-install.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'onboarding.css'), 'utf8');

assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
assert.match(html, /name="theme-color" content="#E5394A"/);
assert.match(html, /id="pwa-install-button"[^>]*hidden/);
assert.match(html, /src="js\/pwa-install\.js\?v=1"/);
assert.equal(manifest.name, 'RideHero');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, './');
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
assert.match(worker, /const CACHE_NAME = 'ridehero-shell-v1'/);
assert.match(worker, /request\.mode === 'navigate'[\s\S]*networkFirst/);
assert.match(worker, /css\|js\|webmanifest[\s\S]*networkFirst/, 'version-sensitive app code must update from the network before using cache');
assert.match(worker, /\/api\/[\s\S]*\/waittimes/, 'live operational endpoints must bypass the static cache');
assert.match(install, /serviceWorker\.register\('\.\/service-worker\.js'/);
assert.match(install, /beforeinstallprompt/);
assert.match(install, /appinstalled/);
assert.match(install, /Add to Home Screen/);
assert.match(css, /body\.mode-quick\{[\s\S]*--brand-blue:#e5394a/, 'Quick Route must remap the app theme to red');
assert.match(css, /body\.mode-quick \.route-hero\{background:#8f1725!important\}/, 'Quick Route route output must use the red theme');

const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');
assert.match(navigation, /parts\[0\] === 'mode'[\s\S]*classList\.remove\('mode-quick', 'mode-strategic'\)/, 'mode choice must stay neutral');
assert.match(navigation, /appState\.planningMode[\s\S]*applyGuidanceMode\(legacyGuidanceMode\(\)\)/, 'reload-safe navigation must restore the chosen app theme');

console.log('Installable PWA and Quick Route red-theme validation passed.');
