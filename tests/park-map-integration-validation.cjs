const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const map = fs.readFileSync(path.join(root, 'js', 'park-map.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

assert.match(html, /css\/park-map\.css\?v=2/);
assert.match(html, /js\/park-map\.js\?v=2/);
assert.match(html, /RideHeroParkMap\.mount\(host,[\s\S]*park:catalogPark[\s\S]*stops:routeStops/, 'every selected catalog park must mount through the same live-map adapter');
assert.match(html, /highlightRideId:currentMode === 'quick'[\s\S]*stopKey\(rollingQueue\[0\]\)/, 'Quick Route should identify its real next stop on the live map');
assert.match(map, /String\(ride\.id \|\| ''\) === highlightRideId[\s\S]*classList\.add\('is-next'\)/, 'the reference star pin must decorate only the actual sourced next-ride marker');
assert.match(html, /controller\.setCompact\(!\(mapCard && mapCard\.classList\.contains\('is-map-active'\)\)\)/, 'late map mounts must honor the current compact/expanded state');
assert.doesNotMatch(html, /if \(catalogPark && !\(window\.RideHeroRouteEngine[\s\S]{0,250}Approximate proximity mode/, 'approximate parks must no longer be blocked from the truthful live basemap');
assert.match(html, /onRequestLocation:requestParkMapLocation/, 'location permission must remain an explicit map action when Quick Mode has not already requested it');
assert.match(html, /routeLivePosition = \{[\s\S]*updateLiveMapPosition\(position\.latitude/, 'accepted shared-service fixes must update both route proximity and the visible map dot');
assert.doesNotMatch(html, /navigator\.geolocation/, 'route and map UI must use the centralized location service rather than owning GPS calls');
assert.match(html, /id !== 'route'\) destroyActiveParkMap\(\)/, 'the map and its owned watcher must stop when the route screen closes');
assert.match(map, /route\.schemaVersion === 1[\s\S]*route\.quality === 'verified'[\s\S]*route\.sourceName[\s\S]*route\.sourceUrl[\s\S]*route\.stopCoverageComplete === true/, 'a walking line must require complete, versioned, verified, sourced geographic path data');
assert.match(html, /mapRenderGeneration/, 'stale async location and map work must be invalidated after teardown');
assert.match(html, /renderIllustratedMap\(\)[\s\S]*destroyActiveParkMap/, 'switching to the illustrated map must stop the map-owned live watcher');
assert.doesNotMatch(map, /localStorage|sessionStorage/, 'live GPS must stay in memory and never be persisted');
assert.doesNotMatch(worker, /tile\.openstreetmap\.org/, 'map tiles must never be prefetched into the app shell');
assert.doesNotMatch(html, /http-equiv="(?:Cache-Control|Pragma|Expires)"/i, 'the app shell must not request no-cache behavior that conflicts with map tile caching');
assert.match(worker, /\.\/js\/park-map\.js\?v=2/);
assert.match(worker, /\.\/css\/park-map\.css\?v=2/);

console.log('All-park live map integration and privacy contracts passed.');
