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

function createFakeSupabase(initialSession, behavior) {
  behavior = behavior || {};
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
      exchangeCodeForSession(code) {
        calls.push(['exchangeCodeForSession', code]);
        if (behavior.exchangeError) {
          return Promise.resolve({ data: { session: null, user: null }, error: behavior.exchangeError });
        }
        session = behavior.exchangeSession || session;
        return Promise.resolve({
          data: { session, user: session && session.user || null },
          error: null
        });
      },
      signInWithOtp(input) { calls.push(['email', input]); return Promise.resolve({ data: {}, error: null }); },
      signInWithOAuth(input) { calls.push(['oauth', input]); return Promise.resolve({ data: { url: 'https://provider.invalid' }, error: null }); },
      signOut(input) {
        calls.push(['signOut', input]);
        return Promise.resolve({ error: behavior.signOutError || null });
      }
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
  assert.equal(created[3].auth.detectSessionInUrl, false,
    'RideHero must explicitly exchange PKCE codes so callback errors cannot be silently discarded');

  await client.signInWithEmail('person@example.com');
  const emailCall = fake.calls.find(call => call[0] === 'email')[1];
  assert.equal(emailCall.email, 'person@example.com');
  assert.equal(emailCall.options.emailRedirectTo, 'https://ridehero-app.pages.dev/auth/callback/');
  assert.equal(emailCall.options.shouldCreateUser, true);
  assert.equal(sessionStorage.getItem(auth.RETURN_LOCATION_KEY), '/index.html?park=mk#route');

  await client.signInWithOAuth('google');
  const oauthCall = fake.calls.find(call => call[0] === 'oauth')[1];
  assert.equal(oauthCall.provider, 'google');
  assert.equal(oauthCall.options.redirectTo, 'https://ridehero-app.pages.dev/auth/callback/');
  const firstOAuthIndex = fake.calls.findIndex(call => call[0] === 'oauth');
  const oauthPreflightIndex = fake.calls.findIndex(call => call[0] === 'signOut');
  assert.ok(oauthPreflightIndex >= 0 && oauthPreflightIndex < firstOAuthIndex,
    'signed-out OAuth must clear stale local sessions before writing a fresh PKCE verifier');
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
  const signOutCalls = fake.calls.filter(call => call[0] === 'signOut');
  assert.equal(signOutCalls.length, 2, 'OAuth preflight and explicit sign-out must both remain local-only');
  signOutCalls.forEach(call => assert.deepEqual(call[1], { scope: 'local' }));
  assert.equal(client.getState().authenticated, false);

  const preflightFailureFake = createFakeSupabase(null, { signOutError: { status: 503 } });
  const preflightFailureClient = auth.createAuthClient({
    root: environment,
    config: {
      supabaseUrl: 'https://ridehero-project.supabase.co',
      publishableKey: 'sb_publishable_public_test_key',
      enabledProviders: ['google']
    },
    loadLibrary: () => Promise.resolve(preflightFailureFake.library)
  });
  await preflightFailureClient.initialize();
  await assert.rejects(() => preflightFailureClient.signInWithOAuth('google'),
    error => error.code === 'AUTH_UNAVAILABLE');
  assert.equal(preflightFailureFake.calls.some(call => call[0] === 'oauth'), false,
    'OAuth must not redirect when stale local auth state could not be cleared safely');

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
        href: 'https://ridehero-app.pages.dev/auth/callback/?code=unusable-code',
        origin: 'https://ridehero-app.pages.dev',
        pathname: '/auth/callback/', search: '?code=unusable-code', hash: ''
      },
      history: { state: null, replaceState(state, title, target) { unconfiguredCallbackHistory.push(target); } },
      sessionStorage: createSessionStorage()
    },
    config: { supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co', publishableKey: 'sb_publishable_REPLACE_ME' },
    loadLibrary: () => { throw new Error('must not load'); }
  });
  await assert.rejects(() => unconfiguredCallback.initialize(), error => error.code === 'AUTH_NOT_CONFIGURED');
  assert.deepEqual(unconfiguredCallbackHistory, ['/#/account'], 'callback parameters must be removed even when auth is not configured');

  const cancelledHistory = [];
  const cancelledFake = createFakeSupabase();
  const cancelledCallback = auth.createAuthClient({
    root: {
      location: {
        href: 'https://ridehero-app.pages.dev/auth/callback/?error=access_denied&error_description=cancelled',
        origin: 'https://ridehero-app.pages.dev',
        pathname: '/auth/callback/',
        search: '?error=access_denied&error_description=cancelled',
        hash: ''
      },
      history: { state: null, replaceState(state, title, target) { cancelledHistory.push(target); } },
      sessionStorage: createSessionStorage()
    },
    config: { supabaseUrl: 'https://ridehero-project.supabase.co', publishableKey: 'sb_publishable_public_test_key' },
    loadLibrary: () => Promise.resolve(cancelledFake.library)
  });
  const cancelledState = await cancelledCallback.initialize();
  assert.equal(cancelledState.status, 'signed_out');
  assert.equal(cancelledState.authenticated, false);
  assert.equal(cancelledState.errorCode, 'AUTH_CANCELLED',
    'provider cancellation must remain available to the Account UI after callback cleanup');
  assert.deepEqual(cancelledHistory, ['/#/account'], 'cancelled callbacks must clean provider parameters');
  assert.equal(cancelledFake.calls.some(call => call[0] === 'exchangeCodeForSession'), false,
    'provider errors must not attempt a PKCE exchange');
  cancelledFake.emit('INITIAL_SESSION', null);
  await Promise.resolve();
  assert.equal(cancelledCallback.getState().errorCode, 'AUTH_CANCELLED',
    'a delayed empty INITIAL_SESSION event must not erase a callback cancellation');

  const signedInHistory = [];
  const exchangedSession = {
    access_token: 'browser-session-token',
    refresh_token: 'browser-refresh-token',
    user: { id: 'u2', email: 'signed@example.com', user_metadata: {} }
  };
  const signedInFake = createFakeSupabase(null, {
    exchangeSession: exchangedSession
  });
  const signedInCallback = auth.createAuthClient({
    root: {
      location: {
        href: 'https://ridehero-app.pages.dev/auth/callback/?code=pkce-code',
        origin: 'https://ridehero-app.pages.dev',
        pathname: '/auth/callback/', search: '?code=pkce-code', hash: ''
      },
      history: { state: null, replaceState(state, title, target) { signedInHistory.push(target); } },
      sessionStorage: createSessionStorage()
    },
    config: { supabaseUrl: 'https://ridehero-project.supabase.co', publishableKey: 'sb_publishable_public_test_key' },
    loadLibrary: () => Promise.resolve(signedInFake.library)
  });
  const signedInState = await signedInCallback.initialize();
  assert.deepEqual(
    signedInFake.calls.filter(call => call[0] === 'exchangeCodeForSession'),
    [['exchangeCodeForSession', 'pkce-code']],
    'a callback code must be exchanged exactly once'
  );
  assert.equal(signedInState.status, 'signed_in');
  assert.equal(signedInState.authenticated, true,
    'a callback must become authenticated from the exchange result, without a preloaded session');
  assert.equal(signedInState.user.id, 'u2');
  assert.equal(signedInState.profileComplete, false);
  assert.deepEqual(signedInHistory, ['/#/account'], 'successful callbacks without a saved route must land on Account with callback data removed');

  const failedExchangeHistory = [];
  const failedExchangeFake = createFakeSupabase(null, {
    exchangeError: {
      name: 'AuthPKCECodeVerifierMissingError',
      code: 'pkce_code_verifier_not_found',
      status: 400,
      message: 'PKCE verifier was unavailable'
    }
  });
  const failedExchangeCallback = auth.createAuthClient({
    root: {
      location: {
        href: 'https://ridehero-app.pages.dev/auth/callback/?code=bad-pkce-code',
        origin: 'https://ridehero-app.pages.dev',
        pathname: '/auth/callback/', search: '?code=bad-pkce-code', hash: ''
      },
      history: { state: null, replaceState(state, title, target) { failedExchangeHistory.push(target); } },
      sessionStorage: createSessionStorage()
    },
    config: { supabaseUrl: 'https://ridehero-project.supabase.co', publishableKey: 'sb_publishable_public_test_key' },
    loadLibrary: () => Promise.resolve(failedExchangeFake.library)
  });
  const failedExchangeState = await failedExchangeCallback.initialize();
  assert.equal(failedExchangeState.status, 'signed_out');
  assert.equal(failedExchangeState.authenticated, false);
  assert.equal(failedExchangeState.errorCode, 'AUTH_BROWSER_CHANGED',
    'a missing PKCE verifier must explain that sign-in changed browser contexts');
  assert.deepEqual(failedExchangeHistory, ['/#/account'],
    'failed exchanges must remove the unusable authorization code from history');
  failedExchangeFake.emit('INITIAL_SESSION', null);
  await Promise.resolve();
  assert.equal(failedExchangeCallback.getState().errorCode, 'AUTH_BROWSER_CHANGED',
    'a delayed empty INITIAL_SESSION event must not erase a failed exchange result');

  const legacyCodeHistory = [];
  const legacyCodeFake = createFakeSupabase(null, { exchangeSession: exchangedSession });
  const legacyCodeCallback = auth.createAuthClient({
    root: {
      location: {
        href: 'https://ridehero-app.pages.dev/?code=legacy-hosting-code',
        origin: 'https://ridehero-app.pages.dev',
        pathname: '/', search: '?code=legacy-hosting-code', hash: ''
      },
      history: { state: null, replaceState(state, title, target) { legacyCodeHistory.push(target); } },
      sessionStorage: createSessionStorage()
    },
    config: { supabaseUrl: 'https://ridehero-project.supabase.co', publishableKey: 'sb_publishable_public_test_key' },
    loadLibrary: () => Promise.resolve(legacyCodeFake.library)
  });
  const legacyCodeState = await legacyCodeCallback.initialize();
  assert.equal(legacyCodeState.authenticated, true);
  assert.deepEqual(legacyCodeFake.calls.filter(call => call[0] === 'exchangeCodeForSession'),
    [['exchangeCodeForSession', 'legacy-hosting-code']]);
  assert.deepEqual(legacyCodeHistory, ['/#/account'],
    'legacy root callbacks must exchange and clean authorization codes left by the former hosting redirect');

  const legacyErrorHistory = [];
  const legacyErrorFake = createFakeSupabase();
  const legacyErrorCallback = auth.createAuthClient({
    root: {
      location: {
        href: 'https://ridehero-app.pages.dev/?error=access_denied&error_description=cancelled',
        origin: 'https://ridehero-app.pages.dev',
        pathname: '/', search: '?error=access_denied&error_description=cancelled', hash: ''
      },
      history: { state: null, replaceState(state, title, target) { legacyErrorHistory.push(target); } },
      sessionStorage: createSessionStorage()
    },
    config: { supabaseUrl: 'https://ridehero-project.supabase.co', publishableKey: 'sb_publishable_public_test_key' },
    loadLibrary: () => Promise.resolve(legacyErrorFake.library)
  });
  const legacyErrorState = await legacyErrorCallback.initialize();
  assert.equal(legacyErrorState.status, 'signed_out');
  assert.equal(legacyErrorState.errorCode, 'AUTH_CANCELLED');
  assert.deepEqual(legacyErrorHistory, ['/#/account'],
    'legacy root provider errors must be surfaced and removed from history');

  console.log('Supabase auth adapter configuration, explicit PKCE callbacks, session, profile, and safety contracts passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
