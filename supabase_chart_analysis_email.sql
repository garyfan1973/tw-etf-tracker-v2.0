-- AI 線圖分析 PDF 寄送稽核與每日上限；不保存收件人地址。
create table if not exists public.chart_analysis_email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text,
  subject text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'error')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists chart_analysis_email_log_user_created_idx
  on public.chart_analysis_email_log (user_id, created_at desc);

alter table public.chart_analysis_email_log enable row level security;
revoke all on public.chart_analysis_email_log from anon, authenticated;

create or replace function public.authorize_chart_analysis_email(
  p_symbol text,
  p_subject text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_access public.ai_feature_access%rowtype;
  v_count integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_access from public.ai_feature_access where user_id = v_user;
  if not found or not v_access.enabled then raise exception 'FEATURE_NOT_ENABLED'; end if;
  if v_access.expires_at is not null and v_access.expires_at <= now() then
    raise exception 'FEATURE_ACCESS_EXPIRED';
  end if;
  select count(*)::integer into v_count
  from public.chart_analysis_email_log
  where user_id = v_user
    and timezone('Asia/Taipei', created_at)::date = timezone('Asia/Taipei', now())::date;
  if v_count >= 10 then raise exception 'EMAIL_DAILY_LIMIT_REACHED'; end if;
  insert into public.chart_analysis_email_log (user_id, symbol, subject)
  values (v_user, nullif(left(trim(coalesce(p_symbol, '')), 20), ''), left(p_subject, 180))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finish_chart_analysis_email(
  p_log_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_status not in ('sent', 'error') then raise exception 'INVALID_STATUS'; end if;
  update public.chart_analysis_email_log
  set status = p_status, completed_at = now()
  where id = p_log_id and user_id = auth.uid();
  if not found then raise exception 'EMAIL_LOG_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.authorize_chart_analysis_email(text, text) from public;
revoke all on function public.finish_chart_analysis_email(uuid, text) from public;
revoke all on function public.authorize_chart_analysis_email(text, text) from anon;
revoke all on function public.finish_chart_analysis_email(uuid, text) from anon;
grant execute on function public.authorize_chart_analysis_email(text, text) to authenticated;
grant execute on function public.finish_chart_analysis_email(uuid, text) to authenticated;

comment on table public.chart_analysis_email_log is
  'AI 技術分析 PDF 寄送稽核；不保存收件人 Email。';
