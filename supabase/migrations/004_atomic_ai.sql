create function public.commit_ai_reply(p_job uuid,p_records jsonb) returns void language plpgsql security definer set search_path=public as $$declare r records;begin
 perform 1 from ai_jobs where id=p_job and status='running' for update;
 if not found then return;end if;
 insert into records select * from jsonb_populate_recordset(null::records,p_records);
 for r in select * from jsonb_populate_recordset(null::records,p_records) where kind='memory' loop
 insert into ai_jobs(kind,payload,dedup_key) values('index',jsonb_build_object('record_id',r.id),'index:'||r.id) on conflict(dedup_key) do nothing;
 end loop;
 update ai_jobs set status='done' where id=p_job;
end$$;
revoke all on function public.commit_ai_reply(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.commit_ai_reply(uuid,jsonb) to service_role;
