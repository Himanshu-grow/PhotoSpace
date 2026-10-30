-- PhotoSpace public-product schema. Safe to rerun after the previous schema.
create extension if not exists pgcrypto;

-- Keep these definitions so this file also initializes a new project. On an
-- existing project, CREATE TABLE IF NOT EXISTS leaves its rows and structure intact.
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source text not null default '',
  image_path text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.photo_notes (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  name text not null default '',
  bio text not null default '',
  profile_image_path text,
  is_private boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$')
);
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists profile_image_path text;
alter table public.profiles add column if not exists is_private boolean not null default false;
alter table public.profiles add column if not exists is_hidden boolean not null default false;
alter table public.photos add column if not exists owner_id uuid;
alter table public.photos add column if not exists thumbnail_path text;
alter table public.photos add column if not exists is_hidden boolean not null default false;
alter table public.photo_notes add column if not exists owner_id uuid;
alter table public.photo_notes add column if not exists is_hidden boolean not null default false;
alter table public.photos drop constraint if exists photos_owner_id_fkey;
alter table public.photos add constraint photos_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;
alter table public.photo_notes drop constraint if exists photo_notes_owner_id_fkey;
alter table public.photo_notes add constraint photo_notes_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;
create unique index if not exists profiles_username_lower_unique_idx on public.profiles (lower(username)) where username <> '';
create index if not exists photos_owner_created_idx on public.photos (owner_id, created_at desc);
create index if not exists photo_notes_photo_created_idx on public.photo_notes (photo_id, created_at);

