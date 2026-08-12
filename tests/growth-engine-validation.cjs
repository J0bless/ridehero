const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'js', 'growth-loader.js'), 'utf8');
const growth = fs.readFileSync(path.join(root, 'js', 'growth-engine.js'), 'utf8');
const session = fs.readFileSync(path.join(root, 'js', 'route-session.js'), 'utf8');
const shareModel = fs.readFileSync(path.join(root, 'js', 'share-model.js'), 'utf8');
const shareActions = fs.readFileSync(path.join(root, 'js', 'share-actions.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'growth-engine.css'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const redirects = fs.readFileSync(path.join(root, '_redirects'), 'utf8');
const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');

assert.match(html, /id="route-share-top"[^>]*onclick="openRouteShare\(\)"[^>]*hidden/, 'active routes need one top Share action');
assert.match(html, /id="route-growth-actions"[^>]*hidden[\s\S]*Share Route[\s\S]*End Route/, 'route summary needs focused Share and End actions');
assert.match(html, /id="screen-shared-route"[\s\S]*id="screen-day-summary"/, 'shared landing and Day Summary screens must exist');
assert.match(html, /id="growth-live-status"[^>]*role="status"[^>]*aria-live="polite"/, 'copy/share confirmation must be announced accessibly');

const renderBrands = navigation.match(/function renderBrands\(\) \{([\s\S]*?)\n  \}/);
assert.ok(renderBrands, 'renderBrands must remain present');
assert.doesNotMatch(renderBrands[1], /healthCard|catalog-health|Park data health/i, 'consumer destination screens must not expose Park Data Health');
assert.match(navigation, /function renderDataHealth\(\)/, 'the internal data-quality route must remain available for debugging');

assert.match(loader, /loadScript\('js\/share-model\.js'/);
assert.match(loader, /loadScript\('js\/growth-analytics\.js'/);
assert.match(loader, /loadScript\('js\/share-actions\.js'/);
assert.match(loader, /loadScript\('js\/growth-engine\.js'/);
assert.doesNotMatch(html, /<script src="js\/growth-engine\.js/, 'the full growth engine must not load during ordinary planning');
assert.doesNotMatch(worker, /\.\/js\/growth-engine\.js/, 'the full growth engine must not be app-shell precached');
assert.doesNotMatch(worker, /\.\/js\/share-model\.js/, 'share serialization must remain lazy');

assert.match(shareModel, /SHARE_SCHEMA_VERSION = 1/);
assert.match(shareModel, /crypto\.randomUUID|crypto\.getRandomValues/);
assert.match(shareModel, /GROUP_ROUTE_V1[\s\S]*importMode: 'local-copy'[\s\S]*realTimeSync: false/);
assert.match(growth, /confirmReplace\(\)/, 'joining over an active route must require explicit confirmation');
assert.match(growth, /Original Plan/);
assert.match(growth, /Current live status is shown separately and never changes the saved order/);
assert.match(html, /payload\.planningMode === 'quick'[\s\S]*classifyExperience\(staticRide\) !== 'ride'/, 'crafted Quick shares must not import attractions');

assert.match(session, /postedWaitMinutes/);
assert.doesNotMatch(session, /scoredWait|\b90\b/, 'Day Summary waits must never reuse synthetic optimizer wait scores');
assert.match(session, /allDistancesKnown/);
assert.match(growth, /summary\.walkingMetres != null/, 'walking should render only when the session supplies trustworthy metres');
assert.doesNotMatch(growth, /time saved|money saved|wait avoided/i, 'unsupported growth claims must never be shown');

assert.match(html, /property="og:title"/);
assert.match(html, /property="og:description"/);
assert.match(html, /property="og:image"/);
assert.match(html, /name="twitter:card" content="summary_large_image"/);
assert.match(growth, /noindex, follow/);
assert.match(growth, /global\.RideHeroSeo/);
assert.match(redirects, /^\/r\/\* \/index\.html 200/m, 'direct shared-route paths need the SPA landing fallback');
assert.match(headers, /\/r\/\*[\s\S]*X-Robots-Tag: noindex, follow/, 'personal shared routes must be blocked from indexing at the edge');

assert.match(growth, /RideHeroShareActions/);
assert.match(growth, /shareActions\.share/);
assert.match(shareActions, /navigatorApi\.share/);
assert.match(growth, /navigator\.clipboard/);
assert.match(growth, /canvas\.toBlob/);
assert.match(growth, /download = 'ridehero-'[\s\S]*source\.parkId[\s\S]*\.png'/, 'share cards must support an explicit image download');
assert.match(growth, /textContent = String\(text\)/, 'shared display text must render through textContent');
assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
assert.match(css, /@media\s*\(max-width:\s*350px\)/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
assert.match(css, /focus-visible/);
assert.match(growth, /RideHero Active Route/, 'active route sharing must never claim that the day is complete');
assert.match(growth, /growth-dialog-status[\s\S]*role[\s\S]*status[\s\S]*aria-live/, 'dialog copy confirmations need a modal-local live region');

console.log('Growth engine, sharing, SEO, privacy, responsive, and lazy-loading contracts passed.');
