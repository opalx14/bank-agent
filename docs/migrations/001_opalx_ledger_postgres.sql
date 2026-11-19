-- OpalX GO / Bank Agent — Supabase Postgres Ledger Snapshot Table
-- Idempotent migration for durable JSONB ledger snapshot storage.

create table if not exists public.opalx_ledger_snapshots (
  id text primary key default 'primary',
  version bigint not null default 1,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_opalx_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists trg_opalx_ledger_snapshots_updated_at on public.opalx_ledger_snapshots;
create trigger trg_opalx_ledger_snapshots_updated_at
  before update on public.opalx_ledger_snapshots
  for each row
  execute function public.set_opalx_updated_at();

-- Enable RLS with no anon or authenticated policies so only service_role can access (fail-closed).
alter table public.opalx_ledger_snapshots enable row level security;
