-- BrandSync Copilot — core schema
-- Run with: supabase db push   (or paste into the Supabase SQL editor)

create extension if not exists "pgcrypto";

-- ───────────────────────────── Workspaces & membership ─────────────────────────────

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- SECURITY DEFINER so the membership check itself is not subject to RLS,
-- which would otherwise recurse when workspace_members policies call it.
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

-- ───────────────────────────── The mother question set ─────────────────────────────

create table if not exists public.question_bank (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code         text not null,
  text_en      text not null,
  text_vi      text,
  -- One-pager fields this question is designed to fill. Matches ids in
  -- src/lib/onepager/schema.ts; kept as text[] so the bank can be edited
  -- without a migration.
  field_ids    text[] not null default '{}',
  section_id   text not null,
  phase        text not null default 'discover'
               check (phase in ('open', 'discover', 'deep', 'close')),
  -- Lower number = ask earlier. Used as the tie-break when two questions
  -- would unlock the same amount of coverage.
  priority     int not null default 100,
  ask_when     text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (workspace_id, code)
);

create index if not exists question_bank_ws_active_idx
  on public.question_bank (workspace_id, is_active, priority);

-- ───────────────────────────── Meetings ─────────────────────────────

create table if not exists public.meetings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  brand_name    text not null,
  title         text,
  -- 'auto' lets the model answer in whichever language the room is using.
  language      text not null default 'auto' check (language in ('auto', 'vi', 'en')),
  -- Anything known before walking in: deck notes, prior emails, research.
  prep_notes    text,
  status        text not null default 'scheduled'
                check (status in ('scheduled', 'live', 'ended')),
  started_at    timestamptz,
  ended_at      timestamptz,
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index if not exists meetings_ws_created_idx
  on public.meetings (workspace_id, created_at desc);

create table if not exists public.transcript_segments (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  seq         bigint not null,
  speaker     text not null default 'unknown'
              check (speaker in ('host', 'brand', 'unknown')),
  text        text not null,
  started_ms  int,
  ended_ms    int,
  created_at  timestamptz not null default now(),
  unique (meeting_id, seq)
);

create index if not exists transcript_meeting_seq_idx
  on public.transcript_segments (meeting_id, seq);

-- ───────────────────────────── Live state ─────────────────────────────

create table if not exists public.field_coverage (
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  field_id    text not null,
  status      text not null default 'missing'
              check (status in ('missing', 'partial', 'confirmed')),
  confidence  numeric(3, 2) not null default 0 check (confidence between 0 and 1),
  value       text,
  -- [{ "quote": "...", "seq": 12 }] — lets the team audit every extracted claim.
  evidence    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (meeting_id, field_id)
);

create table if not exists public.question_suggestions (
  id               uuid primary key default gen_random_uuid(),
  meeting_id       uuid not null references public.meetings (id) on delete cascade,
  bank_question_id uuid references public.question_bank (id) on delete set null,
  field_ids        text[] not null default '{}',
  text             text not null,
  rationale        text,
  -- 1 = ask next, 5 = only if there is time.
  urgency          int not null default 3 check (urgency between 1 and 5),
  origin           text not null default 'bank'
                   check (origin in ('bank', 'adapted', 'generated', 'followup')),
  status           text not null default 'pending'
                   check (status in ('pending', 'asked', 'answered', 'skipped', 'stale')),
  batch_seq        bigint not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists question_suggestions_meeting_idx
  on public.question_suggestions (meeting_id, status, urgency);

-- Observability: every model call is logged so cost per meeting is knowable.
create table if not exists public.analysis_runs (
  id               uuid primary key default gen_random_uuid(),
  meeting_id       uuid not null references public.meetings (id) on delete cascade,
  from_seq         bigint,
  to_seq           bigint,
  model            text,
  input_tokens     int,
  output_tokens    int,
  cache_read_tokens int,
  latency_ms       int,
  error            text,
  created_at       timestamptz not null default now()
);

create table if not exists public.onepagers (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references public.meetings (id) on delete cascade,
  version      int not null default 1,
  content      jsonb not null,
  markdown     text not null,
  generated_at timestamptz not null default now(),
  unique (meeting_id, version)
);

-- ───────────────────────────── RLS ─────────────────────────────

alter table public.workspaces          enable row level security;
alter table public.workspace_members   enable row level security;
alter table public.question_bank       enable row level security;
alter table public.meetings            enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.field_coverage      enable row level security;
alter table public.question_suggestions enable row level security;
alter table public.analysis_runs       enable row level security;
alter table public.onepagers           enable row level security;

drop policy if exists "members read workspace" on public.workspaces;
create policy "members read workspace" on public.workspaces
  for select using (public.is_workspace_member(id));
drop policy if exists "authenticated create workspace" on public.workspaces;
create policy "authenticated create workspace" on public.workspaces
  for insert with check (auth.uid() = created_by);

drop policy if exists "members read membership" on public.workspace_members;
create policy "members read membership" on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));
drop policy if exists "owner manages membership" on public.workspace_members;
create policy "owner manages membership" on public.workspace_members
  for all using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_members.workspace_id
        and m.user_id = auth.uid() and m.role = 'owner'
    )
  ) with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_members.workspace_id
        and m.user_id = auth.uid() and m.role = 'owner'
    )
  );

drop policy if exists "members manage question bank" on public.question_bank;
create policy "members manage question bank" on public.question_bank
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "members manage meetings" on public.meetings;
create policy "members manage meetings" on public.meetings
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Child tables inherit access from their meeting.
create or replace function public.can_access_meeting(m uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings mt
    join public.workspace_members wm on wm.workspace_id = mt.workspace_id
    where mt.id = m and wm.user_id = auth.uid()
  );
$$;

drop policy if exists "members manage segments" on public.transcript_segments;
create policy "members manage segments" on public.transcript_segments
  for all using (public.can_access_meeting(meeting_id))
  with check (public.can_access_meeting(meeting_id));
drop policy if exists "members manage coverage" on public.field_coverage;
create policy "members manage coverage" on public.field_coverage
  for all using (public.can_access_meeting(meeting_id))
  with check (public.can_access_meeting(meeting_id));
drop policy if exists "members manage suggestions" on public.question_suggestions;
create policy "members manage suggestions" on public.question_suggestions
  for all using (public.can_access_meeting(meeting_id))
  with check (public.can_access_meeting(meeting_id));
drop policy if exists "members read runs" on public.analysis_runs;
create policy "members read runs" on public.analysis_runs
  for select using (public.can_access_meeting(meeting_id));
drop policy if exists "members manage onepagers" on public.onepagers;
create policy "members manage onepagers" on public.onepagers
  for all using (public.can_access_meeting(meeting_id))
  with check (public.can_access_meeting(meeting_id));

-- ───────────────────────────── Realtime ─────────────────────────────
-- The live screen subscribes to these three; everything else is request/response.

do $$
declare t text;
begin
  foreach t in array array['question_suggestions', 'field_coverage', 'transcript_segments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ───────────────────────────── Onboarding trigger ─────────────────────────────
-- Every new user gets a workspace and a copy of the mother question set, so the
-- product is usable on first login with no setup step.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id uuid;
begin
  insert into public.workspaces (name, created_by)
  values (coalesce(split_part(new.email, '@', 1), 'My workspace') || '''s workspace', new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  insert into public.question_bank
    (workspace_id, code, text_en, text_vi, field_ids, section_id, phase, priority, ask_when)
  select ws_id, code, text_en, text_vi, field_ids, section_id, phase, priority, ask_when
  from public.question_bank_template;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
