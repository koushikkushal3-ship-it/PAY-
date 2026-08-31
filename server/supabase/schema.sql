-- Razorpay Ops Console — schema
-- Internal tool: every authenticated analyst sees every case (not multi-tenant).
-- All writes go through the backend using the service-role key; RLS gives
-- authenticated analysts read access and blocks the anon key entirely.

-- ---------------------------------------------------------------------------
-- Source data (synthetic, produced by server/scripts/seed.js)
-- ---------------------------------------------------------------------------

create table if not exists merchants (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  mcc                      text not null,
  category                 text not null,
  onboarded_at             timestamptz not null,
  account_age_days         int  not null,
  kyc_status               text not null check (kyc_status in ('verified','pending','incomplete')),
  doc_completeness         numeric(3,2) not null check (doc_completeness between 0 and 1),
  baseline_monthly_volume  numeric(14,2) not null,
  created_at               timestamptz not null default now()
);

-- A flag is an account Razorpay's risk system has held / frozen / put under review.
-- ground_truth is the label the seed script assigned. It is the answer key for
-- evaluation only: the backend strips it before any case context reaches a prompt.
create table if not exists merchant_flags (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  flag_type     text not null check (flag_type in ('freeze','reserve_hold','review')),
  trigger       text not null check (trigger in ('volume_spike','doc_gap','chargeback_ratio','velocity','manual')),
  triggered_at  timestamptz not null,
  signal        jsonb not null default '{}'::jsonb,
  ground_truth  text not null check (ground_truth in ('genuine_risk','false_positive')),
  is_holdout    boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists transactions (
  id              uuid primary key default gen_random_uuid(),
  merchant_id     uuid not null references merchants(id) on delete cascade,
  amount          numeric(12,2) not null,
  currency        text not null default 'INR',
  is_cross_border boolean not null default false,
  method          text not null check (method in ('card','upi','netbanking','wallet')),
  status          text not null check (status in ('captured','declined','borderline')),
  decline_reason  text,
  risk_score      numeric(4,3),
  created_at      timestamptz not null default now()
);

create table if not exists settlements (
  id                   uuid primary key default gen_random_uuid(),
  merchant_id          uuid not null references merchants(id) on delete cascade,
  gross_amount         numeric(14,2) not null,
  fees                 numeric(12,2) not null default 0,
  reserve_held         numeric(14,2) not null default 0,
  reserve_release_due  date,
  settled_at           timestamptz,
  status               text not null check (status in ('pending','settled','on_hold')),
  created_at           timestamptz not null default now()
);

create table if not exists invoices (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references merchants(id) on delete cascade,
  buyer            text not null,
  amount           numeric(12,2) not null,
  gst_rate_applied numeric(4,2) not null,
  hsn_code         text not null,
  item_category    text not null,
  due_date         date not null,
  paid_at          timestamptz,
  status           text not null check (status in ('paid','unpaid','overdue')),
  created_at       timestamptz not null default now()
);

create table if not exists agent_sessions (
  id         uuid primary key default gen_random_uuid(),
  agent_id   text not null,
  buyer_ref  text not null,
  started_at timestamptz not null default now()
);

create table if not exists agent_quotes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references agent_sessions(id) on delete cascade,
  sku           text not null,
  quoted_price  numeric(12,2) not null,
  list_price    numeric(12,2) not null,
  discount_rule text,
  quoted_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shared platform tables — every module writes here. This is the unifying layer.
-- ---------------------------------------------------------------------------

create table if not exists review_queue (
  id             uuid primary key default gen_random_uuid(),
  module         text not null check (module in ('risk','recovery','agent_audit','finance')),
  entity_type    text not null,
  entity_id      uuid not null,
  title          text not null,
  priority_score numeric(8,2) not null default 0,
  status         text not null default 'open' check (status in ('open','actioned','dismissed')),
  verdict        jsonb,
  created_at     timestamptz not null default now(),
  unique (module, entity_type, entity_id)
);

create table if not exists case_actions (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references review_queue(id) on delete cascade,
  action     text not null,
  actor      text not null,
  note       text,
  created_at timestamptz not null default now()
);

-- Append-only. No update/delete policy is ever granted on this table.
create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      text not null,
  module     text not null,
  case_id    uuid references review_queue(id) on delete set null,
  action     text not null,
  reasoning  text,
  outcome    text,
  created_at timestamptz not null default now()
);

create table if not exists recovery_attempts (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid references review_queue(id) on delete cascade,
  entity_type     text not null check (entity_type in ('transaction','invoice')),
  entity_id       uuid not null,
  attempt_no      int  not null,
  channel         text not null,
  action_taken    text not null,
  outcome         text not null,
  next_attempt_at timestamptz,
  stopped_reason  text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_flags_merchant   on merchant_flags (merchant_id);
create index if not exists idx_flags_holdout    on merchant_flags (is_holdout);
create index if not exists idx_txn_merchant     on transactions (merchant_id, status);
create index if not exists idx_settle_merchant  on settlements (merchant_id, status);
create index if not exists idx_invoice_status   on invoices (status, due_date);
create index if not exists idx_quotes_sku       on agent_quotes (sku);
create index if not exists idx_queue_module     on review_queue (module, status, priority_score desc);
create index if not exists idx_audit_created    on audit_log (created_at desc);
create index if not exists idx_attempts_entity  on recovery_attempts (entity_type, entity_id, attempt_no);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Authenticated analysts read everything. Nobody writes through the anon/auth
-- key — every write goes through the backend's service-role client, which
-- bypasses RLS by design.
-- ---------------------------------------------------------------------------

alter table merchants         enable row level security;
alter table merchant_flags    enable row level security;
alter table transactions      enable row level security;
alter table settlements       enable row level security;
alter table invoices          enable row level security;
alter table agent_sessions    enable row level security;
alter table agent_quotes      enable row level security;
alter table review_queue      enable row level security;
alter table case_actions      enable row level security;
alter table audit_log         enable row level security;
alter table recovery_attempts enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'merchants','transactions','settlements','invoices',
    'agent_sessions','agent_quotes','review_queue','case_actions',
    'audit_log','recovery_attempts'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      'analyst_read_' || t, t
    );
  end loop;
end $$;

-- merchant_flags is deliberately excluded from the loop above: ground_truth is
-- an answer key. Analysts read flags through the backend, which strips it.
create policy analyst_no_direct_flag_read on merchant_flags
  for select to authenticated using (false);
