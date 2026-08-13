'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js', 'auth-client.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js', 'auth-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'auth.css'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js', 'supabase-config.js'), 'utf8');

assert.match(client, /SUPABASE_VERSION = '2\.112\.3'/);
assert.match(client, /'\/dist\/umd\/supabase\.min\.js'/);
assert.match(client, /sha384-l8ah\+VgaWtk1mvOe9VC\+OirC6qHFF4yH7l7mKRidV9MSti3E9F463bMp6ZVN4kuC/);
assert.match(client, /script\.crossOrigin = 'anonymous'/);
assert.match(client, /script\.referrerPolicy = 'no-referrer'/);
assert.match(client, /current\.origin \+ '\/auth\/callback\/'/);
assert.match(client, /detectSessionInUrl:\s*false/);
assert.match(client, /exchangeCodeForSession/);
assert.match(client, /signInWithOtp/);
assert.match(client, /signInWithOAuth/);
assert.match(client, /provider: provider/);
assert.match(client, /onAuthStateChange/);
assert.match(client, /complete_profile/);
assert.match(client, /\{ handle: handle, display_name: displayName \}/);
assert.match(client, /signOut\(\{ scope: 'local' \}\)/);
assert.doesNotMatch(client, /service[_-]?role/i, 'the auth adapter must never reference a service role key');
assert.doesNotMatch(client, /localStorage/, 'auth return routing must use session storage, not app-persistent state');

assert.match(ui, /function renderPage\(container\)/, 'auth UI must expose a full-page renderer');
assert.match(ui, /render: renderPage/, 'navigation must be able to mount the Account page');
assert.match(ui, /element\('dialog', 'auth-dialog'\)|createSurface\('dialog'\)/, 'an optional accessible modal launcher must remain available');
assert.match(ui, /Email me a sign-in link/);
assert.match(ui, /Continue with Google/);
assert.match(ui, /Continue with Facebook/);
assert.match(ui, /Continue as guest/);
assert.match(ui, /RideHeroMultiResort\.continueAsGuest/,
  'the first Account page must provide a real non-blocking path into planning');
assert.match(ui, /Finish account setup/);
assert.match(ui, /handle\.pattern = '\[a-z\]\[a-z0-9_\]\{2,23\}'/,
  'profile setup must enforce the same letter-first handle contract as the database');
assert.match(ui, /begin(?:s)? with a letter/i,
  'profile setup must explain the handle contract before submission');
assert.match(ui, /dataset\.authStatus/);
assert.match(ui, /setAttribute\('aria-live', 'polite'\)/);
assert.match(ui, /setAttribute\('aria-haspopup', 'dialog'\)/);
assert.match(ui, /title\.tabIndex = -1/);
assert.match(ui, /title\.focus/);
assert.doesNotMatch(ui, /innerHTML|outerHTML|insertAdjacentHTML/, 'account and profile text must only render through textContent');
assert.doesNotMatch(ui, /error\.message/, 'provider and session errors must not leak through the UI');
assert.match(ui, /case ['"]AUTH_CANCELLED['"][\s\S]{0,180}cancel/i,
  'a cancelled provider flow must have clear, non-technical Account-page copy');
assert.match(ui, /state\.errorCode[\s\S]{0,240}(?:status\.textContent|announce)|(?:status\.textContent|announce)[\s\S]{0,240}state\.errorCode/,
  'callback failures retained in auth state must be visible in the Account-page live region');
assert.match(ui, /canRequestAccountDeletion\(\)/, 'deletion UI must be backend-gated');

assert.match(css, /\.auth-trigger[\s\S]*min-width:\s*44px[\s\S]*height:\s*44px/);
assert.match(css, /\.auth-primary[\s\S]*min-height:\s*48px/);
assert.match(css, /\.auth-title\[tabindex="-1"\]:focus\s*\{[^{}]*outline:\s*(?:0|none)[^{}]*\}/s,
  'programmatic focus on the Account page heading must not draw a grey browser boundary');
assert.match(css, /\.auth-dialog :focus-visible[\s\S]*outline:\s*3px solid/,
  'removing the heading boundary must preserve visible keyboard focus for interactive auth controls');
assert.match(css, /@media\s*\(max-width:\s*350px\)/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

assert.match(config, /https:\/\/wiryzupgdfxftrvjvdzh\.supabase\.co/);
assert.match(config, /sb_publishable_[A-Za-z0-9_-]+/);
assert.match(config, /emailEnabled:\s*true/);
assert.match(config, /enabledProviders:\s*Object\.freeze\(\['google', 'facebook'\]\)/,
  'configured Google and Facebook providers must be available in the Account UI');
assert.match(config, /deleteAccountFunction:\s*''/);
assert.doesNotMatch(config, /clientSecret|serviceRole|service_role/i);

console.log('Auth page, sign-in choices, accessibility, safe errors, and configuration contracts passed.');
