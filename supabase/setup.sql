-- ═══════════════════════════════════════════════════════════════════════════
--  BrandSync Copilot — complete setup, in one paste.
--
--  Supabase dashboard → SQL Editor → paste this whole file → Run.
--  Safe to run more than once; it will not duplicate or delete anything.
--
--  This is the concatenation of migrations 0001 and 0002 in order. If you use
--  the Supabase CLI, run those two files instead and ignore this one.
-- ═══════════════════════════════════════════════════════════════════════════
-- BrandSync Copilot — core schema
-- (from 0001_init.sql)

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
  -- Supabase always ships this publication; guard anyway so the file can be
  -- run against a plain Postgres without aborting the rest of the script.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found — skipping realtime setup';
    return;
  end if;

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


-- The "mother set": the default question bank every new workspace is cloned from.
-- Edit rows in public.question_bank per workspace; edit this table to change the
-- starting point for future workspaces.

create table if not exists public.question_bank_template (
  code       text primary key,
  text_en    text not null,
  text_vi    text,
  field_ids  text[] not null default '{}',
  section_id text not null,
  phase      text not null default 'discover',
  priority   int not null default 100,
  ask_when   text
);

alter table public.question_bank_template enable row level security;
drop policy if exists "anyone authenticated may read the template" on public.question_bank_template;
create policy "anyone authenticated may read the template"
  on public.question_bank_template for select to authenticated using (true);

insert into public.question_bank_template
  (code, text_en, text_vi, field_ids, section_id, phase, priority, ask_when)
