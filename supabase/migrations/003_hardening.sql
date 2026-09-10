-- Le richieste profilo sono private al membro ma devono essere approvabili dall’owner.
create function public.is_owner() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from team_memberships where user_id=auth.uid() and role='owner')$$;
drop policy records_read on public.records;
create policy records_read on public.records for select to authenticated using(public.is_member() and (kind in ('financial_entry','financial_proposal') or public.can_project(case when kind='project' then id else project_id end)) and (owner_id is null or owner_id=auth.uid() or (kind='skill_change_request' and public.is_owner())) and public.can_conversation(conversation_id) and (kind not in ('invite','approval') or public.is_owner()));
grant select on public.records,public.profiles,public.team_memberships,public.project_members to authenticated;
grant all on all tables in schema public to service_role;
create unique index message_job_once on public.messages((data->>'job_id')) where data ? 'job_id';
create function public.project_audience(p_project uuid) returns uuid[] language sql stable security definer set search_path=public as $$select array_agg(user_id) from project_members where project_id=p_project$$;
revoke all on function public.project_audience(uuid) from public,anon,authenticated;
grant execute on function public.project_audience(uuid) to service_role;
