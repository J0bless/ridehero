'use strict';

const assert = require('node:assert/strict');
const FriendsStore = require('../js/friends-store.js');

function storageHarness(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) values.set(FriendsStore.STORAGE_KEY, initialValue);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    snapshot() { return values.get(FriendsStore.STORAGE_KEY); }
  };
}

function throwsCode(fn, expectedCode) {
  assert.throws(fn, error => {
    assert.equal(error && error.code, expectedCode);
    return true;
  });
}

assert.equal(FriendsStore.MAX_FRIENDS, 40);
assert.equal(FriendsStore.MAX_DISPLAY_NAME_LENGTH, 40);
assert.equal(FriendsStore.sanitizeDisplayName('  <b>Eric</b>\u202E  Smith  '), 'Eric Smith');
assert.equal(Array.from(FriendsStore.sanitizeDisplayName('A'.repeat(80))).length, 40);
throwsCode(() => FriendsStore.validateDisplayName(''), 'NAME_REQUIRED');
throwsCode(() => FriendsStore.validateDisplayName('private@example.com'), 'CONTACT_DATA_NOT_ALLOWED');
throwsCode(() => FriendsStore.validateDisplayName('+1 (215) 555-0199'), 'CONTACT_DATA_NOT_ALLOWED');
throwsCode(() => FriendsStore.validateDisplayName('Eric private@example.com'), 'CONTACT_DATA_NOT_ALLOWED');
throwsCode(() => FriendsStore.validateDisplayName('Eric +1 (215) 555-0199'), 'CONTACT_DATA_NOT_ALLOWED');

const storage = storageHarness();
const store = FriendsStore.createStore({ storage });
assert.deepEqual(store.listFriends(), []);
assert.equal(store.addFriend(' Eric '), 'Eric');
assert.equal(store.addFriend('<i>Maya</i>'), 'Maya');
assert.deepEqual(store.listFriends(), ['Eric', 'Maya']);
throwsCode(() => store.addFriend('eric'), 'DUPLICATE_FRIEND');

const persisted = JSON.parse(storage.snapshot());
assert.deepEqual(Object.keys(persisted).sort(), ['friends', 'schemaVersion']);
assert.deepEqual(persisted, { schemaVersion: 1, friends: ['Eric', 'Maya'] });
const persistedText = JSON.stringify(persisted);
['email', 'phone', 'account', 'contact', 'gps', 'latitude', 'longitude', 'friendId', 'userId'].forEach(forbidden => {
  assert.equal(persistedText.toLowerCase().includes(forbidden.toLowerCase()), false, `${forbidden} must not be persisted`);
});

assert.equal(store.removeFriend('ERIC'), true);
assert.equal(store.removeFriend('Nobody'), false);
assert.deepEqual(store.listFriends(), ['Maya']);

const fullStorage = storageHarness();
const fullStore = FriendsStore.createStore({ storage: fullStorage });
for (let index = 1; index <= FriendsStore.MAX_FRIENDS; index += 1) fullStore.addFriend(`Friend ${index}`);
assert.equal(fullStore.listFriends().length, 40);
throwsCode(() => fullStore.addFriend('Friend 41'), 'FRIEND_LIMIT');

const corrupted = FriendsStore.createStore({ storage: storageHarness('{not-json') });
assert.deepEqual(corrupted.listFriends(), []);
assert.equal(corrupted.isPersistent(), false);
assert.equal(corrupted.addFriend('Local only'), 'Local only');
assert.deepEqual(corrupted.listFriends(), ['Local only']);

const dirtySaved = JSON.stringify({
  schemaVersion: 1,
  friends: [' <b>Alex</b> ', 'alex', 'person@example.com', '+1 215 555 0199', 'Jordan'],
  email: 'must-not-load@example.com',
  gps: [1, 2]
});
const repaired = FriendsStore.createStore({ storage: storageHarness(dirtySaved) });
assert.deepEqual(repaired.listFriends(), ['Alex', 'Jordan']);

store.clearFriends();
assert.deepEqual(store.listFriends(), []);

console.log('friends-store validation: passed');