create table if not exists public.photo_likes (
  photo_id uuid not null references public.photos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('photo', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'nudity', 'copyright', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create table if not exists public.moderators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.upload_reservations (
  object_path text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists photo_likes_user_idx on public.photo_likes (user_id);
create index if not exists content_reports_status_created_idx on public.content_reports (status, created_at desc);
create index if not exists upload_reservations_user_created_idx on public.upload_reservations (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.photo_notes enable row level security;
alter table public.photo_likes enable row level security;
alter table public.content_reports enable row level security;
alter table public.moderators enable row level security;
alter table public.upload_reservations enable row level security;

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.moderators where user_id = (select auth.uid())) $$;

create or replace function public.can_view_storage_object(object_name text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare owner_folder text;
begin
  owner_folder := split_part(object_name, '/', 1);
  if position('/' in object_name) = 0 then return true; end if;
  return exists (
    select 1 from public.profiles p
    where p.user_id::text = owner_folder and not p.is_hidden
      and (not p.is_private or p.user_id = (select auth.uid()))
  );
end;
$$;

create or replace function public.has_upload_reservation(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.upload_reservations r where r.object_path = object_name
    and r.user_id = (select auth.uid()) and r.created_at > now() - interval '30 minutes')
$$;

create or replace function public.reserve_photo_upload(object_path text)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'Sign in before uploading.'; end if;
  perform pg_advisory_xact_lock(hashtext(current_user_id::text), 2);
  if split_part(object_path, '/', 1) <> current_user_id::text or length(object_path) > 300 then raise exception 'Invalid upload path.'; end if;
  delete from public.upload_reservations where created_at < now() - interval '48 hours';
  if (select count(*) from public.upload_reservations where user_id = current_user_id and created_at > now() - interval '24 hours') >= 40 then
    raise exception 'Daily upload limit reached. Try again tomorrow.';
  end if;
  insert into public.upload_reservations (object_path, user_id) values (object_path, current_user_id);
end;
$$;

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare chosen_username text;
begin
  chosen_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if chosen_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'Invalid username.'; end if;
  insert into public.profiles (user_id, username, name)
    values (new.id, chosen_username, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), chosen_username));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.limit_comment_rate()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.owner_id::text), 3);
  if (select count(*) from public.photo_notes where owner_id = new.owner_id and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Comment limit reached. Please wait before commenting again.';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_comment_rate_trigger on public.photo_notes;
create trigger limit_comment_rate_trigger before insert on public.photo_notes
for each row execute function public.limit_comment_rate();

-- Recreate only PhotoSpace-owned policies so rerunning setup preserves custom policies.
drop policy if exists "Anyone can add shared photos" on public.photos;
drop policy if exists "Anyone can read shared photos" on public.photos;
drop policy if exists "Photos are publicly readable" on public.photos;
drop policy if exists "Signed-in users can add their own photos" on public.photos;
drop policy if exists "Users can update their own photos" on public.photos;
drop policy if exists "Users can delete their own photos" on public.photos;
drop policy if exists "Users can manage their photos" on public.photos;
drop policy if exists "Anyone can read shared notes" on public.photo_notes;
drop policy if exists "Anyone can add shared notes" on public.photo_notes;
drop policy if exists "Notes are publicly readable" on public.photo_notes;
drop policy if exists "Signed-in users can add notes" on public.photo_notes;
drop policy if exists "Users can update their own notes" on public.photo_notes;
drop policy if exists "Users can delete their own notes" on public.photo_notes;
drop policy if exists "Users can manage their photo notes" on public.photo_notes;
drop policy if exists "Users can read their profile" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can create their profile" on public.profiles;
drop policy if exists "Users can update their profile" on public.profiles;
drop policy if exists "Profiles are publicly readable" on public.profiles;
drop policy if exists "Users can insert their profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Visible profiles are readable" on public.profiles;
drop policy if exists "Owners update allowed profile fields" on public.profiles;
drop policy if exists "Visible photos are readable" on public.photos;
drop policy if exists "Owners create photos" on public.photos;
drop policy if exists "Owners edit photo details" on public.photos;
drop policy if exists "Owners or moderators delete photos" on public.photos;
drop policy if exists "Comments on visible photos are readable" on public.photo_notes;
drop policy if exists "Signed in users comment" on public.photo_notes;
drop policy if exists "Comment authors edit comments" on public.photo_notes;
drop policy if exists "Comment authors or moderators delete comments" on public.photo_notes;
drop policy if exists "Likes on visible photos are readable" on public.photo_likes;
drop policy if exists "Users like as themselves" on public.photo_likes;
drop policy if exists "Users remove their own likes" on public.photo_likes;
drop policy if exists "Reporters see their reports" on public.content_reports;
drop policy if exists "Signed in users can report content" on public.content_reports;
drop policy if exists "Moderators update reports" on public.content_reports;
drop policy if exists "Moderators can see moderator list" on public.moderators;
drop policy if exists "Reporters manage their reports" on public.content_reports;

create policy "Visible profiles are readable" on public.profiles for select to anon, authenticated
  using ((not is_hidden and not is_private) or user_id = (select auth.uid()) or public.is_moderator());
create policy "Owners update allowed profile fields" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Visible photos are readable" on public.photos for select to anon, authenticated
  using (
    (owner_id is null and not is_hidden)
    or owner_id = (select auth.uid())
    or public.is_moderator()
    or exists (select 1 from public.profiles p where p.user_id = owner_id and not p.is_private and not p.is_hidden)
  );
create policy "Owners create photos" on public.photos for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owners edit photo details" on public.photos for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners or moderators delete photos" on public.photos for delete to authenticated
  using (owner_id = (select auth.uid()) or public.is_moderator());

create policy "Comments on visible photos are readable" on public.photo_notes for select to anon, authenticated
  using ((not is_hidden or public.is_moderator()) and exists (select 1 from public.photos p where p.id = photo_id));
create policy "Signed in users comment" on public.photo_notes for insert to authenticated
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.photos p where p.id = photo_id));
create policy "Comment authors edit comments" on public.photo_notes for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Comment authors or moderators delete comments" on public.photo_notes for delete to authenticated
  using (owner_id = (select auth.uid()) or public.is_moderator());

create policy "Likes on visible photos are readable" on public.photo_likes for select to anon, authenticated
  using (exists (select 1 from public.photos p where p.id = photo_id));
create policy "Users like as themselves" on public.photo_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.photos p where p.id = photo_id));
create policy "Users remove their own likes" on public.photo_likes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Reporters see their reports" on public.content_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_moderator());
create policy "Signed in users can report content" on public.content_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy "Moderators can see moderator list" on public.moderators for select to authenticated
  using (public.is_moderator());

