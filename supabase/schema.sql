-- Run once in Supabase Dashboard → SQL Editor.
create table if not exists public.topics (
  id text primary key,
  name text not null check (char_length(name) <= 45),
  icon text not null default 'generic',
  icon_data text not null default '' check (char_length(icon_data) <= 180000),
  day text not null default 'day1' check (day in ('day1','day2')),
  position int not null default 0
);

create table if not exists public.prompts (
  id text primary key,
  topic_id text not null references public.topics(id) on delete cascade,
  name text not null check (char_length(name) <= 65),
  text text not null default '' check (char_length(text) <= 200000),
  position int not null default 0
);
create index if not exists prompts_topic_id_idx on public.prompts(topic_id);

create table if not exists public.links (
  id text primary key,
  name text not null check (char_length(name) <= 65),
  url text not null check (url ~ '^https?://'),
  position int not null default 0
);

-- Only signed-in users (the account created by npm run create-user) can read or write.
-- Also turn OFF public sign-ups: Dashboard → Authentication → Sign In / Providers → "Allow new users to sign up".
alter table public.topics enable row level security;
alter table public.prompts enable row level security;
alter table public.links enable row level security;
drop policy if exists "anon all" on public.topics;
drop policy if exists "anon all" on public.prompts;
drop policy if exists "anon all" on public.links;
drop policy if exists "signed in all" on public.topics;
drop policy if exists "signed in all" on public.prompts;
drop policy if exists "signed in all" on public.links;
create policy "signed in all" on public.topics for all to authenticated using (true) with check (true);
create policy "signed in all" on public.prompts for all to authenticated using (true) with check (true);
create policy "signed in all" on public.links for all to authenticated using (true) with check (true);
revoke all on public.topics, public.prompts, public.links from anon;
grant select, insert, update, delete on public.topics, public.prompts, public.links to authenticated;
