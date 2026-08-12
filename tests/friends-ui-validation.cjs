'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'js', 'friends-ui.js'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js', 'friends-store.js'), 'utf8');
const account = fs.readFileSync(path.join(root, 'js', 'account-friends.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'friends.css'), 'utf8');

assert.match(ui, /createElement\(tagName\)/, 'friends UI must build a native DOM surface');
assert.match(ui, /element\('dialog', 'friends-dialog'\)/, 'friends must use a native dialog');
assert.match(ui, /showModal/, 'friends dialog must use modal focus behavior');
assert.match(ui, /aria-labelledby/);
assert.match(ui, /aria-describedby/);
assert.match(ui, /setAttribute\('role', 'status'\)/);
assert.match(ui, /setAttribute\('aria-live', 'polite'\)/);
assert.match(ui, /input\.focus\(\{ preventScroll: true \}\)/, 'focus must move into the dialog');
assert.doesNotMatch(ui, /innerHTML|outerHTML|insertAdjacentHTML/, 'server and local names must never use HTML injection APIs');
assert.match(ui, /textContent = String\(text\)/, 'all dynamic text must use textContent');
assert.doesNotMatch(ui, /setAttribute\('aria-label',[^\n]*(?:row\.displayName|row\.handle)/,
  'server-provided names must not be interpolated into attributes');

assert.match(ui, /!authState\.configured \|\| !authState\.authenticated \|\| !authState\.profileComplete/,
  'signed-out, unconfigured, and incomplete-profile users must route to account setup');
assert.match(ui, /RideHeroAuthUI\.open\(\)/, 'Friends must open account sign-in/profile setup when required');
assert.match(ui, /RideHeroAccountFriends/, 'profile-complete accounts must use account-backed friends');
assert.match(ui, /account\.load\(\)/, 'opening Friends must refresh participant-scoped server state');

assert.match(ui, /Exact RideHero handle/);
assert.match(ui, /input\.pattern = '\[a-z\]\[a-z0-9_\]\{2,23\}'/,
  'exact-handle input must align to the public handle contract');
assert.match(ui, /account\.sendRequest\(requestedHandle\)/, 'exact handle must be submitted through the narrow adapter');
assert.match(ui, /Request processed\./, 'request feedback must remain generic to resist enumeration');
assert.doesNotMatch(ui, /request sent|user not found|no account found/i,
  'the UI must not reveal exact-handle lookup outcomes');

assert.match(ui, /row\.state === 'incoming_request'/);
assert.match(ui, /account\.acceptRequest\(row\.relationshipId\)/);
assert.match(ui, /account\.declineRequest\(row\.relationshipId\)/);
assert.match(ui, /row\.state === 'outgoing_request'/);
assert.match(ui, /friends-state-pill', 'Pending'/);
assert.match(ui, /row\.state === 'friend'/);
assert.match(ui, /account\.removeFriend\(row\.userId\)/);

assert.match(ui, /Saved on this device/);
assert.match(ui, /older local labels, not RideHero accounts/i);
assert.match(ui, /not uploaded, matched, or converted into friends/i);
assert.doesNotMatch(ui, /store\.addFriend|FriendsStore\.addFriend/,
  'legacy device-only names must be read-only and never auto-migrated');
assert.match(ui, /store\.removeFriend\(displayName\)/,
  'users must retain control to remove legacy local names');

assert.match(ui, /loader\.openRouteShare\(\);/,
  'Share Route must delegate without a friend identity payload');
assert.match(ui, /Account and legacy friend identities never enter the share payload/);
assert.match(ui, /share\.disabled = !routeAvailable/,
  'global Share Route must require a real active route');
assert.match(ui, /send\.disabled = !routeAvailable/,
  'friend-level Share Route must require a real active route');
assert.match(ui, /RideHeroGrowthBridge\.hasActiveRoute/,
  'Friends sharing must use only the active route');
assert.doesNotMatch(ui, /openRouteShare\([^)]*(row|displayName|handle|userId|relationshipId)/,
  'friend identity must not enter sharing');
assert.doesNotMatch(ui, /RideHeroGrowthAnalytics|track(?:Event)?\(|posthog\.|gtag\(/i,
  'Friends UI must not emit friend identity to analytics');

assert.match(ui, /safeFriendsMessage\(error\)/, 'server failures must use a safe error mapper');
assert.doesNotMatch(ui, /error\s*&&\s*error\.message|error\.message/,
  'raw server error messages must not be rendered');
assert.match(ui, /aria-haspopup/, 'Friends launchers must expose dialog behavior');

assert.match(store, /MAX_FRIENDS = 40/);
assert.match(store, /CONTACT_DATA_NOT_ALLOWED/);
assert.doesNotMatch(store, /fetch\(|XMLHttpRequest|WebSocket|indexedDB/,
  'legacy friend labels must remain in the local storage module');

assert.match(account, /rpc\('list_friend_state'/);
assert.match(account, /mutate\('send_friend_request'/);
assert.doesNotMatch(account, /localStorage|sessionStorage/,
  'account-backed friendships must not be shadow-persisted in browser storage');

assert.match(css, /\.friends-trigger[\s\S]*min-width:\s*44px[\s\S]*height:\s*44px/);
assert.match(css, /\.friends-close,[\s\S]*min-height:\s*44px/);
assert.match(css, /\.friends-share-action[\s\S]*min-height:\s*48px/);
assert.match(css, /\.friends-legacy-section/);
assert.match(css, /\.friends-state-pill/);
assert.match(css, /\.friends-accept/);
assert.match(css, /focus-visible/);
assert.match(css, /@media\s*\(max-width:\s*350px\)/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

console.log('friends UI account routing, privacy, legacy separation, accessibility, and responsive contracts passed.');
