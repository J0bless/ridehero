'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const auth = require(path.join(__dirname, '..', 'js', 'auth-client.js'));

assert.equal(auth.SUPABASE_VERSION, '2.112.3', 'Supabase must be pinned to an exact reviewed version');
assert.equal(auth.SUPABASE_SCRIPT_URL, 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.min.js');
assert.equal(auth.SUPABASE_SCRIPT_INTEGRITY, 'sha384-l8ah+VgaWtk1mvOe9VC+OirC6qHFF4yH7l7mKRidV9MSti3E9F463bMp6ZVN4kuC');
assert.equal(auth.normalizeEmail(' Person@Example.COM '), 'person@example.com');
assert.equal(auth.normalizeHandle('@Ride_Hero'), 'ride_hero');
assert.equal(auth.normalizeDisplayName('  Eric   Rider  '), 'Eric Rider');
assert.throws(() => auth.normalizeEmail('not-an-email'), error => error.code === 'EMAIL_INVALID');
assert.throws(() => auth.normalizeHandle('<script>'), error => error.code === 'HANDLE_INVALID');

function createSessionStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function createFakeSupabase(initialSession) {
  const calls = [];
  let observer = null;
  let session = initialSession || null;
  const client = {
    auth: {
      onAuthStateChange(callback) {
        observer = callback;
        return { data: { subscription: { unsubscribe() { observer = null; } } } };
      },
      getSession() { calls.push(['getSession']); return Promise.resolve({ data: { session }, error: null }); },
      signInWithOtp(input) { calls.push(['email', input]); return Promise.resolve({ data: {}, error: null }); },
      signInWithOAuth(input) { calls.push(['oauth', input]); return Promise.resolve({ data: { url: 'https://provider.invalid' }, error: null }); },
      signOut(input) { calls.push(['signOut', input]); return Promise.resolve({ error: null }); }
    },
    rpc(name, parameters) {
      calls.push(['rpc', name, parameters]);
      if (name === 'complete_profile') {
        return Promise.resolve({ data: [{ user_id: 'u1', handle: parameters.handle, display_name: parameters.display_name }], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    },
    functions: {
      invoke(name, input) { calls.push(['function', name, input]); return Promise.resolve({ data: {}, error: null }); }
    }
  };
  return {
    calls,
    library: { createClient(url, key, options) { calls.push(['createClient', url, key, options]); return client; } },
    emit(event, nextSession) { session = nextSession; if (observer) observer(event, nextSession); }
  };
}

(async function run() {
  const fake = createFakeSupabase();
  const sessionStorage = createSessionStorage();
  const historyCalls = [];
  const environment = {
    location: {
      href: 'https://ridehero-app.pages.dev/index.html?park=mk#route',
      origin: 'https://ridehero-app.pages.dev',
      pathname: '/index.html',
      search: '?park=mk',
      hash: '#route'
    },
    history: {
      state: null,
      replaceState(state, title, target) { historyCalls.push(target); }
    },
    sessionStorage
  };
  const client = auth.createAuthClient({
    root: environment,
    config: {
      supabaseUrl: 'https://ridehero-project.supabase.co',
      publishableKey: 'sb_publishable_public_test_key',
      emailEnabled: true,
      enabledProviders: ['google', 'facebook'],
      profileCompleteRpc: 'complete_profile',
      deleteAccountFunction: ''
    },
    loadLibrary: () => Promise.resolve(fake.library)
  });

  const initial = await client.initialize();
  assert.equal(initial.status, 'signed_out');
  const created = fake.calls.find(call => call[0] === 'createClient');
  assert.equal(created[1], 'https://ridehero-project.supabase.co');
  assert.equal(created[3].auth.flowType, 'pkce');
  assert.equal(created[3].auth.persistSession, true);

  await client.signInWithEmail('person@example.com');
  const emailCall = fake.calls.find(call => call[0] === 'email')[1];
  assert.equal(emailCall.email, 'person@example.com');
  assert.equal(emailCall.options.emailRedirectTo, 'https://ridehero-app.pages.dev/auth/callback');
  assert.equal(emailCall.options.shouldCreateUser, true);
  assert.equal(sessionStorage.getItem(auth.RETURN_LOCATION_KEY), '/index.html?park=mk#route');

  await client.signInWithOAuth('google');
  const oauthCall = fake.calls.find(call => call[0] === 'oauth')[1];
  assert.equal(oauthCall.provider, 'google');
  assert.equal(oauthCall.options.redirectTo, 'https://ridehero-app.pages.dev/auth/callback');
  assert.throws(() => client.signInWithOAuth('github'), error => error.code === 'AUTH_UNAVAILABLE');

  fake.emit('SIGNED_IN', {
    user: {
      id: 'u1',
      email: 'person@example.com',
      email_confirmed_at: '2026-08-12T00:00:00Z',
      user_metadata: { handle: 'untrusted', display_name: 'Eric Rider' }
    }
  });
  assert.equal(client.getState().authenticated, true);
  assert.equal(client.getState().profileComplete, false, 'editable OAuth metadata cannot complete a RideHero profile');
  assert.equal(client.getState().user.handle, '');
  assert.equal(client.getState().user.displayName, 'Eric Rider');
  assert.deepEqual(historyCalls, ['/index.html?park=mk#route'], 'the pre-auth app route must be restored without overwriting planner state');

  const profile = await client.completeProfile('eric_rider', 'Eric Rider');
  assert.equal(profile.handle, 'eric_rider');
  assert.equal(profile.displayName, 'Eric Rider');
  const profileCall = fake.calls.find(call => call[0] === 'rpc' && call[1] === 'complete_profile');
  assert.deepEqual(profileCall[2], { handle: 'eric_rider', display_name: 'Eric Rider' });
  assert.equal(client.getState().profileComplete, true);

  assert.equal(client.canRequestAccountDeletion(), false);
  await assert.rejects(() => client.requestAccountDeletion(), error => error.code === 'DELETE_UNAVAILABLE');
  assert.equal(fake.calls.some(call => call[0] === 'function'), false, 'no deletion request may be fabricated without a configured server function');

  await client.signOut();
  const signOutCall = fake.calls.find(call => call[0] === 'signOut');
  assert.deepEqual(signOutCall[1], { scope: 'local' });
  assert.equal(client.getState().authenticated, false);

  const unavailable = auth.createAuthClient({
    root: environment,
    config: { supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co', publishableKey: 'sb_publishable_REPLACE_ME' },
    loadLibrary: () => { throw new Error('must not load'); }
  });
  assert.equal(unavailable.getState().configured, false);
  await assert.rejects(() => unavailable.initialize(), error => error.code === 'AUTH_NOT_CONFIGURED');

  const unconfiguredCallbackHistory = [];
  const unconfiguredCallback = auth.createAuthClient({
    root: {
      location: {
        href: 'https://ridehero-app.pages.dev/auth/callback?code=unusable-code',
        origin: 'https://ridehero-app.pages.dev',
        pathname: '/auth/callback', search: '?code=unusable-code', hash: ''
      },
      history: { state: null, replaceState(state, title, target) { unconfiguredCallbackHistory.push(target); } },
      sessionStorage: createSessionStorage()
    },
    config: { supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co', publishableKey: 'sb_publishable_REPLACE_ME' },
    loadLibrary: () => { throw new Error('must not load'); }
  });
  await assert.rejects(() => unconfiguredCallback.initialize(), error => error.code === 'AUTH_NOT_CONFIGURED');
  assert.deepEqual(unconfiguredCallbackHistory, ['/#/account'], 'callback parameters must be removed even when auth is not configured');

  const callbackHistory = [];
  const callbackFake = createFakeSupabase();
  const callback = auth.createAuthClient({
    root: {
      location: {
        href: 'https://ridehero-app.pages.dev/auth/callback?error=access_denied&error_description=cancelled',
        origin: 'https://ridehero-app.pages.dev',
        pathname: '/auth/callback',
        search: '?error=access_denied&error_description=cancelled',
        hash: ''
      },
      history: { state: null, replaceState(state, title, target) { callbackHistory.push(target); } },
      sessionStorage: createSessionStorage()
    },
    config: { supabaseUrl: 'https://ridehero-project.supabase.co', publishableKey: 'sb_publishable_public_test_key' },
    loadLibrary: () => Promise.resolve(callbackFake.library)
  });
  await callback.initialize();
  assert.deepEqual(callbackHistory, ['/#/account'], 'failed or cancelled callbacks must clean provider parameters after session processing');

  const signedInHistory = [];
  const signedInFake = createFakeSupabase({
    user: { id: 'u2', email: 'signed@example.com', user_metadata: {} }
  });
  const signedInCallback = auth.createAuthClient({
    root: {
      location: {
        href: 'https://ridehero-app.pages.dev/auth/callback?code=pkce-code',
        origin: 'https://ridehero-app.pages.dev',
        pathname: '/auth/callback', search: '?code=pkce-code', hash: ''
      },
      history: { state: null, replaceState(state, title, target) { signedInHistory.push(target); } },
      sessionStorage: createSessionStorage()
    },
    config: { supabaseUrl: 'https://ridehero-project.supabase.co', publishableKey: 'sb_publishable_public_test_key' },
    loadLibrary: () => Promise.resolve(signedInFake.library)
  });
  await signedInCallback.initialize();
  assert.deepEqual(signedInHistory, ['/#/account'], 'successful callbacks without a saved route must land on Account with callback data removed');

  console.log('Supabase auth adapter configuration, redirect, session, profile, and safety contracts passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
