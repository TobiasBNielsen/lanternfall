-- Lanternfall leaderboard.
-- Paste this whole file into the Supabase SQL Editor and press Run. It is safe to run again.
--
-- Nobody can read or write the table directly. The game only talks to two functions:
--   submit_dive(...)  checks that a dive is plausible, rate-limits, and stores it
--   top_dives(n)      returns each player's best dive, highest score first

create table if not exists public.dives (
  id          bigint generated always as identity primary key,
  player_id   uuid        not null,
  name        text        not null check (char_length(name) between 1 and 16),
  score       integer     not null check (score >= 0),
  depth       integer     not null check (depth >= 0),
  kills       integer     not null default 0 check (kills >= 0),
  species     integer     not null default 0 check (species between 0 and 20),
  duration_s  integer     not null check (duration_s >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists dives_score_idx  on public.dives (score desc);
create index if not exists dives_player_idx on public.dives (player_id, created_at desc);

alter table public.dives enable row level security;
revoke all on table public.dives from anon, authenticated;

-- Every wave is 120 meters. These limits are generous on purpose: they only catch numbers
-- the game cannot produce, not good players.
create or replace function public.submit_dive(
  p_player   uuid,
  p_name     text,
  p_score    integer,
  p_depth    integer,
  p_kills    integer,
  p_species  integer,
  p_duration integer
) returns table (rank bigint, personal_best boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_waves  integer;
  v_name   text;
  v_prev   integer;
begin
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 16 then
    raise exception 'The name has to be between 1 and 16 characters.';
  end if;

  if p_depth is null or p_depth < 120 or p_depth % 120 <> 0 or p_depth > 120000 then
    raise exception 'That depth is not one the game can reach.';
  end if;
  v_waves := p_depth / 120;

  if p_duration is null or p_duration < v_waves * 8 then
    raise exception 'That dive was faster than the water allows.';
  end if;
  if p_score is null or p_score <= 0 then
    raise exception 'There is nothing to sign for yet.';
  end if;
  if p_score > v_waves * 20000 + v_waves * v_waves * 600 + 50000 then
    raise exception 'That score does not fit the depth.';
  end if;
  if p_kills is null or p_kills < 0 or p_kills > v_waves * 90 + 20 then
    raise exception 'Too many creatures for that depth.';
  end if;
  if p_species is null or p_species < 0 or p_species > 20 then
    raise exception 'Unknown number of species.';
  end if;

  -- one dive per player every 30 seconds, and at most 120 dives a minute in total
  if exists (select 1 from dives where player_id = p_player and created_at > now() - interval '30 seconds') then
    raise exception 'Give the ship a moment before signing again.';
  end if;
  if (select count(*) from dives where created_at > now() - interval '1 minute') > 120 then
    raise exception 'The ship is busy. Try again in a minute.';
  end if;

  select max(score) into v_prev from dives where player_id = p_player;

  insert into dives (player_id, name, score, depth, kills, species, duration_s)
  values (p_player, v_name, p_score, p_depth, p_kills, p_species, p_duration);

  -- the rank counts players, not dives: how many other players have a better best
  return query
    select (
      select count(*) + 1 from (
        select player_id, max(score) as best from dives
        where player_id <> p_player
        group by player_id
      ) b
      where b.best > greatest(p_score, coalesce(v_prev, 0))
    ),
    (v_prev is null or p_score > v_prev);
end;
$$;

create or replace function public.top_dives(p_limit integer default 10)
returns table (name text, score integer, depth integer, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select b.name, b.score, b.depth, b.created_at
  from (
    select distinct on (player_id) name, score, depth, created_at
    from dives
    order by player_id, score desc, created_at asc
  ) b
  order by b.score desc, b.created_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke all on function public.submit_dive(uuid, text, integer, integer, integer, integer, integer) from public;
revoke all on function public.top_dives(integer) from public;
grant execute on function public.submit_dive(uuid, text, integer, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.top_dives(integer) to anon, authenticated;
