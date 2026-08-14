(function(root, factory) {
  'use strict';

  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideHeroAuth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  var SUPABASE_VERSION = '2.112.3';
  var SUPABASE_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@' + SUPABASE_VERSION + '/dist/umd/supabase.min.js';
  var SUPABASE_SCRIPT_INTEGRITY = 'sha384-l8ah+VgaWtk1mvOe9VC+OirC6qHFF4yH7l7mKRidV9MSti3E9F463bMp6ZVN4kuC';
  var RETURN_LOCATION_KEY = 'ridehero.auth.return.v1';
  var MAX_RETURN_LOCATION_LENGTH = 2048;
  var ALLOWED_PROVIDERS = Object.freeze(['google', 'facebook']);
  var ALLOWED_ACCOUNT_RPCS = Object.freeze([
    'list_friend_state',
    'send_friend_request',
    'respond_friend_request',
    'remove_friend',
    'block_user',
    'unblock_user'
  ]);
  var AUTH_QUERY_KEYS = Object.freeze(['code', 'error', 'error_code', 'error_description']);

  function AuthClientError(code, message) {
    this.name = 'AuthClientError';
    this.code = code || 'AUTH_UNAVAILABLE';
    this.message = message || 'RideHero sign-in is temporarily unavailable.';
    if (Error.captureStackTrace) Error.captureStackTrace(this, AuthClientError);
  }
  AuthClientError.prototype = Object.create(Error.prototype);
  AuthClientError.prototype.constructor = AuthClientError;

  function publicMessage(code) {
    switch (code) {
      case 'AUTH_NOT_CONFIGURED': return 'RideHero accounts are not available in this environment yet.';
      case 'AUTH_REQUIRED': return 'Sign in to continue.';
      case 'AUTH_CANCELLED': return 'Sign-in was canceled. You can try again when you are ready.';
      case 'AUTH_BROWSER_CHANGED': return 'Sign-in could not return to the same browser. Open RideHero directly in Chrome or Safari and try again there.';
      case 'EMAIL_INVALID': return 'Enter a valid email address.';
      case 'HANDLE_INVALID': return 'Use 3–24 lowercase letters, numbers, or underscores.';
      case 'RATE_LIMITED': return 'Please wait a moment before trying again.';
      case 'PROFILE_UNAVAILABLE': return 'Your RideHero handle could not be saved right now.';
      case 'DELETE_UNAVAILABLE': return 'Account deletion is not available in this environment.';
      default: return 'We could not complete sign-in. Try again in this browser, or use email.';
    }
  }

  function authError(code) {
    return new AuthClientError(code, publicMessage(code));
  }

  function classifyServiceError(error, fallbackCode) {
    var status = Number(error && (error.status || error.statusCode));
    if (status === 429) return authError('RATE_LIMITED');
    return authError(fallbackCode || 'AUTH_UNAVAILABLE');
  }

  function classifyCallbackError(error) {
    var code = cleanString(error && error.code, 80).toLocaleLowerCase();
    var name = cleanString(error && error.name, 80).toLocaleLowerCase();
    if (code === 'pkce_code_verifier_not_found' || name === 'authpkcecodeverifiermissingerror') {
      return 'AUTH_BROWSER_CHANGED';
    }
    return 'AUTH_UNAVAILABLE';
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function cleanString(value, maximum) {
    var text = value === undefined || value === null ? '' : String(value);
    if (text.normalize) text = text.normalize('NFKC');
    text = text.replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '').trim();
    return Array.from(text).slice(0, maximum || 500).join('');
  }

  function normalizeEmail(value) {
    var email = cleanString(value, 254).toLocaleLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authError('EMAIL_INVALID');
    return email;
  }

  function normalizeHandle(value) {
    var handle = cleanString(value, 25).toLocaleLowerCase().replace(/^@+/, '');
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle)) throw authError('HANDLE_INVALID');
    return handle;
  }

  function normalizeDisplayName(value) {
    var displayName = cleanString(value, 40).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    if (!displayName || displayName.length > 40) throw authError('PROFILE_UNAVAILABLE');
    return displayName;
  }

  function validRpcName(value) {
    return /^[a-z][a-z0-9_]{0,62}$/.test(String(value || ''));
  }

  function validFunctionName(value) {
    return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(String(value || ''));
  }

  function normalizeProvider(value) {
    var provider = cleanString(value, 20).toLocaleLowerCase();
    if (ALLOWED_PROVIDERS.indexOf(provider) === -1) throw authError('AUTH_UNAVAILABLE');
    return provider;
  }

  function safeUrl(value, environment) {
    try {
      var base = environment && environment.location && environment.location.href || 'https://ridehero.invalid/';
      var url = new URL(String(value || ''), base);
      var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
      if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
      return url;
    } catch (error) {
      return null;
    }
  }

  function normalizedConfiguration(value, environment) {
    var input = value && typeof value === 'object' ? value : {};
    var serviceUrl = safeUrl(input.supabaseUrl, environment);
    var key = cleanString(input.publishableKey || input.anonKey, 4096);
    var placeholder = /YOUR_|REPLACE|example/i.test(String(input.supabaseUrl || '') + key);
    var configured = !!(serviceUrl && key && !placeholder);
    var enabled = Array.isArray(input.enabledProviders) ? input.enabledProviders : ALLOWED_PROVIDERS;
    enabled = enabled.map(function(provider) {
      try { return normalizeProvider(provider); } catch (error) { return ''; }
    }).filter(function(provider, index, providers) {
      return !!provider && providers.indexOf(provider) === index;
    });

    return Object.freeze({
      configured: configured,
      supabaseUrl: serviceUrl ? serviceUrl.origin : '',
      publishableKey: key,
      enabledProviders: Object.freeze(enabled),
      emailEnabled: input.emailEnabled !== false,
      profileReadRpc: validRpcName(input.profileReadRpc) ? input.profileReadRpc : '',
      profileCompleteRpc: validRpcName(input.profileCompleteRpc) ? input.profileCompleteRpc : 'complete_profile',
      deleteAccountFunction: validFunctionName(input.deleteAccountFunction) ? input.deleteAccountFunction : ''
    });
  }

  function cloneUser(user, profile) {
    if (!user) return null;
    var metadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
    // OAuth user metadata is user-editable. Only the protected profile RPC may
    // assert a handle and mark account setup complete.
    var handle = profile && profile.handle || '';
    var displayName = profile && profile.displayName || metadata.display_name || metadata.full_name || metadata.name || '';
    var email = cleanString(user.email, 254);
    return Object.freeze({
      id: cleanString(user.id, 128),
      email: email,
      handle: handle ? cleanString(handle, 24).toLocaleLowerCase() : '',
      displayName: displayName ? cleanString(displayName, 40) : '',
      emailVerified: !!(user.email_confirmed_at || user.confirmed_at)
    });
  }

  function normalizeProfile(data) {
    var candidate = Array.isArray(data) ? data[0] : data;
    if (!candidate || typeof candidate !== 'object') return null;
    var handle = candidate.handle || candidate.username || candidate.ridehero_handle;
    if (!handle) return null;
    try {
      return Object.freeze({
        handle: normalizeHandle(handle),
        displayName: cleanString(candidate.display_name || candidate.displayName, 40)
      });
    } catch (error) {
      return null;
    }
  }

  function createAuthClient(options) {
    var settings = options || {};
    var environment = settings.root || root || {};
    // Capture callback inputs at module/client construction. Hash navigation can
    // resolve through <base href="/"> and replace the visible URL before the
    // asynchronous auth client is ready, but it must not discard the one-time
    // provider result that was present when this page loaded.
    var initialAuthLocation = Object.freeze({
      pathname: String(environment.location && environment.location.pathname || '/'),
      search: String(environment.location && environment.location.search || '')
    });
    var explicitConfig = own(settings, 'config') ? settings.config : null;
    var loadLibrary = settings.loadLibrary || function() {
      if (environment.supabase && typeof environment.supabase.createClient === 'function') {
        return Promise.resolve(environment.supabase);
      }
      var document = environment.document;
      if (!document || !document.head || typeof document.createElement !== 'function') {
        return Promise.reject(authError('AUTH_UNAVAILABLE'));
      }
      return new Promise(function(resolve, reject) {
        var selector = 'script[data-ridehero-supabase="' + SUPABASE_VERSION + '"]';
        var existing = typeof document.querySelector === 'function' ? document.querySelector(selector) : null;
        var script = existing || document.createElement('script');
        function loaded() {
          if (environment.supabase && typeof environment.supabase.createClient === 'function') resolve(environment.supabase);
          else reject(authError('AUTH_UNAVAILABLE'));
        }
        function failed() {
          if (script.parentNode && typeof script.remove === 'function') script.remove();
          reject(authError('AUTH_UNAVAILABLE'));
        }
        if (existing) {
          existing.addEventListener('load', loaded, { once: true });
          existing.addEventListener('error', failed, { once: true });
          return;
        }
        script.src = SUPABASE_SCRIPT_URL;
        script.integrity = SUPABASE_SCRIPT_INTEGRITY;
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        script.async = true;
        script.dataset.rideheroSupabase = SUPABASE_VERSION;
        script.addEventListener('load', loaded, { once: true });
        script.addEventListener('error', failed, { once: true });
        document.head.appendChild(script);
      });
    };
    var listeners = [];
    var client = null;
    var clientPromise = null;
    var initializePromise = null;
    var authSubscription = null;
    var activeSession = null;
    var activeProfile = null;
    var callbackWasCleared = false;
    var state = {
      configured: false,
      status: 'unconfigured',
      user: null,
      profileComplete: false,
      errorCode: null
    };

    function configuration() {
      var raw = explicitConfig || environment.RIDEHERO_AUTH_CONFIG || {};
      return normalizedConfiguration(raw, environment);
    }

    function publicState() {
      return Object.freeze({
        configured: state.configured,
        status: state.status,
        authenticated: state.status === 'signed_in' && !!state.user,
        user: state.user,
        profileComplete: !!state.profileComplete,
        errorCode: state.errorCode
      });
    }

    function dispatchState() {
      var next = publicState();
      listeners.slice().forEach(function(listener) {
        try { listener(next); } catch (error) { /* A subscriber cannot break authentication. */ }
      });
      var document = environment.document;
      if (document && typeof environment.CustomEvent === 'function') {
        document.dispatchEvent(new environment.CustomEvent('ridehero:auth-changed', {
          detail: {
            configured: next.configured,
            status: next.status,
            authenticated: next.authenticated,
            profileComplete: next.profileComplete
          }
        }));
      }
    }

    function setState(patch) {
      Object.keys(patch || {}).forEach(function(key) { state[key] = patch[key]; });
      dispatchState();
      return publicState();
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') return function() {};
      listeners.push(listener);
      listener(publicState());
      return function() {
        listeners = listeners.filter(function(saved) { return saved !== listener; });
      };
    }

    function sessionStorage() {
      try { return environment.sessionStorage || null; } catch (error) { return null; }
    }

    function cleanReturnLocation() {
      var location = environment.location;
      if (!location) return '/';
      var pathname = String(location.pathname || '/');
      var params = new URLSearchParams(String(location.search || ''));
      AUTH_QUERY_KEYS.forEach(function(key) { params.delete(key); });
      var query = params.toString();
      var target = pathname + (query ? '?' + query : '') + String(location.hash || '');
      target = target.replace(/[\u0000-\u001F\u007F]/g, '');
      return Array.from(target).slice(0, MAX_RETURN_LOCATION_LENGTH).join('');
    }

    function rememberReturnLocation() {
      var storage = sessionStorage();
      if (!storage) return;
      try { storage.setItem(RETURN_LOCATION_KEY, cleanReturnLocation()); } catch (error) { /* Optional enhancement only. */ }
    }

    function restoreReturnLocation() {
      var storage = sessionStorage();
      if (!storage) return false;
      var target = '';
      try {
        target = String(storage.getItem(RETURN_LOCATION_KEY) || '');
        storage.removeItem(RETURN_LOCATION_KEY);
      } catch (error) { return false; }
      if (!target || target.length > MAX_RETURN_LOCATION_LENGTH || /[\u0000-\u001F\u007F]/.test(target) || target.charAt(0) !== '/' || target.indexOf('//') === 0) return false;
      try {
        var current = safeUrl(environment.location && environment.location.href, environment);
        var resolved = safeUrl(target, environment);
        if (!current || !resolved || current.origin !== resolved.origin) return false;
        if (environment.history && typeof environment.history.replaceState === 'function') {
          environment.history.replaceState(environment.history.state || null, '', resolved.pathname + resolved.search + resolved.hash);
          return true;
        }
      } catch (error) { /* Route restoration must never block sign-in. */ }
      return false;
    }

    function authCallbackDetails() {
      var location = environment.location;
      if (!location) return Object.freeze({ active: false, code: '', errorCode: '' });
      var pathname = callbackWasCleared ? String(location.pathname || '/') : initialAuthLocation.pathname;
      var params = new URLSearchParams(callbackWasCleared ? String(location.search || '') : initialAuthLocation.search);
      var hasAuthQuery = AUTH_QUERY_KEYS.some(function(key) { return params.has(key); });
      var active = /^\/auth\/callback\/?$/.test(pathname) || (pathname === '/' && hasAuthQuery);
      if (!active) return Object.freeze({ active: false, code: '', errorCode: '' });
      var providerError = cleanString(params.get('error') || params.get('error_code'), 80).toLocaleLowerCase();
      var hasProviderError = !!providerError || params.has('error_description');
      return Object.freeze({
        active: true,
        code: cleanString(params.get('code'), 2048),
        errorCode: providerError === 'access_denied' ? 'AUTH_CANCELLED' : (hasProviderError ? 'AUTH_UNAVAILABLE' : '')
      });
    }

    function isAuthCallback() {
      return authCallbackDetails().active;
    }

    function clearAuthCallback() {
      if (callbackWasCleared || !isAuthCallback()) return false;
      if (environment.history && typeof environment.history.replaceState === 'function') {
        environment.history.replaceState(environment.history.state || null, '', '/#/account');
        callbackWasCleared = true;
        return true;
      }
      return false;
    }

    function redirectUrl() {
      var current = safeUrl(environment.location && environment.location.href, environment);
      if (!current) return '';
      return current.origin + '/auth/callback/';
    }

    function loadClient() {
      var config = configuration();
      if (!config.configured) {
        setState({ configured: false, status: 'unconfigured', user: null, profileComplete: false, errorCode: 'AUTH_NOT_CONFIGURED' });
        return Promise.reject(authError('AUTH_NOT_CONFIGURED'));
      }
      if (client) return Promise.resolve(client);
      if (clientPromise) return clientPromise;
      setState({ configured: true, status: 'loading', errorCode: null });
      clientPromise = Promise.resolve(loadLibrary()).then(function(library) {
        if (!library || typeof library.createClient !== 'function') throw authError('AUTH_UNAVAILABLE');
        client = library.createClient(config.supabaseUrl, config.publishableKey, {
          auth: {
            autoRefreshToken: true,
            detectSessionInUrl: false,
            flowType: 'pkce',
            persistSession: true
          },
          global: { headers: { 'X-Client-Info': 'ridehero-web-auth/1' } }
        });
        if (!client || !client.auth) throw authError('AUTH_UNAVAILABLE');
        return client;
      }).catch(function(error) {
        clientPromise = null;
        setState({ configured: true, status: 'error', errorCode: error && error.code || 'AUTH_UNAVAILABLE' });
        throw error instanceof AuthClientError ? error : classifyServiceError(error);
      });
      return clientPromise;
    }

    function applySession(session, event) {
      activeSession = session || null;
      if (!activeSession || !activeSession.user) {
        activeProfile = null;
        setState({ configured: configuration().configured, status: 'signed_out', user: null, profileComplete: false, errorCode: null });
        return;
      }
      var user = cloneUser(activeSession.user, activeProfile);
      setState({ configured: true, status: 'signed_in', user: user, profileComplete: !!user.handle, errorCode: null });
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (!restoreReturnLocation()) clearAuthCallback();
      }
    }

    function refreshProfile() {
      var config = configuration();
      if (!activeSession || !activeSession.user || !client || !config.profileReadRpc) return Promise.resolve(activeProfile);
      return client.rpc(config.profileReadRpc).then(function(result) {
        if (result && result.error) return activeProfile;
        activeProfile = normalizeProfile(result && result.data);
        applySession(activeSession, 'PROFILE_REFRESHED');
        return activeProfile;
      }).catch(function() { return activeProfile; });
    }

    function initialize() {
      if (initializePromise) return initializePromise;
      var callback = authCallbackDetails();
      var callbackProcessingAttempted = callback.active;
      initializePromise = loadClient().then(function(loadedClient) {
        var observed = loadedClient.auth.onAuthStateChange(function(event, session) {
          // Supabase may emit INITIAL_SESSION(null) after callback processing
          // begins. It is stale for this page and must not erase the callback
          // result or a session established by the explicit PKCE exchange.
          if (callbackProcessingAttempted && !(session && session.user) && (
            event === 'INITIAL_SESSION' || (event === 'SIGNED_OUT' && state.errorCode)
          )) return;
          applySession(session, event);
          if (session && session.user) Promise.resolve().then(refreshProfile);
        });
        authSubscription = observed && observed.data && observed.data.subscription || null;
        if (callback.errorCode) {
          clearAuthCallback();
          activeSession = null;
          activeProfile = null;
          return { data: { session: null }, errorCode: callback.errorCode, callbackHandled: true };
        }
        if (callback.code) {
          if (typeof loadedClient.auth.exchangeCodeForSession !== 'function') {
            return { data: { session: null }, errorCode: 'AUTH_UNAVAILABLE', callbackHandled: true };
          }
          return Promise.resolve(loadedClient.auth.exchangeCodeForSession(callback.code)).then(function(result) {
            if (result && result.error) throw result.error;
            return { data: { session: result && result.data && result.data.session || null }, callbackHandled: true };
          }).catch(function(error) {
            return { data: { session: null }, errorCode: classifyCallbackError(error), callbackHandled: true };
          });
        }
        return loadedClient.auth.getSession();
      }).then(function(result) {
        if (result && result.callbackHandled && result.errorCode) {
          clearAuthCallback();
          return setState({
            configured: configuration().configured,
            status: 'signed_out',
            user: null,
            profileComplete: false,
            errorCode: result.errorCode
          });
        }
        if (result && result.error) throw result.error;
        applySession(result && result.data && result.data.session || null, 'INITIAL_SESSION');
        if (callbackProcessingAttempted && !(result && result.data && result.data.session)) clearAuthCallback();
        return refreshProfile().then(publicState);
      }).catch(function(error) {
        initializePromise = null;
        if (error && error.code === 'AUTH_NOT_CONFIGURED') {
          clearAuthCallback();
          throw error;
        }
        if (callbackProcessingAttempted) clearAuthCallback();
        setState({ configured: configuration().configured, status: 'error', errorCode: 'AUTH_UNAVAILABLE' });
        throw classifyServiceError(error);
      });
      return initializePromise;
    }

    function requireClient() {
      return initialize().then(function() {
        if (!client) throw authError('AUTH_UNAVAILABLE');
        return client;
      });
    }

    function signInWithEmail(value) {
      var email = normalizeEmail(value);
      var config = configuration();
      if (!config.emailEnabled) return Promise.reject(authError('AUTH_UNAVAILABLE'));
      if (state.errorCode) setState({ configured: config.configured, status: activeSession && activeSession.user ? 'signed_in' : 'signed_out', errorCode: null });
      rememberReturnLocation();
      return requireClient().then(function(loadedClient) {
        return loadedClient.auth.signInWithOtp({
          email: email,
          options: {
            emailRedirectTo: redirectUrl(),
            shouldCreateUser: true
          }
        });
      }).then(function(result) {
        if (result && result.error) throw result.error;
        return Object.freeze({ sent: true });
      }).catch(function(error) {
        throw error instanceof AuthClientError ? error : classifyServiceError(error);
      });
    }

    function signInWithOAuth(value) {
      var provider = normalizeProvider(value);
      var config = configuration();
      if (config.enabledProviders.indexOf(provider) === -1) return Promise.reject(authError('AUTH_UNAVAILABLE'));
      if (state.errorCode) setState({ configured: config.configured, status: activeSession && activeSession.user ? 'signed_in' : 'signed_out', errorCode: null });
      rememberReturnLocation();
      return requireClient().then(function(loadedClient) {
        var clearStaleLocalSession = activeSession && activeSession.user
          ? Promise.resolve({ error: null })
          : Promise.resolve(loadedClient.auth.signOut({ scope: 'local' }));
        return clearStaleLocalSession.then(function(signOutResult) {
          if (signOutResult && signOutResult.error) throw signOutResult.error;
          return loadedClient.auth.signInWithOAuth({
            provider: provider,
            options: { redirectTo: redirectUrl() }
          });
        });
      }).then(function(result) {
        if (result && result.error) throw result.error;
        return Object.freeze({ redirecting: true, provider: provider });
      }).catch(function(error) {
        throw error instanceof AuthClientError ? error : classifyServiceError(error);
      });
    }

    function completeProfile(value, displayValue) {
      var handle = normalizeHandle(value);
      var displayName = normalizeDisplayName(displayValue);
      if (!activeSession || !activeSession.user) return Promise.reject(authError('AUTH_REQUIRED'));
      var config = configuration();
      var parameters = { handle: handle, display_name: displayName };
      return requireClient().then(function(loadedClient) {
        return loadedClient.rpc(config.profileCompleteRpc, parameters);
      }).then(function(result) {
        if (result && result.error) throw result.error;
        activeProfile = normalizeProfile(result && result.data) || Object.freeze({ handle: handle, displayName: displayName });
        applySession(activeSession, 'PROFILE_UPDATED');
        return activeProfile;
      }).catch(function(error) {
        throw error instanceof AuthClientError ? error : classifyServiceError(error, 'PROFILE_UNAVAILABLE');
      });
    }

    function signOut() {
      return requireClient().then(function(loadedClient) {
        return loadedClient.auth.signOut({ scope: 'local' });
      }).then(function(result) {
        if (result && result.error) throw result.error;
        applySession(null, 'SIGNED_OUT');
        return publicState();
      }).catch(function(error) {
        throw error instanceof AuthClientError ? error : classifyServiceError(error);
      });
    }

    function canRequestAccountDeletion() {
      return !!configuration().deleteAccountFunction;
    }

    function requestAccountDeletion() {
      var config = configuration();
      if (!config.deleteAccountFunction) return Promise.reject(authError('DELETE_UNAVAILABLE'));
      if (!activeSession || !activeSession.user) return Promise.reject(authError('AUTH_REQUIRED'));
      return requireClient().then(function(loadedClient) {
        if (!loadedClient.functions || typeof loadedClient.functions.invoke !== 'function') throw authError('DELETE_UNAVAILABLE');
        return loadedClient.functions.invoke(config.deleteAccountFunction, {
          body: { confirmation: 'DELETE_MY_RIDEHERO_ACCOUNT' }
        });
      }).then(function(result) {
        if (result && result.error) throw result.error;
        applySession(null, 'USER_DELETED');
        return Object.freeze({ requested: true });
      }).catch(function(error) {
        throw error instanceof AuthClientError ? error : classifyServiceError(error, 'DELETE_UNAVAILABLE');
      });
    }

    function rpc(name, parameters) {
      var rpcName = cleanString(name, 63);
      if (ALLOWED_ACCOUNT_RPCS.indexOf(rpcName) === -1) return Promise.reject(authError('AUTH_UNAVAILABLE'));
      if (!activeSession || !activeSession.user) return Promise.reject(authError('AUTH_REQUIRED'));
      var safeParameters = parameters && typeof parameters === 'object' && !Array.isArray(parameters) ? parameters : {};
      return requireClient().then(function(loadedClient) {
        return loadedClient.rpc(rpcName, safeParameters);
      }).then(function(result) {
        if (result && result.error) throw result.error;
        return result && result.data;
      }).catch(function(error) {
        throw error instanceof AuthClientError ? error : classifyServiceError(error);
      });
    }

    function destroy() {
      if (authSubscription && typeof authSubscription.unsubscribe === 'function') authSubscription.unsubscribe();
      authSubscription = null;
      listeners = [];
    }

    var config = configuration();
    state.configured = config.configured;
    state.status = config.configured ? 'idle' : 'unconfigured';
    state.errorCode = config.configured ? null : 'AUTH_NOT_CONFIGURED';

    return Object.freeze({
      initialize: initialize,
      getState: publicState,
      subscribe: subscribe,
      signInWithEmail: signInWithEmail,
      signInWithOAuth: signInWithOAuth,
      completeProfile: completeProfile,
      signOut: signOut,
      canRequestAccountDeletion: canRequestAccountDeletion,
      requestAccountDeletion: requestAccountDeletion,
      rpc: rpc,
      getConfiguration: configuration,
      destroy: destroy
    });
  }

  var defaultClient = createAuthClient();

  return Object.freeze({
    SUPABASE_VERSION: SUPABASE_VERSION,
    SUPABASE_SCRIPT_URL: SUPABASE_SCRIPT_URL,
    SUPABASE_SCRIPT_INTEGRITY: SUPABASE_SCRIPT_INTEGRITY,
    RETURN_LOCATION_KEY: RETURN_LOCATION_KEY,
    MAX_RETURN_LOCATION_LENGTH: MAX_RETURN_LOCATION_LENGTH,
    ALLOWED_PROVIDERS: ALLOWED_PROVIDERS,
    AuthClientError: AuthClientError,
    normalizeEmail: normalizeEmail,
    normalizeHandle: normalizeHandle,
    normalizeDisplayName: normalizeDisplayName,
    createAuthClient: createAuthClient,
    initialize: defaultClient.initialize,
    getState: defaultClient.getState,
    subscribe: defaultClient.subscribe,
    signInWithEmail: defaultClient.signInWithEmail,
    signInWithOAuth: defaultClient.signInWithOAuth,
    completeProfile: defaultClient.completeProfile,
    signOut: defaultClient.signOut,
    canRequestAccountDeletion: defaultClient.canRequestAccountDeletion,
    requestAccountDeletion: defaultClient.requestAccountDeletion,
    rpc: defaultClient.rpc,
    getConfiguration: defaultClient.getConfiguration
  });
});
