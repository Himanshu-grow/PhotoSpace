-- PhotoSpace accounts, public profiles, and owner-managed galleries.
-- Run in Supabase SQL Editor after deploying the app changes.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  name text not null default '',
  bio text not null default '',
  profile_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$')
);

alter table public.photos add column if not exists owner_id uuid references auth.users (id) on delete set null;
alter table public.photo_notes add column if not exists owner_id uuid references auth.users (id) on delete set null;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists profile_image_path text;

create unique index if not exists profiles_username_lower_unique_idx
  on public.profiles (lower(username)) where username <> '';

create index if not exists photos_owner_created_idx on public.photos (owner_id, created_at desc);
create index if not exists photo_notes_photo_created_idx on public.photo_notes (photo_id, created_at);

alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.photo_notes enable row level security;

-- Remove anonymous write policies from the previous shared-gallery setup.
drop policy if exists "Anyone can add shared photos" on public.photos;
drop policy if exists "Anyone can read shared photos" on public.photos;
drop policy if exists "Anyone can read shared notes" on public.photo_notes;
drop policy if exists "Anyone can add shared notes" on public.photo_notes;
drop policy if exists "Users can manage their photos" on public.photos;
drop policy if exists "Users can manage their photo notes" on public.photo_notes;
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can read their profile" on public.profiles;
drop policy if exists "Users can create their profile" on public.profiles;
drop policy if exists "Users can update their profile" on public.profiles;
drop policy if exists "Profiles are publicly readable" on public.profiles;
drop policy if exists "Users can insert their profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Photos are publicly readable" on public.photos;
drop policy if exists "Signed-in users can add their own photos" on public.photos;
drop policy if exists "Users can update their own photos" on public.photos;
drop policy if exists "Users can delete their own photos" on public.photos;
drop policy if exists "Notes are publicly readable" on public.photo_notes;
drop policy if exists "Signed-in users can add notes" on public.photo_notes;
drop policy if exists "Users can update their own notes" on public.photo_notes;
drop policy if exists "Users can delete their own notes" on public.photo_notes;

create policy "Profiles are publicly readable"
  on public.profiles for select to anon, authenticated using (true);
create policy "Users can insert their profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Photos are publicly readable"
  on public.photos for select to anon, authenticated using (true);
create policy "Signed-in users can add their own photos"
  on public.photos for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "Users can update their own photos"
  on public.photos for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Users can delete their own photos"
  on public.photos for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Notes are publicly readable"
  on public.photo_notes for select to anon, authenticated using (true);
create policy "Signed-in users can add notes"
  on public.photo_notes for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.photos where photos.id = photo_id)
  );
create policy "Users can update their own notes"
  on public.photo_notes for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Users can delete their own notes"
  on public.photo_notes for delete to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on public.profiles, public.photos, public.photo_notes from anon, authenticated;
grant select on public.profiles, public.photos, public.photo_notes to anon;
grant select on public.profiles, public.photos, public.photo_notes to authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.photos, public.photo_notes to authenticated;

-- New sign-ups receive a public profile. The username comes from signup metadata.
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_username text;
begin
  chosen_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if chosen_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must be 3 to 24 characters using letters, numbers, and underscores.';
  end if;

  insert into public.profiles (user_id, username, name)
  values (
    new.id,
    chosen_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), chosen_username)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- Public image reads; all file writes must be authenticated and scoped to uid/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can upload shared photos" on storage.objects;
drop policy if exists "Users can view files in their own folder" on storage.objects;
drop policy if exists "Users can upload files to their own folder" on storage.objects;
drop policy if exists "Users can update files in their own folder" on storage.objects;
drop policy if exists "Users can delete files in their own folder" on storage.objects;
drop policy if exists "Signed-in users upload to their own folder" on storage.objects;
drop policy if exists "Signed-in users update their own files" on storage.objects;
drop policy if exists "Signed-in users delete their own files" on storage.objects;

create policy "Signed-in users upload to their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Signed-in users update their own files"
  on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Signed-in users delete their own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
