-- Voice Note for a PAUD check-in without child accounts.
-- Existing voice_notes rows remain available; new anonymous submissions use
-- child_name and leave child_id NULL. The Edge Function is the only public
-- upload/admin API and uses the service role server-side.
alter table public.voice_notes
  add column if not exists child_name text not null default 'Anak';
alter table public.voice_notes
  alter column child_id drop not null;

-- The custom admin Edge Function is the sole reader of notes and files.
drop policy if exists "Children add own voice notes" on public.voice_notes;
drop policy if exists "Children read own voice notes" on public.voice_notes;
drop policy if exists "Children and assigned adults read voice notes" on public.voice_notes;
drop policy if exists "Children upload own voice notes" on storage.objects;
drop policy if exists "Children read own voice notes" on storage.objects;
drop policy if exists "Children and assigned adults read voice note files" on storage.objects;
drop policy if exists "Children delete own voice notes" on storage.objects;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 10485760,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.voice_notes enable row level security;

-- Child accounts are not used by the PAUD recording flow. RLS stays on and
-- no client-role policies remain; the Edge Function writes/reads with service
-- role and only exposes admin reads after custom token validation.
