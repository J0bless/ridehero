'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '202608120001_account_friends.sql'
);
const docsPath = path.join(__dirname, '..', 'docs', 'ACCOUNT_FRIENDS_BACKEND.md');
const sql = fs.readFileSync(migrationPath, 'utf8');
const docs = fs.readFileSync(docsPath, 'utf8');

function expect(pattern, message) {
  assert.match(sql, pattern, message);
}

expect(/create table public\.profiles/i, 'profiles table must exist');
expect(/user_id uuid primary key references auth\.users\(id\) on delete cascade/i,
  'profile deletion must follow Auth deletion');
expect(/create unique index profiles_handle_unique[\s\S]*\(handle\)/i,
  'normalized handles must be unique');
expect(/handle ~ '\^\[a-z\]/i, 'handles must use a constrained normalized format');
expect(/display_name !~\* '[^']+@/i, 'display names must reject embedded email addresses');
assert.doesNotMatch(sql, /\bemail\s+(?:text|varchar|citext)\b/i,
  'public account tables must not store email columns');

expect(/create table public\.friend_requests/i, 'friend requests table must exist');
expect(/create table public\.friendships/i, 'friendships table must exist');
expect(/create table public\.user_blocks/i, 'block table must exist');
expect(/check \(user_a < user_b\)/i, 'relationship pairs must be canonical');
expect(/friend_requests_one_pending_pair[\s\S]*where status = 'pending'/i,
  'duplicate pending relationships must be impossible');
expect(/friendships_unique_pair unique \(user_a, user_b\)/i,
  'duplicate friendships must be impossible');
expect(/user_blocks_not_self check \(blocker_id <> blocked_id\)/i,
  'self-blocks must be impossible');

['profiles', 'friend_requests', 'friendships', 'user_blocks'].forEach(table => {
  expect(new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
    `${table} must have RLS enabled`);
  expect(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'),
    `${table} direct writes must begin revoked`);
  assert.doesNotMatch(
    sql,
    new RegExp(`grant (?:select|insert|update|delete|all) on table public\\.${table} to authenticated`, 'i'),
    `${table} must not grant authenticated clients direct table privileges`
  );
});
expect(/friend_requests_select_participant[\s\S]*auth\.uid\(\)[\s\S]*user_a, user_b/i,
  'request RLS must be participant scoped');
expect(/friendships_select_participant[\s\S]*auth\.uid\(\)[\s\S]*user_a, user_b/i,
  'friendship RLS must be participant scoped');
expect(/user_blocks_select_blocker[\s\S]*auth\.uid\(\)[\s\S]*blocker_id/i,
  'only blockers may directly read their block rows');
expect(/friend_requests_select_participant[\s\S]*status = 'pending'/i,
  'request RLS must not expose historical outcomes');

expect(/create table ridehero_private\.rpc_rate_limits/i,
  'request-attempt windows must live outside the exposed schema');
expect(/rpc_rate_limits[\s\S]*references auth\.users\(id\) on delete cascade/i,
  'private attempt windows must be erased with the Auth account');
expect(/create or replace function ridehero_private\.consume_rate_limit[\s\S]*security definer[\s\S]*set search_path = ''/i,
  'the private rate limiter must lock its search path');
expect(/revoke all on function ridehero_private\.consume_rate_limit[\s\S]*from public, anon, authenticated/i,
  'clients must not execute the private rate limiter');

const rpcs = [
  ['complete_profile', '\\(text, text\\)'],
  ['get_my_profile', '\\(\\)'],
  ['send_friend_request', '\\(text\\)'],
  ['respond_friend_request', '\\(uuid, text\\)'],
  ['remove_friend', '\\(uuid\\)'],
  ['block_user', '\\(uuid\\)'],
  ['unblock_user', '\\(uuid\\)'],
  ['list_friend_state', '\\(\\)'],
  ['list_blocked_users', '\\(\\)']
];
assert.doesNotMatch(sql, /function public\.is_handle_available/i,
  'v1 must not expose a standalone handle-enumeration RPC');
