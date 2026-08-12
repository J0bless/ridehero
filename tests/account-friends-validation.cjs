'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const friends = require(path.join(__dirname, '..', 'js', 'account-friends.js'));

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const relationship = '33333333-3333-4333-8333-333333333333';

assert.equal(friends.normalizeHandle('@Friend_One'), 'friend_one');
assert.throws(() => friends.normalizeHandle('<script>'), error => error.code === 'HANDLE_INVALID');
assert.throws(() => friends.normalizeUuid('not-an-id'), error => error.code === 'FRIEND_ID_INVALID');
assert.equal(friends.normalizeRow({
  state: 'friend',
  relationship_id: relationship,
  friend_user_id: first,
  handle: 'friend_one',
  display_name: 'Friend <One>',
  created_at: '2026-08-12T12:00:00.000Z'
}).displayName, 'Friend One');
assert.equal(friends.normalizeRow({ state: 'blocked', relationship_id: relationship, friend_user_id: first, handle: 'blocked' }), null);

function createHarness() {
  const calls = [];
  const events = [];
  let rows = [{
    state: 'friend', relationship_id: relationship, friend_user_id: first,
    handle: 'friend_one', display_name: 'Friend One', created_at: '2026-08-12T12:00:00Z'
  }];
  const auth = {
    getState() { return { authenticated: true, profileComplete: true }; },
    rpc(name, parameters) {
      calls.push({ name, parameters });
      if (name === 'list_friend_state') return Promise.resolve(rows);
      rows = rows.concat({
        state: 'outgoing_request', relationship_id: relationship, friend_user_id: second,
        handle: 'friend_two', display_name: 'Friend Two', created_at: '2026-08-12T12:01:00Z'
      });
      return Promise.resolve({ status: 'processed' });
    }
  };
  const document = { dispatchEvent(event) { events.push(event); } };
  class FakeEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  return { calls, events, client: friends.createAccountFriends({ auth, document, CustomEvent: FakeEvent }) };
}

(async function run() {
  const harness = createHarness();
  const loaded = await harness.client.load();
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.count, 1);
  assert.deepEqual(harness.events.at(-1).detail, { count: 1 }, 'events may expose only a count');
  assert.equal('rows' in harness.events.at(-1).detail, false);

  await harness.client.sendRequest('@friend_two');
  assert.deepEqual(harness.calls.find(call => call.name === 'send_friend_request').parameters, { handle: 'friend_two' });
  await harness.client.acceptRequest(relationship);
  assert.deepEqual(harness.calls.find(call => call.name === 'respond_friend_request').parameters, { id: relationship, response: 'accept' });
  await harness.client.declineRequest(relationship);
  assert.deepEqual(harness.calls.filter(call => call.name === 'respond_friend_request').at(-1).parameters, { id: relationship, response: 'decline' });
  await harness.client.removeFriend(first);
  assert.deepEqual(harness.calls.find(call => call.name === 'remove_friend').parameters, { user_id: first });
  await harness.client.blockUser(first);
  assert.deepEqual(harness.calls.find(call => call.name === 'block_user').parameters, { user_id: first });
  await harness.client.unblockUser(first);
  assert.deepEqual(harness.calls.find(call => call.name === 'unblock_user').parameters, { user_id: first });

  const signedOut = friends.createAccountFriends({ auth: { getState: () => ({ authenticated: false }), rpc() { throw new Error('must not run'); } } });
  await assert.rejects(() => signedOut.load(), error => error.code === 'AUTH_REQUIRED');

  const incompleteProfile = friends.createAccountFriends({
    auth: {
      getState: () => ({ authenticated: true, profileComplete: false }),
      rpc() { throw new Error('profile-incomplete accounts must not call friend RPCs'); }
    }
  });
  await assert.rejects(() => incompleteProfile.load(), error => error.code === 'AUTH_REQUIRED');

  console.log('Account-backed friend RPC, sanitization, auth-gating, and privacy event contracts passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