values
-- ── Opening ──────────────────────────────────────────────────────────────────
('Q001','Before we dive in — how would you describe the brand and the category you compete in today?','Trước khi đi sâu, anh/chị mô tả thương hiệu và ngành hàng mình đang cạnh tranh như thế nào ạ?','{brand_name,category}','snapshot','open',10,'Always open with this; it calibrates every later question.'),
('Q002','Who owns the brand legally, and which entity would we be contracting with?','Pháp nhân nào sở hữu thương hiệu, và mình sẽ ký hợp đồng với đơn vị nào ạ?','{parent_company}','snapshot','open',20,null),
('Q003','Which markets are we talking about, and is Vietnam new territory or an existing one?','Mình đang nói đến những thị trường nào, và Việt Nam là thị trường mới hay đã có sẵn ạ?','{markets,local_presence}','snapshot','open',25,null),
('Q004','Who else on your side will be involved in this project?','Về phía anh/chị, còn ai sẽ tham gia dự án này ạ?','{stakeholders}','snapshot','open',30,'Also the soft opening for the decision-maker map later.'),
-- ── Objective ────────────────────────────────────────────────────────────────
('Q010','If we sit here twelve months from now and this has gone extremely well, what happened?','Nếu 12 tháng nữa mình ngồi lại và mọi thứ rất tốt, thì điều gì đã xảy ra ạ?','{primary_goal,success_metrics}','objective','open',15,'Strong opener — gets the objective in their own language.'),
('Q011','What is the revenue or GMV target for that period, and for which channels?','Mục tiêu doanh thu hoặc GMV cho giai đoạn đó là bao nhiêu, và cho những kênh nào ạ?','{revenue_target}','objective','discover',20,'Push for a number. A range is acceptable; "growth" is not.'),
('Q012','What is driving the timing — why this year rather than next?','Điều gì thúc đẩy thời điểm này — tại sao là năm nay mà không phải năm sau ạ?','{why_now,timeline}','objective','discover',30,null),
('Q013','What are the KPIs you personally get measured on internally?','Nội bộ đánh giá anh/chị dựa trên những chỉ số nào ạ?','{success_metrics}','objective','deep',40,'Reveals the real objective when the stated one is vague.'),
('Q014','Are there hard dates we must hit — a launch, a campaign, a board review?','Có mốc thời gian bắt buộc nào không — ra mắt, chiến dịch, hay họp hội đồng ạ?','{timeline}','objective','discover',35,null),
-- ── Current state ────────────────────────────────────────────────────────────
('Q020','Which channels are selling today, and roughly what does each contribute?','Hiện tại những kênh nào đang bán, và mỗi kênh đóng góp khoảng bao nhiêu ạ?','{current_channels,current_performance}','current_state','discover',20,null),
('Q021','What does the last full year look like in revenue terms?','Doanh thu năm vừa rồi của mình như thế nào ạ?','{current_performance}','current_state','discover',30,'If they deflect, ask for order of magnitude or growth rate instead.'),
('Q022','Who are you working with today — distributors, agencies, enablers?','Hiện mình đang hợp tác với ai — nhà phân phối, agency, hay đơn vị vận hành ạ?','{current_partners}','current_state','discover',35,null),
('Q023','What is not working today that made you take this meeting?','Điều gì hiện chưa ổn khiến anh/chị muốn gặp bên em hôm nay ạ?','{pain_points}','current_state','discover',15,'The highest-yield question in the set. Ask early, let silence work.'),
('Q024','What have you already tried to fix that, and why did it fall short?','Mình đã thử cách nào để khắc phục chưa, và vì sao chưa hiệu quả ạ?','{pain_points,alternatives}','current_state','deep',45,'Follow-up to Q023 — do not ask standalone.'),
-- ── Product & pricing ────────────────────────────────────────────────────────
('Q030','Which three to five SKUs drive most of your volume?','Ba đến năm SKU nào đang mang lại phần lớn sản lượng ạ?','{hero_skus}','product','discover',40,null),
('Q031','How many SKUs are live in total, and how many can be sold in this market?','Tổng cộng mình có bao nhiêu SKU, và bao nhiêu bán được ở thị trường này ạ?','{portfolio_breadth}','product','discover',60,null),
('Q032','What are the retail price points, and what is the average selling price?','Giá bán lẻ ở mức nào, và giá bán trung bình là bao nhiêu ạ?','{price_ladder}','product','discover',45,null),
('Q033','What trade margin is available to a partner at those prices?','Với mức giá đó, biên lợi nhuận dành cho đối tác là bao nhiêu ạ?','{margin_structure}','product','deep',50,'Sensitive — ask after rapport, not in the first ten minutes.'),
('Q034','How much room is there for promotion and platform vouchers within that margin?','Trong biên đó, mình còn dư địa bao nhiêu cho khuyến mãi và voucher sàn ạ?','{margin_structure}','product','deep',65,null),
('Q035','What are the MOQ, lead time and shelf life we would be planning around?','MOQ, thời gian giao hàng và hạn sử dụng mình cần tính toán là bao nhiêu ạ?','{supply_terms}','product','deep',70,null),
('Q036','Who carries the inventory risk in the model you have in mind?','Trong mô hình anh/chị hình dung, ai chịu rủi ro tồn kho ạ?','{supply_terms,engagement_model}','product','deep',75,null),
-- ── Consumer & positioning ───────────────────────────────────────────────────
('Q040','Who is the target consumer — not just demographics, but when and why they buy?','Khách hàng mục tiêu là ai — không chỉ nhân khẩu học, mà mua khi nào và vì sao ạ?','{target_consumer}','consumer','discover',40,null),
('Q041','What is the one message the brand must own in this market?','Thông điệp nào thương hiệu bắt buộc phải sở hữu ở thị trường này ạ?','{positioning}','consumer','discover',50,null),
('Q042','Are there claims or creative treatments that are off-limits globally?','Có thông điệp hay cách thể hiện nào bị cấm theo quy định toàn cầu không ạ?','{positioning}','consumer','deep',80,null),
('Q043','Who do you benchmark against here, and where are you losing to them?','Mình so sánh với đối thủ nào, và đang thua họ ở điểm nào ạ?','{competitive_set,differentiator}','consumer','discover',55,null),
('Q044','Why does a shopper pick you over that competitor today?','Vì sao khách hàng chọn mình thay vì đối thủ đó ạ?','{differentiator}','consumer','deep',60,null),
-- ── Channel ──────────────────────────────────────────────────────────────────
('Q050','If you had to rank the platforms by priority, what is the order and why?','Nếu phải xếp thứ tự ưu tiên các sàn, thứ tự là gì và vì sao ạ?','{priority_platforms}','channel','discover',30,null),
('Q051','Do official stores already exist, and who controls those accounts today?','Gian hàng chính hãng đã có chưa, và hiện ai đang quản lý tài khoản đó ạ?','{store_status}','channel','discover',35,'Account ownership is a frequent hidden blocker — do not skip.'),
('Q052','How do you handle grey-market sellers and price policing today?','Hiện mình xử lý hàng xách tay và kiểm soát giá như thế nào ạ?','{channel_conflict}','channel','deep',60,null),
('Q053','Is there an offline business we need to protect, and how?','Có mảng offline nào mình cần bảo vệ không, và bảo vệ ra sao ạ?','{channel_conflict}','channel','deep',65,null),
('Q054','What split across channels would you want at the end of the period?','Cuối kỳ, anh/chị muốn tỷ trọng giữa các kênh như thế nào ạ?','{channel_ambition}','channel','deep',70,null),
-- ── Marketing ────────────────────────────────────────────────────────────────
('Q060','What marketing budget is committed for this, and who signs it off?','Ngân sách marketing cam kết cho việc này là bao nhiêu, và ai duyệt ạ?','{marketing_budget}','marketing','deep',30,'Critical and commonly dodged. If deflected, ask for A&P as % of revenue.'),
('Q061','Is that budget a fixed amount or a percentage of revenue?','Ngân sách đó là con số cố định hay theo phần trăm doanh thu ạ?','{marketing_budget}','marketing','deep',45,null),
('Q062','What creative assets already exist, and what needs localising?','Mình đã có sẵn tài sản sáng tạo nào, và cần bản địa hóa những gì ạ?','{content_assets}','marketing','deep',60,null),
('Q063','How long does content approval typically take on your side?','Thông thường phía anh/chị duyệt nội dung mất bao lâu ạ?','{content_assets}','marketing','deep',75,'Sets realistic campaign lead times in the plan.'),
('Q064','What is your appetite for livestream, KOL and affiliate commission?','Mức độ sẵn sàng của mình với livestream, KOL và hoa hồng affiliate ra sao ạ?','{kol_affiliate}','marketing','deep',55,null),
('Q065','Are there campaign moments already committed in the calendar?','Có sự kiện hay chiến dịch nào đã chốt trong lịch chưa ạ?','{campaign_calendar}','marketing','deep',85,null),
-- ── Operations ───────────────────────────────────────────────────────────────
('Q070','Who would warehouse and ship the stock, and from where?','Ai sẽ lưu kho và giao hàng, và xuất từ đâu ạ?','{fulfilment_model}','operations','deep',60,null),
('Q071','What is the status of import licences, product registration and labelling?','Tình trạng giấy phép nhập khẩu, công bố sản phẩm và nhãn mác thế nào ạ?','{regulatory}','operations','deep',40,'Regulatory gaps routinely push launch dates by a quarter or more.'),
('Q072','Who owns the regulatory work — your side or the partner?','Ai phụ trách phần pháp lý — phía anh/chị hay đối tác ạ?','{regulatory}','operations','deep',70,null),
('Q073','What systems do you run, and what data could you share with a partner?','Mình đang dùng hệ thống nào, và có thể chia sẻ dữ liệu gì với đối tác ạ?','{systems}','operations','deep',90,null),
-- ── Commercials ──────────────────────────────────────────────────────────────
('Q080','What kind of partnership are you looking for — distributor, agency, or something in between?','Anh/chị đang tìm kiểu hợp tác nào — nhà phân phối, agency, hay mô hình kết hợp ạ?','{engagement_model}','commercials','discover',25,null),
('Q081','What commercial terms do you have in mind — fee, margin or commission?','Anh/chị hình dung điều khoản thương mại thế nào — phí, biên lợi nhuận hay hoa hồng ạ?','{commercial_expectation}','commercials','close',40,null),
('Q082','What payment terms are you working with today?','Hiện tại mình áp dụng điều khoản thanh toán nào ạ?','{payment_terms}','commercials','close',60,null),
('Q083','Would this be exclusive, and over what contract term?','Hợp tác này có độc quyền không, và thời hạn hợp đồng bao lâu ạ?','{exclusivity}','commercials','close',55,null),
('Q084','How would you want investment split between the two sides?','Anh/chị muốn chia sẻ đầu tư giữa hai bên như thế nào ạ?','{payment_terms,commercial_expectation}','commercials','close',70,null),
-- ── Decision process ─────────────────────────────────────────────────────────
('Q090','Who signs this off, and is anyone else able to say no?','Ai là người duyệt cuối, và còn ai có quyền từ chối không ạ?','{decision_makers}','decision','close',20,'Never end a meeting without this.'),
('Q091','What criteria will you use to compare proposals?','Anh/chị sẽ dựa trên tiêu chí nào để so sánh các đề xuất ạ?','{decision_criteria}','decision','close',25,null),
('Q092','What is the timeline for making a decision?','Lộ trình ra quyết định của mình như thế nào ạ?','{decision_timeline}','decision','close',30,null),
('Q093','Who else are you speaking to, or is in-housing an option?','Anh/chị còn trao đổi với bên nào khác không, hay có tính tự làm nội bộ ạ?','{alternatives}','decision','close',45,null),
('Q094','What would make you say no to us?','Điều gì có thể khiến anh/chị từ chối bên em ạ?','{objections}','decision','close',50,'Surfaces objections while you are still in the room to answer them.'),
('Q095','What needs to be true for us to move to the next step?','Cần điều kiện gì để hai bên bước sang bước tiếp theo ạ?','{decision_timeline,decision_criteria}','decision','close',35,'Good closing question — converts interest into a next action.'),
-- ── Risks ────────────────────────────────────────────────────────────────────
('Q100','What is the biggest risk you see in making this work?','Theo anh/chị, rủi ro lớn nhất để việc này thành công là gì ạ?','{risks}','risks','close',60,null),
('Q101','Is there anything we have not asked that we should have?','Có điều gì bên em chưa hỏi mà đáng lẽ nên hỏi không ạ?','{open_questions}','risks','close',80,'Always the final question. Frequently yields the most valuable answer.')
on conflict (code) do nothing;
