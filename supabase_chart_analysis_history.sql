-- AI 線圖分析歷史圖片：私有保存 5 天，僅限原會員存取。

alter table public.chart_analysis_requests
  add column if not exists asset_name text,
  add column if not exists chart_path text,
  add column if not exists chart_expires_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chart-analysis-images',
  'chart-analysis-images',
  false,
  4000000,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members upload their chart analysis images" on storage.objects;
create policy "Members upload their chart analysis images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chart-analysis-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Members view unexpired chart analysis images" on storage.objects;
create policy "Members view unexpired chart analysis images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chart-analysis-images'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and created_at > now() - interval '5 days'
  );

drop policy if exists "Members delete their chart analysis images" on storage.objects;
create policy "Members delete their chart analysis images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chart-analysis-images'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.attach_chart_analysis_image(
  p_request_id uuid,
  p_chart_path text,
  p_asset_name text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_expires_at timestamptz;
  v_expected_prefix text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  v_expected_prefix := v_user::text || '/' || p_request_id::text || '.';
  if p_chart_path is null
     or p_chart_path not like v_expected_prefix || '%'
     or p_chart_path !~ '\.(jpg|png|webp)$' then
    raise exception 'INVALID_CHART_PATH';
  end if;

  update public.chart_analysis_requests
  set chart_path = left(p_chart_path, 240),
      asset_name = nullif(left(trim(coalesce(p_asset_name, '')), 160), ''),
      chart_expires_at = created_at + interval '5 days'
  where id = p_request_id
    and user_id = v_user
    and status = 'completed'
    and created_at > now() - interval '5 days'
  returning chart_expires_at into v_expires_at;

  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  return v_expires_at;
end;
$$;

revoke all on function public.attach_chart_analysis_image(uuid, text, text) from public, anon;
grant execute on function public.attach_chart_analysis_image(uuid, text, text) to authenticated;

comment on column public.chart_analysis_requests.chart_path is
  'Supabase 私有 Storage 路徑；線圖最多供會員本人讀取 5 天。';
comment on column public.chart_analysis_requests.chart_expires_at is
  '線圖到期時間；到期後文字分析仍保留。';
comment on table public.chart_analysis_requests is
  'AI 線圖分析額度與結果紀錄；原始線圖以私有 Storage 保存 5 天。';
