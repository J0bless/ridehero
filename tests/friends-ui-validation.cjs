'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'js', 'friends-ui.js'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js', 'friends-store.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'friends.css'), 'utf8');

assert.match(ui, /createElement\(tagName\)/, 'friends UI must build a native DOM surface');
assert.match(ui, /element\('dialog', 'friends-dialog'\)/, 'friends must use a native dialog');
assert.match(ui, /showModal/, 'friends dialog must use modal focus behavior');
assert.match(ui, /aria-labelledby/);
assert.match(ui, /aria-describedby/);
assert.match(ui, /setAttribute\('role', 'status'\)/);
assert.match(ui, /setAttribute\('aria-live', 'polite'\)/);
assert.match(ui, /input\.focus\(\{ preventScroll: true \}\)/, 'focus must move into the dialog');
assert.doesNotMatch(ui, /innerHTML|outerHTML|insertAdjacentHTML/, 'friend names must never render through HTML injection APIs');
assert.match(ui, /element\('span', 'friends-name', displayName\)/, 'friend names must render as textContent');

assert.match(ui, /store\.addFriend\(input\.value\)/);
assert.match(ui, /store\.removeFriend\(displayName\)/);
assert.match(ui, /loader\.openRouteShare\(\);/, 'Share Route must delegate to the existing Growth Engine without a friend payload');
assert.match(ui, /share\.disabled = !routeAvailable/, 'Share Route must be unavailable until a real route exists');
assert.match(ui, /RideHeroGrowthBridge\.hasActiveRoute/, 'Friends sharing must use only the active route, not a stale completed summary');
assert.match(ui, /aria-haspopup/, 'Friends launchers must expose their dialog behavior');
assert.match(ui, /element\('button', 'friends-send', 'Share'\)/, 'each saved friend must offer a route-sharing shortcut');
assert.match(ui, /send\.disabled = !routeAvailable/, 'friend-level sharing must also require a real route');
assert.doesNotMatch(ui, /openRouteShare\([^)]*(displayName|friend)/, 'friend records must not enter a share payload');
assert.match(ui, /doesn't create friend accounts, access contacts, send invitations, or sync routes in real time/i);
assert.match(ui, /Adding a friend here does not send anything or create a live group route/i);
assert.doesNotMatch(ui, /fetch\(|XMLHttpRequest|WebSocket|navigator\.contacts/, 'Friends v1 must remain device-only without contacts or network sync');

assert.match(store, /MAX_FRIENDS = 40/);
assert.match(store, /CONTACT_DATA_NOT_ALLOWED/);
assert.doesNotMatch(store, /fetch\(|XMLHttpRequest|WebSocket|indexedDB/, 'friend names must remain in the local storage module');

assert.match(css, /\.friends-trigger[\s\S]*min-width:\s*44px[\s\S]*height:\s*44px/);
assert.match(css, /\.friends-close,[\s\S]*min-height:\s*44px/);
assert.match(css, /\.friends-share-action[\s\S]*min-height:\s*48px/);
assert.match(css, /focus-visible/);
assert.match(css, /@media\s*\(max-width:\s*350px\)/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

console.log('friends UI, privacy, accessibility, and responsive contracts passed.');
