-- RideHero authenticated profiles and account-backed friendships.
--
-- Privacy boundary:
--   * auth.users remains the source of identity and email; email is never copied here.
--   * authenticated clients use narrow RPCs; participant-scoped RLS remains defense in depth.
--   * every mutation is performed by a narrow RPC that re-checks auth.uid().
--   * deleting auth.users cascades through profiles and all relationship records.

create schema if not exists ridehero_private;
revoke all on schema ridehero_private from public, anon, authenticated;

-- The ledger stores only an actor, action, and counter. It intentionally does
-- not record searched handles, emails, provider identity, or request targets.
create table ridehero_private.rpc_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null default pg_catalog.now(),
  attempts integer not null default 0,
  primary key (user_id, action),
  constraint rpc_rate_limits_known_action check (
    action in ('profile_completion', 'friend_request')
  ),
  constraint rpc_rate_limits_attempts_nonnegative check (attempts >= 0)
);

revoke all on table ridehero_private.rpc_rate_limits from public, anon, authenticated;

create or replace function ridehero_private.consume_rate_limit(
  actor uuid,
  action text,
  max_attempts integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_started_at timestamptz;
  v_attempts integer;
begin
  if $1 is null
     or $2 not in ('profile_completion', 'friend_request')
     or $3 < 1
     or $4 < 1 then
    return false;
  end if;

  insert into ridehero_private.rpc_rate_limits (user_id, action, attempts)
  values ($1, $2, 0)
  on conflict (user_id, action) do nothing;

  select limits.window_started_at, limits.attempts
  into v_window_started_at, v_attempts
  from ridehero_private.rpc_rate_limits as limits
  where limits.user_id = $1 and limits.action = $2
  for update;

  if v_window_started_at <= pg_catalog.now() - ($4 * interval '1 second') then
    update ridehero_private.rpc_rate_limits as limits
    set window_started_at = pg_catalog.now(), attempts = 1
    where limits.user_id = $1 and limits.action = $2;
    return true;
  end if;

  if v_attempts >= $3 then
    return false;
  end if;

  update ridehero_private.rpc_rate_limits as limits
  set attempts = limits.attempts + 1
  where limits.user_id = $1 and limits.action = $2;
  return true;
end;
$$;

revoke all on function ridehero_private.consume_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;

create or replace function ridehero_private.normalize_handle(input text)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select pg_catalog.lower(pg_catalog.btrim(input));
$$;

revoke all on function ridehero_private.normalize_handle(text) from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null,
  display_name text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profiles_handle_normalized check (
    handle = pg_catalog.lower(pg_catalog.btrim(handle))
  ),
  constraint profiles_handle_format check (
    handle ~ '^[a-z][a-z0-9_]{2,23}$'
  ),
  constraint profiles_handle_not_reserved check (
    handle <> all (array[
      'admin', 'administrator', 'api', 'help', 'moderator', 'ridehero',
      'security', 'staff', 'support', 'system'
    ]::text[])
  ),
  constraint profiles_display_name_trimmed check (
    display_name = pg_catalog.btrim(display_name)
  ),
  constraint profiles_display_name_length check (
    pg_catalog.char_length(display_name) between 1 and 40
  ),
  constraint profiles_display_name_safe check (
    display_name !~ '[<>[:cntrl:]]'
    and display_name !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
  )
);

create unique index profiles_handle_unique
  on public.profiles (handle);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(user_id) on delete cascade,
  user_b uuid not null references public.profiles(user_id) on delete cascade,
  requested_by uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  responded_at timestamptz,
  constraint friend_requests_canonical_pair check (user_a < user_b),
  constraint friend_requests_requester_is_participant check (
    requested_by = user_a or requested_by = user_b
  ),
  constraint friend_requests_status check (
    status in ('pending', 'accepted', 'declined', 'cancelled')
  ),
  constraint friend_requests_response_timestamp check (
    (status = 'pending' and responded_at is null)
    or (status <> 'pending' and responded_at is not null)
  )
);

create unique index friend_requests_one_pending_pair
  on public.friend_requests (user_a, user_b)
  where status = 'pending';

create index friend_requests_user_a_status
  on public.friend_requests (user_a, status, created_at desc);

create index friend_requests_user_b_status
  on public.friend_requests (user_b, status, created_at desc);

