-- Allow the existing, user-scoped AI analysis quota RPC to store structured financial reports.
create or replace function public.finish_chart_analysis_request(
  p_request_id uuid,
  p_status text,
  p_model text default null,
  p_result jsonb default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_status not in ('completed', 'error') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_status = 'completed' and (
    p_result is null
    or jsonb_typeof(p_result) <> 'object'
    or not (
      (p_result -> 'reportMeta' ->> 'schemaVersion' = '3'
        and p_result ?& array[
          'readable', 'imageQualityNote', 'chart', 'verdict', 'technical',
          'fundamentals', 'fastTrade', 'strategies', 'closing', 'reportMeta'
        ])
      or (coalesce(p_result -> 'reportMeta' ->> 'schemaVersion', '') <> '3'
        and p_result ?& array[
          'readable', 'imageQualityNote', 'conclusion', 'marketState', 'thesis',
          'technicalPoints', 'supportZones', 'resistanceZones', 'tradePlan',
          'rating', 'invalidation', 'riskNotes'
        ])
      or coalesce((jsonb_typeof(p_result -> 'financialReport') = 'object'
        and (p_result -> 'financialReport') ?& array[
          'symbol', 'market', 'period', 'headline', 'takeaway', 'growthAndProfit',
          'cashFlowAndBalance', 'managementOutlook', 'risks', 'watchlist',
          'missingData', 'sources', 'dataAsOf'
        ]), false)
    )
  ) then
    raise exception 'INVALID_RESULT';
  end if;
  if p_result is not null and octet_length(p_result::text) > 50000 then
    raise exception 'RESULT_TOO_LARGE';
  end if;

  update public.chart_analysis_requests
  set status = p_status,
      model = nullif(left(trim(coalesce(p_model, '')), 80), ''),
      result = case when p_status = 'completed' then p_result else null end,
      error_message = case when p_status = 'error' then left(coalesce(p_error_message, '分析失敗'), 300) else null end
  where id = p_request_id
    and user_id = v_user
    and status = 'pending';

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.finish_chart_analysis_request(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.finish_chart_analysis_request(uuid, text, text, jsonb, text) to authenticated;
