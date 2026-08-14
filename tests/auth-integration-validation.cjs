'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const client = read('js/auth-client.js');
const ui = read('js/auth-ui.js');
const css = read('css/auth.css');
const config = read('js/supabase-config.js');
const html = read('index.html');
const navigation = read('js/navigation.js');
const friendsStore = read('js/friends-store.js');
const friendsUi = read('js/friends-ui.js');
const worker = read('service-worker.js');
const headers = read('_headers');
const redirects = read('_redirects');
const combinedBrowserAuth = [client, ui, config].join('\n');

// Browser configuration may expose only Supabase's public project URL and
// publishable/anon key. Administrative and OAuth-provider secrets are never
// valid browser configuration.
assert.doesNotMatch(combinedBrowserAuth, /(?:SUPABASE_)?SERVICE_ROLE(?:_KEY)?\s*[:=]/i, 'browser auth code must never configure a service-role key');
assert.doesNotMatch(combinedBrowserAuth, /sb_secret_/i, 'browser auth code must never contain a Supabase secret key');
assert.doesNotMatch(combinedBrowserAuth, /(google|facebook)[_-]?(client[_-]?secret|app[_-]?secret)/i, 'OAuth provider secrets must remain dashboard-only');
assert.doesNotMatch(combinedBrowserAuth, /provider_(?:refresh_)?token/i, 'RideHero must not collect or persist OAuth provider tokens');
assert.match(config, /(publishable|anon)/i, 'configuration must identify the browser-safe key type');

