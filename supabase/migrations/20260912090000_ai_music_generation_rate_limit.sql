create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.ai_music_generation_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

alter table private.ai_music_generation_limits enable row level security;
revoke all on table private.ai_music_generation_limits from public, anon, authenticated;

create or replace function public.consume_ai_music_generation_quota()
returns table (
  allowed boolean,
  remaining integer,
  reset_after_ms bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  quota_limit constant integer := 5;
  quota_window constant interval := interval '1 hour';
  current_user_id uuid := auth.uid();
  checked_at timestamptz := statement_timestamp();
  stored_count integer;
  stored_window_started_at timestamptz;
begin
  if current_user_id is null then
    raise insufficient_privilege using message = 'Authentication required.';
  end if;

  insert into private.ai_music_generation_limits as limits (
    user_id,
    window_started_at,
    request_count
  )
  values (current_user_id, checked_at, 1)
  on conflict (user_id) do update
  set
    window_started_at = case
      when excluded.window_started_at - limits.window_started_at >= quota_window
        then excluded.window_started_at
      else limits.window_started_at
    end,
    request_count = case
      when excluded.window_started_at - limits.window_started_at >= quota_window
        then 1
      else limits.request_count + 1
    end
  where
    excluded.window_started_at - limits.window_started_at >= quota_window
    or limits.request_count < quota_limit
  returning limits.request_count, limits.window_started_at
  into stored_count, stored_window_started_at;

  if found then
    return query select
      true,
      greatest(0, quota_limit - stored_count),
      floor(greatest(
        0::numeric,
        extract(epoch from ((stored_window_started_at + quota_window) - checked_at)) * 1000
      ))::bigint;
    return;
  end if;

  select limits.request_count, limits.window_started_at
  into stored_count, stored_window_started_at
  from private.ai_music_generation_limits as limits
  where limits.user_id = current_user_id;

  return query select
    false,
    0,
    floor(greatest(
      0::numeric,
      extract(epoch from ((stored_window_started_at + quota_window) - checked_at)) * 1000
    ))::bigint;
end;
$$;

revoke all on function public.consume_ai_music_generation_quota() from public, anon;
grant execute on function public.consume_ai_music_generation_quota() to authenticated;
