(function(root, factory) {
  'use strict';

  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideHeroAccountFriends = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  var MAX_ROWS = 200;
  var STATES = Object.freeze(['friend', 'incoming_request', 'outgoing_request']);
  var RESPONSE_VALUES = Object.freeze(['accept', 'decline']);

  function AccountFriendsError(code, message) {
    this.name = 'AccountFriendsError';
    this.code = code || 'FRIENDS_UNAVAILABLE';
    this.message = message || 'Account friends are temporarily unavailable.';
    if (Error.captureStackTrace) Error.captureStackTrace(this, AccountFriendsError);
  }
  AccountFriendsError.prototype = Object.create(Error.prototype);
  AccountFriendsError.prototype.constructor = AccountFriendsError;

  function friendError(code) {
    var messages = {
      AUTH_REQUIRED: 'Sign in to manage friends.',
      HANDLE_INVALID: 'Enter an exact RideHero handle.',
      FRIEND_ID_INVALID: 'That friend request is unavailable.',
      RESPONSE_INVALID: 'That friend response is unavailable.',
      FRIENDS_UNAVAILABLE: 'Account friends are temporarily unavailable.'
    };
    return new AccountFriendsError(code, messages[code] || messages.FRIENDS_UNAVAILABLE);
  }

  function cleanString(value, maximum) {
    var text = value === undefined || value === null ? '' : String(value);
    if (text.normalize) text = text.normalize('NFKC');
    text = text.replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069<>]/g, '').trim();
    return Array.from(text).slice(0, maximum || 100).join('');
  }

  function normalizeHandle(value) {
    if (/[<>]/.test(String(value === undefined || value === null ? '' : value))) throw friendError('HANDLE_INVALID');
    var handle = cleanString(value, 25).toLocaleLowerCase().replace(/^@+/, '');
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle)) throw friendError('HANDLE_INVALID');
    return handle;
  }

  function normalizeUuid(value) {
    var id = cleanString(value, 36).toLocaleLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
      throw friendError('FRIEND_ID_INVALID');
    }
    return id;
  }

  function normalizeResponse(value) {
    var response = cleanString(value, 10).toLocaleLowerCase();
    if (RESPONSE_VALUES.indexOf(response) === -1) throw friendError('RESPONSE_INVALID');
    return response;
  }

  function normalizeTimestamp(value) {
    var text = cleanString(value, 40);
    if (!text || !Number.isFinite(Date.parse(text))) return '';
    return text;
  }

  function normalizeRow(value) {
    if (!value || typeof value !== 'object') return null;
    var state = cleanString(value.state, 24);
    if (STATES.indexOf(state) === -1) return null;
    try {
      return Object.freeze({
        state: state,
        relationshipId: normalizeUuid(value.relationship_id),
        userId: normalizeUuid(value.friend_user_id),
        handle: normalizeHandle(value.handle),
        displayName: cleanString(value.display_name, 40).replace(/\s+/g, ' '),
        createdAt: normalizeTimestamp(value.created_at)
      });
    } catch (error) {
      return null;
    }
  }

  function normalizeRows(value) {
    if (!Array.isArray(value)) return Object.freeze([]);
    return Object.freeze(value.slice(0, MAX_ROWS).map(normalizeRow).filter(Boolean));
  }

  function createAccountFriends(options) {
    var settings = options || {};
    var auth = settings.auth || root && root.RideHeroAuth;
    var listeners = [];
    var state = Object.freeze({ status: 'idle', rows: Object.freeze([]), count: 0, errorCode: null });

    function publicState() { return state; }

    function notify() {
      listeners.slice().forEach(function(listener) {
        try { listener(state); } catch (error) { /* Subscriber errors remain isolated. */ }
      });
      var document = settings.document || root && root.document;
      var CustomEventConstructor = settings.CustomEvent || root && root.CustomEvent;
      if (document && typeof CustomEventConstructor === 'function') {
        document.dispatchEvent(new CustomEventConstructor('ridehero:account-friends-changed', {
          detail: { count: state.count }
        }));
      }
    }

    function setState(status, rows, errorCode) {
      var safeRows = rows || state.rows;
      state = Object.freeze({
        status: status,
        rows: safeRows,
        count: safeRows.length,
        errorCode: errorCode || null
      });
      notify();
      return state;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') return function() {};
      listeners.push(listener);
      listener(state);
      return function() {
        listeners = listeners.filter(function(saved) { return saved !== listener; });
      };
    }

    function requireRpc() {
      var authState = auth && typeof auth.getState === 'function' ? auth.getState() : null;
      if (!auth || typeof auth.rpc !== 'function' || !authState || !authState.authenticated || !authState.profileComplete) {
        return Promise.reject(friendError('AUTH_REQUIRED'));
      }
      return Promise.resolve(auth.rpc.bind(auth));
    }

    function load() {
      setState('loading', state.rows);
      return requireRpc().then(function(rpc) {
        return rpc('list_friend_state', {});
      }).then(function(rows) {
        return setState('ready', normalizeRows(rows));
      }).catch(function(error) {
        var code = error && error.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'FRIENDS_UNAVAILABLE';
        setState('error', Object.freeze([]), code);
        throw error instanceof AccountFriendsError ? error : friendError(code);
      });
    }

    function mutate(name, parameters) {
      setState('saving', state.rows);
      return requireRpc().then(function(rpc) {
        return rpc(name, parameters);
      }).then(load).catch(function(error) {
        var code = error && error.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'FRIENDS_UNAVAILABLE';
        setState('error', state.rows, code);
        throw error instanceof AccountFriendsError ? error : friendError(code);
      });
    }

    function sendRequest(value) {
      return mutate('send_friend_request', { handle: normalizeHandle(value) });
    }

    function respondToRequest(value, responseValue) {
      return mutate('respond_friend_request', {
        id: normalizeUuid(value),
        response: normalizeResponse(responseValue)
      });
    }

    function removeFriend(value) {
      return mutate('remove_friend', { user_id: normalizeUuid(value) });
    }

    function blockUser(value) {
      return mutate('block_user', { user_id: normalizeUuid(value) });
    }

    function unblockUser(value) {
      return mutate('unblock_user', { user_id: normalizeUuid(value) });
    }

    return Object.freeze({
      getState: publicState,
      subscribe: subscribe,
      load: load,
      sendRequest: sendRequest,
      acceptRequest: function(id) { return respondToRequest(id, 'accept'); },
      declineRequest: function(id) { return respondToRequest(id, 'decline'); },
      removeFriend: removeFriend,
      blockUser: blockUser,
      unblockUser: unblockUser
    });
  }

  var defaultClient = createAccountFriends();

  return Object.freeze({
    MAX_ROWS: MAX_ROWS,
    STATES: STATES,
    RESPONSE_VALUES: RESPONSE_VALUES,
    AccountFriendsError: AccountFriendsError,
    normalizeHandle: normalizeHandle,
    normalizeUuid: normalizeUuid,
    normalizeRow: normalizeRow,
    normalizeRows: normalizeRows,
    createAccountFriends: createAccountFriends,
    getState: defaultClient.getState,
    subscribe: defaultClient.subscribe,
    load: defaultClient.load,
    sendRequest: defaultClient.sendRequest,
    acceptRequest: defaultClient.acceptRequest,
    declineRequest: defaultClient.declineRequest,
    removeFriend: defaultClient.removeFriend,
    blockUser: defaultClient.blockUser,
    unblockUser: defaultClient.unblockUser
  });
});
