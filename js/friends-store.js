(function(root, factory) {
  'use strict';

  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideHeroFriendsStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  var STORAGE_KEY = 'ridehero.friends.v1';
  var SCHEMA_VERSION = 1;
  var MAX_FRIENDS = 40;
  var MAX_DISPLAY_NAME_LENGTH = 40;

  function FriendsStoreError(code, message) {
    this.name = 'FriendsStoreError';
    this.code = code;
    this.message = message;
    if (Error.captureStackTrace) Error.captureStackTrace(this, FriendsStoreError);
  }
  FriendsStoreError.prototype = Object.create(Error.prototype);
  FriendsStoreError.prototype.constructor = FriendsStoreError;

  function truncateCodePoints(value, maximum) {
    return Array.from(value).slice(0, maximum).join('');
  }

  function sanitizeDisplayName(value) {
    if (value === undefined || value === null) return '';
    var name = String(value);
    if (name.normalize) name = name.normalize('NFKC');
    name = name
      .replace(/<[^>]*>/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return truncateCodePoints(name, MAX_DISPLAY_NAME_LENGTH);
  }

  function looksLikeEmail(value) {
    return /(?:^|\s)[^\s@]+@[^\s@]+\.[^\s@]+(?:\s|$)/.test(value);
  }

  function looksLikePhone(value) {
    return /(?:^|\s)(?:\+?\d[\d().\-\s]{5,}\d)(?:\s|$)/.test(value);
  }

  function validateDisplayName(value) {
    var name = sanitizeDisplayName(value);
    if (!name) throw new FriendsStoreError('NAME_REQUIRED', 'Enter a display name.');
    if (looksLikeEmail(name) || looksLikePhone(name)) {
      throw new FriendsStoreError('CONTACT_DATA_NOT_ALLOWED', 'Use a display name, not an email address or phone number.');
    }
    return name;
  }

  function normalizedKey(value) {
    return value.toLocaleLowerCase ? value.toLocaleLowerCase() : value.toLowerCase();
  }

  function normalizeSavedNames(value) {
    if (!value || value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.friends)) return [];
    var seen = Object.create(null);
    var names = [];
    value.friends.some(function(candidate) {
      var name;
      try { name = validateDisplayName(candidate); } catch (error) { return false; }
      var key = normalizedKey(name);
      if (!seen[key]) {
        seen[key] = true;
        names.push(name);
      }
      return names.length >= MAX_FRIENDS;
    });
    return names;
  }

  function browserStorage() {
    try { return root && root.localStorage ? root.localStorage : null; }
    catch (error) { return null; }
  }

  function createStore(options) {
    var settings = options || {};
    var storage = Object.prototype.hasOwnProperty.call(settings, 'storage') ? settings.storage : browserStorage();
    var memoryNames = [];
    var persistenceAvailable = !!storage;

    function readNames() {
      if (!storage) return memoryNames.slice();
      try {
        var saved = storage.getItem(STORAGE_KEY);
        if (!saved) return memoryNames.slice();
        var names = normalizeSavedNames(JSON.parse(saved));
        memoryNames = names.slice();
        return names;
      } catch (error) {
        persistenceAvailable = false;
        storage = null;
        return memoryNames.slice();
      }
    }

    function writeNames(names) {
      var cleanNames = normalizeSavedNames({ schemaVersion: SCHEMA_VERSION, friends: names });
      memoryNames = cleanNames.slice();
      if (!storage) return cleanNames;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          friends: cleanNames
        }));
      } catch (error) {
        persistenceAvailable = false;
        storage = null;
      }
      return cleanNames;
    }

    function listFriends() {
      return readNames().slice();
    }

    function addFriend(value) {
      var name = validateDisplayName(value);
      var names = readNames();
      var key = normalizedKey(name);
      if (names.some(function(savedName) { return normalizedKey(savedName) === key; })) {
        throw new FriendsStoreError('DUPLICATE_FRIEND', 'That friend is already on this device.');
      }
      if (names.length >= MAX_FRIENDS) {
        throw new FriendsStoreError('FRIEND_LIMIT', 'RideHero can save up to 40 friends on this device.');
      }
      names.push(name);
      writeNames(names);
      return name;
    }

    function removeFriend(value) {
      var name = validateDisplayName(value);
      var key = normalizedKey(name);
      var names = readNames();
      var next = names.filter(function(savedName) { return normalizedKey(savedName) !== key; });
      if (next.length === names.length) return false;
      writeNames(next);
      return true;
    }

    function clearFriends() {
      writeNames([]);
    }

    function isPersistent() {
      return persistenceAvailable && !!storage;
    }

    return Object.freeze({
      listFriends: listFriends,
      addFriend: addFriend,
      removeFriend: removeFriend,
      clearFriends: clearFriends,
      isPersistent: isPersistent
    });
  }

  var defaultStore = createStore();

  return Object.freeze({
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    MAX_FRIENDS: MAX_FRIENDS,
    MAX_DISPLAY_NAME_LENGTH: MAX_DISPLAY_NAME_LENGTH,
    FriendsStoreError: FriendsStoreError,
    sanitizeDisplayName: sanitizeDisplayName,
    validateDisplayName: validateDisplayName,
    createStore: createStore,
    listFriends: defaultStore.listFriends,
    addFriend: defaultStore.addFriend,
    removeFriend: defaultStore.removeFriend,
    clearFriends: defaultStore.clearFriends,
    isPersistent: defaultStore.isPersistent
  });
});
