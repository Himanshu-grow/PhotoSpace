-- Shared public gallery for PhotoSpace. Run once in the Supabase SQL Editor.
-- Visitors can read and add photos/notes without accounts. They cannot update
-- or delete shared content. Uploaded image files are publicly viewable.

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  source text not null default '' check (char_length(source) <= 200),
  image_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.photo_notes (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists photos_created_idx
  on public.photos (created_at desc);
create index if not exists photo_notes_photo_created_idx
  on public.photo_notes (photo_id, created_at);

alter table public.photos enable row level security;
alter table public.photo_notes enable row level security;

-- Remove ownership columns from the earlier authenticated-only schema, if it
-- was already installed. This is now intentionally one shared public gallery.
drop policy if exists "Users can manage their photos" on public.photos;
drop policy if exists "Users can manage their photo notes" on public.photo_notes;
alter table public.photos drop column if exists owner_id cascade;
alter table public.photo_notes drop column if exists owner_id cascade;

drop policy if exists "Anyone can read shared photos" on public.photos;
drop policy if exists "Anyone can add shared photos" on public.photos;
drop policy if exists "Anyone can read shared notes" on public.photo_notes;
drop policy if exists "Anyone can add shared notes" on public.photo_notes;

create policy "Anyone can read shared photos"
  on public.photos for select to anon, authenticated using (true);
create policy "Anyone can add shared photos"
  on public.photos for insert to anon, authenticated with check (true);
create policy "Anyone can read shared notes"
  on public.photo_notes for select to anon, authenticated using (true);
create policy "Anyone can add shared notes"
  on public.photo_notes for insert to anon, authenticated with check (
    exists (select 1 from public.photos where photos.id = photo_id)
  );

revoke all on public.photos from anon, authenticated;
revoke all on public.photo_notes from anon, authenticated;
grant select, insert on public.photos to anon, authenticated;
grant select, insert on public.photo_notes to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can upload shared photos" on storage.objects;
create policy "Anyone can upload shared photos"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'photos');

-- Public buckets allow anyone with an image URL to view the image. There are
-- intentionally no update or delete policies for the shared gallery.