// RideHero is a hash-routed SPA. PKCE prevents auth tokens from colliding with
// application hashes, and the callback must be a fixed same-origin path.
assert.match(client, /flowType\s*:\s*['"]pkce['"]/i, 'Supabase Auth must use PKCE');
assert.match(client, /detectSessionInUrl\s*:\s*false/i,
  'RideHero must own PKCE callback processing so provider errors remain visible');
assert.match(client, /exchangeCodeForSession\s*\(/,
  'RideHero must explicitly exchange callback authorization codes');
assert.match(client, /\/auth\/callback\//, 'auth must return through the canonical trailing-slash callback path');
assert.doesNotMatch(client, /[?&](?:next|redirect(?:_?to)?)=/i, 'auth code must not trust a query-controlled post-auth redirect');
assert.match(client, /(?:history\.replaceState|replaceState\s*\()/, 'the one-time auth code must be removed from browser history after exchange');
assert.match(client, /AUTH_CANCELLED/, 'provider cancellation must have a stable public error code');
assert.match(ui, /state\.errorCode[\s\S]{0,240}(?:status\.textContent|announce)|(?:status\.textContent|announce)[\s\S]{0,240}state\.errorCode/,
  'callback errors stored in auth state must be announced on the Account page');
assert.match(client, /(?:sessionStorage|returnHash|returnRoute)/i, 'auth may retain a short-lived local return route');
assert.match(client, /location\.origin|sameOrigin|URL\s*\(/i, 'callback construction must be anchored to the current origin');
assert.match(client, /origin\s*!==\s*resolved\.origin|resolved\.origin\s*!==\s*[^\n]*origin/, 'post-auth navigation must reject a different origin');
assert.match(client, /indexOf\(['"]\/\/['"]\)\s*===\s*0|startsWith\(['"]\/\/['"]\)/, 'post-auth navigation must reject protocol-relative redirects');

// The public surface is intentionally limited to the three approved options.
assert.match(client + ui, /signInWithOtp/, 'email magic-link/OTP sign-in must be implemented');
assert.match(client + ui, /signInWithOAuth/, 'social sign-in must use the Supabase OAuth API');
assert.match(client + ui, /['"]google['"]/, 'Google must be an approved provider');
assert.match(client + ui, /['"]facebook['"]/, 'Facebook must be an approved provider');
assert.doesNotMatch(client + ui, /provider\s*:\s*(?:input|value|event|dataset|searchParams)/i, 'OAuth provider names must not come directly from user-controlled input');
['github', 'twitter', 'discord', 'spotify', 'linkedin', 'apple', 'azure'].forEach((provider) => {
  assert.doesNotMatch(client + ui, new RegExp("['\"]" + provider + "['\"]", 'i'), 'unapproved auth provider exposed: ' + provider);
});

// Email/account strings and profile data must be rendered with DOM text, not
// interpreted as markup, and status updates must be announced accessibly.
assert.match(ui, /createElement/, 'auth UI must use native DOM elements');
assert.doesNotMatch(ui, /innerHTML|outerHTML|insertAdjacentHTML/, 'account data must never render through HTML injection APIs');
assert.match(ui, /type\s*=\s*['"]email['"]|setAttribute\(['"]type['"]\s*,\s*['"]email['"]\)/, 'email input must use its semantic input type');
assert.match(ui, /autocomplete\s*=\s*['"]email['"]|setAttribute\(['"]autocomplete['"]\s*,\s*['"]email['"]\)/, 'email input must expose autocomplete semantics');
assert.match(ui, /aria-live|role['"]?\s*,?\s*['"]status/i, 'auth success and error messages must be announced');
assert.match(ui, /focus\s*\(/, 'focus must move into the sign-in surface');
assert.match(ui, /signOut/, 'signed-in users must be able to sign out');
assert.match(ui, /Continue as guest/, 'signed-out users must be able to keep planning without an account');
assert.match(navigation, /GUEST_SESSION_KEY\s*=\s*['"]ridehero\.auth\.guest\.v1['"]/,
  'the guest bypass must be limited to the current browser session');
assert.match(navigation, /else\s*\{\s*entryAccountActive\s*=\s*true;\s*go\(\['account'\],\s*true\);\s*\}/,
  'the Account page must be the first fresh route beneath the coaster intro');
assert.match(navigation, /initializeEntryAuth\(\)/,
  'fresh entry must check whether a returning user is already authenticated');
assert.match(navigation, /if \(!state\.profileComplete\) return;/,
  'a successful first OAuth sign-in must remain on Account so profile setup is visibly completed');
assert.match(navigation, /previousAccountRoot[\s\S]{0,240}__rideHeroAuthCleanup/,
  'Account rerenders must unsubscribe the previous auth surface before replacing it');
assert.doesNotMatch(navigation, /localStorage[\s\S]{0,160}ridehero\.auth\.guest/,
  'guest continuation must never become a persistent authentication bypass');

// Existing device-only names are ambiguous labels, not verified accounts.
// They must remain local unless the user deliberately acts on them.
assert.match(friendsStore, /ridehero\.friends\.v1/, 'legacy device-only friend storage must remain available');
assert.doesNotMatch(client, /RideHeroFriendsStore\.(?:listFriends|clearFriends)|ridehero\.friends\.v1/, 'auth initialization must not auto-upload or erase local friend labels');
assert.doesNotMatch(friendsUi, /(?:upsert|insert|rpc)\([^\n]*(?:listFriends|ridehero\.friends\.v1)/i, 'legacy names must not be silently sent to Supabase');
assert.match(friendsUi + ui, /sign[ -]?in/i, 'Friends must clearly explain that an account is required for account-backed friends');
assert.match(friendsUi, /RideHeroAuth/, 'the Friends surface must inspect the authenticated account state');
assert.match(friendsUi, /RideHeroAccountFriends/, 'the Friends surface must use the account-backed friend adapter after sign-in');
assert.match(friendsUi, /(?:device|local)[ -]only|saved on this device/i, 'legacy friend labels must remain visibly separate from verified account friends');

// Both static screens and the dynamic catalog shell need an account-aware
// Friends entry point. Navigation must gate through the auth UI/service rather
// than assuming a session exists.
assert.match(navigation, /friends-trigger catalog-friends-trigger/, 'dynamic navigation must keep the Friends shortcut');
assert.match(friendsUi, /(?:RideHeroAuthUI|#\/account|openRideHeroAuth)/, 'signed-out Friends navigation must lead to the account/sign-in experience');
assert.match(html, /js\/auth-client\.js[^>]*[\s\S]*js\/auth-ui\.js/, 'auth client must load before auth UI');
assert.match(html, /css\/auth\.css/, 'the sign-in page stylesheet must be loaded');
assert.match(html, /RideHeroAuth\.initialize\(\)[\s\S]{0,500}RideHeroMultiResort[\s\S]{0,200}render\(/,
  'after callback processing, navigation must render the restored hash because history.replaceState does not emit hashchange');
assert.match(html, /rideHeroHasAuthQuery[\s\S]{0,300}location\.pathname[\s\S]{0,300}RideHeroAuth\.initialize/,
  'the app bootstrap must recover legacy auth query parameters redirected to the production root');

// OAuth callbacks contain a short-lived authorization code. Neither the
// service worker nor edge caches may retain that request URL or response.
assert.match(redirects, /^\/auth\/callback\/\s+\/index\.html\s+200/m,
  'Cloudflare must serve the SPA directly for the canonical callback path without a normalization redirect');
assert.match(redirects, /^\/auth\/callback\s+\/auth\/callback\/\s+302/m,
  'the former callback path must temporarily redirect to the canonical trailing-slash path');
assert.ok(redirects.indexOf('/auth/callback /auth/callback/ 302') < redirects.indexOf('/auth/callback/ /index.html 200'),
  'the legacy callback redirect must be evaluated before the canonical SPA rewrite');
assert.match(headers, /\/auth\/\*[\s\S]*Cache-Control:\s*[^\r\n]*no-store/i, 'auth paths must be no-store at the edge');
assert.match(headers, /\/auth\/\*[\s\S]*X-Robots-Tag:\s*noindex[^\r\n]*/i, 'auth paths must never be indexed');
assert.match(headers, /\/auth\/\*[\s\S]*Referrer-Policy:\s*no-referrer/i, 'auth codes must not leak through referrers');
assert.match(worker, /\/auth\/callback|pathname[^\n]*\/auth\//i, 'the service worker must identify auth callback requests');
assert.match(worker, /(?:code|access_token|refresh_token)[\s\S]{0,300}searchParams|searchParams[\s\S]{0,300}(?:code|access_token|refresh_token)/i, 'the service worker must recognize sensitive auth query parameters');
assert.match(worker, /headers\.has\(['"]authorization['"]\)|headers\.get\(['"]authorization['"]\)/i, 'authenticated requests must bypass static caching');
const authBypassIndex = worker.search(/\/auth\/callback|pathname[^\n]*\/auth\//i);
const navigationCacheOffset = authBypassIndex >= 0
  ? worker.slice(authBypassIndex).search(/request\.mode\s*===\s*['"]navigate['"]/i)
  : -1;
const navigationCacheIndex = navigationCacheOffset < 0 ? -1 : authBypassIndex + navigationCacheOffset;
assert.ok(authBypassIndex >= 0 && navigationCacheIndex >= 0 && authBypassIndex < navigationCacheIndex, 'auth cache bypass must run before navigation caching');

// The sign-in page must remain usable on RideHero's smallest supported width.
assert.match(css, /min-height\s*:\s*(?:44|4[8-9]|5\d)px/, 'auth controls must meet the minimum touch target');
assert.match(css, /focus-visible/, 'auth controls must have visible keyboard focus');
assert.match(css, /@media\s*\(max-width\s*:\s*(?:320|350|360|430|600)px\)/, 'auth layout must include a phone-width contract');
assert.match(css, /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/, 'auth transitions must respect reduced motion');
assert.doesNotMatch(css, /min-width\s*:\s*[4-9]\d\dpx/, 'auth surfaces must not force mobile horizontal overflow');

console.log('Supabase auth integration, callback security, privacy, accessibility, and cache contracts passed.');