rpcs.forEach(([name, signature]) => {
  expect(new RegExp(`create or replace function public\\.${name}`, 'i'), `${name} RPC must exist`);
  expect(new RegExp(`revoke execute on function public\\.${name}${signature} from public, anon`, 'i'),
    `${name} must reject anonymous execution`);
  expect(new RegExp(`grant execute on function public\\.${name}${signature} to authenticated`, 'i'),
    `${name} must be authenticated-only`);
});

const definerBlocks = sql.match(/create or replace function public\.[\s\S]*?\$\$;/gi) || [];
assert.ok(definerBlocks.length >= rpcs.length, 'all public RPC bodies should be inspectable');
rpcs.forEach(([name]) => {
  const functionPattern = new RegExp(
    `create or replace function public\\.${name}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''[\\s\\S]*?\\$\\$;`,
    'i'
  );
  expect(functionPattern, `${name} must use a locked security-definer search path`);
});

expect(/v_actor uuid := auth\.uid\(\)/i, 'mutating RPCs must bind their actor to auth.uid()');
expect(/same result for malformed, missing, self, blocked/i,
  'friend-request outcomes must be deliberately generic');
expect(/jsonb_build_object\('status', 'processed'\)/i,
  'friend mutation RPCs must use the generic processed result');
expect(/requested_by <> v_actor/i, 'only a request recipient may accept or decline');
expect(/where b\.blocker_id = auth\.uid\(\)/i, 'blocked-user listing must be caller scoped');
expect(/handles cannot be changed after profile completion/i,
  'handles must not offer an unlimited rename/enumeration path');

const completeProfileBody = sql.match(
  /create or replace function public\.complete_profile[\s\S]*?\n\$\$;/i
);
assert.ok(completeProfileBody, 'complete_profile body must be available');
assert.doesNotMatch(
  completeProfileBody[0],
  /on conflict\s*\(user_id\)[\s\S]{0,300}?set\s+handle\s*=/i,
  'the profile upsert must not change a handle during concurrent first-time claims'
);

const sendRequestBody = sql.match(
  /create or replace function public\.send_friend_request[\s\S]*?\n\$\$;/i
);
assert.ok(sendRequestBody, 'send_friend_request body must be available');
const rateLimitOffset = sendRequestBody[0].indexOf("'friend_request', 20, 3600");
const targetLookupOffset = sendRequestBody[0].indexOf('select p.user_id into v_target');
assert.ok(rateLimitOffset >= 0 && targetLookupOffset > rateLimitOffset,
  'friend-request throttling must run before target lookup');
const actorProfileGuard = sendRequestBody[0].match(
  /if\s+not exists\s*\([\s\S]*?from public\.profiles[\s\S]*?user_id\s*=\s*v_actor[\s\S]*?\)\s*then/i
);
assert.ok(actorProfileGuard, 'profile-incomplete callers must receive the same generic result as an unknown target');
assert.ok(sendRequestBody[0].indexOf(actorProfileGuard[0]) < targetLookupOffset,
  'the caller-profile guard must run before target lookup to prevent an FK-error enumeration oracle');

assert.match(docs, /never copies email addresses into the public schema/i);
assert.match(docs, /must not be automatically matched to accounts or uploaded/i);
assert.match(docs, /Additional Redirect URLs/i);
assert.match(docs, /\/auth\/v1\/callback/i);
assert.match(docs, /both \*\*Confirm signup\*\* and \*\*Magic Link\*\*/i,
  'deployment instructions must configure both email templates for first-time and returning users');
assert.match(docs, /\{\{ \.Token \}\}/,
  'deployment instructions must use Supabase email OTPs rather than browser-bound magic links');
assert.match(docs, /verifyOtp\(\{ email, token, type: 'email' \}\)/,
  'deployment instructions must document the browser OTP exchange contract');
assert.match(docs, /Cache-Control: no-store/i);
assert.match(docs, /server-only secret/i);
assert.match(docs, /delete cascade/i);
assert.match(docs, /residual exact-handle signal/i);

console.log('supabase account friends validation: passed');