create index friend_requests_requested_by_status
  on public.friend_requests (requested_by, status, created_at desc);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(user_id) on delete cascade,
  user_b uuid not null references public.profiles(user_id) on delete cascade,
  source_request_id uuid references public.friend_requests(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint friendships_canonical_pair check (user_a < user_b),
  constraint friendships_unique_pair unique (user_a, user_b)
);

create index friendships_user_a_created
  on public.friendships (user_a, created_at desc);

create index friendships_user_b_created
  on public.friendships (user_b, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(user_id) on delete cascade,
  blocked_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_id
  on public.user_blocks (blocked_id);

comment on table public.profiles is
  'Public-safe RideHero identity. Email and provider identity remain in auth.users.';
comment on table public.friend_requests is
  'Canonical friend-request pairs. Only participants can read rows; mutations use RPCs.';
comment on table public.friendships is
  'Canonical accepted friendships. Only participants can read rows; mutations use RPCs.';
comment on table public.user_blocks is
  'Private block list. Only the blocker can read their rows.';

create or replace function ridehero_private.touch_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function ridehero_private.touch_profile_updated_at() from public, anon, authenticated;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function ridehero_private.touch_profile_updated_at();

alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;

create policy profiles_select_self
on public.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy friend_requests_select_participant
on public.friend_requests
for select
to authenticated
using (status = 'pending' and (select auth.uid()) in (user_a, user_b));

create policy friendships_select_participant
on public.friendships
for select
to authenticated
using ((select auth.uid()) in (user_a, user_b));

create policy user_blocks_select_blocker
on public.user_blocks
for select
to authenticated
using ((select auth.uid()) = blocker_id);

-- No client role receives direct table privileges. RPCs are the sole client
-- read/write surface; RLS remains participant-scoped defense in depth.
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.friend_requests from public, anon, authenticated;
revoke all on table public.friendships from public, anon, authenticated;
revoke all on table public.user_blocks from public, anon, authenticated;

grant all on table public.profiles to service_role;
grant all on table public.friend_requests to service_role;
grant all on table public.friendships to service_role;
grant all on table public.user_blocks to service_role;

create or replace function public.complete_profile(handle text, display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_handle text := ridehero_private.normalize_handle($1);
  v_display_name text := pg_catalog.btrim($2);
  v_profile public.profiles%rowtype;
  v_existing_handle text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not ridehero_private.consume_rate_limit(
    v_actor, 'profile_completion', 10, 3600
  ) then
    raise exception using errcode = '54000', message = 'Too many profile attempts. Please try again later.';
  end if;

  if v_handle is null
     or v_handle !~ '^[a-z][a-z0-9_]{2,23}$'
     or v_handle = any (array[
       'admin', 'administrator', 'api', 'help', 'moderator', 'ridehero',
       'security', 'staff', 'support', 'system'
     ]::text[]) then
    raise exception using
      errcode = '22023',
      message = 'Handle must be 3-24 characters, begin with a letter, and use only letters, numbers, or underscores.';
  end if;

  if v_display_name is null
     or pg_catalog.char_length(v_display_name) not between 1 and 40
     or v_display_name ~ '[<>[:cntrl:]]'
     or v_display_name ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}' then
    raise exception using
      errcode = '22023',
      message = 'Display name must be 1-40 characters and cannot contain contact information or markup.';
  end if;

  select p.handle into v_existing_handle
  from public.profiles as p
  where p.user_id = v_actor;

  if found and v_existing_handle <> v_handle then
    raise exception using
      errcode = '22023',
      message = 'RideHero handles cannot be changed after profile completion.';
  end if;

  begin
    insert into public.profiles as p (user_id, handle, display_name)
    values (v_actor, v_handle, v_display_name)
    on conflict (user_id) do update
      set display_name = excluded.display_name
      where p.handle = excluded.handle
    returning p.* into v_profile;

    -- The conflict WHERE also enforces immutability under concurrent first-time
    -- profile submissions. A losing request with another handle returns no row.
    if not found then
      raise exception using
        errcode = '22023',
        message = 'RideHero handles cannot be changed after profile completion.';
    end if;
  exception
    when unique_violation then
      raise exception using
        errcode = '23505',
        message = 'That handle is unavailable.';
  end;

  return pg_catalog.jsonb_build_object(
    'userId', v_profile.user_id,
    'handle', v_profile.handle,
    'displayName', v_profile.display_name,
    'createdAt', v_profile.created_at,
    'updatedAt', v_profile.updated_at
  );
end;
$$;

create or replace function public.get_my_profile()
returns table (
  user_id uuid,
  handle text,
  display_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.handle, p.display_name, p.created_at, p.updated_at
  from public.profiles as p
  where p.user_id = auth.uid();
$$;

create or replace function public.send_friend_request(handle text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_handle text := ridehero_private.normalize_handle($1);
  v_target uuid;
  v_user_a uuid;
  v_user_b uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  -- Consume the independent attempt window before checking the target. Removing
  -- or cancelling requests cannot reset this limit.
  if not ridehero_private.consume_rate_limit(
    v_actor, 'friend_request', 20, 3600
  ) then
    return pg_catalog.jsonb_build_object('status', 'processed');
  end if;

  -- OAuth-authenticated callers must finish their RideHero profile before
  -- friend lookup. Keep this result generic so a missing actor profile cannot
  -- turn the foreign-key path into a handle-existence oracle.
  if not exists (
    select 1 from public.profiles as actor_profile
    where actor_profile.user_id = v_actor
  ) then
    return pg_catalog.jsonb_build_object('status', 'processed');
  end if;

  -- Deliberately return the same result for malformed, missing, self, blocked,
  -- existing, duplicate, and accepted targets. This avoids a direct lookup oracle.
  if v_handle is null or v_handle !~ '^[a-z][a-z0-9_]{2,23}$' then
    return pg_catalog.jsonb_build_object('status', 'processed');
  end if;

  select p.user_id into v_target
  from public.profiles as p
  where p.handle = v_handle;

  if v_target is null or v_target = v_actor then
    return pg_catalog.jsonb_build_object('status', 'processed');
  end if;

  if v_actor < v_target then
    v_user_a := v_actor;
    v_user_b := v_target;
  else
    v_user_a := v_target;
    v_user_b := v_actor;
  end if;

  if exists (
       select 1 from public.user_blocks as b
       where (b.blocker_id = v_actor and b.blocked_id = v_target)
          or (b.blocker_id = v_target and b.blocked_id = v_actor)
     )
     or exists (
       select 1 from public.friendships as f
       where f.user_a = v_user_a and f.user_b = v_user_b
     )
     or (
       select pg_catalog.count(*)
       from public.friend_requests as pending
       where pending.requested_by = v_actor and pending.status = 'pending'
     ) >= 50 then
    return pg_catalog.jsonb_build_object('status', 'processed');
  end if;

  insert into public.friend_requests (user_a, user_b, requested_by)
  values (v_user_a, v_user_b, v_actor)
  on conflict do nothing;

  return pg_catalog.jsonb_build_object('status', 'processed');
end;
$$;

create or replace function public.respond_friend_request(id uuid, response text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid := $1;
  v_response text := pg_catalog.lower(pg_catalog.btrim($2));
  v_request public.friend_requests%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if v_response is null or v_response not in ('accept', 'decline') then
    raise exception using errcode = '22023', message = 'Response must be accept or decline.';
  end if;

  select request_row.* into v_request
  from public.friend_requests as request_row
  where request_row.id = v_request_id
    and request_row.status = 'pending'
    and v_actor in (request_row.user_a, request_row.user_b)
    and request_row.requested_by <> v_actor
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status', 'processed');
  end if;

  if exists (
    select 1 from public.user_blocks as b
    where (b.blocker_id = v_request.user_a and b.blocked_id = v_request.user_b)
       or (b.blocker_id = v_request.user_b and b.blocked_id = v_request.user_a)
  ) then
    update public.friend_requests as target_request
    set status = 'cancelled', responded_at = pg_catalog.now()
    where target_request.id = v_request.id;
    return pg_catalog.jsonb_build_object('status', 'processed');
  end if;

  if v_response = 'accept' then
    insert into public.friendships (user_a, user_b, source_request_id)
    values (v_request.user_a, v_request.user_b, v_request.id)
    on conflict (user_a, user_b) do nothing;

    update public.friend_requests as target_request
    set status = 'accepted', responded_at = pg_catalog.now()
    where target_request.id = v_request.id;
  else
    update public.friend_requests as target_request
    set status = 'declined', responded_at = pg_catalog.now()
    where target_request.id = v_request.id;
  end if;

  return pg_catalog.jsonb_build_object('status', 'processed');
end;
$$;

create or replace function public.remove_friend(user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target uuid := $1;
  v_user_a uuid;
  v_user_b uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if v_target is null or v_target = v_actor then
    return pg_catalog.jsonb_build_object('status', 'processed');
  end if;

  if v_actor < v_target then
    v_user_a := v_actor;
    v_user_b := v_target;
  else
    v_user_a := v_target;
    v_user_b := v_actor;
  end if;

  delete from public.friendships as f
  where f.user_a = v_user_a and f.user_b = v_user_b;

  update public.friend_requests as request_row
  set status = 'cancelled', responded_at = pg_catalog.now()
  where request_row.user_a = v_user_a
    and request_row.user_b = v_user_b
    and request_row.status = 'pending';

  return pg_catalog.jsonb_build_object('status', 'processed');
end;
$$;

create or replace function public.block_user(user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target uuid := $1;
  v_user_a uuid;
  v_user_b uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if v_target is null or v_target = v_actor
     or not exists (select 1 from public.profiles as p where p.user_id = v_target) then
    return pg_catalog.jsonb_build_object('status', 'processed');
  end if;

  if v_actor < v_target then
    v_user_a := v_actor;
    v_user_b := v_target;
  else
    v_user_a := v_target;
    v_user_b := v_actor;
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_actor, v_target)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.friendships as f
  where f.user_a = v_user_a and f.user_b = v_user_b;

  update public.friend_requests as request_row
  set status = 'cancelled', responded_at = pg_catalog.now()
  where request_row.user_a = v_user_a
    and request_row.user_b = v_user_b
    and request_row.status = 'pending';

  return pg_catalog.jsonb_build_object('status', 'processed');
end;
$$;

create or replace function public.unblock_user(user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  delete from public.user_blocks as b
  where b.blocker_id = v_actor and b.blocked_id = $1;

  return pg_catalog.jsonb_build_object('status', 'processed');
end;
$$;

create or replace function public.list_friend_state()
returns table (
  state text,
  relationship_id uuid,
  friend_user_id uuid,
  handle text,
  display_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select auth.uid() as id
  ), relationship_rows as (
    select
      'friend'::text as state,
      f.id as relationship_id,
      case when f.user_a = actor.id then f.user_b else f.user_a end as friend_user_id,
      f.created_at
    from public.friendships as f
    cross join actor
    where actor.id is not null and actor.id in (f.user_a, f.user_b)

    union all

    select
      case when request_row.requested_by = actor.id
        then 'outgoing_request'::text
        else 'incoming_request'::text
      end as state,
      request_row.id as relationship_id,
      case when request_row.user_a = actor.id then request_row.user_b else request_row.user_a end as friend_user_id,
      request_row.created_at
    from public.friend_requests as request_row
    cross join actor
    where actor.id is not null
      and actor.id in (request_row.user_a, request_row.user_b)
      and request_row.status = 'pending'
  )
  select
    relationship_rows.state,
    relationship_rows.relationship_id,
    relationship_rows.friend_user_id,
    p.handle,
    p.display_name,
    relationship_rows.created_at
  from relationship_rows
  join public.profiles as p on p.user_id = relationship_rows.friend_user_id
  order by relationship_rows.created_at desc;
$$;

create or replace function public.list_blocked_users()
returns table (
  user_id uuid,
  handle text,
  display_name text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.handle, p.display_name, b.created_at as blocked_at
  from public.user_blocks as b
  join public.profiles as p on p.user_id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Revoke it explicitly, then
-- grant only these client-safe entry points to signed-in users.
revoke execute on function public.complete_profile(text, text) from public, anon;
revoke execute on function public.get_my_profile() from public, anon;
revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.respond_friend_request(uuid, text) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
revoke execute on function public.block_user(uuid) from public, anon;
revoke execute on function public.unblock_user(uuid) from public, anon;
revoke execute on function public.list_friend_state() from public, anon;
revoke execute on function public.list_blocked_users() from public, anon;

grant execute on function public.complete_profile(text, text) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, text) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.list_friend_state() to authenticated;
grant execute on function public.list_blocked_users() to authenticated;

comment on function public.send_friend_request(text) is
  'Returns a generic processed result and consumes a private per-actor attempt window before target lookup.';
comment on function public.respond_friend_request(uuid, text) is
  'Accepts or declines a pending request only when auth.uid() is its recipient.';
comment on function public.list_friend_state() is
  'Returns only accepted friends and pending requests involving auth.uid().';
