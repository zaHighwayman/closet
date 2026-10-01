-- Closet — full database schema.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to re-run.

create extension if not exists pgcrypto;

-- ============================================================ profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  display_name text,
  bio text,
  avatar_url text,
  is_public boolean not null default true,
  style_profile jsonb not null default '[]',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_.]{3,24}$')
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 0;
begin
  base := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-z0-9_.]', '', 'g'));
  if length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 18);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1; candidate := base || floor(random() * 9000 + 1000)::text;
  end loop;
  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, candidate, coalesce(new.raw_user_meta_data->>'full_name', base), new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ closet
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  name text,
  category text not null,
  subcategory text,
  image_url text,
  attrs jsonb not null default '{}',
  status text not null default 'clean' check (status in ('clean', 'dirty', 'in_wash')),
  wears_since_wash int not null default 0,
  wear_limit int,
  wear_count int not null default 0,
  last_worn timestamptz,
  price numeric,
  brand text,
  size text,
  purchase_date date,
  notes text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now()
);
create index if not exists items_user on public.items (user_id);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  name text,
  item_ids uuid[] not null default '{}',
  layout jsonb not null default '[]',
  occasion text,
  notes text,
  rating numeric,
  reasons jsonb not null default '[]',
  collection_id uuid references public.collections on delete set null,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now()
);
create index if not exists outfits_user on public.outfits (user_id);
create index if not exists outfits_public on public.outfits (visibility, created_at desc);

create table if not exists public.calendar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  date date not null,
  outfit_id uuid references public.outfits on delete set null,
  item_ids uuid[] not null default '{}',
  worn boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists calendar_user_date on public.calendar (user_id, date);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  name text,
  destination text,
  lat double precision,
  lon double precision,
  start_date date,
  end_date date,
  settings jsonb not null default '{}',
  plan jsonb not null default '{}',
  packed jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ============================================================ community
create table if not exists public.follows (
  follower uuid not null default auth.uid() references public.profiles on delete cascade,
  followee uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);

create table if not exists public.likes (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  outfit_id uuid not null references public.outfits on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, outfit_id)
);

create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references public.profiles on delete cascade,
  blocked uuid not null references public.profiles on delete cascade,
  primary key (blocker, blocked)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references public.profiles on delete cascade,
  target_type text not null check (target_type in ('profile', 'outfit', 'listing', 'message')),
  target_id text not null,
  reason text,
  created_at timestamptz not null default now()
);

-- ============================================================ marketplace
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  item_id uuid references public.items on delete set null,
  title text not null,
  description text,
  price numeric,
  currency text default 'EUR',
  kind text not null default 'sale' check (kind in ('sale', 'swap', 'free')),
  size text,
  condition text,
  image_url text,
  location text,
  status text not null default 'active' check (status in ('active', 'reserved', 'sold')),
  created_at timestamptz not null default now()
);
create index if not exists listings_status on public.listings (status, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings on delete set null,
  sender uuid not null default auth.uid() references public.profiles on delete cascade,
  recipient uuid not null references public.profiles on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_people on public.messages (sender, recipient, created_at);

-- ============================================================ AI rate limiting (server only)
create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);

create or replace function public.bump_ai_usage(uid uuid) returns int
language sql security definer set search_path = public as $$
  insert into public.ai_usage (user_id, day, count) values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count;
$$;
revoke all on function public.bump_ai_usage(uuid) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid) to service_role;

-- ============================================================ row level security
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.collections enable row level security;
alter table public.outfits enable row level security;
alter table public.calendar enable row level security;
alter table public.trips enable row level security;
alter table public.follows enable row level security;
alter table public.likes enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.listings enable row level security;
alter table public.messages enable row level security;
alter table public.ai_usage enable row level security;  -- no policies: clients can't touch it

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles: names/avatars are visible to signed-in users (needed for marketplace + messages)
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- items: own; others' public items if their profile is public; anything in a public outfit or active listing
create policy "items read" on public.items for select to authenticated using (
  user_id = auth.uid()
  or (visibility = 'public' and exists (select 1 from public.profiles p where p.id = items.user_id and p.is_public))
  or exists (select 1 from public.outfits o where o.visibility = 'public' and items.id = any (o.item_ids))
  or exists (select 1 from public.listings l where l.item_id = items.id and l.status <> 'sold')
);
create policy "items write own" on public.items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "collections own" on public.collections for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "calendar own" on public.calendar for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "trips own" on public.trips for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "outfits read" on public.outfits for select to authenticated using (user_id = auth.uid() or visibility = 'public');
create policy "outfits write own" on public.outfits for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "follows read" on public.follows for select to authenticated using (true);
create policy "follows insert own" on public.follows for insert to authenticated with check (follower = auth.uid());
create policy "follows delete own" on public.follows for delete to authenticated using (follower = auth.uid());

create policy "likes read" on public.likes for select to authenticated using (true);
create policy "likes insert own" on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes delete own" on public.likes for delete to authenticated using (user_id = auth.uid());

create policy "blocks own" on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());
create policy "reports insert" on public.reports for insert to authenticated with check (reporter = auth.uid());

create policy "listings read" on public.listings for select to authenticated using (status <> 'sold' or user_id = auth.uid());
create policy "listings write own" on public.listings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "messages read own" on public.messages for select to authenticated using (sender = auth.uid() or recipient = auth.uid());
create policy "messages send" on public.messages for insert to authenticated with check (
  sender = auth.uid()
  and not exists (select 1 from public.blocks b where b.blocker = messages.recipient and b.blocked = auth.uid())
);
create policy "messages mark read" on public.messages for update to authenticated using (recipient = auth.uid()) with check (recipient = auth.uid());

-- ============================================================ storage (photos)
insert into storage.buckets (id, name, public) values ('closet', 'closet', true)
on conflict (id) do update set public = true;

drop policy if exists "closet upload own" on storage.objects;
drop policy if exists "closet update own" on storage.objects;
drop policy if exists "closet delete own" on storage.objects;
create policy "closet upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'closet' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "closet update own" on storage.objects for update to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "closet delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = auth.uid()::text);