revoke all on public.profiles, public.photos, public.photo_notes, public.photo_likes,
  public.content_reports, public.moderators, public.upload_reservations from anon, authenticated;
grant select on public.profiles, public.photos, public.photo_notes, public.photo_likes to anon;
grant select on public.profiles, public.photos, public.photo_notes, public.photo_likes to authenticated;
grant update (username, name, bio, profile_image_path, is_private, updated_at) on public.profiles to authenticated;
grant insert, delete on public.photos to authenticated;
grant update (name, source) on public.photos to authenticated;
grant insert, delete on public.photo_notes to authenticated;
grant update (text) on public.photo_notes to authenticated;
grant insert, delete on public.photo_likes to authenticated;
grant select, insert on public.content_reports to authenticated;
grant select on public.moderators to authenticated;
revoke all on function public.reserve_photo_upload(text) from public, anon;
grant execute on function public.reserve_photo_upload(text) to authenticated;
revoke all on function public.is_moderator() from public, anon, authenticated;
grant execute on function public.is_moderator() to anon, authenticated;
revoke all on function public.can_view_storage_object(text) from public;
grant execute on function public.can_view_storage_object(text) to anon, authenticated;
revoke all on function public.has_upload_reservation(text) from public;
grant execute on function public.has_upload_reservation(text) to authenticated;

create or replace function public.moderate_report(report_id uuid, action text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.content_reports%rowtype;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;
  if action not in ('hide', 'restore', 'dismiss') then raise exception 'Invalid moderation action.'; end if;
  select * into r from public.content_reports where id = report_id for update;
  if not found then raise exception 'Report not found.'; end if;
  if action in ('hide', 'restore') then
    if r.target_type = 'photo' then update public.photos set is_hidden = (action = 'hide') where id = r.target_id;
    elsif r.target_type = 'comment' then update public.photo_notes set is_hidden = (action = 'hide') where id = r.target_id;
    elsif r.target_type = 'profile' then update public.profiles set is_hidden = (action = 'hide') where user_id = r.target_id;
    end if;
  end if;
  update public.content_reports set status = case when action = 'dismiss' then 'dismissed' else 'resolved' end where id = report_id;
end;
$$;
revoke all on function public.moderate_report(uuid, text) from public, anon;
grant execute on function public.moderate_report(uuid, text) to authenticated;

create or replace function public.validate_content_report()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.target_type = 'photo' and not exists (select 1 from public.photos where id = new.target_id) then raise exception 'Photo not found.'; end if;
  if new.target_type = 'comment' and not exists (select 1 from public.photo_notes where id = new.target_id) then raise exception 'Comment not found.'; end if;
  if new.target_type = 'profile' and not exists (select 1 from public.profiles where user_id = new.target_id) then raise exception 'Profile not found.'; end if;
  return new;
end;
$$;
drop trigger if exists validate_content_report_trigger on public.content_reports;
create trigger validate_content_report_trigger before insert on public.content_reports
for each row execute function public.validate_content_report();

-- Private bucket. RLS permits signed URLs only for public/visible profiles or the owner.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can upload shared photos" on storage.objects;
drop policy if exists "Users can view files in their own folder" on storage.objects;
drop policy if exists "Users can upload files to their own folder" on storage.objects;
drop policy if exists "Users can update files in their own folder" on storage.objects;
drop policy if exists "Users can delete files in their own folder" on storage.objects;
drop policy if exists "Signed-in users upload to their own folder" on storage.objects;
drop policy if exists "Signed-in users update their own files" on storage.objects;
drop policy if exists "Signed-in users delete their own files" on storage.objects;
drop policy if exists "Visible profile media can be read" on storage.objects;
drop policy if exists "Users upload reserved files to own folder" on storage.objects;
drop policy if exists "Users delete files in own folder" on storage.objects;
create policy "Visible profile media can be read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'photos' and public.can_view_storage_object(name));
create policy "Users upload reserved files to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text and public.has_upload_reservation(name));
create policy "Users delete files in own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
grant select on storage.objects to anon, authenticated;
grant insert, delete on storage.objects to authenticated;
