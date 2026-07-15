-- One-shot, idempotent schema for the social layer (Feed history, leaderboard, Group
-- membership). Run via `pnpm setup:supabase` (see package.json) or paste into the
-- Supabase SQL editor. Safe to re-run.

create table if not exists feed_events (
  id text primary key,
  channel text not null,
  kind text not null,
  author text not null default '',
  text text not null,
  ts bigint not null
);
create index if not exists feed_events_channel_ts on feed_events (channel, ts desc);
alter table feed_events enable row level security;
drop policy if exists "feed is public" on feed_events;
create policy "feed is public" on feed_events for select using (true);
drop policy if exists "anyone can post" on feed_events;
create policy "anyone can post" on feed_events for insert with check (true);

-- Durable leaderboard standings (each client records its own settled-Pool result;
-- winning Entries are closed on claim, so this can't be read back from chain).
create table if not exists pool_results (
  id text primary key,          -- '<pool>:<wallet>', write-once per user per Pool
  pool text not null,
  channel text not null,        -- 'group:<groupId>'
  wallet text not null,
  name text not null,
  staked numeric not null,
  won numeric not null,
  ts bigint not null
);
create index if not exists pool_results_channel on pool_results (channel);
alter table pool_results enable row level security;
drop policy if exists "results are public" on pool_results;
create policy "results are public" on pool_results for select using (true);
drop policy if exists "anyone can record" on pool_results;
create policy "anyone can record" on pool_results for insert with check (true);

-- Shared Group membership: a Group follows its members across devices, and the
-- Syndicate tab shows a real roster instead of only live presence.
create table if not exists group_members (
  group_id text not null,
  wallet text not null,
  name text not null,
  group_name text not null,
  ts bigint not null,
  primary key (group_id, wallet)
);
alter table group_members enable row level security;
drop policy if exists "members are public" on group_members;
create policy "members are public" on group_members for select using (true);
drop policy if exists "anyone can join" on group_members;
create policy "anyone can join" on group_members for insert with check (true);
drop policy if exists "members can update" on group_members;
create policy "members can update" on group_members for update using (true);

-- Live leaderboard updates need the table in the realtime publication; adding twice errors,
-- so guard it.
do $$ begin
  alter publication supabase_realtime add table pool_results;
exception when duplicate_object then null;
end $$;
